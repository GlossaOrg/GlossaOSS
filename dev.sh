#!/usr/bin/env bash
# One command for the dev loop: backing services up (idempotent), then Glossa in the foreground.
# Ctrl-C stops Glossa and leaves the backing services running for the next run.
set -euo pipefail
cd "$(dirname "$0")"
if [ "${1:-}" = --mint ]; then
  ./dev/tools/mint
  shift
fi
# --build, not just up: a service here is built from dev/ (the realm and provider config baked
# into it), and without it an edited config file silently keeps running the old image. Cached, so
# it costs nothing when nothing changed.
docker compose -f dev/compose.yaml up -d --wait --build
exec ./mvnw compile exec:exec@dev "$@"
