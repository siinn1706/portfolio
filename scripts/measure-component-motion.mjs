import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { installMotionAudit } from './measure-materials.mjs';

// Cold loads, active-frame cadence and renderer task occupancy are separate lab
// observations. Screenshots and paused timelines never enter these measurements.
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const numberOnly = args.includes('--number-only');
const scenario = option('--scenario', 'featured');
const runCount = Number(option('--runs', '3'));
const seconds = Number(option('--seconds', '5'));
if (!['cold', 'featured', 'entry'].includes(scenario) || !Number.isInteger(runCount) || runCount < 3 || runCount > 10) throw new Error('Use --scenario cold|featured|entry and --runs 3..10.');
if (seconds < 5 || seconds > 15) throw new Error('--seconds must be between 5 and 15.');
if (numberOnly && (scenario !== 'featured' || option('--metric', '') !== 'active-work-p95')) throw new Error('Numeric mode requires --metric active-work-p95 --scenario featured.');
const startedAt = Date.now();
const root = path.resolve(process.env.OUTPUT_DIR || 'dist');
const reportDirectory = path.resolve(process.env.QA_REPORT_DIR || '.qa/local');
const sourceRoot = path.resolve(process.env.SOURCE_DIR || '.');
const base = process.env.BASE_PATH || '/';
const material = process.env.MOTION_MATERIAL || 'expressive-css';
if (!['baseline-b', 'expressive-css', 'expressive-refractive', 'solid'].includes(material)) throw new Error('Unknown MOTION_MATERIAL.');
const legacyBaseline = process.env.MOTION_LEGACY_BASELINE === '1';
if (legacyBaseline && material !== 'baseline-b') throw new Error('Legacy baseline adapter requires MOTION_MATERIAL=baseline-b.');
const log = (...values) => (numberOnly ? console.error : console.log)(...values);
await mkdir(reportDirectory, { recursive: true });
if (numberOnly) {
  // Numeric verification cannot accidentally score stale output. Build is part
  // of its elapsed time; a result over 30s is explicitly ineligible for a loop.
  if (process.env.OUTPUT_DIR || process.env.SOURCE_DIR) throw new Error('Numeric verification builds the current source into dist; custom roots are unsupported.');
  const astroPackage = JSON.parse(await readFile('node_modules/astro/package.json', 'utf8'));
  const astroCli = path.resolve('node_modules/astro', typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin.astro);
  const build = spawnSync(process.execPath, [astroCli, 'build'], { encoding: 'utf8', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  await writeFile(path.join(reportDirectory, 'numeric-build.log'), `${build.stdout || ''}\n${build.stderr || ''}`);
  if (build.status !== 0) throw new Error(`Numeric build failed: ${build.stderr || build.error || build.stdout}`);
}
async function walk(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
async function treeHash(directory, files = undefined) {
  const hash = createHash('sha256');
  for (const file of (files || await walk(directory)).sort()) hash.update(path.relative(directory, file).replaceAll('\\', '/')).update('\0').update(await readFile(file));
  return hash.digest('hex');
}
const artifactSha256 = await treeHash(root);
const sourceFiles = await walk(path.join(sourceRoot, 'src'));
for (const filename of ['astro.config.mjs', 'package.json', 'package-lock.json']) if (existsSync(path.join(sourceRoot, filename))) sourceFiles.push(path.join(sourceRoot, filename));
const sourceTreeSha256 = await treeHash(sourceRoot, sourceFiles);
const network = { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, connectionType: 'cellular3g' };
// Keep the established routes and add every selected long-form/optional route
// from this artifact, so a new note, photo essay or lab cannot escape cold QA.
const optionalRoutes = (await walk(root)).map(file => path.relative(root, file).replaceAll('\\', '/'))
  .filter(file => /^(vi|en)\/(notes\/.*|photography\/|work\/.+)index\.html$/.test(file))
  .map(file => file.slice(0, -'index.html'.length)).sort();
const allRoutes = [...new Set([...['vi/', 'en/'].flatMap(locale => ['', 'about/', 'work/', 'work/healthos/', 'work/quan-ly-kho/'].map(route => locale + route)), ...optionalRoutes])];
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, reducedMotion: 'no-preference', cpu: 1, routes: allRoutes },
  { name: 'coarse', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'no-preference', cpu: 4, routes: allRoutes.filter(route => !route.endsWith('about/') && !route.endsWith('/work/')) },
  { name: 'reduced', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, reducedMotion: 'reduce', cpu: 1, routes: ['vi/', 'en/'] },
];
const chosenProfiles = profiles.filter(profile => !process.env.MOTION_PROFILE || profile.name === process.env.MOTION_PROFILE).filter(profile => scenario === 'cold' || profile.name !== 'reduced');
if (!chosenProfiles.length) throw new Error('No measurement profiles selected.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) throw new Error('Outside base');
    let file = path.resolve(root, pathname.slice(base.length));
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error('Outside artifact');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    let status = 200;
    if (!existsSync(file)) { file = path.join(root, '404.html'); status = 404; }
    let body = await readFile(file);
    const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (/\.(html|css|js|svg|xml)$/.test(file) && request.headers['accept-encoding']?.includes('gzip')) { body = gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
    response.writeHead(status, { ...headers, 'Content-Length': body.length }).end(body);
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const headed = process.env.MOTION_HEADED === '1';
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: !headed }).catch(async error => { await new Promise(resolve => server.close(resolve)); throw error; });
const traceTaskName = 'ThreadControllerImpl::RunTask';
const manifest = { checkedAt: new Date().toISOString(), scenario, artifactSha256, sourceTreeSha256, outputDirectory: root, sourceRoot, base, node: process.version, browser: browser.version(), executablePath, runCount, profiles: chosenProfiles, network, server: 'local gzip HTML/CSS/JS/SVG/XML; images and fonts unchanged', cache: 'new context, disabled cache, service workers blocked', traceTask: { name: traceTaskName, category: 'toplevel', thread: 'CrRendererMain', schemaEvidence: 'Chrome152 discovery trace: ThreadControllerImpl::RunTask is the top-level task; plain RunTask belongs to disabled-by-default-devtools.timeline and is not double-counted.' }, timingScope: 'lab input-to-commit; rAF cadence; renderer main-thread task occupancy per active frame; no GPU FPS or field INP', loopCount: 0 };
manifest.browserMode = headed ? 'headed; normal window bounds; explicit page.bringToFront before navigation' : 'headless; Playwright default launch flags';
manifest.launchOptions = { executablePath, headless: !headed, args: [], defaultFlags: 'Installed Playwright chromiumSwitches defaults; no frame-rate, timestamp or OS timing overrides.' };
manifest.completionProtocol = { version: 'literal-two-delivered-frames-v1', state: 'Start at synchronous semantic commit; deadline is commit + fixed profile project/tab token. Complete by the observed performance.now of the second delivered rAF callback at or after that deadline, and within 450ms of commit.', entry: 'Start immediately before original Element.animate; selected token is actual effect duration + delay. Complete by the observed performance.now of the second delivered rAF callback at or after start + token, and within 750ms of start.', invalid: 'Missing second callback is invalid. Cancelled effects fail the uninterrupted scenario.', cadence: 'Independent unchanged nearest-rank p95 cap: desktop 20ms, coarse 33.4ms. Frame timestamps measure cadence; callback performance.now measures delivered completion deadlines.', supersedes: 'Earlier fixed 33.4ms/66.8ms two-frame conversions are retained as diagnostic reports, not final completion acceptance.' };
Object.assign(manifest.completionProtocol, { version: 'all-owner-two-delivered-frames-v2', state: 'Synchronous featured:change capture is the single semantic commit. The existing component project/tab tokens remain strict and separate. Total settle includes every document WAAPI/CSS effect overlapping that commit or discovered through commit+450ms, with a two-frame observation tail. No effect prefix is excluded from total settle. Total must remain <=450ms from the original commit.', decoration: 'press100ms; settle/menu220ms; selection280ms. Strict token configuration plus two actual delivered frames from original Element.animate call. An intentionally superseded press is retained as cancelled and must stop within its deadline; it is not relabelled finished. Other cancellations fail.', scheduler: 'All window rAF/timer callbacks are counted, independent of effect owner; harness rAF uses saved natives. One-second idle and Off windows require no callback activity and no pending handles/effects. Promises, microtasks, workers, CSS rendering and other browser internals are not scheduler attribution; renderer task trace remains inclusive.' });
manifest.material = material;
manifest.legacyBaseline = legacyBaseline;
manifest.materialProtocol = legacyBaseline ? 'Frozen legacy source, request baseline-b translated only to its existing data-material=b QA switch. No glass owner, effective marker or foreground layout is injected. Actual wrapper diffusion must be 16px desktop /10px coarse; this historical geometry is not relabelled as the candidate foreground comparison.' : 'Current artifact: requested material, verified effective material, foreground layout and mounted glass owner must agree. Candidate baseline-b recipe is a separate matched-geometry material comparison.';
manifest.sharedAuditSha256 = createHash('sha256').update(await readFile(new URL('./measure-materials.mjs', import.meta.url))).digest('hex');
manifest.harnessSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const commandSession = await browser.newBrowserCDPSession();
manifest.actualCommandLine = await commandSession.send('Browser.getBrowserCommandLine').catch(error => ({ unavailable: String(error.message), note: 'Installed Playwright defaults omit --enable-automation; launchOptions and installed package version define the requested configuration.' }));
await commandSession.detach();
await writeFile(path.join(reportDirectory, `${scenario}-manifest.json`), JSON.stringify(manifest, null, 2));
const runs = [];
const errors = [];
const percentile = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function completionDeadline(start, selectedTokenMs, settle, observedFrames, hardCapMs) {
  const nominalDeadline = start + selectedTokenMs;
  const delivered = observedFrames.filter(frame => frame.observedAt >= nominalDeadline);
  if (!Number.isFinite(selectedTokenMs) || selectedTokenMs < 0 || !Number.isFinite(settle) || delivered.length < 2) throw new Error('Invalid completion sample: token, settle or second delivered frame missing.');
  const firstFrame = delivered[0], secondFrame = delivered[1];
  return { start, selectedTokenMs, nominalDeadline, firstFrame, secondFrame, settle, hardCapMs, elapsedMs: settle - start, withinTwoFrames: settle <= secondFrame.observedAt, withinHardCap: settle - start <= hardCapMs, passed: settle <= secondFrame.observedAt && settle - start <= hardCapMs };
}
async function newPage(profile, cold) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch, reducedMotion: profile.reducedMotion, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript(installMotionAudit);
  await page.addInitScript(({ material, legacyBaseline }) => {
    const apply = () => { if (!document.documentElement) return false; document.documentElement.dataset.material = legacyBaseline ? 'b' : material; if (!legacyBaseline) document.documentElement.dataset.glassLayout = 'foreground'; return true; };
    if (!apply()) { const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); }); observer.observe(document, { childList: true }); }
  }, { material, legacyBaseline });
  const cdp = await context.newCDPSession(page);
  let windowBounds;
  if (headed) {
    const window = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId: window.windowId, bounds: { windowState: 'normal' } });
    await page.bringToFront();
    windowBounds = await cdp.send('Browser.getWindowBounds', { windowId: window.windowId });
  }
  if (!headed) windowBounds = await cdp.send('Browser.getWindowForTarget').then(window => window.bounds).catch(error => ({ unavailable: String(error.message) }));
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (cold) await cdp.send('Network.emulateNetworkConditions', network);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  return { context, page, cdp, windowBounds };
}
async function inspectMaterial(page, profile) {
  const actual = await page.evaluate(() => ({ ...document.documentElement.dataset, shells: [...document.querySelectorAll('.header-controls,.project-choices')].map(node => ({ selector: node.className, wrapperFilter: getComputedStyle(node).backdropFilter, backingCount: node.querySelectorAll('[data-glass-backing]').length })) }));
  const expectedEffective = material === 'solid' ? 'solid' : material === 'baseline-b' ? 'baseline-b' : 'expressive-css';
  const passed = legacyBaseline ? actual.material === 'b' && !actual.glassMotionMounted && actual.shells.length > 0 && actual.shells.every(shell => shell.wrapperFilter === `blur(${profile.hasTouch ? 10 : 16}px)` && shell.backingCount === 0) : actual.material === material && actual.materialEffective === expectedEffective && actual.materialEffectiveVerified === 'true' && actual.glassLayout === 'foreground' && actual.glassMotionMounted === 'true' && actual.glassMotionFailed !== 'true';
  return { requested: material, legacyBaseline, actual, expectedEffective, passed };
}
async function coldRun(profile, route, iteration) {
  const { context, page, cdp } = await newPage(profile, true);
  try {
    const requests = new Map();
    cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, { url: event.request.url, type: event.type, bytes: 0 }));
    cdp.on('Network.responseReceived', event => { const item = requests.get(event.requestId); if (item) Object.assign(item, { status: event.response.status, mimeType: event.response.mimeType, cached: Boolean(event.response.fromDiskCache || event.response.fromServiceWorker) }); });
    cdp.on('Network.loadingFinished', event => { const item = requests.get(event.requestId); if (item) item.bytes = event.encodedDataLength; });
    cdp.on('Network.loadingFailed', event => { const item = requests.get(event.requestId); if (item) item.failure = event.errorText; });
    await page.addInitScript(() => {
      window.__componentCold = { lcp: 0, cls: 0, shifts: [], lcpElement: null };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) { window.__componentCold.lcp = entry.startTime; window.__componentCold.lcpElement = { tag: entry.element?.tagName, id: entry.element?.id, url: entry.url, time: entry.startTime }; } }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) { window.__componentCold.cls += entry.value; window.__componentCold.shifts.push({ time: entry.startTime, value: entry.value }); } }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${origin}${base}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    const materialCheck = await inspectMaterial(page, profile);
    const initialRequests = structuredClone([...requests.values()]);
    const metrics = await page.evaluate(() => ({ ...window.__componentCold, personalImageUrls: [...document.querySelectorAll('img[data-personal-media-id]')].map(image => image.currentSrc).filter(Boolean), modes: { ...document.documentElement.dataset, coarse: matchMedia('(pointer:coarse)').matches, hover: matchMedia('(hover:hover)').matches, reduced: matchMedia('(prefers-reduced-motion:reduce)').matches }, runningOwnedEffects: document.getAnimations().filter(animation => ['running', 'pending'].includes(animation.playState)).length, allOwnerAudit: window.__motionAudit.snapshot(), navigation: performance.getEntriesByType('navigation')[0]?.toJSON() }));
    for (let y = 0; y < await page.evaluate(() => document.documentElement.scrollHeight); y += profile.viewport.height) { await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(120); }
    await page.waitForLoadState('networkidle');
    const fullRequests = structuredClone([...requests.values()]);
    const initialBytes = initialRequests.reduce((sum, request) => sum + request.bytes, 0);
    const personalInitialBytes = initialRequests.filter(request => metrics.personalImageUrls.includes(request.url)).reduce((sum, request) => sum + request.bytes, 0);
    const resourceFailures = fullRequests.filter(request => request.failure || request.status >= 400);
    const run = { profile: profile.name, route, iteration, materialCheck, initialBytes, personalInitialBytes, fullScrollBytes: fullRequests.reduce((sum, request) => sum + request.bytes, 0), lcpLabMs: metrics.lcp, clsLab: metrics.cls, ...metrics, initialRequests, fullRequests, resourceFailures, passed: materialCheck.passed && initialBytes <= 500 * 1024 && metrics.lcp > 0 && metrics.lcp <= 2500 && metrics.cls <= .1 && !resourceFailures.length && metrics.modes.coarse === profile.hasTouch && metrics.modes.reduced === (profile.reducedMotion === 'reduce') && (profile.name !== 'reduced' || metrics.runningOwnedEffects === 0) };
    return run;
  } finally { await context.close(); }
}
function traceOccupancy(events, lab) {
  const anchor = events.find(event => event.name === 'cm-lab:anchor' && event.cat?.includes('blink.user_timing'));
  if (!anchor) throw new Error('Invalid trace: User Timing anchor missing.');
  const main = events.find(event => event.ph === 'M' && event.name === 'thread_name' && event.args?.name === 'CrRendererMain' && event.pid === anchor.pid && event.tid === anchor.tid);
  if (!main) throw new Error('Invalid trace: matching CrRendererMain metadata missing.');
  const relevant = events.filter(event => event.pid === main.pid && event.tid === main.tid && event.name === traceTaskName && event.cat?.split(',').includes('toplevel'));
  const stack = [];
  const tasks = [];
  for (const event of relevant.sort((a, b) => a.ts - b.ts)) {
    if (event.ph === 'X' && event.dur > 0) tasks.push([event.ts, event.ts + event.dur]);
    else if (event.ph === 'B') stack.push(event.ts);
    else if (event.ph === 'E' && stack.length) tasks.push([stack.pop(), event.ts]);
  }
  if (!tasks.length) throw new Error('Invalid trace: no top-level RunTask intervals.');
  const offset = anchor.ts - lab.anchor * 1000;
  const occupancy = [], cadence = [], boundaries = [];
  const clippedWork = (start, finish) => {
    const a = offset + start * 1000, b = offset + finish * 1000;
    const clipped = tasks.filter(task => task[1] > a && task[0] < b).map(task => [Math.max(a, task[0]), Math.min(b, task[1])]).sort((x, y) => x[0] - y[0]);
    let total = 0, end = a;
    for (const [left, right] of clipped) { total += Math.max(0, right - Math.max(left, end)); end = Math.max(end, right); }
    return total / 1000;
  };
  for (const action of lab.actions) {
    const inside = action.frames.filter(time => time >= action.commit && time <= action.settle);
    if (inside.length) boundaries.push({ commitToFirstRafMs: inside[0] - action.commit, setupOccupancyMs: clippedWork(action.commit, inside[0]), lastRafToSettleMs: action.settle - inside.at(-1), finalOccupancyMs: clippedWork(inside.at(-1), action.settle) });
  }
  for (const action of lab.actions) for (let i = 1; i < action.frames.length; i++) {
    const previous = action.frames[i - 1], current = action.frames[i];
    if (previous < action.commit || current > action.settle) continue;
    occupancy.push(clippedWork(previous, current)); cadence.push(current - previous);
  }
  if (occupancy.length <= 30) throw new Error(`Invalid active run: only ${occupancy.length} active-frame samples; more than 30 required.`);
  return { occupancySamplesMs: occupancy, cadenceSamplesMs: cadence, activeWorkP95Ms: percentile(occupancy), rafCadenceP95Ms: percentile(cadence), boundaries, sampleDefinition: 'Nearest-rank p95 of full rAF intervals contained in commit-to-settle. Initial commit-to-first-rAF and last-rAF-to-settle task occupancy are separately retained in boundaries, including synchronous visual setup.', renderer: { pid: main.pid, tid: main.tid }, taskCount: tasks.length, traceToPerformanceOffsetUs: offset };
}
async function featuredRun(profile, iteration) {
  const { context, page, cdp, windowBounds } = await newPage(profile, false);
  try {
    await page.goto(`${origin}${base}vi/`, { waitUntil: 'networkidle' });
    await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded();
    // Warm both real incoming image states before measuring interaction work.
    // Cold loading and late media behavior are measured by other scenarios.
    for (const project of ['quan-ly-kho', 'healthos']) {
      await page.locator(`button[data-project-choice="${project}"]`).click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-open-desk]:not([hidden]) [data-desk-panel]:not([hidden]) img')].every(image => image.complete && image.naturalWidth > 0));
      await page.locator('[data-open-desk]:not([hidden]) [data-desk-panel]:not([hidden]) img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    }
    await page.waitForTimeout(800);
    const materialCheck = await inspectMaterial(page, profile);
    const observedMode = await page.evaluate(windowBounds => ({ ...document.documentElement.dataset, coarse: matchMedia('(pointer:coarse)').matches, hover: matchMedia('(hover:hover)').matches, reduced: matchMedia('(prefers-reduced-motion:reduce)').matches, dpr: devicePixelRatio, visibility: document.visibilityState, focused: document.hasFocus(), windowBounds }), windowBounds);
    await cdp.send('Tracing.start', { categories: 'toplevel,devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
    await page.evaluate(() => {
      const lab = window.__componentLab = { anchor: performance.now(), actions: [], input: null, visibility: [], idle: [] };
      performance.mark('cm-lab:anchor', { startTime: lab.anchor });
      for (const type of ['pointerdown', 'click', 'keydown']) document.addEventListener(type, event => {
        if (event.isTrusted && event.target.closest('[data-project-choice], [data-panel]')) {
          if (type !== 'click') lab.gestureStart = performance.now();
          lab.input = { type, at: event.timeStamp, trusted: event.isTrusted, observed: performance.now() };
          performance.mark(`cm-lab:input:${lab.actions.length + 1}`, { startTime: event.timeStamp });
        }
      }, true);
      document.addEventListener('visibilitychange', () => lab.visibility.push({ state: document.visibilityState, time: performance.now() }));
      document.addEventListener('featured:change', event => {
        const audit = window.__motionAudit;
        audit.scan();
        const detail = event.detail;
        const action = { ...detail, scope: event.target.id || event.target.getAttribute?.('data-featured-projects') || event.target.tagName, input: lab.input, commit: performance.now(), settle: null, contentSettle: null, closedAt: null, frames: [], observedFrames: [], animationCount: 0, cancelledCount: 0, effects: [] };
        lab.actions.push(action);
        performance.mark(`cm-lab:${detail.revision}:commit`, { startTime: action.commit });
        const firstSerial = audit.records.length;
        const overlap = new Set(audit.records.filter(record => record.settle === null || record.start >= (lab.gestureStart || action.commit)).map(record => record.serial));
        audit.microtask(() => {
          let deadlineFrames = 0;
          const sample = time => {
            const now = performance.now();
            audit.scan(); action.frames.push(time); action.observedFrames.push({ timestamp: time, observedAt: now });
            // Observe the whole allowed interval, not merely the known owner's
            // nominal finish, so a late CSS transition cannot escape the total.
            if (now >= action.commit + 450 && ++deadlineFrames >= 2) {
              const effects = audit.records.filter(record => overlap.has(record.serial) || record.serial > firstSerial);
              action.effects = effects.map(record => ({ ...record }));
              const component = effects.filter(record => {
                const target = audit.refs.get(record.serial)?.effect?.target;
                return record.owner === 'component-motion' && record.id.endsWith(`:${detail.revision}`) && target instanceof Node && event.target.contains(target);
              });
              action.animationCount = component.length;
              action.cancelledCount = component.filter(record => record.cancelled).length;
              action.contentSettle = component.length && component.every(record => record.settle !== null) ? Math.max(...component.map(record => record.settle)) : null;
              action.closedAt = now;
              action.cssEvents = audit.events.filter(item => item.at >= action.commit && item.at <= now);
              const pendingCss = new Map();
              for (const item of action.cssEvents) {
                const key = `${item.type.startsWith('transition') ? 'transition' : 'animation'}:${item.targetSerial}:${item.property}`;
                if (item.type.endsWith('run') || item.type.endsWith('start')) pendingCss.set(key, item);
                else pendingCss.delete(key);
              }
              action.pendingCss = [...pendingCss.values()];
              const cssEnds = action.cssEvents.filter(item => /end$|cancel$/.test(item.type)).map(item => item.at);
              action.settle = effects.every(record => record.settle !== null) && !action.pendingCss.length ? Math.max(action.commit, ...effects.map(record => record.settle), ...cssEnds) : null;
              performance.mark(`cm-lab:${detail.revision}:observed`, { startTime: now });
              return;
            }
            audit.raf(sample);
          };
          audit.raf(sample);
        });
      }, true);
    });
    const actionStarted = Date.now();
    for (let cycle = 0; cycle < 3; cycle++) {
      const project = cycle % 2 === 0 ? 'quan-ly-kho' : 'healthos';
      await page.locator(`button[data-project-choice="${project}"]`).click();
      await page.waitForFunction(() => Boolean(window.__componentLab.actions.at(-1)?.closedAt));
      await page.waitForTimeout(200);
      await page.locator('[data-open-desk]:not([hidden]) [role="tab"][aria-selected="true"]').focus();
      await page.keyboard.press('Home');
      await page.waitForFunction(() => window.__componentLab.actions.at(-1)?.origin === 'tab' && Boolean(window.__componentLab.actions.at(-1)?.closedAt));
      await page.waitForTimeout(200);
    }
    const actionWindowMs = Date.now() - actionStarted;
    const idleBefore = await page.evaluate(() => window.__motionAudit.snapshot());
    await page.waitForTimeout(1000);
    const idleAfter = await page.evaluate(() => window.__motionAudit.snapshot());
    await page.evaluate(() => { document.documentElement.dataset.motionOff = 'true'; });
    await page.waitForTimeout(100);
    const offBefore = await page.evaluate(() => window.__motionAudit.snapshot());
    await page.waitForTimeout(1000);
    const off = await page.evaluate(() => ({ ...window.__motionAudit.snapshot(), rootOff: document.documentElement.dataset.motionOff }));
    const observedEnd = await page.evaluate(() => ({ coarse: matchMedia('(pointer:coarse)').matches, reduced: matchMedia('(prefers-reduced-motion:reduce)').matches, dpr: devicePixelRatio, visibility: document.visibilityState, focused: document.hasFocus() }));
    const lab = await page.evaluate(() => window.__componentLab);
    const traceDone = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const { stream } = await traceDone;
    let rawTrace = '';
    while (true) { const chunk = await cdp.send('IO.read', { handle: stream }); rawTrace += chunk.data; if (chunk.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    const tracePath = path.join(reportDirectory, `featured-${profile.name}-${iteration}.trace.json`);
    await writeFile(tracePath, rawTrace);
    await writeFile(path.join(reportDirectory, `featured-${profile.name}-${iteration}.actions.json`), JSON.stringify(lab, null, 2));
    if (lab.actions.length !== 6 || lab.actions.some(action => !action.animationCount || !action.settle || !action.input?.trusted || action.cancelledCount)) throw new Error('Invalid run: six genuinely animated, uncancelled trusted project/tab actions required.');
    const metric = traceOccupancy(JSON.parse(rawTrace).traceEvents, lab);
    const inputLatenciesMs = lab.actions.map(action => action.commit - action.input.at);
    if (inputLatenciesMs.some(value => value < 0 || value > 60_000)) throw new Error('Invalid input timestamp origin.');
    const settleTimesMs = lab.actions.map(action => action.settle - action.commit);
    const settleChecks = lab.actions.map(action => completionDeadline(action.commit, action.origin === 'project' ? profile.name === 'coarse' ? 300 : 380 : profile.name === 'coarse' ? 220 : 260, action.contentSettle, action.observedFrames, 450));
    const totalSettleChecks = lab.actions.map(action => ({ revision: action.revision, commit: action.commit, settle: action.settle, elapsedMs: action.settle - action.commit, effectCount: action.effects.length, pending: action.effects.filter(effect => effect.settle === null), passed: action.settle !== null && action.settle - action.commit <= 450 }));
    const decorationChecks = lab.actions.flatMap(action => action.effects.filter(effect => effect.owner === 'glass-motion').map(effect => {
      const kind = effect.id.split(':')[1], token = { press: 100, settle: 220, selection: 280, menu: 220 }[kind];
      const supersededPress = effect.cancelled && kind === 'press';
      const configured = effect.timing.duration === token && effect.timing.delay === 0 && effect.timing.iterations === 1 && effect.playbackRate === 1;
      const deadline = completionDeadline(effect.start, token, effect.settle, action.observedFrames, 450);
      return { revision: action.revision, id: effect.id, kind, configured, cancelled: effect.cancelled, supersededPress, ...deadline, passed: configured && deadline.passed && (!effect.cancelled || supersededPress) };
    }));
    const quiescent = snapshot => snapshot.activeEffects.length === 0 && Object.values(snapshot.pending).every(value => value === 0) && snapshot.callbacks.stringTimers === 0;
    const idlePassed = quiescent(idleBefore) && quiescent(idleAfter) && JSON.stringify(idleBefore) === JSON.stringify(idleAfter);
    const offPassed = quiescent(offBefore) && quiescent(off) && JSON.stringify(offBefore.callbacks) === JSON.stringify(off.callbacks) && offBefore.totalEffects === off.totalEffects;
    const run = {
      profile: profile.name, iteration, materialCheck, observedMode, observedEnd, actionWindowMs, completedCycles: 3,
      ...metric, inputLatenciesMs, settleTimesMs, settleChecks, totalSettleChecks, decorationChecks, lab, tracePath,
      idle: { before: idleBefore, after: idleAfter, passed: idlePassed, note: 'All app window rAF/timer callbacks and handles, all WAAPI/CSS effects; native harness sampling excluded.' },
      off: { before: offBefore, after: off, passed: offPassed }, hiddenObserved: lab.visibility.some(record => record.state === 'hidden'), hiddenStatus: 'This focused trace does not claim hidden lifecycle acceptance; use browser lifecycle evidence.',
      passed: materialCheck.passed && observedMode.coarse === profile.hasTouch && !observedMode.reduced && observedMode.dpr === profile.deviceScaleFactor && actionWindowMs <= seconds * 1000 && inputLatenciesMs.every(value => value <= 100) && settleChecks.every(check => check.passed) && totalSettleChecks.every(check => check.passed) && decorationChecks.every(check => check.passed) && metric.rafCadenceP95Ms <= (profile.name === 'coarse' ? 33.4 : 20) && idlePassed && offPassed,
    };
    return run;
  } finally { await context.close(); }
}
async function entryRun(profile, iteration) {
  const { context, page, cdp, windowBounds } = await newPage(profile, false);
  try {
    await cdp.send('Tracing.start', { categories: 'toplevel,devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
    await page.addInitScript(() => {
      const lab = window.__componentEntry = { anchor: performance.now(), animations: [], frames: [], observedFrames: [], sampling: false };
      performance.mark('cm-lab:anchor', { startTime: lab.anchor });
      const startSampling = () => {
        if (lab.sampling) return;
        const audit = window.__motionAudit;
        lab.sampling = true;
        let tail = 2;
        const sample = time => {
          const now = performance.now();
          audit.scan(); lab.frames.push(time); lab.observedFrames.push({ timestamp: time, observedAt: now });
          const pending = audit.records.some(item => item.settle === null && ['running', 'pending', 'paused'].includes(item.playState));
          const deadline = Math.max(lab.anchor, ...audit.records.map(item => item.start + Number(item.timing?.delay || 0) + Number(item.timing?.duration || 0)));
          if (pending || now < deadline) tail = 2;
          else if (--tail <= 0) { lab.sampling = false; return; }
          if (audit.records.some(item => item.settle === null && now - item.start > 1500)) { lab.sampling = false; lab.unsettled = true; return; }
          audit.raf(sample);
        };
        audit.raf(sample);
      };
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = original.apply(this, args);
        queueMicrotask(startSampling);
        return animation;
      };
      for (const name of ['animationstart', 'transitionrun']) document.addEventListener(name, startSampling, true);
    });
    const route = 'vi/about/';
    await page.goto(`${origin}${base}${route}`, { waitUntil: 'networkidle' });
    const materialCheck = await inspectMaterial(page, profile);
    const observedStart = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), coarse: matchMedia('(pointer:coarse)').matches, reduced: matchMedia('(prefers-reduced-motion:reduce)').matches, dpr: devicePixelRatio }));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = profile.viewport.height; y < height + profile.viewport.height; y += Math.round(profile.viewport.height * .65)) {
      if (profile.hasTouch) {
        const x = Math.round(profile.viewport.width * .5), fromY = Math.round(profile.viewport.height * .83);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
        for (let step = 1; step <= 24; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: fromY - step * profile.viewport.height * .65 / 24 }] }); await page.waitForTimeout(20); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else await page.mouse.wheel(0, Math.round(profile.viewport.height * .65));
      await page.waitForTimeout(500);
    }
    await page.waitForFunction(() => !window.__componentEntry.sampling);
    const observedEnd = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), coarse: matchMedia('(pointer:coarse)').matches, reduced: matchMedia('(prefers-reduced-motion:reduce)').matches, dpr: devicePixelRatio }));
    const lab = await page.evaluate(() => ({ ...window.__componentEntry, animations: window.__motionAudit.scan().map(item => ({ ...item, durationMs: Number(item.timing?.duration), delayMs: Number(item.timing?.delay) })), cssEvents: window.__motionAudit.events, audit: window.__motionAudit.snapshot(), material: { ...document.documentElement.dataset } }));
    const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve)); await cdp.send('Tracing.end');
    const { stream } = await complete;
    let trace = '';
    while (true) { const chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    const tracePath = path.join(reportDirectory, `entry-${profile.name}-${iteration}.trace.json`);
    await writeFile(tracePath, trace);
    const intervals = lab.animations.filter(item => item.settle && !item.cancelled).map(item => [item.start, item.settle]).sort((a, b) => a[0] - b[0]);
    const union = [];
    for (const interval of intervals) { const previous = union.at(-1); if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]); else union.push([...interval]); }
    const metric = traceOccupancy(JSON.parse(trace).traceEvents, { anchor: lab.anchor, actions: union.map(([commit, settle]) => ({ commit, settle, frames: lab.frames })) });
    const kinds = [...new Set(lab.animations.map(item => item.kind))];
    const entryChecks = lab.animations.map(item => item.cancelled || item.settle === null ? { id: item.id, cancelled: item.cancelled, pending: item.settle === null, passed: false, reason: 'Effect cancelled or still pending in the uninterrupted entry scenario.' } : { id: item.id, owner: item.owner, ...completionDeadline(item.start, item.durationMs + item.delayMs, item.settle, lab.observedFrames, 750) });
    return { profile: profile.name, iteration, route, materialCheck, observedStart, observedEnd, windowBounds, ...metric, lab, tracePath, kinds, entryChecks, passed: materialCheck.passed && !lab.unsettled && kinds.includes('story') && kinds.includes('topic') && kinds.includes('about-block') && observedStart.coarse === profile.hasTouch && !observedStart.reduced && entryChecks.every(check => check.passed) && metric.rafCadenceP95Ms <= (profile.name === 'coarse' ? 33.4 : 20), scope: 'Actual About navigation and native desktop wheel/coarse touch entries. Every observed WAAPI/CSS effect enters the interval union and completion check, including non-component owners. This is separate from the featured metric and does not claim a Home contact trace.' };
  } finally { await context.close(); }
}
try {
  measurementRuns: for (const profile of chosenProfiles) for (const route of scenario === 'cold' ? profile.routes : ['vi/']) for (let iteration = 1; iteration <= runCount; iteration++) {
    try {
      const run = scenario === 'cold' ? await coldRun(profile, route, iteration) : scenario === 'entry' ? await entryRun(profile, iteration) : await featuredRun(profile, iteration);
      runs.push(run);
      log(JSON.stringify(scenario === 'cold' ? { profile: profile.name, route, iteration, lcp: run.lcpLabMs, cls: run.clsLab, initialKiB: +(run.initialBytes / 1024).toFixed(1), passed: run.passed } : { profile: profile.name, iteration, activeWorkP95Ms: run.activeWorkP95Ms, rafCadenceP95Ms: run.rafCadenceP95Ms, actionWindowMs: run.actionWindowMs, passed: run.passed }));
    } catch (error) { errors.push({ profile: profile.name, route, iteration, error: String(error.stack || error) }); log(String(error)); }
    await writeFile(path.join(reportDirectory, `${scenario}-partial.json`), JSON.stringify({ manifest, runs, errors }, null, 2));
    if (process.env.QA_FAIL_FAST === '1' && (errors.length || runs.at(-1)?.passed === false)) break measurementRuns;
  }
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
const finalArtifactSha256 = await treeHash(root);
if (finalArtifactSha256 !== artifactSha256) errors.push({ error: 'Artifact mutated during measurement.' });
const finalSourceTreeSha256 = await treeHash(sourceRoot, sourceFiles);
if (finalSourceTreeSha256 !== sourceTreeSha256) errors.push({ error: 'Source mutated during measurement.' });
const elapsedMs = Date.now() - startedAt;
const report = { manifest, finalArtifactSha256, finalSourceTreeSha256, elapsedMs, numericLoopEligible: numberOnly && elapsedMs < 30_000 && !errors.length && runs.every(run => run.passed), runs, errors, passed: !errors.length && runs.every(run => run.passed), summary: chosenProfiles.map(profile => { const group = runs.filter(run => run.profile === profile.name); return scenario === 'cold' ? { profile: profile.name, samples: group.length, worstLcpLabMs: Math.max(...group.map(run => run.lcpLabMs)), worstClsLab: Math.max(...group.map(run => run.clsLab)), worstInitialBytes: Math.max(...group.map(run => run.initialBytes)) } : { profile: profile.name, samples: group.length, medianActiveWorkP95Ms: median(group.map(run => run.activeWorkP95Ms)), worstRafCadenceP95Ms: Math.max(...group.map(run => run.rafCadenceP95Ms)) }; }) };
await writeFile(path.join(reportDirectory, `${scenario}-performance.json`), JSON.stringify(report, null, 2));
if (!report.passed) throw new Error(`Measurement failed; inspect ${scenario}-performance.json (all raw failures retained).`);
if (numberOnly) {
  if (chosenProfiles.length !== 1) throw new Error('Numeric Verify requires MOTION_PROFILE=desktop or coarse, fixed before its baseline.');
  if (!report.numericLoopEligible) throw new Error(`Numeric dry-run took ${elapsedMs}ms; it is not eligible for a <30s loop.`);
  console.log(median(runs.map(run => run.activeWorkP95Ms)));
} else log(JSON.stringify({ report: path.join(reportDirectory, `${scenario}-performance.json`), summary: report.summary, passed: report.passed }));
