# Chạy và phát hành trên GitHub Pages

- Repository: [siinn1706/portfolio](https://github.com/siinn1706/portfolio)
- Website: [siinn1706.github.io/portfolio](https://siinn1706.github.io/portfolio/)
- Platform: GitHub Pages, build bằng GitHub Actions.
- Source: nhánh `main`; artifact phát hành: thư mục `dist/`.

## Chạy cục bộ

Cài Node.js theo `.node-version` (24.19.0) và npm, rồi chạy:

```sh
npm ci
npm run dev
```

Mở <http://localhost:4321>. `npm run build` tạo `dist/`; `npm run preview` xem bản build tại cùng cổng. Không cần Docker, database hoặc API key.

## Cấu hình build

| Biến | Ý nghĩa | Giá trị của website này |
| --- | --- | --- |
| `SITE_URL` | HTTPS origin, không gồm tên repository | `https://siinn1706.github.io` |
| `BASE_PATH` | Đường dẫn bắt đầu và kết thúc bằng `/` | `/portfolio/` |
| `RELEASE_BUILD` | `1` để yêu cầu origin HTTPS thật | `1` |
| `QA_REPORT_DIR` | Thư mục ghi kết quả kiểm tra, được Git bỏ qua | `.qa/release` |

Workflow đọc origin/base path từ GitHub Pages, vì vậy không cần tạo repository secrets hoặc tự điền các biến trên GitHub. Khi chạy local với cấu hình mặc định, site dùng `noindex`, canonical tương đối và sitemap rỗng. Đặt `SITE_URL` sẽ bật metadata public; `RELEASE_BUILD=1` bổ sung kiểm tra origin.

Build thử đúng đường dẫn GitHub Pages trên PowerShell:

```powershell
$env:SITE_URL = 'https://siinn1706.github.io'
$env:BASE_PATH = '/portfolio/'
$env:RELEASE_BUILD = '1'
$env:QA_REPORT_DIR = '.qa/release'
npm run check
npm run test:content
npx playwright install chromium
npm run test:templates
npm run build
npm run verify:output
npm run preview
```

Mở <http://localhost:4321/portfolio/>. Với Bash, đặt cùng biến bằng `export NAME=value` trước các lệnh npm. Để quay lại preview mặc định, mở terminal mới hoặc bỏ các biến `SITE_URL`, `BASE_PATH`, `RELEASE_BUILD`.

## Tự động public

1. Trong repository, mở **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Push code lên `main` hoặc chọn **Actions → Deploy to GitHub Pages → Run workflow**.
3. Workflow cài dependencies từ lockfile, kiểm tra kiểu/nội dung/template, build, kiểm tra output và chạy browser smoke tests trước khi deploy.
4. Xem kết quả ở **Actions** và URL ở environment **github-pages**.

```sh
git add src public scripts tests docs README.md
git commit -m "Update portfolio"
git push origin main
```

File triển khai là [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). GitHub cấp `GITHUB_TOKEN` và OIDC cho workflow; không cần lưu personal access token. Website dùng domain `github.io`, nên không cần `CNAME`. Nếu đổi tên repository, URL/base path trong workflow sẽ theo cấu hình Pages; cập nhật các link trong README và tài liệu này tương ứng.

## Kiểm tra trình duyệt

Sau khi build và verify thành công:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright tự mở preview tại cổng 4322 và dùng Chrome/Edge cài sẵn trên Windows nếu có; có thể chọn executable bằng `PLAYWRIGHT_EXECUTABLE_PATH`. Khi kiểm tra bản `/portfolio/`, giữ cùng `BASE_PATH` đã dùng để build. Report mặc định nằm trong `.qa/local/`, hoặc `QA_REPORT_DIR` đã chỉ định. `npm run measure` là phép đo local bổ sung, không phải số đo trải nghiệm người dùng ngoài thực tế.

## Phạm vi source và website

Repository chứa source Astro/TypeScript/CSS/Markdown, tài nguyên đã chọn, tests, scripts chạy độc lập và tài liệu. `.gitignore` loại nghiên cứu nội bộ, ảnh nguồn chưa chọn, cache, dữ liệu trình duyệt, `.env` và thư mục sinh tự động. Website chỉ nhận `dist/`, không nhận source, tài liệu hay tests. Giữ các thông báo bản quyền trong [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) và `public/`.

Không đặt `CONTENT_FIXTURE_DIR` hoặc `OUT_DIR` khi release; các fixture dùng output riêng trong `tests/.output/`. `BASE_PATH` cần giữ dấu `/` cuối để asset, chuyển ngôn ngữ và các liên kết sâu cùng trỏ đúng nơi.

## Kiểm tra sau deploy và rollback

Kiểm tra trực tiếp Home VI/EN, Work, About, cả hai case và Notes; chuyển ngôn ngữ, mở ảnh gốc, thử contact và một URL không tồn tại. URL không tồn tại phải trả HTTP 404. Kiểm tra canonical, hreflang, sitemap và ảnh chia sẻ đều trỏ tới origin/base path public.

Nếu cần quay về phiên bản trước, dùng `git revert <commit-gay-loi>` rồi push lên `main`; workflow sẽ build lại phiên bản đã khôi phục. Chỉ deploy khi toàn bộ job build đạt; khi build thất bại, website đang chạy được giữ nguyên.

Tham khảo chính thức: [Astro trên GitHub Pages](https://docs.astro.build/en/guides/deploy/github/) và [workflow GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
