#!/bin/sh
set -e
cd /app
DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DIR"
chmod -R 777 "$DIR" 2>/dev/null || true
node server.js
