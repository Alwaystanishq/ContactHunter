import { parsePage } from "../content.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "parser" || sender.id !== chrome.runtime.id) return;
  try {
    sendResponse({ ok: true, page: parsePage(message.html, message.url) });
  } catch {
    sendResponse({ ok: false, error: "Could not parse page HTML." });
  }
});
