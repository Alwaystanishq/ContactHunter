# ContactHunter

A Chrome Manifest V3 extension that discovers publicly published email addresses and phone numbers across a website. Built with JavaScript, HTML, and CSS, with no dependencies or build step.

## Install

1. Open `chrome://extensions` in Chrome 120 or later.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this folder, containing `manifest.json`.
4. Pin **ContactHunter** from the extensions menu.

After changing extension files, click **Reload** on its extension card and reopen the popup.

## Use

1. Visit a public HTTP or HTTPS page on the website you want to scan.
2. Open ContactHunter and choose a scan duration (30 seconds to 10 minutes) and page limit.
3. Click **Start scanning** and grant Chrome access to that website if prompted.
4. Watch emails, phone numbers, page counts, and scan activity update live.
5. **Pause** cancels the in-flight request and freezes the remaining scan time. **Resume** continues the queue. **Stop** ends the scan and retains its results.
6. Search or filter contacts, copy individual values, or select **Export CSV** to download every collected contact and its retained source URLs.

The scan continues when you close the popup. Only one scan runs at a time. Starting a new scan replaces previous results. **Clear results** stops an active scan and removes its contacts and activity. **Revoke access** stops the scan and removes its website permission; existing results remain available for export until cleared.

## Website access and privacy

- Permission is requested for the selected website when you start. There is no installation-time access to every website. Chrome host permissions span ports, while the crawler enforces the selected page's exact origin, including its port.
- Pages are fetched with cookies and credentials omitted, without sending a referrer. The extension reads public HTML responses rather than the contents of your signed-in tab.
- `robots.txt` is checked before collection. Generic `*` and ContactHunter-specific restrictions are both applied conservatively. Rules support allow/disallow, wildcards, end anchors, and crawl delays. Rules are refreshed after a pause of 15 minutes or longer.
- A missing `robots.txt` (404 or 410) permits public-page crawling. Other robot-file errors, redirects, oversized rules, or unreachable rules prevent scanning. Redirects on pages are also skipped.
- Requests run one at a time, at least 1.5 seconds apart, or slower when `Crawl-delay` requires it. HTTP 401, 403, 429, and 503 responses stop the scan.
- Page-level robots meta tags and `X-Robots-Tag` headers are honored. `noindex`, `noarchive`, `nosnippet`, or `none` prevent contact collection; `nofollow` prevents link discovery. Individual nofollow and download links are skipped.
- Authentication, account, admin, checkout, and other sensitive URL paths are excluded. Pages containing password fields are skipped. Forms, scripts, frames, templates, and explicitly hidden content are excluded from extraction. Website scripts and assets are never inserted into the extension's live document.
- No analytics, external API, cloud upload, or server-side contact storage is used. ContactHunter only makes page requests to the selected website. CSV export is user initiated.

Contacts, sources, and crawl checkpoints are kept in `chrome.storage.session`, surviving popup closure and service-worker suspension. They are cleared when Chrome restarts or the extension is reloaded, updated, or disabled. Only duration and page-limit preferences use persistent local storage. CSV files you export remain on your device until you remove them.

Public availability is not permission for unrestricted reuse. Use ContactHunter only where you are authorized to collect information, and respect website terms and applicable privacy obligations. Access checks are technical safeguards; the extension does not determine consent or legal permission to use a contact.

## Scope and limits

- Scans the selected origin, without visiting subdomains or external websites.
- Crawls linked public HTML. It does not execute JavaScript, submit forms, discover unlinked pages, bypass authentication/CAPTCHAs, parse PDFs, or decode deliberately obscured contacts. CSS-based visibility beyond explicit hidden attributes and inline styles is not evaluated.
- Only `page`, `p`, `lang`, and `hl` query parameters are accepted. Common tracking parameters and fragments are removed; other query-string URLs are excluded to avoid private tokens and crawler traps.
- Email matching is case insensitive and supports common ASCII addresses. Phone matching normalizes formatting and retains extensions without guessing country codes. Phone candidates can include unrelated numeric identifiers; review results before use.
- Each scan checks at most 150 pages, discovers at most 500 URLs, and retains at most 1,000 unique contacts with up to 5 distinct source pages each. Page responses are limited to 2 MiB and robots files to 512 KiB; individual requests time out after 12 seconds or when scan time expires.
- The popup displays up to 150 contacts matching the current filter. CSV includes all retained contacts, regardless of the filter, with one row per retained source URL. Formula-like values are prefixed with an apostrophe for spreadsheet safety.
- A scan may finish before its selected duration if eligible pages run out or a limit or access restriction is reached.

## Project structure

```text
manifest.json           Extension configuration and permissions
background.js           Commands, Chrome APIs, checkpoints, and recovery
content.js              Inert HTML parsing and public-content extraction
lib/
  crawler.js            Timed crawl queue and scan controls
  contacts.js           Contact matching, normalization, and deduplication
  robots.js             Crawl rules and page directives
  urls.js               URL normalization and scope restrictions
  network.js            Bounded, credential-free page fetching
  csv.js                CSV formatting and formula protection
offscreen/              Hidden HTML parser document
popup/                  Interface, live results, filtering, and export
```

To check JavaScript syntax with Node.js installed, run `npm run check`. No package installation is needed. Browser UI and installation behavior have not been verified in this environment.

Implementation references: [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage), and [robots exclusion protocol](https://www.rfc-editor.org/rfc/rfc9309.html).
