const privateMarker =
  /EDITOR_ONLY|PRIVATE_SENTINEL|DRAFT_SENTINEL|FIXTURE_SENTINEL|AUTHORING_ONLY/;
const canonicalVariable =
  /\{(?:count|date|index|language|minutes|noteSummary|noteTitle|projectTitle|total)\}/;
export function hasNonPublicCopy(value: string, markdown = false) {
  if (privateMarker.test(value)) return true;
  // Code examples may legitimately contain braces. Canonical editorial tokens
  // remain forbidden in prose, while marker sentinels are forbidden everywhere.
  const prose = markdown
    ? value.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g, "")
    : value;
  return (
    /\{\{|\$\{/.test(prose) ||
    canonicalVariable.test(prose) ||
    (!markdown && /\{[a-zA-Z][\w.]*\}/.test(prose))
  );
}
