import { test, expect, type Locator, type Page } from '@playwright/test';

// Focus is established only with native keys. DOM reads below never move it or
// scroll a target into place, so the browser's own focus scrolling is exercised.
async function press(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function tabTo(page: Page, target: Locator, key = 'Tab') {
  for (let step = 0; step < 120; step++) {
    await press(page, key);
    if (await target.evaluate(node => node === document.activeElement)) return;
  }
  throw new Error(`Native ${key} did not reach ${target} within 120 presses`);
}

async function settled(page: Page) {
  let previous = '';
  let stable = 0;
  await expect.poll(async () => {
    const current = await page.evaluate(() => {
      const rect = document.activeElement!.getBoundingClientRect();
      return [scrollX, scrollY, rect.x, rect.y, rect.width, rect.height].join(',');
    });
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
}

async function expectFullFocus(page: Page, target: Locator) {
  await expect(target).toBeFocused();
  await settled(page);
  const geometry = await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const expansion = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
    const ring = { left: rect.left - expansion, top: rect.top - expansion,
      right: rect.right + expansion, bottom: rect.bottom + expansion };
    const occlusion: string[] = [];

    // The header and chooser wrappers are intentionally transparent. Inspect
    // their painted capsules/wordmark, including overlap with the focus ring.
    for (const surface of document.querySelectorAll('.site-header .wordmark, .header-controls, .project-choices')) {
      if (surface.contains(element) || !surface.getClientRects().length) continue;
      const css = getComputedStyle(surface);
      if (css.visibility === 'hidden' || css.opacity === '0') continue;
      const box = surface.getBoundingClientRect();
      const left = Math.max(ring.left, box.left), right = Math.min(ring.right, box.right);
      const top = Math.max(ring.top, box.top), bottom = Math.min(ring.bottom, box.bottom);
      if (right <= left || bottom <= top) continue;
      const covered = [.1, .5, .9].some(x => [.1, .5, .9].some(y => {
        const first = document.elementsFromPoint(left + (right - left) * x, top + (bottom - top) * y)[0];
        return first && (first === surface || surface.contains(first)) && !element.contains(first);
      }));
      if (covered) occlusion.push(surface.className);
    }
    return { focused: element === document.activeElement, focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
      width: rect.width, height: rect.height, ring, occlusion,
      viewport: { width: innerWidth, height: innerHeight } };
  });
  const evidence = JSON.stringify(geometry);
  expect(geometry.focused, evidence).toBe(true);
  expect(geometry.focusVisible, evidence).toBe(true);
  expect(geometry.outlineStyle, evidence).not.toBe('none');
  expect(geometry.outlineWidth, evidence).toBeGreaterThan(0);
  // Normalize only Chromium's 1/64 CSS pixel layout precision, retaining 44px.
  expect(Math.round(geometry.width * 64) / 64, evidence).toBeGreaterThanOrEqual(44);
  expect(Math.round(geometry.height * 64) / 64, evidence).toBeGreaterThanOrEqual(44);
  expect(geometry.ring.left, evidence).toBeGreaterThanOrEqual(-1 / 64);
  expect(geometry.ring.top, evidence).toBeGreaterThanOrEqual(-1 / 64);
  expect(geometry.ring.right, evidence).toBeLessThanOrEqual(geometry.viewport.width + 1 / 64);
  expect(geometry.ring.bottom, evidence).toBeLessThanOrEqual(geometry.viewport.height + 1 / 64);
  expect(geometry.occlusion, evidence).toEqual([]);
}

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('data-glass-layout', 'foreground');
  await settled(page);
}

for (const profile of [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'narrow touch emulation', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) test.describe(profile.name, () => {
  test.use({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch, reducedMotion: 'no-preference' });

  for (const locale of ['vi', 'en']) {
    test(`${locale}: Home image and outline clear foreground controls after forward and reverse Tab`, async ({ page }) => {
      await open(page, `${locale}/`);
      const image = page.locator('[data-open-desk][data-project-id="healthos"]:not([hidden]) .image-link');
      await expect(image).toBeVisible();
      await tabTo(page, image);
      await expectFullFocus(page, image);
      await press(page, 'Tab');
      await expect(image).not.toBeFocused();
      await settled(page);
      await press(page, 'Shift+Tab');
      await expectFullFocus(page, image);
    });

    test(`${locale}: opening manual email and tabbing to its address preserves full focus visibility`, async ({ page }) => {
      await open(page, `${locale}/`);
      const manual = page.locator('[data-manual-email]');
      const summary = manual.locator('summary');
      await tabTo(page, summary);
      await expectFullFocus(page, summary);
      await press(page, 'Enter');
      await expect(manual).toHaveAttribute('open', '');
      await expectFullFocus(page, summary);
      await press(page, 'Tab');
      const address = manual.locator('textarea');
      await expect(address).toHaveAttribute('readonly', '');
      await expect(address).toHaveValue(/@/);
      await expectFullFocus(page, address);
      await press(page, 'Shift+Tab');
      await expectFullFocus(page, summary);
    });
  }
});

test('case heading copy and outline clear the header when reverse-Tab returns from later content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'vi/work/healthos/');
  // Walk down to the final case action, then back through the document. This
  // reproduces the above-viewport approach that previously hid this control.
  await tabTo(page, page.locator('.case-contact'));
  const copy = page.locator('.prose .copy-heading[data-copy-fragment="kiến-trúc-hệ-thống"]');
  await tabTo(page, copy, 'Shift+Tab');
  await expectFullFocus(page, copy);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 316, height: 201 }]) {
  test(`warehouse tall image keeps its full focus outline during native Tab round trip at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, 'vi/work/quan-ly-kho/');
    const image = page.locator('#figure-warehouse-stock-in > .image-link');
    await tabTo(page, image);
    await expectFullFocus(page, image);
    await press(page, 'Tab');
    await expect(image).not.toBeFocused();
    await settled(page);
    await press(page, 'Shift+Tab');
    await expectFullFocus(page, image);
  });
}
