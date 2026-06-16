#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderMeetingRuntimeEvidencePatch } from "../lib/meetingEvidencePatch.mjs";
import {
  appendRuntimeEvidenceFile,
  readRuntimeEvidenceFileArg,
  validateRuntimeEvidencePatch,
} from "./append-meeting-runtime-evidence.mjs";
import { checkEvidenceFile } from "./check-meeting-smoke-evidence.mjs";

const dir = mkdtempSync(join(tmpdir(), "meeting-append-runtime-evidence-"));
const routePath = join(dir, "route-snapshot.md");
const smokePath = join(dir, "zoom-smoke.md");

writeFileSync(routePath, "# route\n", "utf8");
writeFileSync(smokePath, renderEvidence(routePath), "utf8");

const invalid = validateRuntimeEvidencePatch("browser: Chrome");
assert.equal(invalid.ok, false);
assert.match(invalid.error, /missing Runtime Evidence heading/);
assert.equal(readRuntimeEvidenceFileArg(["--input", "runtime.md"]), null);
assert.equal(
  readRuntimeEvidenceFileArg(["--input", "runtime.md", smokePath]),
  smokePath,
);
assert.equal(
  readRuntimeEvidenceFileArg([smokePath, "--input", "runtime.md"]),
  smokePath,
);

const weakPatch = renderMeetingRuntimeEvidencePatch({
  appUrl: "http://localhost:3002/",
  browser: "Chrome",
  translatorMic: "not found",
  translatorRemote: "not found",
  autoInput: true,
  inputCheck: "idle; 私 0%; 相手 0%",
  sessionDuration: "00:00",
  laneSegments: "私 0; 相手 0",
  activeLanes: "",
}).replace(
  "| lane map | 私=translator mic; 相手=translator remote/playback |",
  "| lane map | missing |",
);
const weak = validateRuntimeEvidencePatch(weakPatch);
assert.equal(weak.ok, false);
assert.match(weak.error, /translator mic must be an available value/);
assert.match(weak.error, /translator remote must be an available value/);
assert.match(weak.error, /lane map must include 私=translator mic/);
assert.match(weak.error, /lane map must include 相手=translator remote/);
assert.match(weak.error, /input check must be a checked\/checking snapshot/);
assert.match(weak.error, /session duration must be at least 10 minutes/);
assert.match(weak.error, /at least one 私 segment/);
assert.match(weak.error, /at least one 相手 segment/);

const sameDevicePatch = renderMeetingRuntimeEvidencePatch({
  appUrl: "http://localhost:3002/",
  browser: "Chrome",
  translatorMic: "HyperX SoloCast",
  translatorRemote: "HyperX SoloCast",
  autoInput: true,
  inputCheck: "checked; 私 18%; 相手 22%",
  sessionDuration: "10:03",
  laneSegments: "私 4; 相手 5",
  activeLanes: "私, 相手",
});
const sameDevice = validateRuntimeEvidencePatch(sameDevicePatch);
assert.equal(sameDevice.ok, false);
assert.match(sameDevice.error, /translator mic and translator remote must be different/);

const patch = renderMeetingRuntimeEvidencePatch({
  appUrl: "http://localhost:3002/?case=a|b",
  browser: "Chrome | Smoke",
  translatorMic: "HyperX | SoloCast",
  translatorRemote: "BlackHole | 16ch",
  autoInput: true,
  inputCheck: "checked; 私 18%; 相手 22%",
  sessionDuration: "10:03",
  laneSegments: "私 4; 相手 5",
  activeLanes: "私, 相手",
});

const dryRun = appendRuntimeEvidenceFile(smokePath, patch, { dryRun: true });
assert.equal(dryRun.appended, true);
assert.equal(readFileSync(smokePath, "utf8").includes("## Runtime Evidence"), false);

const appended = appendRuntimeEvidenceFile(smokePath, patch);
assert.equal(appended.appended, true);
assert.equal(appended.fields["app url"], "http://localhost:3002/?case=a|b");
assert.equal(appended.fields.browser, "Chrome | Smoke");
assert.equal(appended.fields["translator mic"], "HyperX | SoloCast");
assert.equal(appended.fields["translator remote"], "BlackHole | 16ch");
assert.equal(readFileSync(smokePath, "utf8").includes("## Runtime Evidence"), true);

const checked = checkEvidenceFile(smokePath);
assert.deepEqual(checked.errors, []);
assert.equal(checked.ok, true);

console.log(
  JSON.stringify({
    status: "ok",
    invalidPatchRejected: true,
    weakPatchRejected: true,
    sameDeviceRejected: true,
    missingFileArgWithOptionValueRejected: true,
    escapedPipeRuntimeEvidenceAccepted: true,
    dryRunDidNotWrite: true,
    appendedRuntimeEvidence: true,
    checkerAcceptedAppendedPatch: true,
  }),
);

function renderEvidence(routeSnapshotPath) {
  return `# Zoom Meeting Smoke Evidence

作成日: 2026-06-16T00:00:00.000Z

## Setup

| Field | Value |
| --- | --- |
| app url | http://localhost:3002 |
| browser |  |
| meeting app | Zoom |
| speaker route | BlackHole 16ch + headphones |
| meeting mic | HyperX SoloCast |
| translator mic | HyperX SoloCast |
| translator remote | BlackHole 16ch |
| lane map | 私=translator mic; 相手=translator remote/playback |
| route snapshot | ${routeSnapshotPath} |
| local preflight | PASS |
| live approval | approved by operator at 2026-06-16T15:00:00+09:00 |
| input check |  |
| session duration |  |
| lane segments |  |

## Cases

| Case | Expected | Result | Evidence |
| --- | --- | --- | --- |
| Remote only | 相手だけが話し、\`相手\` 側に字幕が出る | pass | 相手 lane 2 segments |
| Mic only | 自分だけが話し、\`私\` 側に字幕が出る | pass | 私 lane 2 segments |
| Alternating | 相手と自分が交互に話し、入力元どおり左右に残る | pass | lane order preserved |
| No echo | 相手音声が meeting microphone send に戻らない | pass | remote confirmed no echo |
| 10 min | 10 分で device lost / reconnect loop が起きない | pass | 10:03 continuous |

## Endurance

| Case | Expected | Result | Evidence |
| --- | --- | --- | --- |
| 30 min | 字幕継続、lane 入れ替わりなし、device lost なし | pending |  |
`;
}
