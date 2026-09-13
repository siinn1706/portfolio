---
projectId: "healthos"
locale: "vi"
title: "HealthOS"
summary: "Ứng dụng web để quản lý và theo dõi sức khỏe cá nhân."
contributionText: "Mình phát triển giao diện, cùng xây dựng backend và tham gia thiết lập hạ tầng."
seoDescription: "HealthOS: phần việc của Nguyễn Văn Nam về giao diện, phối hợp backend và hạ tầng; kiến trúc dự án và giao diện chạy cục bộ."
context: "Giao diện HealthOS tổ chức các nội dung về dịch vụ, tài khoản và theo dõi sức khỏe."
decisionSummary: "Cấu hình Docker Compose mô tả frontend, Core API, worker, dịch vụ AI và các dịch vụ dữ liệu. Dockerfile có target riêng cho phát triển và production; PostgreSQL, Redis và MinIO có volume riêng. Tác vụ khởi tạo, migration và health check quy định thứ tự khởi động."
---

## Giao diện và đầu ra

Ảnh trang chủ và trang dịch vụ được chụp từ frontend chạy cục bộ. Nội dung sức khỏe trên giao diện là dữ liệu minh họa của ứng dụng.

## Về dự án

HealthOS là ứng dụng quản lý sức khỏe cá nhân. Giao diện web tổ chức các nội dung về dịch vụ, tài khoản và theo dõi sức khỏe.

## Phần mình đóng góp

Mình phát triển giao diện web, cùng xây dựng backend và tham gia thiết lập hạ tầng cho HealthOS.

| Phạm vi | Vai trò đã xác nhận |
|---|---|
| Giao diện web | Phát triển giao diện |
| Backend | Phối hợp xây dựng cùng nhóm |
| Hạ tầng | Tham gia thiết lập |

Kiến trúc dưới đây mô tả dự án chung. Danh sách công nghệ và sơ đồ không có nghĩa mỗi thành phần đều do mình thiết kế hoặc thực hiện độc lập.

## Kiến trúc hệ thống

HealthOS dùng Next.js cho giao diện và lớp BFF, kết nối tới Core API viết bằng FastAPI. Core làm việc với PostgreSQL để lưu dữ liệu ứng dụng, MinIO để lưu ảnh và Redis cho hàng đợi Celery cùng kiểm tra thu hồi JWT.

Với ảnh bữa ăn, Core lưu ảnh và đưa tác vụ vào hàng đợi Celery. Worker gọi dịch vụ AI để phân tích, sau đó ghi kết quả hoặc trạng thái lỗi vào PostgreSQL. Dịch vụ AI đọc ảnh qua URL tạm do hệ thống lưu trữ cung cấp.

Chat sử dụng luồng SSE riêng giữa Core và dịch vụ AI. Dịch vụ AI có thể gọi một LLM proxy bên ngoài khi được cấu hình; luồng này tách biệt với hàng đợi phân tích ảnh bữa ăn.

[Xem mã nguồn trên GitHub](https://github.com/siinn1706/NT208_HealthOS/tree/5131987c953d800e1c343cc7156be7554e4e498f)

## Cách hệ thống hoạt động

Phần này mô tả cách hệ thống hoạt động dựa trên mã nguồn và cấu hình của dự án.

### Đóng gói và khởi động dịch vụ

Cấu hình Docker Compose mô tả frontend, Core API, worker, dịch vụ AI và các dịch vụ dữ liệu. Dockerfile có target riêng cho phát triển và production; PostgreSQL, Redis và MinIO có volume riêng. Tác vụ khởi tạo, migration và health check quy định thứ tự khởi động.

Trong cấu hình, tác vụ khởi tạo tạo bucket MinIO và Alembic cập nhật schema trước khi Core API khởi động. Frontend và các worker phụ thuộc vào trạng thái sẵn sàng của những dịch vụ liên quan.

Repository có script PowerShell để thiết lập môi trường, chọn nhóm dịch vụ và khởi động theo chế độ Docker hoặc local. Các workflow EAS dành riêng cho ứng dụng mobile, tách khỏi cấu hình chạy web và backend.

[Xem mã nguồn trên GitHub](https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml)

### Nhìn lại thiết kế từ mã nguồn

*Phân tích biên tập từ source, không phải lời kể về các phương án nhóm từng cân nhắc.*

Điểm đáng chú ý là cấu hình tách **dịch vụ đã khởi động**, **health check đạt** và **tác vụ khởi tạo hoàn tất**. Chẳng hạn, Core chờ migration kết thúc thành công; frontend chờ health check của Core. Với cấu trúc này, thứ tự xuất hiện của process chưa đủ để giải thích khi nào phần phụ thuộc được phép bắt đầu.

Đánh đổi là cấu hình khởi động rõ hơn nhưng phụ thuộc vào ý nghĩa của từng phép kiểm. Một endpoint trả thành công chỉ chứng minh điều nó thực sự kiểm tra. Nó không tự chứng minh đăng nhập, xử lý ảnh hoặc toàn bộ luồng dữ liệu đã hoạt động. Các điều kiện này cũng không thay thế việc xử lý mất kết nối trong ứng dụng sau khi đã khởi động.

Để đối chiếu nhận định này, đọc `depends_on` và `healthcheck` trong [Compose tại commit 5131987](https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml#L46-L118). Đây là cấu hình được khai báo; không phải log một lần chạy toàn bộ HealthOS.

## Kiểm tra thực tế

Bản frontend đã được chạy cục bộ để kiểm tra trang chủ và trang đăng nhập trên desktop/mobile, cùng trang dịch vụ trên desktop. Tab dịch vụ thay đổi nội dung đúng theo lựa chọn. Trong lần kiểm tra này, Core API, cơ sở dữ liệu và các worker chưa được khởi chạy; các luồng đăng nhập, dữ liệu sức khỏe và xử lý AI chưa được kiểm tra xuyên suốt.

Cấu hình có lịch tác vụ Celery, nhưng chưa thấy tiến trình beat riêng trong các tệp khởi động đã đối chiếu. Trạng thái phòng và kết nối WebSocket được giữ trong bộ nhớ của một process; mã nguồn này chưa thể hiện cơ chế đồng bộ giữa nhiều process.

### Phạm vi đã kiểm

Mã nguồn được ghim tại `5131987c953d800e1c343cc7156be7554e4e498f` và đối chiếu lại ngày 10/09/2026. Ngày đối chiếu source không phải ngày chạy ứng dụng; metadata ảnh HealthOS hiện không ghi thời điểm chụp đủ để gắn ngày quan sát chính xác.

| Tác vụ và môi trường | Bằng chứng | Quan sát | Chưa kiểm |
|---|---|---|---|
| Home, Login; Windows, Node 22.14.0, Chrome; desktop/mobile | Chạy frontend cục bộ, ảnh chụp | Trang public hiển thị; dashboard yêu cầu đăng nhập | Đăng nhập thành công, dashboard có dữ liệu |
| Services; cùng frontend, desktop | Tương tác giao diện | Đổi tab thay đổi nội dung dịch vụ | Thực thi tác vụ AI |
| Khởi tạo, migration, Core và worker | Đọc cấu hình Compose tại phiên bản ghim | Có điều kiện startup và health check | Chạy full Compose, phục hồi lỗi, vận hành production |
| Ảnh bữa ăn và chat | Đọc source backend/AI | Queue phân tích ảnh và SSE chat là hai đường riêng | Kết quả AI và luồng end-to-end |

### Điều cần giữ khi kiểm lại

Nhận định kỹ thuật từ lần đối chiếu này: hãy đặt kết quả quan sát cạnh đúng phạm vi của phép kiểm. Ảnh frontend, cấu hình khởi động và kết quả backend là ba loại bằng chứng khác nhau; ghép chúng vào cùng một sơ đồ không làm tăng mức kiểm chứng.

Lab readiness liên quan đã ghi bốn lượt fixture do trợ lý thực hiện. Kết quả cho một ví dụ cụ thể về process vẫn chạy nhưng readiness không đạt; chưa chứng nhận cấu hình HealthOS hoặc thay thế một lần chạy backend.

**Bước tiếp theo được đề xuất:** chạy một dependency HealthOS cùng thành phần sử dụng nó, giữ phản hồi health cụ thể, rồi quan sát bên sử dụng khi dependency không còn truy cập được. Phần kiểm tra HealthOS này chưa được thực hiện.
