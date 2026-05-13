#!/usr/bin/env bash
# Build a Jellyfin-installable .zip ready for Dashboard → Plugins → "Install from disk".
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

VERSION="0.1.0.0"
GUID="bf366625-1c5f-44b1-b1f2-6a54406a814b"
TARGET_ABI="10.11.0.0"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

DIST="$ROOT/dist"
STAGE="$DIST/stage"

rm -rf "$DIST"
mkdir -p "$STAGE"

# Build the plugin
bash "$ROOT/scripts/build.sh" >/dev/null

# Stage the DLLs we ship (our own + 3rd-party deps not in Jellyfin's bin)
cp "$ROOT/build/Jellybook.Server.dll" "$STAGE/"
cp "$ROOT/build/SharpCompress.dll" "$STAGE/"

# Write the plugin manifest
cat > "$STAGE/meta.json" <<EOF
{
  "category": "Books",
  "name": "Jellybook",
  "description": "Comic book reader for Jellyfin with multiple display modes, wide-page auto-detect, manga (right-to-left) mode, and progress sync via Jellyfin UserData.",
  "overview": "Comic book reader",
  "owner": "Alex Somerville",
  "guid": "$GUID",
  "targetAbi": "$TARGET_ABI",
  "version": "$VERSION",
  "timestamp": "$TIMESTAMP",
  "changelog": "v0.1.0 — initial release. CBZ/CBR support, three display modes (single-fit, single-width, two-page spread), wide-page auto-detect, manga RTL mode, progress sync, Play button hijack so there is one obvious 'open' button. EPUB delegates to the existing Bookshelf plugin."
}
EOF

# Compute the MD5 of the zip contents (Jellyfin manifest expects checksum, though install-from-disk doesn't enforce)
ZIP="$DIST/jellybook-$VERSION.zip"
( cd "$STAGE" && zip -q -r "$ZIP" . )
rm -rf "$STAGE"

CHECKSUM=$(md5 -q "$ZIP" 2>/dev/null || md5sum "$ZIP" | awk '{print $1}')
SIZE=$(stat -f%z "$ZIP" 2>/dev/null || stat -c%s "$ZIP")

echo "Packaged: $ZIP"
echo "  version:  $VERSION"
echo "  size:     ${SIZE} bytes"
echo "  md5:      $CHECKSUM"
echo
echo "Install via Jellyfin Dashboard → Plugins → 'Install from disk' → upload this zip."
