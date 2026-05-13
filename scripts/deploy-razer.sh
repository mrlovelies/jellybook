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

# Ship our own DLL plus any third-party DLLs we depend on that aren't in Jellyfin's own bin.
SHIP=(Jellybook.Server.dll SharpCompress.dll)
TMP_LIST=()
for f in "${SHIP[@]}"; do
  if [[ -f "$ROOT/build/$f" ]]; then
    scp "$ROOT/build/$f" "$HOST:/tmp/$f"
    TMP_LIST+=("/tmp/$f")
  else
    echo "warning: $f not found in build output" >&2
  fi
done

REMOTE_CMD="sudo mv ${TMP_LIST[*]} '$REMOTE_DIR/' && sudo chown -R jellyfin:jellyfin '$REMOTE_DIR'"
ssh "$HOST" "$REMOTE_CMD"

echo
echo "Restarting Jellyfin..."
ssh "$HOST" "sudo systemctl restart jellyfin"
sleep 6
ssh "$HOST" "systemctl is-active jellyfin"

echo
echo "Recent Jellybook log lines:"
ssh "$HOST" "sudo journalctl -u jellyfin -n 200 --no-pager | grep -i jellybook || echo '(no matches)'"
