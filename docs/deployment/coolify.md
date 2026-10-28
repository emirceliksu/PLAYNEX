# Coolify ile üretim kurulumu

PLAYNEX üretimde Coolify'ın Docker Compose build pack'iyle `compose.production.yaml` üzerinden çalışır. Alan adı: `playnex.meccode.com`.

## Ağ yapısı

```text
İnternet ──443──▶ Coolify proxy (Traefik, TLS) ──▶ edge:8080 (Caddy)
                                                    ├── /ws ─▶ realtime:8081
                                                    └── /*  ─▶ web:3000 ──▶ api:8080 ──▶ postgres:5432
                                                                              └── egress ─▶ SMTP sunucusu
```

| Servis     | Ağlar                | Dışarıdan erişim                                        |
| ---------- | -------------------- | ------------------------------------------------------- |
| `edge`     | `public`, `internal` | Yalnızca Coolify proxy'si üzerinden, atanan alan adıyla |
| `web`      | `internal`           | Yok; yalnızca `edge` ulaşır                             |
| `realtime` | `internal`           | Yok; `/ws` yolu `edge` üzerinden                        |
| `api`      | `internal`, `egress` | Yok; yalnızca `web` sunucu tarafında çağırır            |
| `postgres` | `internal`           | Yok                                                     |

- `internal` ağı `internal: true` ile tanımlıdır: bu ağdaki container'ların dış dünyaya rotası yoktur ve hiçbir serviste `ports:` yoktur.
- Tarayıcı API ile hiç konuşmaz. Kayıt, giriş ve profil istekleri Next.js server action'ları üzerinden `web` container'ından `api:8080`'e gider; oturum `HttpOnly`, `Secure`, `SameSite=Lax` çerezinde taşınır.
- `api` dışarı yalnızca doğrulama e-postası göndermek için çıkar (`egress` ağı).
- Ziyaretçi IP'si `edge` tarafından `X-Real-IP` başlığına yazılır, `web` bunu `api`'ye iletir; API'deki deneme sınırları bu adresle sayılır.

## Coolify'da kaynak oluşturma

1. **New Resource → Public/Private Repository** ile `emirceliksu/PLAYNEX` deposunu seç, dal `main`.
2. **Build Pack:** Docker Compose. **Docker Compose Location:** `/compose.production.yaml`, **Base Directory:** `/`.
3. Servis listesinde yalnızca **edge** için alan adı gir: `https://playnex.meccode.com`. Diğer servislere alan adı verilmez.
4. DNS: `playnex.meccode.com` için Coolify sunucusunun IP'sine `A` kaydı. Sertifikayı Coolify proxy'si Let's Encrypt ile alır.
5. Ortam değişkenlerini aşağıdaki tabloya göre doldurup **Deploy**.

İlk açılışta `api` migration'ları kendisi uygular; ayrı bir adım yoktur. Veritabanı boş başlar, örnek veri yüklenmez.

## Ortam değişkenleri

Coolify'ın kendisi üretir (elle girilmez):

| Değişken                       | Kullanan                                 |
| ------------------------------ | ---------------------------------------- |
| `SERVICE_URL_EDGE_8080`        | Coolify proxy yönlendirmesi              |
| `SERVICE_USER_POSTGRES`        | `postgres`, `api`                        |
| `SERVICE_PASSWORD_POSTGRES`    | `postgres`, `api`                        |
| `SERVICE_PASSWORD_64_REALTIME` | `realtime` yeniden bağlanma token imzası |

Elle girilir:

| Değişken        | Örnek                            | Not                                                              |
| --------------- | -------------------------------- | ---------------------------------------------------------------- |
| `SMTP_HOST`     | `smtp.example.com`               | Zorunlu                                                          |
| `SMTP_PORT`     | `587`                            | Varsayılan 587                                                   |
| `SMTP_SECURITY` | `starttls`                       | `starttls`, `tls` (465) veya `none`                              |
| `SMTP_USERNAME` |                                  | Sağlayıcının verdiği kullanıcı                                   |
| `SMTP_PASSWORD` |                                  | Sağlayıcının verdiği şifre / API anahtarı                        |
| `MAIL_FROM`     | `PLAYNEX <no-reply@meccode.com>` | Zorunlu; alan adının SPF/DKIM kaydı gönderici sunucuyu kapsamalı |

Veritabanı adı (`playnex`), log düzeyi (`info`) ve WebSocket için izin verilen origin (`https://playnex.meccode.com`) `compose.production.yaml` içinde sabittir; alan adı değişirse orada güncellenir.

Kaynak listesinde bu tablolarda olmayan bir değişken görünüyorsa (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `REALTIME_TOKEN_SECRET`, `STORAGE_*`, `PUBLIC_ORIGIN` gibi) silinir. Bunlar geliştirme ortamının varsayılanlarıdır; üretim stack'i kullanmaz, `SMTP_*` ve `MAIL_FROM` ise yanlış değerle e-posta gönderimini bozar.

## Deploy sonrası kontrol

```bash
curl -fsS https://playnex.meccode.com/api/health          # {"status":"ok","service":"web"}
curl -s -o /dev/null -w '%{http_code}\n' https://playnex.meccode.com/v1/me   # 404: API dışarıya açık değil
```

Coolify sunucusunda ağ izolasyonunu doğrula:

```bash
docker ps --format '{{.Names}}' | grep -E 'postgres|api|web|realtime'
docker exec <postgres-container> wget -q -T 5 -O- https://example.com || echo "dış ağ kapalı"
docker inspect <postgres-container> --format '{{json .NetworkSettings.Networks}}'
```

Coolify, compose kaynaklarına kendi proxy ağını da bağlayabilir. `docker inspect` çıktısında `postgres`, `web`, `realtime` veya `api` için `internal` (ve `api` için `egress`) dışında bir ağ görünüyorsa, kaynağın **Connect To Predefined Network** ayarının kapalı olduğunu kontrol et ve yeniden deploy et.

## Yedekleme

Kalıcı veri yalnızca `postgres-data` volume'undadır. Coolify'ın **Scheduled Backups** özelliği `postgres` servisi için açılır; geri yükleme tatbikatı PLAN 12'deki takvime göre yapılır.
