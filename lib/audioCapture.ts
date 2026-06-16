"use client";

import {
  isLoopbackDeviceLabel,
  pickDefaultMicDevice,
  pickMeetingDevice,
} from "@/lib/audioDeviceSelection.mjs";

export type AudioInputMode = "microphone" | "meeting";

export interface AudioCaptureConfig {
  mode: AudioInputMode;
  micDeviceId?: string;
  meetingDeviceId?: string;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface PreparedAudioInput {
  stream: MediaStream;
  close: () => void;
}

export interface PreparedMeetingAudioInput {
  micStream: MediaStream;
  meetingStream: MediaStream;
  close: () => void;
}

export interface MeetingInputLevels {
  mic: number;
  meeting: number;
}

export async function unlockAudioDeviceLabels(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput" && device.deviceId)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `音声入力 ${index + 1}`,
    }));
}

export function isLoopbackDevice(device: AudioInputDevice): boolean {
  return isLoopbackDeviceLabel(device.label);
}

export function pickDefaultMicDeviceId(
  devices: AudioInputDevice[],
): string | undefined {
  return pickDefaultMicDevice(
    devices.map((device) => ({
      ...device,
      id: device.deviceId,
    })),
  )?.deviceId;
}

export function pickMeetingDeviceId(
  devices: AudioInputDevice[],
): string | undefined {
  return pickMeetingDevice(
    devices.map((device) => ({
      ...device,
      id: device.deviceId,
    })),
  )?.deviceId;
}

export async function prepareAudioInput(
  config: AudioCaptureConfig,
): Promise<PreparedAudioInput> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "このブラウザでは音声入力を利用できません。HTTPSのSafari/Chromeなど対応ブラウザで開いてください（アプリ内ブラウザでは動かないことがあります）。",
    );
  }

  if (config.mode === "microphone") {
    const stream = await openAudioDevice({
      deviceId: config.micDeviceId,
      voiceProcessing: true,
      channelCount: 1,
    });
    return {
      stream,
      close: () => stopStream(stream),
    };
  }

  throw new Error(
    "会議モードは物理マイクと相手音声を別々の lane として起動してください。",
  );
}

export async function prepareMeetingAudioInput(
  config: AudioCaptureConfig,
): Promise<PreparedMeetingAudioInput> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "このブラウザでは音声入力を利用できません。HTTPSのSafari/Chromeなど対応ブラウザで開いてください（アプリ内ブラウザでは動かないことがあります）。",
    );
  }

  if (!config.meetingDeviceId) {
    throw new Error(
      "相手音声入力が未選択です。BlackHole 16ch / BlackHole 2ch / Open-Loopback の入力を選んでください。",
    );
  }
  if (
    config.micDeviceId &&
    config.meetingDeviceId &&
    config.micDeviceId === config.meetingDeviceId
  ) {
    throw new Error(
      "自分のマイクと相手音声は別の入力を選んでください。同じデバイスを2回拾うと、声が二重になります。",
    );
  }

  const [micStream, meetingStream] = await Promise.all([
    openAudioDevice({
      deviceId: config.micDeviceId,
      voiceProcessing: true,
      channelCount: 1,
    }),
    openAudioDevice({
      deviceId: config.meetingDeviceId,
      voiceProcessing: false,
      channelCount: 2,
    }),
  ]);

  return {
    micStream,
    meetingStream,
    close: () => {
      stopStream(micStream);
      stopStream(meetingStream);
    },
  };
}

export async function createMeetingInputMeter(
  config: AudioCaptureConfig,
  onLevels: (levels: MeetingInputLevels) => void,
): Promise<{ close: () => void }> {
  const capture = await prepareMeetingAudioInput(config);
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    capture.close();
    throw new Error("このブラウザでは入力チェックを利用できません。");
  }

  const ctx = new AudioContextCtor();
  const mic = createStreamAnalyser(ctx, capture.micStream);
  const meeting = createStreamAnalyser(ctx, capture.meetingStream);
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  let closed = false;
  let frame = 0;
  let lastEmit = 0;
  const tick = (now: number) => {
    if (closed) return;
    if (now - lastEmit > 100) {
      lastEmit = now;
      onLevels({
        mic: readLevel(mic.analyser, mic.data),
        meeting: readLevel(meeting.analyser, meeting.data),
      });
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);

  return {
    close: () => {
      closed = true;
      window.cancelAnimationFrame(frame);
      mic.source.disconnect();
      meeting.source.disconnect();
      capture.close();
      void ctx.close().catch(() => {});
    },
  };
}

async function openAudioDevice({
  deviceId,
  voiceProcessing,
  channelCount,
}: {
  deviceId?: string;
  voiceProcessing: boolean;
  channelCount: number;
}): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    echoCancellation: voiceProcessing,
    noiseSuppression: voiceProcessing,
    autoGainControl: voiceProcessing,
    channelCount,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };

  try {
    return await navigator.mediaDevices.getUserMedia({ audio });
  } catch (err) {
    if (!deviceId && voiceProcessing) {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw err;
  }
}

function createStreamAnalyser(ctx: AudioContext, stream: MediaStream) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  return {
    source,
    analyser,
    data: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
  };
}

function readLevel(
  analyser: AnalyserNode,
  data: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (const value of data) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / data.length) * 3);
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}
