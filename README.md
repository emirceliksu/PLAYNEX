# PLAYNEX

Tarayıcıdan oynanan 2D ve 3D oyunları tek hesap, profil, skor ve sıralama altyapısında birleştiren oyun platformu. Ürün planı `PLAN.md` dosyasında.

## Gereksinimler

Host makinede yalnızca Docker (Compose v2 ile) ve Git gerekir. Node, pnpm, Rust ve veritabanları container içinde çalışır.

`Makefile` hedefleri GNU Make ister. Windows'ta Make yoksa `winget install ezwinports.make` ile kurulabilir ya da her hedefin karşılığı olan `docker compose` komutu doğrudan çalıştırılır.

## Çalıştırma

```bash
make bootstrap   # ilk kurulum: imajlar, pnpm install, Cargo lockfile
make up          # tüm servisleri kaldırır ve durumlarını listeler
make logs        # S=web gibi bir servis adıyla daraltılabilir
make down
```

İlk `make up` sırasında Rust servisleri derlenir; `api` ve `realtime` birkaç dakika sonra `healthy` olur.

| Servis                           | Adres                                         |
| -------------------------------- | --------------------------------------------- |
| Web (Next.js)                    | http://localhost:3000                         |
| Storybook                        | http://localhost:6006                         |
| API healthcheck                  | http://localhost:8080/health                  |
| Realtime healthcheck             | http://localhost:8081/health                  |
| PostgreSQL                       | localhost:5432                                |
| Valkey                           | localhost:6379                                |
| Object storage (S3 API / konsol) | http://localhost:9000 / http://localhost:9001 |
| Mailpit                          | http://localhost:8025                         |

Kayıt olurken gönderilen doğrulama kodları geliştirmede Mailpit'e düşer (http://localhost:8025).

Ortam değişkenleri `.env.example` dosyasında belgelenir; `make up` eksikse `.env` dosyasını oradan kopyalar.

## Günlük komutlar

```bash
make lint          # ESLint (tüm workspace)
make typecheck     # tsc
make check-rust    # cargo fmt --check, clippy, check
make fmt           # Prettier + cargo fmt
make tokens        # design-tokens CSS'ini yeniden üretir
make screenshots   # Playwright container'ı ile docs/design/screenshots/ altına ekran görüntüleri
make migrate       # sqlx migration'ları (infrastructure/migrations)
make sh-web        # web container'ında kabuk
make sh-api        # api container'ında kabuk
make nuke          # container'lar ve named volume'lar dahil her şeyi siler
```

`make screenshots` ve e2e testleri (`e2e/auth.spec.ts` kayıt akışı dahil) Playwright container'ında çalışır.

Paket eklemek: `docker compose exec web pnpm --filter @playnex/web add <paket>`; lockfile değişikliği commit'e dahil edilir.

## Dosya izleme

Windows ve macOS'ta bind mount dosya olaylarını güvenilir iletmediği için dev sunucular varsayılan olarak polling yapar (`WATCH_POLLING=1`). Linux host'ta veya Docker Desktop "Synchronized file shares" ile `.env` içinde `WATCH_POLLING=0` yapılabilir.

Polling yeni `app/` route klasörlerini fark etmez; yeni bir route dizini eklendiğinde `docker compose restart web` çalıştırın.

## Üretim

Üretim Coolify üzerinde `compose.production.yaml` ile çalışır; dışarıya yalnızca `edge` (Caddy) açılır, web, API, realtime ve PostgreSQL iç ağdadır. Kurulum ve ortam değişkenleri: `docs/deployment/coolify.md`, gerekçe: `docs/decisions/0011-hesaplar-ve-uretim-agi.md`.

## Yapı

```text
apps/web               Next.js (App Router), next-intl ile TR + EN
apps/api               Rust / Axum HTTP API
apps/realtime          Rust / Axum WebSocket çalışma zamanı
packages/design-tokens Tasarım tokenlarının tek kaynağı; Tailwind teması ve CSS değişkenleri buradan üretilir
packages/ui            Radix üzerine PLAYNEX bileşenleri ve Storybook
packages/shared-types  Web ve bileşenlerin paylaştığı alan tipleri
packages/config        ESLint, Prettier ve tsconfig tabanları
infrastructure/docker  Geliştirme (`*.dev.Dockerfile`) ve üretim Dockerfile'ları
infrastructure/edge    Üretimdeki tek giriş noktasının Caddy ayarı
infrastructure/migrations  PostgreSQL migration'ları (sqlx)
docs/                  Tasarım yönü, karar kayıtları, ekran görüntüleri
```
