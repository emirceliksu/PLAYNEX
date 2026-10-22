# ADR 0007 — Yerel S3 depolama için MinIO yerine RustFS

- Durum: Kabul edildi
- Tarih: 2026-10-20

## Bağlam

`PLAN.md` 12, geliştirme ortamında S3 uyumlu depolama olarak `minio` servisini listeler. Kurulum sırasında MinIO'nun Docker Hub imajına erişim reddedildi (`denied`), quay.io'da son sürüm etiketi bulunamadı ve GitHub'daki son topluluk sürümü Ekim 2025 tarihli; MinIO topluluk imajı dağıtımını durdurmuş görünüyor.

## Karar

- Compose'ta servis adı `storage`, imaj `rustfs/rustfs:1.0.3` (Apache-2.0, MinIO ile aynı S3 API'si ve `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY` sözleşmesi; 9000 API, 9001 konsol). Healthcheck `GET /health`.
- Uygulama tarafı yalnızca `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` değişkenlerini kullanır; üretimde herhangi bir S3 uyumlu sağlayıcı takılabilir.
- Değerlendirilen alternatifler: Versity Gateway (olgun, sade), Garage (yapılandırma dosyası ve CLI ile bucket kurulumu gerektiriyor). RustFS, MinIO uyumlu konsolu ve sıfır yapılandırma başlangıcı nedeniyle seçildi.

## Sonuçlar

- `PLAN.md` 12. bölüm `minio` yerine `storage` (RustFS) olarak güncellendi.
- Bucket oluşturma adımı ilk upload özelliğiyle birlikte eklenecek.
