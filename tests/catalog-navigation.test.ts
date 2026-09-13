import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog, type CatalogInput } from '../src/lib/catalog';
import { getFeaturedProjects, getNextProject, getRelatedContent, getPublicTopics } from '../src/lib/catalog-navigation';
import type { AuthoredProjectFacts, LabFacts, ProjectProse, NoteProse, Topic, ContentRelation } from '../src/data/types';

const pair = (text: string) => ({ vi: text, en: text });
function project(id: string, order: number, rank?: number): AuthoredProjectFacts {
  return { projectId: id, routeSlug: id, kind: 'project', repository: `https://github.com/example/${id}`, domain: 'web', verifiedStack: [], contributionSource: 'author-confirmed', workStatus: 'unknown', order, ...(rank ? { homeFeatureRank: rank } : {}), topicIds: [], evidence: [], mediaIds: [], heroMediaId: null, publication: { publishIntent: 'publish', publicSelected: true } };
}
function prose(projectId: string): ProjectProse[] {
  return (['vi', 'en'] as const).map(locale => ({ projectId, locale, title: projectId, summary: 'A documented application example.', contributionText: 'Interface development and backend collaboration.', seoDescription: 'A content navigation example.', context: 'An isolated example.', decisionSummary: 'A documented source analysis.' }));
}
function input(): CatalogInput {
  return { projects: [project('a', 1, 2), project('b', 2, 1), project('c', 3)], projectProse: ['a', 'b', 'c'].flatMap(prose) };
}
function lab(): LabFacts {
  return { projectId: 'readiness', routeSlug: 'readiness', kind: 'lab', repository: null, domain: 'systems', verifiedStack: ['Docker Compose'], workStatus: 'completed', order: 3, topicIds: [], mediaIds: [], heroMediaId: null, publication: { publishIntent: 'publish', publicSelected: true }, provenance: {
    preparedBy: pair('Assistant'), performedBy: pair('Assistant'), reviewStatus: 'not-reviewed-by-nam', observedAt: '2026-09-10', environment: pair('Isolated fixture'), limitations: { vi: ['Fixture only'], en: ['Fixture only'] },
  }, evidence: [{ evidenceId: 'local-run', type: 'local-observation', recordId: 'run-one', actor: pair('Assistant'), observedAt: '2026-09-10', environment: pair('Isolated fixture'), scope: pair('A test of the record format.'), limitations: { vi: ['Fixture only'], en: ['Fixture only'] } }] };
}

test('Home rank chooses only ranked public entries while full catalog and ordered next remain independent', () => {
  const catalog = buildCatalog(input());
  assert.deepEqual(catalog.projects.map(p => p.projectId), ['a', 'b', 'c']);
  assert.deepEqual(getFeaturedProjects(catalog).map(p => p.projectId), ['b', 'a']);
  assert.deepEqual(['a', 'b', 'c'].map(id => getNextProject(catalog, id)?.projectId), ['b', 'c', 'a']);
  assert.equal(getNextProject(catalog, 'absent'), undefined);
});

test('zero/one/full catalog with zero features has no empty or self next selection', () => {
  const empty = buildCatalog({ projects: [], projectProse: [] });
  assert.deepEqual(getFeaturedProjects(empty), []);
  assert.equal(getNextProject(empty, 'a'), undefined);
  const one = buildCatalog({ projects: [project('a', 1)], projectProse: prose('a') });
  assert.deepEqual(getFeaturedProjects(one), []);
  assert.equal(getNextProject(one, 'a'), undefined);
});

test('order ties use project ID and duplicate/invalid/excess public ranks fail', () => {
  const fixture = input();
  fixture.projects = [project('c', 1, 3), project('b', 1, 2), project('a', 1, 1)];
  assert.deepEqual(buildCatalog(fixture).projects.map(p => p.projectId), ['a', 'b', 'c']);
  assert.equal(getFeaturedProjects(buildCatalog(fixture)).length, 3);
  assert.throws(() => buildCatalog({ ...fixture, projects: [project('a', 1, 1), project('b', 2, 1)], projectProse: ['a', 'b'].flatMap(prose) }), /homeFeatureRank.*duplicate/);
  for (const rank of [0, -1, 1.5]) assert.throws(() => buildCatalog({ projects: [{ ...project('a', 1), homeFeatureRank: rank }], projectProse: prose('a') }), /homeFeatureRank/);
  assert.throws(() => buildCatalog({ projects: ['a', 'b', 'c', 'd'].map((id, i) => project(id, i, i + 1)), projectProse: ['a', 'b', 'c', 'd'].flatMap(prose) }), /at most three/);
});

test('draft rank has no effect on the public feature set', () => {
  const fixture = input();
  fixture.projects.push({ ...project('private', 0, 1), publication: { publishIntent: 'draft', publicSelected: false } });
  assert.deepEqual(getFeaturedProjects(buildCatalog(fixture)).map(p => p.projectId), ['b', 'a']);
});

test('lab accepts null repository and local observations but projects retain URL/ownership/source requirements', () => {
  const result = buildCatalog({ projects: [lab()], projectProse: prose('readiness') });
  assert.equal(result.projects[0].repository, null);
  assert.equal(result.projects[0].kind, 'lab');
  assert.equal(result.projects[0].evidence[0].type, 'local-observation');
  assert.throws(() => buildCatalog({ projects: [{ ...project('a', 1), repository: null }], projectProse: prose('a') }), /repository/);
  assert.throws(() => buildCatalog({ projects: [{ ...project('a', 1), contributionSource: 'assistant' }], projectProse: prose('a') }), /contributionSource/);
  assert.throws(() => buildCatalog({ projects: [{ ...project('a', 1), evidence: lab().evidence }], projectProse: prose('a') }), /sourceUrl|type/);
  assert.throws(() => buildCatalog({ projects: [{ ...lab(), provenance: undefined }], projectProse: prose('readiness') }), /provenance/);
  assert.throws(() => buildCatalog({ projects: [{ ...lab(), evidence: [{ ...lab().evidence[0], actor: undefined }] }], projectProse: prose('readiness') }), /actor/);
});

test('explicit public lab projection strips nested private provenance and local paths', () => {
  const item = lab();
  const catalog = buildCatalog({ projects: [{ ...item, privateRunManifest: 'PRIVATE_SENTINEL', provenance: { ...item.provenance, rawPath: 'C:/private/PRIVATE_SENTINEL' }, evidence: item.evidence.map(e => ({ ...e, rawLogs: 'PRIVATE_SENTINEL', recordPath: 'C:/private/run.log' })) }], projectProse: prose('readiness') });
  assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE_SENTINEL|rawPath|rawLogs|recordPath|C:\//);
  assert.match(JSON.stringify(catalog), /run-one|Assistant/);
});

const relation: ContentRelation = { from: { kind: 'project', id: 'a' }, to: { kind: 'note', id: 'source-note' }, reason: pair('Explains the same source question.') };
function relatedInput(): CatalogInput {
  const note = { noteId: 'source-note', routeSlug: 'source-note', topicIds: [], sources: [], publication: { publishIntent: 'publish', publicSelected: true } };
  const noteProse: NoteProse[] = (['vi', 'en'] as const).map(locale => ({ noteId: 'source-note', locale, title: 'A source note', summary: 'Source reading only.', seoDescription: 'A source analysis.' }));
  return { ...input(), notes: [note], noteProse, relations: [relation] };
}
test('one explicit edge resolves both directions and preserves locale/base', () => {
  const catalog = buildCatalog(relatedInput());
  const fromProject = getRelatedContent(catalog, { kind: 'project', id: 'a' }, 'vi', '/portfolio/');
  assert.equal(fromProject[0].href, '/portfolio/vi/notes/source-note/');
  assert.equal(fromProject[0].reason, relation.reason.vi);
  assert.equal(getRelatedContent(catalog, { kind: 'note', id: 'source-note' }, 'en')[0].href, '/en/work/a/');
});
test('draft endpoints disappear from relations without titles or hrefs', () => {
  const fixture = relatedInput();
  fixture.notes = [{ ...(fixture.notes![0] as object), publication: { publishIntent: 'draft', publicSelected: false } }];
  const catalog = buildCatalog(fixture);
  assert.deepEqual(catalog.relations, []);
  assert.deepEqual(getRelatedContent(catalog, { kind: 'project', id: 'a' }, 'en'), []);
  assert.deepEqual(getRelatedContent(catalog, { kind: 'note', id: 'source-note' }, 'en'), []);
});
test('self, reverse duplicate, dangling and wrong-kind relation endpoints fail', () => {
  const fixture = relatedInput();
  assert.throws(() => buildCatalog({ ...fixture, relations: [{ ...relation, to: relation.from }] }), /self-edge/);
  assert.throws(() => buildCatalog({ ...fixture, relations: [relation, { ...relation, from: relation.to, to: relation.from }] }), /duplicate edge/);
  assert.throws(() => buildCatalog({ ...fixture, relations: [{ ...relation, to: { kind: 'note', id: 'missing' } }] }), /missing content reference/);
  assert.throws(() => buildCatalog({ ...fixture, relations: [{ ...relation, from: { kind: 'lab', id: 'a' } }] }), /missing content reference/);
});

const topic: Topic = { topicId: 'interfaces', labels: pair('Interfaces'), description: pair('Interface development in an application project.'), category: 'foundation', status: 'applied-with-evidence', evidenceRef: { target: { kind: 'project', id: 'a' }, fragment: pair('my-contribution'), label: pair('Confirmed contribution') } };
test('topic reference resolves to actual public contribution, withdrawal removes link and applied status', () => {
  const fixture = { ...input(), topics: [topic] };
  const live = getPublicTopics(buildCatalog(fixture), 'en', '/portfolio/');
  assert.equal(live[0].evidence?.href, '/portfolio/en/work/a/#my-contribution');
  assert.equal(live[0].status, 'applied-with-evidence');
  fixture.projects = fixture.projects.map((p, index) => index === 0 ? { ...(p as object), publication: { publishIntent: 'draft', publicSelected: false } } : p);
  const withdrawn = getPublicTopics(buildCatalog(fixture), 'en');
  assert.equal(withdrawn[0].evidence, undefined);
  assert.equal(withdrawn[0].status, 'self-reported');
  assert.equal(withdrawn[0].description.en, topic.description.en);
});
test('invalid topic refs and assistant-only lab applied claims fail rather than asserting experience', () => {
  assert.throws(() => buildCatalog({ ...input(), topics: [{ ...topic, evidenceRef: { ...topic.evidenceRef, target: { kind: 'project', id: 'missing' } } }] }), /missing content reference/);
  assert.throws(() => buildCatalog({ projects: [lab()], projectProse: prose('readiness'), topics: [{ ...topic, evidenceRef: { ...topic.evidenceRef, target: { kind: 'lab', id: 'readiness' } } }] }), /assistant-run lab/);
  assert.deepEqual(buildCatalog({ projects: [], projectProse: [] }).topics, []);
  assert.deepEqual(buildCatalog({ projects: [], projectProse: [] }).relations, []);
});

const photo = { photoId: 'image', mediaId: 'authored-image', width: 900, height: 600, rights: 'author-owned', title: pair('Image'), alt: pair('A geometric test image'), caption: pair('A fixture image.'), publication: { publishIntent: 'publish', publicSelected: true } };
test('Photography validates authored registry dimensions/files and cannot reuse project evidence registry', () => {
  const fixture = { projects: [], projectProse: [], photos: [photo] };
  assert.throws(() => buildCatalog({ ...fixture, mediaIds: ['authored-image'] }), /missing declared photography media/);
  assert.throws(() => buildCatalog({ ...fixture, photoMedia: { 'authored-image': { width: 100, height: 100 } } }), /dimensions/);
  assert.throws(() => buildCatalog({ ...fixture, photoMedia: { 'authored-image': { width: 900, height: 600, files: ['missing.svg'] } }, fileExists: () => false }), /missing declared file/);
  assert.equal(buildCatalog({ ...fixture, photoMedia: { 'authored-image': { width: 900, height: 600, files: ['image.svg'] } }, fileExists: () => true }).photos.length, 1);
  assert.throws(() => buildCatalog({ ...fixture, photos: [{ ...photo, rights: 'unknown' }] }), /rights/);
  assert.throws(() => buildCatalog({ ...fixture, photos: [{ ...photo, alt: { vi: 'Ảnh' } }], photoMedia: { 'authored-image': { width: 900, height: 600 } } }), /en/);
});
