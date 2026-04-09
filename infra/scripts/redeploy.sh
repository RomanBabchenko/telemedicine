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
DOMAIN="${DOMAIN:-testing-core.link}"

cd "$APP_DIR"

git pull --ff-only

npm ci

# packages first
npm run build -w @telemed/shared-types -w @telemed/api-client -w @telemed/ui -w @telemed/utils

# frontends + api
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
