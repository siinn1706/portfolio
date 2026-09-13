import { test, expect } from '@playwright/test';

for (const locale of ['vi', 'en']) for (const width of [390, 1440]) for (const javaScriptEnabled of [true, false]) {
  test(`${locale} ${width}px ${javaScriptEnabled ? 'enhanced' : 'no-JS'}: real content follows the hero with no standalone scene`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, javaScriptEnabled });
    const page = await context.newPage();
    const sceneRequests: string[] = [];
    page.on('request', request => { if (/\/_astro\/(?:stage|three|motion-stage)\.[^/]+\.js(?:\?.*)?$/.test(request.url())) sceneRequests.push(request.url()); });
    try {
      await page.goto(`${locale}/`);
      await expect(page.locator('.hero + .work-section [data-featured-projects]')).toHaveCount(1);
      expect(await page.locator('main > section').evaluateAll(sections => sections.slice(0, 2).map(section => section.classList[0]))).toEqual(['hero', 'work-section']);
      await expect(page.locator('[data-motion-stage], [data-motion-canvas], [data-stage-controls]')).toHaveCount(0);
      await expect(page.locator('.hero [data-personal-media-id="nam-sticker"]')).toBeVisible();
      await expect(page.locator('.hero-actions a')).toHaveCount(2);
      await page.locator('#projects').scrollIntoViewIfNeeded();
      if (javaScriptEnabled) {
        await expect(page.locator('[data-featured-projects]')).toHaveAttribute('data-enhanced', 'true');
        await page.locator('button[data-project-choice="quan-ly-kho"]').click();
        await expect(page.locator('[data-open-desk]:not([hidden])')).toHaveAttribute('data-project-id', 'quan-ly-kho');
      } else {
        await expect(page.locator('[data-open-desk][hidden], [data-desk-panel][hidden]')).toHaveCount(0);
        await page.locator('a[data-project-choice="quan-ly-kho"]').click();
        await expect(page).toHaveURL(/#home-featured-quan-ly-kho$/);
        await expect.poll(() => page.locator('#home-featured-quan-ly-kho').evaluate(element => {
          const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
          const target = Math.min(element.getBoundingClientRect().top + scrollY - margin, document.documentElement.scrollHeight - innerHeight);
          return Math.abs(scrollY - target);
        })).toBeLessThanOrEqual(2);
      }
      // A user scroll also exercises the end of the page without racing two native smooth fragment navigations.
      await page.mouse.wheel(0, 20_000);
      await expect(page.locator('#contact')).toBeInViewport();
      expect(sceneRequests).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('scene-removed.png'), fullPage: true });
    } finally { await context.close(); }
  });
}

test('root alias retains the same scene-free Home structure', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.hero + .work-section')).toHaveCount(1);
  await expect(page.locator('[data-motion-stage], [data-motion-canvas]')).toHaveCount(0);
  await expect(page.locator('.hero h1')).toHaveText('Chào bạn, mình là Nam.');
});
