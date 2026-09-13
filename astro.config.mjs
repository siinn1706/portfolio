import { defineConfig } from "astro/config";
import { pruneOutput } from "./scripts/prune-output.mjs";
import { fixtureSettings } from "./scripts/build-paths.mjs";
import { readingProcessor } from "./scripts/reading-markdown.mjs";
const { outDir } = fixtureSettings();

const site = process.env.SITE_URL;
const base = process.env.BASE_PATH || "/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw new Error(
    "BASE_PATH must be / or slash-delimited safe segments such as /portfolio/.",
  );
if (site) {
  const parsed = new URL(site);
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.pathname !== "/" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "SITE_URL must be an HTTP(S) origin; set BASE_PATH separately.",
    );
}
if (
  process.env.RELEASE_BUILD === "1" &&
  (!site ||
    new URL(site).protocol !== "https:" ||
    /localhost|127\.0\.0\.1|example\.(com|org|net)/.test(
      new URL(site).hostname,
    ))
)
  throw new Error("Release requires a real HTTPS SITE_URL.");

export default defineConfig({
  markdown: { processor: readingProcessor() },
  integrations: [
    {
      name: "selected-public-assets",
      hooks: {
        "astro:build:done": async ({ dir, logger }) => {
          const removed = await pruneOutput(dir);
          logger.info(`Removed ${removed} unreferenced generated assets.`);
        },
      },
    },
  ],
  ...(outDir ? { outDir } : {}),
  site,
  base,
  output: "static",
  trailingSlash: "always",
  build: { inlineStylesheets: "never" },
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
