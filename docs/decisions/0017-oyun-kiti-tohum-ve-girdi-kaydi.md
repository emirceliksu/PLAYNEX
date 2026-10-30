# ADR 0017 — Oyun kiti, tohum ve girdi kaydı

- Durum: Kabul edildi
- Tarih: 2026-10-30

## Bağlam

Mevcut 2D oyunlarda parçacık, sarsıntı ve vuruş duraksaması yok; her yeni oyun bunları baştan yazarsa 211 farklı his ve 211 farklı erişilebilirlik hatası çıkar. Skor doğrulaması da henüz yok; tek kişilik oyunlar sonradan doğrulanabilir yazılmazsa bu iş ileride tek tek oyun yeniden yazmak demektir.

## Karar

- `@playnex/game-kit` motordan bağımsız çekirdek ile iki ayrı giriş noktası sunar: `@playnex/game-kit/phaser` ve `@playnex/game-kit/babylon`. 2D bir oyun Babylon'u paketine almaz.
- Juice API'si `reducedMotion` değerini kurucuda alır; oyun kodu kontrol yazmaz. Azaltılmış harekette sarsıntı, duraksama ve parçacık kapanır, bilgi taşıyan puan yazısı kalır.
- `hitStop` oyunu durdurmaz, `frozen` bayrağını kaldırır. Simülasyon adımı oyunda olduğu için atlamak da oyunun işidir.
- Tek kişilik her oyun `createRng(seed)` ile çalışır, `Math.random` oyun mantığında kullanılmaz (görsel efektlerde serbesttir). `InputRecorder` tohum ve girdileri tutar; ileride sunucu aynı koşuyu yeniden oynatarak skoru doğrular.
- Günlük meydan okuma `dailySeed(slug)` ile UTC tarihinden gelir.
- Duraklatma ve sonuç ekranı kitte yoktur; platform kabuğu (`game-player`) bunları zaten sağlar.
- İlerleme şimdilik `localStorage`'dadır ve yazılamadığında oyun devam eder. Hesap tarafı platform ilerlemesi ile bağlanır.

## Sonuçlar

- Kit bir paket olduğu için Tailwind taramasına ayrıca eklendi.
- Babylon juice, parçacıkları kutu mesh olarak üretir; yoğun sahnelerde örnekleme (instancing) gerekebilir.
- Girdi kaydı çoğu oyun için küçüktür; saniyede çok girdi üreten oyunlarda sıkıştırma ileride gerekebilir.
