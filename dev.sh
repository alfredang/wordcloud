#!/bin/bash
# Local development script
# Copies firebase-config.local.js over firebase-config.js temporarily,
# starts a server, then restores the placeholder version on exit.

cp firebase-config.js firebase-config.js.bak
cp firebase-config.local.js firebase-config.js

cleanup() {
  mv firebase-config.js.bak firebase-config.js
  echo "Restored firebase-config.js placeholders"
}
trap cleanup EXIT

echo "Starting local dev server at http://localhost:8080"
python3 -m http.server 8080
