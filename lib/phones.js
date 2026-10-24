// Conservative offline detection. These are format checks, not proof that a
// number is assigned or reachable; no contact data is sent to a validation API.
const PHONE_LABEL = /\b(?:phone|telephone|tel|mobile|mob|cell|fax|whats\s?app|call(?:\s+us)?|contact(?:\s+us)?|hotline|switchboard|toll[- ]?free|helpline)\s*(?:number|no\.?)?\s*[:.#=–—-]?\s*$/i;
const ID_LABEL = /\b(?:order|invoice|reference|ref|customer|account|tracking|transaction|ticket|serial|product|sku|isbn|iban|routing|tax|vat|gst|gstin|aadhaar|aadhar|ssn|social\s+security|zip|postal|postcode|pin|otp|verification|confirmation|credit\s*card|debit\s*card|card|imei|id|ipv?[46]?)\s*(?:number|no\.?|id|code)?\s*[:.#=–—-]?\s*$/i;
const EXTENSION = /(?:;ext=|\bext(?:ension|n)?\.?|[x#])\s*[:.]?\s*(\d{1,6})$/i;
const OPTIONAL_TRUNK = new Set(["27", "31", "33", "41", "43", "44", "46", "49", "61", "64", "91", "353", "358"]);

function ascii(value) {
  return String(value).normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u202f]/g, " ");
}

export function normalizePhone(value, explicit = false, { labeled = false } = {}) {
  if (typeof value !== "string" || value.length > 100) return null;
  let main = ascii(value).trim();
  const extension = main.match(EXTENSION);
  if (extension) main = main.slice(0, extension.index).trim();
  if (!/^(?:\+|00)?[\d(][\d ().-]*\d$/.test(main)) return null;

  // Dates, date ranges, IPv4 addresses, and version-like strings are not phones.
  if (/^(?:\d{4}[-/. ]\d{1,2}[-/. ]\d{1,2}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}|(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2})$/.test(main)) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(main)) return null;

  // Reject unbalanced or nested parentheses rather than silently fixing them.
  let bracket = false;
  for (const char of main) {
    if (char === "(") { if (bracket) return null; bracket = true; }
    if (char === ")") { if (!bracket) return null; bracket = false; }
  }
  if (bracket || /\(\s*\)/.test(main)) return null;

  main = main.replace(/^00(?=[1-9])/, "+");
  const trunk = main.match(/^\+(\d{1,3})[ .-]*\(0\)/);
  if (trunk && OPTIONAL_TRUNK.has(trunk[1])) main = main.replace("(0)", "");
  const international = main.startsWith("+");
  const digits = main.replace(/\D/g, "");
  const trusted = explicit || labeled;
  if (digits.length < (trusted ? 7 : 10) || digits.length > 15 || /^(\d)\1+$/.test(digits)) return null;
  if (international && (digits.startsWith("0") || digits.length < 8)) return null;

  // NANP international numbers have a fixed country code + ten-digit structure.
  if (international && digits.startsWith("1") && !/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;

  if (!trusted && !international) {
    const groups = main.match(/\d+/g) || [];
    // Bare numbers and unusually long numeric identifiers require a phone label.
    if (groups.length < 2 || groups.length > 6 || digits.length > 12) return null;
    if (!groups.some((group) => group.length >= 3) || groups.some((group) => group.length > 6)) return null;
  }

  return {
    value: `${international ? "+" : ""}${digits}${extension ? ` ext. ${extension[1]}` : ""}`,
    normalized: `${digits}${extension ? `x${extension[1]}` : ""}`,
  };
}

function decode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function telephoneLink(href) {
  const raw = decode(href.slice(4).split("?")[0]);
  const [number, ...parameters] = raw.split(";");
  let value = number;
  let extension = "";
  let context = "";
  for (const parameter of parameters) {
    const split = parameter.indexOf("=");
    const key = parameter.slice(0, split).toLowerCase();
    const argument = parameter.slice(split + 1);
    if (key === "ext") {
      if (extension || !/^\d{1,6}$/.test(ascii(argument))) return null;
      extension = ascii(argument);
    } else if (key === "phone-context") {
      if (context) return null;
      context = ascii(argument);
    }
  }
  // RFC 3966 global phone contexts supply a dialing prefix for local numbers.
  if (context.startsWith("+") && !/^\s*(?:\+|00)/.test(value)) {
    if (!/^\+[\d().-]+$/.test(context)) return null;
    value = context + value;
  }
  return normalizePhone(value + (extension ? `;ext=${extension}` : ""), true);
}

function maskNonPhones(text) {
  const blank = (match) => " ".repeat(match.length);
  return text
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, blank)
    .replace(/[^\s<>@]+@[^\s<>@]+/g, blank)
    .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?\b/g, blank)
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, blank)
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, blank);
}

export function extractPhones(text, contactLinks = []) {
  const found = new Map();
  const add = (phone) => {
    if (!phone) return;
    const old = found.get(phone.normalized);
    // Prefer the explicit international representation when formats overlap.
    if (!old || phone.value.startsWith("+")) found.set(phone.normalized, phone);
  };
  let previousLine = "";
  for (const rawLine of ascii(text).split(/\r?\n/)) {
    const line = maskNonPhones(rawLine);
    // Split adjacent unformatted numbers and common 3-3-4 phone layouts.
    const segments = line.replace(/(\d{7,})[ \t]+(?=\d{7,}\b)/g, "$1\n")
      .replace(/((?:\(\d{3}\)|\b\d{3})[ .-]*\d{3}[ .-]\d{4})[ \t]+(?=(?:\(\d{3}\)|\d{3})[ .-]*\d{3}[ .-]\d{4}\b)/g, "$1\n")
      .split(/\n|[ \t]{2,}|[,;|/]/);
    let precedingLabel = previousLine;
    for (const segment of segments) {
      const candidate = /(?<![\p{L}\p{N}_])(?:\+|00)?(?:\(\d{1,4}\)|\d)[\d \t().-]{4,60}\d(?:[ \t]*(?:ext(?:ension|n)?\.?|[x#])[ \t]*[:.]?[ \t]*\d{1,6})?(?![\p{L}\p{N}_])/giu;
      for (const match of segment.matchAll(candidate)) {
        const before = segment.slice(0, match.index).slice(-80);
        const context = before.trim() ? before : precedingLabel;
        if (ID_LABEL.test(context)) continue;
        add(normalizePhone(match[0], false, { labeled: PHONE_LABEL.test(context) }));
      }
      if (segment.trim()) {
        // A label may be separated from its value by several spaces or a comma.
        precedingLabel = segment.trim().slice(-80);
      }
    }
    // Labels in a separate HTML text node can immediately precede the number.
    // Blank nodes are ignored, but labels never carry past unrelated text.
    if (rawLine.trim()) previousLine = rawLine.trim().slice(-80);
  }
  for (const href of contactLinks) {
    if (typeof href === "string" && /^tel:/i.test(href)) add(telephoneLink(href));
  }
  return [...found.values()];
}
