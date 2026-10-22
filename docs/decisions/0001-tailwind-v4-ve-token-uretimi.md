# ADR 0001 — Tailwind v4 ve tasarım tokenlarından tema üretimi

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

Proje kuralları, renk/tipografi/boşluk/hareket değerlerinin yalnızca `packages/design-tokens` üzerinden kullanılmasını ve Tailwind'in hazır paletinin kullanılmamasını şart koşuyor. Tailwind v4 temayı CSS'te `@theme` bloğuyla tanımlar ve `--color-*: initial` gibi namespace sıfırlamalarına izin verir.

## Karar

- Tokenlar `packages/design-tokens/src/*.ts` dosyalarında TypeScript olarak yazılır (tek kaynak).
- `scripts/build-css.ts` iki dosya üretir: `dist/tokens.css` (`--pn-*` CSS değişkenleri; `:root` koyu tema, `[data-theme="light"]` açık tema) ve `dist/theme.css` (`@theme` sıfırlamaları + `@theme inline` ile Tailwind utility'lerinin bu değişkenlere bağlanması).
- Renk, font, metin ölçeği, gölge, radius, kırılım ve easing namespace'leri sıfırlanır; yalnızca projenin tokenları utility üretir.
- Semantik renkler `@theme inline` ile bağlanır; böylece `data-theme` değiştiğinde utility'ler yeni değeri okur.
- Renkler OKLCH ile yazılır; marka moru Tailwind `violet-600` (hue 293) yerine hue 286'da tanımlanır.
- Tek paylaşılan stylesheet `packages/ui/src/styles/app.css`'tir; web ve Storybook bunu import eder.

## Sonuçlar

- Kodda hex yok; yeni bir renk gerekiyorsa token eklenir ve `make tokens` çalıştırılır.
- `tailwind-merge`'e özel metin ölçeği öğretilir (`packages/ui/src/lib/cn.ts`).
- Bağımlılıklar: `tailwindcss`, `@tailwindcss/postcss` (web), `@tailwindcss/vite` (Storybook), `tsx` (üretim scripti).
