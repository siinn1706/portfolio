import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const active = '[data-open-desk]:not([hidden])';
const picker = (page: Page, id: string) => page.locator(`button[data-project-choice="${id}"]`);
const desk = (page: Page) => page.locator(active);
const status = (page: Page) => page.locator('[data-project-status]');
const tab = (page: Page, layer: string) => desk(page).locator(`[data-panel="${layer}"]`);
const targetId = (id: string, layer?: string) => `home-featured-${id}${layer ? `--panel-${layer}` : ''}`;
async function ready(page: Page, route = 'vi/') {
  await page.goto(route);
  await expect(page.locator('[data-featured-projects]')).toHaveAttribute('data-enhanced', 'true');
}
async function replay(page: Page) {
  const script = await page.locator('script[data-featured-coordinator]').first().textContent();
  expect(script).toBeTruthy();
  await page.addScriptTag({ content: script! });
}
async function assertIds(page: Page) {
  expect(await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]'), element => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  })).toEqual([]);
  expect(await page.locator('[data-open-desk] [aria-controls], [data-open-desk] [aria-labelledby]').evaluateAll(elements => elements.flatMap(element => {
    const references = `${element.getAttribute('aria-controls') || ''} ${element.getAttribute('aria-labelledby') || ''}`.trim().split(/\s+/);
    return references.filter(id => !element.closest('[data-open-desk]')?.contains(document.getElementById(id)));
  }))).toEqual([]);
}
async function watchStatus(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & { statusWrites?: number; statusObserver?: MutationObserver };
    state.statusObserver?.disconnect(); state.statusWrites = 0;
    state.statusObserver = new MutationObserver(records => { state.statusWrites! += records.length; });
    state.statusObserver.observe(document.querySelector('[data-project-status]')!, { childList: true, characterData: true, subtree: true });
  });
}
const statusWrites = (page: Page) => page.evaluate(() => (window as typeof window & { statusWrites: number }).statusWrites);
async function readableBaseline(page: Page) {
  await expect(page.locator('[data-featured-projects]')).not.toHaveAttribute('data-enhanced', 'true');
  await expect(page.locator('a[data-project-choice]')).toHaveCount(2);
  await expect(page.locator('button[data-project-choice], [data-open-desk] [role="tab"]')).toHaveCount(0);
  await expect(page.locator('[data-open-desk][hidden], [data-desk-panel][hidden]')).toHaveCount(0);
  for (const article of await page.locator('[data-open-desk]').all()) {
    await expect(article).toBeVisible();
    for (const section of await article.locator('[data-desk-panel]').all()) await expect(section).toBeVisible();
  }
  for (const anchor of await page.locator('a[data-project-choice]').all()) expect(await anchor.getAttribute('href')).toMatch(/^#home-featured-/);
}
async function injectFailure(page: Page, failure: 'second-desk' | 'second-anchor') {
  await page.addInitScript(kind => {
    const state = window as typeof window & { failAgain: () => void };
    state.failAgain = () => {
      let hits = 0;
      if (kind === 'second-desk') {
        const original = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name: string, value: string) {
          if (name === 'role' && value === 'tablist' && this.hasAttribute('data-desk-tabs') && ++hits === 2) {
            Element.prototype.setAttribute = original;
            throw new Error('Intentional second-desk initializer failure');
          }
          return original.call(this, name, value);
        };
      } else {
        const original = Element.prototype.replaceWith;
        Element.prototype.replaceWith = function (...nodes: (string | Node)[]) {
          if (this.matches('a[data-project-choice]') && ++hits === 2) {
            Element.prototype.replaceWith = original;
            throw new Error('Intentional second-anchor initializer failure');
          }
          return original.apply(this, nodes);
        };
      }
    };
    state.failAgain();
  }, failure);
}

for (const locale of ['vi', 'en']) test(`${locale}: native picker changes the complete project and preserves independent identity`, async ({ page }) => {
  await ready(page, `${locale}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'vi' ? 'Chào bạn, mình là Nam.' : 'Hi, I’m Nam.');
  await expect(page.locator('.identity-strip')).toContainText('Nguyễn Văn Nam');
  const identity = await page.locator('h1').textContent();
  const expected = new Map<string, unknown>();
  for (const article of await page.locator('[data-open-desk]').all()) expected.set((await article.getAttribute('data-project-id'))!, await payload(article));
  await expect(page.locator('[data-project-choice]')).toHaveCount(2);
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await expect(desk(page)).toHaveAttribute('data-project-id', 'healthos');
  await expect(picker(page, 'healthos')).toHaveAttribute('aria-disabled', 'true');
  const originalUrl = page.url(); const historyLength = await page.evaluate(() => history.length);
  for (const id of ['quan-ly-kho', 'healthos']) {
    await tab(page, 'decisions').click();
    await picker(page, id).click();
    await expect(picker(page, id)).toBeFocused();
    await expect(desk(page)).toHaveAttribute('data-project-id', id);
    await expect(tab(page, 'output')).toHaveAttribute('aria-selected', 'true');
    expect(await payload(desk(page))).toEqual(expected.get(id));
    await expect(page.locator('h1')).toHaveText(identity!);
    if (id === 'quan-ly-kho') await expect(desk(page)).not.toContainText('BFF');
    await expect(page.locator('[data-project-count]')).toHaveText(`${id === 'healthos' ? 1 : 2} / 2`);
    await assertIds(page);
  }
  expect(page.url()).toBe(originalUrl); expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await tab(page, 'decisions').click(); await watchStatus(page);
  const message = await status(page).textContent();
  await picker(page, 'healthos').click({ force: true });
  await expect(tab(page, 'decisions')).toHaveAttribute('aria-selected', 'true');
  await expect(status(page)).toHaveText(message!); expect(await statusWrites(page)).toBe(0);
});
async function payload(article: Locator) {
  return article.evaluate(element => ({
    title: element.querySelector('h2')?.textContent,
    role: element.querySelector('.desk-role')?.textContent,
    sections: Array.from(element.querySelectorAll('[data-desk-panel]'), panel => panel.textContent),
    links: Array.from(element.querySelectorAll('a'), anchor => anchor.getAttribute('href')),
    media: Array.from(element.querySelectorAll('img'), image => [image.alt, image.getAttribute('src'), image.getAttribute('srcset')]),
    captions: Array.from(element.querySelectorAll('figcaption'), caption => caption.textContent),
  }));
}

for (const locale of ['vi', 'en']) test(`${locale}: automatic inner tabs scope keyboard behavior to the visible project`, async ({ page }) => {
  await ready(page, `${locale}/`);
  for (const id of ['healthos', 'quan-ly-kho']) {
    if (id !== 'healthos') await picker(page, id).click();
    const tabs = desk(page).getByRole('tab'); const output = tabs.nth(2);
    await expect(tabs).toHaveCount(3); await expect(output).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await output.focus(); await page.keyboard.press('ArrowRight');
    await expect(tabs.first()).toBeFocused(); await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(output).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('Space'); await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End'); await expect(output).toBeFocused();
    await expect(output).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter'); await expect(output).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home'); await expect(tabs.first()).toBeFocused(); await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft'); await expect(output).toBeFocused(); await expect(output).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(tabs.first()).toBeFocused();
    const caseLink = desk(page).locator('.desk-footer a');
    await tab(page, 'decisions').click(); await expect(caseLink).toBeVisible();
    expect(await caseLink.evaluate(element => Boolean(element.closest('[role="tabpanel"]')))).toBe(false);
  }
});

test('picker is a native sequential button group with current choice focusable and no outer tab keyboard', async ({ page }) => {
  await ready(page);
  await picker(page, 'healthos').focus();
  await page.keyboard.press('ArrowRight'); await expect(picker(page, 'healthos')).toBeFocused();
  await page.keyboard.press('End'); await expect(picker(page, 'healthos')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(picker(page, 'quan-ly-kho')).toBeFocused();
  await page.keyboard.press('Space'); await expect(desk(page)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await page.keyboard.press('Shift+Tab'); await expect(picker(page, 'healthos')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(desk(page)).toHaveAttribute('data-project-id', 'healthos');
  expect(await page.locator('[data-open-desk][hidden] a, [data-open-desk][hidden] button, [data-open-desk][hidden] [tabindex]').evaluateAll(elements => elements.some(element => (element as HTMLElement).getClientRects().length > 0))).toBe(false);
});

test('repeated selections and successful artifact script replay preserve state focus IDs and listener count', async ({ page }) => {
  await ready(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (let index = 0; index < 12; index++) {
    await picker(page, index % 2 ? 'healthos' : 'quan-ly-kho').click();
    await tab(page, index % 2 ? 'context' : 'decisions').click();
  }
  await picker(page, 'quan-ly-kho').click(); await tab(page, 'decisions').click();
  const focus = await page.evaluate(() => document.activeElement?.id);
  const before = await page.locator('[data-featured-projects]').innerHTML();
  await watchStatus(page); await replay(page); await replay(page);
  expect(await page.locator('[data-featured-projects]').innerHTML()).toBe(before);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(focus);
  expect(await statusWrites(page)).toBe(0); await assertIds(page);
  await picker(page, 'healthos').click(); expect(await statusWrites(page)).toBe(1);
  await expect(tab(page, 'output')).toHaveAttribute('aria-selected', 'true'); expect(errors).toEqual([]);
});

for (const failure of ['second-desk', 'second-anchor'] as const) test(`${failure}: partial init rolls back, native anchors work, artifact retries cleanly`, async ({ page }) => {
  await injectFailure(page, failure); await page.goto('vi/'); await readableBaseline(page);
  await page.locator('a[data-project-choice="quan-ly-kho"]').click();
  await expect(page).toHaveURL(/#home-featured-quan-ly-kho$/); await readableBaseline(page);
  await page.evaluate(() => { location.hash = 'home-featured-healthos--panel-context'; }); await readableBaseline(page);
  await replay(page); await expect(page.locator('[data-featured-projects]')).toHaveAttribute('data-enhanced', 'true');
  await expect(tab(page, 'context')).toHaveAttribute('aria-selected', 'true'); await assertIds(page);
  await watchStatus(page); await picker(page, 'quan-ly-kho').click(); expect(await statusWrites(page)).toBe(1);
  // A new page starts from original HTML and must restore the original anchors again.
  await page.reload(); await readableBaseline(page); await replay(page);
  await watchStatus(page); await picker(page, 'quan-ly-kho').click(); expect(await statusWrites(page)).toBe(1);
});

for (const locale of ['vi', 'en']) for (const scale of [100, 200]) test(`${locale} ${scale}%: anchor to button keeps focus and control geometry`, async ({ page }) => {
  await injectFailure(page, 'second-desk'); await page.goto(`${locale}/`);
  await page.evaluate(value => { document.documentElement.style.fontSize = `${value}%`; }, scale);
  await page.evaluate(() => document.fonts.ready);
  const anchor = page.locator('a[data-project-choice="healthos"]'); await anchor.focus();
  // The picker now follows the hero. Finish native focus scrolling before
  // comparing anchor/button viewport geometry at enlarged text sizes.
  let previousY: number | undefined; let stable = 0;
  await expect.poll(async () => {
    const box = await anchor.boundingBox();
    stable = box && previousY !== undefined && Math.abs(box.y - previousY) < 0.25 ? stable + 1 : 0;
    previousY = box?.y;
    return stable;
  }).toBeGreaterThanOrEqual(3);
  const before = await page.locator('[data-project-choice]').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  await replay(page); await expect(picker(page, 'healthos')).toBeFocused();
  const after = await page.locator('[data-project-choice]').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  after.forEach((box, index) => { for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(box[key] - before[index][key])).toBeLessThanOrEqual(1); });
});

for (const failure of ['no-js', 'script-failure'] as const) test(`${failure}: every project section and native journey is readable`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: failure !== 'no-js', viewport: { width: 390, height: 844 }, baseURL });
  const page = await context.newPage();
  if (failure === 'script-failure') await page.route('**/*', async route => {
    if (route.request().resourceType() === 'script') return route.abort('failed');
    if (route.request().resourceType() === 'document') {
      const response = await route.fetch();
      return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "script-src 'none'; object-src 'none'" } });
    }
    return route.continue();
  });
  await page.goto('vi/'); await readableBaseline(page);
  await page.locator('a[data-project-choice="quan-ly-kho"]').click();
  await expect(page.locator('#home-featured-quan-ly-kho')).toBeInViewport();
  await expect(page.locator('a[href^="mailto:"]').first()).toHaveAttribute('href', /^mailto:/);
  const caseLink = page.locator('[data-project-id="quan-ly-kho"] .desk-footer a');
  await caseLink.focus(); await expect(caseLink).toBeFocused(); await expect(caseLink).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/vi\/work\/quan-ly-kho\/$/);
  await page.locator('header a[href$="/vi/about/"]').click(); await expect(page).toHaveURL(/\/vi\/about\/$/);
  await context.close();
});

test('no-JS: a visible case link supports real pointer navigation', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, baseURL });
  const page = await context.newPage();
  await page.goto('vi/');
  await page.locator('a[data-project-choice="quan-ly-kho"]').click();
  const link = page.locator('[data-project-id="quan-ly-kho"] .desk-footer a');
  await link.focus(); await expect(link).toBeFocused(); await expect(link).toBeVisible(); await expect(link).toBeInViewport();
  // Native focus scroll is smooth. Measure its end before choosing a pointer coordinate.
  let previousY: number | undefined; let stable = 0;
  await expect.poll(async () => {
    const box = await link.boundingBox();
    stable = box && previousY !== undefined && Math.abs(box.y - previousY) < 0.25 ? stable + 1 : 0;
    previousY = box?.y;
    return stable;
  }).toBeGreaterThanOrEqual(3);
  const box = (await link.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/\/vi\/work\/quan-ly-kho\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.close();
});

test('native featured fragments reveal project and layer on load hashchange and reload without rewriting URL', async ({ page }) => {
  await ready(page, `en/#${targetId('quan-ly-kho', 'decisions')}`);
  await expect(desk(page)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(tab(page, 'decisions')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#${targetId('quan-ly-kho', 'decisions')}`)).toBeInViewport();
  const fragmentUrl = page.url(); await picker(page, 'healthos').click(); expect(page.url()).toBe(fragmentUrl);
  await page.reload(); await expect(desk(page)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  for (const id of ['healthos', 'quan-ly-kho']) {
    await page.evaluate(hash => { location.hash = hash; }, targetId(id));
    await expect(desk(page)).toHaveAttribute('data-project-id', id);
    await expect(tab(page, 'output')).toHaveAttribute('aria-selected', 'true');
  }
  for (const hash of ['contact', 'unknown', 'home-featured-private-study', '%E0%A4%A']) {
    await page.evaluate(value => { location.hash = value; }, hash);
    await expect(desk(page)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  }
});

test('fragment focus moves only when its old project or section becomes hidden', async ({ page }) => {
  await ready(page);
  await desk(page).locator('.desk-footer a').focus();
  await page.evaluate(() => { location.hash = 'home-featured-quan-ly-kho--panel-decisions'; });
  await expect(desk(page)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  expect(await page.evaluate(() => document.activeElement?.closest('[hidden]'))).toBeNull();
  expect(await page.evaluate(() => document.activeElement?.closest('[data-project-id]')?.getAttribute('data-project-id'))).toBe('quan-ly-kho');
  await page.getByRole('tabpanel').focus();
  await page.evaluate(() => { location.hash = 'home-featured-quan-ly-kho--panel-context'; });
  await expect(tab(page, 'context')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-desk-panel]')?.getAttribute('data-desk-panel'))).toBe('context');
  await picker(page, 'healthos').focus();
  await page.evaluate(() => { location.hash = 'home-featured-healthos--panel-decisions'; });
  await expect(picker(page, 'healthos')).toBeFocused();
  await page.locator('header a').first().focus();
  const outside = await page.evaluate(() => document.activeElement?.outerHTML);
  await page.evaluate(() => { location.hash = 'home-featured-quan-ly-kho'; });
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(outside);
});

test('Home locale switch defaults and Back skips all local project selections', async ({ page }) => {
  await page.goto('vi/about/'); await page.locator('header a[href$="/vi/"]').first().click();
  for (const id of ['quan-ly-kho', 'healthos', 'quan-ly-kho']) await picker(page, id).click();
  await page.locator('header a[href$="/en/"]').click(); await expect(desk(page)).toHaveAttribute('data-project-id', 'healthos');
  await page.goBack(); await expect(page).toHaveURL(/\/vi\/$/);
  await page.goBack(); await expect(page).toHaveURL(/\/vi\/about\/$/);
});

test('an explicit blur before a featured fragment does not resurrect earlier focus', async ({ page }) => {
  await ready(page);
  await desk(page).locator('.desk-footer a').focus();
  await page.evaluate(() => { (document.activeElement as HTMLElement).blur(); });
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  await page.evaluate(() => { location.hash = 'home-featured-quan-ly-kho--panel-decisions'; });
  await expect(desk(page)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(tab(page, 'decisions')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
});

test('a fragment to an already visible panel preserves header and picker focus', async ({ page }) => {
  await ready(page);
  for (const control of [page.locator('header a').first(), picker(page, 'healthos')]) {
    await page.evaluate(() => { location.hash = 'unknown-reset'; });
    await control.focus(); await expect(control).toBeFocused();
    await page.evaluate(() => { location.hash = 'home-featured-healthos--panel-output'; });
    await expect(tab(page, 'output')).toHaveAttribute('aria-selected', 'true');
    await expect(control).toBeFocused();
  }
});

test('delayed and broken warehouse media never revert project state and preserve image geometry', async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*warehouse-dashboard*.webp', async route => { await hold; await route.continue(); });
  await ready(page); await picker(page, 'quan-ly-kho').click();
  const before = await desk(page).locator('img').boundingBox(); expect(before?.height).toBeGreaterThan(0);
  await picker(page, 'healthos').click(); release();
  await page.locator('[data-project-id="quan-ly-kho"] img').evaluate(async element => { const image = element as HTMLImageElement; image.loading = 'eager'; await image.decode(); });
  await expect(desk(page)).toHaveAttribute('data-project-id', 'healthos');
  await expect(desk(page).locator('figure')).toHaveAttribute('data-media-id', 'healthos-home');
  await picker(page, 'quan-ly-kho').click(); const after = await desk(page).locator('img').boundingBox();
  expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
  await page.unroute('**/*warehouse-dashboard*.webp');
  await page.route('**/*warehouse-dashboard*.webp', route => route.abort('failed'));
  await page.reload(); await picker(page, 'quan-ly-kho').click();
  await expect(desk(page).locator('figcaption')).toBeVisible();
  await expect(desk(page).locator('img')).toHaveAttribute('alt', /\S+/);
  await expect(desk(page).locator('.desk-footer a')).toHaveAttribute('href', /\/work\/quan-ly-kho\/$/);
  await picker(page, 'healthos').click(); await expect(desk(page)).toHaveAttribute('data-project-id', 'healthos');
});

test('reduced motion print and every active layer remain accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page);
  for (const id of ['healthos', 'quan-ly-kho']) {
    if (id !== 'healthos') await picker(page, id).click();
    for (const layer of ['context', 'decisions', 'output']) {
      await tab(page, layer).click();
      expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
      const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(scan.violations.filter(item => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
    }
  }
  await page.emulateMedia({ media: 'print' });
  for (const article of await page.locator('[data-open-desk]').all()) {
    await expect(article).toBeVisible(); for (const section of await article.locator('[data-desk-panel]').all()) await expect(section).toBeVisible();
  }
  for (const control of await page.locator('[data-project-choice], [data-desk-tabs]').all()) await expect(control).toBeHidden();
});

test('mobile menu closes on Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page, 'en/');
  for (const control of await page.locator('.locale-nav a, [data-menu-toggle], [data-project-choice]').all()) {
    const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const menu = page.getByRole('button', { name: /menu/i }); await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true'); await page.locator('header a[href$="/en/about/"]').focus();
  await page.keyboard.press('Escape'); await expect(menu).toHaveAttribute('aria-expanded', 'false'); await expect(menu).toBeFocused();
});

test('clipboard failure reports failure and retains a useful email link', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } }));
  await ready(page, 'en/#contact'); await page.getByRole('button', { name: /copy.*email/i }).click();
  const contactStatus = page.locator('#contact').getByRole('status');
  await expect(contactStatus).toContainText(/could not|couldn.t|unable|failed|select|manually/i);
  await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible(); await expect(contactStatus).not.toContainText(/copied/i);
});
