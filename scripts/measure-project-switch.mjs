import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

/** Measure the artifact's real picker while the second project's image response is held. */
export async function measureProjectSwitch({ browser, root, origin, base, reportDirectory, settings, artifactSha256 }) {
  const html = load(await readFile(path.join(root, 'vi/index.html'), 'utf8'));
  const articles = html('[data-featured-projects] [data-open-desk]').toArray();
  if (articles.length < 2) throw new Error('Project switch measurement requires two selected projects.');
  const firstId = html(articles[0]).attr('data-project-id');
  const secondId = html(articles[1]).attr('data-project-id');
  const targetImage = html(articles[1]).find('img').first();
  if (!targetImage.length) throw new Error('The second project needs an image for the slow-image measurement.');
  const delayedPaths = new Set([
    targetImage.attr('src'),
    ...(targetImage.attr('srcset') || '').split(',').map(candidate => candidate.trim().split(/\s+/)[0]),
  ].filter(Boolean).map(value => new URL(value, `${origin}${base}vi/`).pathname));
  const context = await browser.newContext({ viewport: settings.viewport, deviceScaleFactor: settings.deviceScaleFactor });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', settings.network);
  await session.send('Emulation.setCPUThrottlingRate', { rate: settings.cpuSlowdownMultiplier });
  const requests = new Map();
  const errors = [];
  const heldRequests = [];
  let releaseImages;
  const imageGate = new Promise(resolve => { releaseImages = resolve; });
  const startedAt = new Date().toISOString();
  page.on('pageerror', error => errors.push(error.message));
  session.on('Network.requestWillBeSent', event => requests.set(event.requestId, {
    url: event.request.url, type: event.type, bytes: 0, timestamp: event.timestamp,
  }));
  session.on('Network.responseReceived', event => {
    const item = requests.get(event.requestId);
    if (item) Object.assign(item, { status: event.response.status, mimeType: event.response.mimeType });
  });
  session.on('Network.loadingFinished', event => {
    const item = requests.get(event.requestId);
    if (item) Object.assign(item, { bytes: event.encodedDataLength, finishedAt: event.timestamp });
  });
  session.on('Network.loadingFailed', event => {
    const item = requests.get(event.requestId);
    if (item) item.failure = event.errorText;
  });
  await page.route('**/*', async route => {
    if (route.request().resourceType() === 'image' && delayedPaths.has(new URL(route.request().url()).pathname)) {
      heldRequests.push({ url: route.request().url(), interceptedAt: new Date().toISOString() });
      await imageGate;
    }
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__switchLab = { inputs: [], shifts: [] };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__switchLab.shifts.push({
        time: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
        sources: entry.sources.map(source => ({ node: source.node?.outerHTML?.slice(0, 250), previous: source.previousRect.toJSON(), current: source.currentRect.toJSON() })),
      });
    }).observe({ type: 'layout-shift', buffered: true });
    document.addEventListener('click', event => {
      const choice = event.target instanceof Element ? event.target.closest('button[data-project-choice]') : null;
      if (!choice) return;
      const inputAt = performance.now();
      window.__switchLab.inputs.push({ projectId: choice.dataset.projectChoice, inputAt });
    }, true);
    new MutationObserver(() => {
      const sample = window.__switchLab.inputs.at(-1);
      if (!sample || sample.stateAt !== undefined) return;
      const active = document.querySelector('[data-open-desk]:not([hidden])');
      if (active?.dataset.projectId !== sample.projectId) return;
      const stateAt = performance.now();
      Object.assign(sample, {
        stateAt, inputToStateMs: stateAt - sample.inputAt,
        selectedProjectId: active.dataset.projectId,
        layer: active.querySelector('[data-desk-panel]:not([hidden])')?.dataset.deskPanel,
        focusedChoice: document.activeElement?.getAttribute('data-project-choice'),
      });
      requestAnimationFrame(() => { sample.nextFrameAt = performance.now(); });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-disabled', 'aria-selected'] });
  });
  const snapshot = label => page.evaluate(label => {
    const active = document.querySelector('[data-open-desk]:not([hidden])');
    const image = active?.querySelector('img');
    const rect = element => element ? element.getBoundingClientRect().toJSON() : null;
    return {
      label, at: performance.now(), selectedProjectId: active?.dataset.projectId,
      layer: active?.querySelector('[data-desk-panel]:not([hidden])')?.dataset.deskPanel,
      title: active?.querySelector('h2')?.textContent,
      caseHref: active?.querySelector('.desk-footer a')?.getAttribute('href'),
      image: image ? { src: image.currentSrc || image.src, complete: image.complete, naturalWidth: image.naturalWidth, intrinsicWidth: image.getAttribute('width'), intrinsicHeight: image.getAttribute('height'), alt: image.alt, rect: rect(image) } : null,
      paperRect: rect(document.querySelector('.featured-paper')), articleRect: rect(active),
      focusedChoice: document.activeElement?.getAttribute('data-project-choice'), scrollY: window.scrollY,
    };
  }, label);
  try {
    await page.goto(`${origin}${base}vi/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    const initialResources = structuredClone([...requests.values()]);
    const initialHero = await snapshot('initial hero before scrolling');
    await page.locator(`[data-open-desk][data-project-id="${firstId}"] img`).scrollIntoViewIfNeeded();
    await page.waitForFunction(id => {
      const image = document.querySelector(`[data-open-desk][data-project-id="${id}"] img`);
      return image?.complete && image.naturalWidth > 0;
    }, firstId);
    await page.locator(`button[data-project-choice="${secondId}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(550);
    const resourcesBeforeSwitch = structuredClone([...requests.values()]);
    const before = await snapshot('before switch');
    await page.locator(`button[data-project-choice="${secondId}"]`).click();
    await page.waitForFunction(id => document.querySelector('[data-open-desk]:not([hidden])')?.getAttribute('data-project-id') === id, secondId);
    const whileDelayed = await snapshot('second project, image response held');
    await page.waitForTimeout(1200);
    if (!heldRequests.length) throw new Error('The slow-image trace did not intercept a second-project image request.');
    await page.locator(`button[data-project-choice="${firstId}"]`).click();
    const returnedBeforeLoad = await snapshot('first project restored before second image completes');
    const resourcesBeforeRelease = structuredClone([...requests.values()]);
    releaseImages();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(id => {
      const image = document.querySelector(`[data-open-desk][data-project-id="${id}"] img`);
      return image?.complete && image.naturalWidth > 0;
    }, secondId, { timeout: 60_000 });
    await page.waitForTimeout(550);
    const afterLateLoad = await snapshot('first project remains after late second-image response');
    await page.locator(`button[data-project-choice="${secondId}"]`).click();
    await page.evaluate(() => Promise.all([...document.images].filter(image => image.getClientRects().length > 0).map(image => image.decode())));
    await page.waitForTimeout(100);
    const afterLoad = await snapshot('second project after image decode');
    const browserMetrics = await page.evaluate(() => window.__switchLab);
    const finalResources = structuredClone([...requests.values()]);
    const failures = finalResources.filter(item => item.failure || item.status >= 400);
    const statesMatch = before.selectedProjectId === firstId && whileDelayed.selectedProjectId === secondId && returnedBeforeLoad.selectedProjectId === firstId && afterLateLoad.selectedProjectId === firstId && afterLoad.selectedProjectId === secondId;
    const dimensionsStable = Math.abs(whileDelayed.image.rect.width - afterLoad.image.rect.width) <= 1 && Math.abs(whileDelayed.image.rect.height - afterLoad.image.rect.height) <= 1;
    const inputsMatch = browserMetrics.inputs.every(input => input.projectId === input.selectedProjectId && input.layer === 'output' && input.focusedChoice === input.projectId);
    const report = {
      checkedAt: new Date().toISOString(), startedAt, artifactSha256, node: process.version, browser: browser.version(),
      settings, firstId, secondId, heldRequests,
      method: 'Fresh cold context with the same mobile CPU/network settings. Capture initial hero resources before scrolling, then scroll to the first project image and await only that image before returning to the picker. Second-project image response held until after A→B→A; content state measured after the click task, then again after late response. Every layout shift records recent-input status. No preload or production markup changes.',
      snapshots: [initialHero, before, whileDelayed, returnedBeforeLoad, afterLateLoad, afterLoad],
      browserMetrics, initialResources, resourcesBeforeSwitch, resourcesBeforeRelease, finalResources,
      bytes: { initial: initialResources.reduce((sum, item) => sum + item.bytes, 0), beforeSwitch: resourcesBeforeSwitch.reduce((sum, item) => sum + item.bytes, 0), final: finalResources.reduce((sum, item) => sum + item.bytes, 0) },
      statesMatch, dimensionsStable, inputsMatch, errors, failures,
      passed: statesMatch && dimensionsStable && inputsMatch && !errors.length && !failures.length,
      scope: 'Input-to-DOM-state and next animation-frame observations are lab timings, not field INP. Input-related shifts remain in this trace even when excluded by the CLS metric.',
    };
    await writeFile(path.join(reportDirectory, 'switch-performance.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ switchMeasurement: report.passed, statesMatch, dimensionsStable, inputsMatch, inputToStateMs: browserMetrics.inputs.map(input => input.inputToStateMs), bytes: report.bytes, report: path.join(reportDirectory, 'switch-performance.json') }));
    if (!report.passed) throw new Error('Project switch measurement failed; inspect switch-performance.json.');
  } finally {
    releaseImages();
    await context.close();
  }
}
