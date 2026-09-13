import type { APIRoute } from "astro";
import { getPublicCatalog } from "../lib/get-public-catalog";
import { catalogRoutes } from "../i18n/routes";
export const GET: APIRoute = async ({ site }) => {
  const routes = catalogRoutes(
    await getPublicCatalog(),
    import.meta.env.BASE_URL,
  );
  const urls = site
    ? routes
        .map((r) => `<url><loc>${new URL(r.url, site).href}</loc></url>`)
        .join("")
    : "";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
