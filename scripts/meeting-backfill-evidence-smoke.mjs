#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backfillEvidenceFile } from "./backfill-meeting-smoke-evidence.mjs";

const dir = mkdtempSync(join(tmpdir(), "meeting-backfill-evidence-"));
const routePath = join(dir, "route-snapshot.md");
const smokePath = join(dir, "zoom-smoke.md");

writeFileSync(
  routePath,
  `# Meeting Route Snapshot

## Summary

| Field | Value |
| --- | --- |
| app url | http://localhost:3002 |
| translator mic | HyperX SoloCast (in=2, 48000Hz) |
| translator remote | BlackHole 16ch (in=16, out=16, 48000Hz) |
| lane map | 私=local mic -> translator self lane; 相手=remote audio/playback -> translator remote lane |

## Checks

- PASS BlackHole 16ch input/output
- PASS Physical mic candidate
`,
  "utf8",
);

writeFileSync(
  smokePath,
  `# Zoom Meeting Smoke Evidence

## Setup

| Field | Value |
| --- | --- |
| app url |  |
| browser | Chrome |
| meeting app | Zoom |
| speaker route | BlackHole 16ch + headphones |
| meeting mic | HyperX SoloCast |
| translator mic |  |
| translator remote |  |
| lane map |  |
| route snapshot | ${routePath} |
| local preflight |  |
| input check |  |
| session duration |  |
| lane segments |  |
`,
  "utf8",
);

const dryRun = backfillEvidenceFile(smokePath, { dryRun: true });
assert.equal(dryRun.updated, true);
assert.equal(
  readFileSync(smokePath, "utf8").includes("| app url | http://localhost:3002 |"),
  false,
);

const result = backfillEvidenceFile(smokePath);
assert.equal(result.updated, true);
assert.deepEqual(result.insertedSetupFields, ["live approval"]);
assert.deepEqual(result.updates, {
  "app url": "http://localhost:3002",
  "translator mic": "HyperX SoloCast (in=2, 48000Hz)",
  "translator remote": "BlackHole 16ch (in=16, out=16, 48000Hz)",
  "lane map": "私=translator mic; 相手=translator remote/playback",
  "local preflight": "PASS",
});

const updated = readFileSync(smokePath, "utf8");
assert(updated.includes("| app url | http://localhost:3002 |"));
assert(updated.includes("| browser | Chrome |"));
assert(updated.includes("| speaker route | BlackHole 16ch + headphones |"));
assert(updated.includes("| meeting mic | HyperX SoloCast |"));
assert(updated.includes("| local preflight | PASS |"));
assert(updated.includes("| live approval |  |"));

const noOp = backfillEvidenceFile(smokePath);
assert.equal(noOp.updated, false);
assert.deepEqual(noOp.updates, {});
assert.deepEqual(noOp.insertedSetupFields, []);

console.log(
  JSON.stringify({
    status: "ok",
    dryRunDidNotWrite: true,
    backfilledRouteFields: true,
    insertedMissingLiveApproval: true,
    preservedManualFields: true,
    idempotent: true,
  }),
);
