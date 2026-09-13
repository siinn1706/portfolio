import ts from 'typescript';

const compiledScripts = new Map<string, string>();

/** Compile the small enhancements at build time so their first state is ready before paint. */
export function inlineScript(source: string): string {
  const cached = compiledScripts.get(source);
  if (cached) return cached;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleDetection: ts.ModuleDetectionKind.Legacy, removeComments: true },
  });
  const result = `(()=>{${outputText}})();`.replace(/<\/script/gi, '<\\/script');
  compiledScripts.set(source, result);
  return result;
}
