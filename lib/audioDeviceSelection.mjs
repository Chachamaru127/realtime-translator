const LOOPBACK_RE =
  /blackhole|open[- ]?loopback|loopback|zoom.*audio|audio.*router/i;
const MIC_EXCLUDE_RE = /blackhole|open[- ]?loopback|loopback/i;
const VIRTUAL_RE = /virtual|zoomaudiodevice|audio.*router/i;
const DEDICATED_MIC_RE =
  /hyperx|solocast|yeti|rode|røde|shure|mv7|sm7|podmic|audio[- ]?technica|samson|elgato|wave|usb.*mic/i;
const GENERAL_MIC_RE = /microphone|マイク/i;
const WEBCAM_RE = /webcam|camera|facetime/i;
const BUILT_IN_RE = /built[- ]?in|macbook|内蔵/i;
const DEFAULT_RE = /default|既定/i;

export function isLoopbackDeviceLabel(label) {
  return LOOPBACK_RE.test(label);
}

export function pickDefaultMicDevice(devices) {
  return devices
    .filter(
      (device) =>
        !MIC_EXCLUDE_RE.test(device.label) && !VIRTUAL_RE.test(device.label),
    )
    .map((device, index) => ({
      device,
      score: scoreMicDevice(device.label, device.transport) - index * 0.01,
    }))
    .sort((a, b) => b.score - a.score)[0]?.device;
}

export function pickMeetingDevice(devices) {
  return (
    devices.find(
      (device) => /blackhole/i.test(device.label) && /16ch/i.test(device.label),
    ) ??
    devices.find(
      (device) => /blackhole/i.test(device.label) && /2ch/i.test(device.label),
    ) ??
    devices.find((device) => /open[- ]?loopback/i.test(device.label)) ??
    devices.find(isLoopbackDevice)
  );
}

function isLoopbackDevice(device) {
  return isLoopbackDeviceLabel(device.label);
}

function scoreMicDevice(label, transport = "") {
  let score = 0;
  if (DEDICATED_MIC_RE.test(label)) score += 80;
  if (GENERAL_MIC_RE.test(label)) score += 10;
  if (/usb/i.test(label) || /usb/i.test(transport)) score += 25;
  if (DEFAULT_RE.test(label)) score += 10;
  if (BUILT_IN_RE.test(label)) score += 8;
  if (WEBCAM_RE.test(label)) score -= 35;
  if (VIRTUAL_RE.test(label)) score -= 120;
  return score;
}
