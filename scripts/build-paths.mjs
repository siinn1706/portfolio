import { resolve, relative, isAbsolute } from "node:path";
export function containedPath(root, value, label) {
  const absolute = resolve(value);
  const part = relative(resolve(root), absolute);
  if (!part || part.startsWith("..") || isAbsolute(part))
    throw new Error(`${label} must stay inside ${root}`);
  return absolute;
}
export function fixtureSettings(env = process.env) {
  const outDir = env.OUT_DIR
    ? containedPath("tests/.output", env.OUT_DIR, "OUT_DIR")
    : undefined;
  const fixture = env.CONTENT_FIXTURE_DIR
    ? containedPath(
        "tests/fixtures",
        env.CONTENT_FIXTURE_DIR,
        "CONTENT_FIXTURE_DIR",
      )
    : undefined;
  if (fixture && !outDir)
    throw new Error(
      "Fixture builds require an isolated OUT_DIR in tests/.output",
    );
  return { fixture, outDir };
}
