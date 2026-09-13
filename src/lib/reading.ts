import type { Locale } from '../data/types';

/** Editorial estimate: English words / 220, Vietnamese space-separated units / 300. */
export function readingMinutes(body: string, locale: Locale): number {
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[|#*_`>~-]/g, ' ');
  return Math.max(1, Math.ceil((text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) / (locale === 'vi' ? 300 : 220)));
}
