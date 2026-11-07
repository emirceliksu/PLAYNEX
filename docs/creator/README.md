# Atölye

Oyuncuların yaptığı oyunlar kod değil, motorun okuduğu bir belgedir (ADR 0018). Bu sayfa belgenin yapısını, sınırlarını ve yeni bir blok eklerken dokunulan yerleri özetler.

## Belge

Kaynak tanım `crates/creator-engine/src/document.rs`; TypeScript aynası `packages/creator-runtime/src/document.ts`. Motor tek otoritedir: aynada geçen ama motorda geçmeyen bir belge yayınlanamaz.

| Alan                                         | İçerik                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`                              | Şu an `1`. Değişirse eski yayınlar için dönüştürücü yazılır.                                                                                     |
| `dimension`                                  | `2d` veya `3d`. 2D şekiller: dikdörtgen, daire, üçgen, yıldız, çokgen, yazı. 3D: kutu, küre, silindir, koni, rampa, yazı.                        |
| `world`                                      | Boyut, yer çekimi, arka plan, kamera, süre sınırı, can.                                                                                          |
| `entities` / `prefabs`                       | Sahnedeki nesneler ve "kopya oluştur" bloğuyla doğan şablonlar. Motor önce nesneleri, sonra şablonları numaralar; çizici şekli bu sırayla bulur. |
| `variables`, `lists`, `functions`, `scripts` | Genel değişkenler, listeler, fonksiyonlar ve sahne betikleri. Nesne betikleri nesnenin içindedir.                                                |
| `sounds`, `hud`                              | Ses kitinden tarifler; ekrandaki puan, süre, can, değişken ve yazı kutuları.                                                                     |

Renkler `packages/design-tokens` içindeki `creatorSwatches` listesinin sırasıdır. Belgeler yalnızca sıra numarası taşır, bu yüzden listeye yalnızca sona ekleme yapılır.

## Sınırlar

`crates/creator-engine/src/limits.rs`: belge 512 KB, 2000 nesne, 20 000 blok, 32 kat iç içe blok, yazı 120 karakter, liste 10 000 öge, fonksiyon çağrısı 16 kat. Bir betik bir karede 10 000, bütün betikler 200 000 işlem yapabilir; aşan betik durdurulur ve editörde ilgili blok gösterilir. Oyun en fazla 10 dakika sürer.

## Determinizm

Skorlar sunucuda tekrar oynatılarak doğrulanır, bu yüzden tarayıcıdaki wasm ile API'deki native derleme aynı sonucu vermek zorundadır:

- Sabit 60 Hz tick, duvar saati yok; rastgelelik motorun tohumlu üreteci (`rng.rs`).
- Trigonometri ve üs alma `libm` ile; sırası belirsiz koleksiyon kullanılmaz.
- `tests/fixtures/cross-target.json` hem `cargo test` hem `packages/creator-runtime` testinde koşar ve aynı durum özetini bekler. Motor davranışı bilerek değişirse özet iki testte birlikte güncellenir.

## Yeni blok eklemek

1. `document.rs`: `StmtOp` ya da `Expr` içine yeni varyant.
2. `compile.rs`: varyantı talimata indir; ad çözümleme hatalarını blok kimliğiyle bildir.
3. `program.rs` + `vm.rs`: gerekiyorsa yeni talimat ve davranışı. Davranış deterministik olmalı.
4. `tests/engine.rs`: blokla kurulmuş küçük bir oyunla davranışı sına.
5. `packages/creator-runtime/src/document.ts`: aynaya ekle.
6. `apps/web/src/features/creator/blocks/spec.ts`: bloğun satırı (kategori, biçim, alanlar). Dönüştürücü ve Blockly tanımı buradan üretilir.
7. `apps/web/messages/{tr,en}.json`: `creator.blocks.<tip>` metni; `%1`, `%2` yer tutucuları alan ve girişlerin sırasıdır (iç blok yuvaları sayılmaz).
8. `make wasm`, `cargo test -p playnex-creator-engine`, `pnpm --filter @playnex/web test`.

## Yayın ve güvenlik

- Taslaklar biçim olarak doğrulanıp saklanır, derlenmeleri gerekmez; yayın tam doğrulama ister ve belgeyi `creator_releases` içine dondurur.
- Belgedeki bütün yazılar, başlık ve açıklama `crates/chat-filter` süzgecinden geçer.
- Şikâyetler `player_reports.release_id` ile gelir; yönetici `POST /v1/admin/creator/releases/{id}/hide` ile yayını gizler, işlem `admin_actions`'a yazılır.
- Sıralamaya yalnızca sunucunun verdiği tohumla başlayıp tekrar oynatmada aynı skoru ve tick sayısını veren koşular girer.
