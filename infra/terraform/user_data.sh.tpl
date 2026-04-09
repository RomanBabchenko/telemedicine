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

# ---------- 9. Install + build monorepo ----------
sudo -u ubuntu -- bash -lc "cd $APP_DIR && npm ci"

# Build packages first (workspace deps)
sudo -u ubuntu -- bash -lc "cd $APP_DIR && npm run build -w @telemed/shared-types -w @telemed/api-client -w @telemed/ui -w @telemed/utils"

# Build frontends and api
sudo -u ubuntu -- bash -lc "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-patient"
sudo -u ubuntu -- bash -lc "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-doctor"
sudo -u ubuntu -- bash -lc "cd $APP_DIR && NODE_OPTIONS=--max-old-space-size=2048 npm run build -w @telemed/web-admin"
sudo -u ubuntu -- bash -lc "cd $APP_DIR && npm run build -w @telemed/api"

# ---------- 10. Deploy static frontends ----------
mkdir -p "/var/www/patient.$DOMAIN" "/var/www/doctor.$DOMAIN" "/var/www/admin.$DOMAIN"
cp -r "$APP_DIR/apps/web-patient/dist/." "/var/www/patient.$DOMAIN/"
cp -r "$APP_DIR/apps/web-doctor/dist/."  "/var/www/doctor.$DOMAIN/"
cp -r "$APP_DIR/apps/web-admin/dist/."   "/var/www/admin.$DOMAIN/"
chown -R www-data:www-data "/var/www/patient.$DOMAIN" "/var/www/doctor.$DOMAIN" "/var/www/admin.$DOMAIN"

# ---------- 11. Migrations + seed ----------
sudo -u ubuntu -- bash -lc "cd $APP_DIR && npm run db:migration:run"
sudo -u ubuntu -- bash -lc "cd $APP_DIR && npm run db:seed"

# ---------- 12. systemd unit for the API ----------
cat > /etc/systemd/system/telemed-api.service <<EOF
[Unit]
Description=Telemed API
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=ubuntu
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
systemctl enable --now telemed-api

# ---------- 13. nginx HTTP-only blocks (TLS is on the ALB) ----------
# X-Forwarded-Proto от ALB = "https". Передаём его дальше в API, чтобы NestJS
# знал о реальной схеме (cookies, CORS, redirect URLs и т.д.).
cat > /etc/nginx/sites-available/testing-core.conf <<NGINX
# Default server: ALB target group health check ходит на /health.
# Без default_server nginx вернёт 404 от первого подходящего блока.
server {
    listen 80 default_server;
    server_name _;
    location = /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }
    location / { return 404; }
}

server {
    listen 80;
    server_name patient.$DOMAIN;
    root /var/www/patient.$DOMAIN;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name doctor.$DOMAIN;
    root /var/www/doctor.$DOMAIN;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}

server {
    listen 80;
    server_name admin.$DOMAIN;
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
NGINX

ln -sf /etc/nginx/sites-available/testing-core.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "✅ telemed bootstrap complete"
