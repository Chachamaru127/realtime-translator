#!/usr/bin/env node

import assert from "node:assert/strict";
import { pickMonitorOutputDevice } from "./meeting-monitor-bridge.mjs";

const outputs = [
  device("BlackHole 16ch", "virtual", true),
  device("ZoomAudioDevice", "virtual"),
  device("KA272 A", "hdmi"),
  device("MacBook Proのスピーカー", "built-in"),
];
const remote = outputs[0];

assert.equal(pickMonitorOutputDevice(outputs, remote)?.name, "MacBook Proのスピーカー");
assert.equal(
  pickMonitorOutputDevice([
    device("BlackHole 16ch", "virtual", true),
    device("External Headphones", "usb"),
  ], remote)?.name,
  "External Headphones",
);
assert.equal(
  pickMonitorOutputDevice([device("BlackHole 16ch", "virtual", true)], remote),
  null,
);

console.log(
  JSON.stringify({
    status: "ok",
    monitorOutputPriority: "physical speaker/headphones over loopback output",
    bridgeContract: "Chrome/Meet output -> BlackHole input -> physical monitor",
  }),
);

function device(name, transport, defaultOutput = false) {
  return { name, label: name, output: 2, transport, defaultOutput };
}
