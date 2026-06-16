#!/usr/bin/env node

import { isAbsolute, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { buildProofStatus } from "./meeting-proof-status.mjs";

const LIVE_APPROVAL_GATE = [
  "Get explicit operator approval before starting paid/external live proof.",
  "The local prep commands are safe, but pressing 会議通訳を始める opens OpenAI Realtime sessions and uses live Zoom / Google Meet audio.",
  "Do not start the live run unless the meeting route, counterpart, and no-echo observation path are ready.",
];

export function buildNextProofAction(status) {
  const requirements = status.requirements ?? {};
  if (!requirements.zoom10MinuteSmoke) {
    const evidenceFile = findExistingEvidenceFile(status, "Zoom");
    return liveSmokeAction({
      requirement: "zoom10MinuteSmoke",
      app: "Zoom",
      prepareCommand: "pnpm meeting:prepare-smoke -- zoom",
      evidenceTarget: evidenceFile ?? "docs/evidence/<timestamp>-zoom-smoke.md",
      existingEvidenceFile: evidenceFile,
      speakerRoute: "Zoom speaker = BlackHole 16ch or Multi-Output including BlackHole",
      meetingMic: "Zoom microphone = physical mic",
    });
  }

  if (!requirements.googleMeet10MinuteSmoke) {
    const evidenceFile = findExistingEvidenceFile(status, "Google Meet");
    return liveSmokeAction({
      requirement: "googleMeet10MinuteSmoke",
      app: "Google Meet",
      prepareCommand: "pnpm meeting:prepare-smoke -- meet",
      evidenceTarget: evidenceFile ?? "docs/evidence/<timestamp>-google-meet-smoke.md",
      existingEvidenceFile: evidenceFile,
      speakerRoute: "Google Meet speaker = BlackHole 16ch or Multi-Output including BlackHole",
      meetingMic: "Google Meet microphone = physical mic",
    });
  }

  if (!requirements.endurance30Minute) {
    const evidenceFile =
      findExistingEvidenceFile(status, "Zoom", (report) => report.smokeOk) ??
      findExistingEvidenceFile(status, "Google Meet", (report) => report.smokeOk) ??
      "docs/evidence/<timestamp>-zoom-smoke.md";
    return {
      requirement: "endurance30Minute",
      app: "Zoom or Google Meet",
      why: "Zoom and Google Meet 10 minute smoke evidence exist, but no 30 minute endurance evidence has passed.",
      existingEvidenceFile: evidenceFile.includes("<timestamp>") ? null : evidenceFile,
      freshPrepareCommand: "pnpm meeting:prepare-smoke -- zoom",
      approvalGate: LIVE_APPROVAL_GATE,
      commands: evidenceFile.includes("<timestamp>")
        ? ["pnpm meeting:prepare-smoke -- zoom"]
        : [],
      runtimeEvidenceCommands: evidenceFile.includes("<timestamp>")
        ? []
        : [`pnpm meeting:append-runtime-evidence ${evidenceFile} --clipboard`],
      templateCommands: evidenceFile.includes("<timestamp>")
        ? [
            `pnpm meeting:append-runtime-evidence ${evidenceFile} --clipboard`,
            recordEnduranceObservationCommand(evidenceFile),
            `pnpm meeting:check-evidence ${evidenceFile} --scope=endurance`,
            "pnpm meeting:proof-status",
          ]
        : [recordEnduranceObservationCommand(evidenceFile)],
      finalCommands: evidenceFile.includes("<timestamp>")
        ? []
        : [
            `pnpm meeting:check-evidence ${evidenceFile} --scope=endurance`,
            "pnpm meeting:proof-status",
          ],
      manualChecks: [
        "Run meeting mode continuously for 30 minutes.",
        "Keep 私 and 相手 lane counts non-zero and stable.",
        "Confirm no device lost or reconnect loop.",
        "Confirm lane ownership does not flip.",
        "Fill the 30 min case result and evidence.",
        "Replace every <...> placeholder in templateCommands before running it.",
      ],
    };
  }

  return {
    requirement: "complete",
    app: null,
    why: "Zoom smoke, Google Meet smoke, and 30 minute endurance evidence all pass.",
    commands: ["pnpm meeting:proof-status"],
    manualChecks: [],
  };
}

export function renderNextProofText({ ok, next, requirements }) {
  const lines = [
    `Next proof: ${next.requirement}`,
    `Status: ${ok ? "complete" : "incomplete"}`,
  ];
  if (next.app) lines.push(`App: ${next.app}`);
  if (next.why) lines.push(`Why: ${next.why}`);
  if (next.existingEvidenceFile) {
    lines.push(`Evidence file: ${next.existingEvidenceFile}`);
  }
  if (next.freshPrepareCommand) {
    lines.push(`Fresh route prep: ${next.freshPrepareCommand}`);
  }
  appendListSection(lines, "Approval gate", next.approvalGate);

  appendCommandSection(
    lines,
    "Before live run",
    next.commands,
    "Run only commands that do not read the clipboard here. Clipboard/runtime evidence commands belong after the live run.",
  );
  appendCommandSection(
    lines,
    "After live run / 証跡コピー",
    next.runtimeEvidenceCommands,
    "Run these after the live run and after pressing in-app 証跡コピー.",
  );
  appendCommandSection(
    lines,
    "Observation template",
    next.templateCommands,
    "Replace every <...> / <timestamp> value with live observations or generated paths before running.",
  );
  appendCommandSection(
    lines,
    "After observation",
    next.finalCommands,
    "Run these after runtime evidence and observation rows are recorded.",
  );
  appendListSection(lines, "Manual checks", next.manualChecks);

  if (requirements) {
    lines.push("", "Requirements");
    for (const [key, value] of Object.entries(requirements)) {
      lines.push(`- ${key}: ${value ? "pass" : "missing"}`);
    }
  }

  return lines.join("\n");
}

function appendCommandSection(lines, title, commands = [], help) {
  if (!commands?.length) return;
  lines.push("", title);
  if (help) lines.push(help);
  commands.forEach((command, index) => {
    lines.push(`${index + 1}. ${command}`);
  });
}

function appendListSection(lines, title, values = []) {
  if (!values?.length) return;
  lines.push("", title);
  for (const value of values) lines.push(`- ${value}`);
}

function liveSmokeAction({
  requirement,
  app,
  prepareCommand,
  evidenceTarget,
  existingEvidenceFile,
  speakerRoute,
  meetingMic,
}) {
  return {
    requirement,
    app,
    why: `${app} 10 minute smoke evidence has not passed yet.`,
    existingEvidenceFile,
    freshPrepareCommand: prepareCommand,
    approvalGate: LIVE_APPROVAL_GATE,
    commands: existingEvidenceFile
      ? []
      : [prepareCommand],
    runtimeEvidenceCommands: existingEvidenceFile
      ? [`pnpm meeting:append-runtime-evidence ${evidenceTarget} --clipboard`]
      : [],
    templateCommands: existingEvidenceFile
      ? [recordSmokeObservationCommand(evidenceTarget)]
      : [
          `pnpm meeting:append-runtime-evidence ${evidenceTarget} --clipboard`,
          recordSmokeObservationCommand(evidenceTarget),
          `pnpm meeting:check-evidence ${evidenceTarget}`,
          "pnpm meeting:proof-status",
        ],
    finalCommands: existingEvidenceFile
      ? [
          `pnpm meeting:check-evidence ${evidenceTarget}`,
          "pnpm meeting:proof-status",
        ]
      : [],
    manualChecks: [
      speakerRoute,
      meetingMic,
      "Realtime Translate meeting mode = auto input selection on",
      "Input check snapshot = checked/checking; 私 > 0%; 相手 > 0%",
      "Remote only: 相手 lane gets captions",
      "Mic only: 私 lane gets captions",
      "Alternating: lanes stay aligned to input source",
      "No echo: remote audio does not return to the meeting microphone send lane",
      "10 min: no device lost or reconnect loop",
      "Replace every <...> placeholder in templateCommands before running it.",
    ],
  };
}

function recordSmokeObservationCommand(evidenceTarget) {
  return [
    `pnpm meeting:record-observation ${evidenceTarget}`,
    '--live-approval="approved by <operator> at <time>"',
    '--speaker-route="<BlackHole 16ch + headphones>"',
    '--meeting-mic="<physical mic>"',
    '--case="Remote only|pass|<相手 lane evidence>"',
    '--case="Mic only|pass|<私 lane evidence>"',
    '--case="Alternating|pass|<lane order evidence>"',
    '--case="No echo|pass|<no echo evidence>"',
    '--case="10 min|pass|<10 minute evidence>"',
  ].join(" ");
}

function recordEnduranceObservationCommand(evidenceTarget) {
  return [
    `pnpm meeting:record-observation ${evidenceTarget}`,
    '--live-approval="approved by <operator> at <time>"',
    '--case="30 min|pass|<30 minute evidence>"',
  ].join(" ");
}

function findExistingEvidenceFile(status, app, predicate = () => true) {
  const reports = status.checkedFiles ?? [];
  const matches = reports.filter(
    (report) => report.app === app && report.file && predicate(report),
  );
  const last = matches.at(-1)?.file;
  return last ? displayPath(last) : null;
}

function displayPath(filePath) {
  if (!isAbsolute(filePath)) return filePath;
  const relativePath = relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..")) return relativePath;
  return filePath;
}

function main() {
  const status = buildProofStatus();
  const next = buildNextProofAction(status);
  const payload = {
    ok: status.ok,
    next,
    requirements: status.requirements,
  };
  if (process.argv.includes("--text")) {
    console.log(renderNextProofText(payload));
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
