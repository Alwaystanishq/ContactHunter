export class HistoryPanel {
  constructor(root, { onReview, onChange }) {
    this.root = root;
    this.onReview = onReview;
    this.onChange = onChange;
    this.data = { enabled: false, retentionDays: 7, entries: [] };
    this.busy = false;
    this.loading = true;
    this.$ = (id) => root.querySelector(`#history-${id}`);
    this.$("enabled").addEventListener("change", () => this.configure());
    this.$("retention").addEventListener("change", () => this.configure());
    this.$("search").addEventListener("input", () => this.render());
    this.$("clear").addEventListener("click", () => this.act("HISTORY_CLEAR"));
    this.render();
  }

  async request(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ target: "background", type, ...extra });
    if (!response?.ok) throw new Error(response?.error || "Scan history is unavailable. Please reopen ContactHunter.");
    return response;
  }

  warning(message = "") {
    this.$("error").textContent = message;
    this.$("error").hidden = !message;
  }

  update(data) {
    this.data = data;
    this.onChange(data.entries);
    this.render();
  }

  async refresh() {
    try {
      const response = await this.request("HISTORY_LIST");
      this.update(response.history);
    } catch (error) { this.warning(error.message); }
    finally { this.loading = false; this.render(); }
  }

  configure() {
    return this.act("HISTORY_SETTINGS", {
      enabled: this.$("enabled").checked,
      retentionDays: Number(this.$("retention").value),
    });
  }

  async act(type, extra = {}) {
    if (this.busy) return;
    this.busy = true;
    this.warning();
    this.render();
    try {
      const response = await this.request(type, extra);
      if (response.history) this.update(response.history);
      if (response.entry) this.onReview(response.entry);
    } catch (error) { this.warning(error.message); }
    finally { this.busy = false; this.render(); }
  }

  render() {
    const disabled = this.busy || this.loading;
    this.$("enabled").disabled = disabled;
    this.$("enabled").checked = this.data.enabled;
    this.$("retention").disabled = disabled;
    this.$("retention").value = String(this.data.retentionDays);
    this.$("clear").disabled = disabled || !this.data.entries.length;
    this.$("count").textContent = this.data.entries.length ? `${this.data.entries.length} saved${this.data.enabled ? "" : " · Saving off"}` : this.data.enabled ? "On" : "Off";
    const query = this.$("search").value.trim().toLowerCase();
    const entries = this.data.entries.filter((entry) => `${entry.origin} ${entry.status}`.toLowerCase().includes(query));
    this.$("empty").hidden = entries.length > 0;
    this.$("empty").textContent = this.loading ? "Loading history…" : this.data.entries.length ? "No saved websites match your search."
      : this.data.enabled ? "No saved scans yet. Finished scans will appear here." : "Turn on saving to keep future scan results after Chrome closes.";
    const labels = { completed: "Complete", stopped: "Stopped", blocked: "Blocked", error: "Error" };
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const row = document.createElement("li");
      const heading = document.createElement("div");
      heading.className = "history-entry-heading";
      const name = document.createElement("strong");
      name.textContent = new URL(entry.origin).host;
      const status = document.createElement("span");
      status.textContent = labels[entry.status] || entry.status;
      heading.append(name, status);
      const date = document.createElement("p");
      date.className = "history-date";
      date.textContent = new Date(entry.finishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      date.title = `Auto-deletes ${new Date(entry.expiresAt).toLocaleString()}`;
      const counts = document.createElement("p");
      counts.className = "history-stats";
      counts.textContent = `${entry.emailCount} emails · ${entry.phoneCount} phones · ${entry.addressCount ?? 0} addresses · ${entry.scanned} pages`;
      const message = document.createElement("p");
      message.className = "history-message";
      message.textContent = entry.message;
      const actions = document.createElement("div");
      actions.className = "history-actions";
      const review = document.createElement("button");
      review.className = "export";
      review.textContent = "Review & export";
      review.disabled = disabled || !entry.contactCount;
      review.setAttribute("aria-label", `Review saved contacts from ${new URL(entry.origin).host}`);
      review.addEventListener("click", () => this.act("HISTORY_OPEN", { id: entry.id }));
      const remove = document.createElement("button");
      remove.className = "history-delete";
      remove.textContent = "Delete";
      remove.disabled = disabled;
      remove.setAttribute("aria-label", `Delete saved scan from ${new URL(entry.origin).host} on ${date.textContent}`);
      remove.addEventListener("click", () => this.act("HISTORY_DELETE", { id: entry.id }));
      actions.append(review, remove);
      row.append(heading, date, counts, message, actions);
      fragment.append(row);
    }
    this.$("list").replaceChildren(fragment);
  }
}
