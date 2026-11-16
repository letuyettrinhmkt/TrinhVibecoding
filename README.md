# Đập Chuột

Mini game phản xạ chạy trên trình duyệt: lưới 3×3, 30 giây, đập trúng càng nhiều chuột càng tốt.

| Thư mục | Nội dung |
|---|---|
| `app/` | Code game (HTML + CSS + JavaScript thuần) |
| `design/` | Design system, `tokens.css` được game dùng trực tiếp |
| `docs/` | Tài liệu: tổng quan, chức năng, màn hình, quy tắc, kế hoạch test (mở `docs/index.html`) |
| `server/` | Server Node.js nhỏ phục vụ `app/` và `design/` khi chạy bằng Docker |

## Cách chạy bằng Docker

**Cần có:** Docker Desktop (hoặc Docker Engine) có kèm Docker Compose. Không cần cài Node.js trên máy.

1. Mở terminal tại thư mục gốc của dự án (nơi có `docker-compose.yml`).
2. Build và khởi động:

   ```bash
   docker compose up -d --build
   ```

3. Mở trình duyệt tại **http://localhost:3000**

**Các lệnh hay dùng:**

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem log | `docker compose logs -f app` |
| Dừng và xoá container | `docker compose down` |
| Build lại sau khi sửa code | `docker compose up -d --build` |

**Ghi chú:**

- Dịch vụ duy nhất là `app`: server Node.js không có gói phụ thuộc, phục vụ `app/` ở `/` và `design/` ở `/design/`.
- Kiểm tra server còn sống: http://localhost:3000/healthz trả về `ok`.
- Code được chép vào image khi build, nên sửa file trong `app/` xong cần build lại.
- Nếu cổng 3000 đã bị chiếm, đổi dòng `"3000:3000"` trong `docker-compose.yml` thành ví dụ `"8080:3000"` rồi mở http://localhost:8080.
- Kỷ lục được lưu trong trình duyệt (localStorage) theo từng địa chỉ, nên kỷ lục ở `localhost:3000` tách biệt với khi mở file trực tiếp.

## Chạy không cần Docker

Mở trực tiếp file `app/index.html` bằng trình duyệt (giữ nguyên thư mục `design/` bên cạnh `app/`).
