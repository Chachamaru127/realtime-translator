#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderMeetingRuntimeEvidencePatch } from "../lib/meetingEvidencePatch.mjs";
import {
  checkEvidenceFile,
  readEvidenceFileArg,
} from "./check-meeting-smoke-evidence.mjs";
import { renderSmokeEvidence } from "./meeting-evidence.mjs";

const dir = mkdtempSync(join(tmpdir(), "meeting-evidence-check-"));
const routePath = join(dir, "route-snapshot.md");
writeFileSync(routePath, "# route\n", "utf8");

const pendingPath = join(dir, "pending-smoke.md");
writeFileSync(
  pendingPath,
  renderSmokeEvidence({
    app: "Zoom",
    now: new Date("2026-06-16T00:00:00.000Z"),
    routeSnapshotPath: routePath,
  }),
  "utf8",
);
const pending = checkEvidenceFile(pendingPath);
assert.equal(pending.ok, false);
assert(pending.errors.some((error) => error.includes("setup.app url")));
assert(pending.errors.some((error) => error.includes("case.Remote only")));
assert.equal(readEvidenceFileArg(["--scope", "endurance"]), null);
assert.equal(
  readEvidenceFileArg(["--scope", "endurance", pendingPath]),
  pendingPath,
);
assert.equal(
  readEvidenceFileArg([pendingPath, "--scope", "endurance"]),
  pendingPath,
);

const weakPath = join(dir, "weak-smoke.md");
writeFileSync(
  weakPath,
  renderCompleteEvidence(routePath)
    .replace("| session duration | 10:03 |", "| session duration | 9:59 |")
    .replace("| lane segments | 私 4; 相手 5 |", "| lane segments | 私 4; 相手 0 |")
    .replace("| translator remote | BlackHole 16ch |", "| translator remote | not found |")
    .replace("| local preflight | PASS |", "| local preflight | WARN: Dev server |")
    .replace(
      "| live approval | approved by operator at 2026-06-16T15:00:00+09:00 |",
      "| live approval | approved by operator |",
    )
    .replace("| input check | 私 18%; 相手 22% |", "| input check | idle; 私 0%; 相手 0% |")
    .replace("| meeting mic | HyperX SoloCast |", "| meeting mic | <physical mic> |")
    .replace(
      "| Remote only | 相手だけが話し、`相手` 側に字幕が出る | pass | 相手 lane 2 segments |",
      "| Remote only | 相手だけが話し、`相手` 側に字幕が出る | fail | <相手 lane evidence> |",
    ),
  "utf8",
);
const weak = checkEvidenceFile(weakPath);
assert.equal(weak.ok, false);
assert(
  weak.errors.some((error) =>
    error.includes("session duration must be at least 10 minutes"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("at least one 相手 segment"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("setup.translator remote must be an available value"),
  ),
);
  assert(
    weak.errors.some((error) =>
      error.includes("setup.local preflight must start with PASS"),
    ),
  );
  assert(
    weak.errors.some((error) =>
      error.includes("setup.live approval must be like approved by <operator> at <time>"),
    ),
  );
assert(
  weak.errors.some((error) =>
    error.includes("input check must be a checked/checking snapshot"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("input check must include a non-zero 私 level"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("input check must include a non-zero 相手 level"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("case.Remote only.result must be pass"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("setup.meeting mic must not be a placeholder"),
  ),
);
assert(
  weak.errors.some((error) =>
    error.includes("case.Remote only.evidence must not be a placeholder"),
  ),
);

const prefilled = renderSmokeEvidence({
  app: "Zoom",
  now: new Date("2026-06-16T00:00:00.000Z"),
  routeSnapshotPath: routePath,
  setup: {
    appUrl: "http://localhost:3002",
    translatorMic: "HyperX SoloCast",
    translatorRemote: "BlackHole 16ch",
    localPreflight: "PASS",
  },
});
assert(prefilled.includes("| app url | http://localhost:3002 |"));
assert(prefilled.includes("| translator mic | HyperX SoloCast |"));
assert(prefilled.includes("| translator remote | BlackHole 16ch |"));
assert(prefilled.includes("| local preflight | PASS |"));

const runtimePatchPath = join(dir, "runtime-patch-smoke.md");
writeFileSync(
  runtimePatchPath,
  renderCompleteEvidence(routePath)
    .replace("| browser | Chrome |", "| browser |  |")
    .replace("| input check | 私 18%; 相手 22% |", "| input check |  |")
    .replace("| session duration | 10:03 |", "| session duration |  |")
    .replace("| lane segments | 私 4; 相手 5 |", "| lane segments |  |")
    .concat(
      "\n",
      renderMeetingRuntimeEvidencePatch({
        appUrl: "http://localhost:3002/",
        browser: "Chrome",
        translatorMic: "HyperX SoloCast",
        translatorRemote: "BlackHole 16ch",
        autoInput: true,
        inputCheck: "checked; 私 18%; 相手 22%",
        sessionDuration: "10:03",
        laneSegments: "私 4; 相手 5",
        activeLanes: "私, 相手",
      }),
    ),
  "utf8",
);
const runtimePatch = checkEvidenceFile(runtimePatchPath);
assert.deepEqual(runtimePatch.errors, []);
assert.equal(runtimePatch.ok, true);

const completePath = join(dir, "complete-smoke.md");
writeFileSync(completePath, renderCompleteEvidence(routePath), "utf8");
const completeSmoke = checkEvidenceFile(completePath);
assert.deepEqual(completeSmoke.errors, []);
assert.equal(completeSmoke.ok, true);
const endurancePath = join(dir, "complete-endurance.md");
writeFileSync(
  endurancePath,
  renderCompleteEvidence(routePath).replace(
    "| session duration | 10:03 |",
    "| session duration | 30:02 |",
  ),
  "utf8",
);
const completeEndurance = checkEvidenceFile(endurancePath, {
  scope: "endurance",
});
assert.deepEqual(completeEndurance.errors, []);
assert.equal(completeEndurance.ok, true);

console.log(
  JSON.stringify({
    status: "ok",
    pendingDetected: true,
    scopeOptionValueNotFilePath: true,
    weakEvidenceRejected: true,
    prefilledSetupRendered: true,
    runtimePatchAccepted: true,
    completeSmokeAccepted: true,
    completeEnduranceAccepted: true,
  }),
);

function renderCompleteEvidence(routeSnapshotPath) {
  return `# Zoom Meeting Smoke Evidence

作成日: 2026-06-16T00:00:00.000Z

## Setup

| Field | Value |
| --- | --- |
| app url | http://localhost:3002 |
| browser | Chrome |
| meeting app | Zoom |
| speaker route | BlackHole 16ch + headphones |
| meeting mic | HyperX SoloCast |
| translator mic | HyperX SoloCast |
| translator remote | BlackHole 16ch |
| lane map | 私=translator mic; 相手=translator remote/playback |
| route snapshot | ${routeSnapshotPath} |
| local preflight | PASS |
| live approval | approved by operator at 2026-06-16T15:00:00+09:00 |
| input check | 私 18%; 相手 22% |
| session duration | 10:03 |
| lane segments | 私 4; 相手 5 |

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
| 30 min | 字幕継続、lane 入れ替わりなし、device lost なし | pass | 30:02 continuous |
`;
}
