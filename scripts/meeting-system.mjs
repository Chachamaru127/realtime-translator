import { execFileSync } from "node:child_process";
import {
  pickDefaultMicDevice,
  pickMeetingDevice,
} from "../lib/audioDeviceSelection.mjs";
import { loadServerFallbackEnv } from "../lib/serverEnvConfig.mjs";

const SILENT_ENV_LOG = {
  info() {},
  warn() {},
  error() {},
};

export function buildMeetingSystemSnapshot() {
  const devices = readAudioDevices();
  const inputs = devices.filter((device) => device.input > 0);
  const outputs = devices.filter((device) => device.output > 0);
  const blackHole16 = findDevice(devices, /blackhole 16ch/i);
  const blackHole2 = findDevice(devices, /blackhole 2ch/i);
  const openLoopback = findDevice(devices, /open[- ]?loopback/i);
  const zoomAudio = findDevice(devices, /zoomaudiodevice|zoom.*audio/i);
  const remoteCandidate = pickMeetingDevice(inputs);
  const preferredMic = pickDefaultMicDevice(inputs);
  const env = checkEnv();
  const devServer = findDevServer();
  const checks = [
    ["BlackHole 16ch input/output", Boolean(blackHole16?.input && blackHole16?.output)],
    ["BlackHole 2ch installed", Boolean(blackHole2)],
    ["Physical mic candidate", Boolean(preferredMic)],
    ["OPENAI_API_KEY server fallback", env.hasOpenAIKey],
    ["Dev server for this worktree", Boolean(devServer)],
  ];

  return {
    generatedAt: new Date(),
    devices,
    inputs,
    outputs,
    checks,
    candidates: {
      remoteCandidate,
      preferredMic,
      blackHole16,
      blackHole2,
      openLoopback,
      zoomAudio,
    },
    env,
    devServer,
    laneMap: {
      self: "local mic -> translator self lane",
      remote: "remote audio/playback -> translator remote lane",
    },
  };
}

export function readAudioDevices() {
  let json;
  try {
    json = execFileSync("system_profiler", ["SPAudioDataType", "-json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(`system_profiler failed: ${err.message}`);
  }

  const parsed = JSON.parse(json);
  const sections = parsed.SPAudioDataType || [];
  return sections
    .flatMap((section) => section._items || [])
    .filter((item) => item._name)
    .map((item) => ({
      name: String(item._name),
      label: String(item._name),
      input: Number(item.coreaudio_device_input || 0),
      output: Number(item.coreaudio_device_output || 0),
      manufacturer: String(item.coreaudio_device_manufacturer || ""),
      transport: String(item.coreaudio_device_transport || ""),
      sampleRate: Number(item.coreaudio_device_srate || 0),
      defaultInput: item.coreaudio_default_audio_input_device === "spaudio_yes",
      defaultOutput: item.coreaudio_default_audio_output_device === "spaudio_yes",
    }));
}

export function checkEnv() {
  const env = loadServerFallbackEnv({
    forceReload: true,
    log: SILENT_ENV_LOG,
  });
  return { ...env, hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY) };
}

export function findDevServer() {
  const ports = (
    process.env.MEETING_PREFLIGHT_PORTS || "3002,3001,3000,3003,3004"
  )
    .split(",")
    .map((port) => Number(port.trim()))
    .filter(Boolean);
  const cwd = process.cwd();
  for (const port of ports) {
    const pids = listeningPids(port);
    for (const pid of pids) {
      if (processCwd(pid) === cwd) return { port, pid };
    }
  }
  return null;
}

export function findDevice(devices, pattern) {
  return devices.find((device) => pattern.test(device.name));
}

export function formatDevice(device) {
  if (!device) return "not found";
  const flags = deviceFlags(device);
  return `${device.name} (${flags.join(", ")})`;
}

export function deviceFlags(device) {
  return [
    device.input ? `in=${device.input}` : null,
    device.output ? `out=${device.output}` : null,
    device.sampleRate ? `${device.sampleRate}Hz` : null,
    device.defaultInput ? "default-input" : null,
    device.defaultOutput ? "default-output" : null,
  ].filter(Boolean);
}

function listeningPids(port) {
  try {
    return execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\s+/)
      .map((pid) => Number(pid))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function processCwd(pid) {
  try {
    const output = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
  } catch {
    return null;
  }
}
