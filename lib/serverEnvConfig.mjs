import { dirname } from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

export const DEFAULT_ENV_FILE =
  "/Users/tachibanashuuta/LocalWork/Code/realtime-translator/.env";
export const SERVER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_ORGANIZATION",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT",
  "OPENAI_PROJECT_ID",
  "REFINE_MODEL",
];

export function getFallbackEnvFile() {
  return (
    process.env.REALTIME_TRANSLATOR_ENV_FILE ||
    process.env.OPENAI_ENV_FILE ||
    DEFAULT_ENV_FILE
  );
}

export function clearEmptyServerEnv(keys = SERVER_ENV_KEYS) {
  for (const key of keys) {
    if (process.env[key] === "") delete process.env[key];
  }
}

export function loadServerFallbackEnv(options = {}) {
  clearEmptyServerEnv();
  const path = getFallbackEnvFile();
  const root = dirname(path);
  loadEnvConfig(
    root,
    process.env.NODE_ENV !== "production",
    options.log,
    Boolean(options.forceReload),
  );
  return { path, root };
}
