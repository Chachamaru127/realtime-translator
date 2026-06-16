export const DEFAULT_ENV_FILE: string;
export const SERVER_ENV_KEYS: string[];

export interface LoadServerFallbackEnvOptions {
  forceReload?: boolean;
  log?: Pick<Console, "error" | "info" | "warn">;
}

export interface ServerFallbackEnvInfo {
  path: string;
  root: string;
}

export function getFallbackEnvFile(): string;
export function clearEmptyServerEnv(keys?: string[]): void;
export function loadServerFallbackEnv(
  options?: LoadServerFallbackEnvOptions,
): ServerFallbackEnvInfo;
