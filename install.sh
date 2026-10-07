#!/bin/sh
# Copy the extension into omp and the optional script into ~/.local/bin.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
dest="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}/extensions"
mkdir -p "$dest"
cp "$here/extensions/cliproxy-quota.ts" "$dest/cliproxy-quota.ts"
cp "$here/extensions/cliproxy-usage.ts" "$dest/cliproxy-usage.ts"
echo "Installed /quota and the usage provider to $dest"
if [ "${1:-}" = "--with-cli" ]; then
  mkdir -p "$HOME/.local/bin"
  cp "$here/cliquota" "$HOME/.local/bin/cliquota"
  chmod +x "$HOME/.local/bin/cliquota"
  echo "Installed cliquota to $HOME/.local/bin"
fi
echo "Next: run ./setup-credentials.py once, then start a new omp session."
