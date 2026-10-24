import { extractPhones } from "./phones.js";
export { normalizePhone } from "./phones.js";

export function normalizeEmail(value) {
  const email = value.trim().replace(/[.,;:!?]+$/, "").toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || email.includes("..")) return null;
  if (domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-") || label.length > 63)) return null;
  return email;
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
  for (const match of text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/gi)) addEmail(match[0]);
  for (const href of contactLinks) {
    if (/^mailto:/i.test(href)) {
      for (const address of decode(href.slice(7).split("?")[0]).split(/[,;]/)) addEmail(address);
    }
  }
  for (const phone of extractPhones(text, contactLinks)) {
    found.set(`phone:${phone.normalized}`, { type: "phone", ...phone });
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
