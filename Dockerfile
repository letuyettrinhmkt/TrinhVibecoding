FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    SITE_ROOT=/srv

WORKDIR /srv

# Cài thư viện trước (tận dụng cache khi chỉ sửa code)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force

COPY server/ ./server/
COPY app/ ./app/
COPY design/ ./design/
COPY admin/ ./admin/

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/server.js"]
