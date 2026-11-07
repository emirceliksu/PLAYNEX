# ADR 0018 — Atölye: kodsuz oyun belgesi ve tek Rust motoru

- Durum: Kabul edildi
- Tarih: 2026-11-07

## Bağlam

Oyuncuların kendi 2D ve 3D oyunlarını sitede kurup yayınlayabilmesi istendi. Planın kapsam dışı listesinde "üçüncü tarafların denetimsiz oyun yüklemesi" var; bunun nedeni, dışarıdan gelen kodun ve dosyaların platformu, oyuncuları ve tarayıcıyı tehlikeye atmasıdır. Kullanıcı oyunlarında skor ve liderlik tablosu da isteniyor; istemcinin gönderdiği sonuca güvenmiyoruz.

## Karar

- Kullanıcı oyunu bir **belgedir**: sürümlü, şemayla doğrulanan JSON. İçinde çalıştırılabilir kod, URL, dosya, görsel veya ses verisi yoktur. Şekiller hazır primitiflerden, renkler sabit oyun paletinden, sesler `game-audio` sentez tariflerinden seçilir. Bu yüzden "yükleme" yoktur; yayınlanan şey bizim motorumuzun okuduğu veridir. Kapsam dışı maddesiyle çelişmez.
- Oyun mantığı görsel bloklarla yazılır: olaylar, eylemler, koşullar, sınırlı döngüler, değişkenler, listeler ve parametreli fonksiyonlar. Bloklar kapalı bir talimat kümesine derlenir; yorumlayıcı tick başına işlem bütçesiyle çalışır, sonsuz döngü oyunu kilitleyemez. `eval` ve `new Function` hiçbir yerde kullanılmaz.
- Belge doğrulaması, simülasyon ve yorumlayıcı tek Rust crate'indedir (`crates/creator-engine`). Aynı kod tarayıcıda wasm olarak, API'de native olarak çalışır. ADR 0010'daki TS/Rust ayna modeli bir dil yorumlayıcısı için sürdürülemez; skor tekrar oynatması iki tarafın bit düzeyinde aynı sonucu vermesini gerektirir.
- Determinizm kuralları: sabit 60 Hz tick, motorun kendi tohumlu RNG'si, duvar saati yok, trigonometri `libm` ile, sırası belirsiz koleksiyon yok. Fizik kendi yazdığımız eksen hizalı kutu ve küre çarpışmasıdır; dönen rijit cisim yoktur.
- Skor doğrulama: tohumu sunucu verir, istemci girdi kaydını gönderir, API kaydı native motorla yeniden oynatır. Liderlik tablosu yalnızca doğrulanan skorları gösterir.
- Yayın anında herkese açıktır. Başlık, açıklama ve oyun içi metinler sohbet filtresinden geçer; oyuncular şikâyet eder, yönetici yayını gizler ve işlem denetim kaydına yazılır.
- Editörde blok arayüzü için Blockly yalnızca görsel düzenleyici olarak kullanılır; kod üreteçleri kullanılmaz, çalışma alanı bizim blok ağacımıza çevrilir.

## Sonuçlar

- API ve web, motorun derlenmesine bağımlı hâle gelir; wasm çıktısı Docker içinde üretilir (`make wasm`).
- Fizik bilinçli olarak basittir; dönen cisimlere dayanan oyun türleri (bilardo, araç fiziği) ilk sürümde kurulamaz.
- Belge biçimi sürümlüdür; şema değişikliği eski yayınlar için dönüştürücü gerektirir.
- Tekrar oynatma sunucuda CPU harcar; oyun süresi 10 dakika ile sınırlıdır ve istek hızı sınırlanır.
