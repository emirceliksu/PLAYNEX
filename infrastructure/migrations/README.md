# Migrations

PostgreSQL migration'ları bu dizinde, `sqlx` formatında tutulur ve `make migrate` ile uygulanır.

- Dosya adı: `<YYYYMMDDHHMMSS>_<kisa_aciklama>.sql` (ör. `20261101120000_create_users.sql`).
- Yeni migration oluşturmak: `docker compose exec api sqlx migrate add -r <kisa_aciklama> --source infrastructure/migrations`
  (`-r` geri alma dosyasını da üretir).
- Uygulanmış bir migration dosyası değiştirilmez; düzeltme yeni bir migration ile yapılır.

İlk şema, ilk sprintin 6. adımında (`PLAN.md` 18. bölüm) eklenecek.
