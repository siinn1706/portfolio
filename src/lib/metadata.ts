import { route, type PageKey } from "../i18n/routes";
import type { Locale } from "../data/types";
export function metadataUrls(
  locale: Locale,
  key: PageKey,
  slug: string | undefined,
  base: string,
  site?: URL,
) {
  const url = (l: Locale) => {
    const path = route(l, key, slug, base);
    return site ? new URL(path, site).href : path;
  };
  return {
    canonical: url(locale),
    alternates: [
      { locale: "vi", url: url("vi") },
      { locale: "en", url: url("en") },
    ],
  };
}
