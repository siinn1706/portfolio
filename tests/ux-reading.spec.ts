import { test, expect, type Page } from '@playwright/test';
import { readingSections, figureFragment } from '../src/data/reading-sections';
import { projects } from '../src/data/projects';
const selectedProjects = projects.filter(project => project.publication.publicSelected && project.publication.publishIntent === 'publish');

type PendingClipboard = { copies: { text: string; resolve: () => void; reject: (error: Error) => void }[] };
async function clipboard(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as PendingClipboard;
    state.copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: (text: string) => new Promise<void>((resolve, reject) => state.copies.push({ text, resolve, reject })),
    } });
  });
}
const otherLocaleLink = (page: Page) => page.locator('.locale-nav a[hreflang]:not([aria-current])');
const articleRoutes = ['work/healthos/', 'work/quan-ly-kho/', 'notes/process-is-not-readiness/'];

for (const locale of ['vi', 'en'] as const) {
  test(`${locale}: Work and About retain heading hierarchy, case summaries and source-owned dates`, async ({ page }) => {
    await page.goto(`${locale}/work/`);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('.project-row')).toHaveCount(2);
    await expect(page.locator('.project-row h2')).toHaveCount(2);
    await expect(page.locator('.project-row .project-summary')).toHaveCount(2);
    for (const summary of await page.locator('.project-summary').all()) expect((await summary.innerText()).trim().length).toBeGreaterThan(20);
    await page.goto(`${locale}/about/`);
    await expect(page.locator('.about-project-list h3')).toHaveCount(2);
    await expect(page.locator('a[href*="docker-readiness"]')).toHaveCount(0);
    for (const project of selectedProjects) {
      await page.goto(`${locale}/work/${project.routeSlug}/`);
      const links = page.locator('.case-shortcuts a');
      await expect(links).toHaveCount(3);
      for (const link of await links.all()) {
        const fragment = decodeURIComponent((await link.getAttribute('href'))!.slice(1));
        expect(await page.locator('[id]').evaluateAll((nodes, id) => nodes.filter(n => n.id === id).length, fragment)).toBe(1);
        await expect(link).toHaveCSS('min-height', '44px');
        // DOMRect subtraction produced43.99993896484375 for a44px box;
        // normalize to Chromium's1/64 CSS pixel layout precision, retaining44px.
        expect(Math.round((await link.boundingBox())!.height * 64) / 64).toBeGreaterThanOrEqual(44);
      }
      await expect(page.locator('.case-updated time')).toHaveAttribute('datetime', project.contentUpdatedAt!);
    }
  });

  for (const route of articleRoutes) test(`${locale}/${route}: every published section map and hierarchical TOC resolves to actual targets`, async ({ page }) => {
    await page.goto(`${locale}/${route}`);
    const key = `${route.startsWith('work') ? 'project' : 'note'}:${route.split('/')[1]}`;
    const pairs = JSON.parse((await page.locator('[data-reading-map]').getAttribute('data-reading-map'))!);
    for (const section of readingSections[key]) {
      expect(pairs[section.slugs[locale]], section.key).toBe(section.slugs[locale === 'vi' ? 'en' : 'vi']);
      expect(await page.locator('[id]').evaluateAll((nodes, id) => nodes.filter(n => n.id === id).length, section.slugs[locale])).toBe(1);
    }
    for (const link of await page.locator('[data-reading-toc] a').all()) {
      const fragment = decodeURIComponent((await link.getAttribute('href'))!.slice(1));
      expect(await page.locator('[id]').evaluateAll((nodes, id) => nodes.filter(n => n.id === id).length, fragment)).toBe(1);
    }
    const nested = page.locator('[data-reading-toc] > ol > li > ol > li > a');
    await expect(nested).toHaveCount(readingSections[key].filter(s => s.inToc).length);
    if (route.startsWith('work/')) {
      const project = projects.find(p => p.projectId === route.split('/')[1])!;
      for (const id of project.mediaIds) {
        const figure = page.locator(`figure[data-media-id="${id}"]`);
        await expect(figure).toHaveAttribute('id', figureFragment(id));
        expect(pairs[figureFragment(id)]).toBe(figureFragment(id));
      }
    }
  });

  test(`${locale}: known section and figure locale links retain counterpart; unknown and malformed hashes use case root`, async ({ page }) => {
    const other = locale === 'vi' ? 'en' : 'vi';
    const contribution = readingSections['project:healthos'].find(s => s.key === 'contribution')!;
    for (const hash of [contribution.slugs[locale], figureFragment(projects[0].heroMediaId!)]) {
      await page.goto(`${locale}/work/healthos/#${encodeURIComponent(hash)}`);
      const expected = hash.startsWith('figure-') ? hash : contribution.slugs[other];
      await expect(otherLocaleLink(page)).toHaveAttribute('href', new RegExp(`/${other}/work/healthos/#${encodeURIComponent(expected)}$`));
      await otherLocaleLink(page).click();
      expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(expected);
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await page.goBack();
      expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(hash);
    }
    for (const hash of ['unknown-section', '%E0%A4%A', 'constructor', 'toString', '__proto__']) {
      await page.goto(`${locale}/work/healthos/#${hash}`);
      await expect(otherLocaleLink(page)).toHaveAttribute('href', new RegExp(`/${other}/work/healthos/$`));
      await expect(page.locator('[data-reading-toc] a[aria-current="location"]')).toHaveCount(0);
      await otherLocaleLink(page).click();
      expect(new URL(page.url()).hash).toBe('');
    }
  });
}

test('active TOC follows downward and reverse reader movement, then a direct hash change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('en/work/healthos/#my-contribution');
  const current = page.locator('[data-reading-toc] a[aria-current="location"]');
  await expect(current).toHaveAttribute('href', '#my-contribution');
  for (const dy of [2100, -1500]) {
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, dy);
    await expect.poll(async () => ((await page.evaluate(() => scrollY)) - before) * Math.sign(dy)).toBeGreaterThan(100);
    await expect.poll(async () => {
      const position = await page.evaluate(() => {
        const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glass-anchor-offset')) || 32;
        const nodes = [...document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id], .evidence-figure[id]')];
        const visible = nodes.filter(n => n.getBoundingClientRect().top <= offset + 2).at(-1) || nodes[0];
        const tocIds = [...document.querySelectorAll<HTMLAnchorElement>('[data-reading-toc] a')].map(a => decodeURIComponent(a.hash.slice(1)));
        const previous = nodes.slice(0, nodes.indexOf(visible) + 1).filter(n => tocIds.includes(n.id)).at(-1);
        const active = document.querySelector<HTMLAnchorElement>('[data-reading-toc] a[aria-current="location"]');
        return { expected: previous?.id || '', actual: decodeURIComponent(active?.hash.slice(1) || '') };
      });
      return position.actual === position.expected && Boolean(position.expected);
    }).toBe(true);
  }
  await page.evaluate(() => { location.hash = 'verification-scope'; });
  await expect(current).toHaveAttribute('href', '#verification-scope');
  await expect(otherLocaleLink(page)).toHaveAttribute('href', /#ph%E1%BA%A1m-vi-%C4%91%C3%A3-ki%E1%BB%83m$/);
});

test('scroll without navigation input and persisted pageshow reconcile restored position instead of stale URL fragment', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('en/work/healthos/#my-contribution');
  const current = page.locator('[data-reading-toc] a[aria-current="location"]');
  await expect(current).toHaveAttribute('href', '#my-contribution');
  await page.evaluate(() => {
    const target = document.getElementById('verification-scope')!;
    const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glass-anchor-offset')) || 32;
    window.scrollTo({ top: scrollY + target.getBoundingClientRect().top - offset + 1, behavior: 'instant' });
  });
  // Models scrollbar/Find/assistive scroll: no wheel, touch or navigation key.
  await expect(current).toHaveAttribute('href', '#verification-scope');
  expect(new URL(page.url()).hash).toBe('#my-contribution');
  // Playwright disables BFCache by default. Replay the browser lifecycle event
  // against actual restored geometry; this does not certify physical BFCache.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(current).toHaveAttribute('href', '#verification-scope');
  await expect(otherLocaleLink(page)).toHaveAttribute('href', /#ph%E1%BA%A1m-vi-%C4%91%C3%A3-ki%E1%BB%83m$/);
});

for (const outcome of ['success', 'denied'] as const) test(`figure copy ${outcome} keeps focus, has local settled feedback and native fallback`, async ({ page }) => {
  await clipboard(page);
  await page.goto('en/work/healthos/');
  const figure = page.locator('figure[id]').first();
  const button = figure.locator('[data-copy-fragment]');
  const original = page.url();
  await button.click();
  await expect(button).toBeFocused();
  const status = page.locator('[data-reading-status]');
  await expect(status).toBeEmpty();
  await page.evaluate(outcome => {
    const pending = (window as unknown as PendingClipboard).copies[0];
    if (outcome === 'success') pending.resolve(); else pending.reject(new Error('Clipboard denied'));
  }, outcome);
  const expected = (await status.getAttribute(outcome === 'success' ? 'data-success' : 'data-failure'))!;
  await expect(status).toHaveText(expected);
  await expect(figure.locator('[data-copy-feedback]')).toHaveText(expected);
  await expect(button).toBeFocused();
  expect(page.url()).toBe(original);
  const copy = await page.evaluate(() => (window as unknown as PendingClipboard).copies[0].text);
  await figure.locator('.figure-actions > a').click();
  expect(page.url()).toBe(copy);
});

test('stale figure clipboard failure cannot overwrite a newer heading success', async ({ page }) => {
  await clipboard(page);
  await page.goto('en/work/healthos/');
  await page.locator('figure [data-copy-fragment]').first().click();
  await page.locator('.heading-group [data-copy-fragment]').first().click();
  await page.evaluate(() => (window as unknown as PendingClipboard).copies[1].resolve());
  const status = page.locator('[data-reading-status]');
  const success = (await status.getAttribute('data-success'))!;
  await expect(status).toHaveText(success);
  await page.evaluate(() => (window as unknown as PendingClipboard).copies[0].reject(new Error('Stale failure')));
  await expect(status).toHaveText(success);
  await expect(page.locator('figure [data-copy-feedback]').first()).toBeEmpty();
});

test('no-JS case quick links, figure full image and locale fallback stay native', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('en/work/healthos/');
  const link = page.locator('.case-shortcuts a').first();
  await link.focus();
  await page.keyboard.press('Enter');
  expect(new URL(page.url()).hash).toBe('#my-contribution');
  const figure = page.locator('figure[id]').first();
  await expect(figure.locator('button')).toBeHidden();
  const image = figure.locator('.image-link');
  const full = (await image.getAttribute('href'))!;
  await image.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
  await page.goBack();
  await expect(page.locator('article[data-case-id="healthos"]')).toBeVisible();
  await expect(otherLocaleLink(page)).toHaveAttribute('href', /\/vi\/work\/healthos\/$/);
  await page.goto('en/#contact');
  await expect(page.locator('[data-copy-email]')).toBeHidden();
  const summary = page.locator('[data-manual-email] summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-manual-email]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-manual-email] textarea')).toHaveValue(/@/);
  await context.close();
});

test('contextual email subjects reflect case and locale; denied email copy opens manual fallback and preserves moved focus', async ({ page }) => {
  await clipboard(page);
  for (const locale of ['vi', 'en']) for (const project of selectedProjects) {
    await page.goto(`${locale}/work/${project.routeSlug}/`);
    const link = page.locator('.case-contact');
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.protocol).toBe('mailto:');
    expect(href.searchParams.get('subject')).toBe((await link.innerText()).replace('↗', '').trim());
    expect(href.searchParams.get('subject')).not.toMatch(/[\r\n]/);
  }
  await page.goto('en/#contact');
  const button = page.locator('[data-copy-email]');
  await button.click();
  await page.evaluate(() => (window as unknown as PendingClipboard).copies[0].reject(new Error('Denied')));
  const manual = page.locator('[data-manual-email]');
  await expect(manual).toHaveAttribute('open', '');
  await expect(button).toBeFocused();
  const address = manual.locator('textarea');
  await expect(address).toHaveValue((await button.getAttribute('data-copy-email'))!);
  await button.click();
  await address.focus();
  await page.evaluate(() => (window as unknown as PendingClipboard).copies[1].reject(new Error('Denied again')));
  await expect(address).toBeFocused();
});

test('320px and print preserve article content with short controls and readable TOC fallback', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('vi/work/healthos/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator('.case-toc details')).toHaveCSS('position', 'static');
  const count = await page.locator('.prose h2,.prose h3').count();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.case-shortcuts')).toBeHidden();
  for (const actions of await page.locator('.figure-actions').all()) await expect(actions).toBeHidden();
  expect(await page.locator('.prose h2,.prose h3').count()).toBe(count);
  await expect(page.locator('.print-context')).toBeVisible();
  await page.pdf({ path: info.outputPath('ux-vi-healthos-print.pdf'), format: 'A4', printBackground: true });
});

test('desktop sticky TOC and direct fragment targets clear the measured foreground header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('en/work/healthos/#my-contribution');
  const details = page.locator('.case-toc details');
  await expect(details).toHaveCSS('position', 'sticky');
  const offset = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glass-anchor-offset')));
  expect(parseFloat(await details.evaluate(node => getComputedStyle(node).top))).toBeGreaterThanOrEqual(offset - 1);
  await expect.poll(() => page.locator('#my-contribution').evaluate(node => {
    const header = document.querySelector('.site-header')!.getBoundingClientRect();
    return node.getBoundingClientRect().top - header.bottom;
  })).toBeGreaterThanOrEqual(-1);
});
