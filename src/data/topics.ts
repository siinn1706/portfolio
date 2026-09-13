import type { Topic } from "./types";

export const topics: Topic[] = [
  {
    topicId: "application-development",
    labels: { vi: "Giao diện & phối hợp backend", en: "Interfaces & backend collaboration" },
    description: {
      vi: "Mình phát triển giao diện và cùng xây dựng backend trong các dự án ứng dụng.",
      en: "I develop interfaces and collaborate on the backend in application projects.",
    },
    category: "foundation",
    status: "applied-with-evidence",
    evidenceRef: {
      target: { kind: "project", id: "healthos" },
      fragment: { vi: "phần-mình-đóng-góp", en: "my-contribution" },
      label: { vi: "Phần mình đóng góp trong HealthOS", en: "My contribution to HealthOS" },
    },
  },
  {
    topicId: "networking-systems",
    labels: {
      vi: "Mạng máy tính & Hệ thống",
      en: "Networking & Systems",
    },
    description: {
      vi: "Mình đang tìm hiểu mạng máy tính, hệ thống và Linux.",
      en: "I’m learning about networking, systems and Linux.",
    },
    category: "foundation",
    status: "interest",
  },
  {
    topicId: "cloud-automation",
    labels: {
      vi: "Cloud & Tự động hóa",
      en: "Cloud & Automation",
    },
    description: {
      vi: "Mình quan tâm đến containers, CI/CD và tự động hóa hạ tầng.",
      en: "I’m interested in containers, CI/CD and infrastructure automation.",
    },
    category: "direction",
    status: "interest",
  },
  {
    topicId: "operations",
    labels: {
      vi: "Vận hành hệ thống",
      en: "System Operations",
    },
    description: {
      vi: "Mình muốn hiểu thêm về giám sát, observability và bảo mật hệ thống.",
      en: "I want to learn more about monitoring, observability and system security.",
    },
    category: "direction",
    status: "interest",
  },
  {
    topicId: "design-tools",
    labels: {
      vi: "Figma · Illustrator · Photoshop",
      en: "Figma · Illustrator · Photoshop",
    },
    description: {
      vi: "Những công cụ thiết kế mình biết sử dụng.",
      en: "Design tools I know how to use.",
    },
    category: "tools",
    status: "self-reported",
  },
  {
    topicId: "docker",
    labels: {
      vi: "Docker",
      en: "Docker",
    },
    description: {
      vi: "Mình biết sử dụng Docker.",
      en: "I know how to use Docker.",
    },
    category: "tools",
    status: "self-reported",
  },
  {
    topicId: "agentic-ai-aiops",
    labels: {
      vi: "Agentic AI & AIOps",
      en: "Agentic AI & AIOps",
    },
    description: {
      vi: "Mình đang tìm hiểu cách AI có thể hỗ trợ DevOps và vận hành hạ tầng.",
      en: "I’m exploring how AI can support DevOps and infrastructure operations.",
    },
    category: "exploration",
    status: "interest",
  },
];
