import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
import { measureProjectSwitch } from "./measure-project-switch.mjs";

const root = path.resolve(process.env.OUTPUT_DIR || "dist");
const reportDirectory = path.resolve(
  process.env.QA_REPORT_DIR ||
    ".qa/local",
);
const base = process.env.BASE_PATH || "/";
const walk = async (directory) =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map(async (file) =>
        file.isDirectory()
          ? walk(path.join(directory, file.name))
          : [path.join(directory, file.name)],
      ),
    )
  ).flat();
const files = (await walk(root)).sort();
const hash = createHash("sha256");
for (const file of files)
  hash
    .update(path.relative(root, file).replaceAll("\\", "/"))
    .update("\0")
    .update(await readFile(file));
const artifactSha256 = hash.digest("hex");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    let relative = pathname.startsWith(base)
      ? pathname.slice(base.length)
      : "404.html";
    let absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root)
      throw new Error("Outside output");
    if ((await stat(absolute).catch(() => null))?.isDirectory())
      absolute = path.join(absolute, "index.html");
    let status = 200;
    if (!existsSync(absolute)) {
      absolute = path.join(root, "404.html");
      status = 404;
    }
    let body = await readFile(absolute);
    const extension = path.extname(absolute);
    const headers = {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    };
    if (
      /\.(html|css|js|svg|xml)$/.test(extension) &&
      request.headers["accept-encoding"]?.includes("gzip")
    ) {
      body = gzipSync(body);
      headers["Content-Encoding"] = "gzip";
    }
    headers["Content-Length"] = body.length;
    response.writeHead(status, headers).end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
const browser = await chromium
  .launch(executablePath ? { executablePath } : {})
  .catch(async (error) => {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  });
const settings = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  cpuSlowdownMultiplier: 4,
  network: {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: "cellular3g",
  },
  cache: "disabled with a new browser context for each run",
  server:
    "local static artifact; gzip HTML/CSS/JS/SVG/XML; images and WOFF2 unchanged",
  initial:
    "load plus network idle before any scroll; includes lazy resources loaded near viewport",
  fullScroll:
    "step through each viewport; report separately after network idle",
};
const runs = [];
const measurementRoutes = process.env.MEASURE_ROUTE ? [process.env.MEASURE_ROUTE] : ["vi/", "en/", "vi/work/healthos/"];
const runCount = Number(process.env.MEASURE_RUNS || 3);
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 10) throw new Error('MEASURE_RUNS must be an integer from 1 to 10');
settings.runsPerRoute = runCount;
try {
  for (const route of measurementRoutes)
    for (let iteration = 1; iteration <= runCount; iteration++) {
      const context = await browser.newContext({
        viewport: settings.viewport,
        deviceScaleFactor: settings.deviceScaleFactor,
      });
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Network.enable");
      await session.send("Network.setCacheDisabled", { cacheDisabled: true });
      await session.send("Network.emulateNetworkConditions", settings.network);
      await session.send("Emulation.setCPUThrottlingRate", {
        rate: settings.cpuSlowdownMultiplier,
      });
      const requests = new Map();
      session.on("Network.requestWillBeSent", (event) =>
        requests.set(event.requestId, {
          url: event.request.url,
          method: event.request.method,
          type: event.type,
          bytes: 0,
          cached: false,
        }),
      );
      session.on("Network.responseReceived", (event) => {
        const item = requests.get(event.requestId);
        if (item)
          Object.assign(item, {
            status: event.response.status,
            mimeType: event.response.mimeType,
            cached: Boolean(
              event.response.fromDiskCache || event.response.fromServiceWorker,
            ),
          });
      });
      session.on("Network.loadingFinished", (event) => {
        const item = requests.get(event.requestId);
        if (item) item.bytes = event.encodedDataLength;
      });
      session.on("Network.loadingFailed", (event) => {
        const item = requests.get(event.requestId);
        if (item) item.failure = event.errorText;
      });
      await page.addInitScript(() => {
        window.__labMetrics = { lcp: 0, lcpElement: null, cls: 0, shifts: [], geometryTimeline: [] };
        document.addEventListener('DOMContentLoaded', () => {
          const selectors = ['.identity-strip p > span', '.identity h1', '.featured-paper'];
          const record = () => window.__labMetrics.geometryTimeline.push({
            time: performance.now(),
            geometry: selectors.map(selector => {
              const element = document.querySelector(selector);
              return { selector, rect: element?.getBoundingClientRect().toJSON(), font: element ? getComputedStyle(element).font : undefined };
            }),
            fonts: [...document.fonts].map(face => ({ family: face.family, weight: face.weight, status: face.status, unicodeRange: face.unicodeRange })),
            featuredEnhanced: document.querySelector('[data-featured-projects]')?.getAttribute('data-enhanced'),
          });
          const observer = new ResizeObserver(record);
          selectors.forEach(selector => { const element = document.querySelector(selector); if (element) observer.observe(element); });
          document.fonts.addEventListener('loadingdone', record);
          record();
        }, { once: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__labMetrics.lcp = entry.startTime;
            const element = entry.element;
            window.__labMetrics.lcpElement = {
              startTime: entry.startTime,
              tag: element?.tagName?.toLowerCase() ?? null,
              id: element?.id || null,
              personalMediaId: element?.getAttribute('data-personal-media-id') ?? null,
              url: entry.url || null,
              currentSrc: element instanceof HTMLImageElement ? element.currentSrc || null : null,
            };
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) {
              window.__labMetrics.cls += entry.value;
              window.__labMetrics.shifts.push({ time: entry.startTime, value: entry.value, sources: entry.sources.map(source => ({ node: source.node?.outerHTML?.slice(0, 250), previous: source.previousRect.toJSON(), current: source.currentRect.toJSON() })) });
            }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${origin}${base}${route}`, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
      await page.evaluate(() => document.fonts.ready);
      const initialResources = structuredClone([...requests.values()]);
      const metrics = await page.evaluate(() => ({
        ...window.__labMetrics,
        personalImages: [...document.querySelectorAll('img[data-personal-media-id]')].map(image => ({
          mediaId: image.dataset.personalMediaId, role: image.dataset.personalRole,
          currentSrc: image.currentSrc || null, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
          width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height,
          dpr: devicePixelRatio, loading: image.loading, fetchPriority: image.fetchPriority,
        })),
        navigation: performance.getEntriesByType("navigation")[0].toJSON(),
      }));
      for (
        let y = 0;
        y < (await page.evaluate(() => document.documentElement.scrollHeight));
        y += settings.viewport.height
      ) {
        await page.evaluate((y) => window.scrollTo(0, y), y);
        await page.waitForTimeout(150);
      }
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(
        () => [...document.images].filter(image => image.getClientRects().length > 0).every((image) => image.complete),
        null,
        { timeout: 60_000 },
      );
      await page.waitForTimeout(550);
      const fullScrollResources = structuredClone([...requests.values()]);
      const failed = fullScrollResources.filter(
        (item) => item.failure || item.status >= 400,
      );
      if (failed.length)
        throw new Error(
          `Performance run contains failed resources: ${JSON.stringify(failed)}`,
        );
      const initialBytes = initialResources.reduce(
        (sum, item) => sum + item.bytes,
        0,
      );
      const fullScrollBytes = fullScrollResources.reduce(
        (sum, item) => sum + item.bytes,
        0,
      );
      const run = {
        route,
        iteration,
        initialBytes,
        fullScrollBytes,
        initialBudgetBytes: 500 * 1024,
        withinInitialBudget: initialBytes <= 500 * 1024,
        lcpLabMs: metrics.lcp,
        lcpElement: metrics.lcpElement,
        personalImages: metrics.personalImages,
        clsLab: metrics.cls,
        layoutShifts: metrics.shifts,
        geometryTimeline: metrics.geometryTimeline,
        navigation: metrics.navigation,
        initialResources,
        fullScrollResources,
      };
      runs.push(run);
      console.log(
        JSON.stringify({
          route,
          iteration,
          initialKiB: +(initialBytes / 1024).toFixed(1),
          fullScrollKiB: +(fullScrollBytes / 1024).toFixed(1),
          lcpLabMs: +metrics.lcp.toFixed(0),
          clsLab: metrics.cls,
        }),
      );
      await context.close();
    }
  const medianRange = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted.at(-1),
    };
  };
  const summary = measurementRoutes.map((route) => {
    const group = runs.filter((run) => run.route === route);
    return {
      route,
      initialBytes: medianRange(group.map((run) => run.initialBytes)),
      fullScrollBytes: medianRange(group.map((run) => run.fullScrollBytes)),
      lcpLabMs: medianRange(group.map((run) => run.lcpLabMs)),
      clsLab: medianRange(group.map((run) => run.clsLab)),
    };
  });
  const report = {
    checkedAt: new Date().toISOString(),
    artifactSha256,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    browser: browser.version(),
    executablePath,
    settings,
    runs,
    summary,
    budgets: { initialBytes: 500 * 1024, lcpLabMs: 2500, clsLab: 0.1 },
    passed: runs.every(run => run.withinInitialBudget && run.lcpLabMs <= 2500 && run.clsLab <= 0.1),
    scope:
      "Lab observations of this static artifact only. No field INP, p75 Core Web Vitals, hosting latency or production uptime has been measured.",
  };
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    path.join(reportDirectory, "performance.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      { summary, report: path.join(reportDirectory, "performance.json") },
      null,
      2,
    ),
  );
  if (process.env.MEASURE_SWITCH !== '0') {
    await measureProjectSwitch({ browser, root, origin, base, reportDirectory, settings, artifactSha256 });
  }
  if (!report.passed) throw new Error('Cold performance targets were exceeded; inspect performance.json.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
