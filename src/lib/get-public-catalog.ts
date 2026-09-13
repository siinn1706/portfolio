import { getCollection } from "astro:content";
import { projects } from "../data/projects";
import { notes } from "../data/notes";
import { photography } from "../data/photography";
import { mediaIds } from "../data/media";
import { photoMediaRegistry } from "../data/photography-media";
import { relations } from "../data/relations";
import { buildCatalog } from "./catalog";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fixtureSettings } from "../../scripts/build-paths.mjs";
import { hasNonPublicCopy } from "./public-copy";
import { topics } from "../data/topics";
import { profile } from "../data/profile";
import { validateCv } from "./validate-cv";

export async function getPublicCatalog() {
  validateCv(profile.cv);
  const [projectEntries, noteEntries] = await Promise.all([
    getCollection("projects"),
    getCollection("notes"),
  ]);
  let optional: { projects?: unknown[]; notes?: unknown[]; photos?: unknown[]; relations?: unknown[]; topics?: unknown[]; emptyWork?: boolean } =
    {};
  const { fixture } = fixtureSettings();
  if (fixture) {
    optional = JSON.parse(readFileSync(resolve(fixture, "facts.json"), "utf8"));
  }
  const catalog = buildCatalog({
    projects: optional.emptyWork ? [] : optional.projects ?? projects,
    projectProse: optional.emptyWork ? [] : projectEntries.map((e) => e.data),
    notes: optional.notes ?? notes,
    noteProse: noteEntries.map((e) => e.data),
    photos: optional.photos ?? photography,
    relations: fixture ? optional.relations ?? [] : relations,
    topics: fixture ? optional.topics ?? [] : topics,
    mediaIds,
    photoMedia: Object.fromEntries(Object.entries(photoMediaRegistry).map(([id, media]) => [id, { width: media.full.width, height: media.full.height }])),
  });
  for (const entry of [
    ...projectEntries.filter((e) =>
      catalog.projects.some((p) => p.projectId === e.data.projectId),
    ),
    ...noteEntries.filter((e) =>
      catalog.notes.some((n) => n.noteId === e.data.noteId),
    ),
  ]) {
    if (!entry.body?.trim() || hasNonPublicCopy(entry.body, true))
      throw new Error(
        `${entry.id}.body: empty, unresolved or non-public content`,
      );
  }
  return catalog;
}
