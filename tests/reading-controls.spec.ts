import { test, expect, chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browserExecutablePath } from './helpers/browser-executable';

const entries = ['work/healthos/', 'work/quan-ly-kho/', 'notes/process-is-not-readiness/'];
const active = '[data-open-desk]:not([hidden])';
const owned = (page: Page) => page.evaluate(() => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).length);
type ClipboardState = { copies: { text: string; resolve: () => void; reject: (error: Error) => void }[] };

async function nativeScrollSettled(page: Page) {
  let previous = Number.NaN;
  let stable = 0;
  // Observe native scrolls from Node: timers inside a JS-disabled page do not run.
  // Three unchanged samples separate history restoration/focus from activation.
  await expect.poll(async () => {
    const current = await page.evaluate(() => scrollY);
    stable = Math.abs(current - previous) < 1 ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
  return previous;
}

async function deferredClipboard(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as ClipboardState;
    state.copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: (text: string) => new Promise<void>((resolve, reject) => { state.copies.push({ text, resolve, reject }); }),
    } });
  });
}

for (const locale of ['vi', 'en']) test(`${locale}: case and note heading fragments survive no-JS click, reload and back`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const entry of entries) {
    await page.goto(`${locale}/${entry}`);
    const original = page.url();
    const link = page.locator('.prose .heading-link').first();
    const href = await link.getAttribute('href');
    expect(href?.startsWith('#')).toBe(true);
    const id = href!.slice(1);
    expect(await page.locator('[id]').evaluateAll((nodes, expected) => nodes.filter(node => node.id === expected).length, id)).toBe(1);
    await expect(page.locator('.copy-heading').first()).toBeHidden();
    await expect(page.locator('[data-motion-preference]')).toHaveCount(0);
    await link.focus();
    await nativeScrollSettled(page);
    await expect(link).toBeInViewport();
    await page.keyboard.press('Enter');
    expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(id);
    await expect(link).toBeInViewport();
    await page.reload();
    expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(id);
    await expect(link).toBeInViewport();
    await page.goBack();
    expect(page.url()).toBe(original);
    await nativeScrollSettled(page);
    const supplementalLink = page.locator(`a.heading-link[href="#${entry.startsWith('work/') ? 'project-evidence' : 'note-references'}"]`);
    await expect(supplementalLink).toHaveCount(1);
    const supplemental = (await supplementalLink.getAttribute('href'))!.slice(1);
    expect(supplemental).not.toBe(id);
    expect(await page.locator('[id]').evaluateAll((nodes, expected) => nodes.filter(node => node.id === expected).length, supplemental)).toBe(1);
    // Playwright's pointer actionability retry uses page timers, which cannot
    // progress in a JavaScript-disabled document after a smooth Back scroll.
    // Native keyboard activation exercises the same real fragment without it.
    await supplementalLink.focus();
    await nativeScrollSettled(page);
    await expect(supplementalLink).toBeFocused();
    await expect(supplementalLink).toBeInViewport();
    await page.keyboard.press('Enter');
    expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(supplemental);
    await expect(supplementalLink).toBeInViewport();
  }
  await context.close();
});

for (const locale of ['vi', 'en']) for (const entry of ['work/healthos/', 'notes/process-is-not-readiness/']) for (const outcome of ['success', 'denied']) {
  test(`${locale}/${entry}: copy ${outcome} reflects the settled clipboard promise and preserves focus`, async ({ page }, info) => {
    await deferredClipboard(page);
    await page.goto(`${locale}/${entry}`);
    const original = page.url();
    // Preserve the heading-copy journey; figure-copy has its own UX scenarios.
    const copy = page.locator('.heading-group [data-copy-fragment]').first();
    const status = page.locator('[data-reading-status]');
    const feedback = copy.locator('..').locator('[data-copy-feedback]');
    await expect(copy).toBeVisible();
    const expected = new URL(original);
    expected.hash = (await copy.getAttribute('data-copy-fragment'))!;
    await copy.click();
    await expect(copy).toBeFocused();
    await expect.poll(() => page.evaluate(() => (window as unknown as ClipboardState).copies.length)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as ClipboardState).copies[0].text)).toBe(expected.href);
    await expect(status).toHaveText('');
    await expect(feedback).toHaveText('');
    expect(page.url()).toBe(original);
    await page.evaluate(outcome => {
      const pending = (window as unknown as ClipboardState).copies[0];
      if (outcome === 'success') pending.resolve();
      else pending.reject(new DOMException('Permission denied', 'NotAllowedError'));
    }, outcome);
    const expectedStatus = await status.getAttribute(outcome === 'success' ? 'data-success' : 'data-failure');
    await expect(status).toHaveText(expectedStatus!);
    await expect(feedback).toHaveText(expectedStatus!);
    await expect(feedback).toBeVisible();
    await expect(feedback).toBeInViewport();
    await expect(copy).toBeFocused();
    expect(page.url()).toBe(original);
    await page.screenshot({ path: info.outputPath(`copy-${outcome}-feedback.png`) });
    if (outcome === 'denied') {
      await copy.locator('..').locator('.heading-link').click();
      expect(page.url()).toBe(expected.href);
    }
  });
}

test('an older clipboard rejection cannot replace the newer successful copy status', async ({ page }) => {
  await deferredClipboard(page);
  await page.goto('en/work/healthos/');
  await page.locator('[data-copy-fragment]').nth(0).click();
  await page.locator('[data-copy-fragment]').nth(1).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as ClipboardState).copies.length)).toBe(2);
  await page.evaluate(() => (window as unknown as ClipboardState).copies[1].resolve());
  const status = page.locator('[data-reading-status]');
  await expect(status).toHaveText('Link copied.');
  await page.evaluate(() => (window as unknown as ClipboardState).copies[0].reject(new Error('Old request')));
  await expect(status).toHaveText('Link copied.');
});

for (const locale of ['vi', 'en']) for (const entry of entries) test(`${locale}/${entry}: actual tables keep semantics and keyboard scrolling at 320px and 200% text, with complete print context`, async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${locale}/${entry}`);
  const regions = page.locator('.table-scroll');
  expect(await regions.count()).toBeGreaterThan(0);
  const before = await page.locator('.table-scroll table').allTextContents();
  for (const enlarged of [false, true]) {
    if (enlarged) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const region of await regions.all()) {
      await expect(region).toHaveAttribute('role', 'region');
      await expect(region).toHaveAttribute('tabindex', '0');
      const caption = (await region.locator('caption').textContent())!.trim();
      expect(caption.length).toBeGreaterThan(0);
      await expect(region).toHaveAttribute('aria-label', caption);
      expect(await region.locator('thead th').count()).toBeGreaterThan(0);
      expect(await region.locator('thead th:not([scope="col"])').count()).toBe(0);
      expect(await region.locator('tbody th[scope="row"]').count()).toBe(await region.locator('tbody tr').count());
      const guidance = region.locator('xpath=preceding-sibling::*[1]');
      await expect(guidance).toBeVisible();
      await expect(guidance).toContainText(locale === 'vi' ? 'Cuộn ngang' : 'Scroll sideways');
      const cells = await region.locator('tbody td').count();
      expect(cells).toBeGreaterThan(0);
      await region.scrollIntoViewIfNeeded();
      await region.evaluate(element => { element.scrollLeft = 0; });
      await region.focus();
      await expect(region).toBeFocused();
      expect(await region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
  }
  expect(await page.locator('.table-scroll table').allTextContents()).toEqual(before);
  await page.screenshot({ path: info.outputPath('table-320-text200.png') });
  await page.emulateMedia({ media: 'print' });
  const print = page.locator('.print-context');
  await expect(print).toBeVisible();
  await expect(print).toContainText('Nguyễn Văn Nam');
  await expect(print).toContainText(`/${locale}/${entry}`);
  await expect(print).toContainText(locale === 'vi' ? 'Bản xem trước cục bộ' : 'Local preview');
  await expect(print).not.toContainText(/https?:\/\//);
  if (entry.startsWith('work/')) await expect(print.locator('time')).toHaveAttribute('datetime', '2026-09-11');
  else await expect(print.locator('time')).toHaveCount(0);
  await expect(page.locator('.copy-heading').first()).toBeHidden();
  await expect(page.locator('[data-motion-preference]')).toHaveCount(0);
  expect(await page.locator('.table-scroll table').allTextContents()).toEqual(before);
  expect(await regions.evaluateAll(elements => elements.every(element => getComputedStyle(element).overflowX === 'visible'))).toBe(true);
  expect(await print.evaluate(element => ['static', 'relative'].includes(getComputedStyle(element).position))).toBe(true);
  await expect(page.locator('.reading-estimate')).toHaveText(locale === 'vi' ? /^Khoảng \d+ phút đọc$/ : /^About \d+ min read$/);
  if (entry.startsWith('notes/')) await page.pdf({ path: info.outputPath('note-print.pdf'), format: 'A4', printBackground: true });
});

test('stored Off is applied before motion initialization and persists through reload and native locale navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    if (!localStorage.getItem('open-desk-motion')) localStorage.setItem('open-desk-motion', 'off');
    const state = window as unknown as { ownedStarts: number };
    state.ownedStarts = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = original.apply(this, args);
      queueMicrotask(() => { if (animation.id.startsWith('component-motion:')) state.ownedStarts += 1; });
      return animation;
    };
  });
  await page.goto('vi/');
  await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
  await expect(page.locator('[data-motion-preference]')).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  expect(await page.evaluate(() => (window as unknown as { ownedStarts: number }).ownedStarts)).toBe(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
  expect(await owned(page)).toBe(0);
  await page.locator('header a[href$="/en/"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
  await expect(page.locator('[data-motion-preference]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { ownedStarts: number }).ownedStarts)).toBe(0);
  await page.goto('en/notes/process-is-not-readiness/');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const reference = page.locator('a.heading-link[href="#note-references"]');
  await reference.focus();
  await expect(reference).toBeFocused();
  await page.keyboard.press('Enter');
  expect(new URL(page.url()).hash).toBe('#note-references');
  await expect(reference).toBeInViewport();
  await page.evaluate(() => localStorage.setItem('open-desk-motion', 'system'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-off', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('smooth');
  expect(await page.evaluate(() => localStorage.getItem('open-desk-motion'))).toBe('system');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-off', 'true');
});

test('storage denial keeps system motion and native project controls working without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.goto('en/');
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-off', 'true');
  await expect(page.locator('[data-motion-preference]')).toHaveCount(0);
  const choice = page.locator('button[data-project-choice="quan-ly-kho"]');
  await choice.click();
  await expect(choice).toBeFocused();
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  expect(errors).toEqual([]);
});

test('stored System respects OS reduced motion after Off and keeps native project state available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('en/');
  await page.evaluate(() => localStorage.setItem('open-desk-motion', 'off'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
  await page.evaluate(() => localStorage.setItem('open-desk-motion', 'system'));
  await page.reload();
  await page.locator('button[data-project-choice="quan-ly-kho"]').click();
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(page.locator(`${active} [role="tab"][aria-selected="true"]`)).toBeVisible();
  expect(await owned(page)).toBe(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-off', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('the Off runtime attribute settles an owned effect in progress and preserves focus and selected project', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = original.apply(this, args);
      queueMicrotask(() => {
        if (animation.id.startsWith('component-motion:')) {
          animation.pause();
          const timing = animation.effect!.getTiming();
          animation.currentTime = Number(timing.delay) + Number(timing.duration) * .4;
        }
      });
      return animation;
    };
  });
  await page.goto('en/');
  await expect.poll(() => owned(page)).toBeGreaterThan(0);
  const selected = await page.locator(active).getAttribute('data-project-id');
  const choice = page.locator(`button[data-project-choice="${selected}"]`);
  await choice.focus();
  await page.locator('html').evaluate(element => { (element as HTMLElement).dataset.motionOff = 'true'; });
  await expect(choice).toBeFocused();
  await expect.poll(() => owned(page)).toBe(0);
  await expect(page.locator(active)).toHaveAttribute('data-project-id', selected!);
  expect(await page.locator('[data-component-motion]').evaluateAll(elements => elements.filter(element => element.getClientRects().length).every(element => getComputedStyle(element).transform === 'none' && getComputedStyle(element).opacity === '1'))).toBe(true);
});

test('real BFCache restore reconciles motion preference changed on the next page in both directions', async ({ baseURL }, info) => {
  const directory = info.outputPath('preference-bfcache');
  await mkdir(directory, { recursive: true });
  await mkdir(path.resolve('tests/.output'), { recursive: true });
  const profile = await mkdtemp(path.resolve('tests/.output/preference-bfcache-'));
  await writeFile(path.join(directory, 'profile-location.json'), JSON.stringify({ profile, reason: 'Keep Chrome profile below Windows path limits; evidence remains under this run.' }));
  const executable = browserExecutablePath();
  const processHandle = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  const endpoint = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { processHandle.kill(); reject(new Error(`Chrome endpoint unavailable: ${stderr}`)); }, 10_000);
    processHandle.stderr!.on('data', data => { stderr += String(data); const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  const nativeBrowser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
  try {
    const context = nativeBrowser.contexts()[0];
    await context.addInitScript(() => {
      const state = window as unknown as { lifeToken: string; restores: { persisted: boolean; trusted: boolean }[] };
      state.lifeToken = Math.random().toString(36);
      state.restores = [];
      window.addEventListener('pageshow', event => state.restores.push({ persisted: event.persisted, trusted: event.isTrusted }));
    });
    const page = context.pages()[0];
    await page.goto(new URL('en/', baseURL).href);
    await expect(page.locator('html')).not.toHaveAttribute('data-motion-off', 'true');
    const token = await page.evaluate(() => (window as unknown as { lifeToken: string }).lifeToken);
    const evidence: unknown[] = [];
    for (const choice of ['Off', 'System']) {
      await page.goto(new URL('en/about/', baseURL).href);
      await page.evaluate(value => localStorage.setItem('open-desk-motion', value), choice.toLowerCase());
      expect(await page.evaluate(() => localStorage.getItem('open-desk-motion'))).toBe(choice.toLowerCase());
      await page.evaluate(() => history.back());
      await expect(page).toHaveURL(new URL('en/', baseURL).href);
      const restored = await page.evaluate(() => ({ token: (window as unknown as { lifeToken: string }).lifeToken, restores: (window as unknown as { restores: unknown[] }).restores, preference: localStorage.getItem('open-desk-motion'), rootOff: document.documentElement.dataset.motionOff }));
      evidence.push({ choice, ...restored });
      await writeFile(path.join(directory, 'preference-bfcache.json'), JSON.stringify({ browser: nativeBrowser.version(), tokenBefore: token, evidence }, null, 2));
      if (choice === 'Off') await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
      else await expect(page.locator('html')).not.toHaveAttribute('data-motion-off', 'true');
      expect(restored.token).toBe(token);
      expect(restored.restores).toEqual(expect.arrayContaining([expect.objectContaining({ persisted: true, trusted: true })]));
      await expect.poll(() => owned(page)).toBe(0);
    }
    await writeFile(path.join(directory, 'preference-bfcache.json'), JSON.stringify({ browser: nativeBrowser.version(), tokenBefore: token, evidence }, null, 2));
  } finally { await nativeBrowser.close(); processHandle.kill(); }
});
