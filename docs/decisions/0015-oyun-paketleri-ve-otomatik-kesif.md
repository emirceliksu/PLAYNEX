# ADR 0015 — Oyun paketlerinin ortak bağımlılığı ve otomatik keşif

- Durum: Kabul edildi
- Tarih: 2026-10-30

## Bağlam

Katalog 211 oyuna çıkıyor. Oyun eklemek bugün dokuz yere dokunmayı gerektiriyor; bunlardan biri `compose.yaml`'daki oyun başına `node_modules` volume'u. 211 volume hem compose dosyasını okunmaz hale getirir hem her container açılışında yüzlerce mount demektir. Aynı şekilde oyun başına `tsconfig`, eslint ayarı ve turbo görevi 211 ayrı süreç anlamına gelir.

Bind mount üzerinde `node_modules` tutulamaz (ADR 0002): Windows ve macOS host'ta hem yavaş hem symlink sorunlu.

## Seçenekler

1. **Compose dosyasını üretmek.** Bugünkü düzen korunur, ama 211 volume kalır ve her yeni oyunda `docker compose up` gerekir. Sorunu gizler.
2. **Tek volume'u tüm oyunlara paylaştırmak.** Docker bir volume'u birçok yola bağlayabilir, ama pnpm her pakete kendi symlink'lerini yazdığı için oyunlar birbirinin üstüne yazar.
3. **Oyunların bağımlılık bildirmemesi, ortak `games` paketi.** `games/package.json` (`@playnex/games`) motorları ve araçları bir kez bildirir, tek volume `games/node_modules` üzerine bağlanır. `games/2d/<slug>` paketlerinde `dependencies` yoktur; Node ve TypeScript çözümlemesi üst dizine yürüyerek `games/node_modules`'u bulur.
4. **pnpm `nodeLinker: hoisted`.** Tüm depoyu düz yapıya geçirir; pnpm'in hayalet bağımlılık korumasını web ve paketlerden de kaldırır. Çözülecek sorundan büyük bir değişiklik.

## Karar

Seçenek 3.

- Oyun paketinde yalnızca `name`, `version`, `type`, `exports` bulunur. `tsconfig`, eslint ayarı ve `lint`/`typecheck` görevleri `games/` altında tektir.
- Motor sürümü (Phaser, Babylon) tüm oyunlarda aynıdır. Bir oyunun farklı sürüm istemesi desteklenmez; bilinçli bir kısıttır.
- Yeni bir oyuna özel bağımlılık `games/package.json`'a eklenir.

## Sonuçlar

- `compose.yaml`'dan 11 volume kalktı, bir tane eklendi; yeni oyun compose dosyasına dokunmaz.
- Tüm oyunlar tek `tsc` ve tek `eslint` koşusuyla denetlenir. Hatalı bir oyun tüm görevi kırar; kırık oyun bırakılmaması zaten kuraldır.
- Bir oyunun koduna gelen bağımlılık, başka bir oyun için eklenmiş paketi de görebilir. Bağımlılık listesi kısa tutulduğu için kabul edildi.
- Eski `node_modules_game_*` volume'ları artık kullanılmaz; `docker volume prune` ile silinebilir.
