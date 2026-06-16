#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), "meeting-system-env-"));
const envPath = join(tempDir, ".env");
const tempLocalDir = mkdtempSync(join(tmpdir(), "meeting-system-env-local-"));
const missingEnvPath = join(tempLocalDir, ".env");

writeFileSync(
  envPath,
  "export OPENAI_API_KEY=test-next-env-loader-smoke\n",
  "utf8",
);
writeFileSync(
  join(tempLocalDir, ".env.local"),
  "OPENAI_API_KEY=test-next-env-local-smoke\n",
  "utf8",
);

const envOutput = runCheckEnv(envPath);
const envResult = JSON.parse(envOutput);
assert.equal(envResult.path, envPath);
assert.equal(envResult.root, tempDir);
assert.equal(envResult.hasOpenAIKey, true);
assert.equal(envOutput.includes("test-next-env-loader-smoke"), false);

const localOutput = runCheckEnv(missingEnvPath);
const localResult = JSON.parse(localOutput);
assert.equal(localResult.path, missingEnvPath);
assert.equal(localResult.root, tempLocalDir);
assert.equal(localResult.hasOpenAIKey, true);
assert.equal(localOutput.includes("test-next-env-local-smoke"), false);

console.log(
  JSON.stringify({
    status: "ok",
    nextEnvFallbackDetected: true,
    nextEnvLocalFallbackDetected: true,
    emptyEnvFallbackDetected: true,
    secretNotPrinted: true,
  }),
);

function runCheckEnv(fallbackPath) {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        `import { checkEnv } from ${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/meeting-system.mjs")).href)};`,
        "const result = checkEnv();",
        "console.log(JSON.stringify(result));",
      ].join("\n"),
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        REALTIME_TRANSLATOR_ENV_FILE: fallbackPath,
        OPENAI_ENV_FILE: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
