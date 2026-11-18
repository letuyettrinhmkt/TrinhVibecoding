# Đập Chuột

Mini game phản xạ chạy trên trình duyệt: lưới 3×3, 30 giây, đập trúng càng nhiều càng tốt. Người chơi đăng ký (họ tên, email, số điện thoại) trước khi chơi; điểm từng lượt lưu vào PostgreSQL; admin quản lý danh sách ở `/admin`.

| Thư mục | Nội dung |
|---|---|
| `app/` | Code game (HTML + CSS + JavaScript thuần), gồm form đăng ký |
| `admin/` | Trang quản trị `/admin`: đăng nhập, xem, tìm kiếm, xoá, xuất CSV |
| `design/` | Design system, `tokens.css` được game và trang admin dùng trực tiếp |
| `docs/` | Tài liệu: tổng quan, chức năng, màn hình, quy tắc, kế hoạch test (mở `docs/index.html`) |
| `server/` | Server Node.js: phục vụ file tĩnh + API, kết nối PostgreSQL bằng thư viện `pg` |

## Cách chạy bằng Docker

**Cần có:** Docker Desktop (hoặc Docker Engine) có kèm Docker Compose. Không cần cài Node.js hay PostgreSQL trên máy. Cần trống khoảng **1,5 GB** ổ đĩa cho lần build đầu.

1. Mở terminal tại thư mục gốc của dự án (nơi có `docker-compose.yml`).
2. Tạo file `.env` từ mẫu, rồi mở `.env` đổi `POSTGRES_PASSWORD` và `ADMIN_PASSWORD` thành mật khẩu riêng (admin tối thiểu 12 ký tự):

   ```bash
   cp .env.example .env
   ```

3. Build và khởi động:

   ```bash
   docker compose up -d --build
   ```

4. Mở trình duyệt:
   - Game: **http://localhost:3000**
   - Trang admin: **http://localhost:3000/admin** (đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`)

**Hai dịch vụ:**

| Dịch vụ | Vai trò | Ghi chú |
|---|---|---|
| `app` | Server Node.js, cổng 3000 | Chờ `db` sẵn sàng rồi mới chạy; tự tạo bảng lần đầu |
| `db` | PostgreSQL 16 | Không mở cổng ra ngoài máy; dữ liệu nằm trong volume `db-data` |

**Các lệnh hay dùng:**

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log server | `docker compose logs -f app` |
| Xem log database | `docker compose logs -f db` |
| Dừng (giữ dữ liệu) | `docker compose down` |
| Build lại sau khi sửa code | `docker compose up -d --build` |
| ⚠️ Xoá sạch dữ liệu người chơi | `docker compose down -v` |

**Ghi chú:**

- `.env` chứa mật khẩu nên **không commit** (đã có trong `.gitignore`); chỉ commit `.env.example`.
- Dữ liệu người chơi còn nguyên khi `down` / build lại. Chỉ `down -v` mới xoá volume `db-data`.
- Kiểm tra server: http://localhost:3000/healthz trả `ok`; http://localhost:3000/api/health trả `{"ok":true}` khi kết nối được database.
- Chạy sau ngrok: để `TRUST_PROXY=true` trong `.env`. Lưu ý trang `/admin` cũng truy cập được qua link ngrok, nên dùng mật khẩu admin mạnh.
- Nếu cổng 3000 đã bị chiếm, đổi `"3000:3000"` trong `docker-compose.yml` thành ví dụ `"8080:3000"`.
- Bản GitHub Pages / mở file trực tiếp không có server nên **không đăng ký được** và game sẽ báo "Không kết nối được máy chủ".

## Deploy lên máy chủ (HTTPS + tên miền)

Kế hoạch đầy đủ cho Google Cloud Free Tier: `docs/06-ke-hoach-deploy.html`.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- Thêm Caddy (`deploy/Caddyfile`) tự xin HTTPS cho `SITE_DOMAIN` (mặc định `catxe.io.vn`), mở cổng 80/443; app không còn mở cổng 3000 ra ngoài.
- Giới hạn RAM cho máy 1 GB: db 256 MB, app 192 MB, caddy 64 MB. Cần Docker Compose ≥ 2.24.
- Thử trên máy local: `SITE_DOMAIN=localhost docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` rồi mở https://localhost (chứng chỉ tự ký, trình duyệt sẽ cảnh báo).
- Sao lưu database: `bash deploy/backup.sh` (mặc định lưu vào `~/backups`, giữ 7 bản).

## Cách chơi

- Bấm "Bắt đầu" → lần đầu nhập họ tên, email, số điện thoại và đồng ý lưu thông tin. Trình duyệt nhớ người chơi cho lần sau ("Không phải tôi?" để đổi người).
- Đập trúng **mèo hồng**: +1 điểm, hiện "Úi da!".
- Đập trúng **mèo đen** (khoảng 1/6 số lần xuất hiện): −1 điểm, hiện "Nà ní!". Điểm có thể âm.
- Đập ô trống: không trừ điểm, chỉ tính là trượt.
- Hết lượt, kết quả tự lưu lên server ("✓ Đã lưu kết quả").
- Máy có giọng đọc tiếng Việt thì game đọc to "Úi da" / "Nà ní" (ưu tiên giọng nữ). Bật/tắt tiếng bằng nút 🔊.
- Rời tab giữa lượt thì game tự tạm dừng.
