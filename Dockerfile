# Web-App (SvelteKit/adapter-node) – Build- und Runtime-Image (arm64-tauglich).
# Build auf dem Zielserver (arm64), damit das kompilierte better-sqlite3 passt.

# ---- Builder: Abhängigkeiten + SvelteKit-Build ----
FROM node:24-bookworm-slim AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Gesamte Quelle vor npm ci (das prepare-Script svelte-kit sync braucht svelte.config.js).
COPY . .
RUN npm ci \
 && npm run build \
 && npm prune --omit=dev    # devDeps (svelte/vite) entfernen, better-sqlite3 bleibt kompiliert

# ---- Runtime: schlankes Image mit typst + rclone ----
FROM node:24-bookworm-slim AS runtime
ARG TYPST_VERSION=v0.14.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils rclone \
 && rm -rf /var/lib/apt/lists/*
# Typst (statischer aarch64-musl-Build) für den PDF-Export
RUN curl -fsSL "https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-aarch64-unknown-linux-musl.tar.xz" -o /tmp/typst.tar.xz \
 && tar -xJf /tmp/typst.tar.xz -C /tmp \
 && mv /tmp/typst-aarch64-unknown-linux-musl/typst /usr/local/bin/typst \
 && rm -rf /tmp/typst* \
 && typst --version

# yt-dlp (self-contained aarch64-Binary) für den Instagram-Reel-Import (nur Caption)
RUN curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64" -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app
# Quelle (core, scripts, templates, fonts) + Prod-node_modules + Build-Output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY core ./core
COPY scripts ./scripts
COPY templates ./templates
COPY fonts ./fonts
COPY package.json ./

ENV NODE_ENV=production \
    RECIPE_PROJECT_ROOT=/app \
    PORT=3000
EXPOSE 3000
CMD ["node", "build/index.js"]
