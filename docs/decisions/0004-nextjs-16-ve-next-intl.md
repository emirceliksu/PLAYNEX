# ADR 0004 — Next.js 16 ve next-intl ile yönlendirme

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

Proje, güncel kararlı Next.js sürümünü ve ilk sprintten itibaren TR (varsayılan) + EN desteğini istiyor (`PLAN.md` 6). Kurulum sırasında npm'deki kararlı sürüm 16.4.2 idi.

## Karar

- Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9 (TypeScript 7, `typescript-eslint` henüz desteklemediği için kullanılmadı).
- `next-intl` ile `app/[locale]/` segmenti; `localePrefix: 'as-needed'` sayesinde Türkçe kök URL'de (`/games`), İngilizce `/en/...` altında.
- Next 16'da `middleware.ts` yerine `src/proxy.ts` kullanılır. `params` bir Promise'tir; her layout/page `hasLocale` ile doğrular ve `setRequestLocale` çağırır.
- Tip güvenliği: `src/global.d.ts` içinde `AppConfig` genişletilerek mesaj anahtarları ve `Locale` tipi `messages/tr.json`'dan türetilir.
- ESLint 9.39 (bakım sürümü) kullanılır: `eslint-config-next`'in getirdiği `eslint-plugin-import`, `jsx-a11y` ve `react` eklentileri ESLint 10'u henüz desteklemiyor. `eslint-config-next` bu eklentileri kaydettiği için web konfigürasyonu `react.mjs` yerine doğrudan `base.mjs` üzerine kurulur ve tipli lint `parserOptions`'ı Next konfigürasyonundan sonra yeniden uygulanır.
- Workspace paketleri kaynak TypeScript olarak tüketilir (`exports` → `src/index.ts`); `transpilePackages` ile derlenir.

## Sonuçlar

- Yeni route eklerken `[locale]` altına konur; kullanıcıya görünen her metin `messages/*.json`'a yazılır.
- `pnpm peers check` yalnızca ESLint eklentilerinin ESLint 9 aralığı dışındaki uyarılarını listelememelidir; yeni uyarı görülürse ADR güncellenir.
