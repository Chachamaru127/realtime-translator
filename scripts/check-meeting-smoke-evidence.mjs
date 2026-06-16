#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMarkdownRow } from "./markdown-table.mjs";

const SETUP_FIELDS = [
  "app url",
  "browser",
  "meeting app",
  "speaker route",
  "meeting mic",
  "translator mic",
  "translator remote",
  "lane map",
  "route snapshot",
  "local preflight",
  "live approval",
  "input check",
  "session duration",
  "lane segments",
];

const SMOKE_CASES = [
  "Remote only",
  "Mic only",
  "Alternating",
  "No echo",
  "10 min",
];
const ENDURANCE_CASES = ["30 min"];
const MIN_SMOKE_SECONDS = 10 * 60;
const MIN_ENDURANCE_SECONDS = 30 * 60;

export function checkEvidenceFile(filePath, { scope = "smoke" } = {}) {
  const absolutePath = resolve(filePath);
  const text = readFileSync(absolutePath, "utf8");
  const setup = parseSetup(text);
  const cases = parseCases(text);
  const errors = [];

  for (const field of SETUP_FIELDS) {
    if (!isFilled(setup[field])) errors.push(`setup.${field} is empty`);
    else if (isPlaceholder(setup[field])) {
      errors.push(`setup.${field} must not be a placeholder`);
    }
  }

  const routeSnapshot = setup["route snapshot"];
  if (isFilled(routeSnapshot)) {
    const routePath = isAbsolute(routeSnapshot)
      ? routeSnapshot
      : resolve(dirname(absolutePath), "..", "..", routeSnapshot);
    if (!existsSync(routePath)) {
      errors.push(`setup.route snapshot does not exist: ${routeSnapshot}`);
    }
  }
  assertLaneMap(setup["lane map"], errors);
  assertDifferentDevices(setup["translator mic"], setup["translator remote"], errors);
  assertAvailable("app url", setup["app url"], errors);
  assertAvailable("translator mic", setup["translator mic"], errors);
  assertAvailable("translator remote", setup["translator remote"], errors);
  assertLocalPreflight(setup["local preflight"], errors);
  assertLiveApproval(setup["live approval"], errors);
  assertInputCheck(setup["input check"], errors);
  assertDuration(
    setup["session duration"],
    scope === "endurance" ? MIN_ENDURANCE_SECONDS : MIN_SMOKE_SECONDS,
    scope,
    errors,
  );
  assertLaneSegments(setup["lane segments"], errors);

  for (const caseName of SMOKE_CASES) {
    assertCaseFilled(caseName, cases, errors);
  }
  if (scope === "endurance") {
    for (const caseName of ENDURANCE_CASES) {
      assertCaseFilled(caseName, cases, errors);
    }
  }

  return {
    ok: errors.length === 0,
    scope,
    file: absolutePath,
    errors,
  };
}

function main() {
  const args = process.argv.slice(2);
  const filePath = readEvidenceFileArg(args);
  const scope = readOption(args, "--scope") ?? "smoke";
  if (!filePath || (scope !== "smoke" && scope !== "endurance")) {
    console.error(
      "usage: pnpm meeting:check-evidence <docs/evidence/*-smoke.md> [--scope=smoke|endurance]",
    );
    process.exit(2);
  }

  const result = checkEvidenceFile(filePath, { scope });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export function readEvidenceFileArg(args) {
  const consumed = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scope") {
      consumed.add(index);
      if (args[index + 1] && !args[index + 1].startsWith("--")) {
        consumed.add(index + 1);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--scope=")) consumed.add(index);
  }

  return (
    args.find((arg, index) => !consumed.has(index) && !arg.startsWith("--")) ??
    null
  );
}

function assertCaseFilled(caseName, cases, errors) {
  const row = cases[caseName];
  if (!row) {
    errors.push(`case.${caseName} is missing`);
    return;
  }
  if (!isFilled(row.result)) errors.push(`case.${caseName}.result is empty`);
  else if (!/^pass$/i.test(row.result.trim())) {
    errors.push(`case.${caseName}.result must be pass`);
  }
  if (!isFilled(row.evidence)) errors.push(`case.${caseName}.evidence is empty`);
  else if (isPlaceholder(row.evidence)) {
    errors.push(`case.${caseName}.evidence must not be a placeholder`);
  }
}

function assertLaneMap(value, errors) {
  const normalized = String(value ?? "");
  if (!/私=.*translator mic/i.test(normalized)) {
    errors.push("setup.lane map must include 私=translator mic");
  }
  if (!/相手=.*translator remote/i.test(normalized)) {
    errors.push("setup.lane map must include 相手=translator remote");
  }
}

function assertDifferentDevices(mic, remote, errors) {
  const left = String(mic ?? "").trim().toLowerCase();
  const right = String(remote ?? "").trim().toLowerCase();
  if (left && right && left === right) {
    errors.push("setup.translator mic and translator remote must be different");
  }
}

function assertAvailable(field, value, errors) {
  const normalized = String(value ?? "").trim();
  if (/^(not found|none|missing)$/i.test(normalized)) {
    errors.push(`setup.${field} must be an available value`);
  }
}

function assertLocalPreflight(value, errors) {
  const normalized = String(value ?? "").trim();
  if (normalized && !/^pass\b/i.test(normalized)) {
    errors.push("setup.local preflight must start with PASS");
  }
}

function assertLiveApproval(value, errors) {
  const normalized = String(value ?? "").trim();
  if (normalized && !/^approved\b.*\bby\b.+\bat\b.+/i.test(normalized)) {
    errors.push("setup.live approval must be like approved by <operator> at <time>");
  }
}

function assertInputCheck(value, errors) {
  const text = String(value ?? "").trim();
  if (!text) return;
  if (/\b(idle|starting|error)\b/i.test(text)) {
    errors.push("setup.input check must be a checked/checking snapshot from both lanes");
  }

  const self = readPercent(text, "私");
  const remote = readPercent(text, "相手");
  if (self == null || remote == null) {
    errors.push("setup.input check must include 私 <percent>% and 相手 <percent>%");
    return;
  }
  if (self <= 0) errors.push("setup.input check must include a non-zero 私 level");
  if (remote <= 0) errors.push("setup.input check must include a non-zero 相手 level");
}

function assertDuration(value, minimumSeconds, scope, errors) {
  const seconds = parseDurationSeconds(value);
  if (seconds == null) {
    errors.push("setup.session duration must be a duration like 10:03 or 00:10:03");
    return;
  }
  if (seconds < minimumSeconds) {
    const minutes = Math.floor(minimumSeconds / 60);
    errors.push(`setup.session duration must be at least ${minutes} minutes for ${scope}`);
  }
}

function assertLaneSegments(value, errors) {
  const text = String(value ?? "");
  const self = readLaneCount(text, "私");
  const remote = readLaneCount(text, "相手");
  if (self == null || remote == null) {
    errors.push("setup.lane segments must include 私 <count> and 相手 <count>");
    return;
  }
  if (self < 1) errors.push("setup.lane segments must include at least one 私 segment");
  if (remote < 1) errors.push("setup.lane segments must include at least one 相手 segment");
}

function parseSetup(text) {
  const setup = {};
  for (const line of text.split("\n")) {
    const cells = parseMarkdownRow(line);
    if (cells.length !== 2) continue;
    const [field, value] = cells;
    if (SETUP_FIELDS.includes(field)) setup[field] = value;
  }
  return setup;
}

function parseCases(text) {
  const cases = {};
  for (const line of text.split("\n")) {
    const cells = parseMarkdownRow(line);
    if (cells.length !== 4) continue;
    const [caseName, expected, result, evidence] = cells;
    if ([...SMOKE_CASES, ...ENDURANCE_CASES].includes(caseName)) {
      cases[caseName] = { expected, result, evidence };
    }
  }
  return cases;
}

function isFilled(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !/^pending$/i.test(normalized);
}

function isPlaceholder(value) {
  return /^<[^>]+>$/.test(String(value ?? "").trim());
}

function parseDurationSeconds(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const colonParts = text.split(":").map((part) => part.trim());
  if (
    colonParts.length >= 2 &&
    colonParts.length <= 3 &&
    colonParts.every((part) => /^\d+$/.test(part))
  ) {
    const numbers = colonParts.map((part) => Number(part));
    if (numbers.some((number) => !Number.isFinite(number))) return null;
    if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
    return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  }
  const minuteMatch = text.match(/(\d+)\s*(?:min|minutes|分)/i);
  if (minuteMatch) return Number(minuteMatch[1]) * 60;
  return null;
}

function readLaneCount(text, label) {
  const match = text.match(new RegExp(`${label}\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function readPercent(text, label) {
  const match = text.match(new RegExp(`${label}\\s*(\\d+(?:\\.\\d+)?)\\s*%`));
  return match ? Number(match[1]) : null;
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
