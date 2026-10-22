# ADR 0005 — Storybook'un `packages/ui` içinde yaşaması

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

Bileşen kütüphanesi `packages/ui`'da; Storybook 6006 portunda ayrı bir compose servisi olarak çalışmalı. Hem bileşenlerin hem token sayfasının tek yerde belgelenmesi isteniyor.

## Karar

- Storybook 10 (`@storybook/react-vite`) `packages/ui/.storybook` altında; eklentiler: `addon-docs`, `addon-a11y` (ihlaller hata sayılır), `addon-themes` (`data-theme` ile açık/koyu geçişi).
- Tailwind, `@tailwindcss/vite` ile `viteFinal` içinde eklenir; aynı `src/styles/app.css` web ile paylaşılır.
- Fontlar `@playnex/design-tokens/css/fonts.css` ile yüklenir.
- `storybook` compose servisi `turbo run storybook` ile başlar; `with` sayesinde design-tokens watch görevi yanında çalışır.
- Telemetri kapalı; container içinde `--host 0.0.0.0 --ci --no-open`.
- MDX dokümanları henüz yok; token sayfası eklenince `stories` deseni genişletilir.

## Sonuçlar

- Her bileşen `*.stories.tsx` ile birlikte gelir; plandaki tüm durumlar (default, hover, active, focus-visible, loading, disabled, error) story olarak görünür.
- Bileşen metinleri prop olarak verilir; story'ler Türkçe örnek metin kullanır.
