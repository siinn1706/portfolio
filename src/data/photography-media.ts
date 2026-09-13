import type { ImageMetadata } from "astro";
import type { Locale } from "./types";

export interface PhotoMedia {
  image: ImageMetadata;
  sources: ImageMetadata[];
  full: ImageMetadata;
}

// Only static imports for photographs selected by Nam belong in this registry.
// Photography is deferred; an empty registry leaves its route and links absent.
export const photoMediaRegistry: Record<string, PhotoMedia> = {};
export const photoMediaIds = Object.keys(photoMediaRegistry);

export function getPhotoMedia(id: string, _locale: Locale): PhotoMedia {
  const record = photoMediaRegistry[id];
  if (!record) throw new Error(`Missing declared photography media ${id}`);
  const ratio = record.full.width / record.full.height;
  for (const image of [record.image, ...record.sources]) {
    if (Math.abs(image.width / image.height - ratio) > 0.01) throw new Error(`Photography media ${id} must preserve the full canvas`);
  }
  return record;
}
