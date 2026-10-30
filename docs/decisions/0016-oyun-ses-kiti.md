# ADR 0016 — Oyun ses kiti

- Durum: Kabul edildi
- Tarih: 2026-10-30

## Bağlam

Ses bugün yalnızca Siper'de var. 211 oyunda ses dosyası kullanmak lisans takibi ve paket boyutu demek; her oyunun kendi sentez kodunu yazması ise aynı kodun yüzlerce kopyası.

## Karar

- `@playnex/game-audio` paketi, `game-sdk` içindeki `AudioMixer` üzerinde çalışır. Ses dosyası ve lisanslı müzik yok; her şey çalışma anında sentezlenir.
- Efektler veri olarak tanımlanır: bir tarif, ton ve filtreli gürültü katmanlarından oluşur. `pitch` seçeneği tarifi tekrar yazmadan perde yükseltir; kombo serileri bunu kullanır.
- Müzik tohumdan bestelenir (`composeTheme`). Aynı tohum aynı müziği verir, oyunlar slug'dan türetilen tohumla birbirinden ayrışır. Hicaz, uşşak ve nihavent benzeri diziler bu listededir; uşşak'ın çeyrek sesi osilatörde doğrudan çalınır.
- Yoğunluk dört katmandır (bas, davul, melodi, oktav). Menü aynı temanın davulsuz ve yavaş halidir.
- Titreşim aynı API'den gelir ve ayara bağlıdır.

## Sonuçlar

- Sesler kayıt kalitesinde değildir; görsel dilimiz gibi sade ve sentetiktir.
- Sentez kodu ana iş parçacığında bir zamanlayıcıyla notaları önden sıraya koyar; sekme arka plandayken tarayıcı zamanlayıcıyı yavaşlattığında müzik kısa süre boşluk verebilir.
- Siper'in sentez kodu yenileme aşamasında bu pakete taşınır.
