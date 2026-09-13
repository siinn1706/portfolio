import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog } from '../src/lib/catalog';
import type { CatalogInput } from '../src/lib/catalog';
import type { AuthoredProjectFacts, ProjectProse, NoteFacts, NoteProse, Photo } from '../src/data/types';
import { hasNonPublicCopy } from '../src/lib/public-copy';
import { validateCv } from '../src/lib/validate-cv';
import path from 'node:path';

function project(overrides: Partial<AuthoredProjectFacts> = {}): AuthoredProjectFacts {
  return { projectId: 'sample', routeSlug: 'sample', kind: 'project', domain: 'web', repository: 'https://github.com/example/sample', verifiedStack: ['TypeScript'], contributionSource: 'author-confirmed', workStatus: 'unknown', order: 1, topicIds: [], evidence: [], mediaIds: [], heroMediaId: null, publication: { publishIntent: 'publish', publicSelected: true }, ...overrides };
}
function prose(projectId = 'sample'): ProjectProse[] {
  return (['vi', 'en'] as const).map(locale => ({ projectId, locale, title: 'Sample project', summary: 'A content-contract example.', contributionText: 'Interface development.', seoDescription: 'A test of public content contracts.', context: 'A local example.', decisionSummary: 'Typed data and static content.' }));
}
function input(): CatalogInput { return { projects: [project()], projectProse: prose() }; }
const note: NoteFacts = { noteId: 'sample-note', routeSlug: 'sample', topicIds: [], sources: ['https://docs.astro.build/'], publication: { publishIntent: 'publish', publicSelected: true } };
const noteProse: NoteProse[] = (['vi', 'en'] as const).map(locale => ({ noteId: note.noteId, locale, title: 'A note', summary: 'An isolated note example.', seoDescription: 'A note template example.' }));
const photo: Photo = { photoId: 'sample-photo', mediaId: 'sample-media', width: 100, height: 80, rights: 'author-owned', title: { vi: 'Ảnh thử', en: 'Test image' }, alt: { vi: 'Hình chữ nhật thử nghiệm', en: 'A test rectangle' }, caption: { vi: 'Chỉ dùng kiểm thử', en: 'Only for tests' }, publication: { publishIntent: 'publish', publicSelected: true } };

test('public bilingual entry joins by ID, permits a text-only case, and preserves order', () => {
  const fixture = input();
  fixture.projects.push(project({ projectId: 'first', routeSlug: 'first', order: 0 }));
  fixture.projectProse.push(...prose('first'));
  const result = buildCatalog(fixture);
  assert.deepEqual(result.projects.map(entry => entry.projectId), ['first', 'sample']);
  assert.equal(result.projects[1].prose.en.projectId, 'sample');
  assert.equal(result.projects[1].heroMediaId, null);
  assert.deepEqual(result.projects[1].mediaIds, []);
});

test('draft may lack English and never enters public projection', () => {
  assert.deepEqual(buildCatalog({ projects: [project({ publication: { publishIntent: 'draft', publicSelected: false } })], projectProse: [prose()[0]] }), { projects: [], notes: [], photos: [], relations: [], topics: [] });
});

test('publishing with a missing translation fails clearly', () => {
  assert.throws(() => buildCatalog({ projects: [project()], projectProse: [prose()[0]] }), /sample\.en.*both locales/);
});

test('publishing requires explicit public selection', () => {
  const fixture = input();
  fixture.projects = [project({ publication: { publishIntent: 'publish', publicSelected: false } })];
  assert.throws(() => buildCatalog(fixture), /publicSelected/);
});

test('duplicate composite identity, facts ID and route slug fail', () => {
  const duplicateLocale = input(); duplicateLocale.projectProse.push(prose()[0]);
  assert.throws(() => buildCatalog(duplicateLocale), /projectProse.locale.*duplicate/);
  const duplicateId = input(); duplicateId.projects.push(project({ routeSlug: 'another' }));
  assert.throws(() => buildCatalog(duplicateId), /projectId.*duplicate/);
  const duplicateRoute = input(); duplicateRoute.projects.push(project({ projectId: 'another' }));
  assert.throws(() => buildCatalog(duplicateRoute), /routeSlug.*duplicate/);
});

test('route slug does not replace composite identity and work/note namespaces are independent', () => {
  const fixture = { ...input(), notes: [note], noteProse };
  fixture.projectProse = prose().map(item => ({ ...item, slug: 'overwrite-entry-id' }));
  const result = buildCatalog(fixture);
  assert.equal(result.projects[0].prose.vi.projectId, 'sample');
  assert.equal(result.projects[0].prose.en.locale, 'en');
  assert.equal(result.notes[0].routeSlug, result.projects[0].routeSlug);
  assert.ok(!('slug' in result.projects[0].prose.vi));
});

test('unknown locale, unsafe route, orphan prose and empty public copy fail', () => {
  assert.throws(() => buildCatalog({ projects: [project()], projectProse: [{ ...prose()[0], locale: 'fr' }] }), /locale/);
  assert.throws(() => buildCatalog({ projects: [project({ routeSlug: '../private' })], projectProse: prose() }), /routeSlug/);
  assert.throws(() => buildCatalog({ projects: [], projectProse: prose() }), /missing project facts/);
  assert.throws(() => buildCatalog({ projects: [project()], projectProse: prose().map(item => ({ ...item, contributionText: ' ' })) }), /contributionText/);
});

test('declared missing media and files fail; genuine file presence passes', () => {
  const fixture = { ...input(), projects: [project({ mediaIds: ['sample-media'], heroMediaId: 'sample-media' })] };
  assert.throws(() => buildCatalog(fixture), /missing declared media/);
  assert.throws(() => buildCatalog({ ...fixture, mediaIds: ['sample-media'], mediaFiles: { 'sample-media': ['missing.webp'] }, fileExists: () => false }), /missing declared file missing.webp/);
  assert.equal(buildCatalog({ ...fixture, mediaIds: ['sample-media'], mediaFiles: { 'sample-media': ['present.webp'] }, fileExists: file => file === 'present.webp' }).projects.length, 1);
});

test('evidence-only media references and duplicate evidence IDs are validated', () => {
  const evidence = { evidenceId: 'evidence', type: 'source' as const, sourceUrl: 'https://github.com/example/sample', scope: { vi: 'Mã nguồn', en: 'Source' }, limitations: { vi: [], en: [] }, mediaId: 'missing' };
  assert.throws(() => buildCatalog({ projects: [project({ evidence: [evidence] })], projectProse: prose() }), /missing declared media missing/);
  assert.throws(() => buildCatalog({ projects: [project({ evidence: [evidence, evidence] })], projectProse: prose() }), /evidence.*duplicate/);
});

test('public projection strips unknown fields recursively rather than serializing editor data', () => {
  const fixture = input();
  fixture.projects = [{ ...project(), editorMemo: 'EDITOR_ONLY_SENTINEL', approvalLog: 'PRIVATE_SENTINEL', publication: { publishIntent: 'publish', publicSelected: true, rawApproval: 'PRIVATE_SENTINEL' } }];
  fixture.projectProse = prose().map(item => ({ ...item, privateComment: 'EDITOR_ONLY_SENTINEL' }));
  const result = buildCatalog(fixture);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SENTINEL|editorMemo|approvalLog|publication|contributionSource/);
});

test('unresolved templates and editor-only sentinels in selected copy block publication', () => {
  for (const value of ['{{PROJECT_NAME}}', '${AUTHOR_NAME}', '{projectTitle}', '{noteSummary}', 'EDITOR_ONLY_SENTINEL', 'FIXTURE_SENTINEL']) {
    assert.throws(() => buildCatalog({ projects: [project()], projectProse: prose().map(item => ({ ...item, title: value })) }), /non-public copy/);
  }
});

test('optional catalog transitions zero to one only with complete selected content', () => {
  assert.deepEqual(buildCatalog(input()).notes, []);
  assert.deepEqual(buildCatalog(input()).photos, []);
  const result = buildCatalog({ ...input(), notes: [note], noteProse, photos: [photo], photoMedia: { 'sample-media': { width: 100, height: 80 } } });
  assert.equal(result.notes.length, 1); assert.equal(result.photos.length, 1);
  assert.ok(!('publication' in result.notes[0])); assert.ok(!('publication' in result.photos[0]));
  assert.throws(() => buildCatalog({ ...input(), notes: [note], noteProse: [noteProse[0]] }), /both locales/);
  assert.throws(() => buildCatalog({ ...input(), photos: [{ ...photo, alt: { vi: 'Ảnh thử' } }], mediaIds: ['sample-media'] }), /alt/);
  assert.throws(() => buildCatalog({ ...input(), photos: [photo] }), /missing declared photography media/);
});

test('notes validate their own duplicate route, orphan locale and date contracts', () => {
  assert.throws(() => buildCatalog({ ...input(), notes: [note, { ...note, noteId: 'other' }], noteProse }), /notes.routeSlug/);
  assert.throws(() => buildCatalog({ ...input(), noteProse }), /missing note facts/);
  assert.throws(() => buildCatalog({ ...input(), notes: [{ ...note, publishedAt: 'yesterday' }], noteProse }), /publishedAt/);
});

test('Markdown editorial variables are blocked in prose while real code braces remain usable', () => {
  for (const token of ['{count}', '{date}', '{index}', '{language}', '{minutes}', '{noteSummary}', '{noteTitle}', '{projectTitle}', '{total}']) assert.equal(hasNonPublicCopy(`A paragraph with ${token}.`, true), true, token);
  assert.equal(hasNonPublicCopy('Example: `const { count } = data;`\n\n```js\nconst value = `${name}`;\nconst label = "{count}";\n```', true), false);
  for (const marker of ['PRIVATE_SENTINEL', 'DRAFT_SENTINEL', 'FIXTURE_SENTINEL', 'EDITOR_ONLY']) assert.equal(hasNonPublicCopy(`\`\`\`js\nconst secret = '${marker}';\n\`\`\``, true), true);
});

test('an incomplete draft photograph stays private and cannot be published until both locales exist', () => {
  const draft = { ...photo, title: { vi: photo.title.vi }, alt: { vi: photo.alt.vi }, caption: { vi: photo.caption.vi }, publication: { publishIntent: 'draft', publicSelected: false } };
  assert.deepEqual(buildCatalog({ ...input(), photos: [draft] }).photos, []);
  assert.throws(() => buildCatalog({ ...input(), photos: [{ ...draft, publication: { publishIntent: 'publish', publicSelected: true } }], mediaIds: ['sample-media'] }), /en|title|alt|caption/);
});

test('selected project and note topics must reference known topic IDs', () => {
  assert.throws(() => buildCatalog({ ...input(), projects: [project({ topicIds: ['unknown'] })], topicIds: ['systems'] }), /missing topic reference unknown/);
  assert.throws(() => buildCatalog({ ...input(), notes: [{ ...note, topicIds: ['unknown'] }], noteProse, topicIds: [] }), /missing topic reference unknown/);
  assert.equal(buildCatalog({ ...input(), projects: [project({ topicIds: ['systems'] })], topicIds: ['systems'] }).projects.length, 1);
});

test('CV links require a real contained file and an explicit supported document language', () => {
  assert.doesNotThrow(() => validateCv(null));
  assert.throws(() => validateCv({ en: { file: 'cv/missing.pdf', documentLanguage: 'en' } }, () => false), /missing declared file/);
  for (const file of ['../private.pdf', 'cv/../../private.pdf', 'C:\\private.pdf', 'https://example.org/cv.pdf']) assert.throws(() => validateCv({ vi: { file, documentLanguage: 'vi' } }, () => true), /path|relative/);
  assert.throws(() => validateCv({ en: { file: 'cv/review.pdf', documentLanguage: 'fr' as 'en' } }, () => true), /unsupported document language/);
  const expected = path.resolve('public/cv/review.pdf');
  assert.doesNotThrow(() => validateCv({ en: { file: 'cv/review.pdf', documentLanguage: 'vi' } }, file => file === expected));
});
