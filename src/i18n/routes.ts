import { locales, type Locale } from "../data/types";
import type { PublicCatalog } from "../lib/catalog";
export type PageKey =
  "home" | "work" | "project" | "about" | "notes" | "note" | "photography";
export function normalizeBase(base = "/") {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
    throw new Error("Invalid base path");
  return base;
}
export function route(
  locale: Locale,
  key: PageKey = "home",
  slug?: string,
  base = "/",
  anchor?: string,
): string {
  if (!locales.includes(locale))
    throw new Error(`Unsupported locale: ${locale}`);
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("Unsafe route slug");
  if ((key === "project" || key === "note") && !slug)
    throw new Error("Entry route requires slug");
  const path =
    key === "home"
      ? ""
      : key === "project"
        ? `work/${slug}/`
        : key === "note"
          ? `notes/${slug}/`
          : `${key}/`;
  return `${normalizeBase(base)}${locale}/${path}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}
export function assetUrl(path: string, base = "/") {
  normalizeBase(base);
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith(base)) return path;
  return `${base}${path.replace(/^\//, "")}`;
}
export function catalogRoutes(catalog: PublicCatalog, base = "/") {
  return locales.flatMap((locale) => [
    {
      locale,
      key: "home" as const,
      url: route(locale, "home", undefined, base),
    },
    {
      locale,
      key: "work" as const,
      url: route(locale, "work", undefined, base),
    },
    {
      locale,
      key: "about" as const,
      url: route(locale, "about", undefined, base),
    },
    ...catalog.projects.map((p) => ({
      locale,
      key: "project" as const,
      entryId: p.projectId,
      url: route(locale, "project", p.routeSlug, base),
    })),
    ...(catalog.notes.length
      ? [
          {
            locale,
            key: "notes" as const,
            url: route(locale, "notes", undefined, base),
          },
          ...catalog.notes.map((n) => ({
            locale,
            key: "note" as const,
            entryId: n.noteId,
            url: route(locale, "note", n.routeSlug, base),
          })),
        ]
      : []),
    ...(catalog.photos.length
      ? [
          {
            locale,
            key: "photography" as const,
            url: route(locale, "photography", undefined, base),
          },
        ]
      : []),
  ]);
}
