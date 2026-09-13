import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browserExecutablePath } from './helpers/browser-executable';

const active = '[data-open-desk]:not([hidden])';
const decoration = '[data-glass-backing], [data-glass-rim], [data-glass-selector]';
const controls = '.header-controls a, .header-controls button, .project-choice';
type GlassRecord = { id: string; decorative: boolean; duration: number; iterations: number; keyframes: Record<string, unknown>[] };
type Commit = { revision: number; origin: string; projectId: string; layer: string; actualProject?: string; actualLayer?: string; visible: number };
type GlassWindow = Window & { glassRecords: GlassRecord[]; glassCommits: Commit[]; glassErrors: string[] };

async function observe(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const state = window as unknown as GlassWindow;
    state.glassRecords = []; state.glassCommits = []; state.glassErrors = [];
    window.addEventListener('unhandledrejection', event => state.glassErrors.push(String(event.reason)));
    document.addEventListener('featured:change', event => {
      const wrapper = event.target as HTMLElement;
      const detail = (event as CustomEvent<Commit>).detail;
      state.glassCommits.push({ ...detail, actualProject: wrapper.querySelector<HTMLElement>('[data-open-desk]:not([hidden])')?.dataset.projectId,
        actualLayer: wrapper.querySelector<HTMLElement>('[data-open-desk]:not([hidden]) [data-desk-panel]:not([hidden])')?.dataset.deskPanel,
        visible: wrapper.querySelectorAll('[data-open-desk]:not([hidden])').length });
    });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = animate.apply(this, args), target = this;
      queueMicrotask(() => {
        if (!animation.id.startsWith('glass-motion:')) return;
        const timing = animation.effect!.getTiming();
        state.glassRecords.push({ id: animation.id, decorative: target.matches('[data-glass-backing],[data-glass-rim],[data-glass-selector]'),
          duration: Number(timing.duration), iterations: Number(timing.iterations), keyframes: (animation.effect as KeyframeEffect).getKeyframes() });
      });
      return animation;
    };
  });
}

async function ready(page: Page, route = 'vi/') {
  await page.goto(route);
  await expect(page.locator('html')).toHaveAttribute('data-glass-motion-mounted', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-material-effective', 'expressive-css');
  await page.evaluate(() => document.fonts.ready);
}
const records = (page: Page) => page.evaluate(() => (window as unknown as GlassWindow).glassRecords);
const owned = (page: Page) => page.evaluate(() => document.getAnimations().filter(animation => animation.id.startsWith('glass-motion:')).map(animation => animation.id));
async function settled(page: Page) {
  await expect.poll(() => owned(page)).toEqual([]);
  expect(await page.locator(decoration).evaluateAll(elements => elements.every(element => getComputedStyle(element).transform === 'none'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as GlassWindow).glassErrors)).toEqual([]);
}
async function hitboxes(page: Page) {
  return page.locator(controls).evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
    const box = element.getBoundingClientRect(); return { text: element.textContent, x: box.x, y: box.y, width: box.width, height: box.height };
  }));
}
async function press(page: Page) {
  const choice = page.locator('button[data-project-choice="quan-ly-kho"]');
  await choice.scrollIntoViewIfNeeded();
  const box = (await choice.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

for (const input of ['pointer', 'keyboard', 'touch'] as const) test(`${input}: finite decoration feedback leaves hitboxes and readable ink stable`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: input === 'touch' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: input === 'touch', isMobile: input === 'touch' });
  const page = await context.newPage();
  try {
    await observe(page); await ready(page);
    const choice = page.locator('button[data-project-choice="quan-ly-kho"]');
    await choice.scrollIntoViewIfNeeded();
    if (input === 'keyboard') await choice.focus();
    const before = await hitboxes(page);
    if (input === 'pointer') { await press(page); await page.waitForTimeout(30); }
    else if (input === 'keyboard') { await page.keyboard.down(' '); await page.waitForTimeout(30); }
    else {
      const box = (await choice.boundingBox())!, cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await page.waitForTimeout(30);
      expect(await hitboxes(page)).toEqual(before);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    if (input !== 'touch') {
      expect(await hitboxes(page)).toEqual(before);
      if (input === 'pointer') await page.mouse.up(); else await page.keyboard.up(' ');
    }
    await expect(choice).toHaveAttribute('aria-disabled', 'true');
    const ink = await page.locator(controls).evaluateAll(elements => elements.filter(element => element.getClientRects().length).flatMap(element => {
      const styles = []; for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor); styles.push({ opacity: style.opacity, filter: style.filter });
      } return styles;
    }));
    expect(ink.every(style => style.opacity === '1' && style.filter === 'none')).toBe(true);
    await settled(page);
    const effects = await records(page);
    expect(effects.some(effect => effect.id.startsWith('glass-motion:press:'))).toBe(true);
    expect(effects.some(effect => effect.id.startsWith('glass-motion:selection:'))).toBe(true);
    expect(effects.every(effect => effect.decorative && effect.iterations === 1 && effect.duration > 0 && effect.duration <= 280)).toBe(true);
    const pressDuration = await page.evaluate(() => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--glass-press-duration').trim();
      return parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    });
    expect(pressDuration).toBe(100);
    expect(effects.filter(effect => effect.id.startsWith('glass-motion:press:')).every(effect => effect.duration === pressDuration)).toBe(true);
    for (const node of await page.locator(decoration).all()) {
      await expect(node).toHaveAttribute('aria-hidden', 'true');
      expect(await node.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
    }
    const count = effects.length;
    await page.waitForTimeout(400);
    expect(await records(page)).toHaveLength(count);
    expect(await owned(page)).toEqual([]);
  } finally { await context.close(); }
});

test('rapid changes commit synchronously once, retarget selector, and replay installs no duplicate owner', async ({ page }) => {
  await observe(page); await ready(page);
  const script = await page.locator('script[data-glass-motion]').textContent();
  expect(script).toBeTruthy();
  await page.addScriptTag({ content: script! }); await page.addScriptTag({ content: script! });
  await page.locator('.project-choices').scrollIntoViewIfNeeded();
  const commits = await page.evaluate(() => {
    for (const id of ['quan-ly-kho', 'healthos', 'quan-ly-kho']) document.querySelector<HTMLButtonElement>(`button[data-project-choice="${id}"]`)!.click();
    return (window as unknown as GlassWindow).glassCommits;
  });
  expect(commits).toHaveLength(4);
  expect(commits.map(commit => commit.revision)).toEqual([1, 2, 3, 4]);
  expect(commits.map(commit => commit.origin)).toEqual(['init', 'project', 'project', 'project']);
  for (const commit of commits) {
    expect(commit.actualProject).toBe(commit.projectId); expect(commit.actualLayer).toBe(commit.layer); expect(commit.visible).toBe(1);
  }
  await settled(page);
  const selection = await page.locator('.project-choices').evaluate(element => {
    const selector = element.querySelector('[data-glass-selector]')!.getBoundingClientRect();
    const selected = element.querySelector('[data-project-choice][aria-disabled="true"]')!.getBoundingClientRect();
    return (['x', 'y', 'width', 'height'] as const).map(key => selector[key] - selected[key]);
  });
  expect(selection.every(delta => Math.abs(delta) <= 1)).toBe(true);
  expect((await records(page)).filter(effect => effect.id.startsWith('glass-motion:selection:'))).toHaveLength(3);
});

test('Off, reduced motion, print and non-CSS modes cancel held feedback and suppress subsequent work', async ({ page }) => {
  await observe(page);
  for (const reason of ['off', 'reduced', 'print', 'solid', 'baseline-b'] as const) {
    await page.emulateMedia({ reducedMotion: 'no-preference', media: 'screen' });
    await ready(page);
    await press(page);
    expect(await page.locator('.project-choices [data-glass-backing]').evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
    if (reason === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    else if (reason === 'print') await page.emulateMedia({ media: 'print' });
    else if (reason === 'off') {
      // Exercise the runtime preference observer without releasing the held pointer.
      await page.locator('html').evaluate(element => { (element as HTMLElement).dataset.motionOff = 'true'; });
      await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
    } else await page.locator('html').evaluate((element, value) => (element as HTMLElement).dataset.material = value, reason);
    await page.mouse.up(); await settled(page);
    const count = (await records(page)).length;
    if (reason !== 'print') {
      await page.locator('button[data-project-choice="healthos"]').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator(active)).toHaveAttribute('data-project-id', 'healthos');
    }
    await page.waitForTimeout(350);
    expect(await records(page)).toHaveLength(count);
    expect(await owned(page)).toEqual([]);
    if (reason === 'off') await page.locator('html').evaluate(element => { delete (element as HTMLElement).dataset.motionOff; });
  }
});

for (const fault of ['resize-observer', 'animate'] as const) test(`${fault} failure tears down decoration without interrupting native content`, async ({ page }) => {
  await observe(page);
  await page.addInitScript(kind => {
    if (kind === 'resize-observer') Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: undefined });
    else {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
        if (this.matches('[data-glass-backing],[data-glass-rim],[data-glass-selector]')) throw new Error('Intentional glass animation failure');
        return animate.apply(this, args);
      };
    }
  }, fault);
  await ready(page);
  await page.locator('button[data-project-choice="quan-ly-kho"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-glass-motion-failed', 'true');
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await page.locator(`${active} [data-panel="context"]`).click();
  await expect(page.locator(`${active} [data-panel="context"]`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-glass-selector]')).toBeHidden();
  await settled(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('body *').evaluateAll(elements => {
    const text = elements.filter(element => element.getClientRects().length && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()));
    const sizes = text.map(element => parseFloat(getComputedStyle(element).fontSize));
    text.forEach((element, index) => (element as HTMLElement).style.fontSize = `${sizes[index] * 2}px`);
  });
  // With geometry observation gone, fault cleanup must release sticky layout
  // instead of retaining stale header/picker offsets after text enlargement.
  await expect(page.locator('html')).toHaveAttribute('data-glass-flow', 'true');
  for (const selector of ['.site-header', '.project-chooser']) expect(await page.locator(selector).evaluate(element => getComputedStyle(element).position)).toBe('relative');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const count = (await records(page)).length;
  const script = await page.locator('script[data-glass-motion]').textContent();
  await page.addScriptTag({ content: script! });
  await page.locator('button[data-project-choice="healthos"]').click();
  await settled(page);
  expect(await records(page)).toHaveLength(count);
  // A terminal decoration failure must not leave a verified QA material marker
  // contradicting the browser's live solid preference fallback.
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('html')).toHaveAttribute('data-material-effective', 'solid');
  expect(await page.locator('[data-glass-backing]').evaluateAll(elements => elements.every(element => getComputedStyle(element).backdropFilter === 'none'))).toBe(true);
});

for (const locale of ['vi', 'en']) test(`${locale}: native skip and rapid reverse Tab Contact clear sticky controls`, async ({ page }) => {
  await observe(page); await page.setViewportSize({ width: 1440, height: 1000 }); await ready(page, `${locale}/`);
  await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(await page.locator('main').evaluate(element => element.getBoundingClientRect().top >= document.querySelector('.site-header')!.getBoundingClientRect().bottom - 1)).toBe(true);
  await page.mouse.wheel(0, 560);
  const choice = page.locator('button[data-project-choice="healthos"]'); await choice.focus();
  const contact = page.locator('.main-nav a[href$="#contact"]');
  let count = 0;
  while (!await contact.evaluate(element => document.activeElement === element)) {
    expect(++count).toBeLessThanOrEqual(20); await page.keyboard.press('Shift+Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contact$/);
  await expect.poll(() => page.locator('#contact').evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; })).toBe(true);
});

test('short viewport uses readable flow and opening a scrolled mobile menu preserves reachability', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await observe(page); await ready(page);
    await page.mouse.wheel(0, 20000); await expect(page.locator('#contact')).toBeInViewport();
    await page.locator('[data-menu-toggle]').tap();
    await expect(page.locator('[data-menu-toggle]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.main-nav a[href$="#contact"]')).toBeInViewport();
    expect(await page.locator('.header-controls').evaluate(element => {
      const shell = element.getBoundingClientRect(), backing = element.querySelector('[data-glass-backing]')!.getBoundingClientRect();
      return backing.top <= shell.top + 1 && backing.bottom >= shell.bottom - 1;
    })).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('html')).toHaveAttribute('data-glass-flow', 'true');
    for (const selector of ['.site-header', '.project-chooser']) expect(await page.locator(selector).evaluate(element => getComputedStyle(element).position)).toBe('relative');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await context.close(); }
});

test('real hidden/restore and history navigation stop glass work without replay', async ({ baseURL }, info) => {
  await mkdir(path.resolve('tests/.output'), { recursive: true });
  const profile = await mkdtemp(path.resolve('tests/.output/glass-lifecycle-'));
  const executable = browserExecutablePath();
  const processHandle = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let nativeBrowser: Browser | undefined;
  try {
    let stderr = '';
    const endpoint = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Chrome endpoint unavailable: ${stderr}`)), 10_000);
      processHandle.once('error', error => { clearTimeout(timeout); reject(error); });
      processHandle.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited before connection (${code}): ${stderr}`)); });
      processHandle.stderr!.on('data', data => { stderr += String(data); const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    nativeBrowser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const context = nativeBrowser.contexts()[0], page = context.pages()[0];
    await observe(page); await ready(page, new URL('vi/', baseURL).href); await press(page);
    const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden'); await settled(page);
    const count = (await records(page)).length;
    await page.waitForTimeout(350); expect(await records(page)).toHaveLength(count);
    await page.bringToFront();
    // Release away from the pressed choice: releasing on it would perform a
    // new native click, which legitimately starts a new selection effect.
    await page.mouse.move(5, 5); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    await page.waitForTimeout(350); expect(await records(page)).toHaveLength(count);
    await page.goto(new URL('vi/about/', baseURL).href); await page.evaluate(() => history.back());
    await expect(page).toHaveURL(new URL('vi/', baseURL).href); await settled(page);
    const directory = info.outputPath('native-glass-lifecycle'); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'result.json'), JSON.stringify({ browser: nativeBrowser.version(), profile, actualVisibilityChange: true, animations: await owned(page), mechanism: 'Default Chrome context with noDefaults; real tab backgrounding and native history. No claim that Back necessarily used BFCache.' }, null, 2));
  } finally {
    try { await nativeBrowser?.close(); }
    finally { processHandle.kill(); }
  }
});
