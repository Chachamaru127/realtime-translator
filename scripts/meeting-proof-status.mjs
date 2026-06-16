#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkEvidenceFile } from "./check-meeting-smoke-evidence.mjs";
import { parseMarkdownRow } from "./markdown-table.mjs";

export function buildProofStatus({
  evidenceDir = resolve(process.cwd(), "docs", "evidence"),
} = {}) {
  const files = existsSync(evidenceDir)
    ? readdirSync(evidenceDir)
        .filter((name) => name.endsWith("-smoke.md"))
        .map((name) => join(evidenceDir, name))
        .sort()
    : [];

  const reports = files.map((file) => {
    const text = readFileSync(file, "utf8");
    const app = readSetupField(text, "meeting app");
    return {
      file,
      app,
      smoke: checkEvidenceFile(file, { scope: "smoke" }),
      endurance: checkEvidenceFile(file, { scope: "endurance" }),
    };
  });

  const zoom = reports.find(
    (report) => report.app === "Zoom" && report.smoke.ok,
  );
  const meet = reports.find(
    (report) => report.app === "Google Meet" && report.smoke.ok,
  );
  const endurance = reports.find((report) => report.endurance.ok);

  return {
    ok: Boolean(zoom && meet && endurance),
    requirements: {
      zoom10MinuteSmoke: zoom?.file ?? null,
      googleMeet10MinuteSmoke: meet?.file ?? null,
      endurance30Minute: endurance?.file ?? null,
    },
    checkedFiles: reports.map((report) => ({
      file: report.file,
      app: report.app,
      smokeOk: report.smoke.ok,
      enduranceOk: report.endurance.ok,
      smokeErrors: report.smoke.errors,
      enduranceErrors: report.endurance.errors,
    })),
  };
}

function main() {
  const result = buildProofStatus();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function readSetupField(text, field) {
  for (const line of text.split("\n")) {
    const cells = parseMarkdownRow(line);
    if (cells.length === 2 && cells[0] === field) return cells[1];
  }
  return "";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
