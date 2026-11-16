# ── Build ──────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
# The image uses Alpine's ffmpeg, so the bundled ffmpeg-static binaries (optional) are skipped
RUN npm ci --omit=optional
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --omit=optional

# ── Runtime ────────────────────────────────────────────
FROM node:22-alpine
# ffmpeg/ffprobe render the clips; yt-dlp (with Python) fetches videos from links
# fontconfig + Inter: the font captions and titles are drawn in
RUN apk add --no-cache openssl tini ffmpeg python3 py3-pip fontconfig font-inter \
 && pip install --no-cache-dir --break-system-packages "yt-dlp[default]" \
 && apk del py3-pip
WORKDIR /app
ENV NODE_ENV=production FFMPEG_PATH=ffmpeg FFPROBE_PATH=ffprobe YTDLP_PATH=yt-dlp STORAGE_DIR=/app/storage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
RUN mkdir -p storage && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
