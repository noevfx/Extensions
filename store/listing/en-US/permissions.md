# Permission justifications — Edge Add-ons / Chrome Web Store

Paste these into the privacy / permissions fields.

---

## Single purpose

> Detect the media that the page the user is visiting already loads, and save it
> to a folder of the user's choice, using a companion app that runs locally on
> the user's own computer.

---

## `<all_urls>` — host permissions

> Needed to detect video players on any site the user visits. The extension reads
> only media URLs (`.m3u8`, `.mpd`, `.mp4`, `.webm`), the tab title and the video
> thumbnail. It does not read page content, browsing history or other tabs.

---

## `cookies`

> Used to reach the same content the user is already watching when the video
> requires their own login. Cookies of the visited site are sent **only** to the
> local app at `127.0.0.1:8765`, written to a temporary file and deleted when the
> download finishes. No cookie is sent to external servers or stored permanently.
> The user can disable this in Settings.

---

## `webRequest`

> Needed to observe media requests and identify the stream used by the page
> player (HLS/DASH/MP4). The filter is limited to media file extensions and to
> the `media` request type.

---

## `storage`

> Stores local preferences: destination folder, theme, icon position per site and
> the list of videos found in the current tab.

---

## `tabs` / `activeTab`

> Identify the active tab to list the videos found there and to refresh detection
> when the user asks.

---

## `contextMenus`

> Provide the right-click actions (save video, save all, toggle the on-video icon,
> open the downloads folder).

---

## Data usage declaration

- [x] Does **not** collect personal data for sale
- [x] Does **not** use data for purposes unrelated to the single purpose
- [x] Does **not** use data to determine creditworthiness
- [x] Data goes only to the user's local app (`127.0.0.1`)

Privacy policy URL:
`https://github.com/noevfx/Extensions/blob/main/PRIVACY.md`

Support contact: **labs@noevfx.com**
