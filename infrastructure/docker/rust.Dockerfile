# Production image for one Rust service; PACKAGE picks it (playnex-api, playnex-mailer or playnex-realtime).
# Build context is the repository root.
# Version must match rust-toolchain.toml so rustup does not download a second toolchain.
FROM rust:1.99.1-slim-bookworm AS build

ARG PACKAGE
WORKDIR /repo

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY apps/api apps/api
COPY apps/mailer apps/mailer
COPY apps/realtime apps/realtime
COPY crates crates
# sqlx embeds the migrations into the api binary at compile time.
COPY infrastructure/migrations infrastructure/migrations
# The realtime match rules compile in the shared game data with include_str!.
COPY games/2d/air-hockey/data games/2d/air-hockey/data
COPY games/2d/drawing-party/data games/2d/drawing-party/data
COPY games/2d/trivia-battle/data games/2d/trivia-battle/data
COPY games/3d/neon-kart-racing/data games/3d/neon-kart-racing/data

# The services build in parallel; locked caches keep them from unpacking crates over each other.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/repo/target,sharing=locked \
    cargo build --release --locked -p "${PACKAGE}" \
  && cp "target/release/${PACKAGE}" /usr/local/bin/service

FROM debian:bookworm-20251020-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --no-create-home service

COPY --from=build /usr/local/bin/service /usr/local/bin/service

USER service
ENV RUST_LOG=info

CMD ["/usr/local/bin/service"]
