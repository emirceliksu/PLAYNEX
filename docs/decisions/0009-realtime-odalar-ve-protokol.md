# ADR 0009 — Realtime odaları, WebSocket protokolü ve misafir kimliği

- Durum: Kabul edildi
- Tarih: 2026-10-21

## Bağlam

"Yakında" görünen beş oyunun (Air Hockey, Chess Arena, Drawing Party, Trivia Battle, Neon Kart Racing) tamamı planda çevrim içi. Kullanıcı önce çevrim içi altyapının kurulmasını istedi. Hesap sistemi (PLAN 9), PostgreSQL şeması (PLAN 7) ve Valkey kullanımı henüz yok; PLAN 6 oyun güven modeli sıra tabanlı oyunlarda hamlenin, aksiyon oyunlarında simülasyonun sunucuda yapılmasını istiyor.

## Karar

- Odalar `apps/realtime` içinde, bellekte ve tek instance'ta yaşar. Ayrı crate açılmadı; tek tüketici var (ADR 0006 ile aynı gerekçe).
- Uç nokta `GET /ws`. `Origin` başlığı `REALTIME_ALLOWED_ORIGINS` listesinde değilse 403. Çerçeve sınırı 16 KB, bağlantı başına token bucket (120 kapasite, 90/sn).
- Protokol JSON zarfıdır: `{ v: 1, seq, type, payload }`. İstemci tipleri: `hello`, `room.create`, `room.join`, `room.leave`, `match.ready`, `match.start`, `input`, `ping`. Sunucu tipleri: `hello`, `room.state`, `room.left`, `match.start`, `state.snapshot`, `event`, `match.finish`, `pong`, `error { code }`. Hata kodları istemcide i18n anahtarına çevrilir. Geri giden `seq` sessizce düşürülür.
- Kimlik misafir takma adıdır (2–16 karakter). Sunucu HMAC-SHA256 imzalı bir yeniden bağlanma token'ı verir (`REALTIME_TOKEN_SECRET`); token yalnızca aynı oyuncu kimliğini geri almayı sağlar, yetki taşımaz. Bağlantı koparsa koltuk 30 sn tutulur, sonra oyuncu çekilmiş sayılır.
- Her oda kendi tokio görevidir. Oyun kuralları `Match` trait'iyle (`start/input/tick/sync/forfeit/outcome`) ayrı modüllerde: `connect_four`, `chess` (`shakmaty`), `air_hockey` (60 Hz fizik, 30 Hz snapshot), `trivia`, `drawing`, `kart` (30 Hz kinematik model). Sonuç sunucuda belirlenir; istemci yalnızca girdi gönderir.
- Fizik/model sabitleri ve içerik (masa, pist, soru bankası, kelime listesi) `games/*/<slug>/data/*.json` dosyalarında tek kaynaktır; Rust `include_str!`, istemci import ile okur. Soru metinleri istemcide yerelleştirilir, sunucu yalnızca soru kimliği gönderir; böylece farklı dildeki oyuncular aynı odada oynar.
- Drawing Party'de yanlış tahminler yalnızca tahmin edene döner (PLAN 9: serbest sohbet yok).

## Sonuçlar

- Servis yeniden başlarsa açık odalar kaybolur; ölçek için oda durumu Valkey'e ve maç sonuçları PostgreSQL'e (`matches`, `match_players`) taşınacak. Bu, hesap ve migration işiyle birlikte yapılacak.
- Eşleştirme kuyruğu ve MMR yok; odalar kodla kurulur ve paylaşılır.
- Air Hockey ve Kart istemcileri aynı modeli TypeScript'te de çalıştırır (yerel mod, tahmin); iki uygulama aynı JSON sabitlerini okur ve birlikte değiştirilir.
- `cargo watch` veri klasörlerini de izler; JSON değişince servis yeniden derlenir.
