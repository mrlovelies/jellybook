#!/usr/bin/env bash
# One-time host setup needed before deploying Jellybook to a fresh Jellyfin server.
# Ensures the jellyfin user can write to index.html so the JS injection works.
set -euo pipefail
HOST="${1:-mrlovelies@100.91.234.67}"
WEB_INDEX="/usr/share/jellyfin/web/index.html"

echo "Setting up host: $HOST"
ssh "$HOST" "sudo chown jellyfin:jellyfin '$WEB_INDEX' && ls -la '$WEB_INDEX'"
echo
echo "Done. Note: apt upgrades of jellyfin-web may reset ownership. Re-run this script after upgrades."
