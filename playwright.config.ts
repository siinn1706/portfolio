import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const browserPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const port = Number(process.env.TEST_PORT || 4322);
const origin = process.env.TEST_ORIGIN || `http://127.0.0.1:${port}`;
const base = process.env.BASE_PATH || '/';
const reportDirectory = process.env.QA_REPORT_DIR || '.qa/local';
const output = path.resolve('dist');
const astroPackage = JSON.parse(readFileSync('node_modules/astro/package.json', 'utf8'));
const astroCli = path.resolve('node_modules/astro', typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin.astro);
const fingerprint = createHash('sha256');
function inventory(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? inventory(path.join(directory, entry.name)) : [path.relative(output, path.join(directory, entry.name)).replaceAll('\\', '/')]);
}
if (existsSync(output)) for (const file of inventory(output).sort()) fingerprint.update(file).update('\0').update(readFileSync(path.join(output, file)));

export default defineConfig({
  metadata: { artifactSha256: existsSync(output) ? fingerprint.digest('hex') : 'missing-output', outputDirectory: output, node: process.version },
  testDir: './tests',
  outputDir: path.join(reportDirectory, 'browser-artifacts'),
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 40_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['json', { outputFile: path.join(reportDirectory, 'browser-results.json') }]],
  use: {
    baseURL: `${origin}${base}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: browserPath ? { executablePath: browserPath } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.TEST_ORIGIN ? undefined : {
    command: `"${process.execPath}" "${astroCli}" preview --host 127.0.0.1 --port ${port} --ignore-lock`,
    // Keep Astro 7's agent-aware CLI in this managed foreground process.
    env: { ASTRO_PREVIEW_BACKGROUND: '1' },
    url: `${origin}${base}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
