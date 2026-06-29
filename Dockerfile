FROM node:22-alpine AS builder
RUN apk add --no-cache python3 build-base  # better-sqlite3 编译需要
WORKDIR /app
COPY package*.json ./
COPY packages/server/package.json packages/server/
RUN npm ci
COPY . .
RUN npm run build --workspace=packages/server
RUN npm prune --production

FROM node:22-alpine
RUN apk add --no-cache curl  # 健康检查
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/package.json .
COPY scripts/deploy.sh .
RUN chmod +x deploy.sh
VOLUME ["/data"]
ENV DB_PATH=/data/fi-pool.db
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -sf http://localhost:${PORT}/health || exit 1
CMD ["node", "packages/server/dist/server.js"]
