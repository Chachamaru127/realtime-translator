#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  ".git",
  ".harness-mem",
  ".next",
  ".playwright-mcp",
  "coverage",
  "node_modules",
  "out",
]);
const IGNORED_FILES = new Set(["pnpm-lock.yaml"]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const openAIKeyPattern = new RegExp(
  String.raw`\bs` + String.raw`k-(?:proj-|admin-|svcacct-)?[A-Za-z0-9_-]{16,}\b`,
  "g",
);

const findings = [];

for (const file of walk(ROOT)) {
  if (IGNORED_FILES.has(relative(ROOT, file))) continue;
  const text = readFileSync(file, "utf8");
  const matches = text.match(openAIKeyPattern);
  if (matches?.length) {
    findings.push({
      file: relative(ROOT, file),
      matches: matches.length,
    });
  }
}

if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "ok", openAIKeysFound: 0 }));

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const file = join(dir, entry.name);
    if (!isTextFile(file)) continue;
    yield file;
  }
}

function isTextFile(file) {
  const dot = file.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = file.slice(dot);
  if (!TEXT_EXTENSIONS.has(ext)) return false;
  return statSync(file).size < 2_000_000;
}
