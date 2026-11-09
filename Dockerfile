# Build the browser app.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ .
RUN npm run build

# Runtime: the Fastify server, which also serves the built browser app.
FROM node:22-alpine
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY app/server.js ./
COPY app/otel.js ./otel.js
COPY app/lib ./lib
COPY app/routes ./routes
COPY app/data ./data
COPY --from=web /web/dist ./public
ARG APP_VERSION=dev
ENV PORT=8080 APP_VERSION=$APP_VERSION NODE_ENV=production
# The node image's "node" user, by number so runAsNonRoot can check it.
USER 1000
EXPOSE 8080
CMD ["node", "server.js"]
