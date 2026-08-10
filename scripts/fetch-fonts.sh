#!/usr/bin/env bash
# One-time helper: downloads the exact Oswald/Inter weights this app uses as
# woff2 files into src/assets/fonts/, matching the @font-face rules in
# src/index.css.
#
# Why this script exists instead of the files just being committed: the font
# files were wired up in a sandbox with no network access, so there was no
# way to actually fetch the binaries there. This does the same thing `npm
# install` would do for a package - a one-time fetch you run locally, where
# real network access exists.
#
# Safe to re-run any time (e.g. if a file goes missing or you bump a weight).
set -euo pipefail

DEST="src/assets/fonts"
mkdir -p "$DEST"

# A browser UA is required - Google Fonts serves woff2 only to clients that
# say they support it, and falls back to ttf/eot otherwise.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

fetch_weight() {
  local family="$1" weight="$2" outfile="$3"
  local css url
  css=$(curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap")
  url=$(echo "$css" | grep -o 'https://fonts.gstatic.com/[^)]*' | head -n1)
  if [ -z "$url" ]; then
    echo "Couldn't resolve a font URL for $family $weight - Google's response:" >&2
    echo "$css" >&2
    exit 1
  fi
  echo "Fetching $family $weight -> $DEST/$outfile"
  curl -sS -A "$UA" "$url" -o "$DEST/$outfile"
}

fetch_weight "Oswald" "500" "oswald-500.woff2"
fetch_weight "Oswald" "600" "oswald-600.woff2"
fetch_weight "Oswald" "700" "oswald-700.woff2"
fetch_weight "Inter"  "400" "inter-400.woff2"
fetch_weight "Inter"  "500" "inter-500.woff2"
fetch_weight "Inter"  "600" "inter-600.woff2"
fetch_weight "Inter"  "700" "inter-700.woff2"

# Arcade Mode fonts. "Press+Start+2P" is pre-encoded (Google's API wants `+`
# for the space in the family name) - fetch_weight doesn't encode its inputs
# itself, so this has to arrive already URL-safe.
fetch_weight "Bungee" "400" "bungee-400.woff2"
fetch_weight "Press+Start+2P" "400" "press-start-2p-400.woff2"
fetch_weight "Space+Grotesk" "400" "space-grotesk-400.woff2"
fetch_weight "Space+Grotesk" "700" "space-grotesk-700.woff2"

echo "Done - $(ls "$DEST"/*.woff2 | wc -l | tr -d ' ') font files in $DEST"
