import { projectSchema, projectProseSchema, noteSchema, noteProseSchema, photoSchema, photoAuthoringSchema, relationSchema, topicSchema } from "./schemas";
import { locales } from "../data/types";
import type { ProjectProse, NoteFacts, NoteProse, Photo, Localized, ExternalEvidence, Evidence, LabProvenance, ContentReference, ContentRelation, Topic } from "../data/types";

interface PublicProjectBase {
  projectId: string;
  routeSlug: string;
  domain: string;
  verifiedStack: string[];
  workStatus: "unknown" | "in-progress" | "completed" | "archived";
  knownDates?: { started?: string; ended?: string };
  contentUpdatedAt?: string;
  order: number;
  homeFeatureRank?: number;
  topicIds: string[];
  mediaIds: string[];
  heroMediaId: string | null;
  prose: Localized<ProjectProse>;
}
export type PublicProject = PublicProjectBase & (
  | { kind: "project"; repository: string; evidence: ExternalEvidence[] }
  | { kind: "lab"; repository: string | null; provenance: LabProvenance; evidence: Evidence[] }
);
export type PublicNote = Omit<NoteFacts, "publication"> & { prose: Localized<NoteProse> };
export type PublicPhoto = Omit<Photo, "publication">;
export interface PublicCatalog {
  projects: PublicProject[];
  notes: PublicNote[];
  photos: PublicPhoto[];
  relations: ContentRelation[];
  topics: Topic[];
}
export interface CatalogInput {
  projects: unknown[];
  projectProse: unknown[];
  notes?: unknown[];
  noteProse?: unknown[];
  photos?: unknown[];
  relations?: unknown[];
  topics?: unknown[];
  mediaIds?: readonly string[];
  topicIds?: readonly string[];
  mediaFiles?: Record<string, string[]>;
  photoMedia?: Record<string, { width: number; height: number; files?: string[] }>;
  fileExists?: (file: string) => boolean;
}

export const referenceKey = (ref: ContentReference) => `${ref.kind}:${ref.id}`;
const unique = (values: string[], field: string) => {
  if (new Set(values).size !== values.length) throw new Error(`${field}: duplicate ID or route slug`);
};

// Project and lab source records share only their expressly public fields.
function publicEvidence(item: Evidence): Evidence {
  const common = { evidenceId: item.evidenceId, scope: item.scope, limitations: item.limitations, ...(item.mediaId ? { mediaId: item.mediaId } : {}) };
  if (item.type === "local-observation") return {
    ...common, type: item.type, recordId: item.recordId, actor: item.actor,
    environment: item.environment, observedAt: item.observedAt,
  };
  return { ...common, type: item.type, sourceUrl: item.sourceUrl, ...(item.commit ? { commit: item.commit } : {}), ...(item.environment ? { environment: item.environment } : {}) };
}

export function buildCatalog(input: CatalogInput): PublicCatalog {
  const parse = <T>(schema: { parse: (value: unknown) => T }, values: unknown[], file: string): T[] => values.map((value, i) => {
    try { return schema.parse(value); } catch (error) { throw new Error(`${file}[${i}]: ${error}`); }
  });
  const projects = parse(projectSchema, input.projects, "projects");
  const prose = parse(projectProseSchema, input.projectProse, "projectProse");
  const notes = parse(noteSchema, input.notes ?? [], "notes");
  const noteProse = parse(noteProseSchema, input.noteProse ?? [], "noteProse");
  const photos = parse(photoAuthoringSchema, input.photos ?? [], "photos");
  const relations = parse(relationSchema, input.relations ?? [], "relations");
  const topics = parse(topicSchema, input.topics ?? [], "topics");
  unique(projects.map(p => p.projectId), "projects.projectId");
  unique(projects.map(p => p.routeSlug), "projects.routeSlug");
  unique(notes.map(n => n.noteId), "notes.noteId");
  unique(notes.map(n => n.routeSlug), "notes.routeSlug");
  unique(photos.map(p => p.photoId), "photos.photoId");
  unique(topics.map(t => t.topicId), "topics.topicId");
  unique(prose.map(p => `${p.projectId}/${p.locale}`), "projectProse.locale");
  unique(noteProse.map(p => `${p.noteId}/${p.locale}`), "noteProse.locale");
  for (const p of prose) if (!projects.some(f => f.projectId === p.projectId)) throw new Error(`projectProse.${p.projectId}: missing project facts`);
  for (const n of noteProse) if (!notes.some(f => f.noteId === n.noteId)) throw new Error(`noteProse.${n.noteId}: missing note facts`);

  const authoringRefs = new Set([
    ...projects.map(p => referenceKey({ kind: p.kind, id: p.projectId })),
    ...notes.map(n => referenceKey({ kind: "note", id: n.noteId })),
  ]);
  const validateReference = (ref: ContentReference, field: string) => {
    if (!authoringRefs.has(referenceKey(ref))) throw new Error(`${field}: missing content reference ${referenceKey(ref)}`);
  };
  const edgeKeys = new Set<string>();
  for (const [index, edge] of relations.entries()) {
    validateReference(edge.from, `relations[${index}].from`);
    validateReference(edge.to, `relations[${index}].to`);
    const from = referenceKey(edge.from), to = referenceKey(edge.to);
    if (from === to) throw new Error(`relations[${index}]: self-edge`);
    const key = [from, to].sort().join("|");
    if (edgeKeys.has(key)) throw new Error(`relations[${index}]: duplicate edge`);
    edgeKeys.add(key);
  }
  for (const topic of topics) if (topic.evidenceRef) {
    validateReference(topic.evidenceRef.target, `topics.${topic.topicId}.evidenceRef`);
    if (topic.status === "applied-with-evidence" && topic.evidenceRef.target.kind === "lab") {
      const target = projects.find(p => p.projectId === topic.evidenceRef!.target.id);
      if (target?.kind !== "lab" || target.provenance.reviewStatus !== "performed-by-nam") throw new Error(`topics.${topic.topicId}: assistant-run lab cannot establish applied experience`);
    }
  }
  const validateFiles = (files: string[], field: string) => {
    for (const file of files) if (input.fileExists && !input.fileExists(file)) throw new Error(`${field}: missing declared file ${file}`);
  };
  const validateMedia = (id: string, field: string) => {
    if (!input.mediaIds?.includes(id)) throw new Error(`${field}: missing declared media ${id}`);
    validateFiles(input.mediaFiles?.[id] ?? [], field);
  };
  const topicIds = input.topicIds ?? (input.topics ? topics.map(t => t.topicId) : undefined);
  const validateTopics = (ids: string[], field: string) => {
    if (topicIds) for (const id of ids) if (!topicIds.includes(id)) throw new Error(`${field}: missing topic reference ${id}`);
  };
  const selected = (p: { publishIntent: string; publicSelected: boolean }, id: string) => {
    if (p.publishIntent === "draft") return false;
    if (!p.publicSelected) throw new Error(`${id}.publication.publicSelected: publish requires explicit selection`);
    return true;
  };

  const publicProjects: PublicProject[] = projects.filter(p => selected(p.publication, p.projectId)).map((p): PublicProject => {
    validateTopics(p.topicIds, `${p.projectId}.topicIds`);
    const pair = {} as Localized<ProjectProse>;
    for (const locale of locales) {
      const item = prose.find(t => t.projectId === p.projectId && t.locale === locale);
      if (!item) throw new Error(`${p.projectId}.${locale}: publish requires both locales`);
      pair[locale] = item;
    }
    unique(p.evidence.map(e => e.evidenceId), `${p.projectId}.evidence`);
    for (const id of [...p.mediaIds, ...(p.heroMediaId ? [p.heroMediaId] : []), ...p.evidence.flatMap(e => e.mediaId ? [e.mediaId] : [])]) validateMedia(id, `${p.projectId}.media`);
    const common: PublicProjectBase = {
      projectId: p.projectId, routeSlug: p.routeSlug, domain: p.domain, verifiedStack: p.verifiedStack,
      workStatus: p.workStatus, order: p.order, topicIds: p.topicIds, mediaIds: p.mediaIds,
      heroMediaId: p.heroMediaId, prose: pair,
      ...(p.knownDates ? { knownDates: p.knownDates } : {}),
      ...(p.contentUpdatedAt ? { contentUpdatedAt: p.contentUpdatedAt } : {}),
      ...(p.homeFeatureRank !== undefined ? { homeFeatureRank: p.homeFeatureRank } : {}),
    };
    if (p.kind === "project") return { ...common, kind: "project", repository: p.repository, evidence: p.evidence.map(e => publicEvidence(e) as ExternalEvidence) };
    return { ...common, kind: "lab", repository: p.repository, evidence: p.evidence.map(publicEvidence), provenance: {
      preparedBy: p.provenance.preparedBy, performedBy: p.provenance.performedBy,
      reviewStatus: p.provenance.reviewStatus, observedAt: p.provenance.observedAt,
      environment: p.provenance.environment, limitations: p.provenance.limitations,
    } };
  }).sort((a, b) => a.order - b.order || a.projectId.localeCompare(b.projectId, "en"));
  const featured = publicProjects.filter(p => p.homeFeatureRank !== undefined);
  unique(featured.map(p => String(p.homeFeatureRank)), "projects.homeFeatureRank");
  if (featured.length > 3) throw new Error("projects.homeFeatureRank: at most three public featured entries");

  const publicNotes: PublicNote[] = notes.filter(n => selected(n.publication, n.noteId)).map(n => {
    validateTopics(n.topicIds, `${n.noteId}.topicIds`);
    const pair = {} as Localized<NoteProse>;
    for (const locale of locales) {
      const item = noteProse.find(t => t.noteId === n.noteId && t.locale === locale);
      if (!item) throw new Error(`${n.noteId}.${locale}: publish requires both locales`);
      pair[locale] = item;
    }
    return { noteId: n.noteId, routeSlug: n.routeSlug, topicIds: n.topicIds, sources: n.sources, prose: pair,
      ...(n.publishedAt ? { publishedAt: n.publishedAt } : {}), ...(n.updatedAt ? { updatedAt: n.updatedAt } : {}) };
  });
  const publicPhotos: PublicPhoto[] = photos.filter(p => selected(p.publication, p.photoId)).map(p => {
    const photo = photoSchema.parse(p);
    const asset = input.photoMedia?.[photo.mediaId];
    if (!asset) throw new Error(`${photo.photoId}.mediaId: missing declared photography media ${photo.mediaId}`);
    if (asset.width !== photo.width || asset.height !== photo.height) throw new Error(`${photo.photoId}: photography dimensions do not match the selected asset`);
    validateFiles(asset.files ?? [], `${photo.photoId}.mediaId`);
    return { photoId: photo.photoId, mediaId: photo.mediaId, width: photo.width, height: photo.height,
      rights: photo.rights, title: photo.title, alt: photo.alt, caption: photo.caption,
      ...(photo.location ? { location: photo.location } : {}), ...(photo.takenAt ? { takenAt: photo.takenAt } : {}) };
  });
  const publicRefs = new Set([
    ...publicProjects.map(p => referenceKey({ kind: p.kind, id: p.projectId })),
    ...publicNotes.map(n => referenceKey({ kind: "note", id: n.noteId })),
  ]);
  const publicRelations = relations.filter(edge => publicRefs.has(referenceKey(edge.from)) && publicRefs.has(referenceKey(edge.to)));
  const publicTopics: Topic[] = topics.map(topic => {
    const hasPublicEvidence = topic.evidenceRef && publicRefs.has(referenceKey(topic.evidenceRef.target));
    return { topicId: topic.topicId, labels: topic.labels, description: topic.description, category: topic.category,
      status: topic.status === "applied-with-evidence" && !hasPublicEvidence ? "self-reported" : topic.status,
      ...(hasPublicEvidence ? { evidenceRef: topic.evidenceRef } : {}) };
  });
  return { projects: publicProjects, notes: publicNotes, photos: publicPhotos, relations: publicRelations, topics: publicTopics };
}
