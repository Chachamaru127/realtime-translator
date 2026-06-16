import { loadServerFallbackEnv } from "./serverEnvConfig.mjs";

let loadedFallbackEnv = false;

export function getServerEnv(name: string): string | undefined {
  const direct = process.env[name];
  if (direct) return direct;

  loadFallbackEnv();
  return process.env[name];
}

function loadFallbackEnv() {
  if (loadedFallbackEnv) return;
  loadedFallbackEnv = true;
  loadServerFallbackEnv();
}
