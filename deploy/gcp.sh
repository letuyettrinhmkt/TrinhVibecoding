#!/usr/bin/env bash
# Deploy Đập Chuột lên Google Cloud theo docs/06-ke-hoach-deploy.html.
# Chạy trong Cloud Shell, từng bước một:
#   bash deploy/gcp.sh check                  # chỉ đọc: tài khoản, project, thanh toán
#   bash deploy/gcp.sh use <PROJECT_ID>       # chọn project có sẵn
#   bash deploy/gcp.sh new-project <ID>       # tạo project mới
#   bash deploy/gcp.sh link-billing <BILLING_ACCOUNT_ID>
#   bash deploy/gcp.sh enable                 # bật Compute Engine API
#   bash deploy/gcp.sh ip                     # giữ IP tĩnh            (có thể tính phí)
#   bash deploy/gcp.sh firewall               # mở 80/443, SSH chỉ qua IAP
#   bash deploy/gcp.sh vm                     # tạo máy e2-micro        (có thể tính phí)
#   bash deploy/gcp.sh setup                  # swap, Docker, code, .env, chạy Compose
#   bash deploy/gcp.sh logs [số dòng]         # trạng thái + log container
#   bash deploy/gcp.sh verify                 # kiểm tra từ bên ngoài
#   bash deploy/gcp.sh admin-password         # in tài khoản admin trong .env trên máy ảo
set -euo pipefail

REGION=us-central1
ZONE=us-central1-a
VM=catxe-vm
IPNAME=catxe-ip
REPO=https://github.com/letuyettrinhmkt/TrinhVibecoding.git
BRANCH="${BRANCH:-deploy-gcp}"
COMPOSE="sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml"

project() { gcloud config get-value project 2>/dev/null; }
vm_ip() { gcloud compute addresses describe "$IPNAME" --region="$REGION" --format='value(address)'; }
ssh_vm() { gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --quiet --command "$1"; }

case "${1:-}" in
  check)
    echo "== Tài khoản";  gcloud auth list 2>&1
    echo "== Cấu hình";   gcloud config list 2>&1
    echo "== Project";    gcloud projects list --format='table(projectId,name,lifecycleState)' 2>&1
    echo "== Thanh toán"; gcloud billing accounts list 2>&1
    p="$(project)"
    if [ -n "$p" ]; then
      echo "== Thanh toán của project $p"; gcloud billing projects describe "$p" 2>&1
      echo "== Máy ảo trong $p"; gcloud compute instances list 2>&1 || true
    fi
    ;;
  use)
    gcloud config set project "$2"
    gcloud billing projects describe "$2"
    ;;
  new-project)
    gcloud projects create "$2" --name="Dap Chuot"
    gcloud config set project "$2"
    ;;
  link-billing)
    gcloud billing projects link "$(project)" --billing-account="$2"
    gcloud billing projects describe "$(project)"
    ;;
  enable)
    gcloud services enable compute.googleapis.com
    gcloud services list --enabled --filter='name:compute.googleapis.com'
    ;;
  ip)
    gcloud compute addresses create "$IPNAME" --region="$REGION"
    gcloud compute addresses list
    ;;
  firewall)
    gcloud compute firewall-rules describe allow-web >/dev/null 2>&1 || \
      gcloud compute firewall-rules create allow-web --network=default --direction=INGRESS \
        --allow=tcp:80,tcp:443,udp:443 --source-ranges=0.0.0.0/0 --target-tags=web
    gcloud compute firewall-rules describe allow-ssh-iap >/dev/null 2>&1 || \
      gcloud compute firewall-rules create allow-ssh-iap --network=default --direction=INGRESS \
        --allow=tcp:22 --source-ranges=35.235.240.0/20
    for r in default-allow-ssh default-allow-rdp; do
      if gcloud compute firewall-rules describe "$r" >/dev/null 2>&1; then
        gcloud compute firewall-rules delete "$r" --quiet
      fi
    done
    gcloud compute firewall-rules list --format='table(name,sourceRanges.list(),allowed[].map().firewall_rule().list(),targetTags.list())'
    ;;
  vm)
    gcloud compute instances create "$VM" --zone="$ZONE" \
      --machine-type=e2-micro \
      --image-family=debian-12 --image-project=debian-cloud \
      --boot-disk-size=30GB --boot-disk-type=pd-standard \
      --address="$IPNAME" --network-tier=PREMIUM \
      --tags=web --metadata=enable-oslogin=TRUE \
      --no-service-account --no-scopes
    gcloud compute instances describe "$VM" --zone="$ZONE" \
      --format='table(name,machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP)'
    gcloud compute disks list --format='table(name,type.basename(),sizeGb)'
    ;;
  setup)
    ssh_vm "set -e; sudo apt-get update -qq; sudo apt-get install -y -qq git >/dev/null;
      if [ -d catxe ]; then cd catxe && git fetch -q && git checkout -q $BRANCH && git pull -q; else git clone -q -b $BRANCH $REPO catxe && cd catxe; fi;
      git log --oneline -1; bash deploy/vm-setup.sh"
    ;;
  logs)
    ssh_vm "cd catxe && $COMPOSE ps && free -h && sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' && $COMPOSE logs --tail=${2:-30}"
    ;;
  verify)
    ip="$(vm_ip)"
    site="$(ssh_vm "sudo grep '^SITE_DOMAIN=' catxe/.env | cut -d= -f2")"
    echo "IP tĩnh: $ip   SITE_DOMAIN: $site"
    for u in "https://$site/" "https://$site/api/health" "https://$site/admin/" "http://$site/"; do
      printf '%-45s ' "$u"; curl -s -m 15 -o /dev/null -w '%{http_code} %{redirect_url}\n' "$u" || echo "lỗi"
    done
    for port in 3000 5432 22; do
      printf 'Cổng %-5s từ Internet: ' "$port"
      if timeout 5 bash -c "</dev/tcp/$ip/$port" 2>/dev/null; then echo "MỞ (sai)"; else echo "đóng (đúng)"; fi
    done
    ;;
  admin-password)
    ssh_vm "sudo grep -E '^ADMIN_(USERNAME|PASSWORD)=' catxe/.env"
    ;;
  *)
    sed -n '2,16p' "$0"; exit 1
    ;;
esac
