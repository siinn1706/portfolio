import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, stat, mkdir, unlink, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { load } from 'cheerio';
import { inspectReadableText } from './helpers/readable-text';
import sharp from 'sharp';

const reports = path.resolve(process.env.QA_REPORT_DIR || '.qa/local');
const skip = process.env.RUN_TEMPLATE_BUILDS !== '1';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const active = '[data-open-desk]:not([hidden])';

async function buildFixture(name: string, negative = false) {
  let output = path.resolve('tests/.output', name);
  const reportDirectory = path.join(reports, `${name}-template`);
  await mkdir(reportDirectory, { recursive: true });
  let cwd = process.cwd();
  if (name === 'optional') {
    // A real authored-photo branch in an isolated source copy; never import
    // fixture imagery into the production registry or pretend it is project evidence.
    cwd = path.join(reportDirectory, 'source');
    await mkdir(cwd, { recursive: true });
    for (const entry of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) await cp(path.resolve(entry), path.join(cwd, entry), { recursive: true });
    await cp('tests/fixtures/content/optional', path.join(cwd, 'tests/fixtures/content/optional'), { recursive: true });
    await mkdir(path.join(cwd, 'src/assets/photography'), { recursive: true });
    await writeFile(path.join(cwd, 'src/assets/photography/qa-photo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><rect width="900" height="600" fill="#DECCB0"/><circle cx="450" cy="300" r="160" fill="#202620"/></svg>');
    const registryPath = path.join(cwd, 'src/data/photography-media.ts');
    const registry = await readFile(registryPath, 'utf8');
    const replacement = registry.replace('export const photoMediaRegistry: Record<string, PhotoMedia> = {};', 'export const photoMediaRegistry: Record<string, PhotoMedia> = { "qa-photo": { image: fixturePhoto, sources: [fixturePhoto], full: fixturePhoto } };');
    assert.notEqual(replacement, registry, 'The fixture installs an actual separate photo registry');
    await writeFile(registryPath, `import fixturePhoto from "../assets/photography/qa-photo.svg";\n${replacement}`);
    output = path.join(cwd, 'tests/.output', name);
  }
  const env = { ...process.env, CONTENT_FIXTURE_DIR: `tests/fixtures/content/${name}`, OUT_DIR: `tests/.output/${name}`, OUTPUT_DIR: output, BASE_PATH: '/portfolio/', SITE_URL: 'https://portfolio.test', RELEASE_BUILD: '0', QA_REPORT_DIR: reportDirectory };
  const packageInfo = JSON.parse(await readFile('node_modules/astro/package.json', 'utf8'));
  const cli = path.resolve('node_modules/astro', typeof packageInfo.bin === 'string' ? packageInfo.bin : packageInfo.bin.astro);
  // Loader directories differ between fixtures; clear Astro's shared content store.
  const build = spawnSync(process.execPath, [cli, 'build', '--force'], { cwd, env, encoding: 'utf8', timeout: 120_000 });
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(reportDirectory, 'build.log'), `${build.stdout}\n${build.stderr}`);
  if (negative) {
    assert.notEqual(build.status, 0, 'publishIntent=publish/publicSelected=false must fail the real build');
    assert.match(build.stdout + build.stderr, /publicSelected.*publish requires explicit selection/);
  } else {
    assert.equal(build.status, 0, `Fixture build failed: ${build.stdout}\n${build.stderr}`);
    const verification = verify(env);
    assert.equal(verification.status, 0, verification.stdout + verification.stderr);
  }
  return { output, reportDirectory, env };
}
function verify(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['scripts/verify-output.mjs'], { env, encoding: 'utf8', timeout: 30_000 });
}
async function withFixtureBrowser(output: string, use: (browser: Browser, origin: string) => Promise<void>) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const file = path.resolve(output, pathname.replace(/^\/portfolio\//, ''));
      if (!file.startsWith(output + path.sep) && file !== output) throw new Error('Outside fixture');
      const target = (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
      const extension = path.extname(target);
      response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' } as Record<string, string>)[extension] || 'application/octet-stream' }).end(await readFile(target));
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    await use(browser, `http://127.0.0.1:${address.port}/portfolio/`);
  } finally {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
async function capture(page: Page, destination: string) {
  for (const image of await page.locator('img:visible').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async element => { const media = element as HTMLImageElement; media.loading = 'eager'; await media.decode(); });
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: destination, fullPage: true });
}
async function accessible(page: Page) {
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations.filter(item => ['serious', 'critical'].includes(item.impact || ''));
  assert.deepEqual(violations, []);
}
async function aboutGeometry(page: Page, expected: string[], width: number) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'About must reflow without horizontal overflow');
  assert.deepEqual(await page.locator('.about-projects [data-project-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-project-id'))), expected);
  assert.equal(await page.locator('.about-overview img').count(), 1, 'The selected About portrait remains present for every catalog size');
  assert.equal(await page.locator('.about-overview img').getAttribute('data-personal-media-id'), 'nam-candid');
  assert.equal(await page.locator('.about-projects time').count(), 0, 'Projects must not acquire a fabricated timeline');
  const grid = await page.locator('.about-overview').boundingBox();
  const story = await page.locator('.about-story').boundingBox();
  assert.ok(grid && story);
  let projects = null;
  if (!expected.length) {
    assert.equal(await page.locator('.about-projects').count(), 0, 'An empty catalog must hide the whole project column');
    assert.equal(await page.locator('.about-overview--solo').count(), 1);
    assert.ok(Math.abs(story.width - grid.width) <= 1, 'The introduction uses the full grid width when no projects are public');
  } else {
    projects = await page.locator('.about-projects').boundingBox();
    assert.ok(projects);
    if (width < 960) assert.ok(projects.y >= story.y + story.height - 1, 'About projects follow the story on mobile and tablet');
    else {
      assert.ok(projects.x >= story.x + story.width, 'About projects form the second desktop column');
      assert.ok(Math.abs(projects.y - story.y) <= 1, 'About desktop columns share their starting edge');
    }
  }
  for (const paragraph of await page.locator('.about-story p, .about-projects p').all()) {
    const diagnostics = await paragraph.evaluate(inspectReadableText);
    assert.ok(diagnostics.readable, `About prose stays fully readable: ${JSON.stringify(diagnostics)}`);
  }
  return { grid, story, projects, expectedColumns: expected.length && width >= 960 ? 2 : 1 };
}
function syntheticZip() {
  const name = Buffer.from('export.txt');
  const payload = Buffer.from('SYNTHETIC_CHAT_EXPORT_MARKER');
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(payload.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(payload.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + payload.length, 16);
  return Buffer.concat([local, name, payload, central, name, end]);
}

test('isolated optional templates build at a subpath and reject unlinked private file types and paths', { skip, timeout: 300_000 }, async () => {
  const { output, reportDirectory, env } = await buildFixture('optional');
  for (const locale of ['vi', 'en']) {
    for (const route of ['notes', 'notes/qa-note', 'photography']) assert.ok(existsSync(path.join(output, locale, route, 'index.html')));
    assert.ok(!existsSync(path.join(output, locale, 'notes/draft-note')));
    assert.ok(!existsSync(path.resolve('dist', locale, 'notes/qa-note')), 'Fixture must not create its note in production output');
    assert.ok(!existsSync(path.resolve('dist', locale, 'photography')), 'Fixture must not create production Photography');
  }
  const checks: unknown[] = [];
  await withFixtureBrowser(output, async (browser, origin) => {
    for (const width of [320, 390, 1440]) for (const locale of ['vi', 'en']) for (const route of ['notes/', 'notes/qa-note/', 'photography/']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${origin}${locale}/${route}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow: ${width}/${locale}/${route}`);
      await accessible(page);
      await capture(page, path.join(reportDirectory, `${width}-${locale}-${route.replaceAll('/', '-')}.png`));
      if (route.includes('qa-note')) {
        const labels = await page.locator('.note-meta').textContent();
        assert.ok(labels?.includes(locale === 'vi' ? 'Quan sát riêng của fixture' : 'Fixture-specific observation'), 'Note labels come from the selected fixture topic registry');
        assert.doesNotMatch(labels || '', /fixture-observation|cloud-automation|Docker/, 'Raw IDs and unrelated production topics must not replace fixture labels');
        const other = locale === 'vi' ? 'en' : 'vi';
        await page.locator(`header a[href$="/${other}/notes/qa-note/"]`).click();
        assert.ok(page.url().endsWith(`/${other}/notes/qa-note/`));
      }
      checks.push({ width, locale, route, reflow: 'pass', seriousAccessibilityViolations: 0 });
      await context.close();
    }
  });
  const negativeChecks = [];
  const orphanOutput = path.resolve('tests/.output/optional-orphan');
  await cp(output, orphanOutput, { recursive: true });
  for (const file of ['index.html', ...['vi', 'en'].flatMap(locale => ['', 'work/', 'about/'].map(route => `${locale}/${route}index.html`))]) {
    const document = load(await readFile(path.join(orphanOutput, file), 'utf8'));
    document('a[href]').each((_, element) => {
      if (/\/(?:notes|photography)\//.test(document(element).attr('href') || '')) document(element).remove();
    });
    await writeFile(path.join(orphanOutput, file), document.html());
  }
  const orphan = verify({ ...env, OUTPUT_DIR: orphanOutput, QA_REPORT_DIR: path.join(reportDirectory, 'negative-orphan-optional') });
  assert.equal(orphan.status, 1, 'An optional page cannot authorize itself through canonical, hreflang or its own navigation');
  for (const locale of ['vi', 'en']) for (const file of ['notes/index.html', 'notes/qa-note/index.html', 'photography/index.html']) {
    assert.ok(orphan.stdout.includes(`File outside public type/path allowlist: ${locale}/${file}`));
  }
  negativeChecks.push({ filename: 'optional-orphan', rejected: true, gate: 'reachable only through trusted core anchors' });
  for (const [filename, content, expected] of [
    ['unlinked-private.json', '{"secret":"PRIVATE_SENTINEL"}', /Private, fixture|allowlist/],
    ['80e53680e880d0024d6060f248ce81ebd349951b79df.zip', syntheticZip(), /Archive\/export file type is not public/],
    ['conversations-000.json', '{"messages":[]}', /Chat export path is not public/],
    ['chat.html', '<!doctype html><html><body>Harmless synthetic export</body></html>', /Chat export path is not public/],
    ['unlinked-export.json', '{"messages":[]}', /File outside public type\/path allowlist/],
    ['en/unlisted/index.html', await readFile(path.join(output, 'en/about/index.html')), /File outside public type\/path allowlist/],
  ] as const) {
    const leakFile = path.join(output, filename);
    await mkdir(path.dirname(leakFile), { recursive: true });
    await writeFile(leakFile, content);
    try {
      const negative = verify({ ...env, QA_REPORT_DIR: path.join(reportDirectory, `negative-${filename.replaceAll('/', '-')}`) });
      assert.equal(negative.status, 1, `${filename} must fail without a link from public HTML`);
      assert.match(negative.stdout, expected);
      negativeChecks.push({ filename, rejected: true, gate: expected.source });
    } finally { await unlink(leakFile); }
  }
  assert.equal(verify(env).status, 0, 'Clean fixture must pass again after removing exactly the synthetic files');
  await writeFile(path.join(reportDirectory, 'template-results.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), base: env.BASE_PATH, checks, negativeChecks, productionOptionalRoutesAbsent: true }, null, 2)}\n`);
});

const catalogCases: [string, string[], string[]][] = [
  ['empty', [], []], ['warehouse-only', ['quan-ly-kho'], ['quan-ly-kho']], ['reversed', ['quan-ly-kho', 'healthos'], ['healthos', 'quan-ly-kho']],
  ['many', ['healthos', 'quan-ly-kho', 'healthos-title'], ['healthos', 'quan-ly-kho']],
  ['many-featured', ['healthos', 'quan-ly-kho', 'healthos-title'], ['healthos', 'quan-ly-kho', 'healthos-title']],
  ['no-featured', ['healthos', 'quan-ly-kho'], []], ['selected-set', ['quan-ly-kho'], ['quan-ly-kho']],
];
for (const [name, expected, expectedFeatured] of catalogCases) test(`${name}: real selected catalog drives Home, About, chooser, routes, media and bilingual subpath`, { skip, timeout: 360_000 }, async () => {
  const { output, reportDirectory } = await buildFixture(name);
  for (const locale of ['vi', 'en']) {
    const $ = load(await readFile(path.join(output, locale, 'index.html'), 'utf8'));
    const about = load(await readFile(path.join(output, locale, 'about/index.html'), 'utf8'));
    assert.deepEqual(about('.about-projects [data-project-id]').toArray().map(element => about(element).attr('data-project-id')), expected);
    assert.equal(about('.about-overview > .about-story').length, 1);
    assert.equal(about('.about-projects').length, expected.length ? 1 : 0);
    assert.equal(about('.about-overview--solo').length, expected.length ? 0 : 1);
    assert.equal(about('.about-overview img').length, 1);
    assert.equal(about('.about-overview img').attr('data-personal-media-id'), 'nam-candid');
    assert.equal(about('.about-projects time').length, 0);
    assert.doesNotMatch(about.html(), /PRIVATE_SENTINEL|EDITOR_ONLY_SENTINEL|private-study/);
    assert.equal($('.hero .hero-actions a').length, 2);
    assert.equal($('.hero [data-featured-projects], .work-section .project-row').length, 0);
    assert.deepEqual($('[data-open-desk]').toArray().map(element => $(element).attr('data-project-id')), expectedFeatured);
    assert.equal($('[data-motion-stage], [data-motion-canvas], [data-stage-link]').length, 0, 'The removed standalone scene stays absent for every catalog size');
    assert.equal(about('[data-motion-stage], [data-motion-canvas]').length, 0, 'About keeps its content-only structure');
    assert.equal($('[data-project-choice]').length, expectedFeatured.length > 1 ? expectedFeatured.length : 0);
    assert.equal($('[data-desk-panel]').length, expectedFeatured.length * 3);
    const ids = $('[id]').toArray().map(element => $(element).attr('id'));
    assert.equal(new Set(ids).size, ids.length, 'Valid project IDs such as healthos-title must not collide with another desk heading');
    for (const id of expected) assert.ok(existsSync(path.join(output, locale, 'work', id, 'index.html')));
    for (const id of expected) {
      const entry = about(`.about-projects [data-project-id="${id}"]`);
      assert.equal(entry.find('a').first().attr('href'), `/portfolio/${locale}/work/${id}/`);
      if (expectedFeatured.includes(id)) assert.ok(entry.text().includes($(`[data-project-id="${id}"] .desk-role`).text()), 'About contribution comes from the same selected catalog prose as Home');
    }
    assert.equal($('[data-open-desk][hidden],[data-desk-panel][hidden]').length, 0, 'Baseline must expose all sections');
    assert.doesNotMatch($.html(), /PRIVATE_SENTINEL|EDITOR_ONLY_SENTINEL|private-study/);
    if (!expected.length) {
      assert.equal($('[data-featured-projects]').length, 0);
      assert.ok($('#contact').length);
      const work = load(await readFile(path.join(output, locale, 'work/index.html'), 'utf8'));
      assert.ok(work('.empty-state').text().trim().length > 20);
    }
    if (!expected.includes('healthos')) assert.ok(!existsSync(path.join(output, locale, 'work/healthos/index.html')));
  }
  const assetFiles = await readdir(path.join(output, '_astro'));
  // An empty project catalog may still publish the three selected personal images.
  if (!expected.length) {
    const imageFiles = assetFiles.filter(file => /\.(?:webp|png|jpe?g|svg)$/i.test(file));
    assert.ok(imageFiles.length > 0, 'Selected portraits remain independent of the project catalog');
    assert.deepEqual(imageFiles.filter(file => !/nam-(?:avatar|candid|sticker)/.test(file)), [], 'Empty catalogs must not emit project imagery');
  }
  if (!expected.includes('healthos')) assert.deepEqual(assetFiles.filter(file => /healthos/i.test(file)), []);
  assert.deepEqual(assetFiles.filter(file => /private-study/i.test(file)), []);
  const checks: unknown[] = [];
  await withFixtureBrowser(output, async (browser, origin) => {
    for (const width of [320, 390, 768, 960, 1024, 1440]) for (const locale of ['vi', 'en']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}${locale}/`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (expectedFeatured.length) {
        await page.locator('[data-featured-projects][data-enhanced="true"]').waitFor();
        assert.equal(await page.locator('.hero + .work-section [data-featured-projects]').count(), 1, 'Featured projects directly follow the preserved hero');
        assert.deepEqual(await page.locator('main > section').evaluateAll(sections => sections.slice(0, 2).map(section => section.classList[0])), ['hero', 'work-section']);
        assert.equal(await page.locator(active).getAttribute('data-project-id'), expectedFeatured[0]);
        for (const id of expectedFeatured) {
          if (expectedFeatured.length > 1 && id !== expectedFeatured[0]) await page.locator(`button[data-project-choice="${id}"]`).click();
          assert.equal(await page.locator(active).getAttribute('data-project-id'), id);
          assert.equal(await page.locator(`${active} [role="tab"][aria-selected="true"]`).getAttribute('data-panel'), 'output');
          assert.equal(await page.locator(`${active} .desk-footer a`).getAttribute('href'), `/portfolio/${locale}/work/${id}/`);
          if (id === 'healthos-title') assert.equal(await page.locator(`${active} img`).count(), 0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await accessible(page);
          if (width === 390) await capture(page, path.join(reportDirectory, `${width}-${locale}-${id}-output.png`));
        }
      }
      if (name === 'many-featured') {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Home, including long picker labels, must reflow at 200% text: ${width}px/${locale}`);
        for (const button of await page.locator('[data-project-choice]').all()) {
          const box = await button.boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44);
        }
      }
      await page.goto(`${origin}${locale}/about/`);
      await page.evaluate(() => document.fonts.ready);
      const about = await aboutGeometry(page, expected, width);
      await accessible(page);
      await capture(page, path.join(reportDirectory, `${width}-${locale}-about.png`));
      if ([320, 1440].includes(width)) {
        await page.route('**/*.woff2', route => route.abort('failed'));
        await page.reload();
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) if (walker.currentNode.parentElement?.tagName !== 'SCRIPT') walker.currentNode.textContent = walker.currentNode.textContent?.normalize('NFD') || '';
        });
        await aboutGeometry(page, expected, width);
        await capture(page, path.join(reportDirectory, `${width}-${locale}-about-font-fallback-text-200.png`));
      }
      assert.deepEqual(errors, []);
      checks.push({ width, locale, expected, reflow: 'pass', about, aboutFontFallbackAndText200: [320, 1440].includes(width) ? 'pass' : 'not-run', errors });
      await context.close();
    }
  });
  await writeFile(path.join(reportDirectory, 'template-results.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), checks, assetFiles, privateContentAbsent: true }, null, 2)}\n`);
});

test('publish-unselected: actual fixture build preserves explicit publication selection guard', { skip, timeout: 180_000 }, async () => {
  const { reportDirectory } = await buildFixture('publish-unselected', true);
  await writeFile(path.join(reportDirectory, 'template-results.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), rejected: true, reason: 'publish requires explicit publicSelected' }, null, 2)}\n`);
});

// Selection variants modify a copied source tree. Production media and originals
// are never renamed or overwritten, and no fixture-only switch enters the app.
for (const variant of ['disabled', 'alternate-avatar', 'invalid-role', 'declared-missing'] as const) test(`personal ${variant}: isolated source build enforces selection and base-safe output`, { skip, timeout: 240_000 }, async () => {
  const reportDirectory = path.join(reports, `personal-${variant}-template`);
  const sourceRoot = path.join(reportDirectory, 'source');
  await mkdir(sourceRoot, { recursive: true });
  for (const entry of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) await cp(path.resolve(entry), path.join(sourceRoot, entry), { recursive: true });
  const registryPath = path.join(sourceRoot, 'src/data/personal-media.ts');
  const originalRegistry = await readFile('src/data/personal-media.ts', 'utf8');
  let registry = originalRegistry;
  if (variant === 'disabled') {
    registry = registry.replace(/(export const personalMediaSelection: PersonalMediaSelection = \{)[\s\S]*?(\n\};)/, '$1\n  avatar: null,\n  homePortrait: null,\n  aboutPortrait: null,$2');
  } else if (variant === 'alternate-avatar') {
    // Test-owned imagery keeps this branch reproducible without private originals.
    // Render a distinct source into the same three real WebP derivatives the app uses.
    const alternateAvatar = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="#D8E8EC"/><circle cx="96" cy="66" r="32" fill="#315A69"/><path d="M32 192v-26a64 64 0 0 1 128 0v26" fill="#315A69"/></svg>');
    for (const size of [48, 96, 144]) {
      await sharp(alternateAvatar).resize(size, size, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 100, effort: 6 }).toFile(path.join(sourceRoot, `src/assets/personal/nam-avatar-alt-${size}.webp`));
      registry = registry.replace(`personal/nam-avatar-${size}.webp`, `personal/nam-avatar-alt-${size}.webp`);
    }
  } else if (variant === 'invalid-role') {
    registry = registry.replace("homePortrait: 'nam-sticker',", "homePortrait: 'nam-avatar',");
  } else {
    registry = registry.replace('personal/nam-avatar-96.webp', 'personal/declared-missing-avatar-96.webp');
  }
  assert.notEqual(registry, originalRegistry, 'The fixture must actually exercise a changed selection or declared source');
  await writeFile(registryPath, registry);
  const output = path.join(sourceRoot, 'dist');
  const env = { ...process.env, CONTENT_FIXTURE_DIR: undefined, OUT_DIR: undefined, OUTPUT_DIR: output, BASE_PATH: '/portfolio/', SITE_URL: 'https://portfolio.test', RELEASE_BUILD: '0', QA_REPORT_DIR: reportDirectory };
  const packageInfo = JSON.parse(await readFile('node_modules/astro/package.json', 'utf8'));
  const cli = path.resolve('node_modules/astro', typeof packageInfo.bin === 'string' ? packageInfo.bin : packageInfo.bin.astro);
  const build = spawnSync(process.execPath, [cli, 'build', '--force'], { cwd: sourceRoot, env, encoding: 'utf8', timeout: 120_000 });
  await writeFile(path.join(reportDirectory, 'build.log'), `${build.stdout}\n${build.stderr}`);
  assert.equal(await readFile('src/data/personal-media.ts', 'utf8'), originalRegistry, 'Fixture builds leave the real registry unchanged');
  if (variant === 'invalid-role' || variant === 'declared-missing') {
    assert.notEqual(build.status, 0, 'Invalid roles and missing declared assets must fail the real build');
    assert.match(build.stdout + build.stderr, variant === 'invalid-role'
      ? /Invalid personal media selection: nam-avatar is not allowed in homePortrait/
      : /declared-missing-avatar-96\.webp/);
    await writeFile(path.join(reportDirectory, 'template-results.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), variant, rejected: true, productionRegistryUnchanged: true }, null, 2)}\n`);
    return;
  }
  assert.equal(build.status, 0, `Personal fixture build failed: ${build.stdout}\n${build.stderr}`);
  const verification = verify(env);
  assert.equal(verification.status, 0, verification.stdout + verification.stderr);
  const assetFiles = await readdir(path.join(output, '_astro'));
  if (variant === 'disabled') assert.deepEqual(assetFiles.filter(file => /nam-(?:avatar|candid|sticker)/.test(file)), [], 'Disabled personal slots must emit no personal image assets');
  else {
    assert.equal(assetFiles.filter(file => /^nam-avatar-alt-\d+[._]/.test(file)).length, 3);
    assert.deepEqual(assetFiles.filter(file => /^nam-avatar-\d+[._]/.test(file)), [], 'Alternate avatar must replace the default derivatives in the output');
  }
  const checks: unknown[] = [];
  await withFixtureBrowser(output, async (browser, origin) => {
    for (const width of [320, 390, 960, 1440]) for (const dpr of [1, 2]) for (const locale of ['vi', 'en']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr });
      try {
        const page = await context.newPage();
        for (const route of ['', 'about/']) {
          await page.goto(`${origin}${locale}/${route}`);
          await page.evaluate(() => document.fonts.ready);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.equal(await page.locator('.about-projects time').count(), 0);
          if (variant === 'disabled') {
            assert.equal(await page.locator('[data-personal-slot], .hero-portrait, .about-portrait').count(), 0, 'Disabled slots leave no image or placeholder wrapper');
            if (!route) {
              assert.equal(await page.locator('.hero-layout--with-portrait').count(), 0, 'Disabled hero image leaves no dedicated empty column');
              assert.equal(await page.locator('.hero-actions a').count(), 2);
            }
          } else {
            for (const image of await page.locator('img[data-personal-slot]').all()) {
              await image.evaluate(async element => { const image = element as HTMLImageElement; image.loading = 'eager'; await image.decode(); });
              assert.match((await image.getAttribute('src'))!, /^\/portfolio\/_astro\//);
              for (const candidate of (await image.getAttribute('srcset'))!.split(',')) assert.match(candidate.trim(), /^\/portfolio\/_astro\//);
            }
            if (!route) {
              const avatar = page.locator('img[data-personal-slot="avatar"]');
              assert.equal(await avatar.count(), 1);
              assert.match((await avatar.getAttribute('src'))!, /nam-avatar-alt-/);
              assert.equal(await avatar.getAttribute('data-personal-role'), 'avatar');
              const bounds = await avatar.boundingBox();
              assert.ok(bounds && bounds.width <= 64 && bounds.height <= 64);
              assert.equal(await page.locator('img[src*="nam-avatar-alt-"]:not([data-personal-slot="avatar"])').count(), 0);
              await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
              const enlarged = await avatar.boundingBox();
              assert.ok(enlarged && enlarged.width <= 64 && enlarged.height <= 64);
            }
            assert.deepEqual(await page.locator('*').evaluateAll(elements => elements.filter(element => /nam-avatar-alt/.test(getComputedStyle(element).backgroundImage)).map(element => element.tagName)), []);
            assert.deepEqual(await page.locator('meta[property="og:image"], meta[name="twitter:image"]').evaluateAll(elements => elements.map(element => element.getAttribute('content')).filter(value => /nam-avatar-alt/.test(value || ''))), []);
          }
          for (const paragraph of await page.locator(route ? '.about-story p, .about-projects p' : '.hero h1, .hero-intro').all()) {
            const result = await paragraph.evaluate(inspectReadableText);
            assert.ok(result.readable, JSON.stringify(result));
          }
          if (dpr === 1 && [390, 1440].includes(width)) await capture(page, path.join(reportDirectory, `${width}-${locale}-${route ? 'about' : 'home'}.png`));
          checks.push({ width, dpr, locale, route: route || 'home', reflow: 'pass', selection: 'pass' });
        }
      } finally { await context.close(); }
    }
  });
  await writeFile(path.join(reportDirectory, 'template-results.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), variant, base: env.BASE_PATH, checks, assetFiles, productionRegistryUnchanged: true }, null, 2)}\n`);
});
