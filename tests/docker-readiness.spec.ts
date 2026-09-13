import { test, expect, type Locator, type Page } from '@playwright/test';

const projectIds = ['healthos', 'quan-ly-kho'];
const publicRoutes = ['', 'work/', 'about/', 'work/healthos/', 'work/quan-ly-kho/', 'notes/', 'notes/process-is-not-readiness/'];

async function withdrawnLabIsAbsent(page: Page) {
  await expect(page.locator('[data-case-id="docker-readiness"], [data-project-id="docker-readiness"], [data-project-choice="docker-readiness"]')).toHaveCount(0);
  await expect(page.locator('a[href*="/work/docker-readiness"]')).toHaveCount(0);
  // Inspect the complete HTML so hidden metadata and serialized records cannot
  // retain a withdrawn entry after its visible navigation disappears.
  expect(await page.content()).not.toMatch(/docker-readiness|docker-readiness-20260910-162212|docker-readiness-four-trials/);
}

async function nativeLink(page: Page, link: Locator, destination: string) {
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', new RegExp(`${destination}$`));
  await link.focus();
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const locale of ['vi', 'en']) {
  test(`${locale}: withdrawn Docker lab returns 404 and is absent from public pages and metadata`, async ({ page }) => {
    expect((await page.goto(`${locale}/work/docker-readiness/`))?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/404|tìm thấy|not found/i);
    await expect(page.locator('article.case-page')).toHaveCount(0);
    await withdrawnLabIsAbsent(page);
    for (const route of publicRoutes) {
      expect((await page.goto(`${locale}/${route}`))?.status()).toBe(200);
      await withdrawnLabIsAbsent(page);
    }
    const sitemap = await page.request.get('sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain('docker-readiness');
  });

  test(`${locale}: Home, Work and About expose only the two selected projects without JavaScript`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 320, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${locale}/`);
    await expect(page.locator('.work-section h2').first()).toHaveText(locale === 'vi' ? 'Dự án mình đã tham gia' : 'Projects I’ve contributed to');
    expect(await page.locator('[data-open-desk]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-project-id')))).toEqual(projectIds);
    expect(await page.locator('[data-project-choice]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-project-choice')))).toEqual(projectIds);
    await withdrawnLabIsAbsent(page);
    await nativeLink(page, page.locator(`.hero-actions a[href$="/${locale}/work/"]`), `/${locale}/work/`);
    expect(await page.locator('.project-row').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-project-id')))).toEqual(projectIds);
    await withdrawnLabIsAbsent(page);
    await nativeLink(page, page.locator('.project-row[data-project-id="healthos"] .row-link'), `/${locale}/work/healthos/`);
    await page.goto(`${locale}/about/`);
    expect(await page.locator('.about-projects [data-project-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-project-id')))).toEqual(projectIds);
    await withdrawnLabIsAbsent(page);
    await nativeLink(page, page.locator('.about-projects [data-project-id="quan-ly-kho"] h3 a'), `/${locale}/work/quan-ly-kho/`);
    await context.close();
  });

  test(`${locale}: HealthOS–note relation and the two-project next cycle remain native keyboard links without JavaScript`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 320, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${locale}/work/healthos/`);
    await expect(page.locator('.case-intro .eyebrow')).toHaveText(locale === 'vi' ? 'Phần mình đóng góp' : 'My contribution');
    const hrefs = await page.locator('.content-related a').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname));
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0].endsWith(`/${locale}/notes/process-is-not-readiness/`)).toBe(true);
    await nativeLink(page, page.locator(`.content-related a[href$="/${locale}/notes/process-is-not-readiness/"]`), `/${locale}/notes/process-is-not-readiness/`);
    await nativeLink(page, page.locator(`.content-related a[href$="/${locale}/work/healthos/"]`), `/${locale}/work/healthos/`);
    for (const next of ['quan-ly-kho', 'healthos']) {
      await nativeLink(page, page.locator('.case-next > a').filter({ has: page.locator('strong') }), `/${locale}/work/${next}/`);
      await expect(page.locator('article.case-page')).toHaveAttribute('data-case-id', next);
      await expect(page.locator('.case-intro .eyebrow')).toHaveText(locale === 'vi' ? 'Phần mình đóng góp' : 'My contribution');
      await withdrawnLabIsAbsent(page);
    }
    await context.close();
  });
}
