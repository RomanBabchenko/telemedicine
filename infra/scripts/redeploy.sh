#!/usr/bin/env bash
#
# Pull latest code, rebuild and redeploy on the EC2 demo box.
# Run on the instance:
#   bash ~/telemedicine/infra/scripts/redeploy.sh
#
# Or from your laptop:
#   ssh ubuntu@<eip> 'bash -s' < infra/scripts/redeploy.sh
#
set -euxo pipefail

APP_DIR="/home/ubuntu/telemedicine"
# The demo box is provisioned with DOMAIN=demo.testing-core.link, so its
# nginx serves /var/www/patient.demo.testing-core.link/ etc. A previous
# default of "testing-core.link" silently deployed bundles into the wrong
# directory — the symptom was "I redeployed but the page looks unchanged".
DOMAIN="${DOMAIN:-demo.testing-core.link}"

cd "$APP_DIR"

# RecordingMergeProcessor spawns ffmpeg; without it merge jobs throw ENOENT.
# Install via setup-on-instance.sh (idempotent), not here.
command -v ffmpeg >/dev/null 2>&1 || \
  echo "WARNING: ffmpeg not on PATH — recording merge jobs will fail. Run infra/scripts/setup-on-instance.sh."

git pull --ff-only

npm ci

# packages/{shared-types,api-client,ui,utils} are source-only — no build script.
# Vite path aliases pull them straight from src/ into the app bundles.
NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-patient
NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-doctor
NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-admin
npm run build -w @telemed/api

# refresh static
sudo cp -r apps/web-patient/dist/. "/var/www/patient.$DOMAIN/"
sudo cp -r apps/web-doctor/dist/.  "/var/www/doctor.$DOMAIN/"
sudo cp -r apps/web-admin/dist/.   "/var/www/admin.$DOMAIN/"
sudo chown -R www-data:www-data "/var/www/patient.$DOMAIN" "/var/www/doctor.$DOMAIN" "/var/www/admin.$DOMAIN"

# apply pending migrations (no-op if none)
npm run db:migration:run

# restart api
sudo systemctl restart telemed-api
sudo systemctl status telemed-api --no-pager

echo "✅ redeploy complete"
