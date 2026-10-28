# PLAYNEX — Master Proje Planı

> Sürüm: 1.1 | Tarih: 2026-10-09 | Durum: Planlama

### v1.1 değişiklikleri
- MVP 5 oyuna indirildi: 4 solo + tek 1v1 (Connect Four). Air Hockey Faz 2'ye taşındı.
- "Block Blast" adı mevcut bir ticari oyunla çakıştığı için bırakıldı; özgün isimli bir blok bulmacası yapılacak.
- Solo skor güvenliği MVP'de makullük kontrolü + risk puanı ile; tam replay doğrulaması yalnızca liderlik tablosunun üst sıraları için.
- Admin ayrı uygulama değil; `apps/web` içinde rol korumalı `/admin` route grubu.
- Cache/presence: Valkey veya Redis. Diller: TR (varsayılan) + EN, i18n ilk sprintten itibaren.
- Marka moru Tailwind'in hazır `violet-600` tonundan ayrıştırılacak; tüm palet özel olacak.
- Tutarsızlıklar giderildi: `scores` tablosuna `game_id` eklendi, `crates/` listesi Rust modülleriyle eşitlendi.
- Geliştirme ortamı baştan sona Docker: tüm servisler Docker Compose ile çalışır, host makineye Node/Rust kurulumu gerekmez.
- Plan dosyası repo kökünde `PLAN.md`.

## 1. Vizyon ve kapsam

PLAYNEX; herkese açık, renkli arcade tasarımlı, tarayıcıdan erişilebilen 2D mini oyunları ve büyük 3D oyunları tek hesap, profil, arkadaşlık, skor, başarı, turnuva ve sezon altyapısında birleştiren oyun platformudur.

**Ürün ilkeleri:** Önce kaliteli ve güvenli MVP; oyunların bağımsız dağıtımı; sunucu tarafından doğrulanan rekabet; mobil öncelikli uyumluluk; erişilebilirlik; performans; modüler monorepo.

### Hedefler
- MVP: 5 oyun (4 solo + 1 adet 1v1), kullanıcı/konuk akışı, profil, skor ve liderlik tabloları, temel moderasyon.
- Beta: arkadaşlar, davetler, odalar, XP, başarımlar, eşleştirme.
- Sonraki aşama: ilk büyük 3D oyun Neon Kart Racing, turnuvalar ve sezonlar.
- Uzun vadede: 50+ oyun; bu bir mimari kapasite hedefidir, ilk sürüm vaadi değildir.

### Kapsam dışı (ilk sürüm)
- Gerçek para, loot box, bahis, ücretli ödül ve kullanıcılar arası ticaret.
- Her 3D oyunu aynı anda geliştirme.
- Açık metin sohbet ve üçüncü tarafların denetimsiz oyun yüklemesi.
- Başlangıçta gereksiz mikroservis parçalanması.

## 2. Hedef kullanıcı ve deneyim

- Konuk: kataloğu gezer, desteklenen oyunları dener; kalıcı skor/profil yok.
- Kayıtlı oyuncu: profil, ilerleme, skor, favoriler, oyun geçmişi.
- Rekabetçi oyuncu: oyun bazlı derecelendirme, maçlar, sıralamalar.
- Moderatör: rapor inceleme, yaptırım, denetim kayıtları.
- Yönetici: oyun yayınlama, sürüm, içerik, kullanıcı, operasyon yönetimi.

### Temel kullanıcı akışları
1. Keşfet → oyun detay → cihaz uygunluk kontrolü → yükleme → oynama → sonuç → tekrar oyna.
2. Kayıt/giriş → profil → avatar/gizlilik → favori oyunlar → geçmiş.
3. Arkadaş ekle → davet gönder → özel oda → maç → doğrulanmış sonuç.
4. Görev → XP → seviye → başarım bildirimi.
5. Şikâyet → moderasyon kuyruğu → inceleme → karar → audit log.

## 3. Görsel kimlik ve tasarım sistemi

**Tema:** Arcade Pop + Premium Gaming UI; canlı, eğlenceli fakat düzenli; koyu lacivert-mor yüzeyler, renkli kartlar, seçili açık paneller.

| Token | Değer | Kullanım |
|---|---|---|
| `brand.purple` | `#7C3AED` (başlangıç değeri; özel tona ayarlanacak) | Ana CTA / marka |
| `accent.cyan` | `#06B6D4` | Multiplayer / bağlantı |
| `accent.yellow` | `#FFB703` | XP / ödül |
| `accent.pink` | `#FF4D8D` | Etkinlik / vurgu |
| `status.success` | `#2DD4A7` | Başarı / çevrim içi |
| `surface.navy` | `#12162D` | Koyu yüzey |

- Not: `#7C3AED` Tailwind'in varsayılan `violet-600` değeridir ve şablon görünümünün en tanıdık işaretlerinden biridir. Marka tonu korunarak ton/doygunluk özel olarak ayarlanacak; tüm renk skalaları projeye özgü üretilecek, Tailwind'in hazır paleti kullanılmayacak.
- Görsel dil şablon görünümünden kaçınır: gradyan metin, her yerde blur/glow, tekdüze kart ızgaraları, emoji ikonlar ve içi boş pazarlama metinleri kullanılmaz. Ayrıntılar `docs/design/direction.md` dosyasında.
- Yazı tipleri: Plus Jakarta Sans (gövde), Space Grotesk (başlık); font lisanslarını kontrol et.
- Spacing: 4 px ölçek; radius: 12/16/24/32 px; buton: 40/48/56 px.
- Kapak görseli: 16:10; container maksimum 1440 px.
- İkonlar: Lucide; özel oyun ikonları özgün hazırlanacak.
- Komponent durumları: default, hover, active, focus-visible, loading, disabled, error.
- WCAG 2.2 AA hedefi; klavye navigasyonu, kontrast, görünür odak, ekran okuyucu etiketleri.
- `prefers-reduced-motion`, yüksek kontrast, renk dışı durum göstergeleri.
- Tasarım dokümantasyonu ve Storybook; tokenlar tek kaynak olarak yönetilecek.

### Animasyon standartları
- Buton hover 150 ms; kart hover 200 ms; sayfa geçişi 250 ms; modal 180 ms.
- XP ilerleme 400–700 ms; başarım 600 ms; rekor konfeti 1–2 sn.
- Oyun sırasında dikkat dağıtan animasyonlar azaltılacak; düşük performans modunda kapatılacak.

## 4. Ekranlar ve responsive düzen

### 4.1 Ana sayfa
- Üst bar: logo, arama, bildirim, kullanıcı/avatar.
- Masaüstü sol sidebar (yaklaşık 240 px): Keşfet, Oyunlar, Favoriler, Arkadaşlar, Turnuvalar, Sıralama.
- Merkez: hero, hemen oyna, popüler oyunlar, kategoriler, öneriler, yeni oyunlar, etkinlikler.
- Opsiyonel sağ panel (~280 px): arkadaş durumu, görevler, mini sıralama.
- 1366 px altında sağ panel alt bölüme; 1024 px altında sidebar kompakt; mobilde alt navigasyon.
- Oyun kartı: kapak, ad, tür, mod, oyuncu sayısı (varsa), favori, durum, oynama CTA.
- Boş/yükleniyor/hata durumları ve skeletonlar.

### 4.2 Oyun kataloğu ve detay
- Arama, tür, 2D/3D, solo/multiplayer, yeni/popüler filtreleri.
- Oyun detay: kapak, açıklama, kontrol rehberi, yaş uygunluğu, cihaz gereksinimi, sürüm, oynama CTA.
- SEO metadata, canonical URL, paylaşım önizlemesi.

### 4.3 Oyun oynama ekranı
- Oyun adı, geri, ses, ayarlar, tam ekran; skor, rekor, süre (oyuna göre).
- GamePlayer canvas; loading, ready, playing, paused, finished, disconnected, error durumları.
- Sonuç modalı: doğrulanmış skor, rekor, XP, başarım, yeniden oyna, paylaş.
- Klavye/WASD, gamepad ve dokunmatik kontrol eşlemesi; oyun bazlı konfigürasyon.
- Mobilde oyun odaklı tam ekran; gerekiyorsa yatay yön önerisi, erişilebilir alternatif.

### 4.4 Oyuncu profili
- Banner, avatar, kullanıcı adı, durum, seviye, XP, oyun geçmişi.
- İstatistikler, oyun bazlı rating, başarımlar, favoriler, arkadaşlar.
- Gizlilik: geçmiş, arkadaşlar ve çevrim içi durum görünürlüğü.
- Kendi profili ve başkasının profili için ayrı izinler.

### 4.5 Sosyal, rekabet ve yönetim
- Arkadaş istekleri, engelleme, özel oda davetleri, bildirimler.
- Günlük/haftalık/tüm zamanlar sıralamaları; oyun bazlı skor formatları.
- Turnuva fikstürü, kayıt, sonuç, sezon bilgileri (MVP sonrası).
- Admin (`apps/web` içinde `/admin`, rol korumalı): oyun/sürüm, kullanıcı/rol, rapor, analitik, operasyon, audit log.

### 4.6 Mobil kurallar
- Dört alt sekme: Ana Sayfa, Oyunlar, Sıralama, Profil.
- En az 44×44 CSS px dokunmatik hedef; safe-area inset desteği.
- Görseller responsive; mobil oyunlarda performans profilleri.
- Oyun sırasında alt navigasyon gizlenebilir; çıkış kontrolü her zaman erişilebilir.

## 5. Oyun kataloğu ve yayın sırası

| Oyun | Motor | Mod | Hedef faz |
|---|---|---|---|
| Snake Rush | Phaser | Solo | MVP |
| Blok bulmacası (özgün isim belirlenecek) | Phaser | Solo | MVP |
| Memory Flip | Phaser | Solo | MVP |
| 2048 Fusion | Phaser | Solo | MVP |
| Connect Four | Phaser | 1v1 (sıra tabanlı) | MVP |
| Air Hockey | Phaser | 1v1 (gerçek zamanlı) | Faz 2 |
| Chess Arena | Phaser/React | 1v1 | Faz 2 |
| Drawing Party | Phaser/Canvas | 3–8 | Faz 2 |
| Trivia Battle | React/Phaser | 2–12 | Faz 2 |
| Pixel Survivors | Phaser | Solo/Co-op | Faz 3 |
| Neon Kart Racing | Babylon.js | 2–8 | Faz 3 |
| Party Parkour | Babylon.js | 2–12 | Faz 4 |
| Battle Arena | Babylon.js | 4–12 | Faz 4 |
| Mini Football | Babylon.js | 2v2/3v3 | Faz 4 |
| Puzzle Worlds | Babylon.js | 1–4 | Faz 4 |

**Durum (2026-10-21):** Tablodaki Faz 2 oyunları ve Neon Kart Racing kullanıcı isteğiyle öne çekildi ve yayında; hepsi çevrim içi odalarla, Air Hockey/satranç/Trivia ayrıca bilgisayara karşı ve aynı cihazda oynanır. Kalıcılık, hesap ve eşleştirme hâlâ planlandığı fazda.

**Önemli:** MVP'de tek 1v1 oyun var: sıra tabanlı Connect Four. Hamle doğrulaması basit olduğu için oda/WebSocket altyapısını düşük riskle kanıtlar. Sunucu otoriteli fizik gerektiren Air Hockey, bu altyapı oturduktan sonra Faz 2'de gelir ve Neon Kart Racing'in ağ katmanına da ön çalışma olur.

### Büyük 3D oyun prototipi: Neon Kart Racing
1. Bir pist, iki araç, kamera, giriş kontrolleri, temel sürüş fiziği.
2. Tek oyunculu tur zamanı ve yeniden başlatma.
3. Fizik determinizmi ve performans ölçümü.
4. Sunucu otoriteli 2 oyunculu prototip, istemci tahmini/interpolasyon.
5. Oda, yeniden bağlanma, bitiş sıralaması, yarış tekrarları/telemetri.
6. 2–8 oyuncu, araç özelleştirme, pist çeşitleri ve sezon sıralaması.

## 6. Teknik mimari

### Teknoloji seçimi
- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, Motion.
- UI primitive: Radix/shadcn/ui temelli özelleştirilmiş PLAYNEX komponentleri.
- 2D oyun: Phaser; 3D oyun: Babylon.js.
- Backend: Rust, Axum, Tokio; modüler monolit başlangıcı.
- Gerçek zamanlı: WebSocket; ihtiyaç halinde WebTransport değerlendirmesi.
- Kalıcı veri: PostgreSQL; cache/presence: Valkey veya Redis (Dragonfly yalnızca ölçek gerektirirse).
- i18n: Türkçe (varsayılan) + İngilizce; ilk sprintten itibaren, arayüzde gömülü metin yok.
- Asset: S3 uyumlu object storage + CDN; container: Docker/Coolify.
- Gözlemlenebilirlik: OpenTelemetry, Prometheus, Grafana, merkezi log ve hata izleme.

### Rust modülleri
`identity`, `players`, `games`, `sessions`, `scores`, `leaderboards`, `matchmaking`, `realtime`, `social`, `progression`, `tournaments`, `moderation`, `admin`.

### Game SDK sözleşmesi
- `initialize(gameId, version)` ve oyun manifest doğrulama.
- `player.getProfile()`, `session.start()`, `session.finish()`.
- Ayarlar, ses, fullscreen, input, lifecycle, hata raporlama.
- Multiplayer: lobby, join/leave, reconnect, ping, snapshot/events.
- SDK sadece istemci arayüzüdür; gönderilen skor ve sonuçlar güvenilir kabul edilmez.
- Oyun manifesti: slug, version, engine, asset entrypoint, integrity hash, capabilities, control schemes, orientation, min requirements.

### Oyun güven modeli
- Solo oyunlarda (MVP): makullük kontrolü (süre/skor oranı, imkânsız değerlerin reddi) + risk puanı. Tekrar oynatılabilir giriş kaydıyla tam sunucu doğrulaması yalnızca liderlik tablosunun ilk N sırasına girecek skorlar için yapılır.
- Sıra tabanlı oyunlarda tüm hamleler sunucuda doğrulanır.
- Fizik/aksiyon oyunlarında sunucu otoriteli simülasyon, tick ve snapshot; istemci tahmini/interpolasyon.
- Maç sonlandırma idempotent; ödül ve skor kaydı transaction içinde.
- Reconnect süresi, AFK, timeout ve hile itiraz kuralları oyun bazlı tanımlanır.

### Next.js render ve yükleme
- Ana sayfa/katalog/detay: Server Components; etkileşimli adalar Client Components.
- Oyun motoru: client-only dynamic import; oyun varlıkları seçilene kadar indirilmez.
- Profil: sunucu verisi + etkileşimli istemci bölümleri.
- Auth ve veri yetkileri Rust API'de zorunlu; UI koruması tek güvenlik katmanı değil.
- Oyun varlıkları sürümlü ve CDN cache'li; yeni sürümde cache invalidation.

## 7. Veritabanı modeli

### Ana tablolar
| Tablo | Alanlar / amaç |
|---|---|
| `users` | id, username(unique), status, created_at |
| `auth_identities` | user_id, provider, provider_subject(unique) |
| `sessions_auth` | id, user_id, expires_at, revoked_at, token_hash |
| `player_profiles` | user_id, display_name, avatar_id, privacy_settings |
| `games` | id, slug(unique), title, engine, status, category |
| `game_versions` | id, game_id, version, manifest_url, checksum, published_at |
| `game_sessions` | id, game_id, user_id, version_id, started_at, ended_at, status |
| `scores` | id, session_id, game_id, user_id, score, risk_score, verification_status, verified_at, created_at |
| `leaderboards` | id, game_id, season_id, scoring_rule, window |
| `leaderboard_entries` | leaderboard_id, user_id, best_score, updated_at |
| `friendships` | requester_id, addressee_id, status, timestamps |
| `blocks` | blocker_id, blocked_id, created_at |
| `matches` | id, game_id, room_id, state, started_at, ended_at |
| `match_players` | match_id, user_id, team_id, result, rating_delta |
| `achievements` | id, game_id(nullable), requirement, points |
| `player_achievements` | user_id, achievement_id, unlocked_at |
| `xp_events` | id, user_id, source, amount, created_at |
| `seasons` | id, start_at, end_at, state |
| `tournaments` | id, game_id, season_id, state, starts_at |
| `tournament_entries` | tournament_id, user_id, status |
| `reports` | id, reporter_id, target_id, reason, state |
| `moderation_actions` | id, moderator_id, target_id, action, expires_at |
| `audit_logs` | id, actor_id, action, metadata, created_at |

### Veri kuralları
- UUID/UUIDv7 gibi uygun kimlikler; FK ve unique/check constraint'ler.
- Skorlar için `(game_id, score, created_at)` indeksi; `scores.game_id` oturumdan denormalize edilir ve tutarlılığı constraint ile korunur.
- İdempotency key, optimistic concurrency, transaction ve outbox gerektiğinde.
- Oyun bazlı leaderboard semantiği (yüksek skor mu düşük süre mi) konfigürasyondan.
- Büyük event/session tabloları için arşiv ve partition planı.
- PII için saklama, dışa aktarma ve silme prosedürleri; denetim kayıtları ayrı retention.

## 8. API ve gerçek zamanlı protokol

### Örnek REST uçları
- `GET /v1/games`, `GET /v1/games/{slug}`, `GET /v1/games/{slug}/versions/current`
- `GET /v1/me`, `PATCH /v1/me/profile`, `GET /v1/players/{username}`
- `POST /v1/game-sessions`, `POST /v1/game-sessions/{id}/finish`
- `GET /v1/leaderboards/{id}`
- `GET /v1/friends`, `POST /v1/friend-requests`, `POST /v1/blocks`
- `POST /v1/rooms`, `POST /v1/rooms/{id}/join`
- `GET /v1/achievements`, `GET /v1/me/achievements`
- `POST /v1/reports`

### WebSocket mesaj aileleri
`hello/auth`, `presence`, `room.create/join/leave`, `match.ready/start`, `input`, `state.snapshot`, `event`, `ping/pong`, `reconnect`, `match.finish`, `error`.

- Protokol sürümlenecek; schema validation, payload limitleri, sequence numarası ve timeout kuralları uygulanacak.
- Her oda/maç için yetkilendirme ve sunucu otoritesi.
- İstemci mesajlarının tekrar oynatılması ve sıralama hataları ele alınacak.

## 9. Kimlik, güvenlik ve moderasyon

- OAuth ve Passkey/WebAuthn; güvenli HttpOnly/Secure/SameSite cookie oturumları. İlk sürüm kullanıcı adı + şifre ve e-posta doğrulama koduyla açıldı (ADR 0011); OAuth ve Passkey sonraki adım.
- Yönetici için zorunlu güçlü MFA, RBAC ve ayrıntılı audit log.
- CSRF/XSS/CSP, CORS allowlist, input validation, rate limit, abuse koruması.
- Skor manipülasyonu, bot, spam ve hile tespiti; manuel inceleme yolu.
- Yaşa uygun deneyim, gizlilik, kullanıcı engelleme ve raporlama.
- İlk sürümde serbest sohbet yok; ileride moderasyon kapasitesiyle açılabilir.
- KVKK ve hedef ülkelerde çocukların verileri/çevrim içi güvenlik yükümlülükleri için hukuk incelemesi.
- Üçüncü taraf oyunlar ileride kabul edilirse ayrı origin/sandbox, izinler ve inceleme sistemi.
- Yazılım bağımlılık taraması, secret yönetimi, imzalı artifact ve sürüm geri alma.

## 10. Performans, kalite ve erişilebilirlik

- Web Core Web Vitals hedefi: LCP <2,5 sn, INP <200 ms, CLS <0,1 (p75).
- 2D 60 FPS hedefi; 3D mobil 30–60 FPS, masaüstü 60 FPS; cihaz bazlı test.
- Oyun paketlerinde ayrı boyut ve açılış süresi bütçesi; lazy load ve asset streaming.
- AVIF/WebP, responsive image, compressed texture, mesh/LOD optimizasyonu.
- Unit/integration/e2e, oyun kuralları property tests, load/soak test, erişilebilirlik testi.
- Tarayıcı matrisi: güncel Chrome, Edge, Firefox, Safari; Android/iOS gerçek cihaz testleri.
- Ağ kopması, yüksek gecikme, düşük FPS, sekme arka plana alınması senaryoları.

## 11. Yönetim ve analitik

- Admin: oyun sürümü yayınla/gizle/rollback, kategori/hero, kullanıcı/rol, rapor/yaptırım, sezon/turnuva.
- Analitik: DAU/MAU, retention D1/D7/D30, oyun başlatma, tamamlanma, oturum süresi, hata oranı.
- Multiplayer: eşleştirme bekleme, reconnect, p50/p95 gecikme, oda sayısı, tick süresi.
- Gizlilik odaklı olay takibi; gereksiz kişisel veri toplama yok.
- Yönetim işlemleri audit log ve yetki kontrolleriyle kayıt altında.

## 12. Dağıtım, ortamlar ve yedekleme

- Development: tamamen Docker Compose. Host'ta yalnızca Docker ve Git gerekir; Node, pnpm, Rust ve veritabanı container içinde çalışır.
  - Servisler: `web` (Next.js), `storybook`, `api` (Rust Axum), `realtime` (Rust WS), `postgres`, `valkey`, `storage` (RustFS; S3 uyumlu yerel depolama — MinIO imajları artık dağıtılmadığı için, bkz. ADR 0007), `mailpit` (yerel e-posta).
  - Kaynak kod bind mount ile bağlanır, hot reload çalışır; `node_modules`, pnpm store ve Cargo `target` named volume'larda tutulur.
  - Tüm komutlar container içinden: `docker compose exec web pnpm ...`, `docker compose exec api cargo ...`. Kısa yollar kökteki `Makefile` ile.
  - Seed verisi ve migration'lar ayrı bir `docker compose run` adımıyla çalışır.
  - Geliştirme ortam değişkenleri `infrastructure/development.env` üzerinden belgelenir; gerçek `.env` ve secret'lar repoya girmez.
- Üretim imajları: multi-stage Dockerfile, non-root kullanıcı, healthcheck, sabitlenmiş base image sürümleri.
- Staging: üretime yakın test ortamı, sentetik oyuncular, load test.
- Production: ayrı erişim sınırları, reverse proxy/WAF/CDN, izleme ve uyarı. İlk ortam Coolify üzerinde `playnex.meccode.com`; tek giriş `edge`, diğer servisler iç ağda (`docs/deployment/coolify.md`).
- CI: lint, typecheck, unit test, Rust test, migration check, build, dependency scan.
- CD: staging otomatik; production onaylı, kademeli ve geri alınabilir dağıtım.
- PostgreSQL düzenli yedek ve point-in-time recovery hedefi; geri yükleme tatbikatı.
- Object storage sürümleme ve retention; şifreleme ve erişim kontrolü.
- RPO/RTO ve kapasite tahmini gerçek kullanıcı hedefleri netleşince kararlaştırılacak.

## 13. Monorepo yapısı

```text
playnex/
├── apps/
│   ├── web/                  # Next.js platform
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (public)/
│   │       │   ├── (auth)/
│   │       │   ├── (platform)/
│   │       │   ├── (admin)/admin/  # rol korumalı yönetim
│   │       │   └── play/[gameSlug]/
│   │       ├── components/
│   │       ├── features/
│   │       ├── hooks/
│   │       ├── i18n/
│   │       ├── lib/
│   │       └── styles/
│   ├── api/                  # Rust Axum
│   └── realtime/             # Rust WS runtime
├── games/
│   ├── 2d/
│   │   ├── snake-rush/
│   │   ├── block-puzzle/     # nihai isim belirlenince yeniden adlandırılır
│   │   ├── memory-flip/
│   │   ├── 2048-fusion/
│   │   ├── connect-four/
│   │   └── air-hockey/       # Faz 2
│   └── 3d/
│       ├── neon-kart-racing/
│       ├── party-parkour/
│       └── battle-arena/
├── packages/
│   ├── ui/
│   ├── design-tokens/
│   ├── game-sdk/
│   ├── shared-types/
│   └── config/
├── crates/                   # 6. bölümdeki Rust modülleriyle birebir
│   ├── identity/
│   ├── players/
│   ├── games/
│   ├── sessions/
│   ├── scores/
│   ├── leaderboards/
│   ├── matchmaking/
│   ├── realtime/
│   ├── social/
│   ├── progression/
│   ├── tournaments/
│   ├── moderation/
│   ├── admin/
│   └── game-protocol/        # paylaşılan WS mesaj şemaları
├── infrastructure/
│   ├── docker/
│   ├── monitoring/
│   └── migrations/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── games/
│   ├── design/
│   └── decisions/
├── compose.yaml
├── Makefile
├── pnpm-workspace.yaml
├── turbo.json
├── Cargo.toml
├── PLAN.md
└── README.md
```

- pnpm/Turborepo + Cargo workspace; ortak sürümleme ve kod sahipliği.
- OpenAPI sözleşmesinden tip üretimi; API ve frontend tiplerinin tutarlılığı.

## 14. Yol haritası ve iş paketleri

> Süreler küçük ekip için kaba tahmindir; paralel çalışma, kalite ve oyun kapsamına göre değişir.

### Faz 0 — Keşif ve temel tasarım (2–3 hafta)
- [ ] Hedef oyuncu segmentleri ve başarı ölçütleri
- [ ] Marka adı, domain, marka/telif ön araştırması
- [ ] UX akışları ve ekran haritası
- [ ] Renk/font/token seti, component spec, responsive kurallar
- [ ] Ana sayfa, oyun ekranı, profil wireframe ve yüksek sadakatli tasarım
- [ ] Mimari karar kayıtları (ADR), veri modeli ve güvenlik risk analizi
- [x] Monorepo, CI, dev ortamı ve kod standartları

**Çıkış kriteri:** Tasarım sistemi, mimari ve kapsam onaylı; geliştirme ortamı çalışır.

### Faz 1 — Platform MVP (6–10 hafta)
- [x] Next.js layout, sidebar, mobil nav, tema ve UI kütüphanesi
- [x] Katalog, arama, filtreler, oyun detay ve loading/error ekranları
- [x] Rust API, PostgreSQL migration, auth ve profil (kullanıcı adı + şifre, e-posta kodu ile doğrulama; ADR 0011)
- [x] Game SDK v1, manifest, lazy loader, GamePlayer, HUD
- [x] Snake Rush, blok bulmacası (Tuğla Tuğla), Memory Flip, 2048 Fusion (istemci tarafı; skor doğrulaması sprint 6)
- [x] Connect Four (1v1): temel oda ve sunucuda hamle doğrulama
- [ ] Skor doğrulama, liderlik tabloları, favoriler, oyun geçmişi
- [ ] Temel raporlama, admin ve operasyon paneli
- [ ] E2E, mobil, performans, erişilebilirlik ve güvenlik testleri
- [ ] Kapalı beta, geri bildirim ve hata düzeltmeleri

**Çıkış kriteri:** 5 oyun başlatılır; güvenli oturum, doğrulanmış skor, mobil uyum ve yedek geri yükleme testi çalışır.

### Faz 2 — Sosyal ve rekabet (5–8 hafta)
- [ ] Arkadaşlık, engelleme, davet, çevrim içi durum
- [ ] Özel odalar ve eşleştirme (özel odalar kodla hazır, ADR 0009; eşleştirme kuyruğu ve kalıcılık açık)
- [x] Air Hockey: sunucu otoriteli fizik, istemci tahmini/interpolasyon
- [ ] XP, seviye, başarımlar, günlük/haftalık görevler
- [ ] Oyun bazlı MMR/rating ve sezon sıralamaları
- [ ] Bildirim, moderasyon, analitik ve ölçek testleri
- [x] Chess Arena, Drawing Party, Trivia Battle için önceliklendirme (üçü de yayında: solo/yerel/çevrim içi)
- [ ] Herkese açık beta

### Faz 3 — İlk büyük 3D oyun (10–18+ hafta)
- [ ] Babylon.js oyun temel projesi ve asset pipeline (temel proje hazır, ADR 0010; asset pipeline yok, sahne primitiflerden)
- [x] Neon Kart Racing tek oyunculu vertical slice
- [x] Sunucu otoriteli yarış prototipi ve ağ senkronizasyonu
- [x] 2–8 oyuncu, odalar, bitiş sonuçları ve reconnect
- [ ] Düşük donanım profilleri, mobil optimizasyon, yük testi
- [ ] Sınırlı 3D beta ve telemetriyle iyileştirme

### Faz 4 — Ölçek ve içerik (sürekli)
- [ ] Party Parkour, Battle Arena, Mini Football, Puzzle Worlds
- [ ] Turnuvalar, sezonlar, içerik yönetimi ve kozmetik ödüller
- [ ] 50+ oyun için katalog, yayın ve asset pipeline kapasitesi
- [ ] Çoklu oyun sunucusu, kapasite planlama ve bölgesel dağıtım
- [ ] İleri anti-cheat, operasyon ve maliyet optimizasyonu

## 15. MVP kabul testleri

- [ ] Oyuncu güvenli kayıt/giriş ve çıkış yapabiliyor.
- [ ] Konuk desteklenen oyunları deneyebiliyor.
- [ ] Beş oyun doğru sürümle yükleniyor ve oynanabiliyor.
- [ ] Mobil/masaüstü temel etkileşimler çalışıyor.
- [ ] Oyun sonucu sunucu tarafından doğrulanıyor; sahte skor reddediliyor.
- [ ] Oyuncu geçmiş ve rekorunu görebiliyor.
- [ ] Liderlik tablosu oyun kurallarına göre doğru sıralanıyor.
- [ ] Yetkisiz API erişimi reddediliyor.
- [ ] Oyun sürümü güvenli şekilde geri alınabiliyor.
- [ ] Hata, yüklenme ve bağlantı kopma durumları kullanıcıya gösteriliyor.
- [ ] Moderasyon raporu oluşturulup işlenebiliyor.
- [ ] Veritabanı yedeğinden geri yükleme testi başarılı.
- [ ] Erişilebilirlik ve performans testlerinde kritik engel yok.

## 16. Riskler ve azaltma planı

| Risk | Önlem |
|---|---|
| Kapsamın büyümesi | MVP kilidi, fazlı oyun teslimatı |
| Çok oyunculu hile | Sunucu otoritesi, doğrulama, replay/telemetri |
| 3D performans | Vertical slice, cihaz matrisi, kalite profilleri |
| Aşırı asset boyutu | Lazy load, CDN, sıkıştırma, sürümleme |
| Çocuk güvenliği | Yaş uygunluğu, raporlama, kontrollü iletişim |
| Hukuki/marka benzerliği | Marka/telif ve KVKK incelemesi |
| Operasyonel kesinti | İzleme, yedek, rollback, yük testi |
| Veritabanı büyümesi | İndeks, retention, partition/arşiv |

## 17. Açık kararlar

**Karara bağlananlar (v1.1)**
- [x] İlk çıkış dilleri: Türkçe (varsayılan) + İngilizce
- [x] 1v1 oyunların MVP kapsamı: yalnızca Connect Four; Air Hockey Faz 2
- [x] Admin konumu: `apps/web` içinde `/admin`
- [x] Cache/presence: Valkey veya Redis

**Açık kalanlar**
- [ ] PLAYNEX marka kullanılabilirliği (domain: `playnex.meccode.com`)
- [ ] Blok bulmacasının özgün adı
- [ ] Başlangıç hedef eşzamanlı oyuncu ve bütçe
- [ ] Yaş politikası ve hedef ülkeler (öneri: 13+, Türkiye + seçili ülkeler; 13 yaş altı ayrı proje). Mimariyi etkilediği için Faz 0'da kapanmalı.
- [ ] Backend dili: ekipte Rust tecrübesi yoksa platform API'si TypeScript, Rust yalnızca `realtime` (öneri; ekip bilgisine göre karar)
- [ ] E-posta/OAuth/Passkey sağlayıcıları (öneri: hazır sağlayıcı veya olgun kütüphane; admin için MFA zorunlu)
- [ ] CDN, object storage ve barındırma sağlayıcısı
- [ ] İlk 3D oyunun kalite çıtası ve hedef cihazları
- [ ] Gelir modeli; özellikle reklam olup olmayacağı şimdiden netleşmeli (yaş politikası, CSP ve gizlilik metnini etkiler)

## 18. İlk sprint — Uygulama sırası

1. Monorepo ve Docker Compose geliştirme ortamını kur; Next.js, Rust workspace, pnpm/Turborepo, i18n ve CI. `docker compose up` ile her şey ayağa kalkmalı.
2. Tasarım yönü dokümanı (`docs/design/direction.md`) yaz ve onaylat; ardından tasarım tokenları, tipografi, Tailwind theme, Storybook oluştur.
3. Button, GameCard, Sidebar, Topbar, MobileNav, Modal, Skeleton bileşenlerini geliştir.
4. Mock verilerle responsive ana sayfa, katalog, oyun detay ve profil ekranlarını tamamla.
5. GamePlayer shell: loading, ready, playing, paused, finished, error.
6. Rust healthcheck, PostgreSQL migration ve oyun kataloğu endpoint'lerini ekle.
7. Game SDK sözleşmesini yaz; Snake Rush ile uçtan uca prototip yap.
8. Test ve erişilebilirlik kontrolünden sonra sprint demosu hazırla.

---

**Yürütme kuralı:** Her iş için issue, sorumlu, bağımlılık, kabul kriteri ve test tanımlanacak. Her faz sonunda demo, güvenlik/performans kontrolü ve güncellenmiş mimari karar kaydı hazırlanacak.