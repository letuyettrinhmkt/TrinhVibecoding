#!/usr/bin/env bash
# Sao lưu database Đập Chuột bằng pg_dump, nén gzip, giữ KEEP bản gần nhất.
# Chạy trong thư mục repo trên máy ảo:   bash deploy/backup.sh
# Cron 3 giờ sáng (crontab -e):
#   0 3 * * * cd $HOME/catxe && bash deploy/backup.sh >> $HOME/backups/backup.log 2>&1
# File sao lưu chứa email, số điện thoại người chơi: chỉ chủ máy đọc được (chmod 600).
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-7}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

file="$BACKUP_DIR/dapchuot-$(date +%Y%m%d-%H%M%S).sql.gz"

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' \
  | gzip > "$file.tmp"
mv "$file.tmp" "$file"

# Xoá bản cũ, chỉ giữ KEEP bản mới nhất
ls -1t "$BACKUP_DIR"/dapchuot-*.sql.gz | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
done

echo "$(date '+%F %T') Đã sao lưu: $file ($(du -h "$file" | cut -f1))"
