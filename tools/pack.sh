#!/usr/bin/env bash
# Pack the extension as krillion-party-joiner-<version>.zip, reading the
# version from the manifest so the file name can never disagree with it.
# The woff2 sources stay out: their bytes are already inlined in content.css.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c 'import json;print(json.load(open("extension/manifest.json"))["version"])')
out="krillion-party-joiner-$version.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x '.DS_Store' -x 'fonts/*')
printf '%s  (%s)\n' "$out" "$(du -h "$out" | cut -f1)"
