import { existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import type { Profile } from "../data/types";

export function validateCv(
  cv: Profile["cv"],
  fileExists = (file: string) => existsSync(file),
  publicRoot = resolve("public"),
) {
  for (const [locale, document] of Object.entries(cv ?? {})) {
    if (!document) continue;
    if (
      !["vi", "en"].includes(locale) ||
      !["vi", "en"].includes(document.documentLanguage)
    )
      throw new Error(`profile.cv.${locale}: unsupported document language`);
    if (/^[a-z]+:/i.test(document.file) || document.file.includes("\\"))
      throw new Error(
        `profile.cv.${locale}.file: expected a public relative file path`,
      );
    const file = resolve(publicRoot, document.file.replace(/^\//, ""));
    const path = relative(publicRoot, file);
    if (!path || path.startsWith("..") || isAbsolute(path))
      throw new Error(
        `profile.cv.${locale}.file: path must stay inside public`,
      );
    if (!fileExists(file))
      throw new Error(
        `profile.cv.${locale}.file: missing declared file ${document.file}`,
      );
  }
}
