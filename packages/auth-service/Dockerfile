FROM oven/bun:1 AS build

WORKDIR /app

# Cache dependency installation
COPY package.json package.json
COPY bun.lock bun.lock
COPY packages/auth-service/package.json packages/auth-service/package.json
RUN bun install

COPY packages/auth-service packages/auth-service

ENV NODE_ENV=production
RUN bun build \
  --compile \
  --minify-whitespace \
  --minify-syntax \
  --target bun \
  --outfile server \
  packages/auth-service/src/index.ts

# --- Production: no runtime needed ---
FROM gcr.io/distroless/base

WORKDIR /app
COPY --from=build /app/server server

ENV NODE_ENV=production
CMD ["./server"]
EXPOSE 3000
