import { extractPhones, phoneIdentityMap } from "./phones.js";
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
  const emailText = String(text).normalize("NFKC")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\})\s*/gi, "@")
    .replace(/\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\})\s*/gi, ".")
    .replace(/([a-z0-9.!#$%&'*+/=?^_`{|}~-])\s*@\s*(?=[a-z0-9])/gi, "$1@");
  for (const match of emailText.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/gi)) addEmail(match[0]);
  for (const href of contactLinks) {
    if (typeof href === "string" && /^\s*mailto:/i.test(href)) {
      const [recipients, query = ""] = href.trim().slice(7).split("?");
      for (const address of decode(recipients).split(/[,;]/)) addEmail(address);
      for (const [key, value] of new URLSearchParams(query)) {
        if (/^(?:to|cc|bcc)$/i.test(key)) for (const address of value.split(/[,;]/)) addEmail(address);
      }
    }
  }
  for (const phone of extractPhones(text, contactLinks)) {
    found.set(`phone:${phone.normalized}`, { type: "phone", ...phone });
  }
  return [...found.values()];
}

export function mergeContacts(existing, incoming, source, now, limit = 1000) {
  const identities = phoneIdentityMap([...existing, ...incoming].filter((contact) => contact.type === "phone"));
  const map = new Map();
  for (const candidate of [...existing, ...incoming.map((contact) => ({
    ...contact, sources: [source], foundAt: new Date(now).toISOString(),
  }))]) {
    const normalized = candidate.type === "phone" ? identities.get(candidate.normalized) : candidate.normalized;
    const key = `${candidate.type}:${normalized}`;
    const old = map.get(key);
    if (old) {
      for (const url of candidate.sources) if (!old.sources.includes(url) && old.sources.length < 5) old.sources.push(url);
      if (candidate.type === "phone" && candidate.value.startsWith("+")) {
        old.value = candidate.value;
        old.normalized = candidate.normalized;
      }
    } else if (map.size < limit) {
      map.set(key, { ...candidate, sources: [...candidate.sources] });
    }
  }
  return [...map.values()];
}
