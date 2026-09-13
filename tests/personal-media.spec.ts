import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectReadableText } from './helpers/readable-text';

const reports = path.resolve(process.env.QA_REPORT_DIR || '.qa/local');
const personal = 'img[data-personal-media-id]';
const widths = [320, 360, 390, 768, 960, 1024, 1440, 1920];
const slot = (name: string) => `img[data-personal-slot="${name}"]`;

async function verifyMedia(page: Page, about: boolean, decode = true) {
  // These strict crop/proportion guards inspect the settled media layout.
  // Component-motion tests separately inspect genuine moving presentation;
  // rotated bounding boxes are larger even though CSS dimensions are unchanged.
  await page.evaluate(async () => {
    const owned = document.getAnimations().filter(animation => animation.id.startsWith('component-motion:'));
    await Promise.all(owned.map(animation => animation.finished.catch(() => undefined)));
  });
  const expected = about ? ['nam-candid'] : ['nam-avatar', 'nam-sticker'];
  expect(await page.locator(personal).evaluateAll(images => images.map(image => image.getAttribute('data-personal-media-id')))).toEqual(expected);
  if (decode) for (const image of await page.locator(personal).all()) await image.evaluate(async element => {
    const image = element as HTMLImageElement;
    image.loading = 'eager';
    await image.decode();
  });
  const media = await page.locator(personal).evaluateAll(images => images.map(element => {
    const image = element as HTMLImageElement;
    const rectangle = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return {
      id: image.dataset.personalMediaId, slot: image.dataset.personalSlot, role: image.dataset.personalRole,
      width: rectangle.width, height: rectangle.height, x: rectangle.x, y: rectangle.y,
      intrinsicWidth: image.getAttribute('width'), intrinsicHeight: image.getAttribute('height'),
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      alt: image.getAttribute('alt'), src: image.src, currentSrc: image.currentSrc,
      srcset: image.srcset, sizes: image.sizes, loading: image.loading,
      objectFit: style.objectFit, background: style.backgroundImage,
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
    };
  }));
  for (const image of media) {
    expect(Number(image.intrinsicWidth)).toBeGreaterThan(0);
    expect(Number(image.intrinsicHeight)).toBeGreaterThan(0);
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(image.alt).not.toBeNull();
    if (image.slot !== 'avatar') expect(image.alt?.trim().length).toBeGreaterThan(0);
    if (decode) expect(image.naturalWidth).toBeGreaterThan(0);
    expect(image.srcset).toMatch(/\d+w/);
    expect(image.sizes.trim().length).toBeGreaterThan(0);
    if (image.slot === 'avatar') {
      expect(image.role).toBe('avatar');
      expect(image.width).toBe(48);
      expect(image.height).toBe(48);
      expect(image.width).toBeLessThanOrEqual(64);
      expect(image.height).toBeLessThanOrEqual(64);
      expect(Math.abs(image.width - image.height)).toBeLessThanOrEqual(1);
    } else if (image.slot === 'homePortrait') {
      expect(image.id).toBe('nam-sticker');
      expect(image.role).toBe('sticker');
      expect(image.objectFit).toBe('contain');
      expect(image.borderWidths).toEqual(['0px', '0px', '0px', '0px']);
      expect(Math.abs(image.width - image.height)).toBeLessThanOrEqual(1);
      expect(image.width).toBeLessThanOrEqual(321);
    } else {
      expect(image.id).toBe('nam-candid');
      expect(image.slot).toBe('aboutPortrait');
      expect(image.role).toBe('portrait');
      expect(image.objectFit).toBe('contain');
      expect(Math.abs(image.width / image.height - 0.75)).toBeLessThan(0.01);
      expect(image.width).toBe(240);
    }
  }
  expect(await page.locator('*').evaluateAll(elements => elements.filter(element => /nam-avatar|avt(?:_2)?[._-]/i.test(getComputedStyle(element).backgroundImage)).map(element => element.tagName))).toEqual([]);
  expect(await page.locator('meta[property="og:image"], meta[name="twitter:image"]').evaluateAll(elements => elements.map(element => element.getAttribute('content')).filter(value => /nam-avatar|avt/i.test(value || '')))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  return media;
}

async function readable(page: Page, about: boolean) {
  for (const paragraph of await page.locator(about ? '.about-story p, .about-projects p' : '.hero h1, .hero-intro').all()) {
    await expect(paragraph).toBeVisible();
    const result = await paragraph.evaluate(inspectReadableText);
    expect(result.readable, JSON.stringify(result)).toBe(true);
  }
  if (!about) {
    await expect(page.locator('.hero-actions a')).toHaveCount(2);
    for (const link of await page.locator('.hero-actions a').all()) await expect(link).toBeVisible();
  }
}

for (const width of widths) for (const dpr of [1, 2]) test(`personal images ${width}px DPR${dpr}: VI/EN mapping, proportions, native candidates and order`, async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 }, deviceScaleFactor: dpr, baseURL });
  const page = await context.newPage();
  const evidence: unknown[] = [];
  const directory = path.join(reports, 'personal-media');
  await mkdir(directory, { recursive: true });
  try {
    for (const locale of ['vi', 'en']) for (const route of ['', 'about/']) {
      const about = Boolean(route);
      await page.goto(`${locale}/${route}`);
      await page.evaluate(() => document.fonts.ready);
      const media = await verifyMedia(page, about);
      await readable(page, about);
      if (!about) {
        expect(await page.locator('.hero-actions').evaluate((actions, selector) => Boolean(actions.compareDocumentPosition(document.querySelector(selector)!) & Node.DOCUMENT_POSITION_FOLLOWING), slot('homePortrait'))).toBe(true);
        const actions = (await page.locator('.hero-actions').boundingBox())!;
        const portrait = (await page.locator(slot('homePortrait')).boundingBox())!;
        if (width < 1024) {
          expect(portrait.y).toBeGreaterThanOrEqual(actions.y + actions.height);
          expect(portrait.width).toBe(240);
        } else {
          expect(portrait.x).toBeGreaterThanOrEqual(actions.x + actions.width);
          expect(portrait.width).toBe(320);
        }
      } else {
        await expect(page.locator('.about-projects time')).toHaveCount(0);
        const placement = await page.locator(slot('aboutPortrait')).evaluate(image => ({
          inStory: Boolean(image.closest('.about-story')),
          previousParagraph: image.closest('.about-portrait')?.previousElementSibling?.tagName,
          followsLearning: image.closest('.about-portrait')?.previousElementSibling?.classList.contains('about-learning'),
          beforeEducation: Boolean(document.querySelector('#education-heading') && (image.compareDocumentPosition(document.querySelector('#education-heading')!) & Node.DOCUMENT_POSITION_FOLLOWING)),
        }));
        expect(placement.inStory).toBe(true);
        expect(placement.previousParagraph).toBe('P');
        expect(placement.followsLearning).toBe(true);
        expect(placement.beforeEducation).toBe(true);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      if ([320, 390, 960, 1440].includes(width)) await page.screenshot({ path: path.join(directory, `${width}-dpr${dpr}-${locale}-${about ? 'about' : 'home'}.png`), fullPage: true });
      evidence.push({ locale, route: route || 'home', width, dpr, media, readable: true, overflow: false });
    }
    await writeFile(path.join(directory, `${width}-dpr${dpr}-geometry.json`), `${JSON.stringify({ checkedAt: new Date().toISOString(), evidence }, null, 2)}\n`);
  } finally { await context.close(); }
});

for (const locale of ['vi', 'en']) for (const route of ['', 'about/']) test(`${locale} ${route || 'Home'}: delayed and failed personal images preserve layout and text`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const pattern = '**/*nam-{avatar,candid,sticker}*.webp';
  let heldRequests = 0;
  await page.route(pattern, async request => { heldRequests++; await hold; await request.continue(); });
  try {
    await page.goto(`${locale}/${route}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    for (const image of await page.locator(personal).all()) await image.evaluate(element => { (element as HTMLImageElement).loading = 'eager'; });
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    const before = await verifyMedia(page, Boolean(route), false);
    await readable(page, Boolean(route));
    release();
    const after = await verifyMedia(page, Boolean(route));
    after.forEach((image, index) => {
      expect(Math.abs(image.width - before[index].width)).toBeLessThanOrEqual(1);
      expect(Math.abs(image.height - before[index].height)).toBeLessThanOrEqual(1);
      expect(Math.abs(image.y - before[index].y)).toBeLessThanOrEqual(1);
    });
    await page.unroute(pattern);
    await page.route(pattern, request => request.abort('failed'));
    await page.reload();
    await verifyMedia(page, Boolean(route), false);
    await readable(page, Boolean(route));
    expect(await page.locator(personal).evaluateAll(images => images.every(image => !(image as HTMLImageElement).naturalWidth))).toBe(true);
    const directory = path.join(reports, 'personal-media');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `390-${locale}-${route ? 'about' : 'home'}-image-failure.png`), fullPage: true });
    await writeFile(path.join(directory, `${locale}-${route ? 'about' : 'home'}-loading.json`), `${JSON.stringify({ checkedAt: new Date().toISOString(), heldRequests, before, after, brokenImagesReadable: true }, null, 2)}\n`);
  } finally { release(); }
});

for (const locale of ['vi', 'en']) test(`${locale}: personal images and discovery links work without JavaScript`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, baseURL });
  try {
    const page = await context.newPage();
    await page.goto(`${locale}/`);
    await verifyMedia(page, false);
    await readable(page, false);
    await page.locator('.hero-actions a').first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/about/$`));
    await verifyMedia(page, true);
    await readable(page, true);
    await expect(page.locator('.about-projects time')).toHaveCount(0);
  } finally { await context.close(); }
});

for (const locale of ['vi', 'en']) test(`${locale}: portraits respect reduced motion, print and 200% text avatar bounds`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['', 'about/']) {
    await page.goto(`${locale}/${route}`);
    await verifyMedia(page, Boolean(route));
    expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await verifyMedia(page, Boolean(route));
    await readable(page, Boolean(route));
    await page.emulateMedia({ media: 'print' });
    await verifyMedia(page, Boolean(route));
    await readable(page, Boolean(route));
    await page.emulateMedia({ media: 'screen' });
  }
});
