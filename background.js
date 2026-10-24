// Register event listeners at the top level: service workers can stop when idle.
chrome.runtime.onInstalled.addListener(() => {
  initializeSettings().catch((error) => {
    console.error("Could not initialize extension settings:", error);
  });
});

async function initializeSettings() {
  const { highlightColor } = await chrome.storage.sync.get("highlightColor");

  // Keep existing preferences when the extension updates.
  if (highlightColor === undefined) {
    await chrome.storage.sync.set({ highlightColor: "#7c3aed" });
  }
}
