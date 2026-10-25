// Postal addresses are detected from public address markup and nearby text.
// These checks identify plausible addresses; they do not verify deliverability.
const LABEL = /^(?:(?:(?:registered|head|corporate|branch|business|office|postal|mailing|street|physical)\s+){0,2}address|registered\s+office|head\s+office|headquarters|our\s+location)\b\s*[:：–—-]?\s*/i;
const STREET = /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|court|ct\.?|way|highway|hwy\.?|place|pl\.?|terrace|close|crescent|nagar|marg|chowk|sector|colony|industrial\s+(?:area|estate)|p\.?\s*o\.?\s*box)\b/i;
const STREET_START = /^(?:\d{1,6}[\p{L}\d/-]*\s|(?:plot|house|building|floor|flat|suite|unit|shop|block|door|p\.?\s*o\.?\s*box)\b)/iu;
const POSTCODE = /(?:\b\d{5}(?:-\d{4})?\b|\b\d{6}\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b)/i;
const STOP = /^(?:e-?mail|phone|telephone|tel|mobile|mob|fax|whats\s?app|call|contact(?:\s+us)?|hours|opening|working|business\s+hours|mon(?:day)?|tues?(?:day)?|wed(?:nesday)?|thur?s?(?:day)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|copyright|all\s+rights|privacy|terms|about|home|menu|navigation|follow|social|subscribe|newsletter|services|products|learn|read|view|directions|get\s+directions|our\s+(?:team|services)|we\b)\b/i;
const COUNTRY = /^(?:india|united\s+states(?:\s+of\s+america)?|usa|us|united\s+kingdom|uk|canada|australia|new\s+zealand|ireland|germany|france|italy|spain|netherlands|singapore|malaysia|japan|china|south\s+africa|united\s+arab\s+emirates|uae|saudi\s+arabia|pakistan|bangladesh|sri\s+lanka|nepal)\.?$/i;

function clean(value) {
  return value.normalize("NFKC").replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/[\t\u00a0\u202f ]+/g, " ").trim();
}

export function normalizeAddress(candidate, { explicit = false } = {}) {
  if (typeof candidate !== "string" || candidate.length > 2000) return null;
  const parts = [];
  const text = clean(candidate).replace(/[ \t]+(?=(?:e-?mail|phone|telephone|tel|mobile|fax)\s*:)/gi, "\n");
  for (const raw of text.split(/[\r\n,]+/)) {
    const part = raw.trim().replace(LABEL, "").replace(/^[\s:;|–—-]+|[\s;|]+$/g, "");
    if (!part) continue;
    // An <address> element often also contains phone and email contacts.
    // Skip contact fields so addresses following an email remain eligible.
    if (/@|https?:\/\/|www\./i.test(part) || /^(?:e-?mail|phone|telephone|tel|mobile|mob|fax|call)\b/i.test(part)) continue;
    if (STOP.test(part) || (/^\+?[\d ().-]{7,}$/.test(part) && !POSTCODE.test(part))) break;
    if (part.length > 180) return null;
    parts.push(part);
  }
  const value = parts.join(", ");
  if (value.length < 8 || value.length > 600 || !/\p{L}{2}/u.test(value)) return null;
  const physical = STREET.test(value) && /\d/.test(value);
  if (!physical && !(POSTCODE.test(value) && parts.length >= 2) && !(explicit && parts.length >= 2)) return null;
  return {
    value,
    normalized: value.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/[^\p{L}\p{M}\p{N}/-]/gu, ""),
  };
}

export function extractAddresses(text, addressCandidates = []) {
  const found = new Map();
  const add = (candidate, explicit = false) => {
    const address = normalizeAddress(candidate, { explicit });
    if (address) found.set(address.normalized, address);
  };
  for (const candidate of addressCandidates) add(candidate, true);

  const lines = clean(String(text)).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const labeled = LABEL.test(line);
    if (!labeled && !(STREET_START.test(line) && STREET.test(line))) continue;
    const first = line.replace(LABEL, "");
    const parts = first ? [first] : [];
    let end = index;
    for (let next = index + 1; next < lines.length && parts.length < 6; next++) {
      const part = lines[next];
      if (LABEL.test(part) || STOP.test(part) || /@|https?:\/\/|www\./i.test(part) || part.length > 150 || part.split(/\s+/).length > 18) break;
      // Another street starts a separate location, not a continuation.
      if (parts.some((item) => STREET.test(item)) && STREET_START.test(part) && STREET.test(part)) break;
      if (parts.some((item) => POSTCODE.test(item))) {
        if (COUNTRY.test(part)) { parts.push(part); end = next; }
        break;
      }
      parts.push(part);
      end = next;
    }
    const address = normalizeAddress(parts.join("\n"));
    if (address) {
      found.set(address.normalized, address);
      index = end;
    }
  }
  return [...found.values()];
}
