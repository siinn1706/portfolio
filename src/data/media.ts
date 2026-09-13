import type { ImageMetadata } from "astro";
import capture0w640 from "../assets/projects/healthos-home-640.webp";
import capture0w960 from "../assets/projects/healthos-home-960.webp";
import capture0w1440 from "../assets/projects/healthos-home-1440.webp";
import capture0Full from "../assets/projects/healthos-home.png?url";
import capture1w640 from "../assets/projects/healthos-services-640.webp";
import capture1w960 from "../assets/projects/healthos-services-960.webp";
import capture1w1440 from "../assets/projects/healthos-services-1440.webp";
import capture1Full from "../assets/projects/healthos-services.png?url";
import capture2w640 from "../assets/projects/warehouse-dashboard-640.webp";
import capture2w960 from "../assets/projects/warehouse-dashboard-960.webp";
import capture2w1440 from "../assets/projects/warehouse-dashboard-1440.webp";
import capture2Full from "../assets/projects/warehouse-dashboard.png?url";
import capture3w640 from "../assets/projects/warehouse-items-640.webp";
import capture3w960 from "../assets/projects/warehouse-items-960.webp";
import capture3w1440 from "../assets/projects/warehouse-items-1440.webp";
import capture3Full from "../assets/projects/warehouse-items.png?url";
import diagram0viw640 from "../assets/diagrams/healthos-system-vi-640.webp";
import diagram0viw960 from "../assets/diagrams/healthos-system-vi-960.webp";
import diagram0viw1600 from "../assets/diagrams/healthos-system-vi-1600.webp";
import diagram0viFull from "../assets/diagrams/healthos-system-vi.svg?url";
import diagram0enw640 from "../assets/diagrams/healthos-system-en-640.webp";
import diagram0enw960 from "../assets/diagrams/healthos-system-en-960.webp";
import diagram0enw1600 from "../assets/diagrams/healthos-system-en-1600.webp";
import diagram0enFull from "../assets/diagrams/healthos-system-en.svg?url";
import diagram1viw640 from "../assets/diagrams/healthos-infrastructure-vi-640.webp";
import diagram1viw960 from "../assets/diagrams/healthos-infrastructure-vi-960.webp";
import diagram1viw1600 from "../assets/diagrams/healthos-infrastructure-vi-1600.webp";
import diagram1viFull from "../assets/diagrams/healthos-infrastructure-vi.svg?url";
import diagram1enw640 from "../assets/diagrams/healthos-infrastructure-en-640.webp";
import diagram1enw960 from "../assets/diagrams/healthos-infrastructure-en-960.webp";
import diagram1enw1600 from "../assets/diagrams/healthos-infrastructure-en-1600.webp";
import diagram1enFull from "../assets/diagrams/healthos-infrastructure-en.svg?url";
import diagram2viw640 from "../assets/diagrams/warehouse-system-vi-640.webp";
import diagram2viw960 from "../assets/diagrams/warehouse-system-vi-960.webp";
import diagram2viw1600 from "../assets/diagrams/warehouse-system-vi-1600.webp";
import diagram2viFull from "../assets/diagrams/warehouse-system-vi.svg?url";
import diagram2enw640 from "../assets/diagrams/warehouse-system-en-640.webp";
import diagram2enw960 from "../assets/diagrams/warehouse-system-en-960.webp";
import diagram2enw1600 from "../assets/diagrams/warehouse-system-en-1600.webp";
import diagram2enFull from "../assets/diagrams/warehouse-system-en.svg?url";
import diagram3viw640 from "../assets/diagrams/warehouse-stock-in-vi-640.webp";
import diagram3viw960 from "../assets/diagrams/warehouse-stock-in-vi-960.webp";
import diagram3viw1600 from "../assets/diagrams/warehouse-stock-in-vi-1600.webp";
import diagram3viFull from "../assets/diagrams/warehouse-stock-in-vi.svg?url";
import diagram3enw640 from "../assets/diagrams/warehouse-stock-in-en-640.webp";
import diagram3enw960 from "../assets/diagrams/warehouse-stock-in-en-960.webp";
import diagram3enw1600 from "../assets/diagrams/warehouse-stock-in-en-1600.webp";
import diagram3enFull from "../assets/diagrams/warehouse-stock-in-en.svg?url";

// Public metadata only. Authoring/source hashes live in the research ledger.
export type MediaLocale = "vi" | "en";
export type MediaKind = "runtime-capture" | "source" | "configuration";
interface MediaVariant {
  image: ImageMetadata;
  sources: ImageMetadata[];
  full: string;
}
interface MediaRecord {
  kind: MediaKind;
  variants: Record<MediaLocale, MediaVariant>;
  alt: Record<MediaLocale, string>;
  caption: Record<MediaLocale, string>;
  source: string;
  commit: string;
  scope: Record<MediaLocale, string>;
}
export interface LocalizedMedia extends MediaVariant {
  mediaId: string;
  kind: MediaKind;
  width: number;
  height: number;
  alt: string;
  caption: string;
  source: string;
  commit: string;
  scope: string;
}

export const mediaIds = [
  "healthos-home",
  "healthos-services",
  "warehouse-dashboard",
  "warehouse-items",
  "healthos-system",
  "healthos-infrastructure",
  "warehouse-system",
  "warehouse-stock-in",
] as const;
export type MediaId = (typeof mediaIds)[number];
const mediaRegistry = {
  "healthos-home": {
    kind: "runtime-capture",
    variants: {
      vi: {
        image: capture0w960,
        sources: [capture0w640, capture0w960, capture0w1440],
        full: capture0Full,
      },
      en: {
        image: capture0w960,
        sources: [capture0w640, capture0w960, capture0w1440],
        full: capture0Full,
      },
    },
    alt: {
      vi: "Trang chủ HealthOS trên desktop, với phần giới thiệu và minh họa robot.",
      en: "HealthOS desktop homepage with an introduction and robot illustration.",
    },
    caption: {
      vi: "Trang chủ HealthOS từ bản chạy cục bộ. Giao diện có dữ liệu minh họa.",
      en: "HealthOS homepage from a local run. The interface contains sample data.",
    },
    source:
      "https://github.com/siinn1706/NT208_HealthOS/tree/5131987c953d800e1c343cc7156be7554e4e498f",
    commit: "5131987c953d800e1c343cc7156be7554e4e498f",
    scope: {
      vi: "Giao diện public chạy cục bộ; chưa kiểm chứng backend, worker, AI hoặc Compose trong lượt chụp.",
      en: "Public frontend running locally; backend, workers, AI and Compose were not verified in this capture.",
    },
  },
  "healthos-services": {
    kind: "runtime-capture",
    variants: {
      vi: {
        image: capture1w960,
        sources: [capture1w640, capture1w960, capture1w1440],
        full: capture1Full,
      },
      en: {
        image: capture1w960,
        sources: [capture1w640, capture1w960, capture1w1440],
        full: capture1Full,
      },
    },
    alt: {
      vi: "Nhóm dịch vụ và các thẻ tính năng trên trang dịch vụ HealthOS.",
      en: "Service categories and feature cards on the HealthOS services page.",
    },
    caption: {
      vi: "Trang dịch vụ HealthOS, hiển thị nhóm tính năng cốt lõi.",
      en: "HealthOS services page showing the core features.",
    },
    source:
      "https://github.com/siinn1706/NT208_HealthOS/tree/5131987c953d800e1c343cc7156be7554e4e498f",
    commit: "5131987c953d800e1c343cc7156be7554e4e498f",
    scope: {
      vi: "Giao diện public chạy cục bộ; chưa kiểm chứng backend, worker, AI hoặc Compose trong lượt chụp.",
      en: "Public frontend running locally; backend, workers, AI and Compose were not verified in this capture.",
    },
  },
  "warehouse-dashboard": {
    kind: "runtime-capture",
    variants: {
      vi: {
        image: capture2w960,
        sources: [capture2w640, capture2w960, capture2w1440],
        full: capture2Full,
      },
      en: {
        image: capture2w960,
        sources: [capture2w640, capture2w960, capture2w1440],
        full: capture2Full,
      },
    },
    alt: {
      vi: "Dashboard quản lý kho với sidebar điều hướng và các chỉ số ở trạng thái trống.",
      en: "Inventory dashboard with sidebar navigation and empty-state figures.",
    },
    caption: {
      vi: "Tổng quan kho, chạy cục bộ bằng tài khoản demo với dữ liệu trống.",
      en: "Warehouse overview, running locally with a demo account and an empty dataset.",
    },
    source:
      "https://github.com/siinn1706/NT106_QuanLyKho/tree/7499d982e49b1b64c5848d568019c33a82467bbc",
    commit: "7499d982e49b1b64c5848d568019c33a82467bbc",
    scope: {
      vi: "Trình duyệt và API chạy cục bộ với tài khoản demo, dữ liệu trống. Số 0/N/A là trạng thái giao diện; chưa thử nghiệp vụ ghi dữ liệu hoặc đồng bộ nhiều người dùng.",
      en: "Browser and API running locally with a demo account and an empty dataset. The 0/N/A figures are interface states; write operations and multi-client synchronization were not exercised.",
    },
  },
  "warehouse-items": {
    kind: "runtime-capture",
    variants: {
      vi: {
        image: capture3w960,
        sources: [capture3w640, capture3w960, capture3w1440],
        full: capture3Full,
      },
      en: {
        image: capture3w960,
        sources: [capture3w640, capture3w960, capture3w1440],
        full: capture3Full,
      },
    },
    alt: {
      vi: "Trang hàng hóa của ứng dụng quản lý kho, hiển thị bộ lọc và danh sách trống.",
      en: "Inventory application’s items page with filters and an empty list.",
    },
    caption: {
      vi: "Danh sách hàng hóa và bộ lọc, chưa có dữ liệu.",
      en: "Item list and filters with no data added.",
    },
    source:
      "https://github.com/siinn1706/NT106_QuanLyKho/tree/7499d982e49b1b64c5848d568019c33a82467bbc",
    commit: "7499d982e49b1b64c5848d568019c33a82467bbc",
    scope: {
      vi: "Trình duyệt và API chạy cục bộ với tài khoản demo, dữ liệu trống. Số 0/N/A là trạng thái giao diện; chưa thử nghiệp vụ ghi dữ liệu hoặc đồng bộ nhiều người dùng.",
      en: "Browser and API running locally with a demo account and an empty dataset. The 0/N/A figures are interface states; write operations and multi-client synchronization were not exercised.",
    },
  },
  "healthos-system": {
    kind: "source",
    variants: {
      vi: {
        image: diagram0viw960,
        sources: [diagram0viw640, diagram0viw960, diagram0viw1600],
        full: diagram0viFull,
      },
      en: {
        image: diagram0enw960,
        sources: [diagram0enw640, diagram0enw960, diagram0enw1600],
        full: diagram0enFull,
      },
    },
    alt: {
      vi: "Next.js và BFF kết nối tới Core API. Core dùng PostgreSQL, Redis và MinIO; Celery xử lý tác vụ phân tích ảnh qua dịch vụ AI. Chat có luồng SSE riêng.",
      en: "Next.js and the BFF connect to the Core API, which uses PostgreSQL, Redis and MinIO. Celery sends image-analysis tasks to the AI service. Chat uses a separate SSE stream.",
    },
    caption: {
      vi: "Sơ đồ dựng lại từ mã nguồn HealthOS tại commit 5131987. Backend và các luồng AI chưa được chạy kiểm chứng trong lượt đối chiếu này.",
      en: "Reconstructed from HealthOS source at commit 5131987. Backend and AI flows were not validated at runtime in this review.",
    },
    source:
      "https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/frontend/src/lib/core-api-proxy.ts#L280-L331",
    commit: "5131987c953d800e1c343cc7156be7554e4e498f",
    scope: {
      vi: "Nét liền: luồng gọi hoặc dữ liệu trong mã nguồn. Nét đứt: tích hợp bên ngoài phụ thuộc cấu hình.",
      en: "Solid lines: calls or data paths found in source. Dashed lines: external integrations that depend on configuration.",
    },
  },
  "healthos-infrastructure": {
    kind: "configuration",
    variants: {
      vi: {
        image: diagram1viw960,
        sources: [diagram1viw640, diagram1viw960, diagram1viw1600],
        full: diagram1viFull,
      },
      en: {
        image: diagram1enw960,
        sources: [diagram1enw640, diagram1enw960, diagram1enw1600],
        full: diagram1enFull,
      },
    },
    alt: {
      vi: "Các dịch vụ frontend, Core API, worker và AI cùng PostgreSQL, Redis, MinIO trong mạng Compose. Tác vụ khởi tạo, migration và health check điều phối thứ tự khởi động.",
      en: "Frontend, Core API, worker and AI services share a Compose network with PostgreSQL, Redis and MinIO. Initialization, migration and health checks coordinate startup.",
    },
    caption: {
      vi: "Cấu hình Docker Compose và các điều kiện khởi động trong mã nguồn HealthOS. Sơ đồ không biểu thị một môi trường production đã được kiểm chứng.",
      en: "Docker Compose configuration and startup conditions from the HealthOS source. The diagram does not represent a validated production environment.",
    },
    source:
      "https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml#L2-L118",
    commit: "5131987c953d800e1c343cc7156be7554e4e498f",
    scope: {
      vi: "Nét liền: lời gọi hoặc dữ liệu. Nét đứt: điều kiện khởi tạo và sẵn sàng. Các volume lưu dữ liệu của từng dịch vụ.",
      en: "Solid lines: calls or data paths. Dashed lines: initialization and readiness conditions. Volumes hold the corresponding services’ data.",
    },
  },
  "warehouse-system": {
    kind: "source",
    variants: {
      vi: {
        image: diagram2viw960,
        sources: [diagram2viw640, diagram2viw960, diagram2viw1600],
        full: diagram2viFull,
      },
      en: {
        image: diagram2enw960,
        sources: [diagram2enw640, diagram2enw960, diagram2enw1600],
        full: diagram2enFull,
      },
    },
    alt: {
      vi: "Giao diện React kết nối HTTP và WebSocket tới một ứng dụng FastAPI, lưu dữ liệu bằng SQLAlchemy và SQLite. Tauri là cách đóng gói desktop; SMTP và Gemini là tích hợp tùy chọn.",
      en: "The React interface connects over HTTP and WebSocket to one FastAPI application, with SQLAlchemy and SQLite for storage. Tauri provides desktop packaging; SMTP and Gemini are optional integrations.",
    },
    caption: {
      vi: "Sơ đồ từ mã nguồn tại commit 7499d98. Bản web cùng FastAPI và SQLite đã chạy cục bộ; Tauri, SMTP và Gemini chưa được kiểm tra.",
      en: "Source view at commit 7499d98. The web app, FastAPI and SQLite were run locally; Tauri, SMTP and Gemini were not tested.",
    },
    source:
      "https://github.com/siinn1706/NT106_QuanLyKho/blob/7499d982e49b1b64c5848d568019c33a82467bbc/UI_Desktop/src/App.tsx#L18-L45",
    commit: "7499d982e49b1b64c5848d568019c33a82467bbc",
    scope: {
      vi: "Các module backend nằm trong cùng ứng dụng FastAPI. Nét đứt thể hiện cách chạy hoặc tích hợp tùy chọn.",
      en: "Backend modules belong to the same FastAPI application. Dashed lines indicate an alternative host or optional integration.",
    },
  },
  "warehouse-stock-in": {
    kind: "source",
    variants: {
      vi: {
        image: diagram3viw960,
        sources: [diagram3viw640, diagram3viw960, diagram3viw1600],
        full: diagram3viFull,
      },
      en: {
        image: diagram3enw960,
        sources: [diagram3enw640, diagram3enw960, diagram3enw1600],
        full: diagram3enFull,
      },
    },
    alt: {
      vi: "Giao diện gửi phiếu nhập tới API. Backend cập nhật hàng hóa và lưu phiếu trước khi gửi sự kiện WebSocket. Trang gửi phiếu dùng phản hồi HTTP; trang Hàng hóa tải lại dữ liệu khi nhận sự kiện.",
      en: "The interface submits a stock-in voucher to the API. The backend updates items and saves the voucher before sending a WebSocket event. The submitting page uses the HTTP response; the Items page reloads data on the event.",
    },
    caption: {
      vi: "Luồng phiếu nhập được dựng lại từ mã nguồn: lưu dữ liệu trước, phát thông báo sau. Lượt chụp giao diện chưa thực hiện thao tác tạo phiếu.",
      en: "Stock-in flow reconstructed from source: persist the data, then send the update. Voucher creation was not exercised during the interface capture.",
    },
    source:
      "https://github.com/siinn1706/NT106_QuanLyKho/blob/7499d982e49b1b64c5848d568019c33a82467bbc/UI_Desktop/src/features/stock/Stock_In_Page.tsx#L227-L281",
    commit: "7499d982e49b1b64c5848d568019c33a82467bbc",
    scope: {
      vi: "Commit diễn ra trước thông báo. Phản hồi HTTP và việc tải lại ở trình duyệt khác là hai đường riêng, không có thứ tự đến cố định.",
      en: "Commit precedes notification. The HTTP response and a reload in another browser follow separate paths, with no fixed arrival order.",
    },
  },
} satisfies Record<MediaId, MediaRecord>;

export function getMedia(id: string, locale: MediaLocale): LocalizedMedia {
  if (!Object.prototype.hasOwnProperty.call(mediaRegistry, id))
    throw new Error(`Unknown media ID: ${id}`);
  if (locale !== "vi" && locale !== "en")
    throw new Error(`Unknown media locale: ${locale}`);
  const asset = mediaRegistry[id as MediaId];
  const variant = asset.variants[locale];
  return {
    mediaId: id,
    kind: asset.kind,
    ...variant,
    width: variant.image.width,
    height: variant.image.height,
    alt: asset.alt[locale],
    caption: asset.caption[locale],
    source: asset.source,
    commit: asset.commit,
    scope: asset.scope[locale],
  };
}
