# ADR 0013 — Her girişte e-posta kodu

- Durum: Kabul edildi
- Tarih: 2026-10-28

## Bağlam

ADR 0012'den sonra hesaplar yalnızca şifreyle korunuyordu. PLAN 9'daki yönetici MFA maddesi açıktı ve sızmış ya da tekrar kullanılan bir şifre tek başına oturum açmaya yetiyordu. Passkey ve TOTP daha büyük işler; e-posta kod altyapısı (ADR 0012) ise hazırdı.

## Karar

- **Şifre oturum açmaz.** `POST /v1/auth/login` şifre doğru, e-posta doğrulanmış ve hesap askıda değilse `202` döner: e-postaya bir giriş kodu gider, cevapta bir `challenge` (32 bayt, rastgele) ve adres bulunur. Oturum yalnızca `POST /v1/auth/login/code` ile `challenge` ve kod birlikte gönderildiğinde açılır.
- **Kod, challenge'a bağlı.** `email_codes` tablosuna `login` amacı ve `challenge_hash` sütunu eklendi. Kod tek başına kabul edilmez. Challenge yalnızca şifre adımı geçildikten sonra verilir; şifreyi bilmeyen biri altı haneyi tahmin etse bile kullanamaz. Yeni bir şifre girişi challenge'ı yeniler, yalnızca en son şifre adımını geçen tarayıcı girişi tamamlayabilir.
- **Mevcut sınırlar.** Kod 15 dakika geçerli, 5 deneme, yeniden gönderme 60 saniyede bir, saatte en fazla 5 e-posta. Bekleme süresi içinde tekrar şifre girilirse yeni e-posta gitmez, gönderilmiş kod geçerli kalır. `POST /v1/auth/login/resend` yalnızca geçerli bir challenge ile çalışır.
- **Kapsam.** Bütün hesaplar, her girişte. Cihaz hatırlama yok; oturum çerezi süresince (30 gün ya da çıkışa kadar) tekrar sorulmaz. Kayıt doğrulaması ve şifre sıfırlaması zaten e-posta kodu istediği için onların sonunda ayrıca giriş kodu sorulmaz.
- **Web.** Challenge, şifre ekranı ile `/login/code` arasında kodla aynı ömürde bir HttpOnly çerezde (`playnex_login_challenge`) taşınır; oturum açılınca silinir. Süresi dolmuş denemede ekran ziyaretçiyi şifre adımına geri gönderir.

## Sonuçlar

- PLAN 9'daki yönetici MFA maddesi e-posta kodu ile karşılandı. Passkey veya TOTP geldiğinde yöneticiler için onlar tercih edilecek.
- Her giriş bir e-posta demek; posta servisinin gönderim kotası buna göre izlenmeli. Posta servisi çalışmazsa kimse giriş yapamaz.
- E-posta kutusu ele geçirilmiş bir hesapta ikinci adım koruma sağlamaz; şifre sıfırlama zaten aynı kutuya bağlı.
