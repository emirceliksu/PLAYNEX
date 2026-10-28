# ADR 0014 — Siper: sunucu otoriteli 3D takım nişancı oyunu

- Durum: Kabul edildi
- Tarih: 2026-10-29

## Bağlam

Platforma tarayıcıda oynanan bir takım nişancı oyunu ekleniyor: eşit takımlar, beş mod (Takım Ölüm Maçı, Bomba Kur/Çöz, Silah Oyunu, Herkes Tek, Bıçak Raundu), üç harita, ekonomi ve satın alma, Türkçe anonslar, hesapla oynanan çevrim içi maçlar, botlar, ilerleme ve sosyal özellikler. Nişancı oyunlarında istemciye güvenmek hilenin kapısını açar (PLAN 6, oyun güven modeli); aynı zamanda bir veya iki kişinin bakımını yapabileceği kadar sade kalmalı.

## Karar

- **Harita = yükseklik alanı.** Haritalar `games/3d/siper/data/maps/*.json` içinde, sırayla boyanan dikdörtgenlerden oluşan bir hücre ızgarasıdır; her hücre türünün yüksekliği `rules.json`'da. Çarpışma, mermi ışını (DDA), bot yol bulma (A*) ve istemcideki low-poly sahne aynı ızgaradan üretilir. Üst üste katlı alan (köprü altı) yok; basamaklar yarım metrelik hücrelerle yapılır. Model dosyası, doku ve hazır asset yok.
- **Tek kural kaynağı sunucu.** Realtime servisi 30 Hz'de simüle eder (`apps/realtime/src/matches/siper`). İstemci yalnızca girdi (ileri/yan, bakış açısı, zıpla/eğil/yürü/kullan) ve eylem (ateş, şarjör, silah seçimi, satın alma, dürbün, oy) gönderir. Hareket ADR 0010'daki model aynasıyla (`movement.rs` ↔ `sim/movement.ts`) tahmin edilip `ack` sonrası yeniden oynatılır.
- **Gecikme telafili atış.** Sunucu son 30 tick'in hitbox pozlarını tutar; ateş mesajı istemcinin gördüğü tick'i taşır ve en fazla 200 ms geri sarılır. Kafa küre, gövde silindir, dizden aşağısı bacak sayılır; zırh, kask, mesafe düşümü, sekme ve geri tepme deseni `weapons.json`'dan gelir ve hepsi sunucuda uygulanır.
- **Botlar yalnızca sunucuda.** Misafirin "botlarla oyna" seçimi, sadece onun girebildiği özel (`solo`) bir odadır. Böylece tek oyunculu oyun için ikinci bir kural kopyası yazılmadı. Çevrim içi odalarda boş yerler botla dolar; maç ortasında gelen oyuncu bir botun yerini alır, ayrılanın yerine bot geçer.
- **Hesapla çevrim içi.** API, oturumu olan oyuncuya 60 saniyelik HMAC imzalı bir bilet verir (`POST /v1/realtime/ticket`); web sunucusu bunu `/api/realtime/ticket` ile aracılar, HttpOnly çerez tarayıcıya hiç çıkmaz. Realtime `hello` içinde bileti doğrular ve kullanıcı adını takma adın yerine koyar. `solo` olmayan Siper odaları ve hızlı eşleşme bilet ister.
- **Kalıcılık API'de.** Realtime veritabanına bağlanmaz; biten maçın raporunu iç ağdan `POST /internal/v1/matches`'e servis token'ıyla yollar. API maç kimliğiyle tekrarı yok sayar ve tek transaction'da katılımcı satırlarını, toplamları, silah istatistiklerini, günlük görevleri ve başarımları yazar. Bot maçları yarım XP verir, rütbe puanını değiştirmez.
- **Takım eşitliği.** Bot yoksa takımlar eşit olmadan maç başlamaz (`teams_uneven`); bot varsa eksik taraf botla tamamlanır. Seçim yapmayan oyuncu kalabalık olmayan tarafa geçer; partiler hızlı eşleşmede aynı takıma düşer.
- **Anons kuralları sunucuda.** Çoklu öldürme (4 sn penceresi), ölmeden seri, ilk kan, kafadan, bıçak, seri bozma ve son raunt çağrıları `announcer.rs`'te hesaplanır; istemci yalnızca öncelik sırasına koyar ve en fazla ikisini seslendirir.
- **Ses.** Silah, adım, patlama, arayüz sesleri ve müzik Web Audio ile çalışma anında sentezlenir (`packages/game-sdk` ses mikseri + `client/sound.ts`). Türkçe anonslar eSpeak NG ile üretilip ffmpeg ile işlenir (`make voices`). Piper'ın tek Türkçe sesi ticari olmayan lisanslı olduğu için kullanılmadı.
- **Sohbet.** Oda sohbeti realtime üzerinden gider; Türkçe ve İngilizce küfür listesi harf oyunlarını katlayarak `crates/chat-filter`'da maskelenir, hız sınırı 700 ms.

## Sonuçlar

- Masaüstü ve fare gerekir (pointer lock); dokunmatik cihazlarda oyun bunu söyleyen bir ekran gösterir.
- Hareket modelinde yapılan her değişiklik iki dosyada birlikte yapılır; `cargo test -p playnex-realtime siper` hareket, isabet, ekonomi, anons ve oda kurallarını kapsar.
- Nişan açısı istemciden gelir; nişan yardımı tespiti bu kararın kapsamında değildir, şikâyet kuyruğu ve rütbe dışı bot maçları ilk savunmadır.
- Snapshot'lar JSON ve oyuncu başına gönderilir; 10 kişilik odada tick başına birkaç kilobayt. Bant genişliği sorun olursa ikili kodlama ve fark (delta) snapshot sonraki adımdır.
