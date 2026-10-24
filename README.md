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
6. Search or filter contacts, copy individual values, or select **Review export** to open the export review. Uncheck unwanted contacts, search or filter the review, and use **Select matching**, **Select all**, or **Clear selection** to adjust the download. All captured contacts can be reviewed in pages of 50, including their retained source URLs. **Show selected only** previews the included contacts.
7. Select **Download CSV** to export only the checked contacts. The review shows both the unique contact count and the CSV row count (one row per source). **Cancel** or Escape closes review without downloading or deleting results.

Export review captures the contacts and sources available when it opens. A live scan can continue, but newer contacts and source updates are excluded from that download; close and reopen review to include them. Selections reset when the review closes. The main results filters do not limit the review's initial snapshot. Clearing results or replacing the scan closes an open review.

The scan continues when you close the popup. Only one scan runs at a time. Starting a new scan replaces previous results. **Clear results** stops an active scan and removes its contacts and activity. **Revoke access** stops the scan and removes its website permission; existing results remain available for export until cleared.

## Scan history

Open **Scan history** and turn on **Save finished scans on this device** to retain future finished scans across browser restarts. History is disabled by default. Completed, stopped, blocked, and failed scans are saved with their collected contacts, source URLs, site, timestamp, page counts, and completion reason. In-progress and paused scans are not archived. Incognito scans are never saved to history.

- Choose automatic deletion after **1, 7, or 30 days**, measured from each scan's finish time. The default is 7 days. Changing retention also updates existing entries and immediately removes entries that are now expired.
- Search saved websites and choose **Review & export** to view contacts and select a CSV download. Opening history does not replace or interrupt a live scan. A saved scan cannot resume crawling.
- Use **Delete** on an entry or **Delete all history** to remove saved copies. **Clear results** clears only the current session's results. Turning history saving off stops future saving; existing saved copies remain until expiry or deletion.
- History is stored locally in this Chrome profile, without cloud sync or uploads. It retains up to **20 scans** within a **4 MiB** budget; oldest entries are removed when either limit is reached. Complete contact sets are preserved rather than silently truncated. A history storage failure is shown without discarding the current scan's results.
- Expired entries are removed by a scheduled Chrome alarm or on the next history access/startup. Cleanup resumes when Chrome runs again. Deleted or expired saved scans cannot be reopened for export, and their open review is closed when history updates.

## Website access and privacy

- Permission is requested for the selected website when you start. There is no installation-time access to every website. Chrome host permissions span ports, while the crawler enforces the selected page's exact origin, including its port.
- Pages are fetched with cookies and credentials omitted, without sending a referrer. The extension reads public HTML responses rather than the contents of your signed-in tab.
- `robots.txt` is checked before collection. Generic `*` and ContactHunter-specific restrictions are both applied conservatively. Rules support allow/disallow, wildcards, end anchors, and crawl delays. Rules are refreshed after a pause of 15 minutes or longer.
- A missing `robots.txt` (404 or 410) permits public-page crawling. Other robot-file errors, redirects, oversized rules, or unreachable rules prevent scanning. Redirects on pages are also skipped.
- Requests run one at a time, at least 1.5 seconds apart, or slower when `Crawl-delay` requires it. HTTP 401, 403, 429, and 503 responses stop the scan.
- Page-level robots meta tags and `X-Robots-Tag` headers are honored. `noindex`, `noarchive`, `nosnippet`, or `none` prevent contact collection; `nofollow` prevents link discovery. Individual nofollow and download links are skipped.
- Authentication, account, admin, checkout, and other sensitive URL paths are excluded. Pages containing password fields are skipped. Forms, scripts, frames, templates, and explicitly hidden content are excluded from extraction. Website scripts and assets are never inserted into the extension's live document.
- No analytics, external API, cloud upload, or server-side contact storage is used. ContactHunter only makes page requests to the selected website. CSV export is user initiated.

Current contacts, sources, and crawl checkpoints are kept in `chrome.storage.session`, surviving popup closure and service-worker suspension. They are cleared when Chrome restarts or the extension is reloaded, updated, or disabled. Duration and page-limit preferences, history preferences, and any opted-in saved history use persistent `chrome.storage.local`. Local extension storage is restricted to trusted extension contexts. Saved history survives restarts and extension reloads until its retention limit or manual deletion. CSV files you export remain on your device until you remove them.

Public availability is not permission for unrestricted reuse. Use ContactHunter only where you are authorized to collect information, and respect website terms and applicable privacy obligations. Access checks are technical safeguards; the extension does not determine consent or legal permission to use a contact.

## Scope and limits

- Scans the selected origin, without visiting subdomains or external websites.
- Crawls linked public HTML. It does not execute JavaScript, submit forms, discover unlinked pages, bypass authentication/CAPTCHAs, parse PDFs, or decode deliberately obscured contacts. CSS-based visibility beyond explicit hidden attributes and inline styles is not evaluated.
- Only `page`, `p`, `lang`, and `hl` query parameters are accepted. Common tracking parameters and fragments are removed; other query-string URLs are excluded to avoid private tokens and crawler traps.
- Email matching is case insensitive and supports common ASCII addresses. Phone detection uses formatting and nearby phone labels, excludes common dates, IP addresses, URLs, email addresses, and labeled identifiers, and accepts explicit `tel:` links. It supports `+`/`00` international prefixes, common optional `(0)` trunk prefixes, extensions, numeric telephone-link contexts, and Arabic/Persian/full-width digits. Unformatted local numbers require a phone label or telephone link. Country codes are not guessed for local numbers. These offline checks do not verify every national numbering plan or whether a number is assigned or reachable; review candidates before use.
- Each scan checks at most 150 pages, discovers at most 500 URLs, and retains at most 1,000 unique contacts with up to 5 distinct source pages each. Page responses are limited to 2 MiB and robots files to 512 KiB; individual requests time out after 12 seconds or when scan time expires.
- The main results list displays up to 150 contacts matching the current filter. Export review provides access to all captured contacts and exports only selected contacts, with one row per retained source URL. Formula-like values are prefixed with an apostrophe for spreadsheet safety.
- A scan may finish before its selected duration if eligible pages run out or a limit or access restriction is reached.

## Project structure

```text
manifest.json           Extension configuration and permissions
background.js           Commands, Chrome APIs, checkpoints, and recovery
content.js              Inert HTML parsing and public-content extraction
lib/
  crawler.js            Timed crawl queue and scan controls
  contacts.js           Contact matching, normalization, and deduplication
  phones.js             Context-aware phone extraction and formatting checks
  history.js            Opt-in archives, retention, deletion, and storage limits
  robots.js             Crawl rules and page directives
  urls.js               URL normalization and scope restrictions
  network.js            Bounded, credential-free page fetching
  csv.js                CSV formatting and formula protection
offscreen/              Hidden HTML parser document
popup/                  Interface, live results, history, and export review
```

To check JavaScript syntax with Node.js installed, run `npm run check`. No package installation is needed. Browser UI and installation behavior have not been verified in this environment.

Implementation references: [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage), and [robots exclusion protocol](https://www.rfc-editor.org/rfc/rfc9309.html).
