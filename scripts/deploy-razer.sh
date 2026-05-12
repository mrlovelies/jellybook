#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
HOST="mrlovelies@100.91.234.67"
VERSION="0.0.1.0"
REMOTE_DIR="/var/lib/jellyfin/plugins/Jellybook_${VERSION}"

bash "$ROOT/scripts/build.sh"

echo
echo "Deploying to ${HOST}:${REMOTE_DIR}"
ssh "$HOST" "sudo mkdir -p '$REMOTE_DIR'"
scp "$ROOT/build/Jellybook.Server.dll" "$HOST:/tmp/Jellybook.Server.dll"
ssh "$HOST" "sudo mv /tmp/Jellybook.Server.dll '$REMOTE_DIR/Jellybook.Server.dll' && sudo chown -R jellyfin:jellyfin '$REMOTE_DIR'"

echo
echo "Restarting Jellyfin..."
ssh "$HOST" "sudo systemctl restart jellyfin"
sleep 6
ssh "$HOST" "systemctl is-active jellyfin"

echo
echo "Recent Jellybook log lines:"
ssh "$HOST" "sudo journalctl -u jellyfin -n 200 --no-pager | grep -i jellybook || echo '(no matches)'"
