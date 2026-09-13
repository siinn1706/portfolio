import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { analyzeOutputGraph, selectMetadataImages } from "./output-graph.mjs";
import sharp from "sharp";

const root = path.resolve(process.env.OUTPUT_DIR || "dist");
const base = process.env.BASE_PATH || "/";
const reportDirectory = path.resolve(
  process.env.QA_REPORT_DIR ||
    ".qa/local",
);
const problems = [];
const insist = (condition, message) => {
  if (!condition) problems.push(message);
};
const walk = async (directory) =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map(async (item) => {
        const absolute = path.join(directory, item.name);
        return item.isDirectory()
          ? walk(absolute)
          : [path.relative(root, absolute).replaceAll("\\", "/")];
      }),
    )
  ).flat();
const files = (await walk(root)).sort();
const inventory = new Set(files);
const source = new Map();
const outputBytes = new Map();
const html = new Map();
let cssGzip = 0,
  fontBytes = 0;
const fingerprint = createHash("sha256");
for (const file of files) {
  const bytes = await readFile(path.join(root, file));
  outputBytes.set(file, bytes);
  fingerprint.update(file).update("\0").update(bytes);
  if (/\.css$/.test(file)) cssGzip += gzipSync(bytes).length;
  if (/\.woff2$/.test(file)) fontBytes += bytes.length;
  insist(
    !/(?:^|\/)(?:plans|research|checkouts?|engineer|fixtures?|tests?|logs?|\.git|node_modules|private|drafts?)(?:\/|$)/i.test(
      file,
    ),
    `Unselected directory in output: ${file}`,
  );
  insist(
    !/\.(?:map|md|mmd|log|toml|env|ts|tsx|astro)$/.test(file),
    `Authoring/source file in output: ${file}`,
  );
  insist(
    !/(?:public-copy|asset-slots|approval|sentinel|fixture|\.DS_Store)/i.test(
      file,
    ),
    `Unselected file in output: ${file}`,
  );
  insist(
    !/\.(?:zip|7z|tar|gz|bz2|xz|rar|sqlite|db)$/i.test(file),
    `Archive/export file type is not public: ${file}`,
  );
  insist(
    !/(?:^|\/)(?:conversations(?:-[^/]*)?\.json|chat\.html|raw[-_]chat(?:[^/]*))$/i.test(file),
    `Chat export path is not public: ${file}`,
  );
  if (/\.(?:html|xml|json|m?js|css|svg|txt)$/.test(file)) {
    const text = bytes.toString("utf8");
    source.set(file, text);
    insist(
      !/EDITOR_ONLY_SENTINEL|PRIVATE_SENTINEL|DRAFT_SENTINEL|FIXTURE_SENTINEL|AUTHORING_ONLY_SENTINEL|SYNTHETIC_CHAT_EXPORT_MARKER|RAW_CHAT_EXPORT_MARKER|\{\{\s*[A-Za-z_][\w. -]*\s*\}\}|C:\\Users\\Siinn/i.test(
        text,
      ),
      `Private, fixture, unresolved template, or local path in ${file}`,
    );
    if (file.endsWith(".html")) html.set(file, load(text));
    if (file.endsWith(".html")) {
      const prose = load(text);
      prose("script, style, code, pre").remove();
      insist(
        !/\{(?:count|date|index|language|minutes|noteSummary|noteTitle|projectTitle|total)\}/.test(
          prose.root().text(),
        ),
        `Unresolved editorial variable in ${file}`,
      );
    }
  }
}
const routeFor = (file) =>
  `${base}${file === "index.html" ? "" : file.endsWith("/index.html") ? file.slice(0, -10) : file}`;
const fileFor = (pathname) => {
  if (!pathname.startsWith(base)) return null;
  const relative = decodeURIComponent(pathname.slice(base.length));
  if (relative.split("/").some((part) => part === "..")) return null;
  const candidates = [
    relative,
    `${relative}${relative.endsWith("/") || !relative ? "" : "/"}index.html`,
  ];
  return candidates.find((candidate) => inventory.has(candidate)) || null;
};
const origins = new Set(["http://127.0.0.1:4321", "http://localhost:4321"]);
const referencedFiles = new Set();
if (process.env.SITE_URL) origins.add(new URL(process.env.SITE_URL).origin);
for (const [file, $] of html) {
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) {
    try {
      origins.add(new URL(canonical, "http://127.0.0.1:4321").origin);
    } catch {
      problems.push(`Invalid canonical in ${file}`);
    }
  }
}
const inspectReference = (value, file, context) => {
  if (!value || /^(?:data:|mailto:|tel:|javascript:|blob:)/i.test(value)) {
    insist(
      !/^javascript:/i.test(value || ""),
      `Script URL in ${file}: ${context}`,
    );
    return;
  }
  insist(value !== "#", `Empty anchor in ${file}: ${context}`);
  let url;
  try {
    url = new URL(value, `http://127.0.0.1:4321${routeFor(file)}`);
  } catch {
    problems.push(`Invalid reference in ${file}: ${value}`);
    return;
  }
  if (!origins.has(url.origin)) return;
  const target = fileFor(url.pathname);
  insist(Boolean(target), `Broken ${context} in ${file}: ${value}`);
  if (target) referencedFiles.add(target);
  if (target && url.hash && html.has(target)) {
    const id = decodeURIComponent(url.hash.slice(1));
    const targetDoc = html.get(target);
    insist(
      targetDoc("[id]")
        .toArray()
        .some((element) => targetDoc(element).attr("id") === id),
      `Missing anchor ${id} linked from ${file}`,
    );
  }
};
for (const [file, $] of html) {
  const locale = file.startsWith("en/") ? "en" : "vi";
  insist(
    $("html").attr("lang") === locale,
    `Wrong document language in ${file}`,
  );
  insist($("main").length === 1, `Expected one main landmark in ${file}`);
  insist($("h1").length === 1, `Expected one h1 in ${file}`);
  insist(Boolean($("title").text().trim()), `Missing title in ${file}`);
  insist(
    Boolean($('meta[name="description"]').attr("content")?.trim()),
    `Missing description in ${file}`,
  );
  const ids = $("[id]")
    .toArray()
    .map((element) => $(element).attr("id"));
  insist(new Set(ids).size === ids.length, `Duplicate HTML id in ${file}`);
  if (file !== "404.html") {
    const canonical = $('link[rel="canonical"]');
    insist(canonical.length === 1, `Expected one canonical in ${file}`);
    if (process.env.SITE_URL)
      insist(
        (canonical.attr("href") || "").startsWith(
          `${new URL(process.env.SITE_URL).origin}/`,
        ),
        `Configured site origin missing from canonical in ${file}`,
      );
    const expected = file === "index.html" ? `${base}vi/` : routeFor(file);
    try {
      insist(
        new URL(canonical.attr("href"), "http://127.0.0.1:4321").pathname ===
          expected,
        `Wrong canonical path in ${file}`,
      );
    } catch {}
    for (const lang of ["vi", "en"]) {
      const alternate = $(`link[rel="alternate"][hreflang="${lang}"]`);
      insist(alternate.length === 1, `Missing ${lang} hreflang in ${file}`);
      const relative =
        file === "index.html"
          ? ""
          : file.replace(/^(?:vi|en)\//, "").replace(/index\.html$/, "");
      const expectedAlternate = `${base}${lang}/${relative}`;
      try {
        insist(
          new URL(alternate.attr("href"), "http://127.0.0.1:4321").pathname ===
            expectedAlternate,
          `Cross-entry hreflang in ${file}: ${lang}`,
        );
      } catch {
        problems.push(`Invalid hreflang URL in ${file}`);
      }
    }
  }
  $("a[href], link[href]").each((_, element) =>
    inspectReference($(element).attr("href"), file, element.tagName),
  );
  $("[src], [poster]").each((_, element) =>
    inspectReference(
      $(element).attr("src") || $(element).attr("poster"),
      file,
      element.tagName,
    ),
  );
  $("[srcset]").each((_, element) => {
    for (const candidate of ($(element).attr("srcset") || "").split(","))
      inspectReference(candidate.trim().split(/\s+/)[0], file, "srcset");
  });
  $("img").each((_, element) => {
    insist(
      $(element).attr("alt") !== undefined,
      `Image without alt in ${file}`,
    );
    insist(
      Number($(element).attr("width")) > 0 &&
        Number($(element).attr("height")) > 0,
      `Image without intrinsic dimensions in ${file}`,
    );
  });
}
for (const [file, text] of source) {
  if (file.endsWith(".css"))
    for (const match of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g))
      inspectReference(match[1], file, "CSS asset");
}
const shareSelections = [];
try {
  const sourceRoot = path.resolve(process.env.SOURCE_DIR || ".");
  const registry = JSON.parse(await readFile(path.join(sourceRoot, "src/data/share-media.json"), "utf8"));
  insist(Array.isArray(registry) && registry.length === 2, "Expected exactly two source-selected case covers");
  const projectIds = new Set();
  for (const selection of registry) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selection.projectId) || !/^[a-z0-9][a-z0-9.-]*\.png$/.test(selection.source) || !selection.alt?.vi?.trim() || !selection.alt?.en?.trim()) {
      problems.push("Invalid source share-image selection");
      continue;
    }
    insist(!projectIds.has(selection.projectId), `Duplicate source share-image project: ${selection.projectId}`);
    projectIds.add(selection.projectId);
    const bytes = await readFile(path.join(sourceRoot, "src/assets/share", selection.source));
    const metadata = await sharp(bytes).metadata();
    insist(metadata.format === "png" && metadata.width === selection.width && metadata.height === selection.height, `Source cover dimensions/format mismatch: ${selection.projectId}`);
    shareSelections.push({ ...selection, bytes });
  }
} catch (error) {
  problems.push(`Cannot validate source-selected case covers: ${error.message}`);
}
const metadataSelection = selectMetadataImages({ files: outputBytes, selections: shareSelections, base, site: process.env.SITE_URL });
problems.push(...metadataSelection.problems);
const outputGraph = await analyzeOutputGraph({
  files: outputBytes,
  base,
  // Metadata origins must come from configuration, not an arbitrary canonical.
  origins: process.env.SITE_URL ? [new URL(process.env.SITE_URL).origin] : [],
  selectedMetadataImages: metadataSelection.selectedMetadataImages,
});
problems.push(...outputGraph.problems);
for (const file of outputGraph.reachableFiles) referencedFiles.add(file);
for (const file of files.filter((file) => file.startsWith("_astro/")))
  insist(
    referencedFiles.has(file),
    `Unlinked generated asset in output: ${file}`,
  );
const allowedHtml = new Set(["index.html", "404.html"]);
const corePages = ["index.html", ...["vi", "en"].flatMap(locale => ["", "work/", "about/"].map(route => `${locale}/${route}index.html`))];
const coreAnchorTargets = new Set();
for (const coreFile of corePages) {
  const core = html.get(coreFile);
  if (!core) continue;
  core("a[href]").each((_, element) => {
    try {
      const url = new URL(core(element).attr("href"), `http://127.0.0.1:4321${routeFor(coreFile)}`);
      if (origins.has(url.origin)) {
        const target = fileFor(url.pathname);
        if (target) coreAnchorTargets.add(target);
      }
    } catch {}
  });
}
for (const locale of ["vi", "en"]) {
  for (const route of ["", "work/", "about/"]) {
    allowedHtml.add(`${locale}/${route}index.html`);
    insist(
      html.has(`${locale}/${route}index.html`),
      `Missing core route: ${locale}/${route}`,
    );
  }
  // Entry routes must be selected by their public listing, not merely exist.
  for (const family of ["work", "notes"]) {
    const listingFile = `${locale}/${family}/index.html`;
    const listing = html.get(listingFile);
    if (!listing || (family === "notes" && !coreAnchorTargets.has(listingFile))) continue;
    if (family === "notes") allowedHtml.add(listingFile);
    listing("main a[href]").each((_, element) => {
      const value = listing(element).attr("href");
      try {
        const url = new URL(value, `http://127.0.0.1:4321${routeFor(listingFile)}`);
        const target = fileFor(url.pathname);
        if (origins.has(url.origin) && target && new RegExp(`^${locale}/${family}/[a-z0-9]+(?:-[a-z0-9]+)*/index\\.html$`).test(target)) allowedHtml.add(target);
      } catch {}
    });
  }
  const gallery = `${locale}/photography/index.html`;
  if (coreAnchorTargets.has(gallery)) allowedHtml.add(gallery);
}
for (const file of files) {
  const generatedAsset = /^_astro\/[A-Za-z0-9_.-]+\.(?:css|m?js|webp|png|jpe?g|avif|svg|woff2)$/.test(file) && referencedFiles.has(file);
  const publicFont = /^fonts\/[A-Za-z0-9_.-]+\.woff2$/.test(file) && referencedFiles.has(file);
  const intentionalSiteFile = ["robots.txt", "sitemap.xml", "sitemap-0.xml", "sitemap-index.xml", "fonts/OFL.txt", "licenses/primer-octicons-mit.txt"].includes(file);
  const icon = file === "favicon.svg" && referencedFiles.has(file);
  const selectedCv = /\.pdf$/i.test(file) && [...html.values()].some($ => $("a[lang][href]").toArray().some(element => {
    const anchor = $(element);
    if (!/^CV\s*\(/.test(anchor.text().trim()) || !["vi", "en"].includes(anchor.attr("lang"))) return false;
    try { return fileFor(new URL(anchor.attr("href"), "http://127.0.0.1:4321").pathname) === file; } catch { return false; }
  }));
  insist(allowedHtml.has(file) || generatedAsset || publicFont || intentionalSiteFile || icon || selectedCv,
    `File outside public type/path allowlist: ${file}`);
}
insist(html.has("index.html"), "Missing useful root Home alias");
insist(html.has("404.html"), "Missing static 404 page");
for (const optional of ["notes", "photography"]) {
  const routes = [...html.keys()].filter((file) =>
    new RegExp(`^(vi|en)/${optional}/`).test(file),
  );
  for (const file of routes)
    insist(
      html.has(file.replace(/^(vi|en)/, file.startsWith("vi/") ? "en" : "vi")),
      `Unpaired optional route ${file}`,
    );
  if (!routes.length)
    for (const [file, $] of html)
      insist(
        !$(`a[href*="/${optional}/"]`).length,
        `Unavailable ${optional} link in ${file}`,
      );
}
const sitemapFile = files.find(
  (file) => file === "sitemap.xml" || file === "sitemap-0.xml",
);
insist(Boolean(sitemapFile), "Missing sitemap");
if (sitemapFile) {
  const xml = load(source.get(sitemapFile), { xmlMode: true });
  const locations = xml("url > loc")
    .toArray()
    .map((element) => xml(element).text());
  const paths = locations.map((location) => {
    try {
      return new URL(location).pathname;
    } catch {
      return location;
    }
  });
  insist(new Set(paths).size === paths.length, "Duplicate sitemap paths");
  const absoluteMetadata = [...html.values()].some(($) =>
    /^https?:\/\//.test($('link[rel="canonical"]').attr("href") || ""),
  );
  const localPreview = !absoluteMetadata && !process.env.SITE_URL;
  if (localPreview)
    for (const [file, $] of html)
      insist(
        /noindex/.test($('meta[name="robots"]').attr("content") || ""),
        `Preview without site origin must be noindex: ${file}`,
      );
  const expected = localPreview
    ? []
    : [...html.keys()]
        .filter((file) => file !== "index.html" && file !== "404.html")
        .map(routeFor);
  insist(
    paths.length === expected.length &&
      expected.every((route) => paths.includes(route)),
    "Sitemap and public HTML route inventory differ",
  );
  locations.forEach((location) =>
    inspectReference(location, sitemapFile, "sitemap"),
  );
}
// The standalone scene was removed; its optional runtime budget no longer applies.
insist(outputGraph.budgets.totalJsGzip <= 20 * 1024, `JavaScript budget exceeded: ${outputGraph.budgets.totalJsGzip} gzip bytes`);
for (const [file, $] of html) {
  insist($("[data-motion-stage], [data-motion-canvas]").length === 0, `Removed standalone 3D stage in output: ${file}`);
}
insist(cssGzip <= 25 * 1024, `CSS budget exceeded: ${cssGzip} gzip bytes`);
insist(
  fontBytes <= 120 * 1024,
  `Font budget exceeded: ${fontBytes} WOFF2 bytes`,
);
const result = {
  checkedAt: new Date().toISOString(),
  outputDirectory: root,
  base,
  artifactSha256: fingerprint.digest("hex"),
  fileCount: files.length,
  htmlCount: html.size,
  budgets: { jsGzip: outputGraph.budgets.totalJsGzip, ...outputGraph.budgets, cssGzip, fontBytes },
  javascriptGraph: { eagerFiles: outputGraph.eagerFiles, dynamicFiles: outputGraph.dynamicFiles, sceneAssets: outputGraph.sceneAssets },
  metadataImages: outputGraph.metadataImages,
  inventory: await Promise.all(
    files.map(async (file) => ({
      file,
      bytes: (await stat(path.join(root, file))).size,
    })),
  ),
  problems,
  passed: problems.length === 0,
};
await mkdir(reportDirectory, { recursive: true });
await writeFile(
  path.join(reportDirectory, "output-verification.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      passed: result.passed,
      html: html.size,
      files: files.length,
      budgets: result.budgets,
      artifactSha256: result.artifactSha256,
      problems,
    },
    null,
    2,
  ),
);
if (problems.length) process.exitCode = 1;
