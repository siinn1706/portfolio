import type { PublicCatalog, PublicProject } from "./catalog";
import { referenceKey } from "./catalog";
import type { ContentReference, Locale } from "../data/types";
import { route } from "../i18n/routes";

export function getFeaturedProjects(catalog: PublicCatalog): PublicProject[] {
  return catalog.projects.filter(project => project.homeFeatureRank !== undefined)
    .sort((a, b) => a.homeFeatureRank! - b.homeFeatureRank!);
}
export function getNextProject(catalog: PublicCatalog, currentId: string): PublicProject | undefined {
  if (catalog.projects.length < 2) return undefined;
  const index = catalog.projects.findIndex(project => project.projectId === currentId);
  return index < 0 ? undefined : catalog.projects[(index + 1) % catalog.projects.length];
}
export function getPublicTarget(catalog: PublicCatalog, ref: ContentReference, locale: Locale, base = "/") {
  const entry = ref.kind === "note" ? catalog.notes.find(note => note.noteId === ref.id)
    : catalog.projects.find(project => project.projectId === ref.id && project.kind === ref.kind);
  if (!entry) return undefined;
  return { kind: ref.kind, id: ref.id, title: entry.prose[locale].title, summary: entry.prose[locale].summary,
    href: route(locale, ref.kind === "note" ? "note" : "project", entry.routeSlug, base) };
}
export function getRelatedContent(catalog: PublicCatalog, current: ContentReference, locale: Locale, base = "/") {
  if (!getPublicTarget(catalog, current, locale, base)) return [];
  return catalog.relations.flatMap(edge => {
    const other = referenceKey(edge.from) === referenceKey(current) ? edge.to : referenceKey(edge.to) === referenceKey(current) ? edge.from : undefined;
    const target = other && getPublicTarget(catalog, other, locale, base);
    return target ? [{ ...target, reason: edge.reason[locale] }] : [];
  }).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`, "en"));
}
export function getPublicTopics(catalog: PublicCatalog, locale: Locale, base = "/") {
  return catalog.topics.map(topic => {
    const target = topic.evidenceRef && getPublicTarget(catalog, topic.evidenceRef.target, locale, base);
    return { topicId: topic.topicId, labels: topic.labels, description: topic.description, category: topic.category, status: topic.status,
      ...(target && topic.evidenceRef ? { evidence: {
        href: `${target.href}${topic.evidenceRef.fragment ? `#${encodeURIComponent(topic.evidenceRef.fragment[locale])}` : ""}`,
        label: topic.evidenceRef.label[locale],
      } } : {}) };
  });
}
