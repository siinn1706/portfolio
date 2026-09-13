import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { containedPath, fixtureSettings } from '../scripts/build-paths.mjs';

test('fixture build paths stay isolated and cannot overwrite production or escape through traversal', () => {
  const settings = fixtureSettings({ CONTENT_FIXTURE_DIR: 'tests/fixtures/content/optional', OUT_DIR: 'tests/.output/optional' });
  assert.equal(settings.fixture, path.resolve('tests/fixtures/content/optional'));
  assert.equal(settings.outDir, path.resolve('tests/.output/optional'));
  for (const out of ['dist', 'tests/.output/../../dist', 'tests/.output', '../outside']) assert.throws(() => fixtureSettings({ OUT_DIR: out }), /OUT_DIR/);
  for (const fixture of ['src/content', 'tests/fixtures/../../../outside', 'tests/fixtures']) assert.throws(() => fixtureSettings({ CONTENT_FIXTURE_DIR: fixture, OUT_DIR: 'tests/.output/optional' }), /CONTENT_FIXTURE_DIR/);
  assert.throws(() => fixtureSettings({ CONTENT_FIXTURE_DIR: 'tests/fixtures/content/optional' }), /isolated OUT_DIR/);
  assert.throws(() => containedPath('tests/.output', 'C:/unrelated', 'Test output'), /Test output/);
});
