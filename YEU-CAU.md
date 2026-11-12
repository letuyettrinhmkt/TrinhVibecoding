# Yêu cầu: Mini game "Đập Chuột" (chạy trên trình duyệt)

## 1. Tổng quan

- **Thể loại:** game phản xạ, một người chơi.
- **Nền tảng:** trình duyệt web (máy tính và điện thoại), không cần cài đặt, không cần server.
- **Thao tác:** bấm chuột (máy tính) hoặc chạm (điện thoại).
- **Mục tiêu người chơi:** đập trúng càng nhiều chuột càng tốt trong 30 giây.

## 2. Luật chơi

1. Bàn chơi là lưới **3×3 = 9 ô (lỗ)**.
2. Khi bắt đầu lượt, đồng hồ đếm ngược từ **30 giây**.
3. Chuột lần lượt **trồi lên ngẫu nhiên** ở một ô, ở lại một khoảng thời gian ngắn rồi tự lặn xuống.
   - Tại mỗi thời điểm có **tối đa 1 con chuột** trên bàn.
   - Thời gian chuột ở trên mặt đất: **khoảng 0,8–1,2 giây** (ngẫu nhiên trong khoảng này).
   - Con chuột tiếp theo không xuất hiện lại **ngay ở ô vừa xuất hiện** trước đó.
4. Người chơi bấm vào ô đang có chuột → **đập trúng**: chuột biến mất ngay, con tiếp theo xuất hiện sau một nhịp ngắn (~0,3 giây).
5. Bấm vào ô trống → **đập trượt**: không có tác dụng gì (không trừ điểm).
6. Mỗi con chuột chỉ tính điểm **một lần** — bấm nhiều lần liên tiếp vào cùng một con không được cộng thêm.
7. Khi đồng hồ về **0**: lượt kết thúc ngay, chuột đang trên bàn biến mất, mọi cú bấm sau đó không được tính.
8. Người chơi có thể chơi lại lượt mới bất kỳ lúc nào sau khi kết thúc.

## 3. Cách tính điểm

| Hành động | Điểm |
|---|---|
| Đập trúng chuột | **+1** |
| Đập trượt (ô trống) | 0 |
| Chuột tự lặn mất (không bấm kịp) | 0 |

- Điểm bắt đầu mỗi lượt = **0**.
- Điểm hiển thị cập nhật **ngay lập tức** khi đập trúng.
- **Kỷ lục (điểm cao nhất)** được lưu lại trên trình duyệt (localStorage), vẫn còn sau khi tải lại trang. Nếu không lưu được (chế độ ẩn danh…), game vẫn chạy bình thường, chỉ không giữ kỷ lục.

## 4. Màn hình

### 4.1. Màn hình bắt đầu
- Tên game: **Đập Chuột**.
- Mô tả luật ngắn gọn (1–2 dòng): "Bấm trúng chuột để ghi điểm. Bạn có 30 giây!"
- Hiển thị **Kỷ lục** hiện tại (nếu có).
- Nút **"Bắt đầu"**.

### 4.2. Màn hình chơi
- **Thanh trên cùng:**
  - Điểm hiện tại (VD: `Điểm: 12`).
  - Thời gian còn lại, đếm ngược theo giây (VD: `⏱ 18s`). 5 giây cuối đổi sang **màu đỏ** để cảnh báo.
- **Bàn chơi:** lưới 3×3 ô, các ô bằng nhau, đủ lớn để chạm bằng ngón tay trên điện thoại (tối thiểu ~80×80 px).
- **Hiệu ứng:**
  - Chuột trồi lên / lặn xuống có chuyển động (không xuất hiện đột ngột).
  - Khi đập trúng: có phản hồi rõ ràng (VD: chuột đổi hình "bị đập", nhấp nháy, hoặc hiện "+1").
- Con trỏ chuột trên máy tính có thể đổi thành hình búa (không bắt buộc).

### 4.3. Màn hình kết thúc
- Thông báo **"Hết giờ!"**.
- **Điểm của lượt** vừa chơi.
- **Kỷ lục**; nếu lượt này phá kỷ lục thì hiện thông báo **"Kỷ lục mới!"**.
- Nút **"Chơi lại"** → bắt đầu ngay lượt mới (điểm về 0, thời gian về 30 giây).

## 5. Yêu cầu kỹ thuật (định hướng)

- Chỉ dùng **HTML + CSS + JavaScript thuần**, mở trực tiếp file `index.html` là chơi được.
- Không phụ thuộc thư viện ngoài, không cần mạng.
- Hình chuột có thể là emoji 🐭 hoặc hình vẽ đơn giản bằng CSS/SVG.
- Giao diện **responsive**: hiển thị gọn trên màn hình rộng 360 px trở lên, không cuộn ngang.
- Đồng hồ phải chính xác: một lượt kéo dài **30 giây ± 0,5 giây** theo thời gian thực.

## 6. Tiêu chí hoàn thành

Game được coi là hoàn thành khi **tất cả** các mục sau đều đạt:

**Chức năng**
- [ ] Mở `index.html` trên Chrome, Edge, Firefox (bản mới) chơi được, không có lỗi trong Console.
- [ ] Màn hình bắt đầu hiển thị đúng; bấm "Bắt đầu" thì vào lượt chơi.
- [ ] Bàn chơi có đúng 9 ô xếp lưới 3×3.
- [ ] Chuột xuất hiện ngẫu nhiên, mỗi lúc chỉ 1 con, tự lặn sau ~0,8–1,2 giây, không lặp lại liền ô cũ.
- [ ] Đập trúng → +1 điểm, chuột biến mất ngay; bấm liên tục vào cùng con chỉ được 1 điểm.
- [ ] Đập trượt → điểm không đổi.
- [ ] Đồng hồ đếm ngược từ 30 về 0, đổi màu đỏ ở 5 giây cuối; lượt kéo dài 30 ± 0,5 giây.
- [ ] Hết giờ: không còn chuột xuất hiện, bấm không được tính, chuyển sang màn hình kết thúc.
- [ ] Màn hình kết thúc hiển thị đúng điểm lượt vừa chơi và kỷ lục; báo "Kỷ lục mới!" khi phá kỷ lục.
- [ ] "Chơi lại" reset đúng điểm về 0 và thời gian về 30 giây; chơi nhiều lượt liên tiếp không bị lỗi (VD: chuột xuất hiện dồn dập, đồng hồ chạy nhanh gấp đôi).
- [ ] Kỷ lục vẫn còn sau khi tải lại trang.

**Giao diện & trải nghiệm**
- [ ] Chơi được bằng chạm trên điện thoại (màn hình 360 px), ô đủ lớn, không cuộn ngang, không bị phóng to khi chạm nhanh.
- [ ] Có hiệu ứng trồi/lặn và phản hồi khi đập trúng.
- [ ] Chữ, điểm, thời gian dễ đọc.

## 7. Ngoài phạm vi (phiên bản này chưa làm)

- Âm thanh, nhạc nền.
- Nhiều cấp độ khó / tăng tốc theo thời gian.
- Nhiều chuột cùng lúc, chuột đặc biệt (thưởng/phạt điểm).
- Bảng xếp hạng online, đăng nhập.
