FROM node:20-bookworm AS base
MAINTAINER steven velozo <steven@velozo.com>

# build-essential + python3 are needed for native node-gyp builds
# (better-sqlite3 etc.) when no prebuilt binary matches the host.
RUN apt-get update && apt-get -y --force-yes install \
	curl wget vim nano less tmux uuid-runtime \
	build-essential python3

# ── Webinterface bundle ────────────────────────────────────────────
# Install webinterface deps WITH dev deps (needed for `quack build`),
# then build the dist bundle. We do this in its own layer so parent
# source changes don't bust the webinterface cache.
ADD webinterface /service_root/webinterface
RUN cd /service_root/webinterface && npm install --include=dev \
	&& npm run build

# ── Service install ────────────────────────────────────────────────
# `--ignore-scripts` so npm doesn't re-run the parent's postinstall
# (which would `cd webinterface && npm install && npm run build`,
# duplicating what we already did above and failing because dev deps
# weren't propagated into nested installs).
# `npm rebuild` afterwards rebuilds native modules (better-sqlite3)
# that the ignore-scripts skipped.
ADD package.json      /service_root/package.json
ADD source            /service_root/source
ADD operation-library /service_root/operation-library

WORKDIR /service_root
RUN npm install --omit=dev --ignore-scripts \
	&& npm rebuild

RUN rm -rf package-lock.json .git test webinterface/node_modules/.cache

FROM base AS production

RUN date -u +"%Y-%m-%dT%H:%M:%SZ" > ./build.date

EXPOSE 54321
# `start` is the actual server subcommand; without it the CLI prints
# help and exits, which docker reads as a crash and restarts forever.
CMD ["node", "source/cli/Ultravisor-Run.cjs", "start"]
