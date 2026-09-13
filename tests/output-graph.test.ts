import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { analyzeOutputGraph, selectMetadataImages } from '../scripts/output-graph.mjs';

const opaqueModule = (blocks = 1400) => `export const payload=${JSON.stringify(Array.from({ length: blocks }, (_, index) => createHash('sha256').update(String(index)).digest('base64')).join(''))};`;
const renderer = opaqueModule();
const page = (head = '', body = '') => `<html><head>${head}</head><body>${body}</body></html>`;
const analyze = (files: Record<string, string>, base = '/') => analyzeOutputGraph({ files: new Map(Object.entries(files)), base });
const sceneFiles = (entry: string, head = '<script type="module" src="/_astro/core.js"></script>') => ({
  'index.html': page(head),
  '_astro/core.js': entry,
  '_astro/scene.js': 'import {payload} from "./vendor.js"; console.log(payload);',
  '_astro/vendor.js': renderer,
});

test('selected metadata-only covers are reachable in local and same-origin release subpath output without eager loading', async () => {
  for (const origin of ['', 'https://portfolio.test']) {
    const url = `${origin}/portfolio/_astro/cover.png`;
    const result = await analyzeOutputGraph({
      files: new Map(Object.entries({
        'vi/work/healthos/index.html': page(`<meta property="og:image" content="${url}"><meta name="twitter:image" content="${url}">${origin ? `<meta property="og:image:secure_url" content="${url}">` : ''}`),
        '_astro/cover.png': 'selected cover bytes',
      })),
      base: '/portfolio/',
      origins: origin ? [origin] : [],
      selectedMetadataImages: new Map([['vi/work/healthos/index.html', new Set(['_astro/cover.png'])]]),
    });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.metadataImages, ['_astro/cover.png']);
    assert.ok(result.reachableFiles.includes('_astro/cover.png'));
    assert.deepEqual(result.eagerFiles, []);
    assert.deepEqual(result.sceneAssets, []);
    assert.equal(result.budgets.sceneAssetBytes, 0);
    assert.equal(result.budgets.totalJsGzip, 0);
  }
});

test('metadata images fail for missing, wrong-base, external, private, non-image and unselected files', async () => {
  const file = 'vi/work/healthos/index.html';
  const cases = [
    { value: '/portfolio/_astro/missing.png', selected: '_astro/missing.png', expected: /Broken metadata image/ },
    { value: '/_astro/cover.png', selected: '_astro/cover.png', expected: /Broken metadata image/ },
    { value: 'https://elsewhere.test/portfolio/_astro/cover.png', selected: '_astro/cover.png', expected: /External or invalid metadata image/ },
    { value: '/portfolio/private/cover.png', selected: 'private/cover.png', expected: /Private or non-image metadata asset/ },
    { value: '/portfolio/_astro/other.png', selected: '_astro/cover.png', expected: /Unselected metadata image/ },
    { value: '/portfolio/_astro/data.json', selected: '_astro/data.json', expected: /Private or non-image metadata asset/ },
    { value: 'data:image/png;base64,AAAA', selected: '_astro/cover.png', expected: /External or invalid metadata image/ },
  ];
  for (const item of cases) {
    const result = await analyzeOutputGraph({
      files: new Map(Object.entries({
        [file]: page(`<link rel="canonical" href="https://elsewhere.test/portfolio/vi/work/healthos/"><meta property="og:image" content="${item.value}">`),
        '_astro/cover.png': 'selected cover',
        '_astro/other.png': 'unselected cover',
        'private/cover.png': 'private cover',
        '_astro/data.json': '{}',
      })),
      base: '/portfolio/',
      selectedMetadataImages: new Map([[file, new Set([item.selected])]]),
    });
    assert.ok(result.problems.some((problem: string) => item.expected.test(problem)), item.value);
    assert.deepEqual(result.metadataImages, [], item.value);
  }
});

test('metadata selection is page-specific and unrelated meta content cannot preserve an orphan asset', async () => {
  const result = await analyzeOutputGraph({
    files: new Map(Object.entries({
      'vi/work/healthos/index.html': page('<meta property="og:image" content="/_astro/warehouse.png"><meta name="description" content="/_astro/cover.png">'),
      '_astro/cover.png': 'healthos cover',
      '_astro/warehouse.png': 'warehouse cover',
    })),
    selectedMetadataImages: new Map([['vi/work/healthos/index.html', new Set(['_astro/cover.png'])]]),
  });
  assert.ok(result.problems.some((problem: string) => /Unselected metadata image/.test(problem)));
  assert.ok(result.problems.includes('Unlinked generated asset in output: _astro/cover.png'));
  assert.ok(result.problems.includes('Unlinked generated asset in output: _astro/warehouse.png'));
});

test('source selection joins public Work identity to case route and verifies cover bytes, localized alt and dimensions', () => {
  const selection = { projectId: 'healthos', bytes: 'approved original PNG', width: 1200, height: 630, alt: { vi: 'Bìa HealthOS', en: 'HealthOS cover' } };
  for (const site of [undefined, 'https://portfolio.test']) {
    const image = `${site || ''}/portfolio/_astro/opaque-hash.png`;
    const files = new Map(Object.entries({
      'vi/work/index.html': page('', '<main><article class="project-row" data-project-id="healthos"><h2><a href="/portfolio/vi/work/renamed-case/">Case</a></h2></article></main>'),
      'vi/work/renamed-case/index.html': page(`<meta property="og:image" data-share-project="healthos" content="${image}"><meta property="og:image:alt" content="Bìa HealthOS"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="Bìa HealthOS">`),
      '_astro/opaque-hash.png': selection.bytes,
    }));
    const accepted = selectMetadataImages({ files, selections: [selection], base: '/portfolio/', site });
    assert.deepEqual(accepted.problems, []);
    assert.deepEqual([...accepted.selectedMetadataImages.get('vi/work/renamed-case/index.html')], ['_astro/opaque-hash.png']);
    files.set('_astro/opaque-hash.png', 'same output name, wrong source bytes');
    const rejected = selectMetadataImages({ files, selections: [selection], base: '/portfolio/', site });
    assert.ok(rejected.problems.some((problem: string) => /unselected source cover/.test(problem)));
    assert.equal(rejected.selectedMetadataImages.size, 0);
  }
});

test('case cover selection rejects wrong identity, missing metadata, wrong alt/size and eager cover use', () => {
  const selection = { projectId: 'healthos', bytes: 'approved cover', width: 1200, height: 630, alt: { vi: 'Bìa HealthOS', en: 'HealthOS cover' } };
  const head = '<meta property="og:image" data-share-project="healthos" content="/_astro/cover.png"><meta property="og:image:alt" content="Bìa HealthOS"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="/_astro/cover.png"><meta name="twitter:image:alt" content="Bìa HealthOS">';
  for (const [markup, expected] of [
    [head.replace('data-share-project="healthos"', 'data-share-project="warehouse"'), /mismatched selected cover metadata/],
    ['', /Missing or mismatched selected cover metadata/],
    [head.replace('Bìa HealthOS', 'Wrong language'), /Wrong og:image:alt/],
    [head.replace('content="1200"', 'content="1"'), /Wrong og:image:width/],
    [head.replace('<meta name="twitter:image" content="/_astro/cover.png">', ''), /Expected one Twitter cover metadata/],
    [head + '<meta name="twitter:image" content="/_astro/cover.png">', /Expected one Twitter cover metadata/],
    [head.replace('<meta name="twitter:image:alt" content="Bìa HealthOS">', '<meta name="twitter:image:alt" content="Wrong alt">'), /Wrong twitter:image:alt/],
    [head + '<link rel="preload" as="image" href="/_astro/cover.png">', /metadata-only/],
  ] as const) {
    const result = selectMetadataImages({
      files: new Map(Object.entries({
        'vi/work/index.html': page('', '<main><article class="project-row" data-project-id="healthos"><h3><a href="/vi/work/healthos/">Case</a></h3></article></main>'),
        'vi/work/healthos/index.html': page(markup),
        '_astro/cover.png': selection.bytes,
      })), selections: [selection],
    });
    assert.ok(result.problems.some((problem: string) => expected.test(problem)), String(expected));
  }
});

test('every metadata image tag follows configured release origin and local/release URL form', async () => {
  const file = 'vi/work/healthos/index.html';
  for (const [site, extra, expected] of [
    ['https://portfolio.test', '<meta name="twitter:image" content="http://localhost:4321/portfolio/_astro/cover.png">', /External or invalid metadata image/],
    ['https://portfolio.test', '<meta name="twitter:image" content="http://127.0.0.1:4321/portfolio/_astro/cover.png">', /External or invalid metadata image/],
    ['https://portfolio.test', '<meta name="twitter:image" content="/portfolio/_astro/cover.png">', /External or invalid metadata image|Wrong local\/release metadata image URL form/],
    ['', '<meta name="twitter:image" content="http://localhost:4321/portfolio/_astro/cover.png">', /Wrong local\/release metadata image URL form/],
    ['https://portfolio.test', '<meta property="og:image:secure_url" content="https://elsewhere.test/portfolio/_astro/cover.png">', /External or invalid metadata image/],
  ] as const) {
    const result = await analyzeOutputGraph({
      files: new Map(Object.entries({ [file]: page(`<meta property="og:image" content="${site}/portfolio/_astro/cover.png">${extra}`), '_astro/cover.png': 'selected bytes' })),
      base: '/portfolio/', origins: site ? [site] : [], selectedMetadataImages: new Map([[file, new Set(['_astro/cover.png'])]]),
    });
    assert.ok(result.problems.some((problem: string) => expected.test(problem)), extra);
  }
});

test('dynamic scene static closure passes while each output module is charged once', async () => {
  const result = await analyze(sceneFiles('export const start = () => import(/* lazy */ `./scene.js`);'));
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.eagerFiles, ['_astro/core.js']);
  assert.deepEqual(result.dynamicFiles, ['_astro/scene.js', '_astro/vendor.js']);
  assert.ok(result.budgets.coreJsGzip < 20 * 1024);
  assert.ok(result.budgets.sceneJsGzip > 20 * 1024);
  assert.equal(result.budgets.totalJsGzip, result.budgets.coreJsGzip + result.budgets.sceneJsGzip);
});

test('static Three leakage through a shared layout fails the eager budget', async () => {
  const result = await analyze(sceneFiles('import "./scene.js";'));
  assert.ok(result.problems.some((problem: string) => /Core JavaScript budget exceeded/.test(problem)));
  assert.deepEqual(result.dynamicFiles, []);
  assert.ok(result.eagerFiles.includes('_astro/vendor.js'));
});

test('re-exports, side-effect imports and preload closures cannot hide eager dependencies', async () => {
  for (const head of [
    '<script type="module" src="/_astro/core.js"></script><link rel="modulepreload" href="/_astro/scene.js">',
    '<script type="module" src="/_astro/core.js"></script><link rel="preload" as="script" href="/_astro/scene.js">',
  ]) {
    const result = await analyze(sceneFiles('export const start = () => import("./scene.js");', head));
    assert.ok(result.problems.some((problem: string) => /Core JavaScript budget exceeded/.test(problem)));
  }
  const result = await analyze(sceneFiles('export {payload} from "./vendor.js"; export const start = () => import("./scene.js");'));
  assert.ok(result.eagerFiles.includes('_astro/vendor.js'));
  assert.equal(result.dynamicFiles.filter((file: string) => file === '_astro/vendor.js').length, 0);
  assert.equal(result.budgets.totalJsGzip, result.budgets.coreJsGzip + result.budgets.sceneJsGzip);
});

test('broken dynamic imports fail, including query strings and URL encoded paths', async () => {
  const result = await analyze({ 'index.html': page('<script type="module">import("/_astro/missing%20scene.js?v=2")</script>') });
  assert.ok(result.problems.some((problem: string) => /Broken dynamic import.*missing%20scene/.test(problem)));
});

test('unreferenced generated assets and isolated import cycles fail reachability', async () => {
  const result = await analyze({
    'index.html': page(),
    '_astro/unselected.webp': 'unselected image',
    '_astro/a.js': 'import "./b.js";',
    '_astro/b.js': 'import "./a.js";',
  });
  for (const name of ['unselected.webp', 'a.js', 'b.js']) {
    assert.ok(result.problems.some((problem: string) => problem === `Unlinked generated asset in output: _astro/${name}`));
  }
  assert.ok(result.budgets.totalJsGzip > 0, 'Orphan JavaScript still counts in the unique output total');
});

test('/portfolio/ resolves inline entries, dynamic chunks, CSS and scene assets', async () => {
  const result = await analyze({
    'vi/index.html': page('<script type="module">import "/portfolio/_astro/core.js";</script><link rel="stylesheet" href="/portfolio/_astro/main.css">', '<img data-stage-asset src="/portfolio/_astro/poster.svg">'),
    '_astro/core.js': 'export const start = () => import("./scene.js?v=1");',
    '_astro/scene.js': 'import "./vendor.js"; const texture = new URL("./texture.webp", import.meta.url);',
    '_astro/vendor.js': renderer,
    '_astro/main.css': '@font-face{src:url("../fonts/public.woff2")}',
    '_astro/poster.svg': '<svg/>',
    '_astro/texture.webp': 'scene texture',
    'fonts/public.woff2': 'public font',
  }, '/portfolio/');
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.dynamicFiles, ['_astro/scene.js', '_astro/vendor.js']);
  assert.equal(result.budgets.sceneAssetBytes, Buffer.byteLength('<svg/>scene texture'));
  assert.ok(result.reachableFiles.includes('fonts/public.woff2'));
});

test('root-absolute import outside a configured subpath is broken', async () => {
  const result = await analyze({ 'index.html': page('<script type="module" src="/_astro/core.js"></script>'), '_astro/core.js': 'console.log(1);' }, '/portfolio/');
  assert.ok(result.problems.some((problem: string) => /Broken script/.test(problem)));
});

test('unique inline scripts count in core and total while repeated page scripts are deduplicated', async () => {
  const result = await analyze({
    'index.html': page(`<script type="module">${renderer}</script><script type="application/ld+json">{"name":"data"}</script>`),
    'vi/index.html': page(`<script type="module">${renderer}</script>`),
  });
  assert.equal(result.budgets.inlineJsGzip, gzipSync(Buffer.from(renderer)).length);
  assert.equal(result.budgets.totalJsGzip, result.budgets.inlineJsGzip);
  assert.ok(result.problems.some((problem: string) => /Core JavaScript budget exceeded/.test(problem)));
});

test('comments and strings that resemble imports do not pull a module into core', async () => {
  const result = await analyze(sceneFiles('// import "./vendor.js";\nconst example = \'import "./vendor.js"\'; export const start = () => import("./scene.js");'));
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.eagerFiles, ['_astro/core.js']);
});

test('regular expressions are not mistaken for asset strings and relative script URLs work', async () => {
  const result = await analyze({
    'index.html': page('<script type="module" src="_astro/core.js"></script>'),
    '_astro/core.js': 'const pattern = /".\\/missing.webp"/; console.log(pattern);',
  });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.eagerFiles, ['_astro/core.js']);
});

test('inline handler imports contribute their reachable scene and executable inline bytes', async () => {
  const result = await analyze({
    'index.html': page('', '<button onclick="import(\'/_astro/scene.js\')">Start</button>'),
    '_astro/scene.js': 'console.log("ready")',
  });
  assert.deepEqual(result.problems, []);
  assert.ok(result.budgets.inlineJsGzip > 0);
  assert.deepEqual(result.dynamicFiles, ['_astro/scene.js']);
});

test('unresolved dynamic imports and remote scripts fail closed for measurable budgets', async () => {
  const result = await analyze({ 'index.html': page('<script src="https://cdn.example.test/core.js"></script><script type="module">import(window.sceneUrl)</script>') });
  assert.ok(result.problems.some((problem: string) => /Unmeasured external script/.test(problem)));
  assert.ok(result.problems.some((problem: string) => /Unresolved dynamic import/.test(problem)));
});

test('scene assets and optional JavaScript enforce their independent caps', async () => {
  const result = await analyze({
    'index.html': page('<script type="module">import("/_astro/scene.js")</script>', `<img data-stage-poster src="/_astro/poster.svg">`),
    '_astro/scene.js': opaqueModule(9000),
    '_astro/poster.svg': 'x'.repeat(251 * 1024),
  });
  assert.ok(result.problems.some((problem: string) => /Scene JavaScript budget exceeded/.test(problem)));
  assert.ok(result.problems.some((problem: string) => /Total JavaScript budget exceeded/.test(problem)));
  assert.ok(result.problems.some((problem: string) => /Scene asset budget exceeded/.test(problem)));
});

test('inline SVG posters count as scene assets once across localized Home aliases', async () => {
  const poster = `<svg data-stage-poster=""><text>${'x'.repeat(251 * 1024)}</text></svg>`;
  const result = await analyze({
    'index.html': page('', poster),
    'vi/index.html': page('', poster),
    'en/index.html': page('', poster),
  });
  assert.equal(result.budgets.inlineSceneAssetBytes, Buffer.byteLength(poster));
  assert.equal(result.budgets.sceneAssetBytes, result.budgets.inlineSceneAssetBytes);
  assert.equal(result.budgets.externalSceneAssetBytes, 0);
  assert.ok(result.problems.some((problem: string) => /Scene asset budget exceeded/.test(problem)));
});
