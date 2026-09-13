import healthos from '../assets/share/healthos.png?url';
import warehouse from '../assets/share/quan-ly-kho.png?url';
import selection from './share-media.json';
import type { Locale } from './types';

const sources: Record<string, string> = { 'healthos.png': healthos, 'quan-ly-kho.png': warehouse };
export function getShareMedia(projectId: string, locale: Locale) {
  const record = selection.find(item => item.projectId === projectId);
  if (!record) return undefined;
  const src = sources[record.source];
  if (!src) throw new Error(`Missing selected share image: ${record.source}`);
  return { src, width: record.width, height: record.height, alt: record.alt[locale], projectId };
}
