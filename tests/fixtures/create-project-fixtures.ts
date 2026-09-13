// These scenarios deliberately use the original two projects. New production
// entries must not silently change their zero/one/three-item contracts.
import { mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { projects } from '../../src/data/projects.ts';
import { topics } from '../../src/data/topics.ts';

const fixtureProjects = ['healthos', 'quan-ly-kho'].map(id => {
  const project = projects.find(item => item.projectId === id);
  if (!project) throw new Error(`Missing fixture source project: ${id}`);
  return project;
});
const warehouseOnly = structuredClone(fixtureProjects);
warehouseOnly[0].publication = { publishIntent: 'draft', publicSelected: false };
const reversed = structuredClone(fixtureProjects).map((project, index) => ({ ...project, order: fixtureProjects.length - index }));
const textProject = { projectId: 'healthos-title', routeSlug: 'healthos-title', kind: 'lab', domain: 'systems', repository: null, verifiedStack: ['TypeScript'], provenance: { preparedBy: { vi: 'Tác nhân kiểm thử', en: 'Test actor' }, performedBy: { vi: 'Tác nhân kiểm thử', en: 'Test actor' }, reviewStatus: 'not-reviewed-by-nam', observedAt: '2026-09-10', environment: { vi: 'Môi trường fixture cô lập', en: 'Isolated fixture environment' }, limitations: { vi: ['Dữ liệu chỉ dùng kiểm thử template.'], en: ['Data used only for template tests.'] } }, workStatus: 'unknown', order: 3, topicIds: [], evidence: [{ evidenceId: 'fixture-observation', type: 'local-observation', recordId: 'fixture-run', observedAt: '2026-09-10', actor: { vi: 'Tác nhân kiểm thử', en: 'Test actor' }, environment: { vi: 'Môi trường fixture cô lập', en: 'Isolated fixture environment' }, scope: { vi: 'Định dạng bản ghi kiểm thử', en: 'Test record shape' }, limitations: { vi: [], en: [] }, privateRunPath: 'PRIVATE_SENTINEL' }], mediaIds: [], heroMediaId: null, publication: { publishIntent: 'publish', publicSelected: true }, privateRunManifest: 'PRIVATE_SENTINEL' };
const draft = { ...textProject, projectId: 'private-study', routeSlug: 'private-study', order: 4, mediaIds: ['private-study-image'], publication: { publishIntent: 'draft', publicSelected: false }, editorMemo: 'EDITOR_ONLY_SENTINEL' };
const negative = structuredClone(fixtureProjects);
negative[0].publication.publicSelected = false;
const cases = {
  'warehouse-only': warehouseOnly,
  reversed,
  many: [...fixtureProjects, textProject],
  'many-featured': [...fixtureProjects, { ...textProject, homeFeatureRank: 3 }],
  'no-featured': structuredClone(fixtureProjects).map(project => ({ ...project, homeFeatureRank: undefined })),
  'selected-set': [...warehouseOnly, draft],
  'publish-unselected': negative,
};
for (const [name, facts] of Object.entries(cases)) {
  const directory = path.resolve('tests/fixtures/content', name);
  await mkdir(directory, { recursive: true });
  const referencedTopics = new Set(facts.flatMap(project => project.topicIds));
  const fixtureTopics = topics.filter(topic => referencedTopics.has(topic.topicId)).map(({ evidenceRef, ...topic }) => ({ ...topic, status: topic.status === 'applied-with-evidence' ? 'self-reported' : topic.status }));
  await writeFile(path.join(directory, 'facts.json'), `${JSON.stringify({ projects: facts, notes: [], photos: [], relations: [], topics: fixtureTopics }, null, 2)}\n`);
  // Each facts snapshot owns exactly its paired project prose, so later
  // production content cannot enter through the loader's fallback directory.
  for (const locale of ['vi', 'en']) {
    await mkdir(path.join(directory, 'projects', locale), { recursive: true });
    for (const project of fixtureProjects) {
      await cp(path.join('src/content/projects', locale, `${project.projectId}.md`), path.join(directory, 'projects', locale, `${project.projectId}.md`));
    }
  }
  if (name === 'many' || name === 'many-featured' || name === 'selected-set') {
    const id = name === 'selected-set' ? draft.projectId : textProject.projectId;
    for (const locale of ['vi', 'en']) {
      const title = locale === 'vi' ? 'Sổ tay hệ thống và những thử nghiệm mạng với một tên dự án dài' : 'A systems notebook and networking experiments with an intentionally long project name';
      const metadata = { projectId: id, locale, title, summary: 'An isolated text-only catalog example with documented results.', contributionText: 'Recorded the observations and explained the decisions.', seoDescription: 'A text-only systems notebook used for template verification.', context: 'This local example examines a small network and records reproducible observations.', decisionSummary: 'Text evidence keeps the case useful when no hero image is selected. The long project name checks natural wrapping in both languages.' };
      await writeFile(path.join(directory, 'projects', locale, `${id}.md`), `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${name === 'selected-set' ? 'PRIVATE_SENTINEL draft body must never be rendered.' : 'The documented output consists of observations and a repeatable procedure. No image is required to understand the result.'}\n`);
    }
  }
  if (name === 'selected-set') {
    await mkdir(path.join(directory, 'media'), { recursive: true });
    await writeFile(path.join(directory, 'media/private-study-image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><title>PRIVATE_SENTINEL</title></svg>');
  }
}
