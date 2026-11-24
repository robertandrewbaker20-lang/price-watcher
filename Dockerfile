# Price Watcher — Playwright + Next.js for Render / Docker hosts
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Use image Chromium (no Google Chrome channel in container)
ENV PW_CHANNEL=chromium
ENV DATA_DIR=/tmp/price-watcher-data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# better-sqlite3 compiles native bindings — needs toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build \
  && mkdir -p /tmp/price-watcher-data \
  && chown -R pwuser:pwuser /app /tmp/price-watcher-data

USER pwuser
EXPOSE 3000

# npm run start puts node_modules/.bin on PATH; bare `next` is not found in sh -c
CMD ["npm", "run", "start"]