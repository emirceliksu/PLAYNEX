# PLAYNEX — Tasarım yönü

> Durum: Onay bekliyor · Tarih: 2026-10-20 · Sahibi: ürün tasarımı
>
> Bu doküman token değerlerinin, bileşenlerin ve ekranların ortak referansıdır. Onaylanan yön `packages/design-tokens` içinde kesinleşir; buradaki değerler o aşamada ölçülerek (kontrast, ritim) ince ayar görebilir.

İki yön sunuluyor. **A — "Gece Salonu"** önerilen yön ve tam ayrıntıda; **B — "Kâğıt Arcade"** kısa alternatif. Farklar ve öneri gerekçesi sonda.

---

## A — Gece Salonu (önerilen)

### Kişilik

PLAYNEX, kapıdan girince ışıkları ve sesleri hissettiğin bir atari salonunun enerjisini, modern bir oyun mağazasının düzeniyle birleştirir. Yüzeyler koyu lacivert ve sakindir; renk yalnızca oyunların kendisinden, skorlardan ve eylem noktalarından gelir. Tipografi sahnenin karakterini taşır: büyük, sıkı, kendinden emin başlıklar; rakamlar her yerde tabular ve belirgin. Nesneler ekrana yapıştırılmış çıkartmalar gibi durur, derinlik hissi bulanık gölgeyle değil sert ofsetli gölgeyle verilir.

### İmza detaylar (yalnızca iki tane)

1. **Sticker gölgesi.** Etkileşimli öğeler ve rozetler 2 px kontur + 4 px (büyük yüzeylerde 8 px) sağ-alt ofsetli, bulanıksız, mürekkep renginde gölge taşır. Hover'da öğe sol-üste 2 px kalkar ve gölge büyür; basınca düzleşir. Kartların _kendisi_ bu gölgeyi taşımaz; kart üstündeki "Oyna" düğmesi ve rozet taşır. Böylece ızgara sakin, eylem noktaları canlı kalır.
2. **Grain.** Tuval ve hero yüzeylerinde %4–6 opaklıkta SVG `feTurbulence` dokusu. Kartlarda, modallarda ve metin yüzeylerinde yok. Amaç "ekran" değil "malzeme" hissi.

Kullanılmayacaklar: glow, backdrop-blur, gradyan metin, mor→mavi gradyanlar, tekdüze `rounded-2xl shadow-lg` ızgaralar, emoji ikon.

### Renk

Tüm skalalar OKLCH ile yazılır; adımlar algısal olarak eşittir. Marka moru Tailwind `violet-600` (hue 293, L 0.54) değildir: hue 286'ya kaydırıldı (indigo ile violet arası, daha elektrik), 500 adımı daha açık ve daha doygun. Mevcut tokenlar: `packages/design-tokens/src/color.ts`.

| Skala    | 500 adımı               | Rol                                                            |
| -------- | ----------------------- | -------------------------------------------------------------- |
| `brand`  | `oklch(0.61 0.23 286)`  | Ana eylem, marka, seçili durum                                 |
| `cyan`   | `oklch(0.76 0.145 205)` | Çok oyunculu / bağlantı / odak halkası                         |
| `yellow` | `oklch(0.83 0.175 80)`  | XP, ödül, rekor                                                |
| `pink`   | `oklch(0.67 0.22 355)`  | Etkinlik, vurgu, canlı yayın                                   |
| `mint`   | `oklch(0.78 0.15 165)`  | Başarı, çevrim içi, doğrulanmış skor                           |
| `coral`  | `oklch(0.66 0.21 25)`   | Hata, tehlikeli eylem, çevrimdışı                              |
| `ink`    | `oklch(0.58 0.024 282)` | Nötr lacivert; yüzeyler ve metin (hue 282 ile hafif mor çalar) |

Koyu tema semantik yüzeyleri (varsayılan):

| Token                                      | Değer                              | Not                                                     |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------- |
| `surface.canvas`                           | `ink.950` = `oklch(0.18 0.03 282)` | Sayfa zemini, grain burada                              |
| `surface.raised`                           | `ink.900`                          | Kart, sidebar, topbar                                   |
| `surface.overlay`                          | `ink.800`                          | Modal, popover, hover zemin                             |
| `surface.sunken`                           | `oklch(0.145 0.028 282)`           | Girdi alanları, skor şeritleri                          |
| `fg.primary` / `fg.secondary` / `fg.muted` | `ink.50` / `ink.300` / `ink.400`   | Metin hiyerarşisi                                       |
| `border.subtle` / `border.strong`          | `ink.50 @12%` / `ink.600`          | Ayırıcı / kontur                                        |
| `border.focus`                             | `cyan.300`                         | Odak halkası mor düğmelerde de görünür kalsın diye cyan |
| `brand.solid` / `hover` / `active`         | `brand.500` / `400` / `600`        | Birincil düğme                                          |
| `*.soft` + `*.text`                        | `x.950` + `x.300`                  | Yumuşak rozet zemini + metni                            |

Açık tema aynı semantik isimlerle `ink.50` tuval, beyaz kart, `brand.600` eylem rengiyle hazır; ikinci sınıf vatandaş değil ama ürünün varsayılanı koyu.

Kontrast hedefleri (WCAG 2.2 AA): `fg.primary`/canvas ≈ 16:1, `fg.secondary`/canvas ≈ 10:1, `fg.muted`/canvas ≈ 6:1, `fg.on-brand`/`brand.solid` ≥ 4.5:1 (ölçümde 4.5 altına düşerse `brand.500` L değeri 0.58'e çekilir). Her oranı Storybook token sayfası canlı hesaplar; yalnızca renge dayanan durum göstergesi yok (ikon + metin eşlik eder).

### Tipografi

Space Grotesk (başlık, skor, düğme) + Plus Jakarta Sans (gövde). Her ikisi değişken font, self-host (ADR 0003). Başlıklar sıkı satır aralığı ve negatif letter-spacing ile; rakamlar `tabular-nums` ve `font-display`.

| Stil                                 | Boyut / satır / tracking / ağırlık   | Kullanım                                      |
| ------------------------------------ | ------------------------------------ | --------------------------------------------- |
| `display-2xl`                        | 72 / 0.95 / −0.04em / 700            | Ana sayfa hero başlığı (≥1280)                |
| `display-xl`                         | 56 / 1 / −0.035em / 700              | Hero (768–1280), oyun detay başlığı           |
| `display-lg`                         | 44 / 1.05 / −0.03em / 700            | Hero (mobil), bölüm başlıkları                |
| `display-md`                         | 36 / 1.1 / −0.025em / 700            | Profil adı, sonuç modalı                      |
| `display-sm`                         | 28 / 1.15 / −0.02em / 600            | Bölüm başlığı (raf, liste)                    |
| `title-lg` / `title-md` / `title-sm` | 24 / 20 / 17                         | Kart başlıkları, modal başlığı                |
| `body-lg` / `body-md` / `body-sm`    | 18 / 16 / 14                         | Açıklama, gövde, meta                         |
| `label-md`                           | 13 / 1.25 / +0.01em / 600            | Düğme (sm), chip, sekme                       |
| `label-sm`                           | 12 / 1.2 / +0.06em / 700, büyük harf | Eyebrow etiketleri ("YENİ", "1v1", "YAKINDA") |
| `score-lg` / `score-md`              | 40 / 24, tabular                     | Skor, XP, sıralama numarası                   |

Ritim: dikey boşluklar 4 px ızgarasında ama bölümler **aynı padding'le alt alta dizilmez**; hero 96, raf 64, liste 48 px nefes alır. Metin satır uzunluğu 60–70 karakter.

### Köşe, kontur, gölge

- Radius: 4 (chip içi), 8 (düğme sm, girdi), 12 (düğme, rozet), 16 (kart), 24 (öne çıkan kart, modal), 32 (hero paneli), tam yuvarlak (avatar, pill).
- Kontur: 2 px; etkileşimli öğelerde `border.strong`, pasif kartlarda `border.subtle`.
- Gölge: `sticker` (4 px ofset), `sticker-lg` (8 px), `raised` (kart için yumuşak, çok düşük), `overlay` (modal). Blur yalnızca `raised`/`overlay`'de ve kısık.

### Hareket

Süreler `PLAN.md` 3'ten: düğme 150 ms, kart 200 ms, sayfa geçişi 250 ms, modal 180 ms, XP 550 ms, başarım 600 ms, rekor kutlaması 1–2 s. Easing: `out` (hızlı başlayıp yavaşlayan) varsayılan; `spring` yalnızca rozet/sticker "pop" anlarında ve yalnızca `transform`'da.

- Kart hover: 2 px kalkış + kapak görselinde %2 ölçek; `prefers-reduced-motion` açıkken yalnızca kontur rengi değişir.
- Skor sayaçları: hedef değere `out` eğrisiyle 550 ms sayarak gelir; reduced-motion'da anında.
- Sayfa geçişi: içerik 8 px yukarı kayarak 250 ms'de belirir; iskelet → içerik geçişinde çapraz solma yok, yerine içerik yerine oturur.
- Oyun sırasında HUD dışında animasyon yok; düşük performans modunda tümü kapalı.

### Oyun kapakları

Her oyunun bir **imza rengi** ve mekanikten türeyen **tek bir geometrik motifi** vardır. Kapaklar 16:10, el çizimi SVG; düz renk alanları, 2 px mürekkep kontur, sticker gölgesi; fotoğraf, 3D render ve gradyan yok. Kapak rengi kartın rozetine, oyun ekranının HUD vurgusuna ve sonuç modalına taşınır.

| Oyun                     | İmza     | Motif                                                   |
| ------------------------ | -------- | ------------------------------------------------------- |
| Snake Rush               | `mint`   | Köşeli dönen yılan segmentleri, önünde bir elma         |
| Memory Flip              | `pink`   | Biri açılmış iki kart; eşleşen sembol                   |
| 2048 Fusion              | `yellow` | Birleşen iki sayı karosu, araya sıkışan parıltı çizgisi |
| Blok bulmacası           | `cyan`   | Izgaraya yerleşen üç parçalı blok, dolan satır          |
| Connect Four             | `coral`  | Dikey ızgarada dört disk, kazanan çapraz                |
| Air Hockey (Faz 2)       | `cyan`   | Masa, disk, iki vurucu                                  |
| Chess Arena (Faz 2)      | `brand`  | At figürü silueti                                       |
| Neon Kart Racing (Faz 3) | `brand`  | Virajdaki kart, hız çizgileri                           |

"Yakında" oyunlar aynı kapak dilini kullanır ama doygunluğu düşürülmüş (chroma ×0.5) ve üstünde `label-sm` "YAKINDA" sticker rozeti.

### Durumlar

- **Yükleniyor:** İçerik şekilli iskelet (kapak oranı, başlık uzunluğu, liste satır sayısı gerçek içerikle aynı). Shimmer yok; 1,2 s'lik nazik opaklık nabzı. Reduced-motion'da sabit.
- **Boş:** Küçük bir çizgi illüstrasyon (ilgili oyun motifinden), bir cümlelik açıklama, tek bir eylem ("Katalogu aç", "İlk oyununu oyna"). Gri kutu değil.
- **Hata:** `coral.soft` zemin, ikon + başlık + ne yapılacağı; "Tekrar dene" birincil düğme. Teknik mesaj yalnızca genişletilebilir ayrıntıda.
- **Çevrimdışı:** Üstte `yellow.soft` şerit: "Bağlantı yok. Skorun kaydedilemez, bağlanınca gönderilir." Oyun ekranında HUD'a küçük rozet olarak iner.
- **Oyun oynama kabuğu:** `loading` (kapak rengiyle ilerleme çubuğu), `ready` (büyük Oyna düğmesi + kontrol ipuçları), `playing` (yalın HUD), `paused` (koyu örtü, devam/çık), `finished` (sonuç modalı; skor sayarak gelir, rekorsa `yellow` sticker ve kısa konfeti), `error` (coral kart, yeniden başlat).

### Ana sayfa yerleşimi

1440 px (sidebar 240 + içerik + sağ panel 280):

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ PLAYNEX     [ Ara…                     ]                 ◎    ◯ emre_k     │  topbar 64
├──────────┬──────────────────────────────────────────────┬────────────────────┤
│ Keşfet   │  HAFTANIN OYUNU                               │ Arkadaşlar (4)     │
│ Oyunlar  │  ┌────────────────────────┐  Snake Rush        │  ● ayse.c  oynuyor│
│ Favoriler│  │   büyük kapak (mint)   │  "Yılanı büyüt…"   │  ● mert    çevrim │
│ Arkadaş  │  │                        │  [ Hemen oyna ]    │  ○ selin   2 sa.  │
│ Turnuva  │  └────────────────────────┘  rekor 12 480      │                    │
│ Sıralama │                                                │ Günün görevi       │
│          │  HEMEN OYNA  ────────────────────────────▶     │  3 oyun oyna 2/3   │
│          │  ▭▭▭ ▭▭▭ ▭▭▭ ▭▭▭ ▭▭▭  (yatay raf, kompakt)    │  ▓▓▓▓▓▓▓░░ 120 XP │
│          │                                                │                    │
│          │  POPÜLER               ┌──────────┐┌─────┐     │ Mini sıralama      │
│          │  ┌─────────────────┐   │          ││     │     │  1 kaan.d  48 210  │
│          │  │ geniş kart      │   │ standart ││ dar │     │  2 ayse.c  44 902  │
│          │  └─────────────────┘   └──────────┘└─────┘     │  3 sen     41 115  │
│          │  ┌─────┐┌──────────┐┌─────────────────┐        │                    │
│          │                                                │                    │
│          │  SIRALAMA · Bu hafta        [Günlük|Haftalık]  │                    │
│          │  1  kaan.d      48 210  ▲                      │                    │
│          │  2  ayse.c      44 902  ▲   (yoğun liste)      │                    │
│          │  …                                             │                    │
│          │  YAKINDA  ▭▭▭ ▭▭▭ ▭▭▭  (soluk kapaklar)         │                    │
└──────────┴──────────────────────────────────────────────┴────────────────────┘
```

1024–1366 px: sağ panel kalkar, içeriği (arkadaşlar, görev, mini sıralama) "Popüler"in altına iki sütunlu blok olarak iner. <1024 px: sidebar 72 px kompakt (yalnızca ikon + tooltip).

375 px:

```text
┌──────────────────────────┐
│ ◧ PLAYNEX        ⌕   ◯   │ topbar 56
├──────────────────────────┤
│ HAFTANIN OYUNU           │
│ ┌──────────────────────┐ │
│ │  kapak (tam genişlik)│ │
│ └──────────────────────┘ │
│ Snake Rush   rekor 12 480│
│ [      Hemen oyna      ] │
│                          │
│ HEMEN OYNA        ▶      │
│ ▭▭▭ ▭▭▭ ▭▭▭  (kaydır)    │
│                          │
│ POPÜLER                  │
│ ┌──────────────────────┐ │
│ │ geniş kart           │ │
│ └──────────────────────┘ │
│ ┌─────────┐┌───────────┐ │
│                          │
│ SIRALAMA · Bu hafta      │
│ 1 kaan.d        48 210   │
│ 2 ayse.c        44 902   │
├──────────────────────────┤
│  ⌂     ▦      ▲     ◯    │ alt nav 64 + safe-area
│ Ana   Oyunlar Sıra  Profil│
└──────────────────────────┘
```

Göz sırası: büyük kapak → "Hemen oyna" düğmesi (tek sticker gölgeli öğe) → raf → popüler. Kart boyutları içeriğin önemine göre üç ölçekte (`featured`, `standard`, `compact`); aynı boyutta ızgara yok.

### Erişilebilirlik

Odak halkası 2 px `cyan.300`, 2 px ofset, her etkileşimli öğede görünür. Dokunmatik hedefler ≥ 44 px. Klavye: sidebar ve raflar ok tuşlarıyla, modallar odak tuzağı ve `Esc` ile. `prefers-reduced-motion` tüm hareket tokenlarını devre dışı bırakır. Durumlar yalnızca renkle değil ikon + metinle anlatılır.

---

## B — Kâğıt Arcade (alternatif)

Aynı tipografi, aynı imza renkleri, aynı sticker mantığı; fark **zemin ve ışık**. Tuval sıcak krem (`oklch(0.97 0.02 85)`), kartlar beyaz, konturlar 2 px siyah mürekkep, gölgeler tamamen siyah ve sert. Oyun kapakları daha çok çıkartma/çizgi roman hissi verir; XP ve skorlar siyah üstüne sarı sticker olarak basılır. Koyu tema ikincil, ayar olarak sunulur.

Artıları: gündüz ve mobil okunabilirlik yüksek; "oyuncak kutusu" samimiyeti; hazır arayüz şablonlarından en uzak görünüm.
Eksileri: `PLAN.md` 3'teki "koyu lacivert-mor yüzeyler" tanımıyla çelişir; oyun ekranında (canvas koyu) kabuk ile oyun arasında ışık sıçraması olur; neon/arcade karakteri zayıflar.

## Öneri

**A — Gece Salonu.** Planla birebir uyumlu, oyun kabuğu ile canvas aynı karanlıkta buluşuyor, renkler koyu zeminde daha "arcade" parlıyor. B'nin güçlü yanı olan kontur/sticker dili A'da zaten var; açık tema token olarak hazır tutulduğu için B'nin gündüz okunabilirliği de kaybolmuyor.

## Blok bulmacası için isim önerileri

Slug onay gelene kadar `block-puzzle`. "Block Blast" kullanılmıyor (`PLAN.md` v1.1).

1. **Tuğla Tuğla** — önerilen. Tekrarlı Türkçe isim, dizme/yığma mekaniğini anlatır, sloganı kendiliğinden gelir ("tuğla tuğla, satır satır"). Slug: `tugla-tugla`.
2. **Kare Kare** — ritmik, kısa; ızgaraya göndermesi doğrudan. Slug: `kare-kare`.
3. **Dizgi** — matbaa dizgisi metaforu; olgun ve kısa, "satırı tamamla" fikriyle örtüşür. Slug: `dizgi`.
4. **Sıkış Tepiş** — eğlenceli, parçaların sığdırılmasını anlatır; biraz uzun. Slug: `sikis-tepis`.
5. **Yerleş** — tek kelime, eylem odaklı; yabancı kullanıcı için anlamsız kalabilir. Slug: `yerles`.

Marka/telif ön kontrolü (`PLAN.md` 17) isim seçildikten sonra yapılmalı.

## Onaydan sonra

1. Token değerleri bu dokümana göre kesinleşir; Storybook'ta canlı kontrast ölçümlü token sayfası.
2. Bileşenler (Adım 4) ve mock verili ekranlar (Adım 5); her ekran 375/768/1280/1440 ekran görüntüsüyle bu dokümandaki sorulara göre gözden geçirilir.
