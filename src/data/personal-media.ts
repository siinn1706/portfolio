import type { ImageMetadata } from 'astro';
import type { Locale } from './types';
import avatar48 from '../assets/personal/nam-avatar-48.webp';
import avatar96 from '../assets/personal/nam-avatar-96.webp';
import avatar144 from '../assets/personal/nam-avatar-144.webp';
import candid320 from '../assets/personal/nam-candid-320.webp';
import candid480 from '../assets/personal/nam-candid-480.webp';
import candid640 from '../assets/personal/nam-candid-640.webp';
import candid960 from '../assets/personal/nam-candid-960.webp';
import sticker240 from '../assets/personal/nam-sticker-240.webp';
import sticker480 from '../assets/personal/nam-sticker-480.webp';
import sticker720 from '../assets/personal/nam-sticker-720.webp';

export type PersonalMediaSlot = 'avatar' | 'homePortrait' | 'aboutPortrait';
export interface PersonalMediaSelection {
  avatar: 'nam-avatar' | null;
  homePortrait: 'nam-sticker' | null;
  aboutPortrait: 'nam-candid' | null;
}
interface PersonalMediaRecord {
  role: 'avatar' | 'portrait' | 'sticker';
  allowedSlots: readonly PersonalMediaSlot[];
  image: ImageMetadata;
  sources: ImageMetadata[];
  alt: Record<Locale, string>;
}

// This selection owns personal portraits. Profile.portraitMediaId remains unused/null.
// To use avt_2 instead, re-export its small avatar derivatives; never use it in a portrait slot.
export const personalMediaSelection: PersonalMediaSelection = {
  avatar: 'nam-avatar',
  homePortrait: 'nam-sticker',
  aboutPortrait: 'nam-candid',
};

const personalMediaRegistry: Record<string, PersonalMediaRecord> = {
  'nam-avatar': {
    role: 'avatar', allowedSlots: ['avatar'], image: avatar96,
    sources: [avatar48, avatar96, avatar144], alt: { vi: '', en: '' },
  },
  'nam-candid': {
    role: 'portrait', allowedSlots: ['aboutPortrait'], image: candid640,
    sources: [candid320, candid480, candid640, candid960],
    alt: {
      vi: 'Nam đứng trong không gian trưng bày, nhìn sang bên trái.',
      en: 'Nam standing in an exhibition space, looking to the left.',
    },
  },
  'nam-sticker': {
    role: 'sticker', allowedSlots: ['homePortrait'], image: sticker480,
    sources: [sticker240, sticker480, sticker720],
    alt: {
      vi: 'Nam mặc áo xanh, tạo dáng với hai bàn tay.',
      en: 'Nam wearing a blue shirt and posing with both hands.',
    },
  },
};

export function getPersonalMedia(slot: PersonalMediaSlot, locale: Locale) {
  const mediaId = personalMediaSelection[slot];
  if (mediaId === null) return null;
  const media = personalMediaRegistry[mediaId];
  if (!media || !media.allowedSlots.includes(slot))
    throw new Error(`Invalid personal media selection: ${String(mediaId)} is not allowed in ${slot}`);
  return { mediaId, role: media.role, image: media.image, sources: media.sources,
    width: media.image.width, height: media.image.height, alt: media.alt[locale] };
}
