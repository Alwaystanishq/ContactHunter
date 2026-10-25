// Conservative offline detection. These are format checks, not proof that a
// number is assigned or reachable; no contact data is sent to a validation API.
const PHONE_LABEL = /\b(?:phone|telephone|tel|mobile|mob|cell|fax|whats\s?app|call(?:\s+us)?|contact(?:\s+us)?|hotline|switchboard|toll[- ]?free|helpline|[tpmf])\.?\s*(?:numbers?|nos?\.?)?\s*[:.#=–—-]?\s*$/i;
const ID_LABEL = /\b(?:order|invoice|reference|ref|customer|account|tracking|transaction|ticket|serial|product|sku|isbn|iban|routing|tax|vat|gst|gstin|aadhaar|aadhar|ssn|social\s+security|zip|postal|postcode|pin|otp|verification|confirmation|credit\s*card|debit\s*card|card|imei|id|ipv?[46]?)\s*(?:number|no\.?|id|code)?\s*[:.#=–—-]?\s*$/i;
const EXTENSION = /(?:;ext=|\bext(?:ension|n)?\.?|[x#])\s*[:.]?\s*(\d{1,6})$/i;
const OPTIONAL_TRUNK = new Set(["27", "31", "33", "41", "43", "44", "46", "49", "61", "64", "91", "353", "358"]);
const CALLING_CODES = new Set(("1 7 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 " +
  "211 212 213 216 218 220 221 222 223 224 225 226 227 228 229 230 231 232 233 234 235 236 237 238 239 240 241 242 243 244 245 246 247 248 249 250 251 252 253 254 255 256 257 258 260 261 262 263 264 265 266 267 268 269 290 291 297 298 299 " +
  "350 351 352 353 354 355 356 357 358 359 370 371 372 373 374 375 376 377 378 380 381 382 383 385 386 387 389 420 421 423 500 501 502 503 504 505 506 507 508 509 590 591 592 593 594 595 596 597 598 599 " +
  "670 672 673 674 675 676 677 678 679 680 681 682 683 685 686 687 688 689 690 691 692 800 808 850 852 853 855 856 870 878 880 881 882 883 886 888 960 961 962 963 964 965 966 967 968 970 971 972 973 974 975 976 977 979 992 993 994 995 996 998").split(" "));

function callingCode(digits) {
  return [1, 2, 3].map((length) => digits.slice(0, length)).find((prefix) => CALLING_CODES.has(prefix));
}

export function formatPhone(value) {
  const match = value.match(/^\+([\d ().-]+)(\s+ext\.\s*\d{1,6})?$/i);
  if (!match) return value;
  const digits = match[1].replace(/\D/g, "");
  const code = callingCode(digits);
  if (!code || digits.length <= code.length) return value;
  return `+${code} ${digits.slice(code.length)}${match[2] ? ` ${match[2].trim()}` : ""}`;
}

// Only match a local representation when an explicit international number
// supplies the country code. Ambiguous local numbers remain separate.
export function phoneIdentityMap(phones) {
  const aliases = new Map();
  for (const phone of phones) {
    if (!phone.value.startsWith("+")) continue;
    const [digits, extension] = phone.normalized.split("x");
    const code = callingCode(digits);
    if (!code) continue;
    const national = digits.slice(code.length);
    if (national.length < 7) continue;
    for (const alias of [national, ...(OPTIONAL_TRUNK.has(code) ? [`0${national}`] : [])]) {
      const key = alias + (extension ? `x${extension}` : "");
      if (!aliases.has(key)) aliases.set(key, phone.normalized);
      else if (aliases.get(key) !== phone.normalized) aliases.set(key, null);
    }
  }
  return new Map(phones.map((phone) => [phone.normalized,
    phone.value.startsWith("+") ? phone.normalized : aliases.get(phone.normalized) || phone.normalized]));
}

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
    // Accept common ten-digit numbers without a label; other bare or unusually
    // long local values still require explicit phone context.
    const barePhone = /^[2-9]\d{9}$/.test(main);
    if (!barePhone && (groups.length < 2 || groups.length > 6 || digits.length > 12)) return null;
    if (!barePhone && (!groups.some((group) => group.length >= 3) || groups.some((group) => group.length > 6))) return null;
  }

  return {
    value: formatPhone(`${international ? "+" : ""}${digits}${extension ? ` ext. ${extension[1]}` : ""}`),
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
      .replace(/(\b\d{5}[ -]\d{5})[ \t]+(?=(?:\+\d{1,3}[ -]+)?\d{5}[ -]\d{5}\b)/g, "$1\n")
      .replace(/((?:\(\d{3}\)|\b\d{3})[ .-]*\d{3}[ .-]\d{4})[ \t]+(?=(?:\(\d{3}\)|\d{3})[ .-]*\d{3}[ .-]\d{4}\b)/g, "$1\n")
      .split(/\n|[,;|/]|[ \t]+(?:&|and|or)[ \t]+/i);
    let precedingLabel = previousLine;
    for (const segment of segments) {
      const candidate = /(?<![\p{L}\p{N}_])(?:\+|00)?(?:\(\d{1,4}\)|\d)[\d \t().-]{4,60}\d(?:[ \t]*(?:ext(?:ension|n)?\.?|[x#])[ \t]*[:.]?[ \t]*\d{1,6})?(?![\p{L}\p{N}_])/giu;
      for (const match of segment.matchAll(candidate)) {
        const before = segment.slice(0, match.index).slice(-80);
        const context = before.trim() ? before : precedingLabel;
        if (ID_LABEL.test(context)) continue;
        add(normalizePhone(match[0], false, { labeled: PHONE_LABEL.test(context) }));
      }
      if (segment.trim() && !/^\s*[+\d(]/.test(segment)) {
        // A label may be separated from its value by several spaces or a comma.
        const label = segment.match(/^(.*?)(?=[+(\d])/s)?.[1] || segment;
        precedingLabel = label.trim().slice(-80);
      }
    }
    // Labels in a separate HTML text node can immediately precede the number.
    // Blank nodes are ignored, but labels never carry past unrelated text.
    if (rawLine.trim()) previousLine = rawLine.trim().slice(-80);
  }
  for (const href of contactLinks) {
    if (typeof href === "string" && /^\s*tel:/i.test(href)) add(telephoneLink(href.trim()));
  }
  const identities = phoneIdentityMap([...found.values()]);
  const unique = new Map();
  for (const phone of found.values()) {
    const key = identities.get(phone.normalized);
    if (!unique.has(key) || phone.value.startsWith("+")) unique.set(key, phone);
  }
  return [...unique.values()];
}
