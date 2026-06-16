#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProofStatus } from "./meeting-proof-status.mjs";

const dir = mkdtempSync(join(tmpdir(), "meeting-proof-status-"));
const evidenceDir = join(dir, "docs", "evidence");
mkdirSync(evidenceDir, { recursive: true });
const routePath = join(dir, "route-snapshot.md");
writeFileSync(routePath, "# route\n", "utf8");

const empty = buildProofStatus({ evidenceDir });
assert.equal(empty.ok, false);
assert.deepEqual(empty.requirements, {
  zoom10MinuteSmoke: null,
  googleMeet10MinuteSmoke: null,
  endurance30Minute: null,
});

const zoomPath = join(evidenceDir, "2026-06-16T00-00-00-zoom-smoke.md");
writeFileSync(zoomPath, renderEvidence({ app: "Zoom", routePath }), "utf8");
const zoomOnly = buildProofStatus({ evidenceDir });
assert.equal(zoomOnly.ok, false);
assert.equal(zoomOnly.requirements.zoom10MinuteSmoke, zoomPath);
assert.equal(zoomOnly.requirements.googleMeet10MinuteSmoke, null);
assert.equal(zoomOnly.requirements.endurance30Minute, null);

const meetPath = join(evidenceDir, "2026-06-16T00-10-00-google-meet-smoke.md");
writeFileSync(
  meetPath,
  renderEvidence({ app: "Google Meet", routePath }),
  "utf8",
);
const smokeOnly = buildProofStatus({ evidenceDir });
assert.equal(smokeOnly.ok, false);
assert.equal(smokeOnly.requirements.zoom10MinuteSmoke, zoomPath);
assert.equal(smokeOnly.requirements.googleMeet10MinuteSmoke, meetPath);
assert.equal(smokeOnly.requirements.endurance30Minute, null);

const endurancePath = join(evidenceDir, "2026-06-16T00-40-00-zoom-smoke.md");
writeFileSync(
  endurancePath,
  renderEvidence({ app: "Zoom", routePath, duration: "30:02" }),
  "utf8",
);
const complete = buildProofStatus({ evidenceDir });
assert.equal(complete.ok, true);
assert.equal(complete.requirements.zoom10MinuteSmoke, zoomPath);
assert.equal(complete.requirements.googleMeet10MinuteSmoke, meetPath);
assert.equal(complete.requirements.endurance30Minute, endurancePath);

console.log(
  JSON.stringify({
    status: "ok",
    emptyRejected: true,
    zoomOnlyRejected: true,
    smokeOnlyRejected: true,
    completeAccepted: true,
  }),
);

function renderEvidence({ app, routePath, duration = "10:03" }) {
  return `# ${app} Meeting Smoke Evidence

作成日: 2026-06-16T00:00:00.000Z

## Setup

| Field | Value |
| --- | --- |
| app url | http://localhost:3002 |
| browser | Chrome |
| meeting app | ${app} |
| speaker route | BlackHole 16ch + headphones |
| meeting mic | HyperX SoloCast |
| translator mic | HyperX SoloCast |
| translator remote | BlackHole 16ch |
| lane map | 私=translator mic; 相手=translator remote/playback |
| route snapshot | ${routePath} |
| local preflight | PASS |
| live approval | approved by operator at 2026-06-16T15:00:00+09:00 |
| input check | 私 18%; 相手 22% |
| session duration | ${duration} |
| lane segments | 私 4; 相手 5 |

## Cases

| Case | Expected | Result | Evidence |
| --- | --- | --- | --- |
| Remote only | 相手だけが話し、\`相手\` 側に字幕が出る | pass | 相手 lane 2 segments |
| Mic only | 自分だけが話し、\`私\` 側に字幕が出る | pass | 私 lane 2 segments |
| Alternating | 相手と自分が交互に話し、入力元どおり左右に残る | pass | lane order preserved |
| No echo | 相手音声が meeting microphone send に戻らない | pass | remote confirmed no echo |
| 10 min | 10 分で device lost / reconnect loop が起きない | pass | ${duration} continuous |

## Endurance

| Case | Expected | Result | Evidence |
| --- | --- | --- | --- |
| 30 min | 字幕継続、lane 入れ替わりなし、device lost なし | pass | ${duration} continuous |
`;
}
