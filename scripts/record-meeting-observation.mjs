#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SETUP_OPTIONS = {
  "--browser": "browser",
  "--speaker-route": "speaker route",
  "--meeting-mic": "meeting mic",
  "--live-approval": "live approval",
};

const INSERTABLE_SETUP_FIELDS = {
  "live approval": ["local preflight", "route snapshot"],
};

const CASES = new Set([
  "Remote only",
  "Mic only",
  "Alternating",
  "No echo",
  "10 min",
  "30 min",
]);

export function recordObservationFile(
  filePath,
  { setup = {}, cases = [], dryRun = false } = {},
) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return { file: absolutePath, updated: false, error: "smoke evidence file not found" };
  }

  const validationError = validateUpdates(setup, cases);
  if (validationError) {
    return { file: absolutePath, updated: false, error: validationError };
  }

  let text = readFileSync(absolutePath, "utf8");
  const updates = { setup: {}, cases: {} };
  const insertedSetupFields = [];

  for (const [field, value] of Object.entries(setup)) {
    if (!isFilled(value)) continue;
    const withField = ensureSetupField(text, field);
    if (withField !== text) {
      text = withField;
      insertedSetupFields.push(field);
    }
    const next = replaceSetupValue(text, field, value);
    if (next === text) {
      return { file: absolutePath, updated: false, error: `setup field not found: ${field}` };
    }
    text = next;
    updates.setup[field] = value;
  }

  for (const update of cases) {
    const next = replaceCaseRow(text, update);
    if (next === text) {
      return { file: absolutePath, updated: false, error: `case row not found: ${update.caseName}` };
    }
    text = next;
    updates.cases[update.caseName] = {
      result: update.result,
      evidence: update.evidence,
    };
  }

  const updated =
    Object.keys(updates.setup).length > 0 ||
    Object.keys(updates.cases).length > 0;
  if (updated && !dryRun) writeFileSync(absolutePath, text, "utf8");
  return { file: absolutePath, dryRun, updated, updates, insertedSetupFields };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = readObservationFileArg(args);
  if (!filePath) {
    console.error(
      [
        "usage: pnpm meeting:record-observation <docs/evidence/*-smoke.md> [--dry-run]",
        '       [--browser="Chrome"] [--speaker-route="BlackHole 16ch + headphones"] [--meeting-mic="HyperX SoloCast"] [--live-approval="approved by operator at 2026-06-16T15:00:00+09:00"]',
        '       [--case="Remote only|pass|相手 lane 2 segments"] ...',
      ].join("\n"),
    );
    process.exit(2);
  }

  const parsed = parseArgs(args);
  const result = recordObservationFile(filePath, {
    setup: parsed.setup,
    cases: parsed.cases,
    dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.error ? 1 : 0);
}

export function parseObservationArgs(args) {
  return parseArgs(args);
}

export function readObservationFileArg(args) {
  const consumed = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      consumed.add(index);
      continue;
    }
    if (arg.startsWith("--")) {
      consumed.add(index);
      if (
        !arg.includes("=") &&
        args[index + 1] &&
        !args[index + 1].startsWith("--")
      ) {
        consumed.add(index + 1);
        index += 1;
      }
    }
  }

  return (
    args.find((arg, index) => !consumed.has(index) && !arg.startsWith("--")) ??
    null
  );
}

function parseArgs(args) {
  const setup = {};
  const cases = [];

  for (const [option, field] of Object.entries(SETUP_OPTIONS)) {
    const value = readOption(args, option);
    if (value != null) setup[field] = value;
  }

  for (const value of readRepeatedOption(args, "--case")) {
    const [caseName, result, ...evidenceParts] = value.split("|");
    cases.push({
      caseName: caseName?.trim() ?? "",
      result: result?.trim() ?? "",
      evidence: evidenceParts.join("|").trim(),
    });
  }

  return { setup, cases };
}

function validateUpdates(setup, cases) {
  if (!Object.keys(setup).length && !cases.length) {
    return "no observation updates provided";
  }

  for (const [field, value] of Object.entries(setup)) {
    if (!isFilled(value)) return `setup.${field} is empty`;
    if (hasUnsafeCellText(value)) {
      return `setup.${field} must not include | or line breaks`;
    }
    if (isPlaceholder(value)) return `setup.${field} must not be a placeholder`;
    if (
      field === "live approval" &&
      !/^approved\b.*\bby\b.+\bat\b.+/i.test(value.trim())
    ) {
      return "setup.live approval must be like approved by <operator> at <time>";
    }
  }

  for (const update of cases) {
    if (!CASES.has(update.caseName)) return `unknown case: ${update.caseName}`;
    if (!/^pass$/i.test(update.result)) {
      return `case.${update.caseName}.result must be pass`;
    }
    if (!isFilled(update.evidence)) {
      return `case.${update.caseName}.evidence is empty`;
    }
    if (hasUnsafeCellText(update.evidence)) {
      return `case.${update.caseName}.evidence must not include | or line breaks`;
    }
    if (isPlaceholder(update.evidence)) {
      return `case.${update.caseName}.evidence must not be a placeholder`;
    }
  }

  return null;
}

function replaceSetupValue(text, field, value) {
  return text.replace(
    new RegExp(`^\\| ${escapeRegExp(field)} \\|[^|]*\\|$`, "m"),
    `| ${field} | ${value.trim()} |`,
  );
}

function ensureSetupField(text, field) {
  if (hasSetupField(text, field)) return text;
  const anchors = INSERTABLE_SETUP_FIELDS[field] ?? [];
  for (const anchor of anchors) {
    const next = text.replace(
      new RegExp(`^(\\| ${escapeRegExp(anchor)} \\|[^|]*\\|)$`, "m"),
      `$1\n| ${field} |  |`,
    );
    if (next !== text) return next;
  }
  return text;
}

function hasSetupField(text, field) {
  return new RegExp(`^\\| ${escapeRegExp(field)} \\|[^|]*\\|$`, "m").test(text);
}

function replaceCaseRow(text, { caseName, result, evidence }) {
  const escapedCase = escapeRegExp(caseName);
  const row = new RegExp(
    `^\\| ${escapedCase} \\|([^|]*)\\|([^|]*)\\|([^|]*)\\|$`,
    "m",
  );
  return text.replace(row, (line, expected) => {
    return `| ${caseName} |${expected}| ${result.trim()} | ${evidence.trim()} |`;
  });
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];
  return null;
}

function readRepeatedOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
    else if (arg === name && args[index + 1]) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function isFilled(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !/^pending$/i.test(normalized);
}

function hasUnsafeCellText(value) {
  return /[|\r\n]/.test(String(value ?? ""));
}

function isPlaceholder(value) {
  return /^<[^>]+>$/.test(String(value ?? "").trim());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
