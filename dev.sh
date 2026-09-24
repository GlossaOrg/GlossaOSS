#!/usr/bin/env bash
# One command for the dev loop: backing services up (idempotent), then Glossa in the foreground.
# Ctrl-C stops Glossa and leaves the backing services running for the next run.
set -euo pipefail
cd "$(dirname "$0")"
# REQUIREMENTS §9 seals stored provider keys with this. A well-known value, so a fresh clone can
# turn AI features on without generating one first; it is in git, so it protects nothing. A real
# environment variable or a line in .env wins over it, and a deployment must set its own.
if [ -z "${ENCRYPTION_KEY:-}" ] && ! grep -q '^ENCRYPTION_KEY=' .env 2>/dev/null; then
  export ENCRYPTION_KEY=Z2xvc3NhLWRldi1rZXktbm90LWZvci1yZWFsLXVzZSE=
fi
if [ "${1:-}" = --mint ]; then
  ./dev/tools/mint
  shift
fi
# --build, not just up: a service here is built from dev/ (the realm and provider config baked
# into it), and without it an edited config file silently keeps running the old image. Cached, so
# it costs nothing when nothing changed.
docker compose -f dev/compose.yaml up -d --wait --build
# The app runs off target/classes, skipping the shade that `package` would redo on every edit,
# and from this directory: a relative path in DEV — frontend/, .env — is resolved against it.
./mvnw -q compile dependency:build-classpath -Dmdep.outputFile=target/classpath -pl backend -am
exec java -Dflash.env=dev -Dorg.jboss.logging.provider=slf4j -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 \
  -cp "backend/target/classes:$(cat backend/target/classpath)" dev.relism.glossa.Main "$@"
