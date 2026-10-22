# ADR 0006 — Boş crate ve oyun klasörlerinin ertelenmesi

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

`PLAN.md` 13. bölüm `crates/*` (13 Rust modülü), `games/2d/*`, `games/3d/*` ve `packages/game-sdk` dizinlerini listeliyor. İlk sprintin kapsamı yalnızca derlenen ve `/health` dönen `api` ve `realtime` servisleri.

## Karar

- Git boş klasör izlemediği için içeriksiz dizin oluşturulmaz; içi boş `lib.rs` ya da `index.ts` stub'ları ekibin "yarım iş bırakma" kuralına aykırı sayılır.
- Her modül, ilk gerçek kodu ile birlikte `PLAN.md` 13'teki yola eklenir ve `Cargo.toml` `members` / `pnpm-workspace.yaml` `packages` listesine o zaman girer.
- Yeni bir JS workspace paketi eklendiğinde `compose.yaml`'a `node_modules` volume'u da eklenir (bkz. ADR 0002).

## Sonuçlar

- Depo yapısı plandaki hedef yapıya adım adım yaklaşır; mevcut durum `README.md` "Yapı" bölümünde listelenir.
