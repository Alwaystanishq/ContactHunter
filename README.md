# ContactHunter

- A Chrome extension for discovering publicly available email addresses and phone numbers on websites.
- Crawls eligible internal pages for a selected duration, removes duplicate contacts, and displays results as scanning progresses.
- Includes export review, CSV downloads, and optional local scan history.
- Built with Chrome Manifest V3, JavaScript, HTML, and CSS.
- Runs locally without a backend, API keys, external services, or a build step.

## Features

### Website scanning

- Start a scan from the website open in your active tab.
- Automatically discover links and crawl eligible pages on the same origin: scheme, hostname, and port.
- Prioritize likely contact pages, including contact, about, team, support, legal, and similar URLs.
- Choose a scan duration of **30 seconds, 1 minute, 2 minutes, 5 minutes, or 10 minutes**.
- Choose a page limit of **25, 50, 100, or 150 pages**.
- Use **2 minutes** and **100 pages** as the default settings.
- Save duration and page-limit preferences for future use.
- Run one scan at a time.
- Continue scanning when the popup closes.
- Save crawl checkpoints in session storage and recover work after service-worker suspension.
- Finish automatically when the duration expires, the page/contact limit is reached, eligible pages run out, or an access restriction stops the scan.

### Scan controls

- **Start scanning:** check website restrictions and begin collecting public contacts.
- **Pause scan:** cancel the current request, preserve the queue, and freeze the remaining scan time.
- **Resume scan:** continue a paused scan from its saved queue.
- **Stop:** end scanning and retain the contacts collected so far.
- **Clear results:** stop active work and remove the current session's contacts and scan activity.
- **Revoke access:** stop scanning and remove the extension's permission for the scanned website.

### Live progress and results

- Display the target website and current scan status.
- Show elapsed time, selected duration, and a progress bar.
- Display the page currently being processed.
- Update email, phone, and successfully scanned page counts live.
- Show queued and skipped page counts.
- View recent scan activity, skipped-page explanations, access errors, and completion reasons.
- See scanning or paused status on the extension's toolbar badge.
- Search discovered contacts by value or source URL.
- Filter results by **All**, **Emails**, or **Phones**.
- Copy individual contacts to the clipboard.
- Open source pages from contact results.
- Display up to 150 matching contacts in the main list; review all retained contacts through export review.

### Email detection

- Extract email addresses from public page text and `mailto:` links.
- Decode percent-encoded recipients in mail links.
- Support multiple mail-link recipients and plus-addressed emails.
- Normalize email casing for duplicate removal.
- Reject common malformed addresses and invalid domain formatting.
- Retain the first discovery timestamp and up to five distinct source URLs per contact.

### Phone detection

- Extract candidates from public text and explicit `tel:` links.
- Use nearby labels such as phone, mobile, telephone, fax, WhatsApp, and hotline to identify phone-like values.
- Support labels appearing in a preceding text node or on the previous line.
- Normalize spaces, hyphens, periods, and parentheses in phone formatting.
- Recognize `+` and `00` international prefixes.
- Remove optional `(0)` trunk prefixes for selected international calling codes.
- Support extensions written with `ext`, `extn`, `extension`, `x`, `#`, or telephone-link `;ext=` parameters.
- Resolve numeric `phone-context` prefixes in telephone links.
- Normalize Arabic, Persian, and full-width digits.
- Apply basic structural checks to international `+1` numbers.
- Filter common dates, date ranges, IP addresses, URLs, email addresses, repeated-digit values, and labeled numeric identifiers.
- Require a phone label or telephone link for unformatted local numbers.
- Deduplicate equivalent normalized phone representations while keeping different extensions distinct.
- Keep detection entirely offline, without sending contacts to a validation service.

### Review before export

- Open **Review export** before downloading a CSV.
- Review a snapshot of contacts and source URLs captured when the review opens.
- Select or exclude individual contacts using checkboxes.
- Search contacts and sources within the review.
- Filter by email or phone type.
- Use **Select matching**, **Select all**, or **Clear selection** for bulk changes.
- Select matching contacts across all review pages, including matches outside the visible page.
- Use **Show selected only** to inspect the included contacts.
- Browse all captured contacts in pages of 50.
- View every retained source URL for each contact.
- See selected contact counts, email/phone counts, and the resulting CSV row count.
- Keep incoming contacts and source updates out of an already-open review; reopen it to capture newer results.
- Cancel or press Escape to leave the review without downloading.
- Reset the selection when the review closes; exclusions affect the download rather than deleting collected contacts.

### CSV export

- Download only the contacts checked in export review.
- Include **Type**, **Value**, **Source URL**, and **Found at (UTC)** columns.
- Write one row for each retained source URL, so a contact with multiple sources has multiple rows.
- Export UTF-8 CSV with a byte-order mark and CRLF line endings.
- Escape quotes and delimiters in CSV fields.
- Prefix formula-like values with an apostrophe for spreadsheet safety.
- Generate filenames containing the website hostname and export date.
- Create downloads locally using browser Blob URLs, without an export server.

### Optional scan history

- Keep history **disabled by default**.
- Enable **Save finished scans on this device** to retain future finished scans.
- Save completed, stopped, blocked, and failed scans with their available contacts.
- Store site details, finish time, completion reason, duration, page counts, contacts, and source URLs.
- Preserve saved history across Chrome restarts and extension reloads.
- Search history by website or scan status.
- Open saved contacts with **Review & export** without replacing the live scan.
- Choose automatic deletion after **1, 7, or 30 days**; the default is **7 days**.
- Apply retention changes to existing entries and remove entries that are now expired.
- Delete a single saved scan or use **Delete all history**.
- Retain up to **20 scans** within a **4 MiB** history budget, removing the oldest entries when full.
- Preserve complete saved contact sets rather than silently truncating them.
- Exclude incognito scans from saved history.
- Show history-saving errors while keeping the current scan's results available.
- Stop future saving when history is disabled; existing entries remain until expiry or deletion.

### Interface and accessibility

- Use a compact, light-themed popup with clear scan controls and contact statistics.
- Review exports in a native modal dialog.
- Provide labeled controls, keyboard focus styles, live status messages, and accessible progress indicators.
- Respect reduced-motion preferences for interface animations.
- Show explanatory empty states and user-facing error messages.

## Technologies used

- **JavaScript ES modules:** extension logic, crawling, extraction, state handling, and UI interactions.
- **HTML5:** popup, export-review dialog, history controls, and offscreen document.
- **CSS3:** layouts, styling, progress indicators, dialog presentation, and reduced-motion support.
- **Chrome Manifest V3:** extension configuration and service-worker background execution.
- **Chrome Runtime API:** communication between the popup, service worker, and offscreen parser.
- **Chrome Tabs API:** identify the active website and validate the target tab.
- **Chrome Permissions API:** request and revoke website access at runtime.
- **Chrome Storage API:** session checkpoints, saved preferences, and optional local history.
- **Chrome Alarms API:** crawler recovery and scheduled history cleanup.
- **Chrome Offscreen API:** provide a hidden DOM-capable document for HTML parsing.
- **Chrome Action API:** toolbar popup and scan-status badges.
- **Fetch API and readable streams:** retrieve public HTML with response-size limits.
- **AbortController and AbortSignal:** interrupt requests on pause/stop and enforce request deadlines.
- **DOM APIs and inert HTML templates:** parse fetched HTML without inserting website content into the live extension document.
- **Regular expressions, Unicode normalization, Map, and Set:** detect, normalize, and deduplicate contacts.
- **Clipboard API:** copy individual contacts.
- **Blob and object URLs:** generate local CSV downloads.
- **Node.js and npm:** optional development tooling for JavaScript syntax checks.
- **Runtime dependencies:** none.

## Installation

1. Download or clone this project to your computer.
2. Open `chrome://extensions` in **Chrome 120 or later**.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder containing `manifest.json`.
6. Pin **ContactHunter** from Chrome's extensions menu.

- No `npm install`, compilation, API key, account, or backend setup is required.
- After editing extension files, click **Reload** on the extension card and reopen the popup.

## Usage

1. Open a public HTTP or HTTPS page on the website you want to scan.
2. Open ContactHunter, choose a duration and page limit, and click **Start scanning**.
3. Grant website access if Chrome prompts for it.
4. Monitor results and use Pause, Resume, or Stop as needed.
5. Click **Review export**, check the contacts to include, and choose **Download CSV**.
6. Optionally open **Scan history** and enable saving for future finished scans.

## Website restrictions and privacy

- Request access to the selected website when the user starts scanning; broad optional host patterns are not granted automatically at installation.
- Enforce the selected page's exact origin in the crawler, even though Chrome host permissions span ports.
- Fetch pages without cookies or credentials and without sending a referrer.
- Read public HTML responses rather than extracting content from the user's signed-in tab.
- Check `robots.txt` before scanning and conservatively apply both generic and ContactHunter-specific restrictions.
- Support robots allow/disallow rules, wildcards, end anchors, and crawl delays.
- Permit public-page scanning when `robots.txt` returns 404 or 410; stop when other errors or redirects prevent verification.
- Refresh crawl rules after a pause of 15 minutes or longer.
- Send one request at a time, at least 1.5 seconds apart, or slower when crawl-delay rules require it.
- Stop on HTTP 401, 403, 429, or 503 responses.
- Skip redirects rather than following them into another location.
- Honor page robots meta tags and `X-Robots-Tag` headers.
- Prevent collection for `noindex`, `noarchive`, `nosnippet`, or `none`; prevent link discovery for `nofollow`.
- Skip individual nofollow/download links and sensitive authentication, account, admin, checkout, and similar URL paths.
- Skip pages containing password fields.
- Exclude forms, scripts, frames, templates, and explicitly hidden content from extraction.
- Use trusted extension contexts for persistent extension storage.
- Make no analytics, cloud-sync, external validation, or contact-upload requests.
- Require user action to export contacts.
- Use ContactHunter only where collection is authorized, and respect website terms and applicable privacy obligations. Technical restrictions do not determine permission to reuse a contact.

## Storage and retention

- **Session storage:** current scan, contacts, sources, activity, and crawl checkpoints; survives popup closure and service-worker suspension.
- **Session cleanup:** current scan data clears when Chrome restarts or the extension is reloaded, updated, or disabled.
- **Persistent local storage:** duration/page-limit preferences, history settings, and saved scans when history is enabled.
- **History expiry:** scheduled cleanup or the next history access/startup removes expired entries; cleanup resumes when Chrome runs again.
- **Clear results:** removes current session results; use history deletion controls to remove saved copies.
- **Paused scans:** remain in the current browser session and are not archived as finished history.
- **Saved scans:** can be reviewed/exported but cannot resume crawling.
- **Exported CSV files:** remain on your device until you remove them separately.

## Limits and known limitations

- **Scan duration:** 30 seconds to 10 minutes; robots checks and request delays count toward active scan time.
- **Pages checked:** up to 150 per scan.
- **Discovered URLs:** up to 500 per scan.
- **Unique contacts:** up to 1,000 per scan.
- **Sources per contact:** up to 5 distinct URLs.
- **Main results display:** up to 150 matching contacts; export review can access the full retained set.
- **Export review:** 50 contacts per page.
- **HTML response size:** up to 2 MiB per page.
- **Robots response size:** up to 512 KiB.
- **Request timeout:** up to 12 seconds, or the remaining scan time if shorter.
- **History capacity:** up to 20 scans within 4 MiB.
- **Crawl scope:** linked pages on the selected origin; external sites, other subdomains, and unlinked pages are excluded.
- **Query parameters:** allow `page`, `p`, `lang`, and `hl`; strip common tracking parameters and fragments; exclude other query-string URLs.
- **Content scope:** public HTML only; JavaScript-rendered contacts, PDFs, and other documents are not processed.
- **Protected content:** no login, CAPTCHA, paywall, or access-control bypass; no form submissions.
- **Visibility detection:** handles explicit hidden attributes and common inline styles, but does not evaluate external stylesheets or all CSS visibility rules.
- **Email coverage:** common ASCII addresses; deliberately obscured addresses are not decoded.
- **Phone accuracy:** offline format/context checks, not comprehensive national numbering-plan or reachability validation; country codes are not guessed for local numbers.
- **Review freshness:** a review is a snapshot; reopen it to include newer contacts and sources.
- **Browser compatibility:** targets Chrome 120+; Firefox and Safari are not configured.
- **Verification status:** Chrome installation and UI behavior have not been verified in this development environment.

## Project structure

```text
ContactHunter/
├── manifest.json             Extension metadata, permissions, and security policy
├── background.js             Chrome API integration and background commands
├── content.js                Inert public-HTML parsing
├── package.json              Project metadata and syntax-check command
├── lib/
│   ├── contacts.js           Email extraction and contact deduplication
│   ├── phones.js             Phone extraction, context, and format checks
│   ├── crawler.js            Crawl queue, timing, and scan controls
│   ├── network.js            Bounded public-page fetching
│   ├── robots.js             Crawl rules and page directives
│   ├── urls.js               URL normalization and crawl scope
│   ├── csv.js                CSV generation and formula protection
│   └── history.js            Saved scans, retention, and deletion
├── offscreen/
│   ├── offscreen.html        Hidden parser document
│   └── offscreen.js          Parser messaging
└── popup/
    ├── popup.html            Main interface and export dialog
    ├── popup.css             Popup, review, and history styles
    ├── popup.js              Main UI and live scan updates
    ├── export-review.js      Selection and reviewed CSV downloads
    └── history.js            History settings and saved-scan interface
```
