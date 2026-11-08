#!/usr/bin/env bash
# Re-export the homepage mockups (zh + en) to PNG at 1x and 2x with headless Chrome.
# usage: bash render.sh            (Git Bash on Windows; set CHROME to override the browser path)
set -e
CH="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
DIR="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=8000)
for LANG_ in zh en; do
  URL="file:///$DIR/index.$LANG_.html"
  H=$("$CH" "${FLAGS[@]}" --window-size=1440,1000 --dump-dom "$URL" 2>/dev/null | grep -oE 'data-h="[0-9]+"' | grep -oE '[0-9]+')
  echo "$LANG_: page height $H"
  for S in 1 2; do
    SUFFIX=$([ "$S" = 2 ] && echo "@2x" || true)
    "$CH" "${FLAGS[@]}" --window-size=1440,$H --force-device-scale-factor=$S \
      --screenshot="$DIR/inkstone-home-$LANG_-1440$SUFFIX.png" "$URL" 2>/dev/null | tail -1
  done
done
