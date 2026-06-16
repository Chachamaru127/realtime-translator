#!/usr/bin/env node

import {
  buildMeetingSystemSnapshot,
  formatDevice,
} from "./meeting-system.mjs";

function main() {
  const snapshot = buildMeetingSystemSnapshot();
  const {
    checks,
    candidates,
    env,
    devServer,
    inputs,
    outputs,
    laneMap,
    routeNotes,
  } = snapshot;

  console.log("Meeting preflight");
  console.log("=================");
  for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS" : "WARN"} ${label}`);
  }
  console.log("");
  console.log("Selected candidates");
  console.log("-------------------");
  printDevice("remote audio", candidates.remoteCandidate);
  printDevice("local mic", candidates.preferredMic);
  printDevice("system output", candidates.defaultOutput);
  printDevice("Open-Loopback", candidates.openLoopback);
  printDevice("ZoomAudioDevice", candidates.zoomAudio);
  if (routeNotes.length > 0) {
    console.log("");
    console.log("Route notes");
    console.log("-----------");
    for (const note of routeNotes) console.log(`NOTE ${note}`);
  }
  console.log("");
  console.log("Lane map");
  console.log("--------");
  console.log(`私: ${laneMap.self}`);
  console.log(`相手: ${laneMap.remote}`);
  console.log("");
  console.log("Server env");
  console.log("----------");
  console.log(`env file: ${env.path}`);
  console.log(`env root: ${env.root}`);
  console.log(`OPENAI_API_KEY present: ${env.hasOpenAIKey ? "yes" : "no"}`);
  console.log("");
  console.log("Dev server");
  console.log("----------");
  console.log(devServer ? `url: http://localhost:${devServer.port}` : "url: not found");
  console.log("");
  console.log("Audio inputs");
  console.log("------------");
  for (const device of inputs) printDevice("", device);
  console.log("");
  console.log("Audio outputs");
  console.log("-------------");
  for (const device of outputs) printDevice("", device);
}

function printDevice(label, device) {
  const prefix = label ? `${label}: ` : "- ";
  console.log(`${prefix}${formatDevice(device)}`);
}

main();
