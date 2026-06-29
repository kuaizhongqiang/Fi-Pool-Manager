FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/server/package.json packages/server/
RUN npm ci
COPY . .
RUN npm run build --workspace=packages/server
RUN npm prune --production

FROM node:22-alpine
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
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
