#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeMeetingApp,
  renderSmokeEvidence,
  smokeEvidenceFilename,
  timestampForPath,
} from "./meeting-evidence.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const appArg = readAppArg() ?? "meeting";
const routeSnapshotPath = readOption("--route-snapshot") ?? "";
const app = normalizeMeetingApp(appArg);
const now = new Date();
const stamp = timestampForPath(now);
const filename = smokeEvidenceFilename({ app, stamp });
const outputDir = join(process.cwd(), "docs", "evidence");
const outputPath = join(outputDir, filename);
const content = renderSmokeEvidence({
  app: app.label,
  now,
  routeSnapshotPath,
});

if (dryRun) {
  console.log(content);
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, content, { encoding: "utf8", flag: "wx" });
console.log(outputPath);

function readOption(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];
  return null;
}

function readAppArg() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") continue;
    if (arg === "--route-snapshot") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--route-snapshot=")) continue;
    if (!arg.startsWith("--")) return arg;
  }
  return null;
}
