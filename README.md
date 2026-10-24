# ContactHunter browser extension starter

A plain JavaScript Manifest V3 boilerplate for Chrome and Microsoft Edge. No dependencies, build step, or API keys are required. Firefox and Safari are not configured by this starter.

## Load locally

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (the folder containing `manifest.json`).
4. Pin ContactHunter from the browser's extensions menu.
5. Visit an HTTP or HTTPS website, open the popup, and click **Toggle link highlights**. Click again to remove the outlines. The color picker saves your preference.

Browser settings, extension stores, built-in PDF viewers, and other protected pages may block script injection. Refreshing a page clears its highlights.

## Files

```text
manifest.json       Extension metadata and permissions
background.js       Service worker; initializes saved preferences
content.js          On-demand page interaction demo
popup/
  popup.html        Toolbar popup
  popup.css         Popup styles, including dark mode
  popup.js          Settings, current-tab action, and error handling
```

## Customize

- Update the name, description, and version in `manifest.json`.
- Replace the link-highlighting demo in `content.js` with your page logic. Its final expression returns a result to `popup.js` through `chrome.scripting.executeScript()`.
- Edit `popup/` to build your interface. Keep JavaScript in external files; extension pages restrict inline scripts.
- Add browser event listeners at the top level of `background.js`. Service workers are short-lived, so persist durable state in `chrome.storage` rather than global variables.
- Add PNG icons and reference them through the manifest's `icons` and `action.default_icon` fields when preparing for distribution.

The starter uses `activeTab` for temporary access after a toolbar interaction, `scripting` to inject the demo, and `storage` for preferences. It does not request persistent access to all websites. See the [Chrome scripting API documentation](https://developer.chrome.com/docs/extensions/reference/api/scripting).

## Develop and verify

After editing, click **Reload** on the extension card at `chrome://extensions`. Reopen the popup. Refresh the target website to clear any script or styles injected by a previous extension version.

- Toggle highlights twice and confirm they appear and disappear.
- Change the color, reopen the popup, and confirm it is saved. Toggle existing highlights off and on to apply the new color.
- Open a browser settings page and confirm the popup displays an explanatory message.
- Inspect popup errors by right-clicking inside it and choosing **Inspect**. Inspect the worker through the extension card's **service worker** link.

Check JavaScript syntax with Node.js, if installed:

```sh
node --check background.js
node --check content.js
node --check popup/popup.js
```
