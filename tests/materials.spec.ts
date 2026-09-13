import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import { inspectReadableText } from './helpers/readable-text';

const reports = path.resolve(process.env.QA_REPORT_DIR || 'test-results/materials');
const shells = '.header-controls, .project-choices';
const labels = '.header-controls a, .header-controls button, .project-choice';
const modes = ['baseline-b', 'expressive-css', 'solid'] as const;
type Mode = typeof modes[number];

async function setMaterial(page: Page, mode: Mode | 'expressive-refractive') {
  await page.locator('html').evaluate((element, value) => (element as HTMLElement).dataset.material = value, mode);
  await expect(page.locator('html')).toHaveAttribute('data-material-effective', mode === 'expressive-refractive' ? 'expressive-css' : mode);
}

async function ready(page: Page, mode?: Mode, route = 'vi/') {
  await page.goto(route);
  await expect(page.locator('html')).toHaveAttribute('data-glass-motion-mounted', 'true');
  await page.evaluate(() => document.fonts.ready);
  if (mode) await setMaterial(page, mode);
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => /^(component-motion|glass-motion):/.test(animation.id)).map(animation => animation.finished.catch(() => undefined)));
  });
}

async function materialState(page: Page) {
  return page.locator(shells).evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    const backing = element.querySelector('[data-glass-backing]');
    const backingStyle = backing && getComputedStyle(backing);
    const filter = style.backdropFilter !== 'none' ? style.backdropFilter : backingStyle?.backdropFilter || 'none';
    return { selector: element.className, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, tint: backingStyle?.backgroundColor || style.backgroundColor, image: backingStyle?.backgroundImage || style.backgroundImage, filter, shellFilter: style.backdropFilter, backingFilter: backingStyle?.backdropFilter, shadow: backingStyle?.boxShadow || style.boxShadow, opacity: style.opacity, position: style.position, overflow: style.overflow };
  }));
}

async function samplers(page: Page) {
  return page.locator('body *').evaluateAll(elements => elements.flatMap(element => [null, '::before', '::after'].flatMap(pseudo => {
    const style = getComputedStyle(element, pseudo), box = element.getBoundingClientRect();
    if (!box.width || !box.height || style.display === 'none' || style.backdropFilter === 'none' || (pseudo && ['none', 'normal'].includes(style.content))) return [];
    return [{ tag: element.tagName, className: element.className, backing: element.hasAttribute('data-glass-backing'), shell: element.closest('.header-controls,.project-choices')?.className, pseudo, filter: style.backdropFilter }];
  })));
}

function rgb(color: string) { return color.match(/[\d.]+/g)!.slice(0, 3).map(Number); }
function luminance(color: number[]) { return color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0); }
function contrast(a: number[], b: number[]) { const values = [luminance(a), luminance(b)].sort((a, b) => a - b); return (values[1] + .05) / (values[0] + .05); }

test('default expressive CSS, equal material geometry, foreground layout and unchanged Champagne/content', async ({ browser, baseURL }) => {
  const observations = [];
  test.setTimeout(90_000);
  for (const width of [320, 360, 375, 390, 768, 1024, 1440, 1920]) {
    const geometry = [];
    for (const mode of modes) {
      const page = await browser.newPage({ baseURL, viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
      await ready(page, mode);
      const state = await materialState(page);
      geometry.push(state.map(item => item.bounds));
      expect(state).toHaveLength(2);
      for (const item of state) {
        expect(item.opacity).toBe('1');
        expect(item.filter).toBe(mode === 'solid' ? 'none' : `blur(${width <= 640 ? 10 : mode === 'baseline-b' ? 16 : 12}px)`);
      }
      // Foreground position is now independent of the selected material recipe.
      await expect(page.locator('html')).toHaveAttribute('data-glass-layout', 'foreground');
      expect(await page.locator('.site-header').evaluate(element => getComputedStyle(element).position)).toBe('sticky');
      expect(await page.locator('.featured-paper, .desk-panel, .desk-evidence').evaluateAll(elements => elements.map(element => [getComputedStyle(element).backdropFilter, getComputedStyle(element).opacity]))).toEqual(expect.arrayContaining([['none', '1']]));
      const visibleBackdrop = await samplers(page);
      expect(visibleBackdrop.length).toBe(mode === 'solid' ? 0 : 2);
      if (mode === 'expressive-css') {
        expect(visibleBackdrop.every(item => item.backing && !item.pseudo)).toBe(true);
        expect(state.every(item => item.shellFilter === 'none')).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      observations.push({ width, mode, state, visibleBackdrop });
      await page.close();
    }
    expect(geometry[1]).toEqual(geometry[0]);
    expect(geometry[2]).toEqual(geometry[0]);
  }
  const page = await browser.newPage({ baseURL });
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-material-effective', 'expressive-css');
  expect((await materialState(page)).map(item => item.filter)).toEqual(['blur(12px)', 'blur(12px)']);
  expect(await page.evaluate(() => Object.fromEntries(['desk', 'paper', 'ink', 'muted', 'accent', 'focus', 'line', 'paper-edge'].map(name => [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().toUpperCase()])))).toEqual({ desk: '#DECCB0', paper: '#F7F3E9', ink: '#202620', muted: '#565344', accent: '#75532F', focus: '#3A645A', line: '#ADA18B', 'paper-edge': '#B7AA94' });
  await page.close();
  await mkdir(reports, { recursive: true });
  await writeFile(path.join(reports, 'material-geometry.json'), JSON.stringify(observations, null, 2));
});

test('composited labels and actual focus rings on both shells over desk/paper/ink/existing-image', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  const image = await page.locator('[data-open-desk]:not([hidden]) [data-desk-panel="output"] img').first().evaluate(async element => {
    const media = element as HTMLImageElement; media.loading = 'eager'; await media.decode(); return media.currentSrc;
  });
  const evidence = [];
  await mkdir(path.join(reports, 'material-static'), { recursive: true });
  for (const mode of modes) for (const backdrop of ['desk', 'paper', 'ink', 'image']) for (const shell of ['header', 'tray']) {
    const container = shell === 'header' ? '.site-header' : '.featured-paper';
    const controlSelector = shell === 'header' ? '.header-controls a:visible, .header-controls button:visible' : '.project-choice:visible';
    await page.evaluate(({ mode, backdrop, image, container }) => {
      document.documentElement.dataset.material = mode;
      (document.activeElement as HTMLElement)?.blur?.();
      document.querySelector<HTMLElement>(container)!.style.background = backdrop === 'image' ? `url("${image}") center / cover` : `var(--${backdrop})`;
    }, { mode, backdrop, image, container });
    await expect(page.locator('html')).toHaveAttribute('data-material-effective', mode);
    await page.locator(shell === 'header' ? '.header-controls' : '.project-choices').scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
    const visibleLabels = page.locator(controlSelector);
    const samples = await visibleLabels.evaluateAll(elements => elements.map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const rect = range.getBoundingClientRect(), style = getComputedStyle(element);
      return { text: element.textContent, color: style.color, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    }));
    const name = `${mode}-${backdrop}-${shell}`;
    await page.screenshot({ path: path.join(reports, 'material-static', `${name}.png`) });
    // Glyph-only paint mask retains real browser-composited material and backdrop.
    const mask = await page.addStyleTag({ content: '.header-controls a,.header-controls a *,.header-controls button,.project-choice{color:transparent!important;text-decoration-color:transparent!important}' });
    const raster = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    await mask.evaluate(element => element.parentNode?.removeChild(element));
    const pixel = (raster: { data: Buffer; info: OutputInfo }, x: number, y: number) => {
      const offset = (Math.round(y) * raster.info.width + Math.round(x)) * raster.info.channels;
      return [...raster.data.subarray(offset, offset + 3)];
    };
    const sampleResults = samples.map(sample => {
      const backgrounds: number[][] = [];
      for (let y = Math.max(0, Math.ceil(sample.bounds.y)); y < Math.min(raster.info.height, Math.floor(sample.bounds.y + sample.bounds.height)); y += 2) for (let x = Math.max(0, Math.ceil(sample.bounds.x)); x < Math.min(raster.info.width, Math.floor(sample.bounds.x + sample.bounds.width)); x += 2) backgrounds.push(pixel(raster, x, y));
      expect(backgrounds.length).toBeGreaterThan(0);
      return { ...sample, backgroundPixelCount: backgrounds.length, minimumTextRatio: Math.min(...backgrounds.map(background => contrast(rgb(sample.color), background))) };
    });
    const focused = visibleLabels.first();
    await focused.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    const focus = await focused.evaluate(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { color: style.outlineColor, width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset), radius: parseFloat(style.borderTopLeftRadius), x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, focused: element === document.activeElement, style: style.outlineStyle };
    });
    expect(focus.focused).toBe(true); expect(focus.style).not.toBe('none');
    const focusRaster = await sharp(await page.screenshot({ path: path.join(reports, 'material-static', `${name}-focus.png`) })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const outlineMask = await page.addStyleTag({ content: '.header-controls :focus,.project-choices :focus{outline-color:transparent!important}' });
    const withoutOutline = await sharp(await page.screenshot({ path: path.join(reports, 'material-static', `${name}-outline-mask.png`) })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    await outlineMask.evaluate(element => (element as Element).remove());
    const inset = focus.offset + focus.width;
    expect(focus.x - inset).toBeGreaterThanOrEqual(0); expect(focus.y - inset).toBeGreaterThanOrEqual(0);
    expect(focus.right + inset).toBeLessThanOrEqual(focusRaster.info.width); expect(focus.bottom + inset).toBeLessThanOrEqual(focusRaster.info.height);
    const regions = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const perimeter: { x: number; y: number; region: string; painted: number[]; masked: number[]; ratio: number }[] = [];
    const changed = new Set<string>();
    for (let y = Math.floor(focus.y - inset); y <= Math.ceil(focus.bottom + inset); y++) for (let x = Math.floor(focus.x - inset); x <= Math.ceil(focus.right + inset); x++) {
      const painted = pixel(focusRaster, x, y), masked = pixel(withoutOutline, x, y);
      if (!painted.some((channel, index) => Math.abs(channel - masked[index]) > 5)) continue;
      changed.add(`${x},${y}`);
      // Keep the full differential mask for continuity; contrast uses fully
      // painted core pixels so rounded-edge antialiasing is not mis-scored.
      if (painted.some((channel, index) => channel !== rgb(focus.color)[index])) continue;
      const horizontal = x < focus.x + focus.radius ? 'left' : x > focus.right - focus.radius ? 'right' : '';
      const vertical = y < focus.y + focus.radius ? 'top' : y > focus.bottom - focus.radius ? 'bottom' : '';
      const region = vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal;
      if (region) perimeter.push({ x, y, region, painted, masked, ratio: contrast(painted, masked) });
    }
    // An eight-connected outline mask must span every edge and rounded corner.
    const remaining = new Set(changed), components: number[] = [];
    while (remaining.size) {
      const queue = [remaining.values().next().value!]; remaining.delete(queue[0]); let size = 0;
      while (queue.length) {
        const [x, y] = queue.pop()!.split(',').map(Number); size++;
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
          const key = `${x + dx},${y + dy}`; if (remaining.delete(key)) queue.push(key);
        }
      }
      components.push(size);
    }
    const continuity = changed.size ? Math.max(...components) / changed.size : 0;
    const perimeterByRegion = Object.fromEntries(regions.map(region => {
      const samples = perimeter.filter(sample => sample.region === region);
      return [region, { pixelCount: samples.length, minimumRatio: samples.length ? Math.min(...samples.map(sample => sample.ratio)) : null }];
    }));
    const ring: { painted: number[]; outside: number[]; inside: number[]; ratio: number }[] = [];
    const ringY = focus.y - focus.offset - focus.width / 2;
    for (let x = Math.ceil(focus.x + 16); x < Math.floor(focus.right - 16); x += 2) {
      const painted = pixel(focusRaster, x, ringY);
      if (painted.length !== 3 || painted.some((channel, index) => Math.abs(channel - rgb(focus.color)[index]) > 12)) continue;
      const outside = pixel(focusRaster, x, focus.y - focus.offset - focus.width - 1), inside = pixel(focusRaster, x, focus.y - 1);
      ring.push({ painted, outside, inside, ratio: Math.min(contrast(painted, outside), contrast(painted, inside)) });
    }
    evidence.push({ mode, backdrop, shell, imageSource: backdrop === 'image' ? image : null, labels: sampleResults, focus: { ...focus, ringSamples: ring, minimumRatio: ring.length ? Math.min(...ring.map(sample => sample.ratio)) : null, perimeter, perimeterByRegion, changedOutlinePixels: changed.size, connectedComponents: components, continuity }, method: 'DPR1 actual raster; two CSS-pixel text stride under a glyph-only mask. Original project evidence supplies the image backdrop. Full visible outline raster compared pixel-for-pixel with outline-color transparent; every edge and rounded corner must contain opaque core samples and the differential mask must be connected. Contrast excludes antialiasing; the original top-edge immediately-inside/outside contrast check remains additional coverage.' });
    await writeFile(path.join(reports, 'material-contrast.json'), JSON.stringify(evidence, null, 2));
    for (const result of sampleResults) expect(result.minimumTextRatio, JSON.stringify({ mode, backdrop, shell, result })).toBeGreaterThanOrEqual(4.5);
    expect(ring.length, JSON.stringify({ name, focus })).toBeGreaterThan(0);
    expect(Math.min(...ring.map(sample => sample.ratio)), name).toBeGreaterThanOrEqual(3);
    expect(continuity, `${name}: full outline continuity`).toBeGreaterThanOrEqual(.99);
    for (const [region, result] of Object.entries(perimeterByRegion)) {
      expect(result.pixelCount, `${name}: ${region} painted perimeter`).toBeGreaterThan(0);
      expect(result.minimumRatio, `${name}: ${region} full perimeter contrast`).toBeGreaterThanOrEqual(3);
    }
  }
});
test('glass remains enabled independently of reduced and Off motion; native controls still work', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('open-desk-motion', 'off'));
  await ready(page);
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    await page.emulateMedia({ reducedMotion });
    await expect(page.locator('html')).toHaveAttribute('data-motion-off', 'true');
    expect((await materialState(page)).every(item => item.filter === 'blur(12px)')).toBe(true);
    const choice = page.locator(`button[data-project-choice="${reducedMotion === 'reduce' ? 'quan-ly-kho' : 'healthos'}"]`);
    await choice.click();
    await expect(choice).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-open-desk]:not([hidden]) [data-panel="output"]').focus();
    await page.keyboard.press('Home');
    await expect(page.locator('[data-open-desk]:not([hidden]) [data-panel="context"]')).toHaveAttribute('aria-selected', 'true');
  }
});

test('unshipped refraction requests report the CSS fallback without adding samplers', async ({ page }) => {
  await ready(page);
  await setMaterial(page, 'expressive-refractive');
  await expect(page.locator('html')).toHaveAttribute('data-material-fallback', 'refraction-not-integrated');
  await expect(page.locator('html')).toHaveAttribute('data-material-effective-verified', 'true');
  expect(await samplers(page)).toHaveLength(2);
  expect((await samplers(page)).every(item => item.backing && !item.pseudo)).toBe(true);
  await expect(page.locator('canvas, svg filter')).toHaveCount(0);
});

test('solid fallback: unsupported declarations, forced colors, native reduced transparency, print', async ({ browser, baseURL }, testInfo) => {
  const fallbackEvidence = [];
  for (const fallback of ['unsupported-declarations', 'forced-colors', 'reduced-transparency', 'print'] as const) {
    const page = await browser.newPage({ baseURL });
    if (fallback === 'unsupported-declarations') {
      // Capability/declaration fault injection is explicit; this is not a claim
      // that the installed browser lacks backdrop-filter support.
      await page.addInitScript(() => {
        const supports = CSS.supports.bind(CSS);
        CSS.supports = ((property: string, value?: string) => property.includes('backdrop-filter') ? false : value === undefined ? supports(property) : supports(property, value)) as typeof CSS.supports;
      });
      await page.route('**/*.css', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replaceAll('backdrop-filter', 'unsupported-backdrop-filter') });
      });
    }
    await ready(page);
    if (fallback === 'forced-colors') await page.emulateMedia({ forcedColors: 'active' });
    if (fallback === 'print') await page.emulateMedia({ media: 'print' });
    if (fallback === 'reduced-transparency') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    }
    const actualMedia = await page.evaluate(() => ({ print: matchMedia('print').matches, forcedColors: matchMedia('(forced-colors:active)').matches }));
    if (fallback === 'print') expect(actualMedia.print).toBe(true);
    if (fallback === 'forced-colors') expect(actualMedia.forcedColors).toBe(true);
    const preferenceSupported = await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches);
    const state = await materialState(page);
    fallbackEvidence.push({ fallback, preferenceSupported, actualMedia, state, scope: fallback === 'unsupported-declarations' ? 'Forced unsupported CSS declaration/support-query simulation in a capable browser, not a physical unsupported browser.' : 'Native browser media emulation; not an OS or physical-device setting.' });
    await mkdir(reports, { recursive: true });
    await writeFile(path.join(reports, 'material-fallbacks.json'), JSON.stringify(fallbackEvidence, null, 2));
    if (fallback !== 'reduced-transparency' || preferenceSupported) {
      await expect(page.locator('html')).toHaveAttribute('data-material-effective', 'solid');
      for (const item of state) expect(item.filter, `${fallback}: ${item.selector}`).toBe('none');
      expect(await samplers(page)).toEqual([]);
    }
    else testInfo.annotations.push({ type: 'limitation', description: 'Native reduced-transparency emulation unsupported by this browser; rule fallback requires separate capability verification.' });
    if (fallback === 'print') expect(await page.locator('[data-open-desk][hidden], [data-desk-panel][hidden]').evaluateAll(elements => elements.every(element => getComputedStyle(element).display !== 'none'))).toBe(true);
    await page.close();
  }
  await mkdir(reports, { recursive: true });
  await writeFile(path.join(reports, 'material-fallbacks.json'), JSON.stringify(fallbackEvidence, null, 2));
});

for (const locale of ['vi', 'en']) test(`${locale}: coarse expressive CSS, 320/390px text 200%, long labels and focus remain reachable`, async ({ browser, baseURL }) => {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ baseURL, viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ready(page, 'expressive-css', `${locale}/`);
    expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
    expect((await materialState(page)).every(item => item.filter === 'blur(10px)')).toBe(true);
    await page.locator('[data-menu-toggle]').click();
    await page.locator(labels).evaluateAll(elements => {
      const sizes = elements.map(element => parseFloat(getComputedStyle(element).fontSize));
      elements.forEach((element, index) => { (element as HTMLElement).style.fontSize = `${sizes[index] * 2}px`; });
    });
    await page.locator('[data-project-choice]').first().evaluate(element => element.textContent = 'HealthOS — Quản lý thông tin sức khỏe');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const control of await page.locator(`${labels}`).all()) {
      if (!await control.isVisible()) continue;
      expect(await control.evaluate(inspectReadableText)).toMatchObject({ readable: true });
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await control.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      const focus = await control.evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { outline: style.outlineWidth, color: style.outlineColor, style: style.outlineStyle, x: rect.x, right: rect.right, viewport: innerWidth, focused: element === document.activeElement };
      });
      expect(focus.focused).toBe(true);
      expect(focus.style).not.toBe('none');
      expect(parseFloat(focus.outline)).toBeGreaterThanOrEqual(3);
      expect(focus.x).toBeGreaterThanOrEqual(5);
      expect(focus.right).toBeLessThanOrEqual(focus.viewport - 5);
    }
    await page.close();
  }
});

test('no-JS preserves full sections, native links and CSS material without motion', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('vi/');
  expect(await page.locator('[data-open-desk][hidden], [data-desk-panel][hidden]').count()).toBe(0);
  expect(await page.locator('a[data-project-choice]').count()).toBe(2);
  expect((await materialState(page)).every(item => item.filter === 'blur(12px)')).toBe(true);
  expect(await page.locator('html').getAttribute('data-glass-motion-mounted')).toBeNull();
  await context.close();
});

// Each measured context has its own explicit trace/video. The test runner's
// automatic failure trace would otherwise start a second competing recorder.
// Playwright requires this worker option at file scope. It is changed only in
// the explicitly gated, separately invoked comparison run, never normal QA.
if (process.env.RUN_MATERIAL_COMPARISON === '1') test.use({ trace: 'off' });
test('material comparison: serial baseline/CSS/solid trusted scroll, three runs per profile', async ({ baseURL }) => {
  test.skip(process.env.RUN_MATERIAL_COMPARISON !== '1', 'Separate serial performance gate; never measured in the parallel functional suite.');
  test.setTimeout(720_000);
  const { runMaterialComparison } = await import('../scripts/measure-materials.mjs');
  const result = await runMaterialComparison({ origin: baseURL!, reportDirectory: reports, runCount: 3 });
  expect(result.runs).toHaveLength(18);
  expect(result.errors).toEqual([]);
  expect(result.passed, JSON.stringify(result.summary)).toBe(true);
});
