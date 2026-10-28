# ADR 0011 — E-posta doğrulamalı hesaplar ve izole üretim ağı

- Durum: Kabul edildi
- Tarih: 2026-10-28

## Bağlam

Platform `playnex.meccode.com` üzerinde Coolify ile yayına alınıyor. Yayından önce oyuncuların hesap açabilmesi gerekiyor: ad, soyad, kullanıcı adı, e-posta ve şifreyle kayıt, e-postaya giden kodla doğrulama. PLAN 9 OAuth ve Passkey öngörüyordu; ilk sürüm için kullanıcı adı ve şifre tercih edildi, diğer yöntemler sonra eklenecek. Web ekranlarındaki örnek oyuncu, sıralama, bildirim ve oynanma sayıları yayında gerçek veri sanılacağı için kaldırıldı.

Üretimde dışarıya yalnızca arayüz açılmalı; API, realtime ve veritabanı yalnızca iç ağdan erişilebilir olmalı.

## Karar

- **Hesap modeli.** `users`, `email_verifications`, `sessions_auth` tabloları (`infrastructure/migrations`). Kullanıcı adı küçük harfe çevrilir, `^[a-z0-9][a-z0-9_.]{2,19}$`; e-posta `lower(email)` üzerinde tekil. Şifre Argon2id ile, 10–128 karakter.
- **Doğrulama kodu.** 6 hane, 15 dakika geçerli, SHA-256 (kullanıcı kimliğiyle tuzlanmış) olarak saklanır. Kod başına en çok 5 deneme; yeniden gönderme 60 saniyede bir ve saatte en çok 5 kez. Yeniden gönderme ucu her durumda aynı cevabı verir, böylece hangi adresin bekleyen kaydı olduğu sorgulanamaz. 24 saat doğrulanmayan kayıt, aynı kullanıcı adı veya e-postayla yeni kayıt geldiğinde silinir.
- **Oturum.** 32 baytlık rastgele token; veritabanında yalnızca SHA-256 özeti tutulur, 30 gün geçerli. Token tarayıcıya hiç verilmez: Next.js server action'ları API'yi çağırır ve token'ı `HttpOnly`, `Secure`, `SameSite=Lax` çerezine yazar. Doğrulanmamış hesap giriş yapamaz; girişte yeni kod gönderilip doğrulama ekranına yönlendirilir.
- **Gizlilik.** Başka oyunculara kullanıcı adı, ad ve soyadın baş harfi gösterilir (`GET /v1/players/{username}`); e-posta ve tam ad yalnızca hesap sahibine.
- **Kötüye kullanım.** IP başına sabit pencereli sınırlar: kayıt 5/10 dk (form doğrulamasını geçen istekler sayılır), giriş 10/5 dk, kod doğrulama 20/10 dk, yeniden gönderme 10/10 dk. Sayaçlar API sürecinin belleğinde tutulur.
- **Üretim ağı.** `compose.production.yaml`: tek giriş `edge` (Caddy). Coolify proxy'si TLS'i sonlandırıp `edge:8080`'e iletir; `edge` `/ws`'yi realtime'a, geri kalanını web'e yollar. web, api, realtime ve postgres `internal: true` ağdadır; hiçbir serviste yayınlanmış port yoktur. Dışarı çıkabilen tek servis `mailer`: e-posta gönderimini üstlenir, `egress` ağına ve yalnızca api ile paylaştığı `mail` (`internal: true`) ağına bağlıdır. API internete çıkamaz; e-posta anahtarı ile veritabanı şifresi aynı container'da bulunmaz. Container'lar salt okunur dosya sistemiyle, `no-new-privileges` ve tüm Linux yetenekleri düşürülmüş çalışır (postgres hariç).
- **Gizli değerler.** Veritabanı kullanıcı/şifresi ve realtime imza anahtarı Coolify'ın `SERVICE_*` değişkenleriyle üretilir. Üretimde doğrulama e-postaları Gmail API ile `playnex@meccode.com` adına gönderilir (servis hesabı, alan genelinde yetki, yalnızca `gmail.send` kapsamı); anahtar dosyası Coolify değişkeninde tutulur. Geliştirmede aynı `mailer` SMTP ile Mailpit kullanır. Ayrıntı: `docs/deployment/coolify.md`.

## Sonuçlar

- API birden fazla instance'a çıkarsa deneme sayaçları Valkey'e taşınmalı.
- Valkey ve nesne depolama henüz kullanılmadığı için üretim stack'inde yok; ilk kullanan özellikle birlikte eklenecek.
- Sıralama, oyun geçmişi ve kişisel rekor alanları gerçek veri gelene kadar boş durum gösterir. Solo skorların sunucuda doğrulanması (PLAN 6) bir sonraki adım.
- Çevrim içi odalar hâlâ misafir takma adıyla çalışır; hesabın realtime kimliğine bağlanması ayrı bir iş.
