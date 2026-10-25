const KEY = "scanHistory";
const DAY = 24 * 60 * 60 * 1000;
const MAX_SCANS = 20;
const MAX_BYTES = 4 * 1024 * 1024;
const FINISHED = new Set(["completed", "stopped", "blocked", "error"]);
const DEFAULTS = { version: 1, enabled: false, retentionDays: 7, entries: [] };

export class ScanHistory {
  constructor(storage, onChange) {
    this.storage = storage;
    this.onChange = onChange;
    this.queue = Promise.resolve();
  }

  serialize(operation) {
    const task = this.queue.catch(() => {}).then(operation);
    this.queue = task;
    return task;
  }

  async read() {
    const saved = (await this.storage.get(KEY))[KEY];
    const data = saved?.version === 1 ? structuredClone(saved) : structuredClone(DEFAULTS);
    const now = Date.now();
    const entries = data.entries.filter((entry) => Date.parse(entry.expiresAt) > now);
    if (entries.length !== data.entries.length) {
      data.entries = entries;
      await this.write(data);
    }
    return data;
  }

  async write(data) {
    // Keep complete scans rather than silently truncating their contacts.
    while (data.entries.length > MAX_SCANS || new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_BYTES) {
      if (data.entries.length <= 1) throw new Error("This scan is too large to save in history. Its current results are still available.");
      data.entries.pop();
    }
    await this.storage.set({ [KEY]: data });
    await this.onChange(data);
  }

  summary(data) {
    return {
      enabled: data.enabled,
      retentionDays: data.retentionDays,
      entries: data.entries.map(({ contacts, ...entry }) => ({
        ...entry,
        contactCount: contacts.length,
        emailCount: contacts.filter((contact) => contact.type === "email").length,
        phoneCount: contacts.filter((contact) => contact.type === "phone").length,
        addressCount: contacts.filter((contact) => contact.type === "address").length,
      })),
    };
  }

  list() {
    return this.serialize(async () => {
      const data = await this.read();
      await this.onChange(data);
      return this.summary(data);
    });
  }

  configure({ enabled, retentionDays }) {
    return this.serialize(async () => {
      if (typeof enabled !== "boolean" || ![1, 7, 30].includes(retentionDays)) throw new Error("Choose a valid history retention setting.");
      const data = await this.read();
      data.enabled = enabled;
      data.retentionDays = retentionDays;
      data.entries = data.entries.map((entry) => ({ ...entry, expiresAt: new Date(Date.parse(entry.finishedAt) + retentionDays * DAY).toISOString() }))
        .filter((entry) => Date.parse(entry.expiresAt) > Date.now());
      await this.write(data);
      return this.summary(data);
    });
  }

  capture(scan) {
    if (!scan.id || scan.incognito || !FINISHED.has(scan.status)) return Promise.resolve(false);
    // Capture synchronously so later crawler updates cannot alter this record.
    const snapshot = structuredClone(scan);
    return this.serialize(async () => {
      const data = await this.read();
      if (!data.enabled || data.entries.some((entry) => entry.id === snapshot.id)) return false;
      const now = Date.now();
      data.entries.unshift({
        id: snapshot.id, origin: snapshot.origin, seed: snapshot.seed,
        startedAt: snapshot.startedAt, finishedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + data.retentionDays * DAY).toISOString(),
        status: snapshot.status, message: snapshot.message,
        durationMs: snapshot.durationMs, elapsedMs: snapshot.elapsedMs,
        scanned: snapshot.scanned, skipped: snapshot.skipped,
        contacts: snapshot.contacts,
      });
      await this.write(data);
      return true;
    });
  }

  get(id) {
    return this.serialize(async () => {
      const data = await this.read();
      const entry = data.entries.find((item) => item.id === id);
      if (!entry) throw new Error("This saved scan was deleted or has expired.");
      return structuredClone(entry);
    });
  }

  delete(id) {
    return this.serialize(async () => {
      const data = await this.read();
      data.entries = data.entries.filter((entry) => entry.id !== id);
      await this.write(data);
      return this.summary(data);
    });
  }

  clear() {
    return this.serialize(async () => {
      const data = await this.read();
      data.entries = [];
      await this.write(data);
      return this.summary(data);
    });
  }
}
