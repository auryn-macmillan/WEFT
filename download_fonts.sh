#!/bin/bash
set -e
USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"

get_font() {
  local family=$1
  local weight=$2
  local filename=$3
  echo "Downloading $family $weight..."
  
  CSS_URL="https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap"
  
  # Fetch CSS and extract the highest priority (woff2) URL
  FONT_URL=$(curl -s -H "User-Agent: $USER_AGENT" "$CSS_URL" | grep -oP "url\([^)]+\)" | grep woff2 | head -1 | sed "s/url(//g" | sed "s/)//g" | tr -d "'\"")
  
  if [ -n "$FONT_URL" ]; then
    curl -s -o "examples/weft-web/src/lib/assets/fonts/$filename" "$FONT_URL"
    echo "Saved $filename"
  else
    echo "Failed to extract URL for $family"
    exit 1
  fi
}

get_font "Inter" "400" "inter-regular.woff2"
get_font "Inter" "700" "inter-bold.woff2"
get_font "JetBrains+Mono" "400" "jetbrains-mono-regular.woff2"

ls -lh examples/weft-web/src/lib/assets/fonts/
