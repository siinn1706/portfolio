# Biên tập nội dung

Website kết hợp dữ liệu chung, bài viết tiếng Việt/Anh và tài nguyên được chọn vào một catalog công khai. Trang, menu, liên kết ngôn ngữ, nội dung liên quan và metadata cùng đọc catalog này. Sửa tại các nguồn dưới đây để giữ nội dung nhất quán.

## Các file cần biết

| Nội dung | Nguồn |
| --- | --- |
| Hồ sơ, học vấn, lời giới thiệu, câu chuyện, liên hệ và CV | [`src/data/profile.ts`](../src/data/profile.ts) |
| Mối quan tâm, công cụ và kinh nghiệm có dẫn chứng | [`src/data/topics.ts`](../src/data/topics.ts) |
| ID, đường dẫn, repository, stack, dẫn chứng và lựa chọn dự án | [`src/data/projects.ts`](../src/data/projects.ts) |
| Bài dự án | [`src/content/projects/`](../src/content/projects/) theo thư mục `vi` và `en` |
| Dữ liệu và bài ghi chú | [`src/data/notes.ts`](../src/data/notes.ts), [`src/content/notes/`](../src/content/notes/) |
| Quan hệ giữa các bài | [`src/data/relations.ts`](../src/data/relations.ts) |
| Bản dịch nhãn giao diện | [`src/i18n/messages.ts`](../src/i18n/messages.ts) |
| Ảnh/sơ đồ dự án, alt, caption và nguồn | [`src/data/media.ts`](../src/data/media.ts) |
| Ảnh đại diện, ảnh trang chủ và ảnh About | [`src/data/personal-media.ts`](../src/data/personal-media.ts) |
| Ảnh chia sẻ trên mạng xã hội | [`src/data/share-media.json`](../src/data/share-media.json), [`src/data/share-media.ts`](../src/data/share-media.ts) |
| Cặp mục bài VI/EN và đường đọc nhanh | [`src/data/reading-sections.ts`](../src/data/reading-sections.ts) |

Kiểu dữ liệu được khai báo tại [`src/data/types.ts`](../src/data/types.ts), schema tại [`src/lib/schemas.ts`](../src/lib/schemas.ts). [`src/lib/get-public-catalog.ts`](../src/lib/get-public-catalog.ts) cung cấp catalog cho giao diện.

## Hồ sơ và liên hệ

Viết đủ bản `vi` và `en` cho các trường được bản địa hóa. Giữ `headline` là một mảng đoạn chữ cho mỗi ngôn ngữ. Nội dung tự sự tiếng Việt dùng “mình”; bản tiếng Anh giữ đúng mức độ đóng góp, kinh nghiệm và ý nghĩa.

`storyTitle` và `story` là tiêu đề và các đoạn câu chuyện ở About. Lời chào ngắn thuộc trang chủ; phần học hỏi, định hướng và câu chuyện dài thuộc About. Không suy ra kỹ năng cá nhân từ danh sách công nghệ trong repository.

Liên hệ và trạng thái bật/tắt nằm trong `profile.ts`. ID `phone` hiện hiển thị dưới tên Zalo; giữ ID ổn định khi sửa nhãn. Email cần một địa chỉ thật: thao tác liên hệ mở trình soạn thư, thao tác sao chép chỉ là tiện ích bổ sung. CV chỉ tạo liên kết khi đã có file PDF và ngôn ngữ tài liệu phù hợp.

## Thêm hoặc sửa dự án

1. Thêm bản ghi vào `src/data/projects.ts` với `projectId` ổn định và `routeSlug` hợp lệ. Dùng cùng slug cho cả hai ngôn ngữ. Repository, đóng góp và trạng thái công việc phải có cơ sở; giữ `workStatus: 'unknown'` khi chưa rõ.
2. Tạo hai file `src/content/projects/vi/{projectId}.md` và `src/content/projects/en/{projectId}.md`. Sao chép cấu trúc từ một bài hiện có, rồi thay bằng dữ liệu và bài viết của dự án mới.
3. Điền frontmatter: `projectId`, `locale`, `title`, `summary`, `contributionText`, `seoDescription`, `context`, `decisionSummary`. Không dùng trường `slug` để thay ID nội dung.
4. Trình bày bối cảnh, phần đóng góp, kiến trúc, lựa chọn kỹ thuật và kết quả kiểm tra. Mỗi heading phải dẫn đến nội dung thực. Giải thích rõ ảnh chụp và sơ đồ chứng minh điều gì.
5. Thêm dẫn chứng với `evidenceId` riêng. Chọn đúng loại `source`, `configuration` hoặc `runtime-capture`; giữ URL ghim commit nếu có, môi trường, phạm vi và giới hạn. Chỉ tham chiếu `mediaId` tồn tại.
6. Đặt `publication: { publishIntent: 'publish', publicSelected: true }` khi cả hai bản dịch, dữ liệu và tài nguyên đã sẵn sàng. Bản nháp có thể thiếu bản dịch và không sinh trang công khai.
7. Chạy kiểm tra rồi đọc cả hai ngôn ngữ trong trình duyệt.

Bài chỉ có chữ dùng `mediaIds: []` và `heroMediaId: null`. File ảnh đã khai báo nhưng bị thiếu phải được sửa; không thay bằng ảnh không liên quan.

Work và About lấy toàn bộ dự án công khai, sắp theo `order` rồi ID. `homeFeatureRank` là số nguyên dương tùy chọn, xác định thứ tự nổi bật ở Home. Có tối đa ba hạng khác nhau; bỏ trường này để dự án chỉ xuất hiện ở Work/About. Không tạo một danh sách ID riêng trong component.

Liên kết nội dung liên quan nằm trong `relations.ts`, có lý do bằng cả VI/EN. Không tự liên kết một bài với chính nó, tạo cạnh trùng hoặc trỏ đến ID không tồn tại. Một quan hệ được ẩn khi một đầu là bản nháp.

## Viết ghi chú và các mục tùy chọn

Ghi chú cần dữ liệu chung gồm `noteId`, `routeSlug`, `topicIds`, nguồn và lựa chọn hiển thị, cùng một cặp Markdown VI/EN. Chỉ thêm ngày khi biết nguồn của ngày đó. `noteSourceLabels` trong `notes.ts` gắn nhãn theo URL chính xác; URL chưa có nhãn vẫn được hiển thị nguyên văn.

Photography hiện chưa có nội dung. Khi bổ sung, dùng [`photography.ts`](../src/data/photography.ts) và [`photography-media.ts`](../src/data/photography-media.ts): mỗi ảnh có ID, kích thước, quyền sử dụng, lựa chọn công khai, tiêu đề, alt và caption VI/EN. Ngày/địa điểm là tùy chọn. Không dùng ảnh mẫu để thay ảnh tác giả. Khi không có mục công khai, catalog sẽ bỏ trang và liên kết tương ứng.

Template thử nghiệm thuộc `tests/fixtures/content/`, ngoài thư mục nội dung thật. Một fixture kiểm tra mục tùy chọn không phải nội dung để phát hành.

## Ảnh và tài nguyên

`personalMediaSelection` điều khiển ba slot `avatar`, `homePortrait`, `aboutPortrait`. Đặt một slot thành `null` để bỏ ảnh và figure tương ứng. Avatar giữ kích thước nhỏ, tối đa 64px; không đưa ảnh đại diện vào slot portrait hoặc ảnh chia sẻ. Ảnh trang chủ và About giữ toàn khung; các biến thể responsive phải giữ tỉ lệ/canvas nguồn.

Repository đã có các biến thể ảnh dùng để build. Khi thay ảnh, cập nhật file import, kích thước, alt và các biến thể trong registry cùng lúc. Kiểm tra nguồn và quyền sử dụng trước khi thêm tài nguyên. Quy định font và tài nguyên hiện tại ở [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).

Ảnh dự án cần alt/caption, nguồn và dẫn chứng phù hợp. Sơ đồ cần bản đúng ngôn ngữ và link xem ảnh đầy đủ. Các cover chia sẻ hiện dùng khổ 1200×630; lựa chọn cover độc lập với ảnh dẫn chứng. Ảnh chỉ được tham chiếu trong metadata vẫn phải tồn tại trong bản build.

`public/` được sao chép trực tiếp vào đầu ra: chỉ đặt file thực sự cần công khai vào đó. Dùng `src/assets/` và registry cho tài nguyên cần xử lý/chọn lọc. Không thêm ảnh gốc chưa chọn, dữ liệu cá nhân không dùng, log, bản xuất hội thoại hoặc khóa bí mật.

## Mục lục, ngày và bản dịch

Giữ ID fragment của các heading đã có để liên kết cũ tiếp tục hoạt động. Khi thêm hoặc đổi mục đọc, cập nhật cặp VI/EN trong `reading-sections.ts` bằng ID thực do Markdown renderer sinh; không tự đoán cách chuyển dấu tiếng Việt. Test [`reading-sections.test.ts`](../tests/reading-sections.test.ts) kiểm bản đồ này theo nội dung đã render.

Figure trong bài dự án dùng `figure-${mediaId}` ở cả hai ngôn ngữ. Liên kết từ bài viết trỏ đến figure hoặc nguồn cụ thể. Giữ link native mở ảnh đầy đủ để người đọc dùng được cả khi không có JavaScript hay clipboard.

Bảng cần header hàng/cột và nội dung đầy đủ ở màn hình nhỏ lẫn bản in. Không giấu cột hoặc giảm chữ quá nhỏ để ép vừa khung.

`contentUpdatedAt` là ngày biên tập; ngày ghi chú và ngày quan sát thực nghiệm có nghĩa riêng. Không dùng ngày build thay cho ngày chưa biết. Thời gian đọc là ước tính từ độ dài nội dung, không phải số đo hành vi người đọc.

Hai bản dịch phải giữ cùng mức độ khẳng định: “tham gia” là “contributed” hoặc “participated”, không tự nâng thành “led” hay “architected”. Không thêm số người dùng, kết quả kinh doanh, chứng chỉ, mốc nghề nghiệp hoặc độ tin cậy production khi chưa có nguồn.

## Giữ đúng phạm vi dẫn chứng

Ảnh HealthOS hiện chứng minh giao diện frontend chạy cục bộ với dữ liệu minh họa; lượt chụp đó không kiểm tra Core API, cơ sở dữ liệu, workers hoặc AI xuyên suốt. Phần đóng góp được mô tả là phát triển giao diện, phối hợp backend và tham gia thiết lập hạ tầng.

Ảnh Quản lý kho hiện ghi nhận đăng nhập và các danh sách trống trong bản local. Chúng không chứng minh thao tác nhập kho, nhiều client đồng thời hay bản Tauri native. Số `N/A` và vùng trống là trạng thái giao diện, không phải chỉ số vận hành.

Đọc source xác nhận cấu trúc và đường đi của code. Lời tác giả xác nhận phần đóng góp hoặc ký ức được kể. Giữ hai loại nguồn này rõ ràng; cả hai đều không tự chứng minh toàn bộ hệ thống đã chạy production thành công.

## Kiểm tra sau khi biên tập

Chạy từ thư mục gốc, với `QA_REPORT_DIR` đã đặt theo [README](../README.md#kiểm-tra-trước-khi-đẩy-code):

```sh
npm run check
npm run test:content
npm run test:templates
npm run build
npm run verify:output
npm run test:e2e
```

Playwright cần trình duyệt đã cài theo README. Mở cả hai ngôn ngữ, kiểm nội dung, link ảnh, mục lục, liên hệ, màn hình nhỏ và bản in. Schema kiểm cấu trúc; người biên tập vẫn cần kiểm ý nghĩa và sự chính xác của bài viết.

Sau khi push lên `main`, quy trình GitHub Pages trong [hướng dẫn triển khai](deployment.md) sẽ kiểm tra và phát hành bản mới.
