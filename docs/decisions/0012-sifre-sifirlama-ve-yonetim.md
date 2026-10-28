# ADR 0012 — Şifre sıfırlama, yönetim paneli ve marka işareti

- Durum: Kabul edildi
- Tarih: 2026-10-28

## Bağlam

Hesaplar açıldıktan sonra (ADR 0011) iki eksik kaldı: şifresini unutan oyuncunun hesabına geri dönebilmesi ve hesapların bir yönetici tarafından izlenip gerektiğinde durdurulabilmesi. Aynı dönemde e-postaların ve tarayıcı sekmesinin marka işaretine ihtiyacı vardı; o güne kadar logo yalnızca arayüzdeki bir CSS kutusuydu.

## Karar

- **Tek kod tablosu.** `email_verifications` tablosu `email_codes` olarak yeniden adlandırıldı ve `purpose` (`verify`, `password_reset`) aldı; kullanıcı başına amaç başına bir bekleyen kod. Kod üretimi, yeniden gönderme bekleme süresi (60 sn), saatlik gönderim sınırı (5) ve deneme sınırı (5) iki amaç için aynı. Özet, kullanıcı kimliği ve amaçla tuzlanır.
- **Şifre sıfırlama.** `POST /v1/auth/password/forgot` her adres için aynı cevabı verir; hesap varsa ve askıda değilse kod gider. `POST /v1/auth/password/reset` kodu tüketir, yeni şifreyi yazar, hesabın bütün oturumlarını kapatır. Kod e-posta sahipliğini kanıtladığı için doğrulanmamış bir kayıt bu yolla doğrulanmış olur. Web tarafında adres, kayıttaki gibi kısa ömürlü bir HttpOnly çerezde taşınır (`playnex_reset_email`).
- **Roller.** `users.role` (`player`, `admin`). İlk yönetici kod içinde ya da veritabanında elle atanmaz: `ADMIN_EMAILS` ortam değişkenindeki adresler, e-postaları doğrulandığında (ve API açılışında, hesap zaten doğrulanmışsa) yönetici olur. Diğer yöneticileri panelden mevcut bir yönetici atar.
- **Askıya alma.** `users.suspended_at`. Askıdaki hesap giriş yapamaz (şifre doğru girildikten sonra `account_suspended`), bütün oturumları kapanır, herkese açık profili gizlenir ve şifre sıfırlama kodu almaz.
- **Yönetim API'si.** `/v1/admin/overview`, `/v1/admin/users` (arama, durum süzgeci, sayfalama), `/v1/admin/users/{username}/{action}` (`suspend`, `unsuspend`, `grant-admin`, `revoke-admin`, `end-sessions`). Yönetici olmayan oturum bu uçlarda bilinmeyen rota ile aynı 404'ü alır. Yönetici kendi hesabında işlem yapamaz; böylece işlemi yapan yönetici her zaman yönetici kalır. Her değişiklik `admin_actions` tablosuna işleyen ve hedef kullanıcı adlarıyla yazılır.
- **Yönetim paneli.** PLAN'daki ayrı `(admin)` route grubu yerine `(platform)/admin` altında; böylece yönetici aynı kenar çubuğunu ve oturumu kullanır, menüde yalnızca yöneticiye görünen bir "Yönetim" bağlantısı çıkar. Sayfalar sunucu tarafında rolü kontrol eder; asıl yetki kontrolü API'dedir. İlk sürümde panel yönetici olmayana 404 dönüyordu; bilerek gönderilen bağlantıda bu bozuk sayfa gibi okunduğu için 2026-10-28'de 403 ve açıklayıcı bir "yetkin yok" ekranına geçildi (`admin/layout.tsx`, `forbidden()`). Panelin varlığı zaten açık kaynakta görünür olduğundan gizlemenin bir getirisi yoktu. API uçları 404 vermeye devam eder.
- **Marka işareti.** Oynat üçgeninden kurulmuş bir "P", mor sticker karo üzerinde, sağ üstte iki sarı skor pikseli. Geometri `packages/design-tokens/src/brand.ts` içinde; arayüz bileşeni (`LogoMark`) tema tokenlarıyla boyar, `make brand` favicon (`icon.svg`), iOS ikonu (`apple-icon.png`) ve e-posta logosunu (`apps/mailer/assets/mark.png`) koyu tema değerleriyle üretir. Üretilen dosyalar repoda tutulur, üretim imajları rasterlayıcı taşımaz.
- **E-posta tasarımı.** Doğrulama ve sıfırlama e-postaları tek şablonu paylaşır (`apps/mailer/src/template.rs`): koyu zemin, işaret ve yazı logosu, amaç etiketi, sticker gölgeli kod kutusu, düz metin alternatifi. İşaret uzak görsel yerine mesaja gömülü (`cid:`) gider; uzak görselleri engelleyen istemcilerde de görünür ve sitenin adresine bağlı değildir.

## Sonuçlar

- PLAN 9'daki "yönetici için MFA zorunlu" maddesi henüz karşılanmadı; yönetici hesapları şimdilik yalnızca şifreyle korunuyor. Passkey veya TOTP eklendiğinde yöneticiler için zorunlu tutulacak.
- Panel şimdilik yalnızca hesap yönetimini kapsıyor; oyun sürümü, rapor ve analitik ekranları ayrı işler.
- Deneme sınırları API belleğinde olduğundan e2e testleri aynı IP'den art arda çok kayıt açınca sınıra takılabilir; test ortamında API'yi yeniden başlatmak sayaçları sıfırlar.
