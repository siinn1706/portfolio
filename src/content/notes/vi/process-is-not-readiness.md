---
noteId: "process-is-not-readiness"
locale: "vi"
title: "Process đã chạy, ứng dụng đã sẵn sàng chưa?"
summary: "Đọc điều kiện khởi động trong Docker Compose qua một câu hỏi từ cấu hình HealthOS."
seoDescription: "Phân tích source về service_started, service_healthy và giới hạn của health check trong Docker Compose, liên hệ cấu hình HealthOS."
---

*Ghi chú phân tích mã nguồn, do trợ lý Codex biên tập ngày 10/09/2026. Đây không phải câu chuyện về một sự cố Nam đã gặp hoặc bằng chứng Nam đã trực tiếp chạy thí nghiệm.*

## Câu hỏi từ cấu hình

Trong [Compose của HealthOS tại commit 5131987](https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml#L46-L118), Core chờ migration hoàn tất thành công. Frontend lại chờ health check của Core. Hai điều kiện ấy dẫn tới một câu hỏi nhỏ: một process xuất hiện trong danh sách đang chạy đã đủ để thành phần khác gửi request chưa?

Một dịch vụ có thể cần thời gian khởi tạo sau khi process bắt đầu. Tài liệu Docker phân biệt thứ tự khởi động với việc chờ một dependency đạt health check. [Hướng dẫn startup order của Docker](https://docs.docker.com/compose/how-tos/startup-order/).

## Ba điều kiện trả lời ba câu hỏi

| Điều kiện | Câu hỏi khi khởi động |
|---|---|
| `service_started` | Dịch vụ phụ thuộc đã bắt đầu chạy chưa? |
| `service_healthy` | Health check được khai báo của dịch vụ đã đạt chưa? |
| `service_completed_successfully` | Tác vụ phụ thuộc đã kết thúc thành công chưa? |

Trong Compose, dạng `depends_on` ngắn tương ứng việc chờ khởi động. Dạng dài cho phép chọn điều kiện phù hợp, chẳng hạn chờ health check hoặc một tác vụ dùng một lần. Điều kiện hoàn tất phù hợp để đọc cấu hình migration; nó không phải health check chạy liên tục. [Tham chiếu `depends_on`](https://docs.docker.com/reference/compose-file/services/#depends_on).

## Health check kiểm điều gì?

Health status là trạng thái bổ sung của container. Probe có thể thành công khi process vẫn sống, rồi thất bại ở một lần kiểm sau. Số lần thử, thời gian chờ và khoảng khởi tạo ảnh hưởng lúc trạng thái chuyển đổi. [Tham chiếu `HEALTHCHECK`](https://docs.docker.com/reference/dockerfile/#healthcheck).

Điều cần đọc tiếp là nội dung phép kiểm. Trong HealthOS, Core probe gọi `/health/ready`; tên endpoint gợi ý mục đích nhưng vẫn cần đọc logic của nó để biết phạm vi. Phân tích từ cấu hình không đủ để kết luận toàn bộ đăng nhập, dữ liệu sức khỏe hoặc AI đã hoạt động.

Một phép kiểm cho endpoint chỉ nên được dùng để trả lời câu hỏi tương ứng. Khi viết hồ sơ, câu “có cấu hình readiness” cần đi cùng phiên bản nguồn; câu “luồng này đã chạy” cần môi trường, đầu vào và kết quả quan sát.

## Sau khi đã khởi động

Health check và chính sách restart có vai trò khác nhau. Tài liệu Docker mô tả restart policy theo việc container dừng hoặc thoát; một process vẫn chạy nhưng readiness không đạt không tự trở thành chứng cứ phục hồi thành công. [Chính sách restart của Docker](https://docs.docker.com/engine/containers/start-containers-automatically/).

Tương tự, `restart: true` nằm trong `depends_on` liên quan tới thao tác cập nhật hoặc khởi động lại dependency do Compose chủ động thực hiện. Không nên diễn giải trường này thành định tuyến request liên tục hoặc tự đồng bộ mọi client. [Ngữ nghĩa trường dependency restart](https://docs.docker.com/reference/compose-file/services/#depends_on).

## Một phép thử có phạm vi nhỏ

Một fixture hai dịch vụ có thể giúp kiểm riêng khái niệm: ứng dụng nghe HTTP trước khi sẵn sàng, client ghi request đầu, sau đó chạy lại với điều kiện chờ health. Cuối cùng, chủ động làm readiness thất bại trong khi process vẫn sống và ghi client quan sát gì. Đây là thiết kế phép thử, không phải kết quả HealthOS.

Điều có thể rút ra ngay từ source là cách đặt câu hỏi đúng. Tách **process**, **probe** và **luồng nghiệp vụ** giúp xác định bằng chứng còn thiếu trước khi gọi một hệ thống là sẵn sàng.
