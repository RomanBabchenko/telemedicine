#!/bin/bash
#
# Telemed demo bootstrap. Runs once on first boot via cloud-init.
# Logs go to /var/log/telemed-bootstrap.log AND /var/log/cloud-init-output.log.
#
# Variables substituted by Terraform templatefile():
#   domain      — apex domain (testing-core.link)
#   repo_url    — git URL of the monorepo
#   repo_branch — branch to deploy
#   le_email    — Let's Encrypt notification email
#   public_ip   — Elastic IP attached to this instance (for LiveKit node IP)
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
apt-get update
apt-get install -y \
  git curl ufw nginx \
  build-essential ca-certificates gnupg openssl

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

# ---------- 4. UFW ----------
# Defence in depth on top of the SG. ALB talks to us on :80, no 443 here.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 50000:50100/udp
ufw --force enable

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

cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
API_PORT=3000
API_GLOBAL_PREFIX=api/v1
CORS_ORIGINS=https://patient.$DOMAIN,https://doctor.$DOMAIN,https://admin.$DOMAIN

# ---- Database (in docker compose) ----
DB_HOST=localhost
DB_PORT=5432
DB_USER=telemed
DB_PASSWORD=telemed
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
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=telemed
MINIO_SECRET_KEY=telemed-secret
MINIO_BUCKET=telemed-files
MINIO_REGION=us-east-1

# ---- LiveKit ----
LIVEKIT_URL=wss://livekit.$DOMAIN
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecretdevsecretdevsecretdevsecret
LIVEKIT_NODE_IP=$PUBLIC_IP

# ---- SMTP (MailHog in compose, not exposed) ----
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Telemed Demo <noreply@$DOMAIN>"

# ---- Tenant ----
PLATFORM_TENANT_ID=00000000-0000-0000-0000-000000000001

# ---- Adapters ----
PAYMENT_PROVIDER=stub
DOCDREAM_STUB_ENABLED=true

# ---- Frontend (used by Vite during build below) ----
VITE_API_URL=https://api.$DOMAIN/api/v1
VITE_LIVEKIT_URL=wss://livekit.$DOMAIN
EOF
chown ubuntu:ubuntu "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ---------- 7. Per-frontend .env.production ----------
# Patient — single-clinic override stays so anonymous browsers see clinic doctors
cat > "$APP_DIR/apps/web-patient/.env.production" <<EOF
VITE_API_URL=https://api.$DOMAIN/api/v1
VITE_LIVEKIT_URL=wss://livekit.$DOMAIN
VITE_TENANT_ID=00000000-0000-0000-0000-000000000002
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

# ---------- 8. Bring up infra in docker compose ----------
sudo -u ubuntu -- bash -lc "cd $APP_DIR && docker compose --env-file .env up -d postgres redis minio mailhog livekit"

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
