import { test, expect, type Page } from '@playwright/test';

interface FeaturedDetail { instanceId: string; projectId: string; layer: string; origin: string; revision: number }
interface ObservedEvent { detail: FeaturedDetail; enhanced: string | undefined; projectId: string | undefined; layer: string | undefined; revision: string | undefined; visibleArticles: number; visiblePanels: number }
type EventWindow = Window & { featuredEvents: ObservedEvent[] };
const active = '[data-open-desk]:not([hidden])';
const picker = (page: Page, project: string) => page.locator(`button[data-project-choice="${project}"]`);
const tab = (page: Page, layer: string) => page.locator(`${active} [data-panel="${layer}"]`);
async function fragmentLink(page: Page, project: string) {
  // A test fixture exercises the generic native-fragment coordinator without
  // introducing another section or control into the production portfolio.
  await page.evaluate(projectId => {
    const link = document.createElement('a');
    link.href = `#home-featured-${projectId}`;
    link.dataset.fragmentFixture = projectId;
    link.textContent = 'Native project fragment';
    document.querySelector('.hero-actions')!.append(link);
  }, project);
  return page.locator(`a[data-fragment-fixture="${project}"]`);
}
const events = (page: Page) => page.evaluate(() => (window as unknown as EventWindow).featuredEvents);

async function observe(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const state = window as unknown as EventWindow;
    state.featuredEvents = [];
    document.addEventListener('featured:change', event => {
      const wrapper = event.target as HTMLElement;
      const article = wrapper.querySelector<HTMLElement>('[data-open-desk]:not([hidden])');
      const panel = article?.querySelector<HTMLElement>('[data-desk-panel]:not([hidden])');
      state.featuredEvents.push({
        detail: (event as CustomEvent<FeaturedDetail>).detail,
        enhanced: wrapper.dataset.enhanced,
        projectId: article?.dataset.projectId,
        layer: panel?.dataset.deskPanel,
        revision: wrapper.dataset.featuredRevision,
        visibleArticles: wrapper.querySelectorAll('[data-open-desk]:not([hidden])').length,
        visiblePanels: article?.querySelectorAll('[data-desk-panel]:not([hidden])').length ?? 0,
      });
    });
  });
}
async function ready(page: Page, route = 'vi/') {
  await page.goto(route);
  await expect(page.locator('[data-featured-projects]')).toHaveAttribute('data-enhanced', 'true');
}
function assertCommitted(records: ObservedEvent[]) {
  for (const record of records) {
    expect(record.enhanced).toBe('true');
    expect(record.projectId).toBe(record.detail.projectId);
    expect(record.layer).toBe(record.detail.layer);
    expect(record.revision).toBe(String(record.detail.revision));
    expect(record.visibleArticles).toBe(1);
    expect(record.visiblePanels).toBe(1);
    expect(record.detail.instanceId).toBe('home-featured');
  }
  expect(records.map(record => record.detail.revision)).toEqual(records.map((_, index) => index + 1));
}

for (const locale of ['vi', 'en']) test(`${locale}: project and tab changes publish one coherent committed snapshot`, async ({ page }) => {
  await observe(page); await ready(page, `${locale}/`);
  expect((await events(page)).map(record => record.detail)).toEqual([{ instanceId: 'home-featured', projectId: 'healthos', layer: 'output', origin: 'init', revision: 1 }]);
  await tab(page, 'decisions').click();
  await picker(page, 'quan-ly-kho').click();
  await tab(page, 'context').click();
  await picker(page, 'healthos').click();
  const records = await events(page);
  expect(records.map(record => [record.detail.projectId, record.detail.layer, record.detail.origin])).toEqual([
    ['healthos', 'output', 'init'],
    ['healthos', 'decisions', 'tab'],
    ['quan-ly-kho', 'output', 'project'],
    ['quan-ly-kho', 'context', 'tab'],
    ['healthos', 'output', 'project'],
  ]);
  assertCommitted(records);
});

test('deep-link initialization publishes only the final state and leaves a readable committed snapshot', async ({ page }) => {
  await observe(page); await ready(page, 'en/#home-featured-quan-ly-kho--panel-decisions');
  const records = await events(page);
  expect(records).toHaveLength(1);
  expect(records[0].detail).toEqual({ instanceId: 'home-featured', projectId: 'quan-ly-kho', layer: 'decisions', origin: 'init', revision: 1 });
  assertCommitted(records);
  await expect(page.locator('[data-featured-projects]')).toHaveAttribute('data-featured-revision', '1');
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(page.locator(`${active} [data-desk-panel]:not([hidden])`)).toHaveAttribute('data-desk-panel', 'decisions');
});

test('no-op selections and coordinator script replay do not republish or duplicate listeners', async ({ page }) => {
  await observe(page); await ready(page);
  // aria-disabled communicates the current choice without disabling its native
  // button; dispatch the deliberate no-op that ordinary actionability avoids.
  await picker(page, 'healthos').dispatchEvent('click'); await tab(page, 'output').click();
  const script = await page.locator('script[data-featured-coordinator]').textContent();
  expect(script).toBeTruthy();
  await page.addScriptTag({ content: script! }); await page.addScriptTag({ content: script! });
  expect(await events(page)).toHaveLength(1);
  await picker(page, 'quan-ly-kho').click();
  expect(await events(page)).toHaveLength(2);
  assertCommitted(await events(page));
});

for (const activation of ['pointer', 'keyboard'] as const) test(`${activation}: native fragment B → picker A → same-hash fragment B reveals B once`, async ({ page }) => {
  await observe(page); await ready(page);
  const link = await fragmentLink(page, 'quan-ly-kho');
  await link.click();
  await expect(page).toHaveURL(/#home-featured-quan-ly-kho$/);
  await picker(page, 'healthos').click();
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'healthos');
  expect(page.url()).toMatch(/#home-featured-quan-ly-kho$/);
  const count = (await events(page)).length;
  if (activation === 'pointer') await link.click();
  else { await link.focus(); await page.keyboard.press('Enter'); }
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'quan-ly-kho');
  await expect(page.locator('#home-featured-quan-ly-kho')).toBeInViewport();
  const records = await events(page);
  expect(records).toHaveLength(count + 1);
  expect(records.at(-1)?.detail.origin).toBe('fragment');
  assertCommitted(records);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[hidden]')))).toBe(false);
});

test('modified, download and new-tab links do not change the active project', async ({ page }) => {
  await observe(page); await ready(page);
  await (await fragmentLink(page, 'quan-ly-kho')).evaluate(element => {
    const link = element as HTMLAnchorElement;
    const click = (options: MouseEventInit = {}) => {
      // Prevent the browser's navigation only after the coordinator has handled
      // the event, so the test does not create unrelated tabs or downloads.
      document.addEventListener('click', event => event.preventDefault(), { once: true });
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options }));
    };
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) click(options);
    link.target = '_blank'; click(); link.removeAttribute('target');
    link.download = 'project'; click(); link.removeAttribute('download');
  });
  await expect(page.locator(active)).toHaveAttribute('data-project-id', 'healthos');
  expect(await events(page)).toHaveLength(1);
});

test('failed partial initialization publishes nothing and a clean retry commits exactly once', async ({ page }) => {
  await observe(page);
  await page.addInitScript(() => {
    const original = Element.prototype.replaceWith;
    let replacements = 0;
    Element.prototype.replaceWith = function (...nodes: (string | Node)[]) {
      if (this.matches('a[data-project-choice]') && ++replacements === 2) {
        Element.prototype.replaceWith = original;
        throw new Error('Intentional pre-commit failure');
      }
      return original.apply(this, nodes);
    };
  });
  await page.goto('vi/');
  await expect(page.locator('[data-featured-projects]')).not.toHaveAttribute('data-enhanced', 'true');
  await expect(page.locator('[data-open-desk][hidden], [data-desk-panel][hidden]')).toHaveCount(0);
  expect(await events(page)).toHaveLength(0);
  const script = await page.locator('script[data-featured-coordinator]').textContent();
  await page.addScriptTag({ content: script! });
  await expect(page.locator('[data-featured-projects]')).toHaveAttribute('data-enhanced', 'true');
  expect(await events(page)).toHaveLength(1);
  await picker(page, 'quan-ly-kho').click();
  expect(await events(page)).toHaveLength(2);
  assertCommitted(await events(page));
});
