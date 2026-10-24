// Injected only after a popup button click. The IIFE allows repeated injection.
(async () => {
  const stateKey = "__contactHunterHighlightStyle";
  const existingStyle = globalThis[stateKey];

  if (existingStyle?.isConnected) {
    existingStyle.remove();
    delete globalThis[stateKey];
    return { highlighted: false, count: 0 };
  }

  const { highlightColor = "#7c3aed" } = await chrome.storage.sync.get("highlightColor");
  const safeColor = /^#[0-9a-f]{6}$/i.test(highlightColor) ? highlightColor : "#7c3aed";
  const style = document.createElement("style");
  style.textContent = `
    a[href] {
      outline: 2px solid ${safeColor} !important;
      outline-offset: 3px !important;
    }
  `;

  (document.head || document.documentElement).append(style);
  globalThis[stateKey] = style;

  return { highlighted: true, count: document.querySelectorAll("a[href]").length };
})();
