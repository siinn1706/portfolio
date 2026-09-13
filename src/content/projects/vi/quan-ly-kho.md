---
projectId: "quan-ly-kho"
locale: "vi"
title: "Quản lý kho"
summary: "Ứng dụng quản lý hàng hóa, kho và các phiếu nhập xuất."
contributionText: "Mình phát triển giao diện và cùng xây dựng backend."
seoDescription: "Ứng dụng quản lý kho với React, FastAPI và SQLite. Nguyễn Văn Nam phát triển giao diện và phối hợp xây dựng backend."
context: "Giao diện có trang tổng quan và các danh sách hàng hóa, kho, phiếu nhập xuất."
decisionSummary: "Khi người dùng gửi phiếu nhập, giao diện kiểm tra các thông tin bắt buộc rồi gửi dữ liệu tới API. Backend cập nhật số lượng hàng, ghi giao dịch nhập và lưu phiếu trước khi phát thông báo cập nhật tồn kho."
---

## Giao diện và đầu ra

[Ảnh tổng quan kho](#figure-warehouse-dashboard) và [danh sách hàng hóa](#figure-warehouse-items) được chụp từ bản web chạy với FastAPI và SQLite cục bộ. Tài khoản demo hiển thị dữ liệu trống; các số 0 và N/A là trạng thái rỗng hoặc fallback của giao diện.

## Về dự án

Ứng dụng quản lý hàng hóa, kho và các phiếu nhập xuất. Giao diện có trang tổng quan và các danh sách theo nghiệp vụ.

## Phần mình đóng góp

Mình phát triển giao diện và cùng xây dựng backend cho ứng dụng quản lý kho.

| Phạm vi | Vai trò đã xác nhận |
|---|---|
| Giao diện | Phát triển giao diện |
| Backend | Phối hợp xây dựng cùng nhóm |

Sơ đồ và luồng bên dưới mô tả sản phẩm chung. Chúng không xác định tác giả từng module hoặc bổ sung vai trò hạ tầng vào phần việc đã xác nhận.

## Khi nhập lại cùng một tệp

*Một trải nghiệm mình nhớ lại khi làm dự án; các ảnh và phép kiểm được ghi riêng bên dưới.*

Một lần thử Quản lý kho, mình chọn lại đúng tệp dữ liệu vừa nhập để xem hệ thống phản ứng thế nào. Thao tác vẫn hoàn tất và không báo lỗi, nhưng số lượng của một số sản phẩm bị cộng thêm lần nữa. Giao diện trông vẫn bình thường.

Đọc lại phần xử lý, mình nhận ra đã viết chức năng “nhập tệp” trước khi trả lời rõ nó có nghĩa gì: cập nhật danh sách sản phẩm, thay thế số tồn hay ghi nhận một lần nhập hàng mới? Trên giao diện, những việc ấy khá giống nhau — chọn tệp, bấm nút, chờ bảng cập nhật. Trong dữ liệu, chúng lại là những thao tác khác nhau.

Mình quay lại làm rõ quy tắc nhập, cách nhận diện mã sản phẩm và phản hồi cho dòng không hợp lệ. Mình cũng thử thêm việc nhập lại cùng tệp, để trống số lượng, thêm khoảng trắng vào mã và trộn dòng đúng với dòng sai trong một lần nhập.

Điều mình nhớ là ứng dụng không hề trông như đang lỗi. Bảng vẫn ngay ngắn, các nút vẫn hoạt động, chỉ có một con số không còn đúng. Từ đó, thông báo “Thành công” chưa phải điểm dừng của mình: mình còn mở dữ liệu ra kiểm tra thêm.

## Kiến trúc hệ thống

Giao diện React và TypeScript trao đổi với một ứng dụng FastAPI qua HTTP và WebSocket. Backend xử lý nghiệp vụ kho và lưu dữ liệu bằng SQLAlchemy với SQLite. Cùng frontend này có cấu hình Tauri để đóng gói thành ứng dụng desktop.

Backend có các phần xử lý xác thực, kho, chat và xuất báo cáo trong cùng ứng dụng FastAPI. SMTP cho email OTP và Gemini cho trả lời AI là các tích hợp tùy cấu hình. Tệp tải lên được lưu cục bộ.

Đọc [sơ đồ kiến trúc](#figure-warehouse-system) từ giao diện tới dữ liệu:

1. Trình duyệt chạy giao diện React; Tauri là cách đóng gói desktop được khai báo cho cùng frontend.
2. HTTP và WebSocket nối giao diện với các phần xử lý trong một ứng dụng FastAPI.
3. Nghiệp vụ kho lưu dữ liệu qua SQLAlchemy vào SQLite; tệp tải lên được lưu cục bộ.
4. SMTP và Gemini là các nhánh tích hợp tùy cấu hình.

Sơ đồ mô tả mã nguồn. Lần chạy web không kiểm chứng bản Tauri, email hoặc AI.

[Xem mã nguồn trên GitHub](https://github.com/siinn1706/NT106_QuanLyKho/tree/7499d982e49b1b64c5848d568019c33a82467bbc)

## Cách hệ thống hoạt động

Phần này mô tả cách hệ thống hoạt động dựa trên mã nguồn và cấu hình của dự án.

### Luồng tạo phiếu nhập

Khi người dùng gửi phiếu nhập, giao diện kiểm tra các thông tin bắt buộc rồi gửi dữ liệu tới API. Backend cập nhật số lượng hàng, ghi giao dịch nhập và lưu phiếu trước khi phát thông báo cập nhật tồn kho.

Trang tạo phiếu cập nhật danh sách bằng phản hồi HTTP. Trang Hàng hóa đang mở có thể nhận sự kiện inventory:updated qua WebSocket và gọi lại API để tải dữ liệu mới. Hai đường cập nhật này hoạt động riêng; thứ tự dữ liệu đến các trình duyệt không được bảo đảm.

Đọc [sơ đồ luồng tạo phiếu nhập](#figure-warehouse-stock-in) theo các bước trong mã nguồn:

1. Giao diện kiểm tra thông tin bắt buộc rồi gửi phiếu tới API.
2. Backend cập nhật số lượng hàng và ghi giao dịch nhập cùng phiếu.
3. `db.commit()` và `db.refresh()` diễn ra trước khi phát sự kiện `inventory:updated`.
4. Trang gửi phiếu dùng phản hồi HTTP; trang Hàng hóa đang kết nối có thể gọi lại API sau khi nhận sự kiện.

Hai đường ở bước cuối không có thứ tự đến chung. Thông báo không là hàng đợi bền vững; lượt chụp giao diện chưa tạo phiếu để kiểm tra luồng này.

[Xem mã nguồn trên GitHub](https://github.com/siinn1706/NT106_QuanLyKho/blob/7499d982e49b1b64c5848d568019c33a82467bbc/KhoHang_API/app/inventory_service.py)

### Nhìn lại thiết kế từ mã nguồn

*Phân tích biên tập từ source, không phải lời kể về quyết định lịch sử của Nam hoặc nhóm.*

Luồng nhập kho có hai mốc cần đọc riêng: **lưu dữ liệu** và **báo cho giao diện cập nhật**. Trong source, `db.commit()` nằm trước lời gọi phát sự kiện `inventory:updated`. Cách sắp xếp này giúp thông báo mô tả thay đổi đã được lưu, nhưng không làm việc lưu và gửi thông báo trở thành một giao dịch duy nhất.

Đánh đổi là đường cập nhật giao diện khá trực tiếp, còn độ tin cậy của dữ liệu và độ tin cậy của thông báo cần được kiểm riêng. Một browser nhận sự kiện có thể tải lại danh sách; browser mất kết nối không được chứng minh sẽ nhận lại mọi sự kiện đã bỏ lỡ. Phản hồi HTTP của trang gửi phiếu và lần tải lại ở browser khác cũng không tạo ra một thứ tự hiển thị chung.

Để kiểm tra lập luận, đọc [hàm tạo phiếu nhập tại commit 7499d98](https://github.com/siinn1706/NT106_QuanLyKho/blob/7499d982e49b1b64c5848d568019c33a82467bbc/KhoHang_API/app/inventory_service.py#L207-L261). Đây là thứ tự trong source; lượt chụp giao diện chưa tạo phiếu hoặc đo thời gian thông báo.

## Kiểm tra thực tế

Ứng dụng đã được chạy ở chế độ web với backend cục bộ. Đăng nhập bằng tài khoản demo và các trang danh sách đã tải được qua API. Bản chụp sử dụng dữ liệu trống; chưa kiểm tra đầy đủ nghiệp vụ kho hoặc bản desktop Tauri. Ở màn hình hẹp, sidebar còn làm vùng nội dung chính quá nhỏ.

Thông báo WebSocket được gửi sau khi dữ liệu đã commit và chỉ tới các kết nối đang mở. Đây không phải hàng đợi bền vững; thông báo không nằm trong cùng giao dịch cơ sở dữ liệu với phiếu nhập.

### Phạm vi đã kiểm

Phiên bản nguồn là `7499d982e49b1b64c5848d568019c33a82467bbc`. Lần chụp được ghi lúc `2026-09-08T16:42:43.705Z`; source được đối chiếu lại ngày 10/09/2026. Hai mốc này không phải thời gian hoàn thành dự án.

| Tác vụ và môi trường | Bằng chứng | Quan sát | Chưa kiểm |
|---|---|---|---|
| Đăng nhập demo; Windows, Node 22.14.0, Python 3.11.9, FastAPI, SQLite | Chạy web cục bộ | Đăng nhập bằng giao diện thành công | OTP qua SMTP, tài khoản thật |
| Dashboard và danh sách; cùng môi trường, dữ liệu trống | Ảnh và request API cục bộ | Trang tải được; 0/N/A là empty/fallback | Nghiệp vụ nhập xuất, FIFO, kết quả kinh doanh |
| Tạo phiếu nhập và phát sự kiện | Đọc source tại phiên bản ghim | Commit dữ liệu trước broadcast WebSocket | Tạo phiếu thật, nhiều browser, mất kết nối |
| Desktop và tích hợp tùy chọn | Cấu hình Tauri, SMTP, Gemini trong source | Có đường tích hợp | Build native, xuất file native, email và AI |

### Điều cần giữ khi kiểm lại

Nhận định kỹ thuật từ source: cần tách câu hỏi “dữ liệu đã lưu chưa?” khỏi “mọi giao diện đã thấy dữ liệu mới chưa?”. Một ảnh dashboard hoặc một sự kiện WebSocket chưa trả lời đủ cả hai câu hỏi.

**Bước tiếp theo được đề xuất:** tạo một phiếu nhập bằng dữ liệu tổng hợp trong môi trường riêng, mở thêm một browser, rồi đối chiếu số lượng đã lưu với phản hồi HTTP và lần tải lại sau sự kiện. Ghi cả trường hợp mất kết nối; bước này hiện chưa được thực hiện và không mở rộng phạm vi bằng chứng của các ảnh đang dùng.
