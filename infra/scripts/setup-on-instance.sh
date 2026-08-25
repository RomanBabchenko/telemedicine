#!/usr/bin/env bash
#
# Idempotent post-bootstrap setup. Runs on the EC2 demo box (or any
# Linux host where docker compose, node 20, nginx are already installed
# and the repo is checked out at $APP_DIR).
#
# What it does:
#   1. (optional) git pull
#   2. npm ci + build of the 3 frontends + api
#   3. deploy static frontends to /var/www
#   4. migrate + seed the DB
#   5. write/refresh the telemed-api systemd unit
#   6. write/refresh nginx server blocks and reload
#
# Safe to re-run.
#
# Usage:
#   sudo DOMAIN=demo.testing-core.link bash infra/scripts/setup-on-instance.sh
#
# Optional env:
#   DOMAIN     — apex domain for subdomains (required)
#   APP_DIR    — repo path (default: /home/ubuntu/telemedicine)
#   APP_USER   — local user that owns the repo (default: ubuntu)
#   SKIP_SEED  — set to 1 to skip db:seed (e.g. on a re-run)
#   SKIP_PULL  — set to 1 to skip git pull
#
set -euo pipefail

: "${DOMAIN:?DOMAIN env var is required (e.g. demo.testing-core.link)}"
APP_DIR="${APP_DIR:-/home/ubuntu/telemedicine}"
APP_USER="${APP_USER:-ubuntu}"
SKIP_SEED="${SKIP_SEED:-0}"
SKIP_PULL="${SKIP_PULL:-0}"

if [[ $EUID -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo DOMAIN="$DOMAIN" APP_DIR="$APP_DIR" APP_USER="$APP_USER" \
    SKIP_SEED="$SKIP_SEED" SKIP_PULL="$SKIP_PULL" bash "$0" "$@"
fi

cd "$APP_DIR"

# ---------- 1. Pull latest ----------
if [[ "$SKIP_PULL" != "1" ]]; then
  echo "==> git pull"
  # Older deploys overwrote the tracked livekit.yaml with the prod variant;
  # restore it so --ff-only doesn't refuse to pull over a dirty tree.
  sudo -u "$APP_USER" git checkout -- infra/livekit/livekit.yaml 2>/dev/null || true
  sudo -u "$APP_USER" git pull --ff-only
fi

# ---------- 1a. LiveKit config for prod ----------
# Render infra/livekit/*.gen.yaml from the tracked templates using the
# credentials in .env (idempotent — never regenerates secrets), and point
# docker-compose at them via LIVEKIT_CONFIG_FILE / EGRESS_CONFIG_FILE.
# This replaces the old `cp livekit.prod.yaml livekit.yaml` which dirtied a
# tracked file and kept the public devkey pair in production.
if [[ -f "$APP_DIR/infra/scripts/render-livekit-config.sh" ]]; then
  echo "==> render LiveKit configs from .env"
  APP_DIR="$APP_DIR" bash "$APP_DIR/infra/scripts/render-livekit-config.sh"
  chown "$APP_USER:$APP_USER" "$APP_DIR"/infra/livekit/*.gen.yaml
  # Recreate so the containers pick up config changes; egress may also be
  # missing on instances provisioned before it was added to the stack.
  sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && docker compose --env-file .env up -d --force-recreate livekit livekit-egress"
fi

# ---------- 1b. ffmpeg (for RecordingMergeProcessor) ----------
# The API mixes per-track OGG egresses into a single MP3 by spawning ffmpeg
# (apps/api/src/modules/recording/application/recording-merge.processor.ts).
# Without it, every recording-merge job fails with ENOENT.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "==> install ffmpeg"
  apt-get update -y
  apt-get install -y --no-install-recommends ffmpeg
fi
ffmpeg -version | head -n 1

# ---------- 2. Install + build ----------
echo "==> npm ci"
sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && npm ci"

# packages/{shared-types,api-client,ui,utils} are source-only — Vite path aliases
# pull them from src/ directly. Only the leaf workspaces need building.
echo "==> build frontends + api"
sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-patient"
sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-doctor"
sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-admin"
sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && npm run build -w @telemed/api"

# ---------- 3. Deploy static frontends ----------
echo "==> deploy static to /var/www"
mkdir -p \
  "/var/www/patient.$DOMAIN" \
  "/var/www/doctor.$DOMAIN" \
  "/var/www/admin.$DOMAIN"

cp -r "$APP_DIR/apps/web-patient/dist/." "/var/www/patient.$DOMAIN/"
cp -r "$APP_DIR/apps/web-doctor/dist/."  "/var/www/doctor.$DOMAIN/"
cp -r "$APP_DIR/apps/web-admin/dist/."   "/var/www/admin.$DOMAIN/"

chown -R www-data:www-data \
  "/var/www/patient.$DOMAIN" \
  "/var/www/doctor.$DOMAIN" \
  "/var/www/admin.$DOMAIN"

# ---------- 4. Migrations + seed ----------
echo "==> migrations"
sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && npm run db:migration:run"

if [[ "$SKIP_SEED" != "1" ]]; then
  echo "==> seed (skip with SKIP_SEED=1)"
  sudo -u "$APP_USER" -- bash -lc "cd $APP_DIR && npm run db:seed"
fi

# ---------- 5. systemd unit for the API ----------
echo "==> systemd unit"
cat > /etc/systemd/system/telemed-api.service <<EOF
[Unit]
Description=Telemed API
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/apps/api
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable telemed-api
systemctl restart telemed-api
sleep 2
systemctl status telemed-api --no-pager || true

# ---------- 6. nginx ----------
echo "==> nginx server blocks"
cat > /etc/nginx/sites-available/testing-core.conf <<NGINX
# Default server: ALB target health check ходит на /health.
server {
    listen 80 default_server;
    server_name _;
    location = /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }
    location / { return 404; }
}

# The *.app wildcards serve per-clinic subdomains (harmony.patient.$DOMAIN):
# same SPA bundle, the app resolves the tenant from the hostname at runtime.
server {
    listen 80;
    server_name patient.$DOMAIN *.patient.$DOMAIN;
    root /var/www/patient.$DOMAIN;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name doctor.$DOMAIN *.doctor.$DOMAIN;
    root /var/www/doctor.$DOMAIN;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name admin.$DOMAIN *.admin.$DOMAIN;
    root /var/www/admin.$DOMAIN;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name api.$DOMAIN;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}

server {
    listen 80;
    server_name livekit.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 7d;
        proxy_send_timeout 7d;
    }
}

# MinIO S3 API. Proxies straight to the in-host MinIO container. Critical:
#   - 'proxy_set_header Host \$host' MUST stay — MinIO validates AWS Sigv4
#     signatures using the Host header, so rewriting it breaks every
#     presigned URL with SignatureDoesNotMatch.
#   - large body size for object uploads via presigned PUTs.
#   - 'proxy_request_buffering off' so streaming uploads don't get buffered
#     to disk on nginx before being forwarded.
#   - long timeouts for big downloads / slow links.
server {
    listen 80;
    server_name minio.$DOMAIN;
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/testing-core.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo
echo "✅ setup complete"
echo "   API:     systemctl status telemed-api"
echo "   Logs:    journalctl -u telemed-api -f"
echo "   nginx:   systemctl status nginx"
