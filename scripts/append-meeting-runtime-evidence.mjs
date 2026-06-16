#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMarkdownRow } from "./markdown-table.mjs";

const REQUIRED_RUNTIME_FIELDS = [
  "app url",
  "browser",
  "translator mic",
  "translator remote",
  "lane map",
  "input check",
  "session duration",
  "lane segments",
];
const MIN_RUNTIME_SECONDS = 10 * 60;

export function appendRuntimeEvidenceFile(filePath, patch, { dryRun = false } = {}) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return { file: absolutePath, appended: false, error: "smoke evidence file not found" };
  }

  const validation = validateRuntimeEvidencePatch(patch);
  if (!validation.ok) {
    return { file: absolutePath, appended: false, error: validation.error };
  }

  const current = readFileSync(absolutePath, "utf8");
  const next = `${current.trimEnd()}\n\n${patch.trim()}\n`;
  if (!dryRun) writeFileSync(absolutePath, next, "utf8");
  return {
    file: absolutePath,
    appended: true,
    dryRun,
    fields: validation.fields,
  };
}

export function validateRuntimeEvidencePatch(patch) {
  const text = String(patch ?? "");
  if (!/^## Runtime Evidence\b/m.test(text)) {
    return { ok: false, error: "missing Runtime Evidence heading" };
  }

  const fields = {};
  for (const line of text.split("\n")) {
    const cells = parseMarkdownRow(line);
    if (cells.length === 2 && cells[0] !== "Field") fields[cells[0]] = cells[1];
  }

  const missing = REQUIRED_RUNTIME_FIELDS.filter((field) => !isFilled(fields[field]));
  if (missing.length) {
    return {
      ok: false,
      error: `missing Runtime Evidence fields: ${missing.join(", ")}`,
    };
  }

  const errors = [];
  validateAvailable("app url", fields["app url"], errors);
  validateAvailable("translator mic", fields["translator mic"], errors);
  validateAvailable("translator remote", fields["translator remote"], errors);
  validateDifferentDevices(fields["translator mic"], fields["translator remote"], errors);
  validateLaneMap(fields["lane map"], errors);
  validateInputCheck(fields["input check"], errors);
  validateDuration(fields["session duration"], errors);
  validateLaneSegments(fields["lane segments"], errors);
  if (errors.length) {
    return {
      ok: false,
      error: `invalid Runtime Evidence: ${errors.join("; ")}`,
    };
  }
  return { ok: true, fields };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = readRuntimeEvidenceFileArg(args);
  if (!filePath) {
    console.error(
      "usage: pnpm meeting:append-runtime-evidence <docs/evidence/*-smoke.md> [--clipboard|--input=<file>|--input <file>|--stdin] [--dry-run]",
    );
    process.exit(2);
  }

  const patch = readPatch(args);
  const result = appendRuntimeEvidenceFile(filePath, patch, { dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

export function readRuntimeEvidenceFileArg(args) {
  const consumed = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run" || arg === "--clipboard" || arg === "--stdin") {
      consumed.add(index);
      continue;
    }
    if (arg === "--input") {
      consumed.add(index);
      if (args[index + 1] && !args[index + 1].startsWith("--")) {
        consumed.add(index + 1);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--input=")) consumed.add(index);
  }

  return (
    args.find((arg, index) => !consumed.has(index) && !arg.startsWith("--")) ??
    null
  );
}

function readPatch(args) {
  const input = readOption(args, "--input");
  if (input) return readFileSync(resolve(input), "utf8");
  if (args.includes("--stdin")) return readFileSync(0, "utf8");
  return execFileSync("pbpaste", { encoding: "utf8" });
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];
  return null;
}

function isFilled(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !/^pending$/i.test(normalized);
}

function validateInputCheck(value, errors) {
  const text = String(value ?? "").trim();
  if (/\b(idle|starting|error)\b/i.test(text)) {
    errors.push("input check must be a checked/checking snapshot from both lanes");
  }
  const self = readPercent(text, "私");
  const remote = readPercent(text, "相手");
  if (self == null || remote == null) {
    errors.push("input check must include 私 <percent>% and 相手 <percent>%");
    return;
  }
  if (self <= 0) errors.push("input check must include a non-zero 私 level");
  if (remote <= 0) errors.push("input check must include a non-zero 相手 level");
}

function validateAvailable(field, value, errors) {
  const normalized = String(value ?? "").trim();
  if (/^(not found|none|missing)$/i.test(normalized)) {
    errors.push(`${field} must be an available value`);
  }
}

function validateDifferentDevices(mic, remote, errors) {
  const left = String(mic ?? "").trim().toLowerCase();
  const right = String(remote ?? "").trim().toLowerCase();
  if (left && right && left === right) {
    errors.push("translator mic and translator remote must be different");
  }
}

function validateLaneMap(value, errors) {
  const normalized = String(value ?? "");
  if (!/私=.*translator mic/i.test(normalized)) {
    errors.push("lane map must include 私=translator mic");
  }
  if (!/相手=.*translator remote/i.test(normalized)) {
    errors.push("lane map must include 相手=translator remote");
  }
}

function validateDuration(value, errors) {
  const seconds = parseDurationSeconds(value);
  if (seconds == null) {
    errors.push("session duration must be a duration like 10:03 or 00:10:03");
    return;
  }
  if (seconds < MIN_RUNTIME_SECONDS) {
    errors.push("session duration must be at least 10 minutes");
  }
}

function validateLaneSegments(value, errors) {
  const text = String(value ?? "");
  const self = readLaneCount(text, "私");
  const remote = readLaneCount(text, "相手");
  if (self == null || remote == null) {
    errors.push("lane segments must include 私 <count> and 相手 <count>");
    return;
  }
  if (self < 1) errors.push("lane segments must include at least one 私 segment");
  if (remote < 1) errors.push("lane segments must include at least one 相手 segment");
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
