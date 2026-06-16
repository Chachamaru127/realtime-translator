#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  isLoopbackDeviceLabel,
  pickDefaultMicDevice,
  pickMeetingDevice,
} from "../lib/audioDeviceSelection.mjs";

const baseDevices = [
  device("Webcam Internal Mic", "usb"),
  device("HyperX SoloCast", "usb"),
  device("BlackHole 2ch", "virtual"),
  device("BlackHole 16ch", "virtual"),
  device("MacBook Proのマイク", "built-in"),
  device("ZoomAudioDevice", "virtual"),
];

assert.equal(pickMeetingDevice(baseDevices)?.label, "BlackHole 16ch");
assert.equal(
  pickMeetingDevice(baseDevices.filter((d) => d.label !== "BlackHole 16ch"))
    ?.label,
  "BlackHole 2ch",
);
assert.equal(
  pickMeetingDevice([
    device("Webcam Internal Mic", "usb"),
    device("Open-Loopback Local Device", "virtual"),
    device("MacBook Proのマイク", "built-in"),
  ])?.label,
  "Open-Loopback Local Device",
);
assert.equal(pickDefaultMicDevice(baseDevices)?.label, "HyperX SoloCast");
assert.equal(isLoopbackDeviceLabel(pickDefaultMicDevice(baseDevices)?.label ?? ""), false);
assert.equal(isLoopbackDeviceLabel(pickMeetingDevice(baseDevices)?.label ?? ""), true);
assert.notEqual(
  pickDefaultMicDevice(baseDevices)?.label,
  pickMeetingDevice(baseDevices)?.label,
);
assert.equal(
  pickDefaultMicDevice([
    device("BlackHole 16ch", "virtual"),
    device("Open-Loopback Local Device", "virtual"),
    device("ZoomAudioDevice", "virtual"),
    device("MacBook Proのマイク", "built-in"),
  ])?.label,
  "MacBook Proのマイク",
);
assert.equal(isLoopbackDeviceLabel("BlackHole 16ch"), true);
assert.equal(isLoopbackDeviceLabel("Open-Loopback Local Device"), true);
assert.equal(isLoopbackDeviceLabel("HyperX SoloCast"), false);

console.log(
  JSON.stringify({
    status: "ok",
    meetingPriority: "BlackHole 16ch -> BlackHole 2ch -> Open-Loopback",
    micPriority: "dedicated USB mic over built-in/webcam/virtual",
    laneContract: "私=physical mic; 相手=loopback playback",
  }),
);

function device(label, transport = "") {
  return { label, transport };
}
