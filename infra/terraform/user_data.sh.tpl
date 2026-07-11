#!/bin/bash
#
# Telemed demo bootstrap. Runs once on first boot via cloud-init.
# Logs go to /var/log/telemed-bootstrap.log AND /var/log/cloud-init-output.log.
#
# Variables substituted by Terraform templatefile():
#   domain                     — apex domain (testing-core.link)
#   repo_url                   — git URL of the monorepo
#   repo_branch                — branch to deploy
#   le_email                   — Let's Encrypt notification email
#   public_ip                  — Elastic IP attached to this instance (LiveKit node IP)
#   git_ssh_private_key        — optional SSH key for private git clone
#   auth_disable_login_doctor  — bool, sets AUTH_DISABLE_LOGIN_DOCTOR in .env
#   auth_disable_login_patient — bool, sets AUTH_DISABLE_LOGIN_PATIENT in .env
#
set -euxo pipefail
exec > >(tee /var/log/telemed-bootstrap.log) 2>&1

DOMAIN="${domain}"
REPO_URL="${repo_url}"
REPO_BRANCH="${repo_branch}"
LE_EMAIL="${le_email}"
PUBLIC_IP="${public_ip}"
APP_DIR="/home/ubuntu/telemedicine"

export DEBIAN_FRONTEND=noninteractive

# ---------- 1. Base packages ----------
# TLS is terminated by the AWS ALB in front of us using an ACM wildcard cert,
# so no certbot here — nginx only listens on plain HTTP :80 and ALB talks to it.
#
# fonts-dejavu-core ships DejaVuSans.ttf / DejaVuSans-Bold.ttf with full
# Cyrillic coverage — PdfService picks them up automatically and uses them
# instead of the built-in Helvetica (which would render Ukrainian text as
# garbage). Don't drop this package unless you know what's replacing it.
apt-get update
apt-get install -y \
  git curl nginx \
  build-essential ca-certificates gnupg openssl \
  fonts-dejavu-core

# ---------- 2. Node.js 20 (NodeSource) ----------
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ---------- 3. Docker + compose plugin ----------
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu noble stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu

# ---------- 4. Firewall ----------
# Intentionally NOT installing/enabling UFW. Network filtering is handled
# by the AWS Security Group attached to this instance (see infra/terraform/
# security.tf), which is the canonical source of truth for ingress rules.
# UFW on top of that breaks Docker's iptables rules — specifically, traffic
# from the docker bridge to host-bound ports (e.g. LiveKit container POSTing
# webhooks to the Node API on host port 3000) gets silently dropped because
# Docker writes its FORWARD rules in a chain UFW doesn't know about. We hit
# this in production: every webhook timed out with `dial 172.17.0.1:3000:
# i/o timeout`. AWS SG already restricts external ingress to 22/80/443 and
# the LiveKit RTC UDP range (50000-50100), which is what UFW was duplicating.

# ---------- 5. Install ubuntu's git SSH identity (only when key is provided) ----------
# We embed the key here from a Terraform sensitive variable. The key never leaves
# the EC2 box, but be aware: it sits on the root EBS volume, in the cloud-init
# user-data (also accessible via the instance metadata service). Restrict who can
# SSH into the instance accordingly (security group already does this).
%{ if git_ssh_private_key != "" ~}
install -d -m 700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
cat > /home/ubuntu/.ssh/id_ed25519 <<'GIT_KEY_EOF'
${git_ssh_private_key}
GIT_KEY_EOF
chmod 600 /home/ubuntu/.ssh/id_ed25519
chown ubuntu:ubuntu /home/ubuntu/.ssh/id_ed25519

# Trust github.com host keys ahead of time so the clone doesn't hang on
# a Y/N prompt under sudo.
sudo -u ubuntu ssh-keyscan -t rsa,ed25519 github.com >> /home/ubuntu/.ssh/known_hosts
chmod 644 /home/ubuntu/.ssh/known_hosts
chown ubuntu:ubuntu /home/ubuntu/.ssh/known_hosts
%{ endif ~}

# ---------- 6. Clone repo ----------
sudo -u ubuntu git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

# ---------- 6. Root .env (production secrets) ----------
JWT_ACCESS=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH=$(openssl rand -base64 48 | tr -d '\n')
STUB_WEBHOOK=$(openssl rand -hex 32)
# Service credentials — generated per deploy instead of the public dev
# defaults (devkey/telemed) that used to live here. Consumed by the API via
# .env and by docker-compose (postgres/minio) plus the rendered LiveKit
# configs (see infra/scripts/render-livekit-config.sh).
DB_PASS=$(openssl rand -hex 24)
MINIO_KEY=$(openssl rand -hex 12)
MINIO_SECRET=$(openssl rand -hex 24)
LK_KEY=LK$(openssl rand -hex 8)
LK_SECRET=$(openssl rand -hex 24)

cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
API_PORT=3000
# `v1` is appended by NestJS URI versioning — keep this free of version segments.
API_GLOBAL_PREFIX=api
CORS_ORIGINS=https://patient.$DOMAIN,https://doctor.$DOMAIN,https://admin.$DOMAIN

# ---- Database (in docker compose) ----
DB_HOST=localhost
DB_PORT=5432
DB_USER=telemed
DB_PASSWORD=$DB_PASS
DB_NAME=telemed
DB_SYNCHRONIZE=false
DB_LOGGING=false

# ---- Redis (in docker compose) ----
REDIS_HOST=localhost
REDIS_PORT=6379

# ---- JWT (rotated per deploy) ----
JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=$JWT_REFRESH
JWT_REFRESH_TTL=30d

# ---- MinIO ----
# Internal endpoint — the API talks to MinIO over loopback for actual byte
# transfer (fast, no TLS overhead, no ALB hop). MINIO_PUBLIC_URL below is
# the host that the API uses ONLY to sign presigned URLs handed back to
# browsers, so the patient's "Завантажити" button hits an externally
# reachable hostname. Both must use the same access/secret keys.
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=$MINIO_KEY
MINIO_SECRET_KEY=$MINIO_SECRET
MINIO_BUCKET=telemed-files
MINIO_REGION=us-east-1
MINIO_PUBLIC_URL=https://minio.$DOMAIN
# LiveKit Egress runs inside the docker-compose network and cannot reach
# MinIO via 'localhost' (that would resolve to itself). We pass this
# endpoint to egress when starting a recording — it must be the Docker
# DNS name of the MinIO container on the shared 'telemed' network.
MINIO_EGRESS_ENDPOINT=telemed-minio

# ---- LiveKit ----
LIVEKIT_URL=wss://livekit.$DOMAIN
LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_API_SECRET=$LK_SECRET
LIVEKIT_NODE_IP=$PUBLIC_IP

# ---- SMTP (MailHog in compose, not exposed) ----
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Telemed Demo <noreply@$DOMAIN>"

# ---- Tenant ----
PLATFORM_TENANT_ID=11111111-1111-4111-8111-111111111111

# ---- Adapters ----
PAYMENT_PROVIDER=stub
STUB_WEBHOOK_SECRET=$STUB_WEBHOOK
DOCDREAM_STUB_ENABLED=true

# ---- MIS Integration (invite link URLs) ----
PATIENT_APP_URL=https://patient.$DOMAIN
DOCTOR_APP_URL=https://doctor.$DOMAIN

# ---- Auth kill switches ----
# Toggling these via terraform requires user_data_replace_on_change=true
# (currently set in ec2.tf), which rebootstraps the instance. For a hot
# flip without rebuilding the box, edit this .env file in place and
# `sudo systemctl restart telemed-api` — the values below are written
# from terraform.tfvars only on initial bootstrap.
AUTH_DISABLE_LOGIN_DOCTOR=${auth_disable_login_doctor}
AUTH_DISABLE_LOGIN_PATIENT=${auth_disable_login_patient}

# ---- Frontend (used by Vite during build below) ----
VITE_API_URL=https://api.$DOMAIN/api/v1
VITE_LIVEKIT_URL=wss://livekit.$DOMAIN
EOF
chown ubuntu:ubuntu "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ---------- 7. Per-frontend .env.production ----------
# All three apps are auth-gated. No tenant override is required — the
# JWT carries the membership tenant on every request.
cat > "$APP_DIR/apps/web-patient/.env.production" <<EOF
VITE_API_URL=https://api.$DOMAIN/api/v1
VITE_LIVEKIT_URL=wss://livekit.$DOMAIN
EOF

cat > "$APP_DIR/apps/web-doctor/.env.production" <<EOF
VITE_API_URL=https://api.$DOMAIN/api/v1
VITE_LIVEKIT_URL=wss://livekit.$DOMAIN
EOF

cat > "$APP_DIR/apps/web-admin/.env.production" <<EOF
VITE_API_URL=https://api.$DOMAIN/api/v1
VITE_LIVEKIT_URL=wss://livekit.$DOMAIN
EOF

chown -R ubuntu:ubuntu "$APP_DIR/apps"

# ---------- 8. Render LiveKit configs + bring up infra in docker compose ----------
# The tracked livekit/egress YAMLs carry dev placeholders; render the real
# credentials from .env into gitignored *.gen.yaml BEFORE the containers
# mount them, otherwise LiveKit would sign with devkey while the API expects
# the generated pair.
chmod +x "$APP_DIR/infra/scripts/render-livekit-config.sh"
APP_DIR="$APP_DIR" bash "$APP_DIR/infra/scripts/render-livekit-config.sh"
chown ubuntu:ubuntu "$APP_DIR"/infra/livekit/*.gen.yaml

# livekit-egress is required for audio recording of every consultation —
# without it, LiveKit rooms work but no MP3 ever lands in MinIO.
sudo -u ubuntu -- bash -lc "cd $APP_DIR && docker compose --env-file .env up -d postgres redis minio mailhog livekit livekit-egress"

# Wait for postgres
echo "Waiting for postgres..."
for i in $(seq 1 30); do
  if sudo -u ubuntu -- bash -lc "cd $APP_DIR && docker compose exec -T postgres pg_isready -U telemed" >/dev/null 2>&1; then
    echo "postgres ready"
    break
  fi
  sleep 2
done

# ---------- 9. Build, deploy, migrate, systemd, nginx ----------
# Everything below is delegated to infra/scripts/setup-on-instance.sh so the
# same logic is reusable when re-running by hand on the box (after a
# `git pull`, after a debug session, etc.). Keep this thin so user_data
# stays a deterministic one-shot bootstrap.
chmod +x "$APP_DIR/infra/scripts/setup-on-instance.sh"
DOMAIN="$DOMAIN" APP_DIR="$APP_DIR" APP_USER=ubuntu SKIP_PULL=1 \
  bash "$APP_DIR/infra/scripts/setup-on-instance.sh"

echo "✅ telemed bootstrap complete"
