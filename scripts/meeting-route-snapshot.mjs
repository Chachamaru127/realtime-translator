#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderRouteSnapshot,
  routeSnapshotFilename,
  timestampForPath,
} from "./meeting-evidence.mjs";
import {
  buildMeetingSystemSnapshot,
} from "./meeting-system.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const snapshot = buildMeetingSystemSnapshot();
const stamp = timestampForPath(snapshot.generatedAt);
const outputDir = join(process.cwd(), "docs", "evidence");
const outputPath = join(outputDir, routeSnapshotFilename({ stamp }));
const content = renderRouteSnapshot(snapshot);

if (dryRun) {
  console.log(content);
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, content, { encoding: "utf8", flag: "wx" });
console.log(outputPath);
