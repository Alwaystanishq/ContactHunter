const UNSAFE_PATH = /(?:^|\/)(?:log[-_]?in|log[-_]?out|sign[-_]?in|sign[-_]?out|sign[-_]?up|register|account|admin|wp-admin|wp-login\.php|dashboard|checkout|cart|auth|oauth|session|unsubscribe|delete|remove|search)(?:[/.;]|$)/i;
const FILE_PATH = /\.(?:pdf|zip|gz|tar|rar|7z|exe|dmg|apk|mp[34]|mov|avi|webm|wav|ogg|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|css|js|json|xml|csv|docx?|xlsx?|pptx?)(?:$|\/)/i;
const SAFE_QUERY = new Set(["page", "p", "lang", "hl"]);
const TRACKING = /^(?:utm_.+|fbclid|gclid|msclkid)$/i;

export function normalizeUrl(value, base, origin) {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.username || url.password) return null;
    const decoded = decodeURIComponent(url.pathname);
    if (UNSAFE_PATH.test(decoded) || FILE_PATH.test(decoded) || /%2f|%5c|%25/i.test(url.pathname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.test(key)) url.searchParams.delete(key);
      else if (!SAFE_QUERY.has(key) || url.searchParams.get(key).length > 16) return null;
    }
    url.searchParams.sort();
    return url.href.length <= 600 ? url.href : null;
  } catch {
    return null;
  }
}

export function linkPriority(url) {
  return /contact|about|team|support|impressum|legal|reach/i.test(new URL(url).pathname) ? 0 : 1;
}

export function sitePattern(origin) {
  // Chrome host permissions span ports; the crawl queue still enforces exact origin.
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
