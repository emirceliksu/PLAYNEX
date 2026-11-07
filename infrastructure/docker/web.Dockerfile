# Production image for apps/web. Build context is the repository root.
FROM rust:1.99.1-slim-bookworm AS wasm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash \
  && cargo binstall -y wasm-bindgen-cli@0.2.130 \
  && rustup target add wasm32-unknown-unknown

WORKDIR /repo
COPY . .
RUN sh tools/creator/build-wasm.sh

FROM node:24.22.0-bookworm-slim AS build

RUN npm install -g pnpm@12.14.0

ENV TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /repo
COPY . .
COPY --from=wasm /repo/packages/creator-engine-wasm/pkg ./packages/creator-engine-wasm/pkg
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@playnex/web

FROM node:24.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Standalone output leaves public/ out; the siper announcer lines are served from it.
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/web/server.js"]
