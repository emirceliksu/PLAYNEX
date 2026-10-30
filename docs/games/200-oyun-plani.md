# PLAYNEX — 200 Oyun Planı

> Sürüm 1.0 · 2026-10-30 · Durum: Onaylandı
> Repo dosyası: `docs/games/200-oyun-plani.md` · Makine okunur katalog: `docs/games/catalog-200.json`

Bu belge, PLAYNEX kataloğunu 11 oyundan 211 oyuna çıkarmanın planıdır: 200 yeni oyun ve mevcut 11 oyunun yenilenmesi. İş dalgalar halinde yürür; her dalga kendi başına çalışır, test edilir ve yayına çıkar.

## 0. Özet

| | Adet |
|---|---|
| Yeni oyun | **200** |
| Çevrim içi (1v1 / Parti / Ortak) | **94** (25 / 57 / 12) |
| Tek kişilik | **106** |
| 2D (Phaser 4) / 3D (Babylon.js) | 158 / 42 |
| Kademe S / A / B | 19 / 95 / 86 |
| Dalga | 10 × 20 oyun |

- **Kademe S:** Siper ölçeğinde amiral gemisi (sunucu simülasyonu, ilerleme, sezon). **A:** derin oyun (çok mod, bot, ilerleme). **B:** orta ölçekli ama Bölüm 2'deki kalite çıtasını tam karşılayan oyun. "B" basit demek değildir.
- Tüm çevrim içi oyunlar botla oynanabilir; boş lobi sorunu baştan çözülür (Bölüm 3.4).
- Mevcut 11 oyun, yeni oyunlardan önce yeni ortak kitle (ses + animasyon) yenilenir.

## 1. Repo incelemesinden bulgular

Kod `48e0bed` (2026-10-30) üzerinden incelendi.

1. **Ses yalnızca Siper'de var.** `packages/game-sdk/src/audio.ts` içinde iyi bir `AudioMixer` (master/sfx/music/voice bus) var, fakat 10 oyunun hiçbiri onu kullanmıyor. Siper'in `client/sound.ts` dosyası, lisanslı dosya olmadan Web Audio ile sentezlenen efekt ve müzik üretiyor; bu yaklaşım bütün platforma genellenmeli.
2. **Animasyon çok ince.** 2D oyunlarda yalnızca 5–7 tween çağrısı var; partikül, ekran sarsıntısı, vuruş duraksaması, puan uçuşu, geçiş efekti yok. Snake Rush ve Chess Arena'da hiç tween yok.
3. **Oyunlar küçük.** 2D oyunlar 590–1.206 satır; Neon Kart 1.172; Siper 3.915 satır (+ Rust tarafı). "Gelişmiş" çıtası için ortalama oyun Siper'e değil ama mevcut 2D oyunların 2–4 katına yakın olmalı.
4. **Yeni oyun eklemek 9 dosyaya dokunmayı gerektiriyor:** oyun paketi, `apps/web/src/lib/games/registry.ts`, `next.config` `transpilePackages`, `compose.yaml` node_modules volume'u, `lib/catalog/games.ts`, `messages/tr.json` + `en.json` (`gameCopy` ve `games.<slug>`), çevrim içi oyunlarda `apps/realtime/src/matches/mod.rs` (`GameKind` enum + `from_slug` + `slug` + `players`) ve `compose.yaml` cargo watch dizinleri. 200 oyunda bu elle yürümez; otomatikleşmeli.
5. **Tür listesi dar.** `GameCategory` yalnızca 6 değer (arcade, puzzle, strategy, party, racing, action). Planda 14 tür var.
6. **Realtime tek instance ve bellekte.** ADR 0009 bunu bilerek seçmiş. 94 çevrim içi oyunla oda sayısı ve tick yükü artacak; ölçüm ve gerekirse oyun bazlı süreç ayrımı gerekir.
7. **Eşleştirme yalnızca Siper'de.** Diğer oyunlarda oda kodla kuruluyor. Küçük bir platformda 94 çevrim içi oyunun çoğu boş lobi gösterir; genel hızlı eşleşme + botla doldurma şart.
8. **Skor doğrulaması yok.** Sıralama "skorlar sunucuda doğrulanınca" bekliyor. Tek kişilik oyunlar tohumlu (seeded) ve girdi kaydı tutan bir yapıyla yazılırsa doğrulama sonradan ucuza eklenir.

## 2. Kalite çıtası — "basit değil" ne demek

Her oyun, B kademesi dahil, aşağıdakilerin tamamını karşılamadan yayına çıkmaz. Bu liste her dalgada kabul kriteridir.

**Ses**
- [ ] En az 8 olaya bağlı efekt (hareket, başarı, hata, kombo, kazanma, kaybetme, arayüz tıklaması, geri sayım), `@playnex/game-audio` tariflerinden.
- [ ] Oyun içi müzik döngüsü (prosedürel sekanslayıcı), menüde farklı ton; müzik bus'ı ayrı.
- [ ] Ses ayarı platformdaki `AudioMixer` ile; ilk kullanıcı girdisinde `resume()`.

**Animasyon ve his ("juice")**
- [ ] Partikül efekti (patlama, toplama, iz), ekran sarsıntısı, vuruş/başarı anında 40–80 ms duraksama, uçan puan yazıları.
- [ ] Giriş ve sonuç geçişleri; kazanma anında kutlama (PLAN 3: rekor konfetisi 1–2 sn).
- [ ] `host.reducedMotion` açıkken sarsıntı, flaş ve partiküller kapanır ya da azalır.

**Derinlik**
- [ ] En az biri: bölüm/ilerleme sistemi, zorluk seviyeleri, oyun modu çeşitleri, prosedürel içerik.
- [ ] Günlük meydan okuma (tohumlu) — tek kişilik oyunlarda zorunlu.
- [ ] İlk açılışta 30 saniyeyi geçmeyen etkileşimli öğretici.
- [ ] Oyun başına en az 6 başarım tanımı (veri dosyasında; platform başarım sistemi geldiğinde bağlanır).

**Çevrim içi oyunlar ek olarak**
- [ ] Sunucu otoriteli: sıra tabanlıda hamle, gerçek zamanlıda simülasyon sunucuda (PLAN 6).
- [ ] En az 2 zorlukta bot; boş koltuk botla dolar.
- [ ] Yeniden bağlanma (`sync`), çekilme (`forfeit`), zaman aşımı kuralları.
- [ ] `cargo test -p playnex-realtime <slug>` ile kural testleri.

**Teknik**
- [ ] Klavye + dokunmatik (masaüstü-only oyunlar kartta belirtilir), gamepad varsa eşleme.
- [ ] TR + EN metinler; oyun kodunda gömülü metin ve hex renk yok (`host.palette`).
- [ ] 2D'de orta seviye mobilde 60 FPS, 3D'de 30+ FPS; paket boyutu bütçesi (öneri: 2D oyun kodu < 150 KB gzip, Phaser hariç).
- [ ] `make lint`, `make typecheck`, ilgili testler yeşil; `make screenshots` ile oynama ekranı görüntüsü.

## 3. Faz 0 — Önce altyapı (oyunlardan önce yapılmalı)

Bu faz atlanırsa 200 oyun 200 farklı kalitede çıkar. Sırası önemli.

### 3.1 Oyun iskeleti üreteci (`make new-game`)
- `tools/new-game/` altında bir betik: `make new-game SLUG=okey-salonu` → `catalog-200.json` satırını okur, `games/2d|3d/<slug>/` paketini şablondan üretir.
- 9 dokunma noktasını ortadan kaldırmak için kayıtlar **otomatik keşifle** üretilsin: `registry.ts`, `transpilePackages` listesi ve katalog girdileri `games/*/*/game.json` dosyalarından derleme öncesi bir codegen adımıyla oluşturulsun (`pnpm gen:games`). Elle düzenlenen tek yer oyunun kendi klasörü olsun.
- `compose.yaml`'daki oyun başına node_modules volume'u 200 oyunda sürdürülemez. Bunu çözen bir ADR yazılır (seçenekler: oyun paketlerinin kendi bağımlılığı olmayıp kök node_modules'tan çözmesi, tek ortak volume, veya compose dosyasının da üretilmesi).
- Metinler `messages/tr.json` içinde tek dev dosyada değil, `games/<slug>/messages/{tr,en}.json` dosyalarında tutulup codegen ile birleştirilsin.

### 3.2 `@playnex/game-kit` (2D ve 3D ortak oyun kiti)
- **Juice:** `burst()`, `trail()`, `shake()`, `hitStop()`, `floatText()`, `confetti()`, sahne geçişleri; hepsi `reducedMotion`'a duyarlı. Phaser ve Babylon için ince adaptörler.
- **Arayüz:** öğretici katmanı, duraklatma menüsü, ayarlar (ses, titreşim, kontrol), geri sayım, sonuç ekranı parçaları (DOM + token sınıfları, ADR 0010 düzeni).
- **Girdi:** klavye/dokunmatik/gamepad eylem eşleme, sanal joystick, kaydırma algılama.
- **Tohumlu RNG + girdi kaydedici:** her tek kişilik oyun `seed` ile başlar ve girdileri kaydeder; skor doğrulaması (PLAN 6) ve günlük meydan okuma buradan çıkar.
- **İlerleme:** bölüm kilidi, yıldız, başarım tanımları için tipler (şimdilik `localStorage`, hesap varsa API).

### 3.3 `@playnex/game-audio`
- Siper `client/sound.ts`'deki sentez yaklaşımını genelle: parametreli efekt tarifleri (sfxr tarzı: dalga, zarf, frekans kayması, gürültü) ve 30+ hazır tarif (`coin`, `jump`, `hit`, `explosion`, `powerup`, `ui-click`, `win`, `lose`, `card-flip`, `dice`, `tile-place`…).
- Prosedürel müzik sekanslayıcısı: tempo, ölçek (Türk makamlarına yakın ölçekler dahil: hicaz, uşşak benzeri dizi seçenekleri), bas + lead + davul kalıpları; oyun durumu yoğunlaştıkça katman ekleme.
- Mobil titreşim (`navigator.vibrate`) aynı API'den.
- Lisanslı ses ve müzik dosyası kullanılmaz (Siper kararıyla aynı gerekçe).

### 3.4 Realtime genelleştirme
- **`GameKind` enum'u yerine kayıt tablosu:** her oyun modülü `slug`, oyuncu aralığı ve kurucu fonksiyonu bir makro/registry ile kaydeder; `mod.rs` 94 kez elle düzenlenmez.
- **Çerçeveler:**
  - `TurnBased<R: Rules>`: sıra, süre, hamle doğrulama, geri bağlanma, bot sırası. Masa ve kart oyunlarının çoğu yalnızca `Rules` yazar.
  - `Cards` modülü: deste, karıştırma, gizli el dağıtımı (her koltuğa yalnızca kendi eli gider), Okey taşları. Okey, Batak, King, Pişti, Briç, Kupa Kaçırma ortak kullanır.
  - `Arena<S: Sim>`: sabit tick (20/30/60 Hz), girdi kuyruğu, snapshot, ADR 0010'daki TS/Rust model aynası için şablon.
  - `Bot` trait'i: her oyun en az iki zorlukta bot sağlar; Siper'deki "boş koltuk botla dolar" kuralı tüm oyunlara.
- **Genel hızlı eşleşme:** oyun + mod seçilir; N saniye (öneri 10–20 sn) içinde rakip bulunmazsa botlarla başlar, gerçek oyuncu gelince botun yerini alır (Siper `admit` düzeni).
- **Kapasite:** tek instance için yük testi (`tools/` altında sentetik istemci); oda başına tick bütçesi metrikleri. Sınır aşılırsa ağır oyunlar (Son Çember, Akın Arenası) ayrı realtime sürecine.
- **Kalıcılık:** maç raporu Siper gibi `POST /internal/v1/matches` ile; şema oyun bağımsız hale getirilir.

### 3.5 Katalog ve platform ölçeklemesi
- `GameCategory`'ye ekle: `board`, `card`, `shooter`, `fighting`, `sports`, `platform`, `word`, `simulation`.
- Katalogda sayfalama/sonsuz kaydırma, tür sekmeleri, etiketler (örn. "Türk klasikleri", "Arkadaşla", "Günlük"), "rastgele oyun" düğmesi, favoriler.
- Ana sayfada türe göre raflar ("Masa başı", "Hızlı aksiyon", "Arkadaşlarla"); 200 oyunda tek ızgara kullanılamaz.
- **Kapak üreteci:** `GameCover` bileşeni oyunun accent rengi + tür ikonu + oyun içi sahne parçasından prosedürel kapak çizsin; 200 kapak için görsel dosya gerekmesin.
- Oyun başına sıralama kuralı `game.json`'dan (yüksek skor / en kısa süre / galibiyet / rating).

### 3.6 Faz 0 bitiş ölçütü
Snake Rush yeni kitle baştan yazılmış, `make new-game` ile üretilmiş bir örnek tek kişilik oyun ve `TurnBased` ile yazılmış bir örnek çevrim içi oyun (Dama Arena) uçtan uca çalışıyor; kalite çıtası kontrol listesinin tamamı geçiyor.

## 4. Mevcut 11 oyunun yenilenmesi

Yeni oyunlardan önce yapılır; kit'in ilk gerçek kullanıcıları bunlar olur.

| Oyun | Eksik | Yapılacak |
|---|---|---|
| Snake Rush | Ses yok, tween yok | Yeme/çarpma/hızlanma sesleri, kuyruk izi partikülü, ölümde parçalanma, tema müziği; 3 harita (engelli, portal, daralan), güçlendirmeler, günlük tohum, kozmetik yılan desenleri. "Snake Rush: Arena" ile aynı motor. |
| 2048 Fusion | Ses yok | Birleşme sesi perde yükselerek, birleşmede dalga efekti, 4x4/5x5/6x6, geri al jetonu, zaman yarışı modu, günlük tahta. |
| Memory Flip | Ses yok | Kart çevirme sesi, eşleşmede parıltı, kombo serisi, tema desteleri, 1v1 çevrim içi sıra tabanlı mod (Ortak'a da açılabilir). |
| Tuğla Tuğla | Ses yok | Satır temizleme sesi ve ekran sarsıntısı, kombo çarpanı, hayalet parça, tut (hold), 1v1 çevrim içi çöp gönderme modu. |
| Connect Four | Ses yok | Disk düşme fiziği ve sesi, kazanma çizgisi animasyonu; varyantlar: patlayan disk, çıkar-düşür, 8x7 tahta. |
| Air Hockey | Ses yok | Pak çarpma sesleri (hıza göre), gol patlaması, masa temaları, güçlendirmeli eğlence modu. |
| Chess Arena | Ses ve tween yok | Taş hareket animasyonu, alma/şah sesleri, son hamle vurgusu; varyantlar (Satranç 960, krala üç şah, atom) `shakmaty` ile; maç analizi. |
| Drawing Party | Ses yok | Fırça sesi, doğru tahmin efekti, zamanlayıcı sesi; kelime paketleri, çizim araçları (dolgu, şekil). |
| Trivia Battle | Ses yok | Soru açılış sesi, geri sayım tik-takı, doğru/yanlış efektleri; kategori seçme turu, joker hakları. |
| Neon Kart Racing | Ses yok | Motor sesi sentezi (hıza bağlı perde), drift lastik sesi, çarpışma; parçacık izi, yeni pistler, araç kozmetiği. |
| Siper | — | Planındaki açık madde: ikili/delta snapshot. Ses kiti çıkınca Siper'in sentez kodu kite taşınır. |

## 5. Dalga planı

Dalgalar ucuzdan pahalıya sıralandı: ilk dalgalar ortak çerçeveleri (kart/masa motoru, tohumlu bulmaca) olgunlaştırır, büyük 3D oyunlar sona kalır. Her dalga ~20 oyundur ve bağımsız yayınlanabilir.

| Dalga | Oyun | Çevrim içi | 3D | S/A/B | Öne çıkanlar |
|---|---|---|---|---|---|
| 1 | 20 | 6 | 1 | 0/0/20 | Pişti, Dama Arena, Ters Yüz, Amiral Battı, Kızma Birader |
| 2 | 20 | 14 | 2 | 0/4/16 | Okey Salonu, Tavla Ustası, Batak Masası, Duvar Yıkan, Tombala Gecesi |
| 3 | 20 | 9 | 2 | 0/6/14 | Renk Değiştir, Snake Rush: Arena, Tank Düellosu, Bilardo Salonu, Yıldız Filosu |
| 4 | 20 | 9 | 3 | 0/9/11 | King, Kelime Kalesi, Vampir Köylü, Harita Avcısı, Toprak Kapmaca |
| 5 | 20 | 7 | 1 | 0/8/12 | Göktaşı Avcısı, Kaçış Koridoru, İp Ucu, Gölge Koşucu, Simit Fabrikası |
| 6 | 20 | 10 | 2 | 0/15/5 | Mevzi, Uzay Kurtları, Güreş Meydanı, Sumo Robotları, Pota Düellosu |
| 7 | 20 | 11 | 7 | 2/14/4 | Mini Football, Kart Zindanı, Pinpon Ustası, Motor Kros, Sur Savunması |
| 8 | 20 | 9 | 3 | 2/17/1 | Party Parkour, Derin Zindan, Altıgen Taktik, Kaçış Odası: Konak, Robot Programla |
| 9 | 20 | 12 | 7 | 8/10/2 | Akın Arenası, Turbo Top, Gölge Dövüşü, Son Çember, Efsane Kartları |
| 10 | 20 | 7 | 14 | 7/12/1 | Şehir Hattı, Mahalle Kur, Boğaz Yarışı, Son Kale, Mantar Adası |

**Not:** Dalga 1 tamamen B kademesidir ama içinde Türkiye'de en çok aranan masa oyunlarının bir kısmı var (Pişti, Dama, Kızma Birader, Amiral Battı). Okey, Tavla ve Batak, kart motoru oturduktan hemen sonra Dalga 2'de.

## 6. Çalışma düzeni

1. Her oyun `make new-game` ile başlar ve Bölüm 2'deki kalite çıtası kabul kriteridir. Çevrim içi oyunlar `TurnBased` veya `Arena` çerçevesini kullanır.
2. Tek seferde tek iş: Faz 0'ın bir alt başlığı ya da bir dalganın 3–5 oyunu. İlerleme `docs/games/PROGRESS.md` dosyasında izlenir.
3. Her oyun bittiğinde `make lint`, `make typecheck`, `make check-rust`, ilgili testler ve `make screenshots` çalıştırılır; ardından oyun elle oynanır.
4. Faz 0 sırası: 3.1, 3.3, 3.2, 3.4, 3.5.

## 7. İsimlendirme ve hukuk notları

- İsimler bilinçli olarak **karışık**: Türkçe kimlikli isimler (Siper, Tuğla Tuğla çizgisi) ağırlıkta; bilinen uluslararası türlerde akılda kalan İngilizce isimler (PLAN'daki Mini Football, Party Parkour, Pixel Survivors) korunuyor.
- Tescilli oyun adları kullanılmadı (PLAN v1.1'deki "Block Blast" kararıyla aynı ilke). Mekanikler serbest, isimler ve görsel kimlik değil. Örnek eşleşmeler: kelime tahtası oyunu → **Kelime Kalesi**, bomba labirenti → **Fitil**, gemi savaşı → **Amiral Battı** (geleneksel Türkçe adı), el bitirme kart oyunu → **Renk Değiştir**, kod kırma → **Şifre Kırıcı**, yasaklı kelime → **Söyleme!**, kelime casusu oyunu → **Fısıltı Ağı**, beş harfli günlük kelime → **Harf Avı**, otopark kaydırma → **Otopark Çıkışı**.
- Yayından önce her isim için TÜRKPATENT ve EUIPO'da hızlı marka taraması yapılmalı; bu belge hukuki inceleme yerine geçmez.
- **Kumar mekaniği yok:** poker, rulet, slot, bahisli at yarışı listede bilinçli olarak yok (PLAN 1 kapsam dışı). Okey ve Batak puanla oynanır, sanal para bile yok.
- **Sözlükler:** Kelime oyunları için açık lisanslı Türkçe kelime listesi gerekir; TDK sözlüğü açık lisanslı değildir. Lisans doğrulanmadan sözlük repoya girmemeli.
- **Harita verisi:** Natural Earth (kamu malı) yeterli.
- **Kullanıcı içeriği** (Gölge Koşucu bölüm editörü, Rota Yarışı pist çizimi): paylaşım kodu ile; herkese açık galeri, moderasyon kapasitesi gelene kadar yok.

## 8. Kararlar

1. **Sayı:** 200 yeni oyun mevcut 11 oyunun üstüne eklenir; toplam 211.
2. **Hesap şartı:** Hızlı eşleşme hesap ister, kodlu özel oda misafire açıktır, botlu solo herkese açıktır.
3. **Sohbet:** Masa ve kart oyunlarında serbest sohbet yok; hazır ifadeler ve emoji var. Siper'in sohbeti olduğu gibi kalır.
4. **Ortak ilerleme:** Siper'deki XP, seviye ve başarım sistemi Faz 0 sonunda platform geneline taşınır; bütün oyunlar onu besler.
5. **Mobil öncelik:** 3D S kademesi aksiyon oyunları masaüstü-only olabilir; katalog kartında belirtilir.

## 9. Katalog

Kolonlar: **Mod** (Tek kişilik / 1v1 / Parti / Ortak), **Ağ** (Sıra tabanlı: hamle sunucuda doğrulanır; Sunucu sim: gerçek zamanlı otoriteli simülasyon), **Kademe** (S/A/B). Tüm çevrim içi oyunların solo-botlu modu vardır. Sıralama ve alanlar `catalog-200.json` ile birebir aynıdır.

### Dalga 1 — 20 oyun (6 çevrim içi, 14 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Pişti** | `pisti` | 1v1 | 2-4 | 2D | Kart | Sıra tabanlı | B | Pişti ve eşli pişti; vale ile toplama, pişti bonusu. | Kart savurma animasyonu, sayaçlı hızlı mod, bot hafızası zorluğa göre |
| 2 | **Dama Arena** | `dama-arena` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Türk daması ve uluslararası dama; zorunlu alma, dama çıkma. | Alma zinciri önizleme, sunucuda kural motoru, minimax bot, saatli mod |
| 3 | **Ters Yüz** | `ters-yuz` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Reversi; 8x8 ve 10x10 tahta. | Taş çevirme dalga animasyonu, geçerli hamle ipucu, alfa-beta bot |
| 4 | **Amiral Battı** | `amiral-batti` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Gemi yerleştir, atış yap, filoyu batır; klasik ve özel silah modu. | Radar taraması ve torpido gibi yetenekler, sonar sesi, olasılık haritalı bot |
| 5 | **Kızma Birader** | `kizma-birader` | Parti | 2-4 | 2D | Masa | Sıra tabanlı | B | Dört renk, altıyla çıkış, rakibi eve gönder. | 3D zar, piyon zıplama animasyonu, hızlı mod (2 piyon), botla doldurma |
| 6 | **Rüzgâr Kuşu** | `ruzgar-kusu` | Tek kişilik | 1 | 2D | Arcade | — | B | Tek dokunuşla uçuş; yerçekimi tersleyen ve hızlanan bölgeler. | Günlük tohumlu parkur, kozmetik kuşlar, hayalet |
| 7 | **Kule İnşa** | `kule-insa` | Tek kişilik | 1 | 3D | Arcade | — | B | Kayan blokları üst üste tam yerine bırak. | Kusursuz yerleşim kombosu, dinamik renk ve müzik |
| 8 | **Mağara Uçuşu** | `magara-ucusu` | Tek kişilik | 1 | 2D | Arcade | — | B | Daralan mağarada basılı tut ve uç. | Prosedürel mağara, yakıt kapsülleri |
| 9 | **Baloncuk Patlat** | `baloncuk-patlat` | Tek kişilik | 1 | 2D | Arcade | — | B | Renkli baloncukları eşleştir; 3+ aynı renk patlar. | Sekme nişanı, 80 bölüm, sonsuz mod |
| 10 | **Üçlük Yarışması** | `ucluk-yarismasi` | Tek kişilik | 1 | 2D | Spor | — | B | 60 saniyede raflardan üçlük at. | Zamanlama çubuğu, para topu |
| 11 | **Sudoku Salonu** | `sudoku-salonu` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Sudoku; 4 zorluk, not alma, günlük bulmaca. | Benzersiz çözümlü üreteç, akıllı ipucu (teknik adı ile) |
| 12 | **Mayın Avcısı** | `mayin-avcisi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Mayın tarlası; tahminsiz (çözülebilir) tahta seçeneği. | Çözülebilirlik üreteci, chord tıklama, mobil uzun bas |
| 13 | **Sabır Kartları** | `sabir-kartlari` | Tek kişilik | 1 | 2D | Kart | — | B | Klondike, Örümcek, FreeCell ve 5 sabır oyunu daha. | Çözülebilir dağıtım, otomatik tamamlama, geri al |
| 14 | **Harf Avı** | `harf-avi` | Tek kişilik | 1 | 2D | Kelime | — | B | Beş harfli Türkçe kelimeyi altı denemede bul; günlük kelime. | Paylaşılabilir sonuç ızgarası, sınırsız mod |
| 15 | **Sandık Ustası** | `sandik-ustasi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Sandıkları hedeflere it; 100 bölüm. | Sınırsız geri al, çözüm tekrarı, bölüm paketi JSON |
| 16 | **Otopark Çıkışı** | `otopark-cikisi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Araçları kaydırıp kırmızı arabayı çıkar. | Çözücü ile minimum hamle yıldızı |
| 17 | **Renk Akışı** | `renk-akisi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Aynı renkli noktaları kesişmeden birleştir. | Üreteç, altıgen ve köprülü tahtalar |
| 18 | **Renkli Şişeler** | `renkli-siseler` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Sıvıları döküp her şişede tek renk bırak. | Dökme animasyonu, çözücü |
| 19 | **Kelime Avı** | `kelime-avi` | Tek kişilik | 1 | 2D | Kelime | — | B | Harf tablosunda gizli kelimeleri bul. | Tema listeleri, zaman yarışı |
| 20 | **Yılanlı Merdiven** | `yilan-merdiven` | Parti | 2-6 | 2D | Masa | Sıra tabanlı | B | Klasik yılanlı merdiven, özel kare olaylarıyla. | Olay kartları, hızlı mod |

### Dalga 2 — 20 oyun (14 çevrim içi, 6 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 21 | **Okey Salonu** | `okey-salonu` | Parti | 2-4 | 2D | Kart | Sıra tabanlı | A | Klasik okey ve 101; istaka, gösterge, okey taşı, çifte gitme. | Sürükle-bırak istaka, otomatik dizme önerisi, 3 zorlukta bot, masa sohbet emojileri, el sonu puan tablosu |
| 22 | **Tavla Ustası** | `tavla-ustasi` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | A | Tavla; mars, katlama zarı, 3/5/7 puanlık maç. | Fizikli zar atışı, hamle geri alma (tur içinde), hamle ipucu, Elo, bot (açılış kitabı + Monte Carlo) |
| 23 | **Batak Masası** | `batak-masasi` | Parti | 4 | 2D | Kart | Sıra tabanlı | A | İhaleli ve eşli batak, koz seçimi. | İhale animasyonu, son eli göster, eş sinyalleri yok (hile önlemi), botla doldurma, puan geçmişi |
| 24 | **Duvar Yıkan** | `duvar-yikan` | Tek kişilik | 1 | 2D | Arcade | — | A | Tuğla kırıcı; 60 bölüm, boss duvarları, güçlendirmeler. | Çoklu top, lazer raket, bölüm editörü verisi JSON, parçacık patlamaları |
| 25 | **Tombala Gecesi** | `tombala-gecesi` | Parti | 2-30 | 2D | Masa | Sıra tabanlı | B | Sunucu torbadan çeker, kartlar otomatik işaretlenir; çinko ve tombala. | Sesli sayı anonsu (eSpeak NG, Siper hattı), çoklu kart, büyük oda performansı |
| 26 | **Mangala** | `mangala` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Geleneksel Türk zeka oyunu; 6 kuyu, hazine. | Taş dağıtma animasyonu, kural öğretici, mükemmel oyun botu (küçük durum uzayı) |
| 27 | **Beşte Biter** | `beste-biter` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Gomoku; 15x15'te beşi hizala, renju kuralı seçeneği. | Tehdit vurgusu, açılış kuralları, bot |
| 28 | **Zar Beşlisi** | `zar-beslisi` | Parti | 1-6 | 2D | Masa | Sıra tabanlı | B | Beş zar, üç atış, 13 kategori; özgün kurallı zar kombinasyon oyunu. | Zar tutma animasyonu, puan önerisi, solo günlük meydan okuma |
| 29 | **Şifre Kırıcı** | `sifre-kirici` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Renk kodunu tahmin et; iki oyuncu aynı anda birbirinin kodunu çözer. | Bilgi teorisi botu, solo günlük kod |
| 30 | **Domino Kahvesi** | `domino-kahvesi` | Parti | 2-4 | 2D | Masa | Sıra tabanlı | B | Blok ve çekme dominosu; eşli oyun. | Taş dizilim kamerası, puan sayımı animasyonu, bot |
| 31 | **Penaltı Düellosu** | `penalti-duellosu` | 1v1 | 2 | 3D | Spor | Sıra tabanlı | B | Eşzamanlı seçimle şut çek ve kaleci ol. | Fiziği gösterilen şut, psikolojik istatistik, bot |
| 32 | **Dart Gecesi** | `dart-gecesi` | Parti | 1-6 | 2D | Spor | Sıra tabanlı | B | 501, kriket ve saat oyunları. | Nefes salınımı nişan, kontrol hatası modeli, bot |
| 33 | **Okçu Düellosu** | `okcu-duellosu` | 1v1 | 2-4 | 2D | Aksiyon | Sıra tabanlı | B | Rüzgârlı sıra tabanlı okçu düellosu. | Kafa vuruşu, ok tipleri, deterministik balistik |
| 34 | **Kelime Zinciri** | `kelime-zinciri` | Parti | 2-8 | 2D | Kelime | Sıra tabanlı | B | Son harfle başlayan kelimeyi süre bitmeden yaz. | Sözlük doğrulama, kullanılmış kelime takibi, eleme |
| 35 | **Klavye Yarışı** | `klavye-yarisi` | Parti | 2-8 | 2D | Kelime | Sunucu sim | B | Türkçe metinleri en hızlı ve hatasız yaz. | WPM/doğruluk, hile önleme (yapıştırma engeli, ritim analizi), metin havuzu |
| 36 | **Zıpzıp Kule** | `zipzip-kule` | Tek kişilik | 1 | 2D | Platform | — | B | Sonsuz yukarı zıplama; kırılan ve hareketli platformlar. | Jetpack, yay, tohumlu günlük kule |
| 37 | **Kesik Kesik** | `kesik-kesik` | Tek kişilik | 1 | 2D | Arcade | — | B | Fırlayan meyveleri kes, bombalardan kaç. | Kesim izi, kombo, yarım meyve fiziği |
| 38 | **Yolu Geç** | `yolu-gec` | Tek kişilik | 1 | 3D | Arcade | — | B | Voksel şehirde yolları, nehirleri ve rayları geç. | Prosedürel şerit üretimi, toplanabilir karakterler |
| 39 | **Füze Komutanı** | `fuze-komutani` | Tek kişilik | 1 | 2D | Arcade | — | B | Şehirleri gelen füzelere karşı koru. | Patlama zinciri, dalga zorluğu |
| 40 | **Mahjong Taşları** | `mahjong-taslari` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Taş eşleştirme sabır oyunu; çok katlı düzenler. | Çözülebilir dizilim, 3D katman gölgeleri |

### Dalga 3 — 20 oyun (9 çevrim içi, 11 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 41 | **Pikselli Bilmece** | `pikselli-bilmece` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Sayı ipuçlarıyla gizli piksel resmi ortaya çıkar. | Benzersiz çözüm denetimi, renkli mod |
| 42 | **Su Tesisatı** | `su-tesisati` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Boruları döndürüp suyu kaynağa ulaştır. | Akış animasyonu, zamanlı mod |
| 43 | **Işık Yolu** | `isik-yolu` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Ayna ve prizmalarla lazeri hedeflere yönlendir. | Renk karışımı, ışın izleme |
| 44 | **Yedi Parça** | `yedi-parca` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Tangram; silüeti yedi parçayla doldur. | Esnek yerleşim toleransı, 200 silüet |
| 45 | **Mat Bulmacası** | `mat-bulmacasi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Günlük satranç bulmacaları; 1-4 hamlede mat. | Chess Arena motoru ile doğrulama, zorluk puanı |
| 46 | **Harf Karıştır** | `harf-karistir` | Tek kişilik | 1 | 2D | Kelime | — | B | Karışık harflerden olabildiğince çok kelime türet. | Sözlük, bonus kelimeler |
| 47 | **Hedef Sayı** | `hedef-sayi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Altı sayı ve dört işlemle hedefe ulaş. | Çözücü ile en yakın çözüm gösterimi |
| 48 | **Duvar Zıpla** | `duvar-zipla` | Tek kişilik | 1 | 2D | Platform | — | B | Duvardan duvara sekerek tırman. | Hassas zıplama, tuzaklar |
| 49 | **Renk Değiştir** | `renk-degistir` | Parti | 2-8 | 2D | Kart | Sıra tabanlı | A | Özgün kartlarla el bitirme oyunu; atla, yön değiştir, +2, joker. | Ev kuralları seçenekleri (üst üste koyma), son kart çağrısı, botlar |
| 50 | **Snake Rush: Arena** | `yilan-arenasi` | Parti | 2-20 | 2D | Arcade | Sunucu sim | A | Snake Rush'ın çok oyunculu arenası; diğer yılanları kes, kalıntılarını ye. | Sunucu otoriteli 20 Hz, kafa çarpışma kuralları, güç küreleri, botlarla dolan odalar |
| 51 | **Tank Düellosu** | `tank-duellosu` | Parti | 2-8 | 2D | Aksiyon | Sunucu sim | A | Labirentte seken mermilerle tank savaşı; takımlı ve herkes tek. | Sekme fiziği, yıkılabilir duvarlar, güçlendirmeler, prosedürel labirent |
| 52 | **Bilardo Salonu** | `bilardo-salonu` | 1v1 | 2 | 3D | Spor | Sıra tabanlı | A | 8 top ve 3 bant; gerçekçi fizik, fırça ve falso. | Sunucu deterministik fizik simülasyonu, istaka nişan çizgisi, replay, bot |
| 53 | **Yıldız Filosu** | `yildiz-filosu` | Tek kişilik | 1 | 2D | Nişancı | — | A | Dikey uzay nişancı; mermi desenleri ve boss'lar. | Desen editörü verisi, 6 bölüm boss, silah seviyeleri, tekrar kaydı ile skor doğrulama |
| 54 | **Lokum Diyarı** | `lokum-diyari` | Tek kişilik | 1 | 2D | Bulmaca | — | A | Üçlü eşleştirme; 150 bölüm, engeller, güçlendiriciler. | Bölüm haritası, özel taş kombinasyonları, kaskad animasyonu |
| 55 | **Kupa Kaçırma** | `kupa-kacirma` | Parti | 4 | 2D | Kart | Sıra tabanlı | B | Kupaları ve maça kızını almamaya çalış; ayı vurma. | Kart geçirme turu, el sonu ceza animasyonu, bot |
| 56 | **Yalancı Zar** | `yalanci-zar` | Parti | 2-6 | 2D | Parti | Sıra tabanlı | B | Bardak altında zarlar; teklif yükselt ya da yalancı de. | Bardak kaldırma gerilimi, blöf istatistiği, olasılık botu |
| 57 | **Köşe Kapmaca** | `kose-kapmaca` | Parti | 2-4 | 2D | Masa | Sıra tabanlı | B | Polimino parçaları yalnızca köşeden değdirerek yerleştir. | Parça döndürme/çevirme, alan sayımı, bot |
| 58 | **Söyleme!** | `soyleme` | Parti | 4-12 | 2D | Parti | Sıra tabanlı | B | Takım arkadaşına yasaklı kelimeleri kullanmadan kartı anlat. | Yasaklı kelime denetimi sunucuda, takım skorları, kart destesi TR/EN |
| 59 | **Lobut** | `lobut` | Parti | 1-6 | 3D | Spor | Sıra tabanlı | B | Bowling; falso, ağırlık seçimi. | Labut fiziği, strike animasyonu, puan kartı |
| 60 | **Labirent Hırsızı** | `labirent-hirsizi` | Tek kişilik | 1 | 2D | Arcade | — | B | Labirentte altınları topla; dört farklı kişilikli bekçi. | Bekçi kişilikleri, güç iksiri, labirent üreteci |

### Dalga 4 — 20 oyun (9 çevrim içi, 11 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 61 | **Spiral Düşüş** | `spiral-dusus` | Tek kişilik | 1 | 3D | Arcade | — | B | Dönen kule platformlarından topu düşür. | Kırma kombosu, renk bölgeleri |
| 62 | **Okyanus Avı** | `okyanus-avi` | Tek kişilik | 1 | 2D | Arcade | — | B | Küçükleri ye, büyü, büyüklerden kaç. | Sürü davranışı, besin zinciri |
| 63 | **Bilye Zinciri** | `bilye-zinciri` | Tek kişilik | 1 | 2D | Arcade | — | B | Yola akan bilye zincirine atış yap, üçlüleri patlat. | Eğri yollar, geri çekilme kombosu |
| 64 | **Hedef Okçuluk** | `hedef-okculuk` | Tek kişilik | 1 | 3D | Spor | — | B | Rüzgâr ve mesafeyle okçuluk turnuvası. | Nefes tutma, balistik |
| 65 | **Yapboz Atölyesi** | `yapboz-atolyesi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Prosedürel görüntülerden yapboz; 24-500 parça. | Parça şekil üreteci, kenar sıralama |
| 66 | **Altıgen Birleştir** | `altigen-birlestir` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Altıgen ızgarada aynı sayıları birleştir. | Zincir birleşme, geri al jetonu |
| 67 | **Vida Bulmaca** | `vida-bulmaca` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Vidaları doğru sırayla sök, plakaları düşür. | Katman fiziği |
| 68 | **Bulut Üstü** | `bulut-ustu` | Tek kişilik | 1 | 2D | Platform | — | B | Bulutlar arası zıplamalı rahat platform. | Kozmetikler, günlük tohum |
| 69 | **Ray Döşe** | `ray-dose` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Trenler çarpışmadan istasyonlara varsın diye ray döşe. | Zamanlı sim, makas mantığı |
| 70 | **Tarih Şeridi** | `tarih-seridi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Olay kartlarını zaman çizelgesinde doğru yere koy. | Kart havuzu TR/EN, can sistemi, günlük deste |
| 71 | **Element Birleştir** | `element-birlestir` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Dört temel elementten 300 kavrama ulaş. | Tarif grafiği, ipucu |
| 72 | **King** | `king` | Parti | 4 | 2D | Kart | Sıra tabanlı | A | 20 el, ceza ve koz oyunları; Türk masa klasiği. | Oyun seçme ekranı, kural hatırlatıcı, hile önleyici sunucu dağıtımı, bot |
| 73 | **Kelime Kalesi** | `kelime-kalesi` | 1v1 | 2-4 | 2D | Kelime | Sıra tabanlı | A | Harf taşlarıyla tahtaya Türkçe kelime diz; kelime ve harf katları. | açık lisanslı Türkçe kelime listesi (lisansı doğrulanmalı), kelime doğrulama sunucuda, en iyi hamle analizi |
| 74 | **Vampir Köylü** | `vampir-koylu` | Parti | 6-16 | 2D | Parti | Sıra tabanlı | A | Gece/gündüz döngülü sosyal çıkarım; vampir, doktor, gözcü ve fazlası. | Gizli rol dağıtımı sunucuda, oylama animasyonu, anlatıcı sesi, ölü sohbet kanalı |
| 75 | **Harita Avcısı** | `harita-avcisi` | Parti | 1-12 | 2D | Parti | Sıra tabanlı | A | Haritada yeri tahmin et; ülke, şehir, simge, Türkiye ili modları. | Mesafeye göre puan, açık harita verisi (Natural Earth), günlük solo tur |
| 76 | **Toprak Kapmaca** | `toprak-kapmaca` | Parti | 2-12 | 2D | Arcade | Sunucu sim | A | İz bırakarak alan kapat, rakibin izini kes. | Poligon alan hesabı sunucuda, prosedürel arena, botlar |
| 77 | **Fitil** | `fitil` | Parti | 2-4 | 2D | Aksiyon | Sunucu sim | A | Labirentte bomba bırak, zincirleme patlat, son ayakta kalan kazanır. | Zincir patlama kuralları sunucuda, 12 güçlendirme, harita seçici, botlar |
| 78 | **Pist Ustası** | `pist-ustasi` | Parti | 2-8 | 2D | Yarış | Sunucu sim | A | Kuşbakışı mini araç yarışı; masa, mutfak, bahçe pistleri. | Kart modelinin 2D aynası, drift, güçlendirmeler, bot pilotlar |
| 79 | **Mini Golf Adası** | `mini-golf-adasi` | Parti | 1-8 | 3D | Spor | Sıra tabanlı | A | 18 delikli mini golf; rampalar, döner engeller. | Deterministik top fiziği, eşzamanlı vuruş modu, parkur editörü sonraki sürümde |
| 80 | **Pixel Survivors** | `pixel-survivors` | Ortak | 1-4 | 2D | Aksiyon | Sunucu sim | A | Dalgalarca düşmana karşı otomatik saldırılarla hayatta kal; co-op. | Yükseltme ağacı, silah evrimleri, 4 kişilik co-op sunucu sim, 30 dk koşular |

### Dalga 5 — 20 oyun (7 çevrim içi, 13 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 81 | **Göktaşı Avcısı** | `goktasi-avcisi` | Tek kişilik | 1 | 2D | Nişancı | — | A | Çift çubuklu nişancı; dalga dalga düşman, yükseltmeler. | Gamepad desteği, neon partiküller, sonsuz mod |
| 82 | **Kaçış Koridoru** | `kacis-koridoru` | Tek kişilik | 1 | 3D | Arcade | — | A | Üç şeritli sonsuz koşu; kay, zıpla, şerit değiştir. | Bölüm parçası sistemi, görevler, karakter kozmetikleri |
| 83 | **İp Ucu** | `ip-ucu` | Tek kişilik | 1 | 2D | Bulmaca | — | A | İpleri kes, şekeri canavara ulaştır; fizik bulmacası. | Verlet ip fiziği, 60 bölüm, yıldızlar |
| 84 | **Gölge Koşucu** | `golge-kosucu` | Tek kişilik | 1 | 2D | Platform | — | A | Hassas platform; 60 bölüm, saniye ölçümlü tekrar. | Coyote time, girdi tamponu, bölüm editörü + paylaşım kodu |
| 85 | **Simit Fabrikası** | `simit-fabrikasi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Simit tezgahından fabrikaya idle tycoon. | Çevrimdışı kazanç, prestij sistemi, otomasyon |
| 86 | **Hex Köprü** | `hex-kopru` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | B | Altıgen tahtada iki kenarı birleştir; berabere yok. | Swap kuralı, MCTS bot, 11x11 ve 13x13 |
| 87 | **Plaj Voleybolu** | `plaj-voleybolu` | 1v1 | 2-4 | 2D | Spor | Sunucu sim | B | 2v2 fizikli plaj voleybolu. | Top fiziği aynası, smaç zamanlama, bot |
| 88 | **Farkı Bul** | `farki-bul` | Parti | 1-8 | 2D | Parti | Sıra tabanlı | B | Prosedürel sahnelerde farkları ilk sen bul. | Prosedürel sahne üreteci (asset gerektirmez), eşzamanlı yarış |
| 89 | **Yerçekimi Ters** | `yercekimi-ters` | Tek kişilik | 1 | 2D | Platform | — | B | Yerçekimini tersleyerek ilerle. | Ritim bölümleri |
| 90 | **Kanca Ustası** | `kanca-ustasi` | Tek kişilik | 1 | 2D | Platform | — | B | Kancayla sallan, momentumu koru. | Sarkaç fiziği, hız koşusu |
| 91 | **Çarşı Birleştir** | `carsi-birlestir` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Eşyaları birleştirip çarşıyı yeniden kur. | Sipariş tahtası, 8 ürün zinciri |
| 92 | **Olta Başı** | `olta-basi` | Tek kişilik | 1 | 2D | Simülasyon | — | B | Balık tut, olta yükselt, nadir balıkları topla. | Balık davranışı, koleksiyon defteri |
| 93 | **Gizli Kelime** | `gizli-kelime` | Parti | 3-10 | 2D | Kelime | Sıra tabanlı | B | Herkes aynı kelimeyi bilir, biri bilmez; çaktırmadan bul. | Tur zamanlayıcı, oylama, kelime havuzu |
| 94 | **Tek Çizgi** | `tek-cizgi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Şekli kalemi kaldırmadan çiz. | Euler yolu üreteci |
| 95 | **Volkan Kaçışı** | `volkan-kacisi` | Tek kişilik | 1 | 2D | Platform | — | B | Yükselen lavdan dikey kaç. | Prosedürel kule, yetenekler |
| 96 | **Çizgi Sürücü** | `cizgi-surucu` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Çizdiğin çizgi üstünde kızağı hedefe ulaştır. | Çizgi fiziği, mürekkep sınırı |
| 97 | **Kahraman Tıklayıcı** | `kahraman-tiklayici` | Tek kişilik | 1 | 2D | Simülasyon | — | B | Idle RPG; kahraman topla, zindan geç. | Prestij, çevrimdışı ilerleme |
| 98 | **Go Taşı** | `go-tasi` | 1v1 | 2 | 2D | Masa | Sıra tabanlı | A | Go; 9x9, 13x13, 19x19, Japon sayımı. | Ko kuralı sunucuda, ölü taş işaretleme, handikap, MCTS bot |
| 99 | **Fısıltı Ağı** | `fisilti-agi` | Parti | 4-10 | 2D | Kelime | Sıra tabanlı | A | İki takım, tek kelimelik ipuçlarıyla ajanlarını bul; suikastçıdan kaç. | Özgün kelime havuzu, ipucu doğrulama, zamanlayıcı, izleyici modu |
| 100 | **Fetih Haritası** | `fetih-haritasi` | Parti | 2-6 | 2D | Strateji | Sıra tabanlı | A | Bölgelere asker yerleştir, saldır, kıtaları tut; Anadolu ve dünya haritası. | Zar savaşı animasyonu, görev kartları, bot stratejileri, kaydedilebilir uzun maç |

### Dalga 6 — 20 oyun (10 çevrim içi, 10 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 101 | **Mevzi** | `mevzi` | Parti | 2-4 | 2D | Aksiyon | Sıra tabanlı | A | Sıra tabanlı topçu düellosu; rüzgâr, parçalanan arazi, silah çantası. | Piksel tabanlı yıkılabilir arazi, deterministik mermi fiziği (TS/Rust aynası), takım modu |
| 102 | **Uzay Kurtları** | `uzay-kurtlari` | Parti | 2-8 | 2D | Nişancı | Sunucu sim | A | Ataletli uzay gemileriyle arena ölüm maçı; asteroit kuşakları. | Newton fiziği, ışın ve füze silahları, takım modu, botlar |
| 103 | **Güreş Meydanı** | `gures-meydani` | 1v1 | 2 | 2D | Dövüş | Sunucu sim | A | Fizik tabanlı yağlı güreş; dengesini boz, sırtını yere getir. | Aktif ragdoll, kavrama sistemi, davul-zurna sentez müziği, bot |
| 104 | **Sumo Robotları** | `sumo-robotlari` | Parti | 2-8 | 3D | Aksiyon | Sunucu sim | A | Robotunu yükselt, rakipleri platformdan düşür. | Fizik itişme sunucuda, daralan platform, kozmetik parçalar |
| 105 | **Pota Düellosu** | `pota-duellosu` | 1v1 | 2-4 | 2D | Spor | Sunucu sim | A | 1v1 ve 2v2 sokak basketbolu. | Şut zamanlama, blok/çalma, sunucu sim, bot |
| 106 | **Langırt** | `langirt` | 1v1 | 2-4 | 2D | Spor | Sunucu sim | A | Çubuklu masa futbolu; çubuk seç, döndür, vur. | 60 Hz masa fiziği (Air Hockey düzeni), dokunmatik çubuk kontrolü, bot |
| 107 | **Mikro Parti** | `mikro-parti` | Parti | 2-8 | 2D | Parti | Sunucu sim | A | 5 saniyelik 40+ mini oyun art arda; en hızlı refleks kazanır. | Mini oyun çerçevesi (yeni mikro oyun eklemek kolay), hızlanan tempo, eleme |
| 108 | **Pinball Pera** | `pinball-pera` | Tek kişilik | 1 | 2D | Arcade | — | A | Beyoğlu temalı fizikli tilt makinesi; görevler ve çoklu top. | Sürekli çarpışma fiziği, 3 masa, masa görev sistemi |
| 109 | **Çengel Bulmaca** | `cengel-bulmaca` | Tek kişilik | 1 | 2D | Kelime | — | A | Türkçe çapraz bulmaca üreteci; günlük bulmaca. | Bulmaca üretici, ipucu veritabanı, kalem/kurşun kalem modu |
| 110 | **Kule Kontrol** | `kule-kontrol` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Hava trafik kontrolü; uçakları pistlere çarpışmadan indir. | Rota çizme, hava durumu, gerçek havalimanı düzenleri (şematik) |
| 111 | **Maden Kazısı** | `maden-kazisi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Derinlere kaz, cevher sat, kazıcını yükselt. | Prosedürel yeraltı, yakıt/basınç, yükseltme döngüsü |
| 112 | **Yörünge** | `yorunge` | Tek kişilik | 1 | 2D | Bulmaca | — | A | Gezegen çekimiyle sondayı hedefe fırlat. | N-cisim yerçekimi, 60 bölüm |
| 113 | **Dedektif Tablosu** | `dedektif-tablosu` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Mantık ızgarası bulmacaları. | Üreteç, çelişki vurgusu |
| 114 | **Dağ Tırmanışı** | `dag-tirmanisi` | Tek kişilik | 1 | 2D | Platform | — | B | Fizik kontrollü zorlu tırmanış. | Kaydetme noktası yok modu, anlatıcı |
| 115 | **Atlama Kulesi** | `atlama-kulesi` | Tek kişilik | 1 | 2D | Spor | — | B | Kayakla atlama; rüzgâr ve iniş tekniği. | Uçuş fiziği |
| 116 | **Yarım Ay Bilmece** | `yarim-ay-bilmece` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Simetri ve döndürme bulmacaları. | Üreteç |
| 117 | **Gölge Oyunu** | `golge-oyunu` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Işık kaynağını oynatıp gölgeyle köprü kur. | Gölge poligon hesaplama |
| 118 | **Kılıç Ustası** | `kilic-ustasi` | 1v1 | 2 | 2D | Dövüş | Sunucu sim | A | Dayanıklılık, savuşturma ve kombo üzerine kurulu kılıç düellosu. | Kare doğru hitbox, rollback benzeri tahmin, 6 karakter, bot |
| 119 | **Kartopu Savaşı** | `kartopu-savasi` | Parti | 2-8 | 3D | Nişancı | Sunucu sim | A | Kardan siper kur, kartopu at, bayrağı kap. | Kar yığma/inşa, eğimli atış, sezonluk etkinlik |
| 120 | **Pervane** | `pervane` | Parti | 2-8 | 2D | Nişancı | Sunucu sim | A | Yandan görünüm çift kanatlı uçak it dalaşı. | Stall ve hız fiziği, bulut örtüsü, takım modu, botlar |

### Dalga 7 — 20 oyun (11 çevrim içi, 9 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 121 | **Pinpon Ustası** | `pinpon-ustasi` | 1v1 | 2 | 3D | Spor | Sunucu sim | A | Masa tenisi; kesme, falso, servis çeşitleri. | Raket açısı fiziği, gecikme telafisi, antrenman robotu |
| 122 | **Motor Kros** | `motor-kros` | Parti | 1-8 | 2D | Yarış | Sunucu sim | A | Yandan fizikli motor; ters takla, rampa, hayalet yarış. | Box2D benzeri fizik, hayalet replay, günlük pist, çevrim içi eşzamanlı yarış |
| 123 | **Sur Savunması** | `sur-savunmasi` | Ortak | 1-4 | 2D | Strateji | Sunucu sim | A | Kule savunması; arkadaşlarla aynı haritada kule paylaşımı. | 20 kule x 3 dal, kahraman birimi, sonsuz mod, co-op ekonomi |
| 124 | **Ritim Yolu** | `ritim-yolu` | Tek kişilik | 1 | 2D | Arcade | — | A | Prosedürel müzikle ritim oyunu; notaları yakala. | Sentezlenen parçalar, zorluk seçimi, gecikme kalibrasyonu |
| 125 | **Mermer Yolu** | `mermer-yolu` | Tek kişilik | 1 | 3D | Arcade | — | A | Eğimli parkurda bilye yuvarla; zamana karşı. | Eğim kontrolü (jiroskop desteği), 40 parkur, hayalet |
| 126 | **Köprü Mühendisi** | `kopru-muhendisi` | Tek kişilik | 1 | 2D | Bulmaca | — | A | Bütçeyle köprü kur, yükü geçir. | Gerilim simülasyonu, malzeme türleri, test sürüşü |
| 127 | **Küp Döndür** | `kup-dondur` | Tek kişilik | 1 | 3D | Bulmaca | — | A | 2x2-5x5 küp bulmacası; zamanlı çözüm. | Çözücü ile ipucu, karıştırma tohumu, ortalama süre |
| 128 | **Çay Bahçesi** | `cay-bahcesi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Zaman yönetimli kafe işletmesi. | Müşteri sabrı, menü genişletme, dekorasyon |
| 129 | **Karantina** | `karantina` | Tek kişilik | 1 | 2D | Aksiyon | — | A | Kuşbakışı zombi kaçışı; topla, üret, kaç. | Prosedürel şehir, gürültü sistemi, kalıcı yükseltmeler |
| 130 | **Mini Football** | `mini-football` | Parti | 2-6 | 3D | Spor | Sunucu sim | S | 2v2/3v3 hızlı futbol; şut, pas, kayarak müdahale. | Sunucu top fiziği, oyuncu tahmini, pozisyon alan botlar, maç sonu özet, rütbe |
| 131 | **Kart Zindanı** | `kart-zindani` | Tek kişilik | 1 | 2D | Strateji | — | S | Roguelike deste kurma; harita, olaylar, boss'lar. | 150 kart, 3 karakter, kalıntılar, günlük tohum, koşu geçmişi |
| 132 | **Sandalye Kapmaca** | `sandalye-kapmaca` | Parti | 3-12 | 3D | Parti | Sunucu sim | B | Müzik durunca sandalye kap; itiş kakış. | Prosedürel müzik, itme fiziği, eleme turları |
| 133 | **Kanyon Uçuşu** | `kanyon-ucusu` | Tek kişilik | 1 | 3D | Yarış | — | B | Kanyonlarda halkalardan geçerek uç. | Uçuş modeli, halka zinciri |
| 134 | **Ritim Düellosu** | `ritim-duellosu` | 1v1 | 2 | 2D | Parti | Sunucu sim | B | Ritim Yolu notalarıyla eşzamanlı düello. | Aynı tohumlu parça, gecikme kalibrasyonu |
| 135 | **Kum Saati** | `kum-saati` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Kumu yönlendir, kapları doldur. | Hücresel kum simülasyonu |
| 136 | **Pazar Kurulu** | `pazar-kurulu` | Parti | 2-5 | 2D | Strateji | Sıra tabanlı | A | Kervan yolları, kaynak üretimi ve takasla İpek Yolu ticaret oyunu. | Takas teklif ekranı, rastgele harita, bot ekonomisi, uzun maç kaydı |
| 137 | **Briç Kulübü** | `bric-kulubu` | Parti | 4 | 2D | Kart | Sıra tabanlı | A | Kontrat briç; ihale, yer değiştirme, puanlama. | İhale sistemi rehberi, el analizi, bot (basit konvansiyonlar) |
| 138 | **Neon Takip** | `neon-takip` | Parti | 4-10 | 2D | Nişancı | Sunucu sim | A | Kuşbakışı takım lazer etiketi; bayrak kap, bölge tut. | Görüş konisi (Siper görünürlük kuralları), yansıyan lazer, botlar |
| 139 | **Saklambaç** | `saklambac` | Parti | 4-12 | 3D | Parti | Sunucu sim | A | Nesneye dönüşüp saklan, avcılardan kaç. | Nesne kütüphanesi, avcı tarama yeteneği, ses ipuçları |
| 140 | **Kebap Telaşı** | `kebap-telasi` | Ortak | 1-4 | 2D | Parti | Sunucu sim | A | Kaotik mutfakta siparişleri birlikte yetiştir. | Değişen mutfak düzenleri, iş bölümü, 30 bölüm, yıldız sistemi |

### Dalga 8 — 20 oyun (9 çevrim içi, 11 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 141 | **Altıgen Taktik** | `altigen-taktik` | 1v1 | 2 | 2D | Strateji | Sıra tabanlı | A | Altıgen haritada birlik taktikleri; arazi ve menzil. | Birlik sınıfları, sis, sunucu kural motoru, bot |
| 142 | **Kaçış Odası: Konak** | `kacis-odasi-konak` | Tek kişilik | 1 | 2D | Bulmaca | — | A | Eski bir İstanbul konağından ipuçlarıyla kaç. | Envanter, birleştirme, 5 oda, ipucu kademeleri |
| 143 | **Robot Programla** | `robot-programla` | Tek kişilik | 1 | 2D | Bulmaca | — | A | Komut bloklarıyla robotu programla; döngü ve koşullar. | Görsel programlama, çözüm uzunluğu yıldızı, eğitici |
| 144 | **Hat Ustası** | `hat-ustasi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Büyüyen şehre metro hatları çiz. | Yolcu simülasyonu, haftalık ödüller, şehir haritaları |
| 145 | **Zaman Döngüsü** | `zaman-dongusu` | Tek kişilik | 1 | 2D | Platform | — | A | Geçmiş kopyalarınla birlikte bulmaca çöz. | Girdi kayıt/oynatma (deterministik), 40 bölüm |
| 146 | **Bozkır Savaşçısı** | `bozkir-savascisi` | Tek kişilik | 1 | 2D | Aksiyon | — | A | Yandan görünüm hack-and-slash roguelite. | Kombo sistemi, silah ağacı, prosedürel bölümler |
| 147 | **Köy Çiftliği** | `koy-ciftligi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Ek, sula, hasat et, hayvan besle, pazarda sat. | Mevsimler, üretim zinciri, kayıt |
| 148 | **Ring Ustası** | `ring-ustasi` | 1v1 | 2 | 3D | Dövüş | Sunucu sim | A | Boks; gard, kafa-gövde kombinasyonları, dayanıklılık. | Vuruş zamanlaması, kondisyon sistemi, kariyer modu botlara karşı |
| 149 | **Ejder Yuvası** | `ejder-yuvasi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Ejderhanı yumurtadan yetiştir, eğit, yarıştır. | Genetik özellikler, bakım döngüsü, mini oyunlar |
| 150 | **Party Parkour** | `party-parkour` | Parti | 2-12 | 3D | Parti | Sunucu sim | S | Elemeli engel parkuru turnuvası; döner çekiç, düşen zemin. | Fizik itişme, tur havuzu (15 parkur), izleyici kamerası, sezon kozmetikleri |
| 151 | **Derin Zindan** | `derin-zindan` | Ortak | 1-4 | 2D | Aksiyon | Sunucu sim | S | Prosedürel zindan keşif roguelite; sınıflar ve ganimet. | Prosedürel kat üretimi, 4 sınıf, eşya nadirliği, boss davranış ağaçları |
| 152 | **Hafıza Ustası** | `hafiza-ustasi` | Tek kişilik | 1 | 2D | Bulmaca | — | B | Sayı, renk ve konum dizilerini hatırla; beyin antrenmanı. | Adaptif zorluk, günlük test |
| 153 | **Ordu Kur** | `ordu-kur` | Parti | 2-8 | 2D | Strateji | Sıra tabanlı | A | Otomatik savaş; birlik al, diz, sinerjileri kur. | Eşzamanlı alım evresi, sunucu savaş simülasyonu, 40 birlik, replay |
| 154 | **Arıza Var!** | `ariza-var` | Ortak | 2-6 | 2D | Parti | Sunucu sim | A | Uzay gemisi düşerken herkes farklı paneli görür; komutları bağır. | Prosedürel panel üretimi, artan zorluk, sesli sohbet gerektirmeyen metin çağrıları |
| 155 | **İki Anahtar** | `iki-anahtar` | Ortak | 2 | 2D | Bulmaca | Sunucu sim | A | Yalnızca iki oyuncunun birlikte çözebildiği asimetrik bulmaca labirenti. | Her oyuncu farklı bilgi görür, 40 bölüm, ping işaretleri |
| 156 | **İkiz Ruhlar** | `ikiz-ruhlar` | Ortak | 2 | 2D | Platform | Sunucu sim | A | Ateş ve buz ikiliyle co-op platform bulmacası. | Sunucu platform fiziği, yerel ve çevrim içi co-op, 50 bölüm |
| 157 | **Drift Kralı** | `drift-krali` | Parti | 1-8 | 3D | Yarış | Sunucu sim | A | Puanlı drift; zincir çarpanı, tandem drift. | Arka itiş araç modeli, drift puanlama, hayalet ve çevrim içi oturum |
| 158 | **Dev Avcısı** | `dev-avcisi` | Tek kişilik | 1 | 2D | Aksiyon | — | A | Yalnızca boss savaşlarından oluşan aksiyon. | 10 boss, desen öğrenme, sıfır hasar ödülü |
| 159 | **Gölge Hırsız** | `golge-hirsiz` | Tek kişilik | 1 | 2D | Aksiyon | — | A | Gizlilik; ışık, ses ve devriye rotaları. | Görüş/işitme modeli, alternatif yollar |
| 160 | **Karınca Yuvası** | `karinca-yuvasi` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Koloniyi büyüt; işçi, asker, kraliçe. | Feromon yol bulma, sürü simülasyonu |

### Dalga 9 — 20 oyun (12 çevrim içi, 8 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 161 | **Toz Duman Ralli** | `toz-duman-ralli` | Tek kişilik | 1 | 3D | Yarış | — | A | Zamana karşı ralli; çakar notları. | Zemin türleri, hasar, hayalet |
| 162 | **Kaykay Parkı** | `kaykay-parki` | Tek kişilik | 1 | 3D | Spor | — | A | Rampa ve raylarda figür kombosu. | Figür sistemi, kombo çarpanı |
| 163 | **Uzay Madencisi** | `uzay-madencisi` | Ortak | 1-4 | 2D | Aksiyon | Sunucu sim | A | Asteroitlerde birlikte maden kaz, gemiyi koru. | Ekip rolleri, kaynak paylaşımı |
| 164 | **Kule 100** | `kule-yuz` | Tek kişilik | 1 | 2D | Aksiyon | — | A | Yüz katlı kuleyi roguelite tırman. | Kat üreteci, büyü sistemi |
| 165 | **Akın Arenası** | `akin-arenasi` | Parti | 4-12 | 3D | Aksiyon | Sunucu sim | S | Kahraman tabanlı takım arenası; yetenekler, hedef ele geçirme. | 10 kahraman, yetenek ağaçları, Siper altyapısı üstüne, rütbe ve sezon |
| 166 | **Turbo Top** | `turbo-top` | Parti | 2-6 | 3D | Spor | Sunucu sim | S | Roketli arabalarla dev topa vur; 1v1, 2v2, 3v3. | Araç zıplama/boost fiziği, top tahmini, replay kamerası |
| 167 | **Gölge Dövüşü** | `golge-dovusu` | Parti | 2-4 | 2D | Dövüş | Sunucu sim | S | Platform dövüşü; rakibi arenadan fırlat. | Hasar yüzdesi ve fırlatma fiziği, 8 karakter, rollback benzeri tahmin, eşya modu |
| 168 | **Mercan Resifi** | `mercan-resifi` | Tek kişilik | 1 | 2D | Simülasyon | — | B | Resifini kur, balıkları besle ve çoğalt. | Ekosistem dengesi, idle |
| 169 | **Rota Yarışı** | `rota-yarisi` | Parti | 2-8 | 2D | Yarış | Sunucu sim | B | Oyuncunun çizdiği pistte yarış. | Pist çizim aracı, paylaşım kodu |
| 170 | **Kale Savaşları** | `kale-savaslari` | Parti | 2-4 | 2D | Strateji | Sunucu sim | A | Hafif gerçek zamanlı strateji; kaynak, birlik, kuşatma. | Deterministik lockstep, sis, 3 hizip, bot davranışı |
| 171 | **Barbaros Rüzgârı** | `barbaros-ruzgari` | Parti | 2-8 | 3D | Aksiyon | Sunucu sim | A | Yelkenli gemilerle rüzgâra karşı top düellosu. | Rüzgâr ve yelken modeli, borda ateşi, filo modu |
| 172 | **Kasa Soygunu** | `kasa-soygunu` | Parti | 2-5 | 2D | Parti | Sunucu sim | A | Asimetrik: bir bekçi kameralarla izler, hırsızlar kasayı açar. | Asimetrik görünürlük sunucuda, kamera/alarm sistemi, botlar |
| 173 | **Kar Yarışı** | `kar-yarisi` | Parti | 1-8 | 3D | Yarış | Sunucu sim | A | Kayak ve snowboard ile dağdan iniş; kapılar ve atlayışlar. | Eğim fiziği, figür puanı, hayalet |
| 174 | **Cinayet Masası** | `cinayet-masasi` | Tek kişilik | 1 | 2D | Bulmaca | — | A | Delil, ifade ve zaman çizelgesiyle katili bul. | Dallanan sorgular, delil panosu, 6 dava |
| 175 | **Yörünge İstasyonu** | `yorunge-istasyonu` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Uzay istasyonunu modül modül kur, mürettebatı yaşat. | Oksijen/enerji ağı, olaylar |
| 176 | **Son Çember** | `son-cember` | Parti | 2-30 | 2D | Nişancı | Sunucu sim | S | Kuşbakışı battle royale; daralan çember, ganimet, araç. | Büyük oda için alan bazlı snapshot, ilgi yönetimi, botlar, Siper silah verisi |
| 177 | **Efsane Kartları** | `efsane-kartlari` | 1v1 | 2 | 2D | Kart | Sıra tabanlı | S | Özgün evrenli koleksiyon kart düellosu; deste kur, mana yönet. | 200 kart, deste kurucu, sunucu kural motoru, kozmetik kart kaplamaları (satın alma yok) |
| 178 | **Puzzle Worlds** | `puzzle-worlds` | Ortak | 1-4 | 3D | Bulmaca | Sunucu sim | S | Küçük adalarda co-op fizik bulmacaları. | Basınç plakası, taşınabilir nesneler, 4 dünya, solo/co-op ölçekleme |
| 179 | **Unutulmuş Kale** | `unutulmus-kale` | Tek kişilik | 1 | 2D | Platform | — | S | Keşif odaklı aksiyon platform; yetenekle açılan yollar. | Birbirine bağlı harita, 8 yetenek, 5 boss, kayıt sistemi |
| 180 | **Taktik Birlik** | `taktik-birlik` | Tek kişilik | 1 | 2D | Strateji | — | S | Sıra tabanlı ekip taktikleri; siper, isabet yüzdesi. | Kampanya, kalıcı ölüm, yükseltme üssü |

### Dalga 10 — 20 oyun (7 çevrim içi, 13 tek kişilik)

| # | Oyun | slug | Mod | Oyuncu | Boyut | Tür | Ağ | Kademe | Konsept | Onu basit olmaktan çıkaranlar |
|---|---|---|---|---|---|---|---|---|---|---|
| 181 | **Şehir Hattı** | `sehir-hatti` | Tek kişilik | 1 | 3D | Simülasyon | — | S | İstanbul'da otobüs şoförlüğü; duraklar, trafik. | Trafik davranışı, yolcu memnuniyeti, gece seferi |
| 182 | **Mahalle Kur** | `mahalle-kur` | Tek kişilik | 1 | 3D | Simülasyon | — | S | Hafif şehir kurma; imar, ulaşım, mutluluk. | Hücre tabanlı simülasyon, bütçe, afet olayları |
| 183 | **Buz Pateni** | `buz-pateni` | Tek kişilik | 1 | 3D | Spor | — | B | Ritimli artistik patinaj. | Figür ritmi |
| 184 | **Anti Yerçekimi** | `anti-yercekimi` | Parti | 2-8 | 3D | Yarış | Sunucu sim | A | Neon tünellerde yerçekimsiz araç yarışı. | Tünel eğrisi pist, hız pedleri, silahlar, kart altyapısı paylaşımı |
| 185 | **İmkânsız Yol** | `imkansiz-yol` | Tek kişilik | 1 | 3D | Bulmaca | — | A | Perspektifle bağlanan imkânsız yapılarda yol bul. | Ortografik görünüm hilesi, döndürülebilir yapılar |
| 186 | **Tır Rotası** | `tir-rotasi` | Tek kişilik | 1 | 3D | Simülasyon | — | A | Yük taşı, rota planla, filonu büyüt. | Yakıt/mola, sözleşmeler |
| 187 | **Yıldız Tüccarı** | `yildiz-tuccari` | Tek kişilik | 1 | 2D | Simülasyon | — | A | Yıldızlar arası ticaret ve korsanlar. | Dinamik fiyatlar, olaylar |
| 188 | **Teknik Direktör** | `teknik-direktor` | Tek kişilik | 1 | 2D | Spor | — | A | Futbol menajeri; kadro, taktik, transfer. | Maç motoru metin+2D, sezon ve lig, özgün oyuncu isimleri |
| 189 | **Hayalet Avcıları** | `hayalet-avcilari` | Ortak | 2-4 | 2D | Aksiyon | Sunucu sim | A | Perili konakta fenerlerle hayalet yakala. | Asimetrik bir oyuncu hayalet modu |
| 190 | **Çift Kale** | `cift-kale` | 1v1 | 2 | 2D | Strateji | Sunucu sim | A | Mobil tarzı şerit savaşı; kart ile birlik gönder. | İksir ekonomisi, sunucu sim |
| 191 | **Gök Kartalı** | `gok-kartali` | Tek kişilik | 1 | 3D | Nişancı | — | A | Arcade jet uçağı görevleri. | Uçuş modeli, kilitlenen füzeler, 10 görev |
| 192 | **Boğaz Yarışı** | `bogaz-yarisi` | Parti | 2-8 | 3D | Yarış | Sunucu sim | S | İstanbul Boğazı'nda sürat teknesi yarışı; dalga ve akıntı. | Dalga yüzeyi shader'ı, akıntı alanları, köprü altları, gece modu |
| 193 | **Son Kale** | `son-kale` | Ortak | 1-4 | 3D | Nişancı | Sunucu sim | S | Zombi dalgalarına karşı üssü savun, barikat kur. | Sürü davranışı (sunucu), barikat inşası, silah yükseltme, 3 harita |
| 194 | **Mantar Adası** | `mantar-adasi` | Tek kişilik | 1 | 3D | Platform | — | S | 3D toplama platformu; açık adalar. | Kamera sistemi, 5 ada, toplanabilirler, hareket seti (çift zıplama, dalış) |
| 195 | **Nebula Gezgini** | `nebula-gezgini` | Tek kişilik | 1 | 3D | Simülasyon | — | A | Prosedürel galakside keşif ve tarama. | Gezegen üretimi, yakıt/ticaret, gemi yükseltme |
| 196 | **Gece Nöbeti** | `gece-nobeti` | Ortak | 2-4 | 3D | Aksiyon | Sunucu sim | A | Fenerle karanlık ormanda birlikte hayatta kal. | Işık mekaniği, ses ipuçları |
| 197 | **Ada Fethi** | `ada-fethi` | Parti | 2-4 | 2D | Strateji | Sunucu sim | A | Gerçek zamanlı ada bölge savaşı; asker akışı. | Akış birimleri, bot |
| 198 | **Derinlik** | `derinlik` | Tek kişilik | 1 | 3D | Simülasyon | — | A | Denizaltıyla okyanus tabanını keşfet. | Basınç, ışık, ses tabanlı navigasyon |
| 199 | **İmparatorluk** | `imparatorluk` | Tek kişilik | 1 | 2D | Strateji | — | S | Hafif 4X: keşfet, genişlet, sömür, yok et. | Altıgen harita üreteci, 4 rakip lider, teknoloji ağacı, kayıt |
| 200 | **Adada Hayatta Kal** | `ada-hayatta-kal` | Tek kişilik | 1 | 3D | Aksiyon | — | S | Issız adada topla, üret, hayatta kal. | Üretim ağacı, gece-gündüz, açlık/su, inşa |
