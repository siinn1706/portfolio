import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectReadableText } from './helpers/readable-text';

const base = process.env.BASE_PATH || '/';
const routes = ['', ...['vi', 'en'].flatMap(locale => ['', 'work/', 'work/healthos/', 'work/quan-ly-kho/', 'about/', 'notes/', 'notes/process-is-not-readiness/'].map(route => `${locale}/${route}`)), '404.html'];
const reports = path.resolve(process.env.QA_REPORT_DIR || '.qa/local');

async function assertReadableText(page: import('@playwright/test').Page, selector: string) {
  const blocks = page.locator(selector);
  for (const block of await blocks.all()) {
    await expect(block).toBeVisible();
    const diagnostics = await block.evaluate(inspectReadableText);
    expect(diagnostics.readable, JSON.stringify(diagnostics)).toBe(true);
  }
}

for (const route of routes) test(`public route ${route || '/'} has readable landmarks, valid images and no serious accessibility violations`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(route || './');
  if (route === '404.html') expect([200, 404]).toContain(response?.status());
  else expect(response?.status()).toBe(200);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    for (const image of document.querySelectorAll('img')) {
      image.loading = 'eager';
      await image.decode().catch(() => {});
    }
  });
  expect(await page.locator('img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => image.getAttribute('src')))).toEqual([]);
  expect(errors).toEqual([]);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations.filter(item => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
});

test('selected Notes are discoverable in both locales while deferred Photography remains absent', async ({ page }) => {
  for (const locale of ['vi', 'en']) {
    await page.goto(`${locale}/`);
    await expect(page.locator(`header a[href$="/${locale}/notes/"]`)).toBeVisible();
    await expect(page.locator('a[href*="/photography/"]')).toHaveCount(0);
    expect((await page.goto(`${locale}/notes/`))?.status()).toBe(200);
    await page.locator(`main a[href$="/${locale}/notes/process-is-not-readiness/"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/notes/process-is-not-readiness/$`));
    expect((await page.goto(`${locale}/photography/`))?.status()).toBe(404);
  }
});

test('case locale switch keeps entry identity and browser history', async ({ page }) => {
  await page.goto('vi/work/healthos/');
  await page.evaluate(() => document.fonts.ready);
  const english = page.locator('.locale-nav a[hreflang="en"]');
  const counterpart = await english.evaluate(link => (link as HTMLAnchorElement).href);
  expect(new URL(counterpart).pathname).toBe(`${base}en/work/healthos/`);
  await english.click();
  await expect(page).toHaveURL(counterpart);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${base}vi/work/healthos/$`));
  await page.goForward();
  await expect(page).toHaveURL(counterpart);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('header a[href$="/en/#contact"]').click();
  await expect(page.locator('#contact')).toBeInViewport();
});

test('keyboard skip link goes to main and focus remains visible', async ({ page }) => {
  await page.goto('vi/');
  await page.keyboard.press('Tab');
  const skip = page.locator('a[href="#main-content"], a[href="#main"]');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
});

for (const locale of ['vi', 'en']) test(`${locale}: both hero discovery links work without JavaScript and featured projects remain scroll reachable`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, baseURL });
  const page = await context.newPage();
  await page.goto(`${locale}/`);
  const about = page.locator('.hero-actions').getByRole('link', { name: locale === 'vi' ? 'Về mình' : 'About me', exact: true });
  await about.focus();
  await expect(about).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${locale}/about/$`));
  await page.goBack();
  await page.locator('.hero-actions').getByRole('link', { name: locale === 'vi' ? 'Xem dự án' : 'View projects', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/work/$`));
  await page.goto(`${locale}/#projects`);
  await expect(page.locator('#projects')).toBeInViewport();
  const featured = page.locator('[data-open-desk]').first();
  await page.locator('a[data-project-choice]').first().focus();
  await page.keyboard.press('Enter');
  await expect(featured).toBeInViewport();
  await context.close();
});

test('unknown locale and unknown route return a useful 404', async ({ page }) => {
  for (const route of ['fr/', 'vi/not-a-real-entry/']) {
    expect((await page.goto(route))?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/404|tìm thấy|not found/i);
    await expect(page.locator('a[href$="/vi/work/"]').first()).toBeVisible();
  }
});

for (const width of [320, 360, 390, 768, 960, 1024, 1440, 1920]) test(`responsive ${width}px VI/EN Home, About and cases preserve reading order and reachability`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
  for (const locale of ['vi', 'en']) for (const route of ['', 'work/', 'work/healthos/', 'work/quan-ly-kho/', 'about/']) {
    await page.goto(`${locale}/${route}`);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const bounds = await heading.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    const directory = path.join(reports, 'screenshots');
    await mkdir(directory, { recursive: true });
    if (!route) {
      const hero = page.locator('.hero');
      await expect(hero.locator('h1')).toHaveText(locale === 'vi' ? 'Chào bạn, mình là Nam.' : 'Hi, I’m Nam.');
      await expect(hero.locator('.identity-strip')).toContainText('Nguyễn Văn Nam');
      await expect(hero.locator('.identity-strip')).toContainText(locale === 'vi' ? /sinh viên/i : /student/i);
      await expect(hero.locator('.hero-actions a')).toHaveCount(2);
      await expect(hero.getByRole('link', { name: locale === 'vi' ? 'Về mình' : 'About me', exact: true })).toHaveAttribute('href', new RegExp(`/${locale}/about/$`));
      await expect(hero.getByRole('link', { name: locale === 'vi' ? 'Xem dự án' : 'View projects', exact: true })).toHaveAttribute('href', /(?:\/work\/|#projects)$/);
      await expect(page.locator('.hero + .work-section [data-featured-projects]')).toHaveCount(1);
      expect(await page.locator('main > section').evaluateAll(sections => sections.slice(0, 2).map(section => section.classList[0]))).toEqual(['hero', 'work-section']);
      await expect(page.locator('[data-featured-projects]')).toHaveCount(1);
      await expect(page.locator('.hero [data-featured-projects], .work-section .project-row, .direction-section, .about-teaser')).toHaveCount(0);
      await assertReadableText(page, '.hero h1, .hero-intro');
      if ([390, 1440].includes(width)) for (const selector of ['.identity-strip', 'h1', '.hero-intro', '.hero-actions']) await expect(hero.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    if (route === 'about/') {
      await expect(page.locator('.about-overview > .about-story')).toHaveCount(1);
      await expect(page.locator('.about-projects [data-project-id]')).toHaveCount(2);
      await expect(page.locator('.about-overview img')).toHaveCount(1);
      await expect(page.locator('.about-overview img')).toHaveAttribute('data-personal-media-id', 'nam-candid');
      await expect(page.locator('.about-projects time')).toHaveCount(0);
      const story = (await page.locator('.about-story').boundingBox())!;
      const projects = (await page.locator('.about-projects').boundingBox())!;
      if (width < 960) expect(projects.y).toBeGreaterThanOrEqual(story.y + story.height - 1);
      else {
        expect(projects.x).toBeGreaterThanOrEqual(story.x + story.width);
        expect(Math.abs(projects.y - story.y)).toBeLessThanOrEqual(1);
      }
      await assertReadableText(page, '.about-story p, .about-projects p');
    }
    if (!route) for (const projectId of ['healthos', 'quan-ly-kho']) {
      if (projectId !== 'healthos') await page.locator(`button[data-project-choice="${projectId}"]`).click();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const article = page.locator('[data-open-desk]:not([hidden])');
      const title = article.locator('.desk-title h2');
      const titleY = (await title.boundingBox())!.y;
      const image = article.locator('img').first();
      const firstImageY = (await image.boundingBox())!.y;
      // The compact personal hero supersedes the old first-fold project y thresholds.
      const heroBottom = await page.locator('.hero').evaluate(element => element.getBoundingClientRect().bottom);
      const featuredTop = await page.locator('[data-featured-projects]').evaluate(element => element.getBoundingClientRect().top);
      expect(featuredTop).toBeGreaterThanOrEqual(heroBottom);
      await title.scrollIntoViewIfNeeded();
      await expect(title).toBeInViewport();
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await writeFile(path.join(directory, `${width}-${locale}-home-${projectId}-geometry.json`), `${JSON.stringify({ checkedAt: new Date().toISOString(), width, locale, projectId, heroBottom, featuredTop, titleY, firstImageY, featuredAfterHero: true, scrollReachable: true }, null, 2)}\n`);
      await image.evaluate(async element => { const media = element as HTMLImageElement; media.loading = 'eager'; await media.decode(); });
      for (const visible of await page.locator('img:visible').all()) {
        await visible.scrollIntoViewIfNeeded();
        await visible.evaluate(async element => { const media = element as HTMLImageElement; media.loading = 'eager'; await media.decode(); });
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.screenshot({ path: path.join(directory, `${width}-${locale}-home-${projectId}-output.png`), fullPage: true });
      await article.locator('[data-panel="decisions"]').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await article.locator('[data-panel="output"]').click();
    }
    for (const image of await page.locator('img:visible').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async element => { const media = element as HTMLImageElement; media.loading = 'eager'; await media.decode(); });
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: path.join(directory, `${width}-${locale}-${route.replaceAll('/', '-') || 'home'}.png`), fullPage: true });
  }
  testInfo.annotations.push({ type: 'scope', description: 'Layout metrics and saved screenshots; direct visual inspection remains a separate review.' });
});

for (const locale of ['vi', 'en']) for (const route of ['', 'about/']) test(`${locale} ${route || 'Home'}: font failure and 200% text retain readable flow`, async ({ page }) => {
  await page.route('**/*.woff2', route => route.abort('failed'));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${locale}/${route}`);
  const before = await page.evaluate(() => ({ heading: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize), body: parseFloat(getComputedStyle(document.body).fontSize) }));
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.parentElement?.tagName !== 'SCRIPT') walker.currentNode.textContent = walker.currentNode.textContent?.normalize('NFD') || '';
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const enlarged = await page.evaluate(() => ({ heading: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize), body: parseFloat(getComputedStyle(document.body).fontSize) }));
  expect(enlarged.heading / before.heading).toBeGreaterThanOrEqual(1.9);
  expect(enlarged.body / before.body).toBeGreaterThanOrEqual(1.9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assertReadableText(page, route ? '.about-story p, .about-projects p' : '.hero h1, .hero-intro');
  const directory = path.join(reports, 'screenshots');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `320-${locale}-${route ? 'about' : 'home'}-font-failure-nfd-text-200.png`), fullPage: true });
});

for (const locale of ['vi', 'en']) test(`${locale}: Home and About reflow at a 200% zoom-equivalent viewport`, async ({ browser, baseURL }) => {
  // 1440×900 physical pixels / 2 = 720×450 CSS pixels. This simulates layout
  // at 200% zoom; it does not operate the browser's native zoom control.
  const context = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2, baseURL });
  const page = await context.newPage();
  const directory = path.join(reports, 'screenshots');
  await mkdir(directory, { recursive: true });
  for (const route of ['', 'about/']) {
    await page.goto(`${locale}/${route}`);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => ({ width: innerWidth, scale: devicePixelRatio, reflow: document.documentElement.scrollWidth <= innerWidth + 1 }))).toEqual({ width: 720, scale: 2, reflow: true });
    await assertReadableText(page, route ? '.about-story p, .about-projects p' : '.hero h1, .hero-intro');
    if (route) {
      const story = (await page.locator('.about-story').boundingBox())!;
      const projects = (await page.locator('.about-projects').boundingBox())!;
      expect(projects.y).toBeGreaterThanOrEqual(story.y + story.height - 1);
    } else {
      await expect(page.locator('.hero-actions a')).toHaveCount(2);
      await expect(page.locator('.hero + .work-section [data-featured-projects]')).toHaveCount(1);
      await page.locator('[data-project-choice]').first().scrollIntoViewIfNeeded();
      await expect(page.locator('[data-project-choice]').first()).toBeInViewport();
    }
    await page.screenshot({ path: path.join(directory, `720-css-dpr2-${locale}-${route ? 'about' : 'home'}-zoom-equivalent.png`), fullPage: true });
  }
  await context.close();
});

test('readability guard accepts visible headline ink and detects deliberately clipped text', async ({ page }) => {
  await page.goto('vi/');
  await page.evaluate(() => document.fonts.ready);
  const headline = page.locator('.hero h1');
  await expect(headline).toHaveText('Chào bạn, mình là Nam.');
  const baseline = await headline.evaluate(inspectReadableText);
  expect(baseline.readable).toBe(true);
  const original = await headline.getAttribute('style');
  await headline.evaluate(element => { (element as HTMLElement).style.cssText = 'height:1px; overflow:hidden'; });
  const clipped = await headline.evaluate(inspectReadableText);
  expect(clipped.readable).toBe(false);
  expect(clipped.clippedBy).toContain('h1#home-heading: vertical clip');
  await headline.evaluate((element, style) => { if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); }, original);
  const restored = await headline.evaluate(inspectReadableText);
  expect(restored.readable).toBe(true);
  await mkdir(reports, { recursive: true });
  await writeFile(path.join(reports, 'readability-guard-diagnostic.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), baseline, clipped, restored }, null, 2)}\n`);
});
