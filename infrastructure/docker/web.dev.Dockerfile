# Node major must match the Playwright image in compose.yaml: they share node_modules volumes.
FROM node:24.22.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# Installed with npm instead of corepack: corepack's bundled signing keys lag behind npm's rotations.
RUN npm install -g pnpm@12.14.0

ENV TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    STORYBOOK_DISABLE_TELEMETRY=1

WORKDIR /workspace
