#!/usr/bin/env python3
"""
detect_panels.py — generate guided-view panel maps for Jellybook.

For every .cbz under a path, detect per-page panel boxes with Kumiko and write a
sidecar "<comic>.cbz.panels.json" next to the file. The Jellybook Jellyfin plugin
serves these maps to the reader, which pans a camera box-to-box (guided view).

Splash pages and double-page spreads fall back to a single full-page panel: the
reader then just shows the whole page. A splash is meant to be seen whole, and
Kumiko over-segments them (the "HAHAHA" credits spread split into letter shards in
testing), so we detect the untrustworthy cases and decline rather than guess.

Panel coords are normalized [x, y, w, h] in 0..1 — resolution-independent, so the
reader scales them to whatever size it renders the page at.

Setup:
    git clone https://github.com/njean42/kumiko   # into this dir -> ./kumiko
    python -m venv .venv && .venv/bin/pip install -r requirements.txt
Usage:
    python detect_panels.py /path/to/Comics [--rtl] [--force]
    python detect_panels.py "/path/to/one issue.cbz"
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Must match the server's ComicArchive.ImageExtensions (incl. .avif) or page sets diverge.
IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif")
SCHEMA_VERSION = 1


def _natkey(name):
    """Natural sort matching the server's NaturalComparer (numeric runs compared as
    numbers, text case-insensitively) — otherwise '10.jpg' < '2.jpg' and the sidecar's
    page indices wouldn't line up with how the plugin streams pages."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]

# Fallback thresholds — when tripped, the page becomes a single full-page panel.
SPREAD_ASPECT = 1.2     # w/h above this is a double-page spread
OVERLAP_FRAC = 0.10     # pairwise panel overlap above this fraction of the page = noise
COVERAGE_MAX = 1.25     # summed panel area above this x page = over-segmentation
DOMINANT_FRAC = 0.85    # one panel covering more than this (with others) = splash + debris


def find_kumiko():
    for c in (HERE / "kumiko" / "kumiko", HERE / "kumiko"):
        if c.is_file():
            return c
    sys.exit("Kumiko not found. Run: git clone https://github.com/njean42/kumiko "
             "(into tools/panel-detect/kumiko)")


def page_images(cbz, dest):
    """Extract image entries from a CBZ in archive (page) order -> ordered paths."""
    with zipfile.ZipFile(cbz) as z:
        names = sorted((n for n in z.namelist()
                        if n.lower().endswith(IMG_EXTS) and not n.endswith("/")),
                       key=_natkey)
        paths = []
        for i, n in enumerate(names):
            p = dest / f"{i:04d}{os.path.splitext(n)[1].lower()}"
            with z.open(n) as src, open(p, "wb") as f:
                f.write(src.read())
            paths.append(p)
        return paths


def run_kumiko(kumiko, img_dir, rtl):
    out = img_dir / "_kumiko.json"
    cmd = [sys.executable, str(kumiko), "-i", str(img_dir), "-o", str(out)]
    if rtl:
        cmd.append("--rtl")
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.load(open(out))


def _overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ox = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    oy = max(0, min(ay + ah, by + bh) - max(ay, by))
    return ox * oy


def trust(panels, w, h):
    """Whether Kumiko's panels are reliable. False -> fall back to the whole page."""
    if not panels or w <= 0 or h <= 0:
        return False
    area = w * h
    if w / h > SPREAD_ASPECT:                                  # double-page spread
        return False
    if sum(pw * ph for _, _, pw, ph in panels) > COVERAGE_MAX * area:  # over-segmented
        return False
    ov = sum(_overlap(panels[i], panels[j])
             for i in range(len(panels)) for j in range(i + 1, len(panels)))
    if ov > OVERLAP_FRAC * area:                               # boxes pile up on each other
        return False
    if len(panels) > 1 and max(pw * ph for _, _, pw, ph in panels) > DOMINANT_FRAC * area:
        return False                                           # splash + debris boxes
    return True


def normalize(panels, w, h):
    return [[round(x / w, 5), round(y / h, 5), round(pw / w, 5), round(ph / h, 5)]
            for x, y, pw, ph in panels]


def detect(cbz, kumiko, rtl):
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        imgs = page_images(cbz, d)
        if not imgs:
            return None
        by_name = {os.path.basename(p["filename"]): p for p in run_kumiko(kumiko, d, rtl)}
        pages = []
        for i, img in enumerate(imgs):
            p = by_name.get(img.name)
            if not p:
                pages.append({"index": i, "fallback": True, "panels": []})
                continue
            w, h = p["size"]
            raw = p.get("panels", [])
            ok = trust(raw, w, h)
            pages.append({"index": i, "w": w, "h": h, "fallback": not ok,
                          "panels": normalize(raw, w, h) if ok else []})
    trusted = sum(1 for p in pages if not p["fallback"])
    return {"version": SCHEMA_VERSION, "file": cbz.name, "page_count": len(pages),
            "rtl": rtl, "trusted_pages": trusted, "pages": pages}


def main():
    ap = argparse.ArgumentParser(description="Generate Jellybook guided-view panel maps.")
    ap.add_argument("path", help="comics library dir, or a single .cbz")
    ap.add_argument("--rtl", action="store_true", help="manga right-to-left reading order")
    ap.add_argument("--force", action="store_true", help="rewrite existing sidecars")
    args = ap.parse_args()

    kumiko = find_kumiko()
    root = Path(args.path)
    cbzs = [root] if root.suffix.lower() == ".cbz" else sorted(root.rglob("*.cbz"))
    if not cbzs:
        sys.exit(f"No .cbz found under {root}")
    if root.is_dir():
        cbr = list(root.rglob("*.cbr"))
        if cbr:
            print(f"note: skipping {len(cbr)} .cbr file(s) — not supported by this tool yet "
                  "(reader serves them, but guided view falls back to full pages)")

    for cbz in cbzs:
        sidecar = cbz.parent / (cbz.name + ".panels.json")
        if sidecar.exists() and not args.force:
            print("skip (exists):", cbz.name)
            continue
        try:
            result = detect(cbz, kumiko, args.rtl)
        except subprocess.CalledProcessError as e:
            print("FAIL (kumiko)", cbz.name, "-", (e.stderr or "")[-160:])
            continue
        except (zipfile.BadZipFile, OSError) as e:
            # A corrupt/partial .cbz (or a .cbr misnamed) must not halt the whole run.
            print("FAIL (bad archive)", cbz.name, "-", e)
            continue
        except Exception as e:
            print("FAIL", cbz.name, "-", type(e).__name__, e)
            continue
        if not result:
            print("no images:", cbz.name)
            continue
        json.dump(result, open(sidecar, "w"))
        print(f"{cbz.name}: {result['trusted_pages']}/{result['page_count']} pages with panels")


if __name__ == "__main__":
    main()
