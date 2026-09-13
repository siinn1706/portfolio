import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { readingProcessor } from '../scripts/reading-markdown.mjs';
import { readingSections, resolveReadingSections, readingToc, figureFragment, type ReadingHeading } from '../src/data/reading-sections';
import { projects } from '../src/data/projects';
import type { Locale } from '../src/data/types';

for (const [key, registry] of Object.entries(readingSections)) test(`${key}: every declared locale pair matches the real Markdown renderer and selected h3 remains under its source h2`, async () => {
  const [kind, id] = key.split(':');
  const renderer = await readingProcessor().createRenderer({});
  const rendered: Partial<Record<Locale, { ids: string[]; headings: ReadingHeading[] }>> = {};
  for (const locale of ['vi', 'en'] as const) {
    const source = await readFile(`src/content/${kind === 'project' ? 'projects' : 'notes'}/${locale}/${id}.md`, 'utf8');
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    const result = await renderer.render(body, { frontmatter: { locale } });
    const $ = load(result.code);
    const ids = $('h2[id],h3[id]').map((_, h) => $(h).attr('id')!).get();
    const headings: ReadingHeading[] = result.metadata.headings;
    assert.deepEqual(ids, headings.filter(h => [2, 3].includes(h.depth)).map(h => h.slug));
    ids.push(kind === 'project' ? 'project-evidence' : 'note-references');
    rendered[locale] = { ids, headings };
    for (const entry of registry) assert.ok(ids.includes(entry.slugs[locale]), `${key}/${locale}: registry ${entry.key} points to missing rendered ID ${entry.slugs[locale]}`);
    assert.equal(new Set(registry.map(s => s.key)).size, registry.length);
    assert.equal(new Set(registry.map(s => s.slugs[locale])).size, registry.length);
  }
  for (const locale of ['vi', 'en'] as const) {
    const other = locale === 'vi' ? 'en' : 'vi';
    const sections = resolveReadingSections(key, locale, rendered[locale]!.ids, rendered[other]!.ids);
    assert.equal(sections.length, registry.length, 'Production registry must not silently drop a declared section');
    const toc = readingToc(rendered[locale]!.headings, sections, locale);
    const children = toc.flatMap(group => group.children.map(child => ({ parent: group.slug, child })));
    assert.deepEqual(children.map(row => row.child.slug).sort(), registry.filter(s => s.inToc).map(s => s.slugs[locale]).sort());
    for (const { parent, child } of children) {
      const preceding = rendered[locale]!.headings.slice(0, rendered[locale]!.headings.findIndex(h => h.slug === child.slug));
      assert.equal(preceding.filter(h => h.depth === 2).at(-1)?.slug, parent);
    }
  }
});

test('unknown fixtures and missing counterpart sections fall back without publishing broken mappings', () => {
  assert.deepEqual(resolveReadingSections('project:synthetic-fixture', 'vi', ['sample'], ['sample']), []);
  assert.deepEqual(resolveReadingSections('project:healthos', 'vi', ['phần-mình-đóng-góp'], ['unrelated']), []);
  const available = resolveReadingSections('project:healthos', 'vi', ['phần-mình-đóng-góp'], ['my-contribution']);
  assert.deepEqual(available.map(s => s.key), ['contribution']);
});

test('selected project media map to stable locale-neutral figure targets, never unselected media', () => {
  for (const project of projects.filter(p => p.kind === 'project')) {
    const fragments = project.mediaIds.map(figureFragment);
    const mappings = resolveReadingSections(`project:${project.projectId}`, 'vi', fragments, fragments, project.mediaIds);
    assert.deepEqual(mappings.map(s => s.slugs.vi), fragments);
    assert.deepEqual(mappings.map(s => s.slugs.en), fragments);
    assert.equal(new Set(fragments).size, project.mediaIds.length);
    assert.deepEqual(resolveReadingSections(`project:${project.projectId}`, 'en', fragments, [], project.mediaIds), []);
  }
});
