import { contactsToCsv } from "../lib/csv.js";

const PAGE_SIZE = 50;
const keyOf = (contact) => `${contact.type}:${contact.normalized}`;

export class ExportReview {
  constructor(dialog, onInvalidated) {
    this.dialog = dialog;
    this.onInvalidated = onInvalidated;
    this.contacts = [];
    this.selected = new Set();
    this.page = 0;
    this.scanId = null;
    this.$ = (id) => dialog.querySelector(`#review-${id}`);

    for (const id of ["close", "cancel"]) this.$(id).addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      this.contacts = [];
      this.selected.clear();
      this.scanId = null;
      this.$("list").replaceChildren();
    });
    for (const id of ["search", "type", "selected-only"]) {
      this.$(id).addEventListener(id === "search" ? "input" : "change", () => { this.page = 0; this.render(); });
    }
    this.$("matching").addEventListener("change", () => {
      const checked = this.$("matching").checked;
      for (const contact of this.matches()) {
        if (checked) this.selected.add(keyOf(contact));
        else this.selected.delete(keyOf(contact));
      }
      this.render();
    });
    this.$("select-all").addEventListener("click", () => {
      this.selected = new Set(this.contacts.map(keyOf));
      this.render();
    });
    this.$("clear-selection").addEventListener("click", () => { this.selected.clear(); this.render(); });
    this.$("previous").addEventListener("click", () => { this.page--; this.render(); });
    this.$("next").addEventListener("click", () => { this.page++; this.render(); });
    this.$("download").addEventListener("click", () => this.download());
  }

  open(scan, { saved = false } = {}) {
    if (!scan.contacts.length || this.dialog.open) return;
    // Freeze contacts AND sources: live scanning must not silently change a CSV
    // after the user has reviewed it. Main-view filters do not hide this snapshot.
    this.contacts = structuredClone(scan.contacts);
    this.scanId = scan.id;
    this.origin = scan.origin;
    this.saved = saved;
    this.savedExpiresAt = scan.expiresAt;
    this.$("heading").textContent = saved ? "Review saved contacts" : "Choose your contacts";
    this.selected = new Set(this.contacts.map(keyOf));
    this.page = 0;
    this.$("search").value = "";
    this.$("type").value = "all";
    this.$("selected-only").checked = false;
    this.$("error").hidden = true;
    this.render();
    this.dialog.showModal();
    this.$("search").focus();
    if (saved) {
      this.$("snapshot").textContent = `Saved scan from ${new URL(scan.origin).host} · ${new Date(scan.finishedAt).toLocaleString()}`;
    } else this.sync(scan);
  }

  sync(scan) {
    if (!this.dialog.open || this.saved) return;
    if (scan.id !== this.scanId) {
      this.dialog.close();
      this.onInvalidated("Export review closed because the scan was cleared or replaced. Review the current results before exporting.");
      return;
    }
    const captured = new Set(this.contacts.map(keyOf));
    const added = scan.contacts.filter((contact) => !captured.has(keyOf(contact))).length;
    const message = added
      ? `${added} new contact${added === 1 ? "" : "s"} found since review opened. Reopen review to include newer results.`
      : `Snapshot from ${new URL(this.origin).host}. New contacts and source updates stay out of this download.`;
    if (this.$("snapshot").textContent !== message) this.$("snapshot").textContent = message;
  }

  syncHistory(entries) {
    if (!this.dialog.open || !this.saved) return;
    const entry = entries.find((item) => item.id === this.scanId);
    if (!entry) {
      this.dialog.close();
      this.onInvalidated("Export review closed because the saved scan was deleted or expired.");
    } else this.savedExpiresAt = entry.expiresAt;
  }

  matches() {
    const query = this.$("search").value.trim().toLowerCase();
    const type = this.$("type").value;
    const selectedOnly = this.$("selected-only").checked;
    return this.contacts.filter((contact) => (type === "all" || contact.type === type) &&
      (!selectedOnly || this.selected.has(keyOf(contact))) &&
      (!query || `${contact.value} ${contact.sources.join(" ")}`.toLowerCase().includes(query)));
  }

  renderSummary(matches = this.matches()) {
    const selected = this.contacts.filter((contact) => this.selected.has(keyOf(contact)));
    const emails = selected.filter((contact) => contact.type === "email").length;
    this.$("selected-count").textContent = `${selected.length} of ${this.contacts.length} selected`;
    this.$("breakdown").textContent = `${emails} emails · ${selected.length - emails} phones · ${selected.length} CSV rows`;
    this.$("download").textContent = `Download CSV (${selected.length})`;
    this.$("download").disabled = selected.length === 0;
    this.$("select-all").disabled = selected.length === this.contacts.length;
    this.$("clear-selection").disabled = selected.length === 0;
    const included = matches.filter((contact) => this.selected.has(keyOf(contact))).length;
    this.$("matching").checked = matches.length > 0 && included === matches.length;
    this.$("matching").indeterminate = included > 0 && included < matches.length;
    this.$("matching").disabled = matches.length === 0;
    this.$("matching-label").textContent = `Select matching (${matches.length})`;
  }

  render() {
    const matches = this.matches();
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    this.renderSummary(matches);
    this.$("previous").disabled = this.page === 0;
    this.$("next").disabled = this.page >= pages - 1;
    this.$("page").textContent = matches.length ? `Page ${this.page + 1} of ${pages} · ${matches.length} matches` : "0 matches";
    this.$("empty").hidden = matches.length > 0;
    const fragment = document.createDocumentFragment();
    for (const contact of matches.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)) {
      const row = document.createElement("li");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selected.has(keyOf(contact));
      checkbox.id = `review-contact-${this.contacts.indexOf(contact)}`;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(keyOf(contact));
        else this.selected.delete(keyOf(contact));
        if (this.$("selected-only").checked) {
          this.render();
          this.$("list").querySelector('input[type="checkbox"]')?.focus();
          if (!this.$("list").children.length) this.$("selected-only").focus();
        } else this.renderSummary();
      });
      const info = document.createElement("div");
      info.className = "review-contact-info";
      const label = document.createElement("label");
      label.htmlFor = checkbox.id;
      label.className = "review-contact-value";
      label.textContent = contact.value;
      const type = document.createElement("span");
      type.className = "review-contact-type";
      type.textContent = contact.type === "email" ? "Email" : "Phone";
      info.append(label, type);
      // Every retained source is available to review and included in the CSV.
      for (const source of contact.sources) {
        const link = document.createElement("a");
        link.href = source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "review-contact-source";
        link.textContent = `${new URL(source).host}${new URL(source).pathname}${new URL(source).search} ↗`;
        link.title = source;
        info.append(link);
      }
      row.append(checkbox, info);
      fragment.append(row);
    }
    this.$("list").replaceChildren(fragment);
    this.$("scroll").scrollTop = 0;
  }

  download() {
    if (this.saved && Date.parse(this.savedExpiresAt) <= Date.now()) {
      this.dialog.close();
      this.onInvalidated("This saved scan has expired. Its contacts can no longer be exported from history.");
      return;
    }
    const contacts = this.contacts.filter((contact) => this.selected.has(keyOf(contact)));
    if (!this.dialog.open || !contacts.length) return;
    let url;
    let link;
    try {
      url = URL.createObjectURL(new Blob([contactsToCsv(contacts)], { type: "text/csv;charset=utf-8" }));
      link = document.createElement("a");
      link.href = url;
      link.download = `contacthunter-${new URL(this.origin).hostname}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      this.dialog.close();
    } catch {
      this.$("error").textContent = "Could not start the download. Your selection is preserved; please try again.";
      this.$("error").hidden = false;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }
}
