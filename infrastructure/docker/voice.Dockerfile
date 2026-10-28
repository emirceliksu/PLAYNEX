# Renders the Siper announcer lines; used only through `make voices`.
FROM debian:12.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends espeak-ng ffmpeg jq \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
