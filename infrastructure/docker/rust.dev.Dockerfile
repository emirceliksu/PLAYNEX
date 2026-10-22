# Version must match rust-toolchain.toml so rustup does not download a second toolchain.
FROM rust:1.99.1-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

# cargo-binstall pulls prebuilt binaries, so the image builds in seconds instead of compiling the tools.
RUN curl -fsSL https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash \
  && cargo binstall -y cargo-watch sqlx-cli

WORKDIR /workspace
