#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMarkdownRow } from "./markdown-table.mjs";

const BACKFILL_FIELDS = [
  "app url",
  "translator mic",
  "translator remote",
  "lane map",
  "local preflight",
];

const SCHEMA_FIELDS = [
  {
    field: "live approval",
    anchors: ["local preflight", "route snapshot"],
  },
];

export function backfillEvidenceFile(filePath, { dryRun = false } = {}) {
  const absolutePath = resolve(filePath);
  const text = readFileSync(absolutePath, "utf8");
  const setup = parseSetup(text);
  const routeSnapshot = setup["route snapshot"];
  const updates = {};
  const insertedSetupFields = [];

  if (!isFilled(routeSnapshot)) {
    return { file: absolutePath, updated: false, updates, error: "missing route snapshot" };
  }

  const routePath = resolveEvidenceReference(absolutePath, routeSnapshot);
  if (!existsSync(routePath)) {
    return {
      file: absolutePath,
      updated: false,
      updates,
      error: `route snapshot not found: ${routeSnapshot}`,
    };
  }

  const route = readRouteSnapshot(routePath);
  const candidates = {
    "app url": route.summary["app url"],
    "translator mic": route.summary["translator mic"],
    "translator remote": route.summary["translator remote"],
    "lane map": "私=translator mic; 相手=translator remote/playback",
    "local preflight": route.failedChecks.length
      ? `WARN: ${route.failedChecks.join(", ")}`
      : "PASS",
  };

  let nextText = text;
  for (const schemaField of SCHEMA_FIELDS) {
    if (Object.hasOwn(setup, schemaField.field)) continue;
    const withField = insertSetupField(nextText, schemaField.field, schemaField.anchors);
    if (withField === nextText) continue;
    nextText = withField;
    insertedSetupFields.push(schemaField.field);
  }

  for (const field of BACKFILL_FIELDS) {
    const current = setup[field];
    const next = candidates[field];
    if (isFilled(current) || !isFilled(next)) continue;
    nextText = replaceSetupValue(nextText, field, next);
    updates[field] = next;
  }

  const updated = Object.keys(updates).length > 0 || insertedSetupFields.length > 0;
  if (updated && !dryRun) writeFileSync(absolutePath, nextText, "utf8");
  return { file: absolutePath, updated, updates, insertedSetupFields };
}

export function backfillEvidenceFiles(paths, options = {}) {
  return paths.map((filePath) => backfillEvidenceFile(filePath, options));
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all");
  const files = args.filter((arg) => !arg.startsWith("--"));
  const targets = all ? listSmokeFiles() : files;

  if (!targets.length) {
    console.error(
      "usage: pnpm meeting:backfill-evidence <docs/evidence/*-smoke.md...> [--dry-run]\n       pnpm meeting:backfill-evidence --all [--dry-run]",
    );
    process.exit(2);
  }

  const results = backfillEvidenceFiles(targets, { dryRun });
  console.log(JSON.stringify({ dryRun, results }, null, 2));
  process.exit(results.some((result) => result.error) ? 1 : 0);
}

function listSmokeFiles() {
  const evidenceDir = resolve(process.cwd(), "docs", "evidence");
  if (!existsSync(evidenceDir)) return [];
  return readdirSync(evidenceDir)
    .filter((name) => name.endsWith("-smoke.md"))
    .map((name) => join(evidenceDir, name))
    .sort();
}

function readRouteSnapshot(routePath) {
  const text = readFileSync(routePath, "utf8");
  const summary = {};
  const failedChecks = [];
  for (const line of text.split("\n")) {
    const cells = parseMarkdownRow(line);
    if (cells.length === 2 && cells[0] !== "Field") summary[cells[0]] = cells[1];
    const check = line.match(/^- WARN (.+)$/);
    if (check) failedChecks.push(check[1]);
  }
  return { summary, failedChecks };
}

function parseSetup(text) {
  const setup = {};
  for (const line of text.split("\n")) {
    const cells = parseMarkdownRow(line);
    if (cells.length === 2 && cells[0] !== "Field") setup[cells[0]] = cells[1];
  }
  return setup;
}

function replaceSetupValue(text, field, value) {
  return text.replace(
    new RegExp(`^\\| ${escapeRegExp(field)} \\|[^|]*\\|$`, "m"),
    `| ${field} | ${escapeCell(value)} |`,
  );
}

function insertSetupField(text, field, anchors) {
  if (hasSetupField(text, field)) return text;
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

function resolveEvidenceReference(evidencePath, reference) {
  if (isAbsolute(reference)) return reference;
  return resolve(dirname(evidencePath), "..", "..", reference);
}

function isFilled(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !/^pending$/i.test(normalized);
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
