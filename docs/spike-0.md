# Spike 0 — Plugin injection mechanism

**Goal:** Prove that a Jellyfin plugin can inject a script into `jellyfin-web` and add a UI element to book detail pages.

## Outcome: validated 2026-05-12

End-to-end chain confirmed working against Jellyfin 10.11.8 on the Razer:

1. C# plugin (`Jellybook.Server.dll`) is discovered and loaded from `/var/lib/jellyfin/plugins/Jellybook_0.0.1.0/`.
2. `IndexInjector` (registered via `IPluginServiceRegistrator` → `IHostedService`) runs at startup and rewrites `/usr/share/jellyfin/web/index.html` to add `<script defer src="/Jellybook/web/main.js">` before `</body>`, wrapped in idempotent markers.
3. `JellybookController` serves the JS bundle from an embedded resource at `/Jellybook/web/main.js`.
4. `main.js` polls for the details-page DOM, queries the item via `window.ApiClient`, and appends a "Read" button to the action bar when `item.Type === 'Book'`.

## Required host setup

`index.html` ships as `root:root 644`. The plugin runs as `jellyfin` and cannot write to it. One-time fix:

```bash
sudo chown jellyfin:jellyfin /usr/share/jellyfin/web/index.html
```

Captured in `scripts/setup-razer.sh`. **Re-run after any `apt upgrade jellyfin-web`** — package updates restore root ownership.

## Known fragility

- **Web client upgrades clobber the patch.** Plugin re-patches on every Jellyfin restart, so this only matters if the user upgrades jellyfin-web without restarting the server.
- **Polling-based DOM injection** (500ms tick) — works, but a `MutationObserver` on the details container will be cleaner in Spike 1.
- **Selector compatibility.** Currently tries `.detailButtons-content`, `.detailButtons`, `.mainDetailButtons` in that order. The set of valid selectors may need expansion as Jellyfin's web client evolves.

## Next: Spike 1

Build the actual CBZ reader. Architecture:

- Server: `GET /Jellybook/Book/{id}/Manifest` (page count + ComicInfo.xml), `GET /Jellybook/Book/{id}/Page/{n}` (streams page from CBZ).
- Web: fullscreen overlay, canvas-based image renderer, keyboard navigation, single-page mode only.

No progress sync, no display modes, no CBR — that's Spike 2.
