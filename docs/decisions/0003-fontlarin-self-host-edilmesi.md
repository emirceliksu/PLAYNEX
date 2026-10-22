# ADR 0003 — Fontların dosya olarak self-host edilmesi

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

Başlık fontu Space Grotesk, gövde fontu Plus Jakarta Sans (`PLAN.md` 3). Fontlar hem Next.js'te (`next/font`) hem Storybook'ta aynı görünmeli; Docker ve CI'da dış ağa bağımlılık istenmiyor. Türkçe karakterler için `latin-ext` kapsamı şart.

## Karar

- Değişken (variable) woff2 dosyaları `packages/design-tokens/fonts/` altında tutulur. Kaynak: Google Fonts deposundaki OFL lisanslı değişken TTF'ler; `fonttools` ile woff2'ye dönüştürüldü (toplam ~176 KB). Lisans metinleri aynı dizinde.
- Web, `next/font/local` ile bu dosyaları yükler ve `--font-display-src` / `--font-body-src` değişkenlerini tanımlar. Token `--pn-font-display`, bu değişkenlere `var(--font-display-src, "Space Grotesk Variable")` ile bağlanır.
- Storybook, `fonts/fonts.css` içindeki `@font-face` tanımlarıyla aynı dosyaları kullanır; değişken tanımlı olmadığı için fallback adı devreye girer.
- `next/font/google` kullanılmadı: build sırasında ağ gerektirir ve Storybook'la paylaşılamaz. Fontsource paketleri kullanılmadı: yalnızca alt küme (subset) dosyaları dağıtıyor, `next/font/local` unicode-range bölmeyi desteklemiyor.

## Sonuçlar

- Font dosyaları repoda ikili olarak durur (`.gitattributes` ile binary).
- Yeni bir ağırlık ya da font eklenirse hem `fonts.css` hem `apps/web` layout'u güncellenir.
