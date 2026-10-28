# PLAYNEX — Mimari harita

Kod keşfi için kısa navigasyon belgesi. Kaynak kodun yerine geçmez; mimari değişince güncellenir. Ayrıntılı ürün planı `PLAN.md`, karar kayıtları `docs/decisions/`.

## Proje

Tarayıcıda oynanan 2D/3D oyunları tek hesap, profil, skor ve sıralama altyapısında toplayan platform. Şu an: e-posta doğrulamalı hesaplar, platform ekranları ve on oynanabilir oyun (Phaser, DOM, Babylon.js). `realtime` servisi WebSocket odalarını ve altı oyunun sunucu otoriteli kurallarını çalıştırır; `api` hesap, oturum ve profil uçlarını sunar. Sıralama ve skor kayıtları henüz yok; bu alanlar boş durum gösterir.

## Teknolojiler

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 · Tailwind v4 (token üretimli tema) · next-intl (TR varsayılan, EN) · Radix (`radix-ui`) · Phaser 4.2 · Babylon.js 9.31 · chess.js · Storybook 10 · Rust/Axum (api, realtime) · PostgreSQL 18 · Valkey · RustFS (S3) · Mailpit · pnpm 12 + Turborepo · Docker Compose (her şey container'da).

## Monorepo düzeni

| Yol                      | Sorumluluk                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | Next.js uygulaması. Route'lar `src/app/[locale]/`; platform ekranları `(platform)/`, oyun oynama `play/[gameSlug]/`.                                                                                        |
| `apps/api`               | Rust Axum: `accounts.rs` (kayıt, doğrulama, giriş, `/v1/me`, `/v1/players/{username}`), `sessions.rs`, `verification.rs`, `mailer.rs` (SMTP veya Gmail API, metinler `messages/*.json`), `gmail.rs` (servis hesabı token akışı), `rate_limit.rs`, `validation.rs`. |
| `apps/realtime`          | `GET /ws`: `protocol.rs` (zarf), `identity.rs` (misafir token), `rooms.rs` (oda görevleri), `connection.rs` (soket döngüsü), `matches/*.rs` (oyun kuralları, `Match` trait).                                |
| `packages/design-tokens` | Tek kaynak tokenlar (`src/*.ts`); `scripts/build-css.ts` → `dist/tokens.css` + `dist/theme.css`; `oklchToHex`; fontlar.                                                                                     |
| `packages/ui`            | Radix tabanlı bileşenler (`src/components/<ad>/<ad>.tsx` + `.stories.tsx`), paylaşılan `src/styles/app.css`, Storybook (`.storybook/`).                                                                     |
| `packages/shared-types`  | Alan tipleri: `Game`, `Player`, `LeaderboardEntry`, `GameSession`, `Achievement`, `GamePlayerState`.                                                                                                        |
| `packages/game-sdk`      | Oyun ↔ platform sözleşmesi: `GameModule`, `GameHost`, `GameInstance`, `GamePalette`, `defineGame`.                                                                                                          |
| `packages/config`        | ESLint flat config (`eslint/{base,react,next}.mjs`), Prettier, tsconfig tabanları.                                                                                                                          |
| `games/2d/<slug>`        | Oyun paketleri (`@playnex/game-<slug>`): `src/index.ts` (`defineGame`), saf mantık (`board.ts`, `physics.ts`, `rules.ts`, `quiz.ts` …), sahne/DOM. Paylaşılan içerik ve sabitler `data/*.json`.             |
| `games/3d/<slug>`        | Babylon.js oyunları; `neon-kart-racing`: `model.ts` (Rust aynası), `world.ts`, `race.ts`, `bots.ts`, `controls.ts`.                                                                                         |
| `infrastructure`         | `docker/*.dev.Dockerfile` geliştirme, `docker/{web,rust,edge}.Dockerfile` üretim; `edge/Caddyfile`; `migrations/` sqlx (API açılışta uygular). Üretim: `compose.production.yaml`.                           |
| `docs/design`            | `direction.md` (tasarım yönü), `screenshots/` (Playwright çıktıları).                                                                                                                                       |

## Web uygulaması: nereye bakmalı

- **Kabuk ve navigasyon:** `apps/web/src/components/platform-shell.tsx` (client; Sidebar/Topbar/MobileNav bağlar, aktif link), `(platform)/layout.tsx` (oturumdaki hesap, misafirde giriş/kayıt düğmeleri), `nav-link.tsx` (ui ↔ next-intl Link adaptörü).
- **Ana sayfa bölümleri:** `apps/web/src/features/home/*` (quick-play-shelf, popular-grid, ranking-list, coming-soon-strip, side-panel); sayfa `(platform)/page.tsx`.
- **Katalog ve filtreler:** `(platform)/games/page.tsx` (URL searchParams ile sunucu tarafı filtre) + `features/catalog/filter-bar.tsx` (client, router.replace).
- **Oyun detay:** `(platform)/games/[slug]/page.tsx`. **Sıralama:** `(platform)/leaderboard/page.tsx` + `features/leaderboard/leaderboard-table.tsx`. **Profil:** `(platform)/profile/[username]/page.tsx`.
- **Oyun oynama:** `play/[gameSlug]/page.tsx` → `features/game-player/game-player.tsx` (useReducer durum makinesi: loading/ready/playing/paused/finished/error; `?state=` yalnızca development), `use-best-score.ts` (localStorage rekor), `lib/games/registry.ts` (slug → dinamik import), `lib/games/palette.ts` (token → hex).
- **Lobi ve çevrim içi:** `features/game-player/lobby/` (mode-picker, local-setup, online-lobby, option-chips), `result-summary.tsx`; `lib/realtime/connection.ts` (WebSocket, ping, yeniden bağlanma) ve `use-room.ts` (oda durumu, maç oturumu, mesaj tamponu). Oyun ayarları `Game.setup` (modlar, yerel oyuncu sayısı, seçenekler).
- **Hesap:** `[locale]/(auth)/{register,verify,login}` + `features/auth/*` (server action'lar `actions.ts`, formlar, `auth-frame.tsx`); `lib/auth/api.ts` (API'ye sunucu tarafı istek, `x-client-ip`), `lib/auth/session.ts` (`getCurrentAccount`, çerezler). **Oyun kataloğu:** `lib/catalog/games.ts` (gerçek katalog içeriği). **Biçimlendirme:** `lib/format.ts`.
- **i18n:** `src/i18n/{routing,request,navigation}.ts`, `src/proxy.ts` (middleware), mesajlar `messages/{tr,en}.json` (lobi `lobby.*`, oyun içi metin `gameText.<slug>.*`), tipler `src/global.d.ts`.
- **Durum sayfaları:** her route altında `loading.tsx`; `(platform)/error.tsx`; `[locale]/not-found.tsx`; `components/offline-banner.tsx`.
- **Ortak kart adaptörü:** `components/catalog-game-card.tsx` (Game → GameCard + GameCover + çeviriler).

## Kimlik doğrulama, veritabanı, API

Hesaplar ADR 0011: `users`, `email_verifications`, `sessions_auth`; oturum token'ı yalnızca `HttpOnly` çerezde, tarayıcı API'ye doğrudan gitmez. Çevrim içi oyuncular hâlâ misafir takma adıyla bağlanır, odalar bellekte yaşar (ADR 0009). Planlanan: OAuth/Passkey (PLAN 9), skor/sıralama tabloları (PLAN 7). WebSocket protokolü `apps/realtime/src/protocol.rs`. Solo skorlar şu an istemcide; sunucu doğrulaması sprint 6'da. Yeni bir Rust modülü `crates/<modül>` olarak eklenecek ve `Cargo.toml` `members`'a girecek.

## Oyun ekleme adımları

1. `games/2d/<slug>/` (3D için `games/3d/<slug>/`) paketi (package.json/tsconfig/eslint mevcut oyunlardan kopyalanır), `src/index.ts` `defineGame`, manifestte `modes`.
2. `apps/web/src/lib/games/registry.ts`'e import satırı; `next.config.ts` `transpilePackages`; `apps/web/package.json` bağımlılığı; `compose.yaml`'a `node_modules` volume'u.
3. `apps/web/src/lib/catalog/games.ts`'e kayıt (status `live`, `setup`), `packages/ui/src/components/game-cover/game-cover.tsx`'e kapak illüstrasyonu, oyun içi metinler `gameText.<slug>`.
4. Çevrim içi oyunsa: `apps/realtime/src/matches/<oyun>.rs`, `GameKind` kaydı, gerekiyorsa `validate_options`; `e2e/online.spec.ts`'e senaryo.
5. `docker compose up -d web` (yeni volume) ve `docker compose exec web pnpm install`; `e2e/games.spec.ts` listesine slug.

## Komutlar

Docker içinden: `make up`, `make lint`, `make typecheck`, `make check-rust`, `make tokens`, `make screenshots`, `make migrate`. Doğrudan: `docker compose exec web pnpm turbo run typecheck lint`, oyun boot testi `docker compose --profile tools run --rm playwright node_modules/.bin/playwright test e2e/games.spec.ts`. Host'ta Make yok; `Makefile` hedeflerinin karşılığı olan compose komutları kullanılır.

## Bilinen tuzaklar

- Polling izleme yeni `app/` route klasörlerini görmez → `docker compose restart web`.
- Playwright container'ı `web:3000` origin'ini kullanır → `allowedDevOrigins` gerekli (ADR 0002).
- Tailwind namespace sıfırlamaları `theme.css`'te; `--container-*` sıfırlanmaz (max-w sınıfları).
- Phaser 4 tipleri: `Graphics.fillPoints` `Vector2[]`, `Scene.update` `override`.
- Playwright tarayıcısı container içinde: `e2e/realtime-bridge.ts` (globalSetup) `localhost:8081`'i `realtime:8081`'e köprüler; `page.routeWebSocket` bu kurulumda yönlendirmedi.
- `messages` kökünde `games` katalog namespace'i dolu; oyun içi metinler bu yüzden `gameText` altında.
- Hokey ve kart sabitleri (`data/*.json`) değişince Rust ve TS modeli birlikte güncellenir; `cargo watch` bu klasörleri izler.
