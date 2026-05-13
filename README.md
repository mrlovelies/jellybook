# Jellybook

A comic book reader for Jellyfin that doesn't feel like an afterthought.

Jellyfin's built-in book support — and the community Bookshelf plugin that fills the metadata gap — get the basics done for ebooks. Comics are a different story: the default reader is single-page, fit-to-viewport, no preload, no display modes, no manga support. Jellybook replaces that with a real comic reader, while leaving Bookshelf in charge of ebooks where it already does the job.

## Features

- **CBZ + CBR** support (RAR3/4; RAR5 falls back gracefully — transcode to CBZ)
- **Three display modes** — single fit-to-screen, single fit-to-width (scroll vertically), two-page spread
- **Wide-page auto-detect** in two-page mode — covers and double-page spreads render alone instead of squishing to half-width
- **Manga (right-to-left) reading mode** — flips click zones, arrow keys, and page order in two-page mode
- **Progress sync** via Jellyfin's standard UserData, so progress badges show up in the library view for free and cross-device resume works
- **Neighbor preloading** for snappy page navigation
- **Keyboard shortcuts** — arrows, space, PageUp/PageDown, Home/End, `m` (cycle view mode), `r` (toggle reading direction), Esc
- **Play button hijack** — clicking the standard Jellyfin Play (▶) on a comic opens Jellybook instead of the basic Bookshelf reader. One obvious "open" affordance.

## Install

1. Download the latest `jellybook-X.Y.Z.zip` from the releases page (or build from source — see below).
2. In Jellyfin: **Dashboard → Plugins → Install from disk → select the zip**.
3. Restart Jellyfin.
4. **One-time host setup:** Jellybook needs write access to `jellyfin-web/index.html` to inject its script. On most installs that means:
   ```bash
   sudo chown jellyfin:jellyfin /usr/share/jellyfin/web/index.html
   ```
   Re-run this after any `apt upgrade jellyfin-web` — package upgrades reset ownership.
5. Restart Jellyfin once more. You should see "Jellybook: injected script tag into index.html" in the server log.

No configuration required. Reader preferences (view mode, reading direction) persist per-user via browser localStorage.

## Compatibility

- **Jellyfin** 10.11.x (built against 10.11.8, targets `targetAbi 10.11.0.0`)
- **Clients reached:** Jellyfin web (browser) + Jellyfin Android (webview-based UI). iOS Swiftfin is not reachable via plugin injection — a native iOS companion app is on the roadmap.
- **Coexists with:** Bookshelf, Comic Vine, Google Books plugins. Recommended setup: install all three for full metadata + Bookshelf handles EPUB reading.

## Build from source

Requires .NET 9 SDK.

```bash
git clone <repo-url> jellybook
cd jellybook
bash scripts/package.sh        # produces dist/jellybook-X.Y.Z.zip
```

For active development against a remote Jellyfin server:

```bash
bash scripts/setup-razer.sh    # one-time: chown index.html on the host
bash scripts/deploy-razer.sh   # build → scp DLL → restart jellyfin
```

The deploy script targets the host hard-coded at the top — adjust for your own server.

## Architecture

Two halves, one DLL:

- **Server plugin (C# / .NET 9, `src/Jellybook.Server/`).** Patches `jellyfin-web/index.html` on startup to inject a `<script>` tag pointing at our embedded JS bundle. Exposes API endpoints for manifest, page streaming (CBZ/CBR), full EPUB stream (for future iOS client), and progress (round-trips through Jellyfin's `UserItemData`).
- **Web bundle (vanilla JS, `src/Jellybook.Web/main.js`).** Embedded into the DLL as a resource and served at `/Jellybook/web/main.js`. Polls for Jellyfin's book detail page, injects a Read button, hijacks the Play button, renders the reader overlay.

Same `index.html` patching trick the Jellyscrub plugin uses. Re-applied on every plugin startup; survives our own upgrades but `apt upgrade jellyfin-web` will clobber the patch (server restart re-applies it).

## Roadmap

- **iOS companion app** (`jellybook-ios`, separate repo). Native SwiftUI universal app — iPhone tuned for ebooks (foliate-js in WKWebView), iPad tuned for comics (native canvas, two-page spread). Reuses this plugin's API endpoints unchanged.
- Continuous (webtoon) scroll mode
- Folder cover mosaics — auto-composited 2×2 from child book covers, so series and genre folders stop looking empty
- AI features — page summarization, semantic search inside a book

## Acknowledgements

- The plugin-injects-script-into-jellyfin-web pattern is borrowed from [Jellyscrub](https://github.com/nicknsy/jellyscrub).
- Comic and ebook metadata in the screenshots come from the [Bookshelf](https://github.com/jellyfin/jellyfin-plugin-bookshelf) and [Comic Vine](https://github.com/jellyfin/jellyfin-plugin-comicvine) plugins.
- [SharpCompress](https://github.com/adamhathcock/sharpcompress) handles ZIP and RAR extraction on the server.

## License

GPLv3. See [LICENSE](./LICENSE).
