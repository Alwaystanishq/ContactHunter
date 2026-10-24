import { ExportReview } from "./export-review.js";
import { HistoryPanel } from "./history.js";
import { ACTIVE, emptyScan, elapsedTime } from "../lib/crawler.js";
import { normalizeUrl, sitePattern } from "../lib/urls.js";

const $ = (id) => document.getElementById(id);
let scan = emptyScan();
let activeTab = null;
let selectedOrigin = "";
let filter = "all";
let busy = true;
let siteAllowed = false;
let lastContacts = null;
let lastLogs = null;
const exportReview = new ExportReview($("export-review"), notice);
const historyPanel = new HistoryPanel($("history"), {
  onReview: (entry) => exportReview.open(entry, { saved: true }),
  onChange: (entries) => exportReview.syncHistory(entries),
});

function notice(message = "") {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}

async function command(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ target: "background", type, ...extra });
  if (!response?.ok) throw new Error(response?.error || "ContactHunter could not respond. Reload the extension and try again.");
  return response.scan;
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderClock() {
  const elapsed = elapsedTime(scan);
  $("timer").textContent = `${formatTime(elapsed)} / ${formatTime(scan.durationMs)}`;
  $("progress").value = scan.status === "completed" ? 100 : elapsed / scan.durationMs * 100;
}

function renderContacts(force = false) {
  if (!force && lastContacts === scan.contacts) return;
  lastContacts = scan.contacts;
  const query = $("search").value.trim().toLowerCase();
  const contacts = scan.contacts.filter((contact) => (filter === "all" || contact.type === filter) &&
    (!query || `${contact.value} ${contact.sources.join(" ")}`.toLowerCase().includes(query)));
  const fragment = document.createDocumentFragment();
  // Keep the popup responsive; export review can access the entire result set.
  for (const contact of contacts.slice(0, 150)) {
    const row = document.createElement("li");
    const icon = document.createElement("span");
    icon.className = `contact-type ${contact.type}`;
    icon.textContent = contact.type === "email" ? "@" : "☎";
    icon.setAttribute("aria-label", contact.type === "email" ? "Email" : "Phone");
    const info = document.createElement("div");
    info.className = "contact-info";
    const value = document.createElement("span");
    value.className = "contact-value";
    value.textContent = contact.value;
    const source = document.createElement("a");
    source.className = "contact-source";
    source.href = contact.sources[0];
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    const url = new URL(contact.sources[0]);
    source.textContent = `${url.pathname}${url.search}${contact.sources.length > 1 ? ` · ${contact.sources.length} sources` : ""} ↗`;
    source.title = contact.sources.join("\n");
    source.setAttribute("aria-label", `View source: ${contact.sources[0]}`);
    const copy = document.createElement("button");
    copy.className = "copy";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy ${contact.value}`);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(contact.value);
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy"; }, 1500);
      } catch { notice("Could not copy this contact. You can select its text or export a CSV."); }
    });
    info.append(value, source);
    row.append(icon, info, copy);
    fragment.append(row);
  }
  $("contact-list").replaceChildren(fragment);
  $("empty").hidden = contacts.length > 0;
  const heading = $("empty").querySelector("h3");
  const description = $("empty").querySelector("p");
  heading.textContent = scan.contacts.length ? "No matching contacts" : ACTIVE.has(scan.status) ? "Following the trail…" : "Your next connection starts here";
  description.textContent = scan.contacts.length ? "Try another search or contact type." : ACTIVE.has(scan.status)
    ? "Public emails and phone numbers will appear here as we find them."
    : scan.status === "idle" ? "Start a scan to find public emails and phone numbers. Your discoveries will appear as we find them."
      : "No contacts collected. Check scan activity for skipped pages or try another public website.";
  $("result-summary").hidden = !contacts.length;
  $("result-summary").textContent = `${Math.min(contacts.length, 150)} of ${contacts.length} matching contacts · Duplicates removed${contacts.length > 150 ? " · Review export to see all" : ""}`;
}

function renderActivity() {
  if (lastLogs === scan.logs) return;
  lastLogs = scan.logs;
  $("activity").hidden = !scan.logs.length;
  $("activity-count").textContent = `${scan.queue.length} queued · ${scan.skipped} skipped`;
  const fragment = document.createDocumentFragment();
  for (const entry of scan.logs) {
    const row = document.createElement("li");
    row.dataset.level = entry.level;
    row.textContent = entry.message;
    if (entry.url) {
      const url = document.createElement("span");
      url.textContent = entry.url;
      row.append(url);
    }
    fragment.append(row);
  }
  $("activity-list").replaceChildren(fragment);
}

function render() {
  const running = ACTIVE.has(scan.status);
  const paused = scan.status === "paused";
  const locked = running || paused;
  const origin = locked ? scan.origin : selectedOrigin || scan.origin;
  $("site-name").textContent = origin ? new URL(origin).host : "Open a public website";
  $("site-url").textContent = locked ? scan.origin : activeTab?.url || "Chrome settings and extension pages cannot be scanned";
  $("site-url").title = $("site-url").textContent;
  const labels = { idle: "Ready", checking: "Checking", scanning: "Scanning", paused: "Paused", stopped: "Stopped", completed: "Complete", blocked: "Blocked", error: "Error" };
  $("status-badge").dataset.status = scan.status;
  $("status-badge").querySelector("span").textContent = labels[scan.status] || "Ready";
  $("start").hidden = locked;
  $("pause").hidden = !running;
  $("resume").hidden = !paused;
  $("stop").hidden = !locked;
  $("start").disabled = busy || !selectedOrigin;
  for (const id of ["pause", "resume", "stop"]) $(id).disabled = busy;
  $("duration").disabled = busy || locked;
  $("page-limit").disabled = busy || locked;
  if (locked) {
    $("duration").value = String(scan.durationMs / 1000);
    $("page-limit").value = String(scan.maxPages);
  }
  $("export").disabled = busy || !scan.contacts.length;
  $("clear").disabled = busy || scan.status === "idle";
  $("revoke").disabled = busy || !siteAllowed;
  $("revoke").title = `Stop scanning and revoke access to ${scan.origin || selectedOrigin || "this website"}`;
  $("progress-section").hidden = scan.status === "idle";
  $("progress-label").textContent = running ? (scan.status === "checking" ? "Checking access rules" : `${scan.visited.length} pages checked · ${scan.queue.length} queued`) : labels[scan.status];
  $("current-url").textContent = scan.currentUrl || scan.origin;
  $("current-url").title = scan.currentUrl || scan.origin;
  $("status-message").textContent = !selectedOrigin && scan.status === "idle" ? "Visit a public HTTP or HTTPS website to get started." : scan.message;
  $("email-count").textContent = scan.contacts.filter((contact) => contact.type === "email").length;
  $("phone-count").textContent = scan.contacts.filter((contact) => contact.type === "phone").length;
  $("page-count").textContent = scan.scanned;
  $("total-count").textContent = scan.contacts.length;
  renderClock();
  renderContacts();
  renderActivity();
  exportReview.sync(scan);
}

async function checkPermission() {
  const origin = scan.origin || selectedOrigin;
  siteAllowed = !!origin && await chrome.permissions.contains({ origins: [sitePattern(origin)] });
}

async function act(type, extra = {}) {
  busy = true;
  notice();
  render();
  try {
    scan = await command(type, extra);
    await checkPermission();
  } catch (error) { notice(error.message); }
  finally { busy = false; render(); }
}

$("start").addEventListener("click", async () => {
  if (!selectedOrigin || busy) return;
  // Request the specific origin directly in the click handler to retain user activation.
  const permission = chrome.permissions.request({ origins: [sitePattern(selectedOrigin)] });
  busy = true;
  notice();
  render();
  try {
    if (!await permission) throw new Error("Website access was not granted. Click Start scanning to try again.");
    const durationSeconds = Number($("duration").value);
    const maxPages = Number($("page-limit").value);
    await chrome.storage.local.set({ settings: { durationSeconds, maxPages } });
    scan = await command("START", { tabId: activeTab.id, origin: selectedOrigin, durationSeconds, maxPages });
    await checkPermission();
  } catch (error) { notice(error.message); }
  finally { busy = false; render(); }
});

for (const [id, type] of [["pause", "PAUSE"], ["resume", "RESUME"], ["stop", "STOP"], ["clear", "CLEAR"], ["revoke", "REVOKE"]]) {
  $(id).addEventListener("click", () => act(type, { origin: selectedOrigin }));
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((node) => node.setAttribute("aria-pressed", String(node === button)));
    renderContacts(true);
  });
});
$("search").addEventListener("input", () => renderContacts(true));

$("export").addEventListener("click", () => {
  if (!busy) exportReview.open(scan);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.scan?.newValue) {
    scan = changes.scan.newValue;
    render();
  }
  if (area === "local" && changes.scanHistory) historyPanel.refresh();
  if (area === "session" && changes.historyError) historyPanel.warning(changes.historyError.newValue || "");
});
chrome.permissions.onRemoved.addListener(() => { checkPermission().then(render).catch(() => {}); });
chrome.permissions.onAdded.addListener(() => { checkPermission().then(render).catch(() => {}); });

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\//i.test(tab.url)) {
      const origin = new URL(tab.url).origin;
      if (normalizeUrl(tab.url, tab.url, origin)) { activeTab = tab; selectedOrigin = origin; }
    }
    const { settings } = await chrome.storage.local.get("settings");
    if (settings) {
      if ([30, 60, 120, 300, 600].includes(settings.durationSeconds)) $("duration").value = String(settings.durationSeconds);
      if ([25, 50, 100, 150].includes(settings.maxPages)) $("page-limit").value = String(settings.maxPages);
    }
    scan = await command("GET_STATE");
    const { historyError } = await chrome.storage.session.get("historyError");
    if (historyError) historyPanel.warning(historyError);
    await checkPermission();
  } catch (error) { notice(error.message); }
  finally { busy = false; render(); }
}

setInterval(renderClock, 250);
initialize();
historyPanel.refresh();
