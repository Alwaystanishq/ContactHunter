const colorInput = document.querySelector("#highlight-color");
const runButton = document.querySelector("#run-action");
const status = document.querySelector("#status");

function showStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}

async function initialize() {
  try {
    const { highlightColor = "#7c3aed" } = await chrome.storage.sync.get("highlightColor");
    colorInput.value = highlightColor;
    showStatus("Ready. Open a website to try the demo.");
  } catch (error) {
    console.error(error);
    showStatus("Could not load settings. You can still try the demo.", true);
  } finally {
    colorInput.disabled = false;
    runButton.disabled = false;
  }
}

colorInput.addEventListener("change", async () => {
  try {
    await chrome.storage.sync.set({ highlightColor: colorInput.value });
    showStatus("Color saved. Toggle highlights off and on to apply it.");
  } catch (error) {
    console.error(error);
    showStatus("Could not save the color. Please try again.", true);
  }
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) {
      showStatus("Open a regular HTTP or HTTPS website to run this demo.", true);
      return;
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    if (!injection?.result) {
      throw new Error("The content script returned no result.");
    }

    const { highlighted, count } = injection.result;
    showStatus(highlighted ? `Highlighted ${count} link${count === 1 ? "" : "s"}.` : "Highlights cleared.");
  } catch (error) {
    console.error(error);
    showStatus("Cannot run on this page. Try a regular website outside browser stores or built-in pages.", true);
  } finally {
    runButton.disabled = false;
  }
});

initialize();
