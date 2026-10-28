# Siper anonsları

Oyundaki Türkçe anonslar (`İlk kan!`, `Durdurulamaz!` …) bu klasördeki `lines.json` dosyasından üretilir ve `apps/web/public/games/siper/voice/` altına Ogg olarak yazılır. Oyun dosyaları anahtar adıyla yükler (`firstBlood.ogg`); dosya yoksa kısa bir sentez vurgusu çalar.

```bash
make voices
```

- Ses: eSpeak NG Türkçe sesi. Üretilen ses dosyaları serbestçe kullanılabilir; programın kendisi depoya girmez, yalnızca `voice` aracı imajında çalışır.
- ffmpeg zinciri sesi bir tona indirir, sıkıştırır ve salon yankısı ekler.
- Hugging Face'teki Piper Türkçe sesi (dfki) ticari olmayan CC BY-NC-SA lisanslı olduğu için kullanılmadı.
- Bir anonsu stüdyo kaydıyla değiştirmek için aynı adla (`<anahtar>.ogg`) dosyayı üzerine yazmak yeterli.
