import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { readingMinutes } from '../src/lib/reading';
import { enhanceReadingHtml } from '../scripts/reading-markdown.mjs';

test('reading estimates use documented locale rates and exclude comment, image, URL and fenced-code boilerplate', () => {
  const words = (count: number) => Array(count).fill('word').join(' ');
  assert.equal(readingMinutes(words(220), 'en'), 1);
  assert.equal(readingMinutes(words(221), 'en'), 2);
  assert.equal(readingMinutes(words(300), 'vi'), 1);
  assert.equal(readingMinutes(words(301), 'vi'), 2);
  assert.equal(readingMinutes(`${words(220)}\n<!-- ${words(500)} -->\n![${words(500)}](image.png)\n\x60\x60\x60js\n${words(500)}\n\x60\x60\x60\nhttps://example.test/one/two/three`, 'en'), 1);
  assert.equal(readingMinutes('', 'vi'), 1);
});

test('reading enhancement preserves rendered heading identities and native fragments without exposing copy controls before JavaScript', () => {
  const $ = load(enhanceReadingHtml('<h2 id="quyết-định">Quyết định <code>health</code></h2><h2 id="quyết-định-1">Quyết định</h2><h3 id="limits">Limits &amp; scope</h3><h4 id="detail">Detail</h4>', 'vi'));
  assert.deepEqual($('h2,h3,h4').map((_, heading) => $(heading).attr('id')).get(), ['quyết-định', 'quyết-định-1', 'limits', 'detail']);
  assert.deepEqual($('.heading-link').map((_, anchor) => $(anchor).attr('href')).get(), ['#quyết-định', '#quyết-định-1', '#limits']);
  assert.equal($('.heading-link code').text(), 'health');
  assert.equal($('button[hidden][data-copy-fragment]').length, 3);
  assert.match($('button').first().attr('aria-label') || '', /Quyết định health/);
  assert.equal($('h4').text(), 'Detail');
});

test('table enhancement retains explicit captions and cells, supplies heading context and column relationships', () => {
  const $ = load(enhanceReadingHtml('<h2 id="checks">Observed checks</h2><table><thead><tr><th>Condition</th><th>Meaning</th></tr></thead><tbody><tr><td>Healthy</td><td>Probe passed</td></tr></tbody></table><table><caption>Explicit scope</caption><thead><tr><th>Scope</th></tr></thead><tbody><tr><td>Local</td></tr></tbody></table>', 'en'));
  assert.deepEqual($('caption').map((_, caption) => $(caption).text()).get(), ['Observed checks', 'Explicit scope']);
  assert.equal($('thead th[scope="col"]').length, 3);
  assert.deepEqual($('tbody th, tbody td').map((_, cell) => $(cell).text()).get(), ['Healthy', 'Probe passed', 'Local']);
  assert.equal($('tbody th[scope="row"]').length, 2);
  assert.equal($('.table-hint').length, 2);
  assert.match($('.table-hint').first().text(), /Scroll sideways.*arrow keys/);
  assert.deepEqual($('.table-scroll[role="region"][tabindex="0"]').map((_, region) => $(region).attr('aria-label')).get(), ['Observed checks', 'Explicit scope']);
});
