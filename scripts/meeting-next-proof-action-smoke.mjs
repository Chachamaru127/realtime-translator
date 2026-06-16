#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNextProofAction,
  renderNextProofText,
} from "./meeting-next-proof-action.mjs";
import { buildProofStatus } from "./meeting-proof-status.mjs";

const dir = mkdtempSync(join(tmpdir(), "meeting-next-proof-action-"));
const routePath = join(dir, "route-snapshot.md");
writeFileSync(routePath, "# route\n", "utf8");

const emptyStatus = buildProofStatus({ evidenceDir: dir });
const emptyAction = buildNextProofAction(emptyStatus);
assert.equal(emptyAction.requirement, "zoom10MinuteSmoke");
assert(emptyAction.approvalGate.some((line) => /operator approval/.test(line)));
assert(emptyAction.approvalGate.some((line) => /OpenAI Realtime/.test(line)));
assertNoPlaceholders(emptyAction.commands);
assertNoPlaceholders(emptyAction.finalCommands);
assertHasPlaceholders(emptyAction.templateCommands);

const zoomPath = join(dir, "zoom-smoke.md");
writeFileSync(
  zoomPath,
  renderEvidence({ app: "Zoom", routePath }),
  "utf8",
);
const zoomOnlyStatus = buildProofStatus({ evidenceDir: dir });
const zoomOnlyAction = buildNextProofAction(zoomOnlyStatus);
assert.equal(zoomOnlyAction.requirement, "googleMeet10MinuteSmoke");
assert.equal(zoomOnlyAction.existingEvidenceFile, null);
assertNoPlaceholders(zoomOnlyAction.commands);
assertNoPlaceholders(zoomOnlyAction.finalCommands);
assertHasPlaceholders(zoomOnlyAction.templateCommands);

const meetPath = join(dir, "google-meet-smoke.md");
writeFileSync(
  meetPath,
  renderEvidence({ app: "Google Meet", routePath }),
  "utf8",
);
const smokeOnlyStatus = buildProofStatus({ evidenceDir: dir });
const smokeOnlyAction = buildNextProofAction(smokeOnlyStatus);
assert.equal(smokeOnlyAction.requirement, "endurance30Minute");
assert.equal(smokeOnlyAction.existingEvidenceFile, zoomPath);
assert(smokeOnlyAction.approvalGate.some((line) => /paid\/external/.test(line)));
assert.equal(smokeOnlyAction.commands.length, 0);
assert(smokeOnlyAction.runtimeEvidenceCommands.some((command) => command.includes(zoomPath)));
assert(smokeOnlyAction.finalCommands.some((command) => command.includes(zoomPath)));
assertNoPlaceholders(smokeOnlyAction.commands);
assertNoPlaceholders(smokeOnlyAction.runtimeEvidenceCommands);
assertNoPlaceholders(smokeOnlyAction.finalCommands);
assertHasPlaceholders(smokeOnlyAction.templateCommands);

const pendingZoomAction = buildNextProofAction({
  requirements: {
    zoom10MinuteSmoke: null,
    googleMeet10MinuteSmoke: null,
    endurance30Minute: null,
  },
  checkedFiles: [
    {
      file: zoomPath,
      app: "Zoom",
      smokeOk: false,
      enduranceOk: false,
      smokeErrors: [],
      enduranceErrors: [],
    },
  ],
});
assert.equal(pendingZoomAction.existingEvidenceFile, zoomPath);
assert.equal(pendingZoomAction.commands.length, 0);
assert(pendingZoomAction.runtimeEvidenceCommands.some((command) => command.includes(zoomPath)));
assert(pendingZoomAction.finalCommands.some((command) => command.includes(zoomPath)));
assertNoPlaceholders(pendingZoomAction.commands);
assertNoPlaceholders(pendingZoomAction.runtimeEvidenceCommands);
assertNoPlaceholders(pendingZoomAction.finalCommands);
assertHasPlaceholders(pendingZoomAction.templateCommands);
const pendingZoomText = renderNextProofText({
  ok: false,
  next: pendingZoomAction,
  requirements: {
    zoom10MinuteSmoke: null,
    googleMeet10MinuteSmoke: null,
    endurance30Minute: null,
  },
});
assert.match(pendingZoomText, /Next proof: zoom10MinuteSmoke/);
assert.doesNotMatch(pendingZoomText, /Runnable commands/);
assert.match(pendingZoomText, /After live run \/ 証跡コピー/);
assert.match(pendingZoomText, /Run these after the live run/);
assert.match(pendingZoomText, /Approval gate/);
assert.match(pendingZoomText, /paid\/external live proof/);
assert.match(pendingZoomText, /Observation template/);
assert.match(pendingZoomText, /After observation/);
assert.match(pendingZoomText, /Replace every <\.\.\.> \/ <timestamp>/);

writeFileSync(
  join(dir, "zoom-endurance-smoke.md"),
  renderEvidence({ app: "Zoom", routePath, duration: "30:02", endurance: true }),
  "utf8",
);
const completeStatus = buildProofStatus({ evidenceDir: dir });
assert.equal(buildNextProofAction(completeStatus).requirement, "complete");

console.log(
  JSON.stringify({
    status: "ok",
    emptySuggestsZoom: true,
    zoomOnlySuggestsMeet: true,
    smokeOnlySuggestsEndurance: true,
    pendingZoomUsesExistingFile: true,
    commandPhasesAreExplicit: true,
    runtimeEvidenceCommandsAreAfterLive: true,
    textOutputExplainsCommandPhases: true,
    textOutputIncludesApprovalGate: true,
    enduranceUsesExistingSmokeFile: true,
    completeSuggestsDone: true,
  }),
);

function assertNoPlaceholders(commands = []) {
  for (const command of commands) {
    assert(!command.includes("<"), `command must not include placeholder: ${command}`);
  }
}

function assertHasPlaceholders(commands = []) {
  assert(commands.some((command) => command.includes("<")));
}

function renderEvidence({
  app,
  routePath,
  duration = "10:03",
  endurance = false,
}) {
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
| input check | checking; 私 18%; 相手 22% |
| session duration | ${duration} |
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
| 30 min | 字幕継続、lane 入れ替わりなし、device lost なし | ${endurance ? "pass" : "pending"} | ${endurance ? "30:02 continuous" : ""} |
`;
}
