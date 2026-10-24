# PLAYNEX — Mimari harita

Kod keşfi için kısa navigasyon belgesi. Kaynak kodun yerine geçmez; mimari değişince güncellenir. Ayrıntılı ürün planı `PLAN.md`, karar kayıtları `docs/decisions/`.

## Proje

Tarayıcıda oynanan 2D/3D oyunları tek hesap, profil, skor ve sıralama altyapısında toplayan platform. Şu an: mock verili platform ekranları + beş oynanabilir Phaser oyunu. Backend yalnızca healthcheck; auth, veritabanı şeması ve skor doğrulaması henüz yok.

## Teknolojiler

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 · Tailwind v4 (token üretimli tema) · next-intl (TR varsayılan, EN) · Radix (`radix-ui`) · Phaser 4.2 · Storybook 10 · Rust/Axum (api, realtime) · PostgreSQL 18 · Valkey · RustFS (S3) · Mailpit · pnpm 12 + Turborepo · Docker Compose (her şey container'da).

## Monorepo düzeni

| Yol                         | Sorumluluk                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                  | Next.js uygulaması. Route'lar `src/app/[locale]/`; platform ekranları `(platform)/`, oyun oynama `play/[gameSlug]/`.                                                        |
| `apps/api`, `apps/realtime` | Rust Axum servisleri; şimdilik yalnızca `GET /health` (`src/main.rs`).                                                                                                      |
| `packages/design-tokens`    | Tek kaynak tokenlar (`src/*.ts`); `scripts/build-css.ts` → `dist/tokens.css` + `dist/theme.css`; `oklchToHex`; fontlar.                                                     |
| `packages/ui`               | Radix tabanlı bileşenler (`src/components/<ad>/<ad>.tsx` + `.stories.tsx`), paylaşılan `src/styles/app.css`, Storybook (`.storybook/`).                                     |
| `packages/shared-types`     | Alan tipleri: `Game`, `Player`, `LeaderboardEntry`, `GameSession`, `Achievement`, `GamePlayerState`.                                                                        |
| `packages/game-sdk`         | Oyun ↔ platform sözleşmesi: `GameModule`, `GameHost`, `GameInstance`, `GamePalette`, `defineGame`.                                                                          |
| `packages/config`           | ESLint flat config (`eslint/{base,react,next}.mjs`), Prettier, tsconfig tabanları.                                                                                          |
| `games/2d/<slug>`           | Phaser oyun paketleri (`@playnex/game-<slug>`): `src/index.ts` (mount), `src/scene.ts`, saf mantık dosyası (`snake.ts`, `grid.ts`, `deck.ts`, `board.ts`), `src/colors.ts`. |
| `infrastructure/docker`     | Dev Dockerfile'ları. `infrastructure/migrations` sqlx migration'ları (henüz boş).                                                                                           |
| `docs/design`               | `direction.md` (tasarım yönü), `screenshots/` (Playwright çıktıları).                                                                                                       |

## Web uygulaması: nereye bakmalı

- **Kabuk ve navigasyon:** `apps/web/src/components/platform-shell.tsx` (client; Sidebar/Topbar/MobileNav bağlar, aktif link), `(platform)/layout.tsx` (çeviri etiketleri, mock bildirimler), `nav-link.tsx` (ui ↔ next-intl Link adaptörü).
- **Ana sayfa bölümleri:** `apps/web/src/features/home/*` (quick-play-shelf, popular-grid, ranking-list, coming-soon-strip, side-panel); sayfa `(platform)/page.tsx`.
- **Katalog ve filtreler:** `(platform)/games/page.tsx` (URL searchParams ile sunucu tarafı filtre) + `features/catalog/filter-bar.tsx` (client, router.replace).
- **Oyun detay:** `(platform)/games/[slug]/page.tsx`. **Sıralama:** `(platform)/leaderboard/page.tsx` + `features/leaderboard/leaderboard-table.tsx`. **Profil:** `(platform)/profile/[username]/page.tsx`.
- **Oyun oynama:** `play/[gameSlug]/page.tsx` → `features/game-player/game-player.tsx` (useReducer durum makinesi: loading/ready/playing/paused/finished/error; `?state=` yalnızca development), `use-best-score.ts` (localStorage rekor), `lib/games/registry.ts` (slug → dinamik import), `lib/games/palette.ts` (token → hex).
- **Mock veri:** `apps/web/src/lib/mock/{games,players,leaderboard,sessions}.ts`. **Biçimlendirme:** `lib/format.ts`.
- **i18n:** `src/i18n/{routing,request,navigation}.ts`, `src/proxy.ts` (middleware), mesajlar `messages/{tr,en}.json`, tipler `src/global.d.ts`.
- **Durum sayfaları:** her route altında `loading.tsx`; `(platform)/error.tsx`; `[locale]/not-found.tsx`; `components/offline-banner.tsx`.
- **Ortak kart adaptörü:** `components/catalog-game-card.tsx` (Game → GameCard + GameCover + çeviriler).

## Kimlik doğrulama, veritabanı, API

Henüz yok. Planlanan: OAuth/Passkey (PLAN 9), PostgreSQL tabloları (PLAN 7), REST `/v1/*` ve WebSocket (PLAN 8). Skorlar şu an istemcide; sunucu doğrulaması sprint 6'da. Yeni bir Rust modülü `crates/<modül>` olarak eklenecek ve `Cargo.toml` `members`'a girecek.

## Oyun ekleme adımları

1. `games/2d/<slug>/` paketi (package.json/tsconfig/eslint mevcut oyunlardan kopyalanır), `src/index.ts` `defineGame`.
2. `apps/web/src/lib/games/registry.ts`'e import satırı; `next.config.ts` `transpilePackages`; `apps/web/package.json` bağımlılığı; `compose.yaml`'a `node_modules` volume'u.
3. `apps/web/src/lib/mock/games.ts`'e kayıt (status `live`), `packages/ui/src/components/game-cover/game-cover.tsx`'e kapak illüstrasyonu.
4. `docker compose exec web pnpm install`; yeni route klasörü yoksa yeniden başlatma gerekmez.

## Komutlar

Docker içinden: `make up`, `make lint`, `make typecheck`, `make check-rust`, `make tokens`, `make screenshots`, `make migrate`. Doğrudan: `docker compose exec web pnpm turbo run typecheck lint`, oyun boot testi `docker compose --profile tools run --rm playwright node_modules/.bin/playwright test e2e/games.spec.ts`. Host'ta Make yok; `Makefile` hedeflerinin karşılığı olan compose komutları kullanılır.

## Bilinen tuzaklar

- Polling izleme yeni `app/` route klasörlerini görmez → `docker compose restart web`.
- Playwright container'ı `web:3000` origin'ini kullanır → `allowedDevOrigins` gerekli (ADR 0002).
- Tailwind namespace sıfırlamaları `theme.css`'te; `--container-*` sıfırlanmaz (max-w sınıfları).
- Phaser 4 tipleri: `Graphics.fillPoints` `Vector2[]`, `Scene.update` `override`.
