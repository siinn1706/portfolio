import { test, expect, type Page } from '@playwright/test';

// Reduced motion isolates image space reservation. These geometry assertions
// are a delayed-resource regression test, not a performance or CLS measurement.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

async function layout(page: Page) {
  return page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
    figures: [...document.querySelectorAll<HTMLElement>('.evidence-figure')].map(figure => {
      const anchor = figure.querySelector<HTMLAnchorElement>('.image-link')!;
      const image = anchor.querySelector('img')!;
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top + scrollY };
      };
      const declaredSources = [image.src, ...image.srcset.split(',')
        .map(candidate => candidate.trim().split(/\s+/)[0]).filter(Boolean)
        .map(source => new URL(source, document.baseURI).href)];
      return { id: figure.id, href: anchor.getAttribute('href'), currentSrc: image.currentSrc, declaredSources,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        image: box(image), anchor: box(anchor) };
    }),
  }));
}

async function settledLayout(page: Page) {
  let previous = '', stable = 0;
  await expect.poll(async () => {
    const current = JSON.stringify(await layout(page));
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    return stable;
  }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
  return layout(page);
}

for (const locale of ['vi', 'en']) for (const project of ['healthos', 'quan-ly-kho']) {
  test(`${locale}/${project}: delayed evidence images preserve every reserved box and page height`, async ({ page }, info) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const heldRequests: string[] = [];
    const prefix = project === 'healthos' ? 'healthos-' : 'warehouse-';
    const evidence: Record<string, unknown> = { locale, project, viewport: '1440×900', reducedMotion: true };
    await page.route('**/_astro/**', async route => {
      const request = route.request();
      const filename = new URL(request.url()).pathname.split('/').at(-1)!;
      if (request.resourceType() === 'image' && filename.startsWith(prefix)) {
        heldRequests.push(request.url());
        await gate;
      }
      await route.continue().catch(error => { if (!page.isClosed()) throw error; });
    });
    try {
      // A held eager image prevents the load event; DOMContentLoaded permits
      // measurement while the actual image response is still unavailable.
      await page.goto(`${locale}/work/${project}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveAttribute('data-glass-motion-mounted', 'true');
      await expect(page.locator('html')).not.toHaveAttribute('data-glass-motion-failed', 'true');
      await expect.poll(() => heldRequests.length).toBeGreaterThan(0);
      const before = await settledLayout(page);
      evidence.before = before;
      evidence.heldBeforeRelease = [...heldRequests];
      expect(before.figures.length).toBeGreaterThan(1);
      // currentSrc may stay empty until an intercepted request completes.
      // Match the real held requests to the HTML's declared image candidates.
      expect(heldRequests.every(url => before.figures.some(figure => figure.declaredSources.includes(url)))).toBe(true);
      for (const figure of before.figures) {
        expect(figure.naturalWidth, `${figure.id}: image must still be unavailable`).toBe(0);
        expect(figure.naturalHeight, `${figure.id}: image must still be unavailable`).toBe(0);
        expect(figure.image.width, `${figure.id}: reserved image width`).toBeGreaterThan(0);
        expect(figure.image.height, `${figure.id}: reserved image height`).toBeGreaterThan(0);
      }

      release();
      await page.locator('.evidence-figure img').evaluateAll(async nodes => {
        const images = nodes as HTMLImageElement[];
        for (const image of images) image.loading = 'eager';
        await Promise.all(images.map(image => image.decode()));
      });
      const after = await settledLayout(page);
      evidence.after = after;
      expect(after.figures.map(figure => figure.id)).toEqual(before.figures.map(figure => figure.id));
      expect(Math.abs(after.documentHeight - before.documentHeight), 'document height changed after image decoding').toBeLessThanOrEqual(1);
      expect(Math.abs(after.bodyHeight - before.bodyHeight), 'body height changed after image decoding').toBeLessThanOrEqual(1);
      for (const [index, figure] of after.figures.entries()) {
        const reserved = before.figures[index];
        expect(figure.naturalWidth, `${figure.id}: actual image decoded`).toBeGreaterThan(0);
        expect(figure.naturalHeight, `${figure.id}: actual image decoded`).toBeGreaterThan(0);
        expect(figure.href, `${figure.id}: native original link changed`).toBe(reserved.href);
        for (const element of ['image', 'anchor'] as const) for (const dimension of ['width', 'height', 'top'] as const) {
          expect(Math.abs(figure[element][dimension] - reserved[element][dimension]), `${figure.id}: ${element} ${dimension} changed after decoding`).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      // Release even an assertion/navigation failure so route handlers cannot
      // keep a browser or the test runner waiting on an unresolved resource.
      release();
      await page.unrouteAll({ behavior: 'wait' });
      evidence.heldRequests = heldRequests;
      await info.attach('delayed-image-layout.json', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
    }
  });
}
