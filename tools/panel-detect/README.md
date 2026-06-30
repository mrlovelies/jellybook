# Panel detection — guided-view maps

Offline tool that generates **panel maps** for the Jellybook guided-view reader.
Detection is deterministic image processing (Kumiko / OpenCV) — no LLM, no vision
model, no fabrication risk. It runs once per file; the Jellybook Jellyfin plugin
serves the resulting maps to the reader, which pans a camera panel-to-panel.

## How it works

For each `.cbz` it extracts the pages, runs Kumiko panel segmentation, and writes a
sidecar `"<comic>.cbz.panels.json"` next to the file. Splash pages and double-page
spreads are detected and marked `fallback` (the reader shows the whole page) because
a splash is meant to be seen whole and Kumiko over-segments them.

Panel maps are **universal per file** — identical for everyone who owns that exact
release — so they're a precompute-once artifact, like the continuity dataset.

## Setup

```sh
cd tools/panel-detect
git clone https://github.com/njean42/kumiko        # -> ./kumiko
python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Usage

```sh
.venv/bin/python detect_panels.py /mnt/raid/Comics          # whole library
.venv/bin/python detect_panels.py "/path/to/one issue.cbz"  # single file
#   --rtl    manga right-to-left reading order
#   --force  rewrite existing sidecars
```

## Sidecar schema (`<comic>.cbz.panels.json`)

```json
{
  "version": 1,
  "file": "Absolute Batman ... Issue 015.cbz",
  "page_count": 24,
  "rtl": false,
  "trusted_pages": 22,
  "pages": [
    {
      "index": 0,
      "w": 1988, "h": 3057,
      "fallback": false,
      "panels": [[x, y, w, h], ...]   // normalized 0..1, in reading order
    },
    { "index": 3, "w": 3975, "h": 3057, "fallback": true, "panels": [] }
  ]
}
```

Reader contract: for a page, if `fallback` is false and `panels` is non-empty, run
guided view (scale each normalized box to the rendered page, pan box-to-box in order).
Otherwise show the whole page.
