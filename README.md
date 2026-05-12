# Jellybook

Comic book and ebook reader plugin for Jellyfin.

Status: **pre-alpha, private until v0.1**.

## What it is

A Jellyfin server plugin (C# / .NET 9) plus a vanilla TypeScript web bundle that injects a first-class reader into the Jellyfin web client. Targets Jellyfin 10.11.x.

- **Comics** (CBZ / CBR): custom canvas renderer with single / two-page / continuous-scroll modes
- **Ebooks** (EPUB): `foliate-js`-backed reader with themes, font controls, pagination
- **Progress sync** via Jellyfin's UserData API — free cross-device sync, no extra storage

## Layout

```
src/Jellybook.Server/      C# plugin (DLL deployed to Jellyfin's plugins dir)
src/Jellybook.Web/         JS/TS web bundle (compiled into the DLL as embedded resource)
scripts/build.sh           Compile plugin
scripts/setup-razer.sh     One-time host setup (chowns index.html so plugin can patch it)
scripts/deploy-razer.sh    Build + scp DLL + restart Jellyfin on the Razer
docs/                      Per-spike notes
```

## Dev loop

```bash
# one-time
bash scripts/setup-razer.sh

# each iteration
bash scripts/deploy-razer.sh
```

Browser hard-refresh (Cmd-Shift-R) to bust the cached `index.html`.
