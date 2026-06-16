#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackDeviceLabel } from "../lib/audioDeviceSelection.mjs";
import { readAudioDevices } from "./meeting-system.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const stateDir = join(repoRoot, ".local", "meeting-monitor-bridge");
const statePath = join(stateDir, "state.json");
const logPath = join(stateDir, "bridge.log");
const openLoopbackRoot =
  process.env.OPEN_LOOPBACK_ROOT ??
  "/Users/tachibanashuuta/LocalWork/Code/Open-Loopback";
const defaultEnginePath = join(
  openLoopbackRoot,
  ".build",
  "debug",
  "OpenLoopbackEngine",
);

export function pickMonitorOutputDevice(outputs, remoteDevice) {
  const preferredName = process.env.MEETING_MONITOR_OUTPUT_DEVICE;
  if (preferredName) {
    const preferred = outputs.find((device) => sameName(device.name, preferredName));
    if (preferred) return preferred;
  }

  const usable = outputs.filter(
    (device) =>
      device.name !== remoteDevice?.name &&
      !isLoopbackDeviceLabel(device.label) &&
      !/zoom.*audio/i.test(device.label),
  );

  return (
    usable.find((device) => /MacBook Pro.*スピーカー|MacBook Pro.*Speaker/i.test(device.label)) ??
    usable.find((device) => /headphones?|airpods|イヤホン|ヘッドホン/i.test(device.label)) ??
    usable.find((device) => device.defaultOutput) ??
    usable[0] ??
    null
  );
}

export function readBridgeState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

export function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const action = process.argv[2] ?? "status";
  if (action === "start") return start();
  if (action === "restart") {
    stop({ quiet: true });
    return start();
  }
  if (action === "stop") return stop();
  if (action === "status") return status();
  if (action === "once") return once();
  usage(1);
}

function start() {
  mkdirSync(stateDir, { recursive: true });
  const current = readBridgeState();
  if (current && isPidRunning(current.pid)) {
    printJSON({ status: "ok", running: true, alreadyRunning: true, ...current });
    return;
  }

  const route = resolveRoute();
  const engine = resolveEnginePath();
  const args = [
    "--monitor-bridge",
    "--input-device-name",
    route.input.name,
    "--output-device-name",
    route.output.name,
    "--seconds",
    "0",
    "--json",
  ];

  const child = spawn(engine.command, [...engine.prefixArgs, ...args], {
    cwd: openLoopbackRoot,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  const state = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    inputDeviceName: route.input.name,
    outputDeviceName: route.output.name,
    command: [engine.command, ...engine.prefixArgs, ...args],
    openLoopbackRoot,
    logPath,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  setTimeout(() => {
    printJSON({
      status: "ok",
      running: isPidRunning(child.pid),
      ...state,
    });
  }, 700);
}

function stop({ quiet = false } = {}) {
  const state = readBridgeState();
  if (!state) {
    if (!quiet) printJSON({ status: "ok", running: false, stopped: false });
    return;
  }

  const wasRunning = isPidRunning(state.pid);
  if (wasRunning) {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {}
  }
  rmSync(statePath, { force: true });
  if (!quiet) {
    printJSON({
      status: "ok",
      running: false,
      stopped: wasRunning,
      pid: state.pid,
    });
  }
}

function status() {
  const state = readBridgeState();
  if (!state) {
    printJSON({ status: "ok", running: false });
    return;
  }
  printJSON({ status: "ok", running: isPidRunning(state.pid), ...state });
}

function once() {
  const route = resolveRoute();
  const engine = resolveEnginePath();
  const child = spawn(
    engine.command,
    [
      ...engine.prefixArgs,
      "--monitor-bridge",
      "--input-device-name",
      route.input.name,
      "--output-device-name",
      route.output.name,
      "--seconds",
      "1",
      "--json",
    ],
    {
      cwd: openLoopbackRoot,
      stdio: "inherit",
    },
  );
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

function resolveRoute() {
  const devices = readAudioDevices();
  const inputs = devices.filter((device) => device.input > 0);
  const outputs = devices.filter((device) => device.output > 0);
  const input =
    inputs.find((device) => /blackhole/i.test(device.name) && /16ch/i.test(device.name)) ??
    inputs.find((device) => /blackhole/i.test(device.name) && /2ch/i.test(device.name));
  if (!input) {
    throw new Error("BlackHole input was not found.");
  }

  const output = pickMonitorOutputDevice(outputs, input);
  if (!output) {
    throw new Error("No physical monitor output was found.");
  }
  return { input, output };
}

function resolveEnginePath() {
  const override = process.env.OPEN_LOOPBACK_ENGINE;
  if (override) return { command: override, prefixArgs: [] };
  if (existsSync(defaultEnginePath)) return { command: defaultEnginePath, prefixArgs: [] };
  return { command: "swift", prefixArgs: ["run", "OpenLoopbackEngine"] };
}

function printJSON(value) {
  console.log(JSON.stringify(value, null, 2));
}

function sameName(lhs, rhs) {
  return lhs.trim().localeCompare(rhs.trim(), undefined, { sensitivity: "accent" }) === 0;
}

function usage(code) {
  console.error(
    [
      "usage: pnpm meeting:monitor <start|restart|stop|status|once>",
      "env: OPEN_LOOPBACK_ROOT=/path/to/Open-Loopback",
      "env: OPEN_LOOPBACK_ENGINE=/path/to/OpenLoopbackEngine",
      "env: MEETING_MONITOR_OUTPUT_DEVICE=\"MacBook Proのスピーカー\"",
    ].join("\n"),
  );
  process.exitCode = code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
