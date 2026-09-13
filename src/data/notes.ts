import type { Localized, NoteFacts } from "./types";

// Labels describe the linked document or section; unknown sources keep their URL.
export const noteSourceLabels: Record<string, Localized<string>> = {
  "https://docs.docker.com/compose/how-tos/startup-order/": {
    vi: "Docker Docs — Thứ tự khởi động và dừng trong Compose",
    en: "Docker Docs — Control startup and shutdown order in Compose",
  },
  "https://docs.docker.com/reference/compose-file/services/#depends_on": {
    vi: "Docker Docs — Tham chiếu depends_on trong Compose",
    en: "Docker Docs — Compose depends_on reference",
  },
  "https://docs.docker.com/reference/dockerfile/#healthcheck": {
    vi: "Docker Docs — Tham chiếu HEALTHCHECK trong Dockerfile",
    en: "Docker Docs — Dockerfile HEALTHCHECK reference",
  },
  "https://docs.docker.com/engine/containers/start-containers-automatically/": {
    vi: "Docker Docs — Tự động khởi động container và chính sách restart",
    en: "Docker Docs — Start containers automatically and restart policies",
  },
  "https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml": {
    vi: "HealthOS — Cấu hình Compose production tại commit 5131987",
    en: "HealthOS — Production Compose configuration at commit 5131987",
  },
};

export const notes: NoteFacts[] = [
  {
    noteId: "process-is-not-readiness",
    routeSlug: "process-is-not-readiness",
    topicIds: ["docker", "cloud-automation"],
    sources: [
      "https://docs.docker.com/compose/how-tos/startup-order/",
      "https://docs.docker.com/reference/compose-file/services/#depends_on",
      "https://docs.docker.com/reference/dockerfile/#healthcheck",
      "https://docs.docker.com/engine/containers/start-containers-automatically/",
      "https://github.com/siinn1706/NT208_HealthOS/blob/5131987c953d800e1c343cc7156be7554e4e498f/infra/docker/docker-compose.prod.yml",
    ],
    publication: { publishIntent: "publish", publicSelected: true },
  },
];
