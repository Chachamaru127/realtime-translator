#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  normalizeMeetingApp,
  renderRouteSnapshot,
  renderSmokeEvidence,
  routeSnapshotFilename,
  smokeEvidenceFilename,
  timestampForPath,
} from "./meeting-evidence.mjs";
import { buildMeetingSystemSnapshot, formatDevice } from "./meeting-system.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const appArg = args.find((arg) => !arg.startsWith("--")) ?? "meeting";
const app = normalizeMeetingApp(appArg);
const snapshot = buildMeetingSystemSnapshot();
const stamp = timestampForPath(snapshot.generatedAt);
const outputDir = join(process.cwd(), "docs", "evidence");
const routePath = join(outputDir, routeSnapshotFilename({ stamp }));
const smokePath = join(outputDir, smokeEvidenceFilename({ app, stamp }));
const routeRelativePath = relative(process.cwd(), routePath);
const smokeRelativePath = relative(process.cwd(), smokePath);
const routeContent = renderRouteSnapshot(snapshot);
const smokeContent = renderSmokeEvidence({
  app: app.label,
  now: snapshot.generatedAt,
  routeSnapshotPath: routeRelativePath,
  setup: smokeSetupFromSnapshot(snapshot),
});

if (dryRun) {
  console.log(`route snapshot: ${routeRelativePath}`);
  console.log(`smoke evidence: ${smokeRelativePath}`);
  console.log("");
  console.log("--- route snapshot ---");
  console.log(routeContent);
  console.log("--- smoke evidence ---");
  console.log(smokeContent);
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(routePath, routeContent, { encoding: "utf8", flag: "wx" });
writeFileSync(smokePath, smokeContent, { encoding: "utf8", flag: "wx" });
console.log(`route snapshot: ${routePath}`);
console.log(`smoke evidence: ${smokePath}`);

function smokeSetupFromSnapshot(snapshot) {
  const failedChecks = snapshot.checks
    .filter(([, ok]) => !ok)
    .map(([label]) => label);
  return {
    appUrl: snapshot.devServer
      ? `http://localhost:${snapshot.devServer.port}`
      : "not found",
    translatorMic: formatDevice(snapshot.candidates.preferredMic),
    translatorRemote: formatDevice(snapshot.candidates.remoteCandidate),
    laneMap: "私=translator mic; 相手=translator remote/playback",
    localPreflight: failedChecks.length ? `WARN: ${failedChecks.join(", ")}` : "PASS",
  };
}
