# Portfolio — Nguyễn Văn Nam

Portfolio cá nhân song ngữ **Tiếng Việt / English**, xây dựng bằng **Astro, TypeScript, CSS và Markdown**. Giao diện dùng tông Champagne, hiệu ứng kính và chuyển động nhẹ; nội dung chính vẫn đọc được khi tắt JavaScript.

- Trang chủ, danh sách dự án, giới thiệu và ghi chú.
- Hai bài dự án: **HealthOS** và **Quản lý kho**, có ảnh, sơ đồ và phạm vi đóng góp.
- Chuyển ngôn ngữ theo trang, mục lục bài đọc, liên kết từng mục và bố cục in.
- Điều hướng bàn phím, hỗ trợ reduced motion và tùy chọn tắt chuyển động.
- Xuất HTML tĩnh để triển khai trên GitHub Pages.

Website (GitHub Pages): [siinn1706.github.io/portfolio](https://siinn1706.github.io/portfolio/).

## Chạy trên máy

Cài **Node.js 24.19.0** theo [`.node-version`](.node-version), kèm npm và Git. Không cần backend hoặc Docker.

```sh
git clone https://github.com/siinn1706/portfolio.git
cd portfolio
npm ci
npm run dev
```

Mở [http://127.0.0.1:4321](http://127.0.0.1:4321). Trang tiếng Việt ở `/vi/`, tiếng Anh ở `/en/`; `/` cũng hiển thị trang chủ tiếng Việt.

Để kiểm tra bản build:

```sh
npm run build
npm run preview
```

Bản tĩnh được tạo trong `dist/`. Chế độ local mặc định không cần biến môi trường và có `noindex`. Cấu hình phát hành nằm trong [`.env.example`](.env.example) và [hướng dẫn triển khai](docs/deployment.md).

## Kiểm tra trước khi đẩy code

Chọn thư mục lưu kết quả kiểm tra trong phiên terminal hiện tại:

```sh
# macOS / Linux
export QA_REPORT_DIR=.qa/local
```

```powershell
# Windows PowerShell
$env:QA_REPORT_DIR = '.qa/local'
```

Sau đó chạy:

```sh
npm run check
npm run test:content
npx playwright install chromium
npm run test:templates
npm run build
npm run verify:output
```

| Lệnh | Nội dung kiểm tra |
| --- | --- |
| `check` | TypeScript và các file Astro |
| `test:content` | Dữ liệu, nội dung song ngữ, đường dẫn và các hợp đồng của ứng dụng |
| `test:templates` | Build các tình huống nội dung tùy chọn và cấu hình không hợp lệ |
| `build` | Tạo website tĩnh |
| `verify:output` | Liên kết, metadata, tài nguyên ảnh và ngân sách dung lượng đầu ra |

Kiểm thử giao diện bằng Playwright sau khi build:

```sh
npx playwright install chromium
npm run test:e2e
```

Trên Windows, cấu hình có thể dùng Chrome hoặc Edge đã cài. Có thể đặt `PLAYWRIGHT_EXECUTABLE_PATH` để chọn trình duyệt khác. Playwright tự mở server preview ở cổng `4322`; báo cáo được lưu trong `QA_REPORT_DIR`.

## Đưa lên GitHub Pages

Repository có sẵn [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. Vào repository trên GitHub → **Settings → Pages**.
2. Trong **Build and deployment**, chọn **Source: GitHub Actions**.
3. Đẩy thay đổi lên nhánh `main`, hoặc chạy workflow thủ công trong tab **Actions**.
4. Chờ job triển khai thành công rồi mở URL được hiển thị trong **Settings → Pages** hoặc kết quả workflow.

Với repository `siinn1706/portfolio`, cấu hình phát hành dùng:

```dotenv
SITE_URL=https://siinn1706.github.io
BASE_PATH=/portfolio/
RELEASE_BUILD=1
```

Workflow build và đưa thư mục `dist/` lên Pages. GitHub cấp sẵn địa chỉ `github.io`; không cần mua domain hoặc thêm file `CNAME`. Xem [hướng dẫn triển khai](docs/deployment.md) để build bản release ở máy, đổi đường dẫn hoặc khôi phục một phiên bản trước.

## Cấu trúc mã nguồn

```text
.github/workflows/   # Kiểm tra, build và triển khai GitHub Pages
src/
  assets/           # Font, ảnh cá nhân, ảnh dự án và sơ đồ
  components/       # Thành phần giao diện dùng lại
  content/          # Bài dự án và ghi chú bằng Markdown, chia vi/en
  data/             # Hồ sơ, dự án, nội dung và lựa chọn tài nguyên
  i18n/             # Bản dịch giao diện và đường dẫn ngôn ngữ
  layouts/          # Bố cục trang
  lib/              # Xử lý catalog, metadata và nội dung
  pages/            # Các trang Astro, sitemap và robots.txt
  scripts/          # Tương tác trên trình duyệt
  styles/           # Token màu, giao diện, bài đọc và chuyển động
public/             # Tệp tĩnh được sao chép vào bản build
scripts/            # Công cụ build và kiểm tra
tests/              # Kiểm thử dữ liệu, build và trình duyệt
docs/               # Tài liệu dự án
```

## Sửa nội dung

| Muốn thay đổi | File hoặc thư mục |
| --- | --- |
| Tên, giới thiệu, học vấn, liên hệ | [`src/data/profile.ts`](src/data/profile.ts) |
| Thông tin chung và lựa chọn dự án hiển thị | [`src/data/projects.ts`](src/data/projects.ts) |
| Bài dự án VI / EN | [`src/content/projects/`](src/content/projects/) |
| Ghi chú VI / EN | [`src/content/notes/`](src/content/notes/) và [`src/data/notes.ts`](src/data/notes.ts) |
| Nhãn giao diện | [`src/i18n/messages.ts`](src/i18n/messages.ts) |
| Chọn ảnh cá nhân | [`src/data/personal-media.ts`](src/data/personal-media.ts) |
| Màu sắc và kiểu chữ | [`src/styles/tokens.css`](src/styles/tokens.css) |

Giữ nội dung tiếng Việt và tiếng Anh tương ứng khi sửa bài. Xem [hướng dẫn biên tập](docs/content-authoring.md) để thêm dự án, ghi chú và tài nguyên. Chạy các bước kiểm tra ở trên trước khi push; workflow sẽ phát hành lại sau khi nhận thay đổi trên `main`.

Thông tin nguồn và giấy phép của font, ảnh dự án và biểu tượng: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
