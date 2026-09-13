import type { ContentRelation } from "./types";

// One authored edge supplies both directions after publication filtering.
export const relations: ContentRelation[] = [
  {
    from: { kind: "project", id: "healthos" },
    to: { kind: "note", id: "process-is-not-readiness" },
    reason: {
      vi: "Ghi chép đọc lại các điều kiện khởi động trong cấu hình HealthOS; chưa phải phép kiểm runtime.",
      en: "A source-reading note about HealthOS startup conditions; it is not a runtime check.",
    },
  },
];
