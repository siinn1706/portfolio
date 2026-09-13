import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { load } from "cheerio";
import { init, parse } from "es-module-lexer";
import ts from "typescript";

const jsFile = /\.m?js$/i;
const sceneAsset = /\.(?:webp|png|jpe?g|avif|svg)$/i;
const executable = (type = "") => /^(?:module|(?:text|application)\/(?:java|ecma)script)?$/i.test(type.trim());
const closure = (roots, edges) => {
  const found = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    if (found.has(file)) continue;
    found.add(file);
    queue.push(...(edges.get(file) || []));
  }
  return found;
};

// Match each selected Work entry to its source-approved cover bytes. A page
// marker alone cannot select an asset, and output names carry no authority.
export function selectMetadataImages({ files, selections, base = "/", site = /** @type {string | undefined} */ (undefined) }) {
  const problems = [];
  const selectedMetadataImages = new Map();
  const documents = new Map([...files].filter(([file]) => file.endsWith(".html")).map(([file, text]) => [file, load(text.toString())]));
  const approved = new Map(selections.map(selection => [selection.projectId, selection]));
  const hashes = new Map([...files].map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]));
  const selectedCases = new Map();
  const origin = site ? new URL(site).origin : "http://127.0.0.1:4321";
  const targetFor = value => {
    try {
      const url = new URL(value, `${origin}${base}`);
      if (url.origin !== origin || !url.pathname.startsWith(base)) return null;
      const relative = decodeURIComponent(url.pathname.slice(base.length));
      return files.has(relative) ? relative : files.has(`${relative}index.html`) ? `${relative}index.html` : null;
    } catch { return null; }
  };
  for (const locale of ["vi", "en"]) {
    const listing = documents.get(`${locale}/work/index.html`);
    listing?.('main .project-row[data-project-id]').each((_, row) => {
      const projectId = listing(row).attr("data-project-id");
      if (!approved.has(projectId)) return;
      const target = targetFor(listing(row).find(':is(h2, h3) a[href]').first().attr("href"));
      if (!target || !new RegExp(`^${locale}/work/[a-z0-9]+(?:-[a-z0-9]+)*/index\\.html$`).test(target)) {
        problems.push(`Selected share project has no case route: ${projectId}/${locale}`);
        return;
      }
      if (selectedCases.has(target)) problems.push(`Duplicate selected share case: ${target}`);
      selectedCases.set(target, { ...approved.get(projectId), locale });
    });
  }
  for (const [file, selection] of selectedCases) {
    const $ = documents.get(file);
    const tags = $('meta[property="og:image"]');
    if (tags.length !== 1 || tags.attr("data-share-project") !== selection.projectId) {
      problems.push(`Missing or mismatched selected cover metadata in ${file}`);
      continue;
    }
    const value = tags.attr("content") || "";
    if (site ? !value.startsWith(`${origin}${base}`) : !value.startsWith(base) || value.startsWith("//")) problems.push(`Wrong local/release cover URL form in ${file}: ${value}`);
    const target = targetFor(value);
    const expectedHash = createHash("sha256").update(selection.bytes).digest("hex");
    if (!target || hashes.get(target) !== expectedHash) {
      problems.push(`Missing or unselected source cover in ${file}: ${value}`);
      continue;
    }
    selectedMetadataImages.set(file, new Set([target]));
    for (const [property, expected] of [["og:image:alt", selection.alt[selection.locale]], ["og:image:width", String(selection.width)], ["og:image:height", String(selection.height)]]) {
      const meta = $(`meta[property="${property}"]`);
      if (meta.length !== 1 || meta.attr("content") !== expected) problems.push(`Wrong ${property} for selected cover in ${file}`);
    }
    const twitter = $('meta[name="twitter:image"]');
    if (twitter.length !== 1) problems.push(`Expected one Twitter cover metadata in ${file}`);
    const twitterAlt = $('meta[name="twitter:image:alt"]');
    if (twitterAlt.length !== 1 || twitterAlt.attr("content") !== selection.alt[selection.locale]) problems.push(`Wrong twitter:image:alt for selected cover in ${file}`);
    const eagerImage = $('link[rel="preload"][as="image"], img[src], img[srcset]').toArray().some(element => {
      const node = $(element);
      const candidates = [node.attr("href"), node.attr("src"), ...(node.attr("srcset") || "").split(",").map(part => part.trim().split(/\s+/)[0])];
      return candidates.some(candidate => candidate && targetFor(candidate) === target);
    });
    if (eagerImage) problems.push(`Share cover must remain metadata-only in ${file}`);
  }
  return { selectedMetadataImages, problems };
}

// All entry points come from rendered HTML. Static imports, re-exports and
// preload closures are eager even when their filenames look like scene chunks.
export async function analyzeOutputGraph({ files, base = "/", origins = /** @type {string[]} */ ([]), selectedMetadataImages = new Map() }) {
  await init;
  const problems = [];
  const inventory = new Set(files.keys());
  const texts = new Map([...files].map(([file, bytes]) => [file, bytes.toString()]));
  const localOrigins = new Set(["http://127.0.0.1:4321", "http://localhost:4321", ...origins]);
  const edges = new Map();
  const staticEdges = new Map();
  const dynamicEdges = new Map();
  const eagerRoots = new Set();
  const sceneRoots = new Set();
  const inlineScripts = new Map();
  const inlineSceneAssets = new Map();
  const metadataImages = new Set();
  // Selection is supplied from the build-time source registry by the verifier,
  // never inferred from a meta tag or a generated filename.
  const configuredMetadataOrigins = [...origins];
  const metadataOrigins = new Set(configuredMetadataOrigins.length ? configuredMetadataOrigins : ["http://127.0.0.1:4321", "http://localhost:4321"]);
  const documents = new Map([...texts].filter(([file]) => file.endsWith(".html")).map(([file, text]) => [file, load(text)]));
  const connect = (graph, from, to) => {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from).add(to);
  };
  for (const $ of documents.values()) {
    const canonical = $('link[rel="canonical"]').attr("href");
    if (canonical) {
      try { localOrigins.add(new URL(canonical, "http://127.0.0.1:4321").origin); } catch { /* Main verifier reports malformed metadata. */ }
    }
  }
  const resolve = (value, file, context, isModule = false) => {
    if (!value) return null;
    if (/^(?:data:|blob:|mailto:|tel:|javascript:)/i.test(value)) {
      if (isModule) problems.push(`Unmeasured external ${context} in ${file}: ${value}`);
      return null;
    }
    if (isModule && context.endsWith("import") && !/^(?:\.{1,2}\/|\/|[a-z][a-z\d+.-]*:)/i.test(value)) {
      problems.push(`Unbundled ${context} in ${file}: ${value}`);
      return null;
    }
    let url;
    try { url = new URL(value, `http://127.0.0.1:4321${base}${file}`); }
    catch { problems.push(`Invalid ${context} in ${file}: ${value}`); return null; }
    if (!localOrigins.has(url.origin)) {
      if (isModule) problems.push(`Unmeasured external ${context} in ${file}: ${value}`);
      return null;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { problems.push(`Invalid ${context} in ${file}: ${value}`); return null; }
    const relative = pathname.startsWith(base) ? pathname.slice(base.length) : null;
    const candidates = relative !== null && !relative.split("/").some((part) => part === ".." || part.includes("\\"))
      ? [relative, `${relative}${relative.endsWith("/") || !relative ? "" : "/"}index.html`]
      : [];
    const target = candidates.find((candidate) => inventory.has(candidate));
    if (!target) problems.push(`Broken ${context} in ${file}: ${value}`);
    return target || null;
  };
  const reference = (value, file, context, isModule = false) => {
    const target = resolve(value, file, context, isModule);
    if (target) connect(edges, file, target);
    return target;
  };
  const inspectJs = (text, node, file = node) => {
    let imports;
    try { [imports] = parse(text, file); }
    catch { problems.push(`Cannot parse JavaScript imports in ${file}`); return; }
    for (const item of imports) {
      if (item.d === -2) continue; // import.meta has no dependency.
      if (item.n === undefined) {
        problems.push(`Unresolved dynamic import in ${file}: ${text.slice(item.ss, item.se)}`);
        continue;
      }
      const context = item.d === -1 ? "static import" : "dynamic import";
      const target = resolve(item.n, file, context, true);
      if (!target) continue;
      connect(edges, node, target);
      connect(item.d === -1 ? staticEdges : dynamicEdges, node, target);
      if (!jsFile.test(target)) problems.push(`Non-JavaScript ${context} in ${file}: ${item.n}`);
    }
    // Vite emits asset URLs and preload tables as string literals. Parse actual
    // literals so comments, regular expressions and example imports are not edges.
    const inspectLiteral = (literal) => {
      if (!ts.isStringLiteral(literal) && !ts.isNoSubstitutionTemplateLiteral(literal)) return ts.forEachChild(literal, inspectLiteral);
      const value = literal.text;
      if (!/^(?:\.{1,2}\/|\/|_astro\/)[^\s"'<>]*\.(?:css|webp|png|jpe?g|avif|svg|woff2|m?js)(?:[?#][^\s"'<>]*)?$/.test(value)) return;
      // Bare _astro paths in Vite preload tables are relative to the site base.
      const target = resolve(value.startsWith("_astro/") ? `${base}${value}` : value, file, "module asset");
      if (target) connect(edges, node, target);
    };
    inspectLiteral(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS));
  };

  for (const [file, $] of documents) {
    $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]').each((_, element) => {
      const value = $(element).attr("content") || "";
      const kind = $(element).attr("property") || $(element).attr("name");
      let url;
      try { url = new URL(value, `http://127.0.0.1:4321${base}${file}`); }
      catch { problems.push(`Invalid metadata image in ${file}: ${value}`); return; }
      if (!value || !/^https?:$/.test(url.protocol) || url.username || url.password || !metadataOrigins.has(url.origin)) {
        problems.push(`External or invalid metadata image in ${file}: ${value}`);
        return;
      }
      if (configuredMetadataOrigins.length ? !/^https?:\/\//.test(value) : !value.startsWith("/") || value.startsWith("//")) {
        problems.push(`Wrong local/release metadata image URL form in ${file}: ${value}`);
        return;
      }
      if (kind === "og:image:secure_url" && url.protocol !== "https:") problems.push(`Insecure metadata image secure_url in ${file}: ${value}`);
      const target = resolve(value, file, "metadata image");
      if (!target) return;
      if (!sceneAsset.test(target) || /(?:^|\/)(?:private|drafts?|research|plans|fixtures?|tests?)(?:\/|$)/i.test(target)) {
        problems.push(`Private or non-image metadata asset in ${file}: ${value}`);
        return;
      }
      if (!selectedMetadataImages.get(file)?.has(target)) {
        problems.push(`Unselected metadata image in ${file}: ${value}`);
        return;
      }
      connect(edges, file, target);
      metadataImages.add(target);
    });
    $('svg[data-stage-poster], svg[data-stage-asset], [data-stage-poster] svg, [data-stage-asset] svg').each((_, element) => {
      if ($(element).parents('svg[data-stage-poster], svg[data-stage-asset]').length) return;
      const markup = $.html(element);
      inlineSceneAssets.set(createHash("sha256").update(markup).digest("hex"), markup);
    });
    $("[href], [src], [poster], [srcset]").each((_, element) => {
      const node = $(element);
      const values = [node.attr("href"), node.attr("src"), node.attr("poster")];
      if (node.attr("srcset")) values.push(...node.attr("srcset").split(",").map((part) => part.trim().split(/\s+/)[0]));
      for (const value of values) {
        const target = reference(value, file, "HTML reference");
        if (target && (node.is("[data-stage-asset], [data-stage-poster]") || node.closest("[data-stage-asset], [data-stage-poster]").length)) sceneRoots.add(target);
      }
    });
    $("script").each((index, element) => {
      const script = $(element);
      if (!executable(script.attr("type"))) return;
      if (script.attr("src")) {
        const target = reference(script.attr("src"), file, "script", true);
        if (target) eagerRoots.add(target);
        if (target && !jsFile.test(target)) problems.push(`Non-JavaScript script in ${file}: ${script.attr("src")}`);
      } else {
        const text = script.text();
        if (!text.trim()) return;
        const node = `${file}#inline-script-${index}`;
        inlineScripts.set(createHash("sha256").update(text).digest("hex"), text);
        connect(edges, file, node);
        eagerRoots.add(node);
        inspectJs(text, node, file);
      }
    });
    $('link[rel]').each((_, element) => {
      const link = $(element);
      const rel = (link.attr("rel") || "").toLowerCase().split(/\s+/);
      if (!rel.includes("modulepreload") && !(rel.includes("preload") && link.attr("as")?.toLowerCase() === "script")) return;
      const target = reference(link.attr("href"), file, "script preload", true);
      if (target) eagerRoots.add(target);
      if (target && !jsFile.test(target)) problems.push(`Non-JavaScript script preload in ${file}: ${link.attr("href")}`);
    });
    // Inline handlers are executable bytes too, even without a script element.
    $("*").each((index, element) => {
      for (const [name, text] of Object.entries(element.attribs || {})) {
        if (!/^on[a-z]+$/i.test(name) || !text.trim()) continue;
        inlineScripts.set(createHash("sha256").update(text).digest("hex"), text);
        const node = `${file}#inline-handler-${index}-${name}`;
        connect(edges, file, node);
        eagerRoots.add(node);
        inspectJs(text, node, file);
      }
    });
  }
  for (const [file, text] of texts) {
    if (jsFile.test(file)) inspectJs(text, file);
    if (file.endsWith(".css")) {
      for (const match of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) reference(match[1] || match[2], file, "CSS asset");
    }
    if (file.endsWith(".svg")) {
      const svg = load(text, { xmlMode: true });
      svg("[href], [xlink\\:href]").each((_, element) => reference(svg(element).attr("href") || svg(element).attr("xlink:href"), file, "SVG asset"));
    }
  }

  const reachable = closure(documents.keys(), edges);
  const eager = closure(eagerRoots, staticEdges);
  const dynamicRoots = new Set();
  for (const [file, imports] of dynamicEdges) if (reachable.has(file)) for (const target of imports) dynamicRoots.add(target);
  const dynamic = closure(dynamicRoots, staticEdges);
  const eagerFiles = [...eager].filter((file) => inventory.has(file) && jsFile.test(file)).sort();
  const dynamicFiles = [...dynamic].filter((file) => !eager.has(file) && inventory.has(file) && jsFile.test(file)).sort();
  const jsFiles = [...inventory].filter((file) => jsFile.test(file));
  for (const file of inventory) {
    if (file.startsWith("_astro/") && !reachable.has(file)) problems.push(`Unlinked generated asset in output: ${file}`);
  }
  for (const file of jsFiles) {
    if (reachable.has(file) && !eager.has(file) && !dynamic.has(file)) problems.push(`JavaScript asset has no executable entry or import: ${file}`);
  }
  // Lazy textures and explicit poster assets are scene costs, including assets
  // shared with eager content: sharing must not exempt them from the scene cap.
  const sceneAssets = [...closure([...sceneRoots, ...dynamicRoots], edges)].filter((file) => inventory.has(file) && sceneAsset.test(file)).sort();
  const gzipped = (file) => gzipSync(files.get(file)).length;
  const inlineJsGzip = [...inlineScripts.values()].reduce((sum, text) => sum + gzipSync(text).length, 0);
  const externalJsGzip = jsFiles.reduce((sum, file) => sum + gzipped(file), 0);
  const coreJsGzip = eagerFiles.reduce((sum, file) => sum + gzipped(file), inlineJsGzip);
  const sceneJsGzip = dynamicFiles.reduce((sum, file) => sum + gzipped(file), 0);
  const totalJsGzip = externalJsGzip + inlineJsGzip;
  const externalSceneAssetBytes = sceneAssets.reduce((sum, file) => sum + Buffer.byteLength(files.get(file)), 0);
  const inlineSceneAssetBytes = [...inlineSceneAssets.values()].reduce((sum, markup) => sum + Buffer.byteLength(markup), 0);
  const sceneAssetBytes = externalSceneAssetBytes + inlineSceneAssetBytes;
  for (const [label, bytes, cap] of [
    ["Core JavaScript", coreJsGzip, 20 * 1024],
    ["Scene JavaScript", sceneJsGzip, 220 * 1024],
    ["Total JavaScript", totalJsGzip, 240 * 1024],
  ]) if (bytes > cap) problems.push(`${label} budget exceeded: ${bytes} gzip bytes (cap ${cap})`);
  if (sceneAssetBytes > 250 * 1024) problems.push(`Scene asset budget exceeded: ${sceneAssetBytes} bytes (cap ${250 * 1024})`);
  return {
    budgets: { coreJsGzip, sceneJsGzip, totalJsGzip, externalJsGzip, inlineJsGzip, sceneAssetBytes, externalSceneAssetBytes, inlineSceneAssetBytes },
    eagerFiles,
    dynamicFiles,
    sceneAssets,
    metadataImages: [...metadataImages].sort(),
    reachableFiles: [...reachable].filter((file) => inventory.has(file)).sort(),
    problems: [...new Set(problems)],
  };
}
