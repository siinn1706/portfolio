import assert from 'node:assert/strict';
import test from 'node:test';
import { route, assetUrl, catalogRoutes, normalizeBase } from '../src/i18n/routes';
import type { PublicCatalog } from '../src/lib/catalog';
import type { Locale } from '../src/data/types';

test('locale and base are preserved on entry routes, contact anchors and selected assets', () => {
  for (const base of ['/', '/portfolio/']) for (const locale of ['vi', 'en'] as const) {
    assert.equal(route(locale, 'project', 'healthos', base), `${base}${locale}/work/healthos/`);
    assert.equal(route(locale, 'note', 'systems-note', base), `${base}${locale}/notes/systems-note/`);
    assert.equal(route(locale, 'home', undefined, base, 'contact'), `${base}${locale}/#contact`);
    assert.equal(assetUrl('/favicon.svg', base), `${base}favicon.svg`);
    assert.equal(assetUrl(`${base}_astro/image.webp`, base), `${base}_astro/image.webp`);
  }
  assert.equal(assetUrl('https://images.example.org/photo.jpg', '/portfolio/'), 'https://images.example.org/photo.jpg');
});

test('unsupported locale and unsafe base/entry routes fail instead of silently falling back', () => {
  assert.throws(() => route('fr' as Locale, 'home'), /Unsupported locale/);
  assert.throws(() => route('vi', 'project'), /requires slug/);
  assert.throws(() => route('vi', 'project', '../private'), /Unsafe route slug/);
  for (const base of ['portfolio', '/portfolio', '//', '/../../']) assert.throws(() => normalizeBase(base), /Invalid base/);
});

test('empty public catalog keeps Home, Work and About while excluding optional routes', () => {
  const routes = catalogRoutes({ projects: [], notes: [], photos: [], relations: [], topics: [] });
  assert.deepEqual(routes.map(item => item.url), ['/vi/', '/vi/work/', '/vi/about/', '/en/', '/en/work/', '/en/about/']);
});

test('the same catalog enables paired optional routes and retains stable entry IDs', () => {
  const catalog = { projects: [{ projectId: 'healthos', routeSlug: 'healthos' }], notes: [{ noteId: 'network-note', routeSlug: 'networking' }], photos: [{ photoId: 'selected-photo' }] } as PublicCatalog;
  const routes = catalogRoutes(catalog, '/portfolio/');
  for (const locale of ['vi', 'en']) {
    assert.ok(routes.some(item => item.locale === locale && item.key === 'project' && 'entryId' in item && item.entryId === 'healthos'));
    assert.ok(routes.some(item => item.url === `/portfolio/${locale}/notes/networking/`));
    assert.ok(routes.some(item => item.url === `/portfolio/${locale}/photography/`));
  }
  assert.equal(new Set(routes.map(item => item.url)).size, routes.length);
});
