import { Crawler, ACTIVE } from "./lib/crawler.js";
import { fetchPublicPage } from "./lib/network.js";
import { sitePattern } from "./lib/urls.js";

const ALARM = "contacthunter-checkpoint";
let parserCreation;
let commandQueue = Promise.resolve();

async function ensureParser() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen/offscreen.html")],
  });
  if (contexts.length) return;
  if (!parserCreation) {
    parserCreation = chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html", reasons: ["DOM_PARSER"],
      justification: "Parse public HTML into contact information and internal links without executing website scripts.",
    }).finally(() => { parserCreation = null; });
  }
  await parserCreation;
}

async function parsePage(html, url) {
  await ensureParser();
  const response = await chrome.runtime.sendMessage({ target: "parser", html, url });
  if (!response?.ok) throw new Error(response?.error || "HTML parser did not respond");
  return response.page;
}

async function save(state) {
  await chrome.storage.session.set({ scan: state });
  const running = ACTIVE.has(state.status);
  await chrome.action.setBadgeBackgroundColor({ color: state.status === "paused" ? "#b7791f" : "#087f76" });
  await chrome.action.setBadgeText({ text: running ? String(state.contacts.length || "…") : state.status === "paused" ? "Ⅱ" : "" });
  if (!running) await chrome.alarms.clear(ALARM);
}

const ready = (async () => {
  const { scan } = await chrome.storage.session.get("scan");
  const crawler = new Crawler({
    save, fetchPage: fetchPublicPage, parsePage,
    hasPermission: (origin) => chrome.permissions.contains({ origins: [sitePattern(origin)] }),
  }, scan);
  if (ACTIVE.has(crawler.state.status)) {
    await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
    crawler.kick();
  }
  return crawler;
})();

async function handleCommand(message) {
  const crawler = await ready;
  switch (message.type) {
    case "GET_STATE": return crawler.snapshot();
    case "START": {
      const tab = await chrome.tabs.get(message.tabId);
      if (!tab.url || new URL(tab.url).origin !== message.origin) throw new Error("The selected tab changed. Reopen ContactHunter and try again.");
      const state = await crawler.start({ url: tab.url, durationSeconds: message.durationSeconds, maxPages: message.maxPages });
      await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
      return state;
    }
    case "PAUSE": return crawler.pause();
    case "RESUME": {
      const state = await crawler.resume();
      if (ACTIVE.has(state.status)) await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
      return state;
    }
    case "STOP": return crawler.stop();
    case "CLEAR": return crawler.clear();
    case "REVOKE": {
      const origin = crawler.state.origin || message.origin;
      await crawler.stop();
      if (origin) await chrome.permissions.remove({ origins: [sitePattern(origin)] });
      return crawler.snapshot();
    }
    default: throw new Error("Unknown ContactHunter command.");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only the packaged popup may control scans; parsed websites never have this API.
  if (message?.target !== "background" || sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup/popup.html")) return;
  const task = commandQueue.catch(() => {}).then(() => handleCommand(message));
  commandQueue = task;
  task.then((scan) => sendResponse({ ok: true, scan }), (error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) ready.then((crawler) => crawler.kick()).catch(console.error);
});

chrome.permissions.onRemoved.addListener(() => {
  const task = commandQueue.catch(() => {}).then(async () => {
    const crawler = await ready;
    if ((ACTIVE.has(crawler.state.status) || crawler.state.status === "paused") &&
        !await chrome.permissions.contains({ origins: [sitePattern(crawler.state.origin)] })) {
      await crawler.finish("blocked", "Website access was revoked. Scan stopped.");
    }
  });
  commandQueue = task;
  task.catch(console.error);
});
