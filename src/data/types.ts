export const locales = ["vi", "en"] as const;
export type Locale = (typeof locales)[number];
export type Localized<T> = Record<Locale, T>;

export interface Publication {
  publishIntent: "draft" | "publish";
  publicSelected: boolean;
}

export interface ExternalEvidence {
  evidenceId: string;
  type: "source" | "configuration" | "runtime-capture";
  sourceUrl: string;
  commit?: string;
  scope: Localized<string>;
  environment?: Localized<string>;
  limitations: Localized<string[]>;
  mediaId?: string;
}

export interface LocalObservation {
  evidenceId: string;
  type: "local-observation";
  recordId: string;
  scope: Localized<string>;
  environment: Localized<string>;
  observedAt: string;
  actor: Localized<string>;
  limitations: Localized<string[]>;
  mediaId?: string;
}
export type Evidence = ExternalEvidence | LocalObservation;

export interface LabProvenance {
  preparedBy: Localized<string>;
  performedBy: Localized<string>;
  reviewStatus: "not-reviewed-by-nam" | "reviewed-by-nam" | "performed-by-nam";
  observedAt: string;
  environment: Localized<string>;
  limitations: Localized<string[]>;
}

export interface ProjectFactsBase {
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
  publication: Publication;
}
export interface AuthoredProjectFacts extends ProjectFactsBase {
  kind: "project";
  repository: string;
  contributionSource: "author-confirmed";
  evidence: ExternalEvidence[];
}
export interface LabFacts extends ProjectFactsBase {
  kind: "lab";
  repository: string | null;
  provenance: LabProvenance;
  evidence: Evidence[];
}
export type ProjectFacts = AuthoredProjectFacts | LabFacts;

export interface ProjectProse {
  projectId: string;
  locale: Locale;
  title: string;
  summary: string;
  contributionText: string;
  seoDescription: string;
  context: string;
  decisionSummary: string;
}

export interface NoteFacts {
  noteId: string;
  routeSlug: string;
  topicIds: string[];
  publishedAt?: string;
  updatedAt?: string;
  sources: string[];
  publication: Publication;
}

export interface NoteProse {
  noteId: string;
  locale: Locale;
  title: string;
  summary: string;
  seoDescription: string;
}

export interface Topic {
  topicId: string;
  labels: Localized<string>;
  description: Localized<string>;
  category: "foundation" | "direction" | "tools" | "exploration";
  status: "interest" | "self-reported" | "applied-with-evidence";
  evidenceRef?: {
    target: ContentReference;
    fragment?: Localized<string>;
    label: Localized<string>;
  };
}

export interface ContentReference {
  kind: "project" | "lab" | "note";
  id: string;
}
export interface ContentRelation {
  from: ContentReference;
  to: ContentReference;
  reason: Localized<string>;
}

export interface Photo {
  photoId: string;
  mediaId: string;
  width: number;
  height: number;
  rights: "author-owned" | "licensed";
  title: Localized<string>;
  alt: Localized<string>;
  caption: Localized<string>;
  location?: Localized<string>;
  takenAt?: string;
  publication: Publication;
}

export interface Contact {
  contactId: "email" | "github" | "phone" | "facebook";
  label: Localized<string>;
  href: string;
  enabled: boolean;
}

export interface CvFile {
  file: string;
  documentLanguage: Locale;
}

export interface Profile {
  name: string;
  wordmark: string;
  education: {
    program: Localized<string>;
    institution: Localized<string>;
    status: Localized<string>;
  };
  eyebrow: Localized<string>;
  headline: Localized<readonly string[]>;
  intro: Localized<string>;
  practice: Localized<string>;
  aboutIntro: Localized<string>;
  learning: Localized<string>;
  storyTitle: Localized<string>;
  story: Localized<string[]>;
  direction: Localized<string>;
  directionChain: Localized<string>;
  toolsDescription: Localized<string>;
  exploration: Localized<string>;
  photographyIntro: Localized<string>;
  contacts: Contact[];
  cv: Partial<Localized<CvFile>> | null;
  portraitMediaId: string | null;
}
