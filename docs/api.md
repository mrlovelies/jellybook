# Jellybook server API

The Jellybook plugin exposes a small HTTP API for reading book content out of Jellyfin. The web bundle uses it directly; the planned iOS app consumes the same endpoints. **This is the contract between server and clients.** Breaking changes get a major version bump.

All endpoints are mounted under `/Jellybook/` on the Jellyfin server (e.g. `http://your-server:8096/Jellybook/...`).

## Authentication

All `/Book/*` endpoints require Jellyfin user authentication. Two forms accepted:

- **Header:** `Authorization: MediaBrowser Token="<jellyfin-token>"`
- **Query param:** `?api_key=<jellyfin-token>` — preferred for `<img>` src URLs since browsers won't send custom Authorization headers on image requests

Static web assets (`/web/main.js`) are anonymous so they can load before the user has authenticated.

Get a token via the standard Jellyfin auth flow (e.g. `POST /Users/AuthenticateByName`) or create one in Dashboard → API Keys.

---

## `GET /Jellybook/Hello`

Sanity check that the plugin is loaded.

**Auth:** anonymous.
**Response:** `200 OK`

```json
{ "name": "Jellybook", "status": "alive" }
```

---

## `GET /Jellybook/web/main.js`

The web client bundle (vanilla JS, ~18 KB). Injected into `jellyfin-web/index.html` automatically on plugin start. Native clients ignore this endpoint.

**Auth:** anonymous (since `index.html` loads before the user authenticates).

---

## `GET /Jellybook/Book/{itemId}/Manifest`

Returns metadata for a book item, including everything the client needs to render. Response shape branches on type.

**Auth:** required.

### Comic response (`type: "comic"`)

```json
{
  "id": "9756ce4c921e05e487102a9e5ead9929",
  "name": "Absolute Batman (2024) #1",
  "type": "comic",
  "format": "cbz",            // "cbz" | "cbr"
  "pageCount": 47,
  "pages": [
    {
      "index": 0,
      "fileName": "absolute-batman-001-001.jpg",
      "mimeType": "image/jpeg",
      "size": 2394114
    },
    // ...
  ]
}
```

Pages are enumerated by natural-sort of their archive entry paths. Image dimensions are not returned (client measures via `naturalWidth`/`naturalHeight` for wide-page detection).

### Ebook response (`type: "ebook"`)

```json
{
  "id": "c08711e17a600e890f8629ea45c76e17",
  "name": "The Assassin's Blade",
  "type": "ebook",
  "format": "epub",
  "size": 3654599
}
```

Client fetches the EPUB itself via `/Epub` (below) and renders client-side (epub.js on web, foliate-js in WKWebView on iOS).

### Errors

- `404` — item not found, or path missing on disk
- `400` — file format is not CBZ/CBR/EPUB
- `500` — archive could not be read (corrupt, RAR5 with no unrar lib, etc.)

---

## `GET /Jellybook/Book/{itemId}/Page/{pageIndex}`

Streams a single page image out of a CBZ or CBR archive.

**Auth:** required.
**Path:** `pageIndex` is 0-based.
**Response:** raw image bytes with `Content-Type: image/jpeg` (or png/webp/etc. per the archive entry).
**Caching:** `Cache-Control: private, max-age=3600`.

### Errors

- `404` — item not found OR page index out of range
- `400` — not a comic archive (EPUBs return `400` here, use `/Epub` instead)

---

## `GET /Jellybook/Book/{itemId}/Epub`

Streams the EPUB file. Supports HTTP Range requests so clients can seek without re-downloading.

**Auth:** required.
**Response:** `application/epub+zip` with `Content-Length` and `Accept-Ranges: bytes`.

### Errors

- `404` — item not found
- `400` — file is not an EPUB

---

## `GET /Jellybook/Book/{itemId}/Progress`

Read the current user's progress for a book.

**Auth:** required.
**Query:** `userId` (Jellyfin user GUID) — required.
**Response:**

```json
{
  "pageIndex": 15,
  "played": false,
  "lastPlayedDate": "2026-05-13T00:50:41.1924871Z"
}
```

### Interpretation

Progress is stored in Jellyfin's standard `UserItemData.PlaybackPositionTicks` field, which is a single integer. Clients interpret it per type:

- **Comics:** `pageIndex` is a 0-based page number, range `0 .. pageCount-1`.
- **Ebooks:** `pageIndex` is a basis-points percentage, range `0..9999` (so `pageIndex / 10000` gives the 0.0-1.0 fraction).

This convention means existing Jellyfin UserData consumers (read-progress badges in the library, "Continue Reading" rows, etc.) work for free.

---

## `POST /Jellybook/Book/{itemId}/Progress`

Save the current user's progress for a book.

**Auth:** required.
**Query:**

- `userId` (GUID, required)
- `pageIndex` (int, required) — interpreted per the convention above
- `pageCount` (int, required, must be > 0) — used to compute "played" (true when `pageIndex + 1 >= pageCount`) and to clamp `pageIndex`

For ebooks, pass `pageIndex = Math.floor(percentage * 10000)` and `pageCount = 10000`.

**Response:**

```json
{ "pageIndex": 15, "played": false }
```

---

## Client conventions

These aren't enforced by the server but should be honored by all clients for consistency:

1. **Throttle progress saves.** Debounce at ≥1 second after the last page change. Flush on close.
2. **Resume on open.** Always `GET /Progress` first; if `pageIndex > 0`, start there.
3. **Preload neighbors.** For comics, fetch `Page/N+1` (and `N+2` if in two-page mode) as soon as `Page/N` is displayed.
4. **Detect wide pages client-side.** Server doesn't return image dimensions in the manifest — measure `naturalWidth`/`naturalHeight` after load.
5. **Format detection:** trust `format` from the manifest, not file extension. Future formats (e.g. PDF) will be added here.
