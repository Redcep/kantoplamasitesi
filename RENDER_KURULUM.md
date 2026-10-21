# Render'a Kurulum (Kan Bağışı Sistemi)

Depo `Redcep/kantoplamasitesi` → Render Web Service olarak bağlanır.

## 1) Render tarafı

1. [render.com](https://render.com) → **New +** → **Web Service**
2. GitHub deposunu bağlayın (gerekirse Render'a GitHub erişimi verin).
3. Ayarlar (render.yaml varken otomatik dolması gerekir, yine de kontrol edin):
   - **Name**: kizilay-kan-bagisi (veya istediğiniz)
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: Free
4. **Create Web Service** deyin. `render.yaml` dosyası olduğu için build ayarları otomatik gelir.

## 2) Ortam değişkenleri (Environment)

Render panelinde servisin **Environment** sekmesine şu anahtarları ekleyin
(değerler `.env` dosyanızdakiyle aynı; `.env` repoya dahil edilmez, güvenlik için):

| Anahtar | Zorunlu | Açıklama |
|---|---|---|
| `DISCORD_TOKEN` | Evet | Discord bot token |
| `CHANNEL_ID` | Evet | Şifreli veritabanı kanalı ID |
| `API_KEY` | Evet | Şifreleme anahtarı |
| `ENCRYPTION_KEY` | Hayır | Boş bırakılırsa API_KEY kullanılır |
| `SITE_SESSION_SECRET` | Evet | Oturum anahtarı (render.yaml otomatik üretir) |
| `KAYIT_PASSWORD` | Evet* | Kayıt ekibi şifresi |
| `KONTROL_PASSWORD` | Evet* | Kontrol ekibi şifresi |
| `YONETIM_PASSWORD` | Evet* | Yönetim şifresi |
| `VISITOR_DELETE_PASSWORD` | Hayır | Kayıt/Kontrol ekibinin kayıt silerken gireceği şifre. Yönetim muaf. Boşsa `SITE_PASSWORD`. |

\* Boş bırakılırsa `SITE_PASSWORD` kullanılır. Biri tanımlı değilse varsayılan `demo123` olur — mutlaka tanımlayın.

## 3) Çalışma notları

- **Veriler Discord'da saklanır**, Render'ın diskine gerek yok; servis yeniden başlasa da kayıtlar korunur.
- Servis ilk açılışta Discord kanalını yükleyene kadar (`ready` logu) 1-2 dakika sürebilir.
- Ücretsiz plan uykuya yatar; ilk istekte ~30 sn açılış (cold start) olur.
- Sunucu, `RENDER` ortam değişkeni otomatik olduğu için proxy arkasında `trust proxy=1` ile çalışır.
- `PORT` Render tarafından verilir; `.env` içindeki PORT yalnızca yerel çalıştırma içindir.

## 4) Yerel çalıştırma (eskisi gibi)

```bash
npm install
cp .env.example .env   # değerleri doldurun
npm start
# http://localhost:3000/login.html
```

## 5) Docker ile yerel çalıştırma

```bash
cp .env.example .env   # değerleri doldurun
docker compose up --build
# http://localhost:3000/login.html
```

Docker imajı `node:20-alpine` temelli, root olmayan `app` kullanıcısıyla çalışır ve
`/` üzerinden health-check yapar. Render tarafında imajı kendisi build eder.
