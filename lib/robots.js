// Percent-encoded unreserved ASCII is equivalent; reserved octets stay encoded.
function normalize(value) {
  return [...value].map((char) => char.codePointAt(0) > 127 ? encodeURIComponent(char) : char).join("")
    .replace(/%[0-9a-f]{2}/gi, (encoded) => {
      const char = String.fromCharCode(parseInt(encoded.slice(1), 16));
      return /[a-z0-9._~-]/i.test(char) ? char : encoded.toUpperCase();
    });
}

export function parseRobots(text) {
  const groups = [];
  let group = null;
  let hasRules = false;
  let ruleCount = 0;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const split = line.indexOf(":");
    if (split < 0) continue;
    const name = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (name === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [], delayMs: 0 };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow", "crawl-delay"].includes(name)) {
      hasRules = true;
      if (name === "crawl-delay") {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) group.delayMs = Math.max(group.delayMs, seconds * 1000);
      } else if (value.startsWith("/")) {
        if (value.length > 2048 || ruleCount >= 5000) {
          throw new Error("robots.txt exceeds the supported rule complexity");
        }
        group.rules.push({ allow: name === "allow", path: normalize(value) });
        ruleCount++;
      }
    }
  }
  // Enforce both generic and ContactHunter-specific restrictions conservatively.
  const generic = groups.filter((entry) => entry.agents.includes("*"));
  const specific = groups.filter((entry) => entry.agents.some((agent) => agent !== "*" && "contacthunter".includes(agent)));
  const combine = (entries) => entries.flatMap((entry) => entry.rules);
  return {
    ruleSets: [combine(generic), combine(specific)],
    delayMs: Math.max(1500, ...[...generic, ...specific].map((entry) => entry.delayMs)),
  };
}

// Glob matching without regex backtracking on untrusted website rules.
function matches(pattern, path) {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).replaceAll("$", "%24");
  let i = 0, j = 0, star = -1, retry = 0;
  while (i < path.length) {
    if (j === body.length && !anchored) return true;
    if (body[j] === "*") { star = j++; retry = i; }
    else if (body[j] === path[i]) { i++; j++; }
    else if (star >= 0) { j = star + 1; i = ++retry; }
    else return false;
  }
  while (body[j] === "*") j++;
  return j === body.length;
}

export function robotsAllows(policy, value) {
  const url = new URL(value);
  const path = normalize(url.pathname + url.search).replaceAll("*", "%2A").replaceAll("$", "%24");
  return policy.ruleSets.every((rules) => {
    let best = null;
    for (const rule of rules) {
      if (!matches(rule.path, path)) continue;
      const length = new TextEncoder().encode(rule.path.replace(/[*$]/g, "")).length;
      if (!best || length > best.length || (length === best.length && rule.allow)) best = { length, allow: rule.allow };
    }
    return best?.allow ?? true;
  });
}

export function robotDirectives(value = "") {
  const tokens = value.toLowerCase().split(/[\s,:;]+/);
  return {
    collect: !tokens.some((token) => ["none", "noindex", "noarchive", "nosnippet"].includes(token)),
    follow: !tokens.some((token) => ["none", "nofollow"].includes(token)),
  };
}
