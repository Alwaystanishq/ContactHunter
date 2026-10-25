import { normalizeUrl, linkPriority } from "./urls.js";
import { parseRobots, robotsAllows, robotDirectives } from "./robots.js";
import { mergeContacts } from "./contacts.js";

export const ACTIVE = new Set(["checking", "scanning"]);

export function emptyScan() {
  return {
    schema: 1, id: null, status: "idle", origin: "", seed: "", incognito: false, durationMs: null,
    maxPages: null, elapsedMs: 0, activeSince: null, startedAt: null,
    policy: null, policyCheckedAt: null, nextRequestAt: 0, queue: [], visited: [], contacts: [], discoveryCapped: false,
    scanned: 0, skipped: 0, currentUrl: "", logs: [], message: "Ready to discover public contacts.",
  };
}

export function elapsedTime(state, now = Date.now()) {
  const elapsed = state.elapsedMs + (state.activeSince === null ? 0 : Math.max(0, now - state.activeSince));
  return state.durationMs === null ? elapsed : Math.min(state.durationMs, elapsed);
}

function abortError() { return new DOMException("Scan interrupted", "AbortError"); }

export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const cleanup = () => signal.removeEventListener("abort", abort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); cleanup(); reject(abortError()); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export class Crawler {
  constructor({ save, fetchPage, parsePage, hasPermission, now = Date.now, sleep = wait }, saved) {
    this.adapters = { save, fetchPage, parsePage, hasPermission, now, sleep };
    this.state = saved?.schema === 1 ? { ...emptyScan(), ...saved } : emptyScan();
    this.token = 0;
    this.controller = new AbortController();
    this.runner = null;
    this.writes = Promise.resolve();
  }

  snapshot() { return structuredClone(this.state); }
  now() { return this.adapters.now(); }
  remaining() { return this.state.durationMs === null ? Infinity : Math.max(0, this.state.durationMs - elapsedTime(this.state, this.now())); }
  valid(token) { return token === this.token && ACTIVE.has(this.state.status); }

  persist() {
    const snapshot = this.snapshot();
    const operation = this.writes.catch(() => {}).then(() => this.adapters.save(snapshot));
    this.writes = operation;
    return operation;
  }

  log(message, url = "", level = "info") {
    this.state.logs.unshift({ message, url, level, at: this.now() });
    this.state.logs.length = Math.min(this.state.logs.length, 30);
  }

  interrupt() {
    this.token++;
    this.controller.abort();
    this.controller = new AbortController();
  }

  settleClock() {
    this.state.elapsedMs = elapsedTime(this.state, this.now());
    this.state.activeSince = null;
  }

  async start({ url, durationSeconds = null, maxPages = null, incognito = false }) {
    if (ACTIVE.has(this.state.status) || this.state.status === "paused") throw new Error("Stop the current scan before starting another.");
    const origin = new URL(url).origin;
    const seed = normalizeUrl(url, url, origin);
    if (!seed) throw new Error("Open a public HTTP(S) page without private or unsupported query parameters.");
    if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 30 || durationSeconds > 600)) throw new Error("Choose no time limit or a duration between 30 seconds and 10 minutes.");
    if (maxPages !== null && (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 150)) throw new Error("Choose no page limit or a page limit between 1 and 150.");
    if (!await this.adapters.hasPermission(origin)) throw new Error("Grant access to this website to start scanning.");
    this.interrupt();
    this.state = {
      ...emptyScan(), id: crypto.randomUUID(), origin, seed, incognito, status: "checking",
      durationMs: durationSeconds === null ? null : durationSeconds * 1000, maxPages,
      queue: durationSeconds === null && maxPages === null ? [...new Set([`${origin}/`, seed])] : [seed],
      startedAt: new Date(this.now()).toISOString(), activeSince: this.now(),
      message: "Checking this website’s robots.txt…",
    };
    this.log("Scan started. Checking website restrictions.", `${origin}/robots.txt`);
    await this.persist();
    this.kick();
    return this.snapshot();
  }

  async pause() {
    if (!ACTIVE.has(this.state.status)) return this.snapshot();
    this.settleClock();
    this.interrupt();
    this.state.status = "paused";
    this.state.message = this.state.durationMs === null
      ? "Paused. Your results and scan progress are saved."
      : "Paused. Your results and remaining scan time are saved.";
    this.log("Scan paused.");
    await this.persist();
    return this.snapshot();
  }

  async resume() {
    if (this.state.status !== "paused") throw new Error("There is no paused scan to resume.");
    if (!await this.adapters.hasPermission(this.state.origin)) throw new Error("Website access was revoked. Start a new scan to grant access again.");
    if (!this.remaining()) return this.finish("completed", "Scan duration reached.");
    this.interrupt();
    this.state.status = this.state.policy ? "scanning" : "checking";
    this.state.activeSince = this.now();
    this.state.message = "Resuming your scan…";
    this.log("Scan resumed.");
    await this.persist();
    this.kick();
    return this.snapshot();
  }

  async stop() {
    if (ACTIVE.has(this.state.status) || this.state.status === "paused") return this.finish("stopped", "Scan stopped. Your collected contacts are ready to export.");
    return this.snapshot();
  }

  async clear() {
    this.interrupt();
    this.state = emptyScan();
    await this.persist();
    return this.snapshot();
  }

  async finish(status, message) {
    this.settleClock();
    this.interrupt();
    this.state.status = status;
    this.state.currentUrl = "";
    this.state.message = message;
    this.log(message, "", status === "blocked" || status === "error" ? "warning" : "info");
    await this.persist();
    return this.snapshot();
  }

  kick() {
    if (this.runner || !ACTIVE.has(this.state.status)) return;
    const token = this.token;
    this.runner = this.run(token).catch(async (error) => {
      if (!this.valid(token)) return;
      await this.finish("error", `Scan could not continue: ${error.message}`).catch(console.error);
    }).finally(() => {
      this.runner = null;
      if (ACTIVE.has(this.state.status)) this.kick();
    });
  }

  async request(url, token, maxBytes) {
    while (this.valid(token) && this.state.nextRequestAt > this.now() && this.remaining() > 0) {
      await this.adapters.sleep(Math.min(10000, this.state.nextRequestAt - this.now(), this.remaining()), this.controller.signal);
      if (!this.valid(token)) throw abortError();
      // Periodic Chrome API checkpoints also keep long crawl-delay waits recoverable.
      await this.persist();
    }
    if (!this.valid(token)) throw abortError();
    if (!this.remaining()) throw new Error("Scan duration reached");
    if (!await this.adapters.hasPermission(this.state.origin)) throw new Error("Website access was revoked");
    if (!this.valid(token)) throw abortError();
    this.state.nextRequestAt = this.now() + (this.state.policy?.delayMs ?? 1500);
    await this.persist();
    if (!this.valid(token)) throw abortError();
    if (!this.remaining()) throw new Error("Scan duration reached");
    return this.adapters.fetchPage(url, {
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(Math.max(1, Math.min(12000, this.remaining())))]),
      maxBytes,
    });
  }

  async checkRobots(token) {
    const url = `${this.state.origin}/robots.txt`;
    this.state.currentUrl = url;
    await this.persist();
    let response;
    try {
      response = await this.request(url, token, 512 * 1024);
    } catch (error) {
      if (!this.valid(token)) return false;
      await this.finish(this.remaining() ? "blocked" : "completed", this.remaining()
        ? `Could not verify robots.txt: ${error.message}. No further pages will be scanned.` : "Scan duration reached.");
      return false;
    }
    if (!this.valid(token)) return false;
    if (!this.remaining()) { await this.finish("completed", "Scan duration reached."); return false; }
    if ([404, 410].includes(response.status)) {
      this.state.policy = parseRobots("");
      this.log("No robots.txt found; public-page restrictions still apply.");
    } else if (response.status >= 200 && response.status < 300 && !/text\/html/i.test(response.headers["content-type"] || "")) {
      this.state.policy = parseRobots(response.body);
      this.log("Website crawl rules loaded.");
    } else {
      await this.finish("blocked", `Could not verify robots.txt (HTTP ${response.status || "redirect"}). No further pages will be scanned.`);
      return false;
    }
    this.state.nextRequestAt = Math.max(this.state.nextRequestAt, this.now() + this.state.policy.delayMs);
    this.state.policyCheckedAt = this.now();
    if (!robotsAllows(this.state.policy, this.state.seed)) {
      await this.finish("blocked", "This website’s robots.txt disallows scanning the selected page.");
      return false;
    }
    this.state.status = "scanning";
    this.state.message = "Discovering public contact information…";
    await this.persist();
    return true;
  }

  async run(token) {
    if (!this.remaining()) return this.finish("completed", "Scan duration reached.");
    if (this.state.policy && this.now() - this.state.policyCheckedAt >= 15 * 60 * 1000) {
      this.state.policy = null;
      this.state.status = "checking";
      this.log("Refreshing website crawl rules after a long pause.");
    }
    if (!this.state.policy && !await this.checkRobots(token)) return;
    while (this.valid(token)) {
      if (!this.remaining()) return this.finish("completed", "Scan duration reached.");
      if (this.state.maxPages !== null && this.state.visited.length >= this.state.maxPages) return this.finish("completed", "Page limit reached.");
      if (this.state.contacts.length >= 1000) return this.finish("completed", "Safety limit of 1,000 unique contacts reached.");
      const url = this.state.queue[0];
      if (!url) return this.finish("completed", this.state.discoveryCapped
        ? "Finished scanning queued pages. Link discovery was capped at 500 URLs."
        : "Finished scanning all discovered, eligible internal pages.");
      if (!robotsAllows(this.state.policy, url)) {
        this.commitPage(url, true, "Skipped: robots.txt disallows this page.");
        await this.persist();
        continue;
      }
      this.state.currentUrl = url;
      this.state.message = "Scanning public pages…";
      await this.persist();
      try {
        const response = await this.request(url, token, 2 * 1024 * 1024);
        if (!this.valid(token)) return;
        if (!this.remaining()) return this.finish("completed", "Scan duration reached.");
        if ([401, 403, 429, 503].includes(response.status)) {
          return this.finish("blocked", `Website returned HTTP ${response.status}. Stopped to respect access or rate restrictions.`);
        }
        if (response.status < 200 || response.status >= 300) {
          this.commitPage(url, true, `Skipped: HTTP ${response.status || "redirect"}. Redirects are not followed.`);
        } else if (!/\btext\/html\b/i.test(response.headers["content-type"] || "")) {
          this.commitPage(url, true, "Skipped: response is not an HTML page.");
        } else {
          const headerRules = robotDirectives(response.headers["x-robots-tag"]);
          const page = await this.adapters.parsePage(response.body, url);
          if (!this.valid(token)) return;
          if (!this.remaining()) return this.finish("completed", "Scan duration reached.");
          if (headerRules.collect && !page.restricted) {
            this.state.contacts = mergeContacts(this.state.contacts, page.contacts, url, this.now());
          }
          if (headerRules.follow) this.enqueue(page.links, url);
          const restricted = page.restricted || !headerRules.collect;
          this.commitPage(url, restricted, restricted ? (page.reason || "Skipped: X-Robots-Tag restricts collection.") : `Scanned page; ${page.contacts.length} contact candidates.`);
        }
      } catch (error) {
        if (!this.valid(token)) return;
        if (!this.remaining()) return this.finish("completed", "Scan duration reached.");
        if (error.message === "Website access was revoked") return this.finish("blocked", error.message);
        this.commitPage(url, true, `Skipped: ${error.name === "TimeoutError" ? "request timed out" : error.message}.`);
      }
      await this.persist();
    }
  }

  commitPage(url, skipped, message) {
    this.state.queue = this.state.queue.filter((item) => item !== url);
    this.state.visited.push(url);
    this.state[skipped ? "skipped" : "scanned"]++;
    this.state.currentUrl = "";
    this.log(message, url, skipped ? "warning" : "info");
  }

  enqueue(links, base) {
    const known = new Set([...this.state.queue, ...this.state.visited]);
    for (const link of links) {
      const url = normalizeUrl(link, base, this.state.origin);
      if (!url || known.has(url) || !robotsAllows(this.state.policy, url)) continue;
      if (known.size >= 500) {
        if (!this.state.discoveryCapped) this.log("Link discovery capped at 500 URLs.", "", "warning");
        this.state.discoveryCapped = true;
        break;
      }
      this.state.queue.push(url);
      known.add(url);
    }
    // Keep the in-flight page first; prioritize likely contact pages behind it.
    const [current, ...pending] = this.state.queue;
    pending.sort((a, b) => linkPriority(a) - linkPriority(b));
    this.state.queue = current ? [current, ...pending] : [];
  }
}
