#!/usr/bin/env bash
# Chạy TRÊN máy ảo (deploy/gcp.sh setup gọi script này qua SSH).
# Làm được nhiều lần: bước nào đã xong thì bỏ qua.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Swap 2 GB"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf >/dev/null
  sudo sysctl -q --system
fi
free -h | grep -i swap

echo "== Tự cập nhật bảo mật"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
fi
sudo docker compose version

echo "== File .env"
if [ ! -f .env ]; then
  ip="$(curl -s -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)"
  umask 077
  cat > .env <<ENV
# Tạo tự động trên máy ảo $(date -u +%F). KHÔNG commit, KHÔNG chép đi nơi khác.
POSTGRES_DB=dapchuot
POSTGRES_USER=dapchuot
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(openssl rand -hex 16)
TRUST_PROXY=true
# Tạm dùng tên miền sslip.io trỏ sẵn vào IP để có HTTPS ngay.
# Khi catxe.io.vn đã trỏ về IP này: đổi thành SITE_DOMAIN=catxe.io.vn rồi chạy lại setup.
SITE_DOMAIN=${ip//./-}.sslip.io
ENV
  echo "Đã tạo .env mới (mật khẩu ngẫu nhiên)"
fi
chmod 600 .env
ls -l .env
grep '^SITE_DOMAIN=' .env

echo "== Khởi động"
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
sleep 20
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
