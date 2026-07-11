#!/usr/bin/env bash
#
# Render LiveKit / egress configs with the credentials from the root .env.
#
# The tracked infra/livekit/{livekit.prod.yaml,egress.yaml} act as templates
# carrying the well-known dev placeholders (devkey / telemed). This script
# substitutes the real values from .env into gitignored *.gen.yaml copies and
# points docker-compose at them via LIVEKIT_CONFIG_FILE / EGRESS_CONFIG_FILE.
#
# Idempotent: reads whatever is in .env, never generates secrets itself —
# secret generation happens exactly once, in user_data at first boot.
#
# Usage: APP_DIR=/home/ubuntu/telemedicine bash infra/scripts/render-livekit-config.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
ENV_FILE="$APP_DIR/.env"
LK_DIR="$APP_DIR/infra/livekit"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "render-livekit-config: $ENV_FILE not found, skipping" >&2
  exit 0
fi

get() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-; }

LK_KEY="$(get LIVEKIT_API_KEY)"
LK_SECRET="$(get LIVEKIT_API_SECRET)"
MINIO_KEY="$(get MINIO_ACCESS_KEY)"
MINIO_SECRET="$(get MINIO_SECRET_KEY)"

if [[ -z "$LK_KEY" || -z "$LK_SECRET" || -z "$MINIO_KEY" || -z "$MINIO_SECRET" ]]; then
  echo "render-livekit-config: LIVEKIT_/MINIO_ vars missing in .env" >&2
  exit 1
fi

# livekit.gen.yaml — swap the signing key pair and the webhook api_key the
# server signs its callbacks with (must match the API's LIVEKIT_API_KEY).
sed -e "s|^  devkey: .*|  $LK_KEY: $LK_SECRET|" \
    -e "s|^  api_key: .*|  api_key: $LK_KEY|" \
    "$LK_DIR/livekit.prod.yaml" > "$LK_DIR/livekit.gen.yaml"

# egress.gen.yaml — egress authenticates to LiveKit with the same key pair
# and uploads recordings to MinIO with the root credentials.
sed -e "s|^api_key: .*|api_key: $LK_KEY|" \
    -e "s|^api_secret: .*|api_secret: $LK_SECRET|" \
    -e "s|^  access_key: .*|  access_key: $MINIO_KEY|" \
    -e "s|^  secret: .*|  secret: $MINIO_SECRET|" \
    "$LK_DIR/egress.yaml" > "$LK_DIR/egress.gen.yaml"

# Point docker-compose at the rendered files (idempotent append).
grep -q '^LIVEKIT_CONFIG_FILE=' "$ENV_FILE" || \
  echo "LIVEKIT_CONFIG_FILE=./infra/livekit/livekit.gen.yaml" >> "$ENV_FILE"
grep -q '^EGRESS_CONFIG_FILE=' "$ENV_FILE" || \
  echo "EGRESS_CONFIG_FILE=./infra/livekit/egress.gen.yaml" >> "$ENV_FILE"

echo "render-livekit-config: rendered livekit.gen.yaml + egress.gen.yaml"
