import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectReadableText } from './helpers/readable-text';

const reports = path.resolve(process.env.QA_REPORT_DIR || '.qa/local');
const captureRoot = path.join(reports, 'micro-details');
type Box = { x: number; y: number; width: number; height: number };

async function capture(page: Page, region: Locator, name: string, testInfo: TestInfo) {
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  const clip = {
    x: Math.max(0, box!.x - 12),
    y: Math.max(0, box!.y - 12),
    width: Math.min(viewport.width, box!.x + box!.width + 12) - Math.max(0, box!.x - 12),
    height: Math.min(viewport.height, box!.y + box!.height + 12) - Math.max(0, box!.y - 12),
  };
  expect(clip.width).toBeGreaterThan(0);
  expect(clip.height).toBeGreaterThan(0);
  await mkdir(captureRoot, { recursive: true });
  const file = path.join(captureRoot, `${name}.png`);
  await page.screenshot({ path: file, clip, animations: 'allow' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
  return file;
}

async function pose(page: Page, name: string, fraction: number) {
  return page.evaluate(({ name, fraction }) => {
    const animations = document.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName === name);
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction;
    }
    return animations.map(animation => ({ name, currentTime: animation.currentTime, duration: animation.effect!.getTiming().duration }));
  }, { name, fraction });
}

async function finish(page: Page, name?: string) {
  await page.evaluate(name => {
    for (const animation of document.getAnimations()) {
      if (!name || animation instanceof CSSAnimation && animation.animationName === name) animation.finish();
    }
  }, name);
}

async function transitionPose(target: Locator, fraction: number) {
  return target.evaluate((element, fraction) => {
    const animations = element.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction;
    }
    return animations.length;
  }, fraction);
}

function fixedBox(before: Box, after: Box) {
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[key] - after[key]), `${key} must not move`).toBeLessThanOrEqual(0.1);
  expect(before.height).toBeGreaterThanOrEqual(44);
  expect(before.width).toBeGreaterThanOrEqual(44);
}

for (const locale of ['vi', 'en']) test(`${locale}: D01–D08 have bounded trigger poses, fixed targets and truthful clipboard feedback`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const evidence: Record<string, unknown> = {};
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    // Pause the actual browser-triggered CSS animation, not an imitation of it.
    // Captures below select exact timeline positions; they are not FPS evidence.
    document.addEventListener('animationstart', event => {
      const name = (event as AnimationEvent).animationName;
      if (!['wordmark-mark', 'project-underline', 'copy-confirmed'].includes(name)) return;
      for (const animation of document.getAnimations()) {
        if (animation instanceof CSSAnimation && animation.animationName === name) {
          animation.pause();
          animation.currentTime = 0;
        }
      }
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: () => new Promise<void>((resolve, reject) => {
        Object.assign(window, { microCopyResolve: resolve, microCopyReject: () => reject(new Error('Test clipboard failure')) });
      }),
    } });
  });
  await page.goto(`${locale}/`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('data-micro-details-mounted', 'true');
  const heading = page.locator('#home-heading');
  evidence.D02 = { before: await capture(page, heading, `${locale}-D02-before`, testInfo) };
  expect(await heading.evaluate(inspectReadableText)).toMatchObject({ readable: true });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // D02's marker stays as a static accent; replacement component entry owns motion.
  // Restoring the preference must not replay the removed decorative entry.
  await expect(heading).not.toHaveAttribute('data-micro-enter');
  expect(await pose(page, 'hero-marker', 0)).toEqual([]);
  const marker = await heading.locator(':scope > span').first().evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { content: style.content, transform: style.transform, animation: style.animationName };
  });
  expect(marker).toEqual({ content: '""', transform: 'none', animation: 'none' });
  await capture(page, heading, `${locale}-D02-static-restored`, testInfo);
  expect(await heading.evaluate(inspectReadableText)).toMatchObject({ readable: true });

  const wordmark = page.locator('.wordmark');
  const wordmarkBox = (await wordmark.boundingBox())!;
  await capture(page, wordmark, `${locale}-D01-before`, testInfo);
  await wordmark.hover();
  await expect.poll(() => pose(page, 'wordmark-mark', 0)).not.toEqual([]);
  await capture(page, wordmark, `${locale}-D01-trigger`, testInfo);
  expect((await pose(page, 'wordmark-mark', .5))[0].duration).toBe(160);
  await capture(page, wordmark, `${locale}-D01-mid`, testInfo);
  fixedBox(wordmarkBox, (await wordmark.boundingBox())!);
  await finish(page, 'wordmark-mark');
  await capture(page, wordmark, `${locale}-D01-after`, testInfo);

  const heroLink = page.locator('.hero-actions a').first();
  await page.mouse.move(0, 0);
  const heroBox = (await heroLink.boundingBox())!;
  await capture(page, page.locator('.hero-actions'), `${locale}-D03-before`, testInfo);
  await heroLink.hover();
  await transitionPose(heroLink, 0);
  await capture(page, page.locator('.hero-actions'), `${locale}-D03-trigger`, testInfo);
  await transitionPose(heroLink, .5);
  await capture(page, page.locator('.hero-actions'), `${locale}-D03-mid`, testInfo);
  fixedBox(heroBox, (await heroLink.boundingBox())!);
  await page.mouse.down();
  fixedBox(heroBox, (await heroLink.boundingBox())!);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await heroLink.focus();
  await expect(heroLink).toBeFocused();
  await finish(page);
  await capture(page, page.locator('.hero-actions'), `${locale}-D03-after`, testInfo);

  const paper = page.locator('.featured-paper');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await paper.evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 32, behavior: 'instant' }));
  await capture(page, paper, `${locale}-D04-before`, testInfo);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // D04's rear sheet retains its final paper pose without replaying an entry.
  await expect(paper).not.toHaveAttribute('data-micro-enter');
  expect(await pose(page, 'featured-edge', 0)).toEqual([]);
  expect(await paper.evaluate(element => getComputedStyle(element, '::before').animationName)).toBe('none');
  expect(await paper.evaluate(inspectReadableText)).toMatchObject({ readable: true });
  await capture(page, paper, `${locale}-D04-static-restored`, testInfo);
  const paperTransform = await paper.evaluate(element => getComputedStyle(element, '::before').transform);
  expect(paperTransform).not.toBe('none');

  const secondProject = page.locator('button[data-project-choice]').nth(1);
  await secondProject.scrollIntoViewIfNeeded();
  const choiceBox = (await secondProject.boundingBox())!;
  await capture(page, page.locator('.desk-area'), `${locale}-D05-before`, testInfo);
  await secondProject.click();
  await expect(secondProject).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-project-count]')).toHaveText('2 / 2');
  await expect(page.locator('[data-open-desk]:not([hidden])')).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(secondProject).toBeFocused();
  fixedBox(choiceBox, (await secondProject.boundingBox())!);
  await pose(page, 'project-underline', 0);
  await capture(page, page.locator('.desk-area'), `${locale}-D05-trigger`, testInfo);
  const selection = await pose(page, 'project-underline', .5);
  expect(selection.some(animation => animation.duration === 220)).toBe(true);
  await capture(page, page.locator('.desk-area'), `${locale}-D05-mid`, testInfo);
  await finish(page);
  await capture(page, page.locator('.desk-area'), `${locale}-D05-after`, testInfo);

  const contact = page.locator('#contact');
  await contact.scrollIntoViewIfNeeded();
  const contactLink = page.locator('.contact-link').first();
  const contactBox = (await contactLink.boundingBox())!;
  await capture(page, contact, `${locale}-D07-before`, testInfo);
  await contactLink.hover();
  await transitionPose(contactLink, 0);
  await capture(page, contact, `${locale}-D07-trigger`, testInfo);
  await transitionPose(contactLink, .5);
  await capture(page, contact, `${locale}-D07-mid`, testInfo);
  fixedBox(contactBox, (await contactLink.boundingBox())!);
  await finish(page);
  await page.mouse.down();
  await transitionPose(contactLink, 1);
  fixedBox(contactBox, (await contactLink.boundingBox())!);
  expect(await contactLink.locator('.contact-icon').evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
  await capture(page, contact, `${locale}-D07-after`, testInfo);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(page.locator('.contact-platform')).toHaveText(['Facebook', 'Zalo', 'Email', 'GitHub']);

  const copy = page.locator('.copy-email');
  await capture(page, contact, `${locale}-D08-before`, testInfo);
  await copy.click();
  await expect(copy).toBeDisabled();
  await expect(copy).toHaveAttribute('data-copy-state', 'pending');
  expect(await copy.locator('.copy-tick').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
  await capture(page, contact, `${locale}-D08-pending`, testInfo);
  await page.evaluate(() => (window as typeof window & { microCopyResolve: () => void }).microCopyResolve());
  await expect(copy).toHaveAttribute('data-copy-state', 'success');
  await expect(copy).toBeEnabled();
  await expect.poll(() => pose(page, 'copy-confirmed', 0)).not.toEqual([]);
  await capture(page, contact, `${locale}-D08-trigger`, testInfo);
  expect((await pose(page, 'copy-confirmed', .5))[0].duration).toBe(200);
  await capture(page, contact, `${locale}-D08-mid`, testInfo);
  await finish(page, 'copy-confirmed');
  await expect(page.locator('.copy-status')).toHaveText((await copy.getAttribute('data-success'))!);
  await capture(page, contact, `${locale}-D08-after`, testInfo);
  await copy.click();
  await page.evaluate(() => (window as typeof window & { microCopyReject: () => void }).microCopyReject());
  await expect(copy).toHaveAttribute('data-copy-state', 'failure');
  await expect(copy).toBeEnabled();
  await expect(page.locator('.copy-status')).toHaveText((await copy.getAttribute('data-failure'))!);
  expect(await copy.locator('.copy-tick').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
  await capture(page, contact, `${locale}-D08-failure`, testInfo);

  await page.goto(`${locale}/work/`);
  const row = page.locator('.project-row').first();
  const rowLink = row.locator('.row-link');
  await row.scrollIntoViewIfNeeded();
  const rowBox = (await rowLink.boundingBox())!;
  await capture(page, row, `${locale}-D06-before`, testInfo);
  await rowLink.hover();
  await transitionPose(row, 0);
  await capture(page, row, `${locale}-D06-trigger`, testInfo);
  await transitionPose(row, .5);
  await capture(page, row, `${locale}-D06-mid`, testInfo);
  fixedBox(rowBox, (await rowLink.boundingBox())!);
  await rowLink.focus();
  await expect(rowLink).toBeFocused();
  await finish(page);
  await capture(page, row, `${locale}-D06-after`, testInfo);
  expect(await row.locator(':scope > p').evaluate(inspectReadableText)).toMatchObject({ readable: true });
  await writeFile(path.join(captureRoot, `${locale}-trigger-method.json`), JSON.stringify({
    artifactSha256: testInfo.config.metadata.artifactSha256,
    locale,
    viewport: page.viewportSize(),
    method: 'Native hover, focus, click, OS motion preference and viewport entry. Actual CSS timelines paused at 0%, 50% and final for deterministic screenshots; not frame-rate measurements.',
    details: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08'],
    clipboard: 'Mock promise resolution/rejection; no real clipboard write or external link activation.',
    evidence,
  }, null, 2));
});

for (const locale of ['vi', 'en']) test(`${locale}: reduced motion keeps every detail static and no entry observer starts`, async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.assign(window, { microObserved: 0, microCopyFails: false });
    const observe = IntersectionObserver.prototype.observe;
    IntersectionObserver.prototype.observe = function (element: Element) {
      if (element.matches('#home-heading, .featured-paper')) (window as typeof window & { microObserved: number }).microObserved++;
      return observe.call(this, element);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {
      if ((window as typeof window & { microCopyFails: boolean }).microCopyFails) throw new Error('Test clipboard failure');
    } } });
  });
  await page.goto(`${locale}/`);
  await expect(page.locator('html')).toHaveAttribute('data-micro-details-mounted', 'true');
  await expect(page.locator('[data-micro-enter]')).toHaveCount(0);
  for (const selector of ['.wordmark', '.hero-actions a:first-child', '.contact-link:first-child']) {
    const link = page.locator(selector).first();
    await link.scrollIntoViewIfNeeded();
    await link.hover();
    await link.focus();
    await page.mouse.down();
    const selectors = selector.startsWith('.contact') ? '.contact-icon' : 'span';
    const values = await link.locator(selectors).evaluateAll(elements => elements.map(element => ({ transform: getComputedStyle(element).transform, animations: element.getAnimations().length })));
    expect(values.every(value => value.transform === 'none' && value.animations === 0), JSON.stringify(values)).toBe(true);
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  await expect(page.locator('[data-micro-enter]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { microObserved: number }).microObserved)).toBe(0);
  expect(await page.locator('#home-heading > span').first().evaluate(element => getComputedStyle(element, '::after').transform)).toBe('none');
  expect(await page.locator('.featured-paper').evaluate(element => getComputedStyle(element, '::before').display)).toBe('none');
  const choice = page.locator('button[data-project-choice]').nth(1);
  await choice.click();
  await expect(choice).toHaveAttribute('aria-disabled', 'true');
  expect(await choice.evaluate(element => getComputedStyle(element, '::after').transform)).toBe('none');
  expect(await choice.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
  const copy = page.locator('.copy-email');
  await copy.click();
  await expect(copy).toHaveAttribute('data-copy-state', 'success');
  expect(await copy.locator('.copy-tick').evaluate(element => ({ offset: getComputedStyle(element).strokeDashoffset, animations: element.getAnimations().length }))).toEqual({ offset: '0px', animations: 0 });
  await page.evaluate(() => { (window as typeof window & { microCopyFails: boolean }).microCopyFails = true; });
  await copy.click();
  await expect(copy).toHaveAttribute('data-copy-state', 'failure');
  expect(await copy.locator('.copy-tick').evaluate(element => getComputedStyle(element).opacity)).toBe('0');
  await page.locator('.featured-paper').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-motion-stage], [data-motion-canvas]')).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await capture(page, page.locator('.featured-paper'), `${locale}-all-reduced-static`, testInfo);
  await page.goto(`${locale}/work/`);
  const rowLink = page.locator('.project-row .row-link').first();
  await rowLink.hover();
  await rowLink.focus();
  expect(await rowLink.locator('span').evaluate(element => getComputedStyle(element).transform)).toBe('none');
});
