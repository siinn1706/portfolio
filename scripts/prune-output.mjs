import { readdir, readFile, unlink } from "node:fs/promises";
import { resolve, relative, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

// Vite emits assets imported by build-only media registries. Publish only the
// generated files reachable from a rendered document or an explicit public file.
export async function pruneOutput(directory) {
  const root = resolve(fileURLToPath(directory));
  const generated = resolve(root, "_astro");
  if (relative(root, generated) !== "_astro")
    throw new Error("Invalid generated asset directory");
  const walk = async (dir) =>
    (
      await Promise.all(
        (await readdir(dir, { withFileTypes: true })).map(async (e) =>
          e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
        ),
      )
    ).flat();
  const files = await walk(root);
  const candidates = files.filter(
    (file) =>
      file.startsWith(`${generated}\\`) || file.startsWith(`${generated}/`),
  );
  const reachable = new Set(files.filter((file) => !candidates.includes(file)));
  const queue = [...reachable];
  while (queue.length) {
    const file = queue.pop();
    if (!/\.(html|css|js|mjs|svg|json|xml|txt)$/.test(file)) continue;
    const content = await readFile(file, "utf8");
    for (const candidate of candidates) {
      if (!reachable.has(candidate) && content.includes(basename(candidate))) {
        reachable.add(candidate);
        queue.push(candidate);
      }
    }
  }
  for (const file of candidates) {
    if (!reachable.has(file)) {
      const rel = relative(generated, resolve(file));
      if (rel.startsWith("..") || resolve(file) === generated)
        throw new Error("Asset path escaped output");
      await unlink(file);
    }
  }
  return candidates.filter((file) => !reachable.has(file)).length;
}
