// Parse fetched public HTML in the offscreen document; never inject into a signed-in tab.
import { extractContacts } from "./lib/contacts.js";
import { robotDirectives } from "./lib/robots.js";

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
  doc.querySelectorAll('script, style, noscript, template, head, meta, title, base, link, iframe, object, embed, form, input, textarea, select, [hidden], [aria-hidden="true"], [inert]')
    .forEach((node) => node.remove());
  doc.querySelectorAll("[style]").forEach((node) => {
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute("style"))) node.remove();
  });

  const anchors = [...doc.querySelectorAll("a[href]")];
  const contactLinks = anchors.map((anchor) => anchor.getAttribute("href"))
    .filter((href) => /^(?:mailto|tel):/i.test(href));
  const links = directives.follow ? anchors.filter((anchor) => !anchor.hasAttribute("download") && !/(?:^|\s)nofollow(?:\s|$)/i.test(anchor.getAttribute("rel") || ""))
    .map((anchor) => {
      try { return new URL(anchor.getAttribute("href"), base).href; } catch { return null; }
    }).filter(Boolean).slice(0, 1000) : [];

  // Preserve text boundaries so adjacent elements do not produce merged contacts.
  const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
  const text = [];
  while (walker.nextNode()) text.push(walker.currentNode.textContent);
  return {
    contacts: directives.collect ? extractContacts(text.join("\n"), contactLinks).slice(0, 1000) : [],
    links,
    restricted: !directives.collect,
    reason: !directives.collect ? "Page robots directives restrict collection" : "",
  };
}
