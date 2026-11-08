#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != "Linux" ]; then
  echo "This bootstrap script supports Linux only. On Windows, install Node.js 22.12+ from nodejs.org."
  exit 1
fi
if command -v node >/dev/null 2>&1; then
  node --version
else
  case "$(uname -m)" in x86_64) inkstone_arch=x64;; aarch64|arm64) inkstone_arch=arm64;; *) echo "Install Node.js 22 for this architecture"; exit 1;; esac
  inkstone_os=linux
  mkdir -p .tools
  curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o .tools/node-checksums.txt
  inkstone_archive="$(awk -v suffix="-${inkstone_os}-${inkstone_arch}.tar.gz" 'index($2,suffix)>0 {print $2; exit}' .tools/node-checksums.txt)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$inkstone_archive" -o ".tools/$inkstone_archive"
  (cd .tools && awk -v file="$inkstone_archive" '$2==file' node-checksums.txt | sha256sum -c -)
  tar -xzf ".tools/$inkstone_archive" -C .tools
  if [ ! -d .tools/node ]; then mv ".tools/${inkstone_archive%.tar.gz}" .tools/node; fi
  export PATH="$PWD/.tools/node/bin:$PATH"
fi
npm ci
node node_modules/electron/install.js
printf '\nRun: PATH="$PWD/.tools/node/bin:$PATH" npm start\n'
