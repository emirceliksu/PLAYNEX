# ADR 0010 — Babylon.js 3D oyunları ve TS/Rust model aynası

- Durum: Kabul edildi
- Tarih: 2026-10-21

## Bağlam

Neon Kart Racing platformun ilk 3D oyunu. PLAN 5, oyunun önce tek oyunculu bir dilimle, ardından sunucu otoriteli çok oyunculu yarışla gelmesini istiyor. Air Hockey de aynı soruyu 2D'de soruyor: fizik sunucuda dönerken istemci gecikmesiz nasıl tepki verecek?

## Karar

- 3D oyunlar `games/3d/<slug>` altında workspace paketidir (`pnpm-workspace.yaml` ve `compose.yaml` buna göre genişledi). Motor `@babylonjs/core` 9.31.0; oyun yalnızca oynama sayfasında dinamik import ile yüklenir.
- Babylon kök paketten içe aktarılır. 9.x'teki `.pure` modülleri yan etkisiz olduğu için shader ve builder kayıtlarını elle yapmayı gerektiriyor; bu karmaşıklık ilk oyun için ertelendi, paket boyutu sonradan ölçülüp ele alınacak.
- Sahne tamamen primitiflerden kurulur (ribbon pist, kutu kartlar, koni pilonlar); model dosyası ve doku yok. Renkler `host.palette`'ten, ışık düz, glow/post-process yok.
- Sürüş modeli kinematiktir (hız, yön, pist dışı sürtünme, duvar sınırı); fizik motoru yok. Pist ve sabitler `data/track.json`'da; Rust `kart.rs` ve TS `model.ts` aynı Catmull-Rom örneklemesini ve aynı adım fonksiyonunu uygular. Air Hockey'de aynı düzen `table.json`, `air_hockey.rs`, `physics.ts`.
- Çevrim içinde sunucu 30 Hz'de simüle eder ve her tick snapshot yollar. İstemci kendi kartını aynı modelle tahmin eder; snapshot gelince sunucu durumunu alır ve `ack`'ten sonraki girdileri yeniden oynatır. Diğer kartlar 100 ms gecikmeyle iki snapshot arasında enterpolasyonla çizilir.
- Solo yarışta üç bot vardır; zorluk tavan hız ve bakış mesafesiyle ayarlanır. Botların üç zorlukta da turu duvara değmeden bitirdiği simülasyonla doğrulandı (kolay ~124 sn, orta ~100 sn, zor ~85 sn).
- HUD ve dokunmatik düğmeler DOM'dur (token sınıfları); `apps/web/src/styles/globals.css` Tailwind'e `games/` klasörünü de taratır.

## Sonuçlar

- İki model kopyası birlikte değişmeli; ufak kayan nokta farkları uzlaştırmayla düzelir, ama kural farkı görünür sıçrama yaratır. Değişiklikte `cargo test -p playnex-realtime` ve oyun içi deneme birlikte yapılır.
- Kartlar arası çarpışma yalnızca itme ile çözülür ve istemcide tahmin edilmez; temasta küçük düzeltmeler görülebilir.
- Yarış tekrarları, telemetri ve pist çeşitleri PLAN Faz 3'ün sonraki maddeleri olarak açık kalır.
