#!/usr/bin/env bash
# Build and (re)start Cliper Agent. Safe to run repeatedly — use it for every update.
#   bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f deploy/.env ]; then
  echo "deploy/.env not found. Copy deploy/.env.example to deploy/.env and fill it in first." >&2
  exit 1
fi
if grep -q "CHANGE_ME" deploy/.env; then
  echo "deploy/.env still contains CHANGE_ME values. Set POSTGRES_PASSWORD and JWT_SECRET." >&2
  exit 1
fi

# Read a setting from deploy/.env (last one wins, quotes and comments stripped)
setting() { grep -E "^$1=" deploy/.env | tail -n1 | cut -d= -f2- | sed -e 's/[[:space:]]*#.*$//' -e 's/^["'\'']//' -e 's/["'\'']$//' || true; }

FILES="-f deploy/docker-compose.prod.yml"
# A graphics card passed through to this VM (docs/PROXMOX.md) renders clips several times faster
case "$(setting GPU)" in
  vaapi)
    if [ -e /dev/dri/renderD128 ]; then
      FILES="$FILES -f deploy/docker-compose.gpu-vaapi.yml"
      # The group that owns the render device differs between systems: hand its number to the container
      RENDER_GID="$(stat -c %g /dev/dri/renderD128)"
      export RENDER_GID
      echo "▶ Graphics card: VAAPI (/dev/dri/renderD128)"
    else
      echo "⚠ GPU=vaapi but /dev/dri/renderD128 does not exist in this VM: rendering on the CPU." >&2
    fi ;;
  nvidia)
    if docker info 2>/dev/null | grep -qi 'runtimes.*nvidia'; then
      FILES="$FILES -f deploy/docker-compose.gpu-nvidia.yml"
      echo "▶ Graphics card: NVIDIA (NVENC)"
    else
      echo "⚠ GPU=nvidia but Docker has no NVIDIA runtime (install nvidia-container-toolkit): rendering on the CPU." >&2
    fi ;;
esac
PROFILES=""
if [ -n "$(setting TUNNEL_TOKEN)" ]; then
  PROFILES="--profile tunnel"
  echo "▶ Cloudflare Tunnel: on"
fi

COMPOSE="docker compose $FILES --env-file deploy/.env $PROFILES"

if [ -d .git ]; then
  echo "▶ Pulling latest code…"
  git pull --ff-only
fi

echo "▶ Building images…"
$COMPOSE build

echo "▶ Starting services (database migrations run automatically)…"
$COMPOSE up -d --remove-orphans

echo "▶ Waiting for the API to become healthy…"
for i in $(seq 1 30); do
  if $COMPOSE exec -T api wget -qO- http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "✅ Cliper Agent is up."
    $COMPOSE ps
    # Encoder, tools and connected platforms, as the API reported them at start-up
    $COMPOSE logs --no-log-prefix api 2>/dev/null | grep -E '^ +[✔✖⚠·]' | tail -n 12 || true
    exit 0
  fi
  sleep 3
done
echo "❌ API did not become healthy. Recent logs:" >&2
$COMPOSE logs --tail=80 api >&2
exit 1
