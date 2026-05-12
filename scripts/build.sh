#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PROJECT="$ROOT/src/Jellybook.Server/Jellybook.Server.csproj"
OUT="$ROOT/build"

rm -rf "$OUT"
mkdir -p "$OUT"

dotnet publish "$PROJECT" -c Release -o "$OUT" --nologo

echo
echo "Built plugin to $OUT"
ls -lh "$OUT/Jellybook.Server.dll"
