import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browserExecutablePath } from './helpers/browser-executable';

type MotionRecord = { kind: string; target: string; id: string; keyframes: Record<string, unknown>[]; timing: { duration: number; delay: number; easing: string }; opacity: string[] };
type MotionWindow = Window & { motionRecords: MotionRecord[]; motionErrors: string[]; pauseMotion: boolean; motionCommits: { revision: number; tabs: { text: string | null; x: number; y: number; width: number; height: number }[] }[] };
const active = '[data-open-desk]:not([hidden])';
const owned = (page: Page) => page.evaluate(() => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).map(animation => ({ id: animation.id, state: animation.playState, time: animation.currentTime })));
async function observe(page: Page, pause = false) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(({ pause }) => {
    const state = window as unknown as MotionWindow;
    state.motionRecords = []; state.motionErrors = []; state.pauseMotion = pause; state.motionCommits = [];
    document.addEventListener('featured:change', event => {
      const detail = (event as CustomEvent<{ revision: number }>).detail;
      state.motionCommits.push({ revision: detail.revision, tabs: [...document.querySelectorAll('[data-open-desk]:not([hidden]) [role="tab"]')].map(element => { const box = element.getBoundingClientRect(); return { text: element.textContent, x: box.x, y: box.y, width: box.width, height: box.height }; }) });
    });
    window.addEventListener('unhandledrejection', event => state.motionErrors.push(String(event.reason)));
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = animate.apply(this, args);
      const target = this;
      queueMicrotask(() => {
        if (!animation.id.startsWith('component-motion:')) return;
        const opacity: string[] = [];
        for (let parent: Element | null = target; parent; parent = parent.parentElement) opacity.push(getComputedStyle(parent).opacity);
        state.motionRecords.push({ kind: (target as HTMLElement).dataset.componentMotion || '', target: target.tagName, id: animation.id, keyframes: (animation.effect as KeyframeEffect).getKeyframes(), timing: animation.effect!.getTiming() as MotionRecord['timing'], opacity });
        if (state.pauseMotion) { animation.pause(); const timing = animation.effect!.getTiming(); animation.currentTime = Number(timing.delay) + Number(timing.duration) * .4; }
      });
      return animation;
    };
  }, { pause });
}
async function ready(page: Page, route = 'vi/') {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-component-motion-mounted', 'true');
}
async function records(page: Page) { return page.evaluate(() => (window as unknown as MotionWindow).motionRecords); }
async function settle(page: Page) { await expect.poll(() => owned(page)).toEqual([]); }
async function assertFinal(page: Page) {
  await settle(page);
  const styles = await page.locator('[data-component-motion]').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({ kind: (element as HTMLElement).dataset.componentMotion, transform: getComputedStyle(element).transform, opacity: getComputedStyle(element).opacity, willChange: getComputedStyle(element).willChange })));
  expect(styles.every(style => style.transform === 'none' && style.opacity === '1' && style.willChange === 'auto'), JSON.stringify(styles)).toBe(true);
}
async function scrollAll(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) { await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), y); await page.waitForTimeout(100); }
}
for (const locale of ['vi', 'en']) for (const width of [390, 1440]) test(`${locale} ${width}: actual hero, article and panel animate while controls stay fixed`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await observe(page, true); await ready(page, `${locale}/`);
  await expect.poll(async () => (await records(page)).filter(record => ['headline', 'portrait'].includes(record.kind)).length).toBe(2);
  const initial = await records(page);
  expect(initial.filter(record => ['headline', 'portrait', 'identity', 'support'].includes(record.kind)).length).toBeGreaterThanOrEqual(4);
  expect(initial.every(record => record.opacity.every(opacity => opacity === '1'))).toBe(true);
  expect(initial.filter(record => record.kind === 'headline').every(record => record.keyframes.some(frame => String(frame.transform).includes('translate')))).toBe(true);
  await page.screenshot({ path: info.outputPath('hero-actual-midpoint.png') });
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = false; document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish()); });
  await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded(); await settle(page);
  await page.evaluate(() => document.fonts.ready);
  const controls = '[data-featured-projects] button[data-project-choice], [data-open-desk]:not([hidden]) [role="tab"]';
  const before = await page.locator(controls).evaluateAll(elements => elements.map(element => ({ text: element.textContent, x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = true; });
  await page.locator('button[data-project-choice="quan-ly-kho"]').click();
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(page.locator(`${active} [data-desk-panel]:not([hidden])`)).toHaveAttribute('data-desk-panel', 'output');
  const effects = await owned(page); expect(effects.length).toBeGreaterThanOrEqual(3);
  const after = await page.locator(controls).evaluateAll(elements => elements.map(element => ({ text: element.textContent, x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  // Different project copy may naturally reflow at the synchronous commit.
  // Pickers retain geometry across commits; each incoming tab shell is fixed
  // from its committed layout through the actual animation and settle.
  expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  const committedTabs = await page.evaluate(() => (window as unknown as MotionWindow).motionCommits.at(-1)!.tabs);
  expect(after.slice(2)).toEqual(committedTabs);
  expect(await page.locator(`${active}, .featured-paper, ${active} [role="tablist"]`).evaluateAll(elements => elements.every(element => getComputedStyle(element).transform === 'none'))).toBe(true);
  await page.screenshot({ path: info.outputPath('featured-actual-midpoint.png') });
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = false; document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish()); });
  expect(await page.locator(`${active} [role="tab"]`).evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { text: element.textContent, x: box.x, y: box.y, width: box.width, height: box.height }; }))).toEqual(committedTabs);
  await page.locator(`${active} [role="tab"][aria-selected="true"]`).focus(); await page.keyboard.press('Home');
  await expect(page.locator(`${active} [data-panel="context"]`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`${active} [data-desk-panel]:not([hidden])`)).toHaveAttribute('data-desk-panel', 'context');
  await expect.poll(async () => (await records(page)).filter(record => record.kind === 'article-panel').length).toBeGreaterThan(1);
  await assertFinal(page);
  expect(await page.evaluate(() => (window as unknown as MotionWindow).motionErrors)).toEqual([]);
});

for (const width of [390, 1440]) test(`${width}: incoming desk tab uses duration-fast, smooth-out, and 12/18px travel`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await observe(page);
  await ready(page);
  await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded();
  await settle(page);
  await page.evaluate(() => {
    const state = window as unknown as MotionWindow;
    state.pauseMotion = true;
    state.motionRecords = [];
  });
  await page.locator(`${active} [data-panel="decisions"]`).click();
  await expect(page.locator(`${active} [data-desk-panel]:not([hidden])`)).toHaveAttribute('data-desk-panel', 'decisions');
  const tabRecords = (await records(page)).filter(record => record.id.startsWith('component-motion:tab:'));
  expect(tabRecords).toHaveLength(1);
  expect(tabRecords[0].kind).toBe('article-panel');
  const expected = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const durationValue = styles.getPropertyValue('--duration-fast').trim();
    return {
      duration: parseFloat(durationValue) * (durationValue.endsWith('ms') ? 1 : 1000),
      easing: styles.getPropertyValue('--ease-smooth-out').trim(),
      travel: matchMedia('(max-width: 640px), (pointer: coarse)').matches ? 12 : 18,
    };
  });
  expect(tabRecords[0].timing.duration).toBe(expected.duration);
  const bezier = (value: string) => {
    const inner = value.match(/cubic-bezier\(([^)]+)\)/i)?.[1];
    const parts = inner?.split(',').map(part => Number(part.trim()));
    expect(parts?.length).toBe(4);
    expect(parts?.every(Number.isFinite)).toBe(true);
    return parts;
  };
  expect(bezier(tabRecords[0].timing.easing)).toEqual(bezier(expected.easing));
  expect(tabRecords[0].keyframes.some(frame => String(frame.transform).includes(`translateX(${expected.travel}px)`) || String(frame.transform).includes(`translateX(-${expected.travel}px)`))).toBe(true);
  expect((await owned(page)).filter(animation => animation.id.startsWith('component-motion:tab:'))).toHaveLength(1);
  await page.evaluate(() => {
    const state = window as unknown as MotionWindow;
    state.pauseMotion = false;
    document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish());
  });
  await assertFinal(page);
});

test('incoming desk tab duration follows a --duration-fast override', async ({ page }) => {
  await observe(page);
  await ready(page);
  await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded();
  await settle(page);
  await page.addStyleTag({ content: ':root { --duration-fast: 180ms; }' });
  await page.evaluate(() => {
    const state = window as unknown as MotionWindow;
    state.pauseMotion = true;
    state.motionRecords = [];
  });
  await page.locator(`${active} [data-panel="decisions"]`).click();
  await expect(page.locator(`${active} [data-desk-panel]:not([hidden])`)).toHaveAttribute('data-desk-panel', 'decisions');
  const tabRecords = (await records(page)).filter(record => record.id.startsWith('component-motion:tab:'));
  expect(tabRecords).toHaveLength(1);
  expect(tabRecords[0].timing.duration).toBe(180);
  await page.evaluate(() => {
    const state = window as unknown as MotionWindow;
    state.pauseMotion = false;
    document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish());
  });
  await assertFinal(page);
});

for (const mode of ['reduced', 'off'] as const) test(`${mode}: incoming desk tab swaps instantly without WAAPI`, async ({ page }) => {
  await observe(page);
  if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  if (mode === 'off') await page.evaluate(() => { document.documentElement.dataset.motionOff = 'true'; });
  await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded();
  await settle(page);
  await page.evaluate(() => { (window as unknown as MotionWindow).motionRecords = []; });
  await page.locator(`${active} [data-panel="decisions"]`).click();
  await expect(page.locator(`${active} [data-desk-panel]:not([hidden])`)).toHaveAttribute('data-desk-panel', 'decisions');
  expect((await records(page)).filter(record => record.id.startsWith('component-motion:tab:'))).toHaveLength(0);
  await assertFinal(page);
});

test('rapid committed revisions cancel old handles, no-op/replay do not add effects', async ({ page }) => {
  await observe(page); await ready(page); await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded(); await settle(page);
  const b = page.locator('button[data-project-choice="quan-ly-kho"]'), a = page.locator('button[data-project-choice="healthos"]');
  await b.click(); await a.click(); await b.click();
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  const revision = await page.locator('[data-featured-projects]').getAttribute('data-featured-revision');
  expect((await owned(page)).every(animation => animation.id.endsWith(`:${revision}`))).toBe(true);
  await page.locator(`${active} [data-panel="context"]`).click(); await page.locator(`${active} [data-panel="decisions"]`).click(); await page.locator(`${active} [data-panel="output"]`).click();
  await assertFinal(page);
  const count = (await records(page)).length;
  await b.dispatchEvent('click');
  const script = await page.locator('script[data-component-motion-script]').textContent(); expect(script).toBeTruthy();
  await page.addScriptTag({ content: script! }); await page.addScriptTag({ content: script! });
  expect((await records(page)).length).toBe(count);
  await a.click(); await assertFinal(page);
  expect(await page.evaluate(() => (window as unknown as MotionWindow).motionErrors)).toEqual([]);
});

test('reduced/off changes consume pending entries; restoring permits next state change only', async ({ page }) => {
  await observe(page, true); await ready(page); expect((await owned(page)).length).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await assertFinal(page);
  const reducedCount = (await records(page)).length;
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await scrollAll(page); await assertFinal(page);
  expect((await records(page)).length).toBe(reducedCount);
  await page.locator('[data-featured-projects]').scrollIntoViewIfNeeded();
  await page.locator('button[data-project-choice="quan-ly-kho"]').click(); expect((await owned(page)).length).toBeGreaterThan(0);
  await page.evaluate(() => { document.documentElement.dataset.motionOff = 'true'; }); await assertFinal(page);
  const offCount = (await records(page)).length;
  await page.evaluate(() => { delete document.documentElement.dataset.motionOff; }); await scrollAll(page);
  expect((await records(page)).length).toBe(offCount);
});

test('print cancels active effects and returns to a final screen without replay', async ({ page }) => {
  await observe(page, true); await ready(page); await page.emulateMedia({ media: 'print' }); await assertFinal(page);
  const count = (await records(page)).length;
  await page.emulateMedia({ media: 'screen' }); await scrollAll(page); await assertFinal(page);
  expect((await records(page)).length).toBe(count);
});

for (const failure of ['animate', 'observer'] as const) test(`${failure} initialization failure leaves readable native content`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(failure => {
    if (failure === 'animate') Element.prototype.animate = () => { throw new Error('Intentional WAAPI failure'); };
    else window.IntersectionObserver = class { constructor() { throw new Error('Intentional observer failure'); } } as unknown as typeof IntersectionObserver;
  }, failure);
  await page.goto('vi/'); await scrollAll(page);
  await expect(page.locator('#home-heading')).toBeVisible(); await expect(page.locator('.contact-copy')).toBeVisible();
  await assertFinal(page);
  await page.locator('button[data-project-choice="quan-ly-kho"]').click();
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
});

for (const locale of ['vi', 'en']) for (const route of ['work/', 'about/', 'work/healthos/', 'work/quan-ly-kho/']) test(`${locale}/${route}: whole semantic groups enter once`, async ({ page }) => {
  await observe(page); await ready(page, `${locale}/${route}`); await scrollAll(page); await assertFinal(page);
  const first = await records(page);
  const kinds = new Set(first.map(record => record.kind));
  if (route === 'work/') expect(kinds.has('row')).toBe(true);
  else if (route === 'about/') expect([...kinds].filter(kind => kind.startsWith('about-')).length).toBeGreaterThanOrEqual(2);
  else expect(kinds.has('evidence')).toBe(true);
  expect(first.every(record => record.opacity.every(opacity => opacity === '1'))).toBe(true);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await scrollAll(page); await assertFinal(page);
  expect((await records(page)).length).toBe(first.length);
});

for (const coarse of [false, true]) for (const terminal of ['click', 'outside', 'cancel', 'contextmenu'] as const) test(`${coarse ? 'touch' : 'mouse'} moving native link hold: ${terminal}`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: coarse ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: coarse, isMobile: coarse, deviceScaleFactor: coarse ? 2 : 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    await observe(page, true); await ready(page, 'vi/work/');
    const link = page.locator('.project-row .row-link').first();
    await link.scrollIntoViewIfNeeded();
    const preparation = await link.evaluate(element => {
      const effects = document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element));
      effects.forEach(animation => animation.play());
      const rect = element.getBoundingClientRect();
      return { count: effects.length, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, href: (element as HTMLAnchorElement).href };
    });
    expect(preparation.count).toBeGreaterThan(0);
    const cdp = await context.newCDPSession(page);
    if (coarse) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: preparation.x, y: preparation.y, id: 7 }] });
    else { await page.mouse.move(preparation.x, preparation.y); await page.mouse.down(); }
    const held = await link.boundingBox();
    expect((await owned(page)).some(animation => animation.state === 'paused')).toBe(true);
    await page.waitForTimeout(300);
    const after = await link.boundingBox();
    expect(Math.abs(after!.x - held!.x)).toBeLessThan(1); expect(Math.abs(after!.y - held!.y)).toBeLessThan(1);
    if (terminal === 'outside') {
      if (coarse) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1, y: 1, id: 7 }] });
      else await page.mouse.move(1, 1);
    }
    if (terminal === 'cancel') {
      if (coarse) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else { await page.dispatchEvent('body', 'pointercancel', { pointerId: 1, pointerType: 'mouse' }); await page.mouse.move(1, 1); await page.mouse.up(); }
    } else if (terminal === 'contextmenu') {
      // Native context menu is a mouse path; touch dispatch exercises the same
      // terminal handler without claiming physical long-press certification.
      await link.dispatchEvent('contextmenu', { bubbles: true, cancelable: true });
      if (coarse) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else { await page.mouse.move(1, 1); await page.mouse.up(); }
    } else if (coarse) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
    if (terminal === 'click') await expect(page).toHaveURL(preparation.href);
    else {
      expect(new URL(page.url()).pathname).toMatch(/\/vi\/work\/$/);
      // The app must release the actual held owner itself. Finishing unrelated
      // capture timelines below must not conceal a leaked pointer hold.
      await expect.poll(() => link.evaluate(element => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element)).length)).toBe(0);
      await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = false; document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish()); }); await settle(page);
    }
  } finally { await context.close(); }
});

test('keyboard focus settles link owners before native Enter navigation', async ({ page }) => {
  await observe(page, true); await ready(page, 'en/work/');
  const link = page.locator('.project-row .row-link').first(); const href = await link.getAttribute('href');
  await link.focus();
  expect(await link.evaluate(element => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element)).length)).toBe(0);
  await page.keyboard.press('Enter'); await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
});

for (const modifier of ['Control', 'middle'] as const) test(`${modifier}: held moving native link keeps new-tab behavior`, async ({ page, context }) => {
  await observe(page, true); await ready(page, 'en/work/');
  const link = page.locator('.project-row .row-link').first();
  const target = await link.evaluate(element => {
    const effects = document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element));
    effects.forEach(animation => animation.play());
    const box = element.getBoundingClientRect();
    return { href: (element as HTMLAnchorElement).href, x: box.x + box.width / 2, y: box.y + box.height / 2, effects: effects.length };
  });
  expect(target.effects).toBeGreaterThan(0);
  await page.mouse.move(target.x, target.y);
  if (modifier === 'Control') await page.keyboard.down('Control');
  const button = modifier === 'middle' ? 'middle' : 'left';
  await page.mouse.down({ button });
  const before = await link.boundingBox();
  // A second pointer's terminal event cannot release the first pointer's hold.
  await page.dispatchEvent('body', 'pointerup', { pointerId: 99, pointerType: 'pen' });
  await page.waitForTimeout(100);
  const heldAfter = await link.boundingBox();
  expect(Math.abs(heldAfter!.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(heldAfter!.y - before!.y)).toBeLessThan(1);
  const popupPromise = context.waitForEvent('page');
  await page.mouse.up({ button });
  if (modifier === 'Control') await page.keyboard.up('Control');
  const popup = await popupPromise;
  try { await expect(popup).toHaveURL(target.href); expect(new URL(page.url()).pathname).toMatch(/\/en\/work\/$/); }
  finally { await popup.close(); }
});

for (const locale of ['vi', 'en']) test(`${locale}: no-JS content, full evidence, links and print remain available`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${locale}/`); await expect(page.locator('[data-open-desk][hidden], [data-desk-panel][hidden]')).toHaveCount(0);
    await expect(page.locator('.hero h1')).toBeVisible();
    await page.locator('a[data-project-choice="quan-ly-kho"]').click(); await expect(page).toHaveURL(/#home-featured-quan-ly-kho$/);
    await page.goto(`${locale}/work/healthos/`); await expect(page.locator('.evidence-figure img').first()).toBeVisible();
    await page.emulateMedia({ media: 'print' }); await expect(page.locator('.evidence-figure figcaption').first()).toBeVisible();
  } finally { await context.close(); }
});

test('first approach animates featured content and the contact groups', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 650 }); await observe(page); await ready(page);
  await settle(page);
  expect((await records(page)).some(record => record.id.startsWith('component-motion:featured:'))).toBe(false);
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = true; });
  await page.locator('.desk-title').first().scrollIntoViewIfNeeded();
  await expect.poll(async () => (await records(page)).filter(record => record.id.startsWith('component-motion:featured:')).length).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: info.outputPath('featured-entry-actual-midpoint.png') });
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = false; document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish()); });
  await settle(page);
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = true; });
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await records(page)).filter(record => record.kind.startsWith('contact-')).length).toBe(2);
  await page.screenshot({ path: info.outputPath('contact-entry-actual-midpoint.png') });
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = false; document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).forEach(animation => animation.finish()); });
  await assertFinal(page);
});

test('a focused sibling in pending support group remains final on first approach', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 180 }); await observe(page); await ready(page); await settle(page);
  const link = page.locator('.hero-actions a').first();
  await link.focus();
  const count = (await records(page)).filter(record => record.kind === 'support').length;
  await link.scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
  expect((await records(page)).filter(record => record.kind === 'support').length).toBe(count);
  expect(await link.evaluate(element => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element)).length)).toBe(0);
  await expect(link).toBeFocused();
});

test('mobile menu commits immediately, keeps anchor boxes fixed, cancels and replays once', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await observe(page); await ready(page); await settle(page);
  const toggle = page.locator('[data-menu-toggle]');
  await page.evaluate(() => { (window as unknown as MotionWindow).pauseMotion = true; });
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); await expect(page.locator('#site-navigation')).toBeVisible();
  await expect.poll(async () => (await records(page)).filter(record => record.kind === 'menu-label').length).toBeGreaterThan(0);
  const links = page.locator('#site-navigation > a');
  const before = await links.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  await page.screenshot({ path: info.outputPath('menu-actual-midpoint.png') });
  await page.evaluate(() => { document.getAnimations().filter(animation => animation.id.startsWith('component-motion:menu-label:')).forEach(animation => animation.finish()); });
  expect(await links.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))).toEqual(before);
  await page.keyboard.press('Escape'); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(page.locator('#site-navigation')).toBeHidden(); await expect(toggle).toBeFocused();
  const script = (await page.locator('script').allTextContents()).find(source => source.includes('navigationMounted')); expect(script).toBeTruthy();
  await page.addScriptTag({ content: script! });
  await toggle.click(); await toggle.click(); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#site-navigation')).toBeVisible(); await settle(page);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[hidden]')))).toBe(false);
});

test('late initialization consumes already painted hero while retaining readable baseline', async ({ page }) => {
  await observe(page);
  let source = '';
  await page.route('**/vi/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const replaced = html.replace(/<script[^>]*data-component-motion-script[^>]*>([\s\S]*?)<\/script>/, (_match, script: string) => { source = script; return ''; });
    await route.fulfill({ response, body: replaced });
  });
  await page.goto('vi/'); await expect(page.locator('#home-heading')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('late-init-before.png') });
  await page.waitForFunction(() => performance.getEntriesByType('paint').some(entry => entry.name === 'first-contentful-paint'));
  expect(source).toBeTruthy(); await page.addScriptTag({ content: source });
  await expect(page.locator('html')).toHaveAttribute('data-component-motion-mounted', 'true');
  expect((await records(page)).some(record => ['headline', 'portrait', 'identity', 'support'].includes(record.kind))).toBe(false);
  await assertFinal(page);
});

test('native link dragend releases the moving-link hold without navigation', async ({ page }) => {
  await observe(page, true); await ready(page, 'vi/work/');
  await page.evaluate(() => { (window as unknown as Window & { dragEvents: string[] }).dragEvents = []; for (const name of ['dragstart', 'dragend']) document.addEventListener(name, event => { if (event.isTrusted) (window as unknown as Window & { dragEvents: string[] }).dragEvents.push(name); }); });
  const link = page.locator('.project-row .row-link').first();
  const box = await link.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down();
  await page.mouse.move(box!.x - 90, box!.y + 100, { steps: 12 }); await page.mouse.move(5, 5, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { dragEvents: string[] }).dragEvents)).toContain('dragend');
  expect(new URL(page.url()).pathname).toMatch(/\/vi\/work\/$/);
  expect(await link.evaluate(element => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element)).length)).toBe(0);
});

test('trusted native right-click contextmenu releases a moving-link hold', async ({ page }) => {
  await observe(page, true); await ready(page, 'vi/work/');
  await page.evaluate(() => { (window as unknown as Window & { nativeContextMenu: boolean }).nativeContextMenu = false; document.addEventListener('contextmenu', event => { if (event.isTrusted) (window as unknown as Window & { nativeContextMenu: boolean }).nativeContextMenu = true; }); });
  const link = page.locator('.project-row .row-link').first(); const box = await link.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { nativeContextMenu: boolean }).nativeContextMenu)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => link.evaluate(element => document.getAnimations().filter(animation => animation.id.startsWith('component-motion:') && ((animation.effect as KeyframeEffect).target as Element)?.contains(element)).length)).toBe(0);
  expect(new URL(page.url()).pathname).toMatch(/\/vi\/work\/$/);
});

test('real browser hidden, restore and back navigation consume effects without replay', async ({ baseURL }, info) => {
  // Playwright defaults force every page focused. A separate default Chrome
  // context with noDefaults preserves real visibility and BFCache behavior.
  const directory = info.outputPath('native-lifecycle'); await mkdir(directory, { recursive: true });
  await mkdir(path.resolve('tests/.output'), { recursive: true });
  const profile = await mkdtemp(path.resolve('tests/.output/motion-lifecycle-'));
  await writeFile(path.join(directory, 'profile-location.json'), JSON.stringify({ profile, reason: 'Keep Chrome profile below Windows path limits; evidence remains under this run.' }));
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
    const context = nativeBrowser.contexts()[0];
    await context.addInitScript(() => {
      const state = window as unknown as Window & { lifecycle: { type: string; state: string; trusted: boolean; persisted?: boolean }[]; lifeToken: string };
      state.lifecycle = []; state.lifeToken = Math.random().toString(36);
      for (const type of ['visibilitychange', 'pagehide', 'pageshow']) window.addEventListener(type, event => state.lifecycle.push({ type, state: document.visibilityState, trusted: event.isTrusted, persisted: (event as PageTransitionEvent).persisted }));
    });
    const page = context.pages()[0]; await observe(page, true); await ready(page, new URL('vi/', baseURL).href);
    expect((await owned(page)).length).toBeGreaterThan(0);
    const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden'); await settle(page);
    const count = (await records(page)).length;
    await page.waitForTimeout(1000); expect((await records(page)).length).toBe(count);
    await page.bringToFront(); await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    await page.waitForTimeout(300); expect((await records(page)).length).toBe(count);
    const token = await page.evaluate(() => (window as unknown as Window & { lifeToken: string }).lifeToken);
    await page.goto(new URL('vi/about/', baseURL).href);
    // BFCache restoration need not dispatch DOMContentLoaded; use the native
    // history action and observe the restored URL/state instead of waiting for it.
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(new URL('vi/', baseURL).href);
    await expect(page.locator('#home-heading')).toBeVisible(); await settle(page);
    const evidence = await page.evaluate(() => ({ lifecycle: (window as unknown as Window & { lifecycle: unknown[] }).lifecycle, lifeToken: (window as unknown as Window & { lifeToken: string }).lifeToken, navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type, animations: document.getAnimations().filter(animation => animation.id.startsWith('component-motion:')).length }));
    await writeFile(path.join(directory, 'lifecycle.json'), JSON.stringify({ ...evidence, tokenBefore: token, browser: nativeBrowser.version(), mechanism: 'Default Chrome context connected with noDefaults; real tab backgrounding and real history navigation.' }, null, 2));
    expect(evidence.lifecycle).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'visibilitychange', state: 'hidden', trusted: true })]));
    expect(evidence.animations).toBe(0);
    expect(evidence.lifeToken === token || evidence.navigationType === 'back_forward').toBe(true);
    // Persisted restore is explicitly recorded rather than inferred from Back.
    info.annotations.push({ type: 'bfcache', description: String(evidence.lifeToken === token) });
  } finally {
    try { await nativeBrowser?.close(); }
    finally { processHandle.kill(); }
  }
});
