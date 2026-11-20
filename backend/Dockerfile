# Debian (glibc) rather than Alpine: faster-whisper, used for auto captions, ships glibc-only wheels.

# ── Build ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# The image uses Debian's ffmpeg, so the bundled ffmpeg-static binaries (optional) are skipped
RUN npm ci --omit=optional
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --omit=optional

# ── Runtime ────────────────────────────────────────────
FROM node:22-bookworm-slim
# Auto captions: faster-whisper (CPU). Build with --build-arg WITH_WHISPER=false for a smaller image.
ARG WITH_WHISPER=true
# ffmpeg (with libass for captions) renders the clips; yt-dlp fetches videos from links; Inter is the caption font
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl tini ffmpeg python3 python3-venv fonts-inter fontconfig ca-certificates wget \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/py \
 && /opt/py/bin/pip install --no-cache-dir "yt-dlp[default]" \
 && if [ "$WITH_WHISPER" = "true" ]; then /opt/py/bin/pip install --no-cache-dir faster-whisper; fi
WORKDIR /app
# Whisper models are downloaded once, on first use, into the storage volume (HF_HOME)
ENV NODE_ENV=production FFMPEG_PATH=ffmpeg FFPROBE_PATH=ffprobe YTDLP_PATH=/opt/py/bin/yt-dlp STORAGE_DIR=/app/storage \
    WHISPER_CMD="/opt/py/bin/python /app/scripts/transcribe.py" \
    HF_HOME=/app/storage/.models
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY scripts/transcribe.py ./scripts/transcribe.py
COPY assets ./assets
RUN mkdir -p storage && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
