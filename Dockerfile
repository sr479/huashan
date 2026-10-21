FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/sr479/huashan" \
      org.opencontainers.image.revision="${VCS_REF}"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit && mkdir -p /app/data/uploads && chown -R node:node /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts/backup.mjs ./scripts/backup.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
