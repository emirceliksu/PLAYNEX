# ADR 0002 — Docker Compose geliştirme ortamı

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

Host'ta yalnızca Docker ve Git var; Node, pnpm, Rust container içinde çalışır (`PLAN.md` 12). Host Windows olduğu için bind mount dosya olayları ve `node_modules` performansı ayrıca ele alınmalı.

## Karar

- Kaynak kod `/workspace`'e bind mount edilir. Kök ve her workspace paketinin `node_modules` dizini, `apps/web/.next`, Cargo registry ve her Rust servisi için ayrı `target` named volume'dadır.
- pnpm store ayrı bir volume'da değil, `node_modules/.pnpm-store` içindedir (`.npmrc`): farklı volume'lar arası hardlink yapılamadığı için pnpm kopyaya düşerdi.
- `deps` adlı one-shot servis `pnpm install` ve design-tokens build'ini yapar; `web`, `storybook` ve `playwright` buna `service_completed_successfully` ile bağlıdır. Böylece aynı volume'a iki paralel `pnpm install` yazmaz. `--frozen-lockfile` yalnızca CI'da kullanılır.
- `api` ve `realtime` aynı imajı ve aynı Cargo workspace'i kullanır ama `CARGO_TARGET_DIR` ayrı volume'lardadır; cargo'nun target kilidi iki watcher'ı seri hale getirmesin.
- Dosya izleme varsayılan olarak polling'dir (`WATCH_POLLING=1`): Next `watchOptions.pollIntervalMs`, Vite `server.watch.usePolling`, `cargo watch --poll`. Linux host'ta kapatılabilir.
- Web imajının Node major'ı Playwright imajındaki Node sürümünden türetilir (v1.64.1 → Node 24) çünkü `node_modules` volume'ları paylaşılır. Playwright container'ında pnpm yoktur; `node_modules/.bin/playwright` doğrudan çalıştırılır.
- pnpm `npm install -g` ile kurulur; corepack'in imza anahtarları npm'in anahtar rotasyonlarının gerisinde kalabiliyor.
- `cargo-watch` ve `sqlx-cli`, `cargo-binstall` ile prebuilt indirilir. `cargo-watch` artık aktif bakımda değil; sorun çıkarsa `bacon` veya `watchexec` değerlendirilir.
- Üretim Dockerfile'ları henüz yok; gerçek uygulama oluştukça multi-stage, non-root ve healthcheck'li olarak eklenecek.

## Sonuçlar

- `make nuke` volume'ları silmenin tek yolu; pnpm mount edilmiş bir `node_modules`'ı kendisi silemez.
- Yeni bir workspace paketi eklenirken `compose.yaml`'a `node_modules` volume'u da eklenir.
- Lockfile'lar (`pnpm-lock.yaml`, `Cargo.lock`) `make bootstrap` ile üretilir ve commit'lenir.
