import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { projectProseSchema, noteProseSchema } from "./lib/schemas";
import { fixtureSettings } from "../scripts/build-paths.mjs";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const { fixture } = fixtureSettings();

const projects = defineCollection({
  loader: glob({
    pattern: "{vi,en}/*.md",
    base: fixture && existsSync(`${fixture}/projects`)
      ? pathToFileURL(`${fixture}/projects/`)
      : "./src/content/projects",
    generateId: ({ data }) => `${data.locale}/${data.projectId}`,
  }),
  schema: projectProseSchema,
});
const notes = defineCollection({
  loader: glob({
    pattern: "{vi,en}/*.md",
    base: fixture ? pathToFileURL(`${fixture}/notes/`) : "./src/content/notes",
    generateId: ({ data }) => `${data.locale}/${data.noteId}`,
  }),
  schema: noteProseSchema,
});
export const collections = { projects, notes };
