import { z } from "astro/zod";
import { hasNonPublicCopy } from "./public-copy";

export const safeId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const localeSchema = z.enum(["vi", "en"]);
const text = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !hasNonPublicCopy(value), "Unresolved or non-public copy");
export const localizedText = z.object({ vi: text, en: text });
const webUrl = z
  .url()
  .refine((value) => /^https?:\/\//.test(value), "Expected HTTP(S) URL");
const publication = z.object({
  publishIntent: z.enum(["draft", "publish"]),
  publicSelected: z.boolean(),
});
const externalEvidence = z.object({
  evidenceId: safeId,
  type: z.enum(["source", "configuration", "runtime-capture"]),
  sourceUrl: webUrl,
  commit: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  scope: localizedText,
  environment: localizedText.optional(),
  limitations: z.object({ vi: z.array(text), en: z.array(text) }),
  mediaId: safeId.optional(),
});
const localObservation = z.object({
  evidenceId: safeId,
  type: z.literal("local-observation"),
  recordId: safeId,
  scope: localizedText,
  environment: localizedText,
  observedAt: z.iso.date(),
  actor: localizedText,
  limitations: z.object({ vi: z.array(text), en: z.array(text) }),
  mediaId: safeId.optional(),
});
const labProvenance = z.object({
  preparedBy: localizedText,
  performedBy: localizedText,
  reviewStatus: z.enum(["not-reviewed-by-nam", "reviewed-by-nam", "performed-by-nam"]),
  observedAt: z.iso.date(),
  environment: localizedText,
  limitations: z.object({ vi: z.array(text), en: z.array(text) }),
});
const projectBase = z.object({
  projectId: safeId,
  routeSlug: safeId,
  domain: text,
  verifiedStack: z.array(text),
  workStatus: z.enum(["unknown", "in-progress", "completed", "archived"]),
  knownDates: z
    .object({
      started: z.iso.date().optional(),
      ended: z.iso.date().optional(),
    })
    .optional(),
  order: z.number(),
  homeFeatureRank: z.number().int().positive().optional(),
  contentUpdatedAt: z.iso.date().optional(),
  topicIds: z.array(safeId),
  mediaIds: z.array(safeId),
  heroMediaId: safeId.nullable(),
  publication,
});
export const projectSchema = z.discriminatedUnion("kind", [
  projectBase.extend({
    kind: z.literal("project"),
    repository: webUrl,
    contributionSource: z.literal("author-confirmed"),
    evidence: z.array(externalEvidence),
  }),
  projectBase.extend({
    kind: z.literal("lab"),
    repository: webUrl.nullable(),
    provenance: labProvenance,
    evidence: z.array(z.union([externalEvidence, localObservation])),
  }),
]);
export const contentReferenceSchema = z.object({
  kind: z.enum(["project", "lab", "note"]),
  id: safeId,
});
export const relationSchema = z.object({
  from: contentReferenceSchema,
  to: contentReferenceSchema,
  reason: localizedText,
});
export const topicSchema = z.object({
  topicId: safeId,
  labels: localizedText,
  description: localizedText,
  category: z.enum(["foundation", "direction", "tools", "exploration"]),
  status: z.enum(["interest", "self-reported", "applied-with-evidence"]),
  evidenceRef: z.object({
    target: contentReferenceSchema,
    fragment: z.object({vi: text, en: text}).refine(value => Object.values(value).every(fragment => !/[\s#/?]/u.test(fragment)), "Expected a heading fragment").optional(),
    label: localizedText,
  }).optional(),
}).refine(value => value.status !== "applied-with-evidence" || value.evidenceRef !== undefined, "applied-with-evidence requires an evidence reference");
export const projectProseSchema = z.object({
  projectId: safeId,
  locale: localeSchema,
  title: text,
  summary: text,
  contributionText: text,
  seoDescription: text,
  context: text,
  decisionSummary: text,
});
export const noteSchema = z.object({
  noteId: safeId,
  routeSlug: safeId,
  topicIds: z.array(safeId),
  publishedAt: z.iso.date().optional(),
  updatedAt: z.iso.date().optional(),
  sources: z.array(webUrl),
  publication,
});
export const noteProseSchema = z.object({
  noteId: safeId,
  locale: localeSchema,
  title: text,
  summary: text,
  seoDescription: text,
});
export const photoSchema = z.object({
  photoId: safeId,
  mediaId: safeId,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rights: z.enum(["author-owned", "licensed"]),
  title: localizedText,
  alt: localizedText,
  caption: localizedText,
  location: localizedText.optional(),
  takenAt: z.iso.date().optional(),
  publication,
});
export const photoAuthoringSchema = photoSchema.extend({
  title: localizedText.partial(),
  alt: localizedText.partial(),
  caption: localizedText.partial(),
  location: localizedText.partial().optional(),
});
