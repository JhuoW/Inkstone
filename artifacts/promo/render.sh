#!/usr/bin/env bash
# Export the 1280×640 promo card (en + zh) at 1x and 2x with headless Chrome.
# usage: bash render.sh      (Git Bash on Windows; set CHROME to override the browser path)
set -e
CH="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
DIR="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
for L in en zh; do
  for S in 1 2; do
    SUFFIX=$([ "$S" = 2 ] && echo "@2x" || true)
    "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
      --virtual-time-budget=8000 --window-size=1280,640 --force-device-scale-factor=$S \
      --screenshot="$DIR/inkstone-promo-$L-1280x640$SUFFIX.png" "file:///$DIR/promo.$L.html" 2>/dev/null | tail -1
  done
done
