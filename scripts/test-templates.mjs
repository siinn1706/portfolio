import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "tests/template-build.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_TEMPLATE_BUILDS: "1",
      ASTRO_TELEMETRY_DISABLED: "1",
      QA_REPORT_DIR: process.env.QA_REPORT_DIR || ".qa/local",
    },
  },
);
process.exit(result.status ?? 1);
