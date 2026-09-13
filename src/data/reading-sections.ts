import type { Locale, Localized } from './types';

export interface ReadingSection {
  key: string;
  slugs: Localized<string>;
  inToc?: boolean;
  quick?: Localized<string>;
}
const section = (key: string, vi: string, en: string, extra: Partial<ReadingSection> = {}): ReadingSection =>
  ({ key, slugs: { vi, en }, ...extra });
const projectSections = [
  section('output', 'giao-diện-và-đầu-ra', 'interface-and-output'),
  section('about', 'về-dự-án', 'about-the-project'),
  section('contribution', 'phần-mình-đóng-góp', 'my-contribution', { quick: { vi: 'Phần mình làm', en: 'My contribution' } }),
  section('architecture', 'kiến-trúc-hệ-thống', 'system-architecture'),
  section('operation', 'cách-hệ-thống-hoạt-động', 'how-the-system-works'),
  section('decision', 'nhìn-lại-thiết-kế-từ-mã-nguồn', 'looking-back-at-the-design-through-source', { inToc: true, quick: { vi: 'Cách thiết kế', en: 'Design choices' } }),
  section('testing', 'kiểm-tra-thực-tế', 'testing'),
  section('verification', 'phạm-vi-đã-kiểm', 'verification-scope', { inToc: true, quick: { vi: 'Bằng chứng và giới hạn', en: 'Evidence and limits' } }),
  section('takeaway', 'điều-cần-giữ-khi-kiểm-lại', 'what-to-retain-when-checking-again'),
  section('gallery', 'project-evidence', 'project-evidence'),
];

// These are the existing Markdown renderer's IDs, never newly generated slugs.
// Only the current public article's verified pairs are serialized to its page.
export const readingSections: Record<string, ReadingSection[]> = {
  'project:healthos': [...projectSections,
    section('story', 'vậy-là-lưu-chưa', 'has-it-saved'),
    section('startup', 'đóng-gói-và-khởi-động-dịch-vụ', 'packaging-and-service-startup', { inToc: true }),
  ],
  'project:quan-ly-kho': [...projectSections,
    section('story', 'khi-nhập-lại-cùng-một-tệp', 'importing-the-same-file-twice'),
    section('stock-in', 'luồng-tạo-phiếu-nhập', 'creating-a-stock-in-voucher', { inToc: true }),
  ],
  'note:process-is-not-readiness': [
    section('question', 'câu-hỏi-từ-cấu-hình', 'a-question-from-configuration'),
    section('conditions', 'ba-điều-kiện-trả-lời-ba-câu-hỏi', 'three-conditions-three-questions'),
    section('healthcheck', 'health-check-kiểm-điều-gì', 'what-does-the-health-check-test'),
    section('after-startup', 'sau-khi-đã-khởi-động', 'after-startup'),
    section('experiment', 'một-phép-thử-có-phạm-vi-nhỏ', 'a-small-experiment'),
    section('references', 'note-references', 'note-references'),
  ],
};

export const figureFragment = (mediaId: string) => `figure-${mediaId}`;

export function resolveReadingSections(key: string, locale: Locale, ids: string[], counterpartIds: string[], mediaIds: string[] = []) {
  const counterpart: Locale = locale === 'vi' ? 'en' : 'vi';
  const entries = [ ...(readingSections[key] ?? []),
    ...mediaIds.map(id => section(`figure:${id}`, figureFragment(id), figureFragment(id))),
  ];
  return entries.filter(entry => ids.includes(entry.slugs[locale]) && counterpartIds.includes(entry.slugs[counterpart]));
}

export interface ReadingHeading { depth: number; slug: string; text: string }
export function readingToc(headings: ReadingHeading[], sections: ReadingSection[], locale: Locale) {
  const selected = new Set(sections.filter(s => s.inToc).map(s => s.slugs[locale]));
  const groups: (ReadingHeading & { children: ReadingHeading[] })[] = [];
  for (const heading of headings) {
    if (heading.depth === 2) groups.push({ ...heading, children: [] });
    else if (heading.depth === 3 && selected.has(heading.slug)) groups.at(-1)?.children.push(heading);
  }
  return groups;
}
