# ADR 0008 — Game SDK sözleşmesi, Phaser 4 ve oyun paketleri

- Durum: Kabul edildi
- Tarih: 2026-10-21

## Bağlam

`PLAN.md` 6. bölüm, oyunların bağımsız dağıtılan paketler olmasını ve platformla yalnızca bir SDK arayüzü üzerinden konuşmasını istiyor. İlk oynanabilir oyunlar ilk sprintte istendi; sunucu tarafı (oturum, skor doğrulama) henüz yok.

## Karar

- `packages/game-sdk`, yalnızca tip ve iki yardımcıdan oluşan ince bir sözleşmedir: `GameModule { manifest, mount(container, host) }`, `GameInstance { start, pause, resume, restart, destroy }`, `GameHost { locale, reducedMotion, palette, onScore, onStateChange, onFinish, onError }`. Oyunlar `defineGame` ile tanımlanır.
- Renkler `GamePalette` ile sRGB hex olarak verilir; `design-tokens` içindeki `oklchToHex` OKLCH tokenları dönüştürür. Oyun kodunda hex sabiti yoktur.
- Her oyun `games/2d/<slug>/` altında bir workspace paketidir (`@playnex/game-<slug>`), Phaser 4.2.1 kullanır ve saf oyun mantığını Phaser'dan ayrı dosyada tutar.
- Web, oyunları `src/lib/games/registry.ts` içindeki dinamik import tablosuyla yükler; Phaser ve oyun kodu yalnızca oynama sayfasında indirilir. Yeni oyun: paket + `registry` satırı + `compose.yaml` volume'u + `transpilePackages`.
- GamePlayer kabuğu (`features/game-player`) durum makinesini (`loading/ready/playing/paused/finished/error`) `useReducer` ile tutar; rekor şimdilik tarayıcıda (`localStorage`) saklanır ve arayüzde böyle söylenir. Sunucu doğrulaması (PLAN 6, oyun güven modeli) sprint 6'da gelecek; SDK'nın `onFinish` sonucu güvenilir kabul edilmez.
- Klavye yakalama yalnızca oyun `playing` durumundayken açılır; sayfa diğer durumlarda normal kaydırılır.

## Sonuçlar

- Phaser 4 tiplerinde Phaser 3'ten farklar var (`Graphics.fillPoints` `Vector2[]` ister, `Scene.update` `override` gerektirir); yeni oyunlar mevcut üç oyunun yapısını kopyalar.
- Connect Four şimdilik aynı cihazda iki kişi (hot-seat); oda/WebSocket akışı `realtime` servisiyle birlikte gelecek.
