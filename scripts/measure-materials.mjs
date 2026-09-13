import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const network = { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, connectionType: 'cellular3g' };
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, cpu: 1, cap: 20 },
  { name: 'coarse', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, cpu: 4, cap: 33.4 },
];
async function files(directory) { return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat(); }
async function treeHash(directory) { const hash = createHash('sha256'); for (const file of (await files(directory)).sort()) hash.update(path.relative(directory, file).replaceAll('\\', '/')).update('\0').update(await readFile(file)); return hash.digest('hex'); }
const percentile95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];

/** Browser init hook shared by the three QA harnesses. No idle polling loop. */
export function installMotionAudit() {
  if (window.__motionAudit) return;
  const native = {
    raf: requestAnimationFrame.bind(window), cancelRaf: cancelAnimationFrame.bind(window),
    timeout: setTimeout.bind(window), clearTimeout: clearTimeout.bind(window),
    interval: setInterval.bind(window), clearInterval: clearInterval.bind(window),
    microtask: queueMicrotask.bind(window), animate: Element.prototype.animate, play: Animation.prototype.play,
  };
  const pending = { raf: new Set(), timeout: new Set(), interval: new Set() };
  const counts = { rafScheduled: 0, rafFired: 0, timeoutScheduled: 0, timeoutFired: 0, intervalScheduled: 0, intervalFired: 0, stringTimers: 0 };
  window.requestAnimationFrame = callback => {
    counts.rafScheduled++;
    const handle = native.raf(time => { pending.raf.delete(handle); counts.rafFired++; callback.call(window, time); });
    pending.raf.add(handle); return handle;
  };
  window.cancelAnimationFrame = handle => { pending.raf.delete(handle); native.cancelRaf(handle); };
  for (const kind of ['timeout', 'interval']) {
    window[kind === 'timeout' ? 'setTimeout' : 'setInterval'] = (callback, delay, ...args) => {
      counts[`${kind}Scheduled`]++;
      if (typeof callback !== 'function') counts.stringTimers++;
      let handle;
      const wrapped = typeof callback === 'function' ? (...values) => {
        if (kind === 'timeout') pending.timeout.delete(handle);
        counts[`${kind}Fired`]++; return callback.apply(window, values);
      } : callback;
      handle = native[kind](wrapped, delay, ...args); pending[kind].add(handle); return handle;
    };
  }
  // HTML timers share a handle pool; either clearing API can clear either kind.
  for (const method of ['clearTimeout', 'clearInterval']) window[method] = handle => {
    pending.timeout.delete(handle); pending.interval.delete(handle); native[method](handle);
  };
  const records = [], refs = new Map(), seen = new WeakMap(), listeners = new Set(), events = [], targets = new WeakMap();
  let targetSequence = 0;
  const targetSerial = target => { if (!target || typeof target !== 'object') return null; if (!targets.has(target)) targets.set(target, ++targetSequence); return targets.get(target); };
  const targetName = target => target instanceof Element ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${[...target.classList].map(name => `.${name}`).join('')}${['data-glass-backing', 'data-glass-rim', 'data-glass-selector'].filter(name => target.hasAttribute(name)).map(name => `[${name}]`).join('')}` : String(target);
  const update = (animation, record) => {
    const timing = animation.effect?.getTiming();
    const target = animation.effect?.target;
    record.id = animation.id || '';
    record.type = animation.constructor.name;
    record.owner = record.id.startsWith('component-motion:') ? 'component-motion' : record.id.startsWith('glass-motion:') ? 'glass-motion' : record.type;
    record.target = targetName(target);
    record.targetSerial = targetSerial(target);
    record.kind = target instanceof Element ? target.getAttribute('data-component-motion') : null;
    record.timing = timing ? { duration: timing.duration, delay: timing.delay, endDelay: timing.endDelay, iterations: timing.iterations, fill: timing.fill, easing: timing.easing } : null;
    record.playbackRate = animation.playbackRate;
    record.playState = animation.playState;
    record.animationName = animation.animationName || null;
    record.transitionProperty = animation.transitionProperty || null;
    // CSS start is recovered from its document timeline, including its delay.
    if (!record.invoked && typeof animation.startTime === 'number') record.start = animation.startTime;
    return record;
  };
  const register = (animation, invokedAt) => {
    if (seen.has(animation)) return update(animation, seen.get(animation));
    const record = { serial: records.length + 1, start: invokedAt ?? performance.now(), observedAt: performance.now(), invoked: invokedAt !== undefined, settle: null, cancelled: false };
    records.push(record); seen.set(animation, record); refs.set(record.serial, animation); update(animation, record);
    animation.finished.then(() => { update(animation, record); record.settle = performance.now(); }, () => { update(animation, record); record.settle = performance.now(); record.cancelled = true; });
    native.microtask(() => { update(animation, record); listeners.forEach(listener => listener(record)); });
    return record;
  };
  const scan = () => { for (const animation of document.getAnimations()) register(animation); return records; };
  Element.prototype.animate = function (...args) { const start = performance.now(); const animation = native.animate.apply(this, args); register(animation, start); return animation; };
  Animation.prototype.play = function (...args) { const start = performance.now(); const value = native.play.apply(this, args); register(this, start); return value; };
  for (const name of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend', 'transitioncancel']) {
    document.addEventListener(name, event => { events.push({ type: event.type, at: performance.now(), target: targetName(event.target), targetSerial: targetSerial(event.target), elapsedTime: event.elapsedTime, property: event.propertyName || event.animationName }); scan(); }, true);
  }
  window.__motionAudit = {
    records, events, scan, refs, onEffect: listener => listeners.add(listener),
    raf: native.raf, cancelRaf: native.cancelRaf, microtask: native.microtask,
    snapshot: () => {
      scan();
      return { callbacks: { ...counts }, pending: Object.fromEntries(Object.entries(pending).map(([name, handles]) => [name, handles.size])), activeEffects: records.filter(record => record.settle === null && ['running', 'pending', 'paused'].includes(record.playState)).map(record => ({ ...record })), totalEffects: records.length };
    },
  };
}

/** Supplementary native-scroll cadence, never a substitute for cold/featured/entry. */
export async function runMaterialComparison({ origin, reportDirectory, runCount = 3, outputDirectory = process.env.OUTPUT_DIR || 'dist' }) {
  if (!origin || !reportDirectory || !Number.isInteger(runCount) || runCount < 3) throw new Error('An origin, new report directory and at least three runs are required.');
  const output = path.resolve(outputDirectory);
  reportDirectory = path.resolve(reportDirectory);
  await mkdir(reportDirectory, { recursive: true });
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  const artifactSha256 = await treeHash(output);
  const sourceDirectory = path.resolve(process.env.SOURCE_DIR || '.', 'src');
  const sourceSha256 = await treeHash(sourceDirectory);
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  const manifest = { checkedAt: new Date().toISOString(), artifactSha256, sourceSha256, sourceDirectory, outputDirectory: output, node: process.version, browser: browser.version(), executablePath, origin, runCount, modes: ['baseline-b', 'expressive-css', 'solid'], supportedRequests: ['baseline-b', 'expressive-css', 'expressive-refractive', 'solid'], deferredMode: 'expressive-refractive is checked as CSS fallback by browser tests, not benchmarked as a fourth recipe', profiles, network, cache: 'fresh context; cache disabled; service workers blocked', probe: 'Trusted desktop wheel or CDP touch gesture on Home; predetermined leg count = ceil(scrollMax/480)+1 per direction, identical mode geometry; down to Contact and back to header. Cadence covers first-through-last actual movement per leg including intervening stalled frames; boundary-only legs retained but not cadence samples. More than 30 samples, nearest-rank p95. No video or screenshot tracing during cadence; initial still is outside cadence. Separate from renderer task occupancy, GPU FPS and field INP. Requested C must report its current CSS fallback; this does not score refraction.', harnessSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex') };
  await writeFile(path.join(reportDirectory, 'materials-manifest.json'), JSON.stringify(manifest, null, 2));
  const runs = [], errors = [], geometryByProfile = new Map();
  try {
    measurementRuns: for (const profile of profiles) for (const mode of manifest.modes) for (let iteration = 1; iteration <= runCount; iteration++) {
      const name = `${profile.name}-${mode}-${iteration}`;
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch, reducedMotion: 'no-preference', serviceWorkers: 'block' });
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      try {
        await context.tracing.start({ screenshots: false, snapshots: false });
        await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.emulateNetworkConditions', network); await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        await page.addInitScript(mode => {
          const apply = () => { document.documentElement.dataset.material = mode; document.documentElement.dataset.glassLayout = 'foreground'; };
          const observer = new MutationObserver(() => { if (document.documentElement) { apply(); observer.disconnect(); } });
          observer.observe(document, { childList: true });
          if (document.documentElement) { apply(); observer.disconnect(); }
        }, mode);
        await page.goto(new URL('vi/', origin.endsWith('/') ? origin : `${origin}/`).href, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
        const actual = await page.evaluate(() => {
          const paint = (node, pseudo = null) => { const style = getComputedStyle(node, pseudo); return { filter: style.backdropFilter || style.webkitBackdropFilter || 'none', foregroundFilter: style.filter, opacity: style.opacity, display: style.display, visibility: style.visibility, content: style.content, tint: style.backgroundColor }; };
          const visibleSampler = item => item.filter !== 'none' && item.display !== 'none' && item.visibility !== 'hidden' && Number(item.opacity) !== 0;
          return { ...document.documentElement.dataset, coarse: matchMedia('(pointer:coarse)').matches, transparency: matchMedia('(prefers-reduced-transparency:reduce)').matches, support: CSS.supports('backdrop-filter', 'blur(1px)'), dpr: devicePixelRatio, visibility: document.visibilityState,
            shells: [...document.querySelectorAll('.header-controls,.project-choices')].map(element => {
              const nodes = [element, ...element.querySelectorAll('*')];
              const samplers = nodes.flatMap(node => [null, '::before', '::after'].map(pseudo => ({ tag: node.tagName, className: node.className, backing: node.hasAttribute('data-glass-backing'), pseudo, ...paint(node, pseudo), visible: node.getClientRects().length > 0 }))).filter(item => item.visible && (item.pseudo === null || !['none', 'normal'].includes(item.content)) && visibleSampler(item));
              return { className: element.className, bounds: element.getBoundingClientRect().toJSON(), ...paint(element), backings: [...element.querySelectorAll('[data-glass-backing]')].map(node => ({ bounds: node.getBoundingClientRect().toJSON(), ...paint(node) })), samplers, labels: [...element.querySelectorAll('a,button')].map(node => ({ text: node.textContent.trim(), ...paint(node) })) };
            }) };
        });
        await page.screenshot({ path: path.join(reportDirectory, `${name}-initial.png`), fullPage: true });
        const routeGeometry = await page.evaluate(() => ({ scrollMax: document.documentElement.scrollHeight - innerHeight, height: innerHeight, landmarks: ['.site-header', '[data-featured-projects]', '#contact'].map(selector => { const rect = document.querySelector(selector).getBoundingClientRect(); return { selector, top: rect.top + scrollY, bottom: rect.bottom + scrollY }; }) }));
        const content = await page.evaluate(() => ({ text: document.querySelector('main').textContent, media: [...document.querySelectorAll('main img')].map(image => [image.getAttribute('src'), image.getAttribute('srcset'), image.getAttribute('sizes')]) }));
        const geometryAndContentSha256 = createHash('sha256').update(JSON.stringify({ shells: actual.shells.map(shell => shell.bounds), routeGeometry, content })).digest('hex');
        if (!geometryByProfile.has(profile.name)) geometryByProfile.set(profile.name, geometryAndContentSha256);
        const matchedGeometryAndContent = geometryByProfile.get(profile.name) === geometryAndContentSha256;
        const legs = [], downLegCount = Math.ceil(routeGeometry.scrollMax / 480) + 1;
        for (let leg = 0; leg < downLegCount * 2; leg++) {
          await page.evaluate(hasTouch => {
            window.__materialScroll = { active: true, frames: [], positions: [], trusted: [], startedAt: performance.now() };
            const lab = window.__materialScroll;
            const input = event => { lab.trusted.push({ type: event.type, trusted: event.isTrusted, at: performance.now() }); };
            lab.inputType = hasTouch ? 'touchstart' : 'wheel'; lab.inputHandler = input;
            document.addEventListener(lab.inputType, input, { passive: true, once: true });
            const frame = time => { lab.frames.push(time); lab.positions.push(scrollY); if (lab.active) lab.raf = requestAnimationFrame(frame); };
            lab.raf = requestAnimationFrame(frame);
          }, profile.hasTouch);
          const direction = leg < downLegCount ? 1 : -1;
          if (profile.hasTouch) {
            // Browser-native touch input through CDP, not programmatic scrollTo.
            const x = Math.round(profile.viewport.width * .5), startY = direction > 0 ? 700 : 160;
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
            for (let step = 1; step <= 24; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - direction * step * 20 }] }); await page.waitForTimeout(20); }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else {
            for (let step = 0; step < 12; step++) { await page.mouse.wheel(0, direction * 44); await page.waitForTimeout(40); }
          }
          await page.waitForTimeout(120);
          const lab = await page.evaluate(() => { const lab = window.__materialScroll; lab.active = false; cancelAnimationFrame(lab.raf); document.removeEventListener(lab.inputType, lab.inputHandler); const { inputHandler, raf, ...data } = lab; return data; });
          const changed = lab.positions.map((position, index) => index > 0 && Math.abs(position - lab.positions[index - 1]) > .1 ? index : -1).filter(index => index >= 0);
          const first = changed[0], last = changed.at(-1);
          const intervals = changed.length ? lab.frames.slice(first, last + 1).map((time, index) => time - lab.frames[first + index - 1]) : [];
          const boundaryOnly = !changed.length && (direction > 0 ? lab.positions.every(position => position >= routeGeometry.scrollMax - 2) : lab.positions.every(position => position <= 2));
          legs.push({ leg, direction, ...lab, cadenceSamplesMs: intervals, movingIntervals: intervals.length, boundaryOnly });
        }
        const samples = legs.flatMap(leg => leg.cadenceSamplesMs), p95 = percentile95(samples);
        const expectedEffective = mode === 'solid' ? 'solid' : mode === 'baseline-b' ? 'baseline-b' : 'expressive-css';
        const expectedFilter = expectedEffective === 'solid' ? 'none' : `blur(${profile.hasTouch ? 10 : expectedEffective === 'baseline-b' ? 16 : 12}px)`;
        const materialCheck = { requested: actual.material === mode, effective: actual.materialEffective === expectedEffective, verified: actual.materialEffectiveVerified === 'true', foreground: actual.glassLayout === 'foreground', mounted: actual.glassMotionMounted === 'true' && actual.glassMotionFailed !== 'true',
          shells: actual.shells.map(shell => ({ className: shell.className, exactlyOneBacking: shell.backings.length === 1, expectedFilter, backingFilter: shell.backings.every(item => item.filter === expectedFilter), samplerCount: shell.samplers.length, expectedSamplerCount: expectedEffective === 'solid' ? 0 : 1, samplerOnBacking: shell.samplers.every(item => item.backing && item.pseudo === null), wrapperClear: shell.filter === 'none' && shell.foregroundFilter === 'none' && Number(shell.opacity) === 1, labelsClear: shell.labels.every(label => label.filter === 'none' && label.foregroundFilter === 'none' && Number(label.opacity) === 1) })) };
        materialCheck.passed = materialCheck.requested && materialCheck.effective && materialCheck.verified && materialCheck.foreground && materialCheck.mounted && materialCheck.shells.length === 2 && materialCheck.shells.every(shell => shell.exactlyOneBacking && shell.backingFilter && shell.samplerCount === shell.expectedSamplerCount && shell.samplerOnBacking && shell.wrapperClear && shell.labelsClear);
        await context.tracing.stop({ path: path.join(reportDirectory, `${name}.playwright.zip`) });
        const positions = legs.flatMap(leg => leg.positions), minScroll = Math.min(...positions), maxScroll = Math.max(...positions);
        const coverage = { ...routeGeometry, downLegCount, minScroll, maxScroll, finalScroll: positions.at(-1), visited: routeGeometry.landmarks.map(landmark => ({ ...landmark, reached: positions.some(position => landmark.top < position + routeGeometry.height && landmark.bottom > position) })) };
        const run = { profile: profile.name, mode, iteration, actual, materialCheck, legs, coverage, geometryAndContentSha256, matchedGeometryAndContent, cadenceSamplesMs: samples, rafCadenceP95Ms: p95, sampleCount: samples.length, capMs: profile.cap, trustedInputs: legs.flatMap(leg => leg.trusted), movedLegs: legs.filter(leg => leg.movingIntervals > 0).length, passed: matchedGeometryAndContent && samples.length > 30 && Number.isFinite(p95) && p95 <= profile.cap && materialCheck.passed && actual.coarse === profile.hasTouch && legs.every(leg => leg.trusted.some(input => input.trusted) && (leg.movingIntervals > 0 || leg.boundaryOnly)) && maxScroll >= routeGeometry.scrollMax - 2 && positions.at(-1) <= 2 && coverage.visited.every(landmark => landmark.reached) };
        await context.close();
        runs.push(run);
        console.log(JSON.stringify({ profile: profile.name, mode, iteration, samples: samples.length, p95, passed: run.passed }));
      } catch (error) { errors.push({ profile: profile.name, mode, iteration, error: String(error.stack || error) }); await context.close().catch(() => undefined); }
      await writeFile(path.join(reportDirectory, 'materials-partial.json'), JSON.stringify({ manifest, runs, errors }, null, 2));
      if (process.env.QA_FAIL_FAST === '1' && (errors.length || runs.at(-1)?.passed === false)) break measurementRuns;
    }
  } finally { await browser.close(); }
  if (await treeHash(output) !== artifactSha256) errors.push({ error: 'Artifact mutated during material comparisons.' });
  if (await treeHash(sourceDirectory) !== sourceSha256) errors.push({ error: 'Source mutated during material comparisons.' });
  const summary = profiles.flatMap(profile => manifest.modes.map(mode => { const group = runs.filter(run => run.profile === profile.name && run.mode === mode); return { profile: profile.name, mode, runs: group.length, worstRafP95Ms: group.length ? Math.max(...group.map(run => run.rafCadenceP95Ms)) : null, passed: group.length === runCount && group.every(run => run.passed) }; }));
  const result = { manifest, runs, errors, summary, passed: errors.length === 0 && runs.length === profiles.length * manifest.modes.length * runCount && summary.every(group => group.passed) };
  await writeFile(path.join(reportDirectory, 'materials-performance.json'), JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(process.env.OUTPUT_DIR || 'dist');
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    try {
      let file = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
      if (!file.startsWith(`${root}${path.sep}`) && file !== root) throw new Error('Outside artifact');
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      let body = await readFile(file); const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      if (/\.(html|css|js|svg)$/.test(file) && request.headers['accept-encoding']?.includes('gzip')) { body = gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
      response.writeHead(200, { ...headers, 'Content-Length': body.length }).end(body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runMaterialComparison({ origin: `http://127.0.0.1:${server.address().port}/`, reportDirectory: process.env.QA_REPORT_DIR || '.qa/local', runCount: 3, outputDirectory: root });
    if (!result.passed) process.exitCode = 1;
  } finally { await new Promise(resolve => server.close(resolve)); }
}
