#!/bin/bash
# Dev-server launcher: pins Node 22 (via nvm) and runs Vite from the project dir.
# System Node is v12, which is too old for this stack.
set -e
cd "$(dirname "$0")"
export PATH="/Users/joshh/.nvm/versions/node/v22.22.3/bin:$PATH"
exec node ./node_modules/vite/bin/vite.js "$@"
