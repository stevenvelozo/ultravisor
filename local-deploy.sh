#!/usr/bin/env bash
# local-deploy.sh — push the local ultravisor source tree into the
# running lab-managed UV container without re-publishing to npm.
#
# Why: while iterating on the UV codebase ahead of an `npm publish`
# bump, this skips the publish-rebuild-image-recreate-container loop.
# The lab still thinks the container is `ultravisor@<published-version>`
# (per its imageTag); we just clobber the relevant files inside it.
#
# Usage:
#   ./local-deploy.sh                           # auto-detect first lab-ultravisor-* container
#   ./local-deploy.sh lab-ultravisor-1          # explicit container name
#
# What it does:
#   1. Rebuilds webinterface/dist (bundles JS + CSS)
#   2. docker cps source/ and webinterface/dist/ into the container
#   3. Restarts the container so node re-requires the .cjs files

set -euo pipefail

cd "$(dirname "$0")"

CONTAINER="${1:-}"
if [ -z "$CONTAINER" ]; then
	CONTAINER=$(docker ps --format '{{.Names}}' | grep '^lab-ultravisor-' | head -1)
	if [ -z "$CONTAINER" ]; then
		echo "✗ no lab-ultravisor-* container running.  Pass a name explicitly: $0 <container>"
		exit 1
	fi
fi
echo "→ Target container: $CONTAINER"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}\$"; then
	echo "✗ container '$CONTAINER' is not running"
	exit 1
fi

echo "→ Building webinterface bundle..."
( cd webinterface && npm run build > /tmp/local-deploy-build.log 2>&1 ) || {
	echo "✗ webinterface build failed; see /tmp/local-deploy-build.log"
	exit 2
}

echo "→ Pushing source/ into /app/node_modules/ultravisor/source/..."
docker cp source/. "${CONTAINER}":/app/node_modules/ultravisor/source/

echo "→ Pushing webinterface/dist/ into /app/node_modules/ultravisor/webinterface/dist/..."
docker cp webinterface/dist/. "${CONTAINER}":/app/node_modules/ultravisor/webinterface/dist/

echo "→ Restarting container so node re-requires the .cjs files..."
docker restart "${CONTAINER}" > /dev/null
echo "→ Waiting for UV to come back up..."
for i in $(seq 1 30); do
	if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:54321/status"; then
		echo "✓ UV is responding on :54321"
		break
	fi
	sleep 1
done

echo "✓ done.  Inspect with:"
echo "    docker logs ${CONTAINER} --tail 20"
echo "    curl -s http://127.0.0.1:54321/status | python3 -m json.tool"
