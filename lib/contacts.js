export function normalizeEmail(value) {
  const email = value.trim().replace(/[.,;:!?]+$/, "").toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || email.includes("..")) return null;
  if (domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-") || label.length > 63)) return null;
  return email;
}

export function normalizePhone(value, explicit = false) {
  const trimmed = value.trim();
  const extensionMatch = trimmed.match(/(?:ext\.?|extension|x|;ext=)\s*(\d{1,6})$/i);
  const main = extensionMatch ? trimmed.slice(0, extensionMatch.index).trim() : trimmed;
  const digits = main.replace(/\D/g, "");
  if (digits.length < (explicit ? 7 : 10) || digits.length > 15 || /^(\d)\1+$/.test(digits)) return null;
  if (!explicit && (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(main) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(main))) return null;
  const extension = extensionMatch?.[1];
  return {
    value: `${main.startsWith("+") ? "+" : ""}${digits}${extension ? ` ext. ${extension}` : ""}`,
    normalized: `${digits}${extension ? `x${extension}` : ""}`,
  };
}

function decode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function extractContacts(text, contactLinks = []) {
  const found = new Map();
  const addEmail = (candidate) => {
    const value = normalizeEmail(candidate);
    if (value) found.set(`email:${value}`, { type: "email", value, normalized: value });
  };
  const addPhone = (candidate, explicit = false) => {
    const phone = normalizePhone(candidate, explicit);
    if (phone) found.set(`phone:${phone.normalized}`, { type: "phone", ...phone });
  };
  for (const match of text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/gi)) addEmail(match[0]);
  for (const line of text.split(/[\r\n]+/)) {
    for (const match of line.matchAll(/(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]?\d[\d ().-]{4,22}\d(?:\s*(?:ext\.?|extension|x)\s*\d{1,6})?/gi)) {
      addPhone(match[0]);
    }
  }
  for (const href of contactLinks) {
    if (/^mailto:/i.test(href)) {
      for (const address of decode(href.slice(7).split("?")[0]).split(/[,;]/)) addEmail(address);
    } else if (/^tel:/i.test(href)) {
      addPhone(decode(href.slice(4).split("?")[0]), true);
    }
  }
  return [...found.values()];
}

export function mergeContacts(existing, incoming, source, now, limit = 1000) {
  const map = new Map(existing.map((contact) => [`${contact.type}:${contact.normalized}`, contact]));
  for (const candidate of incoming) {
    const key = `${candidate.type}:${candidate.normalized}`;
    const old = map.get(key);
    if (old) {
      if (!old.sources.includes(source) && old.sources.length < 5) old.sources.push(source);
    } else if (map.size < limit) {
      map.set(key, { ...candidate, sources: [source], foundAt: new Date(now).toISOString() });
    }
  }
  return [...map.values()];
}
