// Parse fetched public HTML in the offscreen document; never inject into a signed-in tab.
import { extractContacts } from "./lib/contacts.js";
import { robotDirectives } from "./lib/robots.js";

const BLOCK_ELEMENTS = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TD", "TH", "TR", "UL"]);

function pageText(root) {
  const parts = [];
  const completeContact = /(?:[^\s@]+@[^\s@]+\.[a-z]{2,}|\d[\d ().+-]{7,}\d)/i;
  const walk = (node) => {
    if (node.nodeType === 3) {
      // Keep adjacent complete contacts separate while joining inline fragments
      // such as <span>info@</span><span>example.com</span>.
      if (completeContact.test(parts.at(-1) || "") && completeContact.test(node.textContent)) parts.push("\n");
      parts.push(node.textContent);
      return;
    }
    const block = BLOCK_ELEMENTS.has(node.nodeName);
    if (block) parts.push("\n");
    for (const child of node.childNodes) walk(child);
    if (block) parts.push("\n");
  };
  walk(root);
  return parts.join("");
}

function protectedEmail(value) {
  // Decode public Cloudflare email markup without executing website scripts.
  if (!/^(?:[a-f\d]{2}){2,256}$/i.test(value || "")) return null;
  const key = parseInt(value.slice(0, 2), 16);
  const bytes = value.slice(2).match(/../g).map((byte) => parseInt(byte, 16) ^ key);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); } catch { return null; }
}

export function parsePage(html, url) {
  // Template contents remain inert, including images and frames. Never attach them
  // to the live document: parsing must not load assets or execute website code.
  const template = document.createElement("template");
  template.innerHTML = html;
  const doc = template.content;
  let base = url;
  try { base = new URL(doc.querySelector("base[href]")?.getAttribute("href") || url, url).href; } catch { /* Use the fetched URL. */ }
  const meta = [...doc.querySelectorAll('meta[name]')]
    .filter((node) => /^(?:robots|contacthunter)$/i.test(node.getAttribute("name")))
    .map((node) => node.getAttribute("content") || "").join(",");
  const directives = robotDirectives(meta);
  if (doc.querySelector('input[type="password"]')) {
    return { contacts: [], links: [], restricted: true, reason: "Login form detected" };
  }
  doc.querySelectorAll('script, style, noscript, template, head, meta, title, base, link, iframe, object, embed, input, textarea, select, [hidden], [aria-hidden="true"], [inert]')
    .forEach((node) => node.remove());
  doc.querySelectorAll("[style]").forEach((node) => {
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute("style"))) node.remove();
  });

  const anchors = [...doc.querySelectorAll("a[href]")];
  const contactLinks = anchors.map((anchor) => anchor.getAttribute("href").trim())
    .filter((href) => /^(?:mailto|tel):/i.test(href));
  for (const node of doc.querySelectorAll('[data-cfemail], a[href*="/cdn-cgi/l/email-protection#"]')) {
    const encoded = node.getAttribute("data-cfemail") || node.getAttribute("href")?.split("#")[1];
    const email = protectedEmail(encoded);
    if (email) contactLinks.push(`mailto:${email}`);
  }
  const links = directives.follow ? anchors.filter((anchor) => !anchor.hasAttribute("download") && !/(?:^|\s)nofollow(?:\s|$)/i.test(anchor.getAttribute("rel") || ""))
    .map((anchor) => {
      try { return new URL(anchor.getAttribute("href"), base).href; } catch { return null; }
    }).filter(Boolean).slice(0, 1000) : [];

  return {
    contacts: directives.collect ? extractContacts(pageText(doc), contactLinks).slice(0, 1000) : [],
    links,
    restricted: !directives.collect,
    reason: !directives.collect ? "Page robots directives restrict collection" : "",
  };
}
