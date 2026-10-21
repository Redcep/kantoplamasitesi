# Kan Bağışı Sistemi — Docker imajı
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıkları önce kopyala ki kod değişince cache bozulmasın
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Uygulama dosyaları
COPY . .

# Güvenlik: konteyner root kullanıcısıyla çalışmasın
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "index.js"]
