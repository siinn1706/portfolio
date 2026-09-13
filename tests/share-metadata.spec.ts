import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type CoverSelection = { projectId: string; source: string; width: number; height: number; alt: { vi: string; en: string } };
const selections: CoverSelection[] = JSON.parse(await readFile('src/data/share-media.json', 'utf8'));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

for (const locale of ['vi', 'en'] as const) for (const selection of selections) {
  test(`${locale}/${selection.projectId}: selected cover is correct and remains outside page-load requests`, async ({ page, request }, info) => {
    const requests: string[] = [];
    page.on('request', entry => requests.push(entry.url()));
    await page.goto(`${locale}/work/${selection.projectId}/`, { waitUntil: 'networkidle' });
    const cover = page.locator('meta[property="og:image"]');
    await expect(cover).toHaveAttribute('data-share-project', selection.projectId);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', selection.alt[locale]);
    await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute('content', selection.alt[locale]);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', String(selection.width));
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', String(selection.height));
    const value = await cover.getAttribute('content');
    expect(value).toBeTruthy();
    const url = new URL(value!, page.url());
    expect(url.origin).toBe(new URL(process.env.SITE_URL || page.url()).origin);
    // Release metadata names the public origin; validate its bytes on this build's preview.
    const previewUrl = new URL(`${url.pathname}${url.search}`, page.url());
    expect(requests).not.toContain(url.href);
    expect(requests).not.toContain(previewUrl.href);
    const entries = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    expect(entries).not.toContain(url.href);
    expect(entries).not.toContain(previewUrl.href);
    const response = await request.get(previewUrl.href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const source = await readFile(path.join('src/assets/share', selection.source));
    expect(hash(await response.body())).toBe(hash(source));
    await info.attach('share-cover-request-audit', {
      body: JSON.stringify({ route: page.url(), coverUrl: url.href, fetchedPreviewUrl: previewUrl.href, pageLoadRequests: requests, pageResourceEntries: entries, explicitlyFetchedStatus: response.status(), sha256: hash(source) }, null, 2),
      contentType: 'application/json',
    });
  });
}
