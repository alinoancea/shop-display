#!/bin/sh
set -e
if [ -d /app/data ]; then
  chown -R app:app /app/data
fi
exec su-exec app node server/index.js
