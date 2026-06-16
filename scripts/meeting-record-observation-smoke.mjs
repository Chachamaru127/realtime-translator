#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderMeetingRuntimeEvidencePatch } from "../lib/meetingEvidencePatch.mjs";
import { checkEvidenceFile } from "./check-meeting-smoke-evidence.mjs";
import { renderSmokeEvidence } from "./meeting-evidence.mjs";
import {
  readObservationFileArg,
  recordObservationFile,
} from "./record-meeting-observation.mjs";

const dir = mkdtempSync(join(tmpdir(), "meeting-record-observation-"));
const routePath = join(dir, "route-snapshot.md");
const smokePath = join(dir, "zoom-smoke.md");
const legacySmokePath = join(dir, "legacy-zoom-smoke.md");
writeFileSync(routePath, "# route\n", "utf8");

writeFileSync(
  smokePath,
  renderSmokeEvidence({
    app: "Zoom",
    now: new Date("2026-06-16T00:00:00.000Z"),
    routeSnapshotPath: routePath,
    setup: {
      appUrl: "http://localhost:3002",
      translatorMic: "HyperX SoloCast",
      translatorRemote: "BlackHole 16ch",
      localPreflight: "PASS",
    },
  }).concat(
    "\n",
    renderMeetingRuntimeEvidencePatch({
      appUrl: "http://localhost:3002/",
      browser: "Chrome",
      translatorMic: "HyperX SoloCast",
      translatorRemote: "BlackHole 16ch",
      autoInput: true,
      inputCheck: "checking; 私 18%; 相手 22%",
      sessionDuration: "10:03",
      laneSegments: "私 4; 相手 5",
      activeLanes: "私, 相手",
    }),
  ),
  "utf8",
);

writeFileSync(
  legacySmokePath,
  readFileSync(smokePath, "utf8").replace(/^\| live approval \|.*\|\n/m, ""),
  "utf8",
);

const noOp = recordObservationFile(smokePath);
assert.equal(noOp.updated, false);
assert.match(noOp.error, /no observation updates provided/);

assert.equal(
  readObservationFileArg(["--speaker-route", "BlackHole 16ch + headphones"]),
  null,
);
assert.equal(
  readObservationFileArg([
    "--dry-run",
    smokePath,
    "--speaker-route",
    "BlackHole 16ch + headphones",
  ]),
  smokePath,
);
assert.equal(
  readObservationFileArg([smokePath, "--case=Remote only|pass|相手 lane 2 segments"]),
  smokePath,
);

const invalid = recordObservationFile(smokePath, {
  setup: { "speaker route": "BlackHole 16ch + headphones" },
  cases: [
    {
      caseName: "Remote only",
      result: "fail",
      evidence: "相手 lane did not appear",
    },
  ],
});
assert.equal(invalid.updated, false);
assert.match(invalid.error, /result must be pass/);

const unsafeSetup = recordObservationFile(smokePath, {
  setup: { "meeting mic": "HyperX SoloCast\n| injected | row |" },
});
assert.equal(unsafeSetup.updated, false);
assert.match(unsafeSetup.error, /must not include \| or line breaks/);

const unsafeEvidence = recordObservationFile(smokePath, {
  cases: [
    {
      caseName: "Remote only",
      result: "pass",
      evidence: "相手 lane 2 segments\n| injected | row |",
    },
  ],
});
assert.equal(unsafeEvidence.updated, false);
assert.match(unsafeEvidence.error, /must not include \| or line breaks/);

const placeholderSetup = recordObservationFile(smokePath, {
  setup: { "meeting mic": "<physical mic>" },
});
assert.equal(placeholderSetup.updated, false);
assert.match(placeholderSetup.error, /must not be a placeholder/);

const placeholderEvidence = recordObservationFile(smokePath, {
  cases: [
    {
      caseName: "Remote only",
      result: "pass",
      evidence: "<相手 lane evidence>",
    },
  ],
});
assert.equal(placeholderEvidence.updated, false);
assert.match(placeholderEvidence.error, /must not be a placeholder/);

const unapprovedSetup = recordObservationFile(smokePath, {
  setup: { "live approval": "not approved" },
});
assert.equal(unapprovedSetup.updated, false);
assert.match(unapprovedSetup.error, /live approval must be like approved by/);

const legacyApproval = recordObservationFile(legacySmokePath, {
  setup: {
    "live approval": "approved by operator at 2026-06-16T15:00:00+09:00",
  },
});
assert.equal(legacyApproval.updated, true);
assert.deepEqual(legacyApproval.insertedSetupFields, ["live approval"]);
assert(
  readFileSync(legacySmokePath, "utf8").includes(
    "| live approval | approved by operator at 2026-06-16T15:00:00+09:00 |",
  ),
);

const dryRun = recordObservationFile(smokePath, {
  dryRun: true,
  setup: setupUpdates(),
  cases: caseUpdates(),
});
assert.equal(dryRun.updated, true);
assert.equal(readFileSync(smokePath, "utf8").includes("remote confirmed no echo"), false);

const updated = recordObservationFile(smokePath, {
  setup: setupUpdates(),
  cases: caseUpdates(),
});
assert.equal(updated.updated, true);
assert.equal(updated.updates.setup["speaker route"], "BlackHole 16ch + headphones");
assert.equal(updated.updates.cases["Remote only"].result, "pass");

const checked = checkEvidenceFile(smokePath);
assert.deepEqual(checked.errors, []);
assert.equal(checked.ok, true);

console.log(
  JSON.stringify({
    status: "ok",
    noOpRejected: true,
    failResultRejected: true,
    unsafeSetupRejected: true,
    unsafeEvidenceRejected: true,
    placeholderSetupRejected: true,
    placeholderEvidenceRejected: true,
    unapprovedSetupRejected: true,
    legacyLiveApprovalInserted: true,
    missingFileArgWithOptionValueRejected: true,
    dryRunDidNotWrite: true,
    observationRecorded: true,
    checkerAcceptedRecordedEvidence: true,
  }),
);

function setupUpdates() {
  return {
    "speaker route": "BlackHole 16ch + headphones",
    "meeting mic": "HyperX SoloCast",
    "live approval": "approved by operator at 2026-06-16T15:00:00+09:00",
  };
}

function caseUpdates() {
  return [
    {
      caseName: "Remote only",
      result: "pass",
      evidence: "相手 lane 2 segments",
    },
    {
      caseName: "Mic only",
      result: "pass",
      evidence: "私 lane 2 segments",
    },
    {
      caseName: "Alternating",
      result: "pass",
      evidence: "lane order preserved",
    },
    {
      caseName: "No echo",
      result: "pass",
      evidence: "remote confirmed no echo",
    },
    {
      caseName: "10 min",
      result: "pass",
      evidence: "10:03 continuous",
    },
  ];
}
