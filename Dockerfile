# Stage 1: Build the webinterface bundle + install runtime deps.
# build-essential + python3 are needed here so npm rebuild can compile
# native bindings (better-sqlite3, etc.). They never make it into the
# runtime image — see Stage 2.
FROM node:22-bookworm AS builder
WORKDIR /service_root

RUN apt-get update && apt-get -y install build-essential python3 && rm -rf /var/lib/apt/lists/*

# ── Webinterface ──────────────────────────────────────────────────
# Install with devDeps so quack can run the build, then prune. The
# .dockerignore prevents the host's webinterface/node_modules from
# being copied in — we always install fresh. `docs/` is copied too
# because the webinterface's `copyFiles` step references `../docs/**`.
COPY webinterface /service_root/webinterface
COPY docs         /service_root/docs
RUN cd /service_root/webinterface \
	&& npm install --include=dev \
	&& npm run build \
	&& npm prune --omit=dev --ignore-scripts

# ── Service install ───────────────────────────────────────────────
# `--ignore-scripts` so npm doesn't re-run the parent's postinstall
# (`cd webinterface && npm install && npm run build`) — already done
# above. `npm rebuild` afterwards rebuilds native modules.
COPY package.json      /service_root/package.json
COPY source            /service_root/source
COPY operation-library /service_root/operation-library
RUN npm install --omit=dev --ignore-scripts && npm rebuild

# Stage 2: Runtime — node + the lean prebuilt trees from Stage 1.
# No compilers, no editor conveniences, no fresh npm install.
FROM node:22-bookworm-slim AS production
LABEL maintainer="steven velozo <steven@velozo.com>"
WORKDIR /service_root

COPY --from=builder /service_root/package.json      ./package.json
COPY --from=builder /service_root/source            ./source
COPY --from=builder /service_root/operation-library ./operation-library
COPY --from=builder /service_root/node_modules      ./node_modules
COPY --from=builder /service_root/webinterface      ./webinterface

RUN date -u +"%Y-%m-%dT%H:%M:%SZ" > ./build.date

EXPOSE 54321

# `start` is the actual server subcommand; without it the CLI prints
# help and exits, which docker reads as a crash and restarts forever.
CMD ["node", "source/cli/Ultravisor-Run.cjs", "start"]
