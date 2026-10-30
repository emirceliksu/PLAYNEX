# Oyun kataloğu ilerleme günlüğü

Plan: `200-oyun-plani.md`. Katalog: `catalog-200.json`. Durumlar: bekliyor, yapılıyor, bitti, sorunlu.

## Fazlar

| Faz | Kapsam | Durum |
|---|---|---|
| 0.0 | Plan ve katalog repoya alındı, günlük açıldı | bitti |
| 0 / 3.1 | `make new-game`, codegen, ADR 0015 | bitti |
| 0 / 3.3 | `@playnex/game-audio`, ADR 0016 (tarayıcıda ilk gerçek kullanım Snake Rush ile doğrulanacak) | yapılıyor |
| 0 / 3.2 | `@playnex/game-kit` | bekliyor |
| 0 / 3.4 | Realtime kayıt tablosu, çerçeveler, eşleşme | bekliyor |
| 0 / 3.5 | Katalog ölçekleme | bekliyor |
| 0 / ilerleme | Platform geneli XP, seviye, başarım | bekliyor |
| 1 | Mevcut 11 oyunun yenilenmesi | bekliyor |
| 2–11 | Dalga 1–10 | bekliyor |

## Kararlar

- Plan metni ve katalog repoya alınırken ürün belgesi diline çekildi; bazı `highlights` ifadeleri "bot" ya da "davranış" olarak yeniden adlandırıldı, oyun kapsamı değişmedi.
- İş `feat/game-catalog-200` dalında yürür.
- Yeni oyunlar `draft` durumunda başlar, kalite çıtasını geçince `live` olur; katalog yarım oyun göstermez.
- Gerçek cihazda ölçülemeyen performans maddeleri kalite raporunda "ölçülmedi (cihaz)" olarak yazılır, karşılandı sayılmaz.
- Marka taraması (TÜRKPATENT, EUIPO) hukuki iştir, yapılmadı; yayından önce gerekir.

## Bilinen sorunlar

- Kapak üreteci (3.5) gelene kadar yeni oyunların kapağı `game-cover.tsx` üzerinden elle eklenir.
- `rust.Dockerfile` ve realtime `cargo watch` listesindeki oyun `data` yolları elle yazılı; 3.4 ile genelleştirilecek.
- Üretilen EN metinleri Türkçe konseptle başlar; çeviri, oyunun `draft` durumundan çıkma şartıdır.

## Mevcut oyunlar (Faz 1)

| Oyun | Durum |
|---|---|
| `snake-rush` | bekliyor |
| `2048-fusion` | bekliyor |
| `memory-flip` | bekliyor |
| `tugla-tugla` | bekliyor |
| `connect-four` | bekliyor |
| `air-hockey` | bekliyor |
| `chess-arena` | bekliyor |
| `drawing-party` | bekliyor |
| `trivia-battle` | bekliyor |
| `neon-kart-racing` | bekliyor |
| `siper` | bekliyor |

## Yeni oyunlar

| No | Dalga | slug | Durum |
|---|---|---|---|
| 1 | 1 | `pisti` | bekliyor |
| 2 | 1 | `dama-arena` | bekliyor |
| 3 | 1 | `ters-yuz` | bekliyor |
| 4 | 1 | `amiral-batti` | bekliyor |
| 5 | 1 | `kizma-birader` | bekliyor |
| 6 | 1 | `ruzgar-kusu` | bekliyor |
| 7 | 1 | `kule-insa` | bekliyor |
| 8 | 1 | `magara-ucusu` | bekliyor |
| 9 | 1 | `baloncuk-patlat` | bekliyor |
| 10 | 1 | `ucluk-yarismasi` | bekliyor |
| 11 | 1 | `sudoku-salonu` | bekliyor |
| 12 | 1 | `mayin-avcisi` | bekliyor |
| 13 | 1 | `sabir-kartlari` | bekliyor |
| 14 | 1 | `harf-avi` | bekliyor |
| 15 | 1 | `sandik-ustasi` | bekliyor |
| 16 | 1 | `otopark-cikisi` | bekliyor |
| 17 | 1 | `renk-akisi` | bekliyor |
| 18 | 1 | `renkli-siseler` | bekliyor |
| 19 | 1 | `kelime-avi` | bekliyor |
| 20 | 1 | `yilan-merdiven` | bekliyor |
| 21 | 2 | `okey-salonu` | bekliyor |
| 22 | 2 | `tavla-ustasi` | bekliyor |
| 23 | 2 | `batak-masasi` | bekliyor |
| 24 | 2 | `duvar-yikan` | bekliyor |
| 25 | 2 | `tombala-gecesi` | bekliyor |
| 26 | 2 | `mangala` | bekliyor |
| 27 | 2 | `beste-biter` | bekliyor |
| 28 | 2 | `zar-beslisi` | bekliyor |
| 29 | 2 | `sifre-kirici` | bekliyor |
| 30 | 2 | `domino-kahvesi` | bekliyor |
| 31 | 2 | `penalti-duellosu` | bekliyor |
| 32 | 2 | `dart-gecesi` | bekliyor |
| 33 | 2 | `okcu-duellosu` | bekliyor |
| 34 | 2 | `kelime-zinciri` | bekliyor |
| 35 | 2 | `klavye-yarisi` | bekliyor |
| 36 | 2 | `zipzip-kule` | bekliyor |
| 37 | 2 | `kesik-kesik` | bekliyor |
| 38 | 2 | `yolu-gec` | bekliyor |
| 39 | 2 | `fuze-komutani` | bekliyor |
| 40 | 2 | `mahjong-taslari` | bekliyor |
| 41 | 3 | `pikselli-bilmece` | bekliyor |
| 42 | 3 | `su-tesisati` | bekliyor |
| 43 | 3 | `isik-yolu` | bekliyor |
| 44 | 3 | `yedi-parca` | bekliyor |
| 45 | 3 | `mat-bulmacasi` | bekliyor |
| 46 | 3 | `harf-karistir` | bekliyor |
| 47 | 3 | `hedef-sayi` | bekliyor |
| 48 | 3 | `duvar-zipla` | bekliyor |
| 49 | 3 | `renk-degistir` | bekliyor |
| 50 | 3 | `yilan-arenasi` | bekliyor |
| 51 | 3 | `tank-duellosu` | bekliyor |
| 52 | 3 | `bilardo-salonu` | bekliyor |
| 53 | 3 | `yildiz-filosu` | bekliyor |
| 54 | 3 | `lokum-diyari` | bekliyor |
| 55 | 3 | `kupa-kacirma` | bekliyor |
| 56 | 3 | `yalanci-zar` | bekliyor |
| 57 | 3 | `kose-kapmaca` | bekliyor |
| 58 | 3 | `soyleme` | bekliyor |
| 59 | 3 | `lobut` | bekliyor |
| 60 | 3 | `labirent-hirsizi` | bekliyor |
| 61 | 4 | `spiral-dusus` | bekliyor |
| 62 | 4 | `okyanus-avi` | bekliyor |
| 63 | 4 | `bilye-zinciri` | bekliyor |
| 64 | 4 | `hedef-okculuk` | bekliyor |
| 65 | 4 | `yapboz-atolyesi` | bekliyor |
| 66 | 4 | `altigen-birlestir` | bekliyor |
| 67 | 4 | `vida-bulmaca` | bekliyor |
| 68 | 4 | `bulut-ustu` | bekliyor |
| 69 | 4 | `ray-dose` | bekliyor |
| 70 | 4 | `tarih-seridi` | bekliyor |
| 71 | 4 | `element-birlestir` | bekliyor |
| 72 | 4 | `king` | bekliyor |
| 73 | 4 | `kelime-kalesi` | bekliyor |
| 74 | 4 | `vampir-koylu` | bekliyor |
| 75 | 4 | `harita-avcisi` | bekliyor |
| 76 | 4 | `toprak-kapmaca` | bekliyor |
| 77 | 4 | `fitil` | bekliyor |
| 78 | 4 | `pist-ustasi` | bekliyor |
| 79 | 4 | `mini-golf-adasi` | bekliyor |
| 80 | 4 | `pixel-survivors` | bekliyor |
| 81 | 5 | `goktasi-avcisi` | bekliyor |
| 82 | 5 | `kacis-koridoru` | bekliyor |
| 83 | 5 | `ip-ucu` | bekliyor |
| 84 | 5 | `golge-kosucu` | bekliyor |
| 85 | 5 | `simit-fabrikasi` | bekliyor |
| 86 | 5 | `hex-kopru` | bekliyor |
| 87 | 5 | `plaj-voleybolu` | bekliyor |
| 88 | 5 | `farki-bul` | bekliyor |
| 89 | 5 | `yercekimi-ters` | bekliyor |
| 90 | 5 | `kanca-ustasi` | bekliyor |
| 91 | 5 | `carsi-birlestir` | bekliyor |
| 92 | 5 | `olta-basi` | bekliyor |
| 93 | 5 | `gizli-kelime` | bekliyor |
| 94 | 5 | `tek-cizgi` | bekliyor |
| 95 | 5 | `volkan-kacisi` | bekliyor |
| 96 | 5 | `cizgi-surucu` | bekliyor |
| 97 | 5 | `kahraman-tiklayici` | bekliyor |
| 98 | 5 | `go-tasi` | bekliyor |
| 99 | 5 | `fisilti-agi` | bekliyor |
| 100 | 5 | `fetih-haritasi` | bekliyor |
| 101 | 6 | `mevzi` | bekliyor |
| 102 | 6 | `uzay-kurtlari` | bekliyor |
| 103 | 6 | `gures-meydani` | bekliyor |
| 104 | 6 | `sumo-robotlari` | bekliyor |
| 105 | 6 | `pota-duellosu` | bekliyor |
| 106 | 6 | `langirt` | bekliyor |
| 107 | 6 | `mikro-parti` | bekliyor |
| 108 | 6 | `pinball-pera` | bekliyor |
| 109 | 6 | `cengel-bulmaca` | bekliyor |
| 110 | 6 | `kule-kontrol` | bekliyor |
| 111 | 6 | `maden-kazisi` | bekliyor |
| 112 | 6 | `yorunge` | bekliyor |
| 113 | 6 | `dedektif-tablosu` | bekliyor |
| 114 | 6 | `dag-tirmanisi` | bekliyor |
| 115 | 6 | `atlama-kulesi` | bekliyor |
| 116 | 6 | `yarim-ay-bilmece` | bekliyor |
| 117 | 6 | `golge-oyunu` | bekliyor |
| 118 | 6 | `kilic-ustasi` | bekliyor |
| 119 | 6 | `kartopu-savasi` | bekliyor |
| 120 | 6 | `pervane` | bekliyor |
| 121 | 7 | `pinpon-ustasi` | bekliyor |
| 122 | 7 | `motor-kros` | bekliyor |
| 123 | 7 | `sur-savunmasi` | bekliyor |
| 124 | 7 | `ritim-yolu` | bekliyor |
| 125 | 7 | `mermer-yolu` | bekliyor |
| 126 | 7 | `kopru-muhendisi` | bekliyor |
| 127 | 7 | `kup-dondur` | bekliyor |
| 128 | 7 | `cay-bahcesi` | bekliyor |
| 129 | 7 | `karantina` | bekliyor |
| 130 | 7 | `mini-football` | bekliyor |
| 131 | 7 | `kart-zindani` | bekliyor |
| 132 | 7 | `sandalye-kapmaca` | bekliyor |
| 133 | 7 | `kanyon-ucusu` | bekliyor |
| 134 | 7 | `ritim-duellosu` | bekliyor |
| 135 | 7 | `kum-saati` | bekliyor |
| 136 | 7 | `pazar-kurulu` | bekliyor |
| 137 | 7 | `bric-kulubu` | bekliyor |
| 138 | 7 | `neon-takip` | bekliyor |
| 139 | 7 | `saklambac` | bekliyor |
| 140 | 7 | `kebap-telasi` | bekliyor |
| 141 | 8 | `altigen-taktik` | bekliyor |
| 142 | 8 | `kacis-odasi-konak` | bekliyor |
| 143 | 8 | `robot-programla` | bekliyor |
| 144 | 8 | `hat-ustasi` | bekliyor |
| 145 | 8 | `zaman-dongusu` | bekliyor |
| 146 | 8 | `bozkir-savascisi` | bekliyor |
| 147 | 8 | `koy-ciftligi` | bekliyor |
| 148 | 8 | `ring-ustasi` | bekliyor |
| 149 | 8 | `ejder-yuvasi` | bekliyor |
| 150 | 8 | `party-parkour` | bekliyor |
| 151 | 8 | `derin-zindan` | bekliyor |
| 152 | 8 | `hafiza-ustasi` | bekliyor |
| 153 | 8 | `ordu-kur` | bekliyor |
| 154 | 8 | `ariza-var` | bekliyor |
| 155 | 8 | `iki-anahtar` | bekliyor |
| 156 | 8 | `ikiz-ruhlar` | bekliyor |
| 157 | 8 | `drift-krali` | bekliyor |
| 158 | 8 | `dev-avcisi` | bekliyor |
| 159 | 8 | `golge-hirsiz` | bekliyor |
| 160 | 8 | `karinca-yuvasi` | bekliyor |
| 161 | 9 | `toz-duman-ralli` | bekliyor |
| 162 | 9 | `kaykay-parki` | bekliyor |
| 163 | 9 | `uzay-madencisi` | bekliyor |
| 164 | 9 | `kule-yuz` | bekliyor |
| 165 | 9 | `akin-arenasi` | bekliyor |
| 166 | 9 | `turbo-top` | bekliyor |
| 167 | 9 | `golge-dovusu` | bekliyor |
| 168 | 9 | `mercan-resifi` | bekliyor |
| 169 | 9 | `rota-yarisi` | bekliyor |
| 170 | 9 | `kale-savaslari` | bekliyor |
| 171 | 9 | `barbaros-ruzgari` | bekliyor |
| 172 | 9 | `kasa-soygunu` | bekliyor |
| 173 | 9 | `kar-yarisi` | bekliyor |
| 174 | 9 | `cinayet-masasi` | bekliyor |
| 175 | 9 | `yorunge-istasyonu` | bekliyor |
| 176 | 9 | `son-cember` | bekliyor |
| 177 | 9 | `efsane-kartlari` | bekliyor |
| 178 | 9 | `puzzle-worlds` | bekliyor |
| 179 | 9 | `unutulmus-kale` | bekliyor |
| 180 | 9 | `taktik-birlik` | bekliyor |
| 181 | 10 | `sehir-hatti` | bekliyor |
| 182 | 10 | `mahalle-kur` | bekliyor |
| 183 | 10 | `buz-pateni` | bekliyor |
| 184 | 10 | `anti-yercekimi` | bekliyor |
| 185 | 10 | `imkansiz-yol` | bekliyor |
| 186 | 10 | `tir-rotasi` | bekliyor |
| 187 | 10 | `yildiz-tuccari` | bekliyor |
| 188 | 10 | `teknik-direktor` | bekliyor |
| 189 | 10 | `hayalet-avcilari` | bekliyor |
| 190 | 10 | `cift-kale` | bekliyor |
| 191 | 10 | `gok-kartali` | bekliyor |
| 192 | 10 | `bogaz-yarisi` | bekliyor |
| 193 | 10 | `son-kale` | bekliyor |
| 194 | 10 | `mantar-adasi` | bekliyor |
| 195 | 10 | `nebula-gezgini` | bekliyor |
| 196 | 10 | `gece-nobeti` | bekliyor |
| 197 | 10 | `ada-fethi` | bekliyor |
| 198 | 10 | `derinlik` | bekliyor |
| 199 | 10 | `imparatorluk` | bekliyor |
| 200 | 10 | `ada-hayatta-kal` | bekliyor |
