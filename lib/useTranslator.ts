"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  prepareAudioInput,
  prepareMeetingAudioInput,
  type AudioCaptureConfig,
} from "@/lib/audioCapture";
import { detectPairLanguage } from "@/lib/languages";

export type Status = "idle" | "connecting" | "live" | "error";
export type SpeakerLane = "self" | "remote";

export interface LangPair {
  a: string;
  b: string;
}

export interface Segment {
  id: string;
  source: string;
  target: string;
  rawSource: string;
  rawTarget: string;
  outputLang: string;
  sourceLang: string | null;
  speaker?: SpeakerLane;
  refined?: boolean;
  at: number;
}

export interface PartialSegment {
  id: string;
  source: string;
  target: string;
  outputLang: string;
  sourceLang: string | null;
  speaker?: SpeakerLane;
}

interface RealtimeEvent {
  type?: string;
  delta?: string;
  error?: { message?: string };
}

type LaneKey = "auto" | SpeakerLane;

interface SessionSpec {
  stream: MediaStream;
  outputLang: string;
  lane: LaneKey;
  primary: boolean;
  sourceLang?: string;
}

interface Session {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  outputLang: string;
  lane: LaneKey;
}

interface LaneState {
  source: string;
  targets: Record<string, string>;
  sourceLang: string | null;
  listenerLang: string | null;
  outputLang: string | null;
  gapTimer: number | null;
}

const CLIENT_SECRET_URL = "/api/session";
const CALLS_URL = "https://api.openai.com/v1/realtime/translations/calls";

// The translation API has no turn lifecycle, so utterances are finalized after
// silence. Meeting mode keeps independent silence windows per input lane.
const SEGMENT_GAP_MS = 1000;
const RECYCLE_SILENCE_MS = 2500;
const MAX_SESSION_MS = 30000;
const LANES: LaneKey[] = ["auto", "self", "remote"];

let segCounter = 0;

function createLaneState(): LaneState {
  return {
    source: "",
    targets: {},
    sourceLang: null,
    listenerLang: null,
    outputLang: null,
    gapTimer: null,
  };
}

function createLaneStates(): Record<LaneKey, LaneState> {
  return {
    auto: createLaneState(),
    self: createLaneState(),
    remote: createLaneState(),
  };
}

function clearLaneText(state: LaneState) {
  state.source = "";
  state.targets = {};
  state.sourceLang = null;
  state.listenerLang = null;
  state.outputLang = null;
}

function firstTarget(state: LaneState): string {
  const firstLang = Object.keys(state.targets)[0];
  return firstLang ? (state.targets[firstLang] ?? "") : "";
}

function laneHasText(state: LaneState): boolean {
  return Boolean(
    state.source.trim() ||
      Object.values(state.targets).some((value) => value.trim()),
  );
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "マイクの使用が許可されませんでした。ブラウザ／OSの設定でマイクを許可してから、もう一度お試しください。";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "マイクが見つかりませんでした。デバイスのマイクを確認してください。";
  }
  if (name === "NotReadableError") {
    return "マイクを使用できませんでした。他のアプリがマイクを使用していないか確認してください。";
  }
  return err instanceof Error ? err.message : "マイクを起動できませんでした。";
}

function realtimeConnectionErrorMessage(status: number, body: string): string {
  const upstreamMessage = extractOpenAIErrorMessage(body);
  if (
    status === 429 &&
    /quota|billing|insufficient_quota|exceeded/i.test(
      upstreamMessage ?? body,
    )
  ) {
    return [
      "OpenAI の利用枠または請求設定で Realtime 翻訳を開始できませんでした。",
      "課金が有効な project の API key に切り替えるか、OpenAI の billing / limits を確認してください。",
      "複数 project を使っている場合は .env に OPENAI_PROJECT を設定してサーバーを再起動してください。",
    ].join(" ");
  }

  if (status === 429) {
    return [
      "OpenAI Realtime のレート制限に達しました。",
      "少し待ってから再試行するか、OpenAI の rate limit / usage limit を確認してください。",
    ].join(" ");
  }

  return `翻訳の接続に失敗しました (${status})。${(upstreamMessage ?? body).slice(0, 160)}`;
}

function extractOpenAIErrorMessage(body: string): string | null {
  try {
    const data = JSON.parse(body) as { error?: { message?: unknown } };
    return typeof data.error?.message === "string" ? data.error.message : null;
  } catch {
    return null;
  }
}

export function useTranslator(audioRef: RefObject<HTMLAudioElement | null>) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [partials, setPartials] = useState<PartialSegment[]>([]);
  const [partialSource, setPartialSource] = useState("");
  const [partialTarget, setPartialTarget] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [audioOn, setAudioOnState] = useState(false);

  const sessionsRef = useRef<Session[]>([]);
  const sessionSpecsRef = useRef<SessionSpec[]>([]);
  const inputStreamsRef = useRef<MediaStream[]>([]);
  const captureRef = useRef<{ close: () => void } | null>(null);
  const laneStatesRef = useRef<Record<LaneKey, LaneState>>(createLaneStates());
  const outLangsRef = useRef<string[]>([]);
  const singleRef = useRef(false);
  const audioOnRef = useRef(false);
  const runningRef = useRef(false);
  const openingRef = useRef(false);
  const sessionOpenedAtRef = useRef(0);
  const autoPairRef = useRef<LangPair | null>(null);
  const recycleTimerRef = useRef<number | null>(null);

  const finalizeLaneRef = useRef<(lane: LaneKey) => void>(() => {});
  const recycleRef = useRef<() => void>(() => {});
  const handleEventRef = useRef<
    (evt: RealtimeEvent, spec: SessionSpec) => void
  >(() => {});

  const clearTimers = useCallback(() => {
    for (const lane of LANES) {
      const state = laneStatesRef.current[lane];
      if (state.gapTimer != null) {
        clearTimeout(state.gapTimer);
        state.gapTimer = null;
      }
    }
    if (recycleTimerRef.current != null) {
      clearTimeout(recycleTimerRef.current);
      recycleTimerRef.current = null;
    }
  }, []);

  const hasActiveLane = useCallback(
    () => LANES.some((lane) => laneHasText(laneStatesRef.current[lane])),
    [],
  );

  const publishPartials = useCallback(() => {
    const states = laneStatesRef.current;
    const pair = autoPairRef.current;
    const auto = states.auto;
    const autoOutputLang =
      auto.outputLang ?? auto.listenerLang ?? outLangsRef.current[0] ?? "";

    setPartialSource(auto.source);
    setPartialTarget(
      autoOutputLang ? (auto.targets[autoOutputLang] ?? "") : firstTarget(auto),
    );

    const meetingPartials: PartialSegment[] = [];
    for (const lane of ["self", "remote"] as const) {
      const state = states[lane];
      if (!laneHasText(state)) continue;
      const outputLang =
        state.outputLang ??
        (lane === "self" ? pair?.b : pair?.a) ??
        outLangsRef.current[0] ??
        "";
      meetingPartials.push({
        id: `partial-${lane}`,
        speaker: lane,
        source: state.source,
        target: outputLang ? (state.targets[outputLang] ?? "") : firstTarget(state),
        sourceLang: state.sourceLang,
        outputLang,
      });
    }
    setPartials(meetingPartials);
  }, []);

  const finalizeLane = useCallback(
    (lane: LaneKey) => {
      const state = laneStatesRef.current[lane];
      if (state.gapTimer != null) {
        clearTimeout(state.gapTimer);
        state.gapTimer = null;
      }

      const source = state.source.trim();
      const pair = autoPairRef.current;
      let target = "";
      let outputLang = state.outputLang ?? outLangsRef.current[0] ?? "en";
      let sourceLang = state.sourceLang;

      if (lane === "auto") {
        if (pair) {
          sourceLang =
            detectPairLanguage(source, pair.a, pair.b) ?? sourceLang ?? pair.a;
          outputLang = sourceLang === pair.a ? pair.b : pair.a;
          target = (state.targets[outputLang] ?? "").trim();
        } else {
          target = (state.targets[outputLang] ?? firstTarget(state)).trim();
        }
      } else {
        target = (state.targets[outputLang] ?? firstTarget(state)).trim();
      }

      clearLaneText(state);
      publishPartials();

      if (!source && !target) return;

      setSegments((prev) => [
        ...prev,
        {
          id: `seg-${++segCounter}`,
          source,
          target,
          rawSource: source,
          rawTarget: target,
          outputLang,
          sourceLang,
          speaker: lane === "auto" ? undefined : lane,
          at: Date.now(),
        },
      ]);
    },
    [publishPartials],
  );

  const finalizeAll = useCallback(() => {
    for (const lane of LANES) finalizeLane(lane);
  }, [finalizeLane]);

  const scheduleLaneGap = useCallback(
    (lane: LaneKey) => {
      const state = laneStatesRef.current[lane];
      if (state.gapTimer != null) clearTimeout(state.gapTimer);
      state.gapTimer = window.setTimeout(() => {
        state.gapTimer = null;
        finalizeLaneRef.current(lane);
        setSpeaking(hasActiveLane());
        if (
          sessionsRef.current.length &&
          !openingRef.current &&
          Date.now() - sessionOpenedAtRef.current > MAX_SESSION_MS
        ) {
          recycleRef.current();
        }
      }, SEGMENT_GAP_MS);
    },
    [hasActiveLane],
  );

  const scheduleRecycle = useCallback(() => {
    if (recycleTimerRef.current != null) clearTimeout(recycleTimerRef.current);
    recycleTimerRef.current = window.setTimeout(() => {
      recycleTimerRef.current = null;
      recycleRef.current();
    }, RECYCLE_SILENCE_MS);
  }, []);

  const handleEvent = useCallback(
    (evt: RealtimeEvent, spec: SessionSpec) => {
      const type = evt.type ?? "";
      const state = laneStatesRef.current[spec.lane];

      if (type.endsWith("input_transcript.delta")) {
        if (!spec.primary) return;
        const delta = evt.delta ?? "";
        if (!delta) return;

        if (spec.lane === "auto") {
          const pair = autoPairRef.current;
          if (pair) {
            const detectedLang = detectPairLanguage(delta, pair.a, pair.b);
            if (detectedLang) {
              if (
                state.sourceLang &&
                detectedLang !== state.sourceLang &&
                state.source.trim()
              ) {
                finalizeLaneRef.current("auto");
              }
              state.sourceLang = detectedLang;
              state.listenerLang = detectedLang === pair.a ? pair.b : pair.a;
              state.outputLang = state.listenerLang;
            }
          }
        } else {
          state.sourceLang = spec.sourceLang ?? state.sourceLang;
          state.outputLang = spec.outputLang;
        }

        state.source += delta;
        setSpeaking(true);
        publishPartials();
        scheduleLaneGap(spec.lane);
        scheduleRecycle();
      } else if (type.endsWith("output_transcript.delta")) {
        const delta = evt.delta ?? "";
        if (!delta) return;
        state.outputLang = spec.outputLang;
        state.targets[spec.outputLang] =
          (state.targets[spec.outputLang] ?? "") + delta;
        publishPartials();
        scheduleLaneGap(spec.lane);
        scheduleRecycle();
      } else if (type === "error" || evt.error) {
        setError(evt.error?.message ?? "Realtime error");
      }
    },
    [publishPartials, scheduleLaneGap, scheduleRecycle],
  );

  const applyAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !audioOnRef.current;
    if (audioOnRef.current) void el.play().catch(() => {});
  }, [audioRef]);

  const setAudioOn = useCallback(
    (on: boolean) => {
      audioOnRef.current = on;
      setAudioOnState(on);
      applyAudio();
    },
    [applyAudio],
  );

  const buildSession = useCallback(
    async (spec: SessionSpec): Promise<Session> => {
      const tokenRes = await fetch(CLIENT_SECRET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputLanguage: spec.outputLang }),
      });
      const tokenData = (await tokenRes.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!tokenRes.ok || !tokenData.clientSecret) {
        throw new Error(tokenData.error ?? "セッションの開始に失敗しました。");
      }

      const pc = new RTCPeerConnection();
      if (singleRef.current) {
        pc.ontrack = (e) => {
          const el = audioRef.current;
          if (el) {
            el.srcObject = e.streams[0];
            applyAudio();
          }
        };
      }
      for (const track of spec.stream.getAudioTracks()) {
        pc.addTrack(track, spec.stream);
      }

      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => {
        try {
          handleEventRef.current(
            JSON.parse(e.data as string) as RealtimeEvent,
            spec,
          );
        } catch {
          // ignore non-JSON frames
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) {
        const txt = await sdpRes.text();
        throw new Error(realtimeConnectionErrorMessage(sdpRes.status, txt));
      }
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpRes.text(),
      });
      return { pc, dc, outputLang: spec.outputLang, lane: spec.lane };
    },
    [audioRef, applyAudio],
  );

  const closeSessions = useCallback(() => {
    for (const s of sessionsRef.current) {
      try {
        s.dc.close();
      } catch {}
      try {
        s.pc.close();
      } catch {}
    }
    sessionsRef.current = [];
    if (audioRef.current) audioRef.current.srcObject = null;
  }, [audioRef]);

  const openSessions = useCallback(async (): Promise<boolean> => {
    if (openingRef.current || sessionsRef.current.length) return true;
    if (!runningRef.current || sessionSpecsRef.current.length === 0) return false;
    openingRef.current = true;
    try {
      const sessions = await Promise.all(
        sessionSpecsRef.current.map((spec) => buildSession(spec)),
      );
      if (!runningRef.current) {
        for (const s of sessions) {
          try {
            s.dc.close();
          } catch {}
          try {
            s.pc.close();
          } catch {}
        }
        return false;
      }
      sessionsRef.current = sessions;
      sessionOpenedAtRef.current = Date.now();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      openingRef.current = false;
    }
  }, [buildSession]);

  const recycle = useCallback(() => {
    if (!runningRef.current || openingRef.current) return;
    finalizeAll();
    closeSessions();
    setSpeaking(false);
    void openSessions();
  }, [closeSessions, finalizeAll, openSessions]);

  useEffect(() => {
    finalizeLaneRef.current = finalizeLane;
    handleEventRef.current = handleEvent;
    recycleRef.current = recycle;
  });

  const cleanup = useCallback(() => {
    runningRef.current = false;
    openingRef.current = false;
    clearTimers();
    closeSessions();
    captureRef.current?.close();
    captureRef.current = null;
    sessionSpecsRef.current = [];
    inputStreamsRef.current = [];
    laneStatesRef.current = createLaneStates();
    setPartials([]);
    setPartialSource("");
    setPartialTarget("");
  }, [clearTimers, closeSessions]);

  const start = useCallback(
    async (
      outputLangs: string[],
      inputConfig: AudioCaptureConfig = { mode: "microphone" },
      meetingPair?: LangPair,
    ) => {
      if (runningRef.current || sessionsRef.current.length) return false;
      setError(null);
      setPartials([]);
      setPartialSource("");
      setPartialTarget("");
      laneStatesRef.current = createLaneStates();
      outLangsRef.current = outputLangs;
      singleRef.current =
        inputConfig.mode !== "meeting" && outputLangs.length === 1;
      setMutedState(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "このブラウザでは音声入力を利用できません。HTTPSのSafari/Chromeなど対応ブラウザで開いてください（アプリ内ブラウザでは動かないことがあります）。",
        );
        setStatus("error");
        return false;
      }
      setStatus("connecting");

      try {
        if (inputConfig.mode === "meeting") {
          const pair =
            meetingPair ??
            autoPairRef.current ??
            ({ a: outputLangs[0] ?? "ja", b: outputLangs[1] ?? "en" } satisfies LangPair);
          const capture = await prepareMeetingAudioInput(inputConfig);
          captureRef.current = capture;
          inputStreamsRef.current = [capture.micStream, capture.meetingStream];
          sessionSpecsRef.current = [
            {
              stream: capture.micStream,
              outputLang: pair.b,
              lane: "self",
              primary: true,
              sourceLang: pair.a,
            },
            {
              stream: capture.meetingStream,
              outputLang: pair.a,
              lane: "remote",
              primary: true,
              sourceLang: pair.b,
            },
          ];
        } else {
          const capture = await prepareAudioInput(inputConfig);
          captureRef.current = capture;
          inputStreamsRef.current = [capture.stream];
          sessionSpecsRef.current = outputLangs.map((lang, index) => ({
            stream: capture.stream,
            outputLang: lang,
            lane: "auto",
            primary: index === 0,
          }));
        }
      } catch (err) {
        setError(micErrorMessage(err));
        setStatus("error");
        return false;
      }
      runningRef.current = true;

      const ok = await openSessions();
      if (ok) {
        setStatus("live");
        return true;
      } else if (runningRef.current) {
        setStatus("error");
        cleanup();
      }
      return false;
    },
    [cleanup, openSessions],
  );

  const setMuted = useCallback((m: boolean) => {
    for (const stream of inputStreamsRef.current) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !m;
      });
    }
    setMutedState(m);
  }, []);

  const setAutoPair = useCallback((pair: LangPair | null) => {
    autoPairRef.current = pair;
  }, []);

  const stop = useCallback(() => {
    finalizeAll();
    cleanup();
    setStatus("idle");
    setSpeaking(false);
    setMutedState(false);
  }, [cleanup, finalizeAll]);

  const clear = useCallback(() => setSegments([]), []);

  const patchSegment = useCallback((id: string, patch: Partial<Segment>) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  return {
    status,
    error,
    segments,
    partials,
    partialSource,
    partialTarget,
    speaking,
    muted,
    audioOn,
    start,
    stop,
    setMuted,
    setAudioOn,
    setAutoPair,
    clear,
    patchSegment,
  };
}
