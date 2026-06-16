"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LANGUAGES, getLanguage, detectPairLanguage } from "@/lib/languages";
import {
  useTranslator,
  type PartialSegment,
  type Segment,
} from "@/lib/useTranslator";
import {
  createMeetingInputMeter,
  isLoopbackDevice,
  listAudioInputDevices,
  pickDefaultMicDeviceId,
  pickMeetingDeviceId,
  unlockAudioDeviceLabels,
  type AudioInputDevice,
} from "@/lib/audioCapture";
import {
  detectPlatform,
  getMicPermission,
  micFixSteps,
  type MicPermission,
  type Platform,
} from "@/lib/platform";
import { renderMeetingRuntimeEvidencePatch } from "@/lib/meetingEvidencePatch.mjs";

type Mode = "talk" | "meeting" | "live";
type RefinedLine = { source?: string; target?: string };
type InputCheckState = {
  status: "idle" | "starting" | "checking" | "checked" | "error";
  mic: number;
  meeting: number;
  message?: string;
};
type EvidenceCopyStatus = "idle" | "copied" | "error";
type MeetingSessionStats = {
  elapsed: string;
  selfSegments: number;
  remoteSegments: number;
  selfActive: boolean;
  remoteActive: boolean;
};

// Browser-only platform detection, exposed via useSyncExternalStore so it stays
// SSR-safe (server snapshot = null) without a hydration mismatch.
let cachedPlatform: Platform | null = null;
function platformSnapshot(): Platform | null {
  if (!cachedPlatform) cachedPlatform = detectPlatform();
  return cachedPlatform;
}
const noopSubscribe = () => () => {};

export default function Translator() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslator(audioRef);

  const [mode, setMode] = useState<Mode>("talk");

  // Conversation language pair (auto two-way translation between these two).
  const [langA, setLangA] = useState("ja");
  const [langB, setLangB] = useState("en");

  // Live mode: translate everything heard into this language.
  const [targetLang, setTargetLang] = useState("ja");

  const platform = useSyncExternalStore(
    noopSubscribe,
    platformSnapshot,
    () => null,
  );
  const [micPerm, setMicPerm] = useState<MicPermission>("unknown");
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState("");
  const [meetingDeviceId, setMeetingDeviceId] = useState("");
  const [autoMeetingInput, setAutoMeetingInput] = useState(true);
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputCheck, setInputCheck] = useState<InputCheckState>({
    status: "idle",
    mic: 0,
    meeting: 0,
  });
  const [meetingStartedAt, setMeetingStartedAt] = useState<number | null>(null);
  const [meetingStoppedDurationMs, setMeetingStoppedDurationMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [evidenceCopyStatus, setEvidenceCopyStatus] =
    useState<EvidenceCopyStatus>("idle");
  const [optimizing, setOptimizing] = useState(false);

  // Flip the whole UI 180° so the person across the table can read it. Driven
  // either manually or, when granted, by the device's tilt sensor.
  const [flipped, setFlipped] = useState(false);
  const [orientOn, setOrientOn] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputMeterRef = useRef<{ close: () => void } | null>(null);

  // Auto-scroll the transcript as new content arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [t.segments, t.partials, t.partialSource, t.partialTarget]);

  // Keep the auto-translation pair in sync with the selected languages.
  useEffect(() => {
    t.setAutoPair(mode === "talk" ? { a: langA, b: langB } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, langA, langB]);

  // Read the current mic permission on mount so we can warn before the first tap.
  useEffect(() => {
    let alive = true;
    getMicPermission().then((p) => {
      if (alive) setMicPerm(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const refreshAudioDevices = useCallback(
    async (requestLabels = false) => {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      if (requestLabels) {
        await unlockAudioDeviceLabels().catch(() => {});
      }
      const devices = await listAudioInputDevices();
      setAudioDevices(devices);
      setMicDeviceId((current) =>
        devices.some((device) => device.deviceId === current)
          ? current
          : (pickDefaultMicDeviceId(devices) ?? ""),
      );
      setMeetingDeviceId((current) => {
        const detected = pickMeetingDeviceId(devices) ?? "";
        const currentDevice = devices.find(
          (device) => device.deviceId === current,
        );
        if (!current) return detected;
        if (requestLabels && detected && !currentDevice) return detected;
        if (
          requestLabels &&
          detected &&
          currentDevice &&
          !isLoopbackDevice(currentDevice)
        ) {
          return detected;
        }
        return devices.some((device) => device.deviceId === current)
          ? current
          : detected;
      });
      return devices;
    },
    [],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshAudioDevices(false), 0);
    const onDeviceChange = () => void refreshAudioDevices(false);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      window.clearTimeout(initial);
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        onDeviceChange,
      );
    };
  }, [refreshAudioDevices]);

  useEffect(() => {
    if (!meetingStartedAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [meetingStartedAt]);

  // Post-pass optimization: every time a NEW line is finalized, re-optimize the
  // WHOLE conversation from the raw real-time text (both transcription and
  // translation), using GPT-5.5 with full context, then swap every bubble.
  const segsRef = useRef(t.segments);
  useEffect(() => {
    segsRef.current = t.segments;
  }, [t.segments]);

  const optRunning = useRef(false);

  const runOptimize = useCallback(async () => {
    if (optRunning.current) return;
    optRunning.current = true;
    setOptimizing(true);
    // How many already-refined lines to send as read-only context.
    const CONTEXT_LINES = 4;
    // Track what we've optimized this run so we make progress even before the
    // `refined` flag has propagated back into segsRef.
    const done = new Set<string>();
    try {
      // Optimize only the latest, not-yet-refined lines (prioritising the
      // newest conversation) instead of re-editing the whole transcript every
      // time. Loops to pick up lines finalized *during* a request.
      while (true) {
        const snapshot = segsRef.current;
        const firstIdx = snapshot.findIndex(
          (s) => !s.refined && !done.has(s.id),
        );
        if (firstIdx === -1) break;

        const ctxStart = Math.max(0, firstIdx - CONTEXT_LINES);
        const windowSegs = snapshot.slice(ctxStart);
        const optimizeFrom = firstIdx - ctxStart;
        const targets = windowSegs.slice(optimizeFrom);

        // Context lines use their already-polished text; targets use the raw
        // realtime text so the model re-edits from the original.
        const lines = windowSegs.map((s, idx) => {
          const isCtx = idx < optimizeFrom;
          return {
            source: isCtx ? s.source : s.rawSource,
            target: isCtx ? s.target : s.rawTarget,
            sourceLang: s.sourceLang,
            targetLang: s.outputLang,
          };
        });

        let out: RefinedLine[] | null = null;
        try {
          const res = await fetch("/api/refine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lines, optimizeFrom }),
          });
          const data = (await res.json()) as { lines?: RefinedLine[] };
          if (Array.isArray(data.lines) && data.lines.length === targets.length) {
            out = data.lines;
          }
        } catch {
          out = null;
        }
        targets.forEach((s, i) => {
          const r = out?.[i];
          done.add(s.id);
          t.patchSegment(s.id, {
            source: typeof r?.source === "string" ? r.source : s.source,
            target: typeof r?.target === "string" ? r.target : s.target,
            refined: true,
          });
        });
      }
    } finally {
      optRunning.current = false;
      setOptimizing(false);
    }
  }, [t]);

  useEffect(() => {
    if (t.segments.length > 0) void runOptimize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.segments.length]);

  // Ask for tilt-sensor access (iOS needs a gesture) and turn on auto-flip.
  const enableOrientation = useCallback(async () => {
    if (orientOn) return;
    try {
      const D = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (D && typeof D.requestPermission === "function") {
        const r = await D.requestPermission();
        if (r !== "granted") return;
      }
      setOrientOn(true);
    } catch {
      // sensor not available — manual flip button still works
    }
  }, [orientOn]);

  // Auto-flip when the phone is tilted toward the other person (wide hysteresis
  // so it doesn't flip-flop), once the sensor is enabled.
  useEffect(() => {
    if (!orientOn) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const beta = e.beta;
      if (beta == null) return;
      setFlipped((prev) => {
        if (!prev && beta < 25) return true;
        if (prev && beta > 55) return false;
        return prev;
      });
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [orientOn]);

  const stopInputCheck = useCallback((preserveSnapshot = false) => {
    inputMeterRef.current?.close();
    inputMeterRef.current = null;
    setInputCheck((current) => {
      if (
        preserveSnapshot &&
        (current.status === "checking" || current.status === "checked")
      ) {
        return { status: "checked", mic: current.mic, meeting: current.meeting };
      }
      return { status: "idle", mic: 0, meeting: 0 };
    });
  }, []);

  useEffect(() => stopInputCheck, [stopInputCheck]);

  const resolveMeetingInputs = useCallback(
    async (requestLabels: boolean) => {
      let nextMic = micDeviceId;
      let nextMeeting = meetingDeviceId;
      if (autoMeetingInput || !nextMic || !nextMeeting || requestLabels) {
        const devices = await refreshAudioDevices(requestLabels);
        const detectedMic = pickDefaultMicDeviceId(devices) ?? "";
        const detectedMeeting = pickMeetingDeviceId(devices) ?? "";
        if (autoMeetingInput || !nextMic) nextMic = detectedMic;
        if (autoMeetingInput || !nextMeeting) nextMeeting = detectedMeeting;
        setMicDeviceId(nextMic);
        setMeetingDeviceId(nextMeeting);
      }

      if (!nextMeeting) {
        setInputError(
          "相手音声入力が未選択です。Zoom/Meet の出力先にした BlackHole 16ch / 2ch、または Open-Loopback の入力を選んでください。",
        );
        return null;
      }
      if (!nextMic) {
        setInputError(
          "自分のマイク入力が見つかりません。物理マイクを接続するか、手動選択に切り替えてください。",
        );
        return null;
      }
      if (nextMic === nextMeeting) {
        setInputError("自分のマイクと相手音声は別の入力を選んでください。");
        return null;
      }

      return { micDeviceId: nextMic, meetingDeviceId: nextMeeting };
    },
    [
      autoMeetingInput,
      meetingDeviceId,
      micDeviceId,
      refreshAudioDevices,
    ],
  );

  const onInputCheckToggle = useCallback(async () => {
    if (inputMeterRef.current) {
      stopInputCheck(true);
      return;
    }
    if (t.status === "live" || t.status === "connecting") return;

    setInputError(null);
    setInputCheck({ status: "starting", mic: 0, meeting: 0 });
    const inputs = await resolveMeetingInputs(true);
    if (!inputs) {
      setInputCheck({ status: "idle", mic: 0, meeting: 0 });
      return;
    }

    try {
      const meter = await createMeetingInputMeter(
        {
          mode: "meeting",
          micDeviceId: inputs.micDeviceId,
          meetingDeviceId: inputs.meetingDeviceId,
        },
        (levels) => {
          setInputCheck({
            status: "checking",
            mic: levels.mic,
            meeting: levels.meeting,
          });
        },
      );
      inputMeterRef.current = meter;
      setInputCheck((current) =>
        current.status === "starting"
          ? { status: "checking", mic: current.mic, meeting: current.meeting }
          : current,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "入力チェックを開始できませんでした。";
      setInputError(message);
      setInputCheck({ status: "error", mic: 0, meeting: 0, message });
    }
  }, [resolveMeetingInputs, stopInputCheck, t.status]);

  const copyMeetingEvidence = useCallback(async () => {
    const selectedMic = micDeviceId
      ? audioDevices.find((device) => device.deviceId === micDeviceId)
      : null;
    const selectedMeeting = meetingDeviceId
      ? audioDevices.find((device) => device.deviceId === meetingDeviceId)
      : null;
    const selfSegments = t.segments.filter(
      (segment) => segment.speaker === "self",
    ).length;
    const remoteSegments = t.segments.filter(
      (segment) => segment.speaker === "remote",
    ).length;
    const activeLanes = [
      t.partials.some((partial) => partial.speaker === "self") ? "私" : null,
      t.partials.some((partial) => partial.speaker === "remote") ? "相手" : null,
    ].filter(Boolean);
    const text = renderMeetingRuntimeEvidencePatch({
      appUrl: window.location.href,
      browser: navigator.userAgent,
      translatorMic: selectedMic?.label ?? "not selected",
      translatorRemote: selectedMeeting?.label ?? "not selected",
      autoInput: autoMeetingInput,
      inputCheck: `${inputCheck.status}; 私 ${Math.round(inputCheck.mic * 100)}%; 相手 ${Math.round(inputCheck.meeting * 100)}%`,
      sessionDuration: formatDuration(
        meetingStartedAt ? nowMs - meetingStartedAt : meetingStoppedDurationMs,
      ),
      laneSegments: `私 ${selfSegments}; 相手 ${remoteSegments}`,
      activeLanes: activeLanes.join(", "),
    });

    try {
      await navigator.clipboard.writeText(text);
      setEvidenceCopyStatus("copied");
      window.setTimeout(() => setEvidenceCopyStatus("idle"), 1800);
    } catch {
      setEvidenceCopyStatus("error");
      setInputError(
        "証跡をクリップボードへコピーできませんでした。ブラウザの権限を確認してください。",
      );
    }
  }, [
    audioDevices,
    autoMeetingInput,
    inputCheck.meeting,
    inputCheck.mic,
    inputCheck.status,
    meetingStartedAt,
    meetingStoppedDurationMs,
    meetingDeviceId,
    micDeviceId,
    nowMs,
    t.partials,
    t.segments,
  ]);

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      if (meetingStartedAt) {
        setMeetingStoppedDurationMs(Date.now() - meetingStartedAt);
      }
      t.stop();
      stopInputCheck();
      setInputError(null);
      setMeetingStartedAt(null);
      setMode(next);
    },
    [meetingStartedAt, mode, stopInputCheck, t],
  );

  // Conversation: two realtime sessions (one per language) run at once so BOTH
  // directions are translated live; we show the one going away from the speaker.
  const onConvToggle = useCallback(async () => {
    if (t.status === "idle" || t.status === "error") {
      setInputError(null);
      void enableOrientation();
      t.setAutoPair({ a: langA, b: langB });
      await t.start([langA, langB], {
        mode: "microphone",
        micDeviceId,
      });
      void refreshAudioDevices(false);
    } else {
      t.stop();
    }
  }, [t, langA, langB, micDeviceId, enableOrientation, refreshAudioDevices]);

  const onMeetingToggle = useCallback(async () => {
    if (t.status === "idle" || t.status === "error") {
      setInputError(null);
      stopInputCheck(true);
      void enableOrientation();
      const inputs = await resolveMeetingInputs(true);
      if (!inputs) return;
      t.setAutoPair({ a: langA, b: langB });
      const started = await t.start(
        [langA, langB],
        {
          mode: "meeting",
          micDeviceId: inputs.micDeviceId,
          meetingDeviceId: inputs.meetingDeviceId,
        },
        {
          a: langA,
          b: langB,
        },
      );
      const startedAt = started ? Date.now() : null;
      setMeetingStartedAt(startedAt);
      setMeetingStoppedDurationMs(0);
      setNowMs(startedAt ?? Date.now());
      void refreshAudioDevices(false);
    } else {
      if (meetingStartedAt) {
        setMeetingStoppedDurationMs(Date.now() - meetingStartedAt);
      }
      setMeetingStartedAt(null);
      t.stop();
    }
  }, [
    t,
    langA,
    langB,
    enableOrientation,
    resolveMeetingInputs,
    refreshAudioDevices,
    stopInputCheck,
    meetingStartedAt,
  ]);

  const onLiveToggle = useCallback(async () => {
    if (t.status === "idle" || t.status === "error") {
      setInputError(null);
      t.setAutoPair(null);
      await t.start([targetLang], {
        mode: "microphone",
        micDeviceId,
      });
      void refreshAudioDevices(false);
    } else {
      t.stop();
    }
  }, [t, targetLang, micDeviceId, refreshAudioDevices]);

  const swap = useCallback(() => {
    setLangA(langB);
    setLangB(langA);
  }, [langA, langB]);

  const retry = useCallback(() => {
    getMicPermission().then(setMicPerm);
    if (mode === "talk") void onConvToggle();
    else if (mode === "meeting") void onMeetingToggle();
    else void onLiveToggle();
  }, [mode, onConvToggle, onMeetingToggle, onLiveToggle]);

  const stopCurrentSession = useCallback(() => {
    if (meetingStartedAt) {
      setMeetingStoppedDurationMs(Date.now() - meetingStartedAt);
    }
    setMeetingStartedAt(null);
    t.stop();
  }, [meetingStartedAt, t]);

  const live = t.status === "live";
  const connecting = t.status === "connecting";
  const meetingDurationMs = meetingStartedAt
    ? nowMs - meetingStartedAt
    : meetingStoppedDurationMs;
  const meetingStats: MeetingSessionStats = {
    elapsed: meetingDurationMs ? formatDuration(meetingDurationMs) : "00:00",
    selfSegments: t.segments.filter((segment) => segment.speaker === "self")
      .length,
    remoteSegments: t.segments.filter((segment) => segment.speaker === "remote")
      .length,
    selfActive: t.partials.some((partial) => partial.speaker === "self"),
    remoteActive: t.partials.some((partial) => partial.speaker === "remote"),
  };

  const micBlocked =
    micPerm === "denied" ||
    (!!t.error &&
      /マイク|許可|permission|allow|secure|HTTPS|ブラウザ/i.test(t.error));

  const startLabel = connecting
    ? "接続中…"
    : live
      ? "停止"
      : mode === "live"
        ? "翻訳をはじめる"
        : mode === "meeting"
          ? "会議通訳を始める"
          : "会話を始める";

  return (
    <div className={`app${flipped ? " flipped" : ""}`}>
      <audio ref={audioRef} autoPlay playsInline />

      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" data-status={t.status} />
          <span className="brand-name">
            {optimizing ? "✨ 最新の会話を最適化中…" : "Realtime Translate"}
          </span>
        </div>
        <div className="seg">
          <button
            className={mode === "talk" ? "seg-btn on" : "seg-btn"}
            onClick={() => switchMode("talk")}
          >
            会話
          </button>
          <button
            className={mode === "meeting" ? "seg-btn on" : "seg-btn"}
            onClick={() => switchMode("meeting")}
          >
            会議
          </button>
          <button
            className={mode === "live" ? "seg-btn on" : "seg-btn"}
            onClick={() => switchMode("live")}
          >
            ライブ
          </button>
        </div>
      </header>

      {platform?.inApp && (
        <div className="banner warn" role="alert">
          ⚠️ {platform.inApp} のアプリ内ブラウザではマイクが使えません。右上メニューから
          <b> Safari / Chrome で開く</b>を選んでください。
        </div>
      )}

      {(t.error || (micBlocked && t.status !== "live")) && (
        <MicHelp
          platform={platform}
          isMicProblem={micBlocked}
          message={t.error}
          onRetry={retry}
        />
      )}

      {inputError && (
        <div className="banner warn" role="alert">
          {inputError}
        </div>
      )}

      {mode === "talk" || mode === "meeting" ? (
        <LangBar
          langA={langA}
          langB={langB}
          onChangeA={setLangA}
          onChangeB={setLangB}
          onSwap={swap}
          disabled={live || connecting}
        />
      ) : (
        <LiveTargetBar value={targetLang} onChange={setTargetLang} />
      )}

      {mode === "meeting" && (
        <MeetingInputPanel
          devices={audioDevices}
          auto={autoMeetingInput}
          inputCheck={inputCheck}
          sessionStats={meetingStats}
          evidenceStatus={evidenceCopyStatus}
          micDeviceId={micDeviceId}
          meetingDeviceId={meetingDeviceId}
          onAutoChange={(value) => {
            stopInputCheck();
            setAutoMeetingInput(value);
            setInputError(null);
          }}
          onMicChange={(value) => {
            stopInputCheck();
            setAutoMeetingInput(false);
            setMicDeviceId(value);
            setInputError(null);
          }}
          onMeetingChange={(value) => {
            stopInputCheck();
            setAutoMeetingInput(false);
            setMeetingDeviceId(value);
            setInputError(null);
          }}
          onRefresh={() => void refreshAudioDevices(true)}
          onInputCheckToggle={onInputCheckToggle}
          onCopyEvidence={() => void copyMeetingEvidence()}
          disabled={live || connecting}
          evidenceDisabled={connecting}
        />
      )}

      <main className="transcript" ref={scrollRef}>
        {mode === "talk" || mode === "meeting" ? (
          <ChatTranscript
            segments={t.segments}
            langA={langA}
            langB={langB}
            partialSource={t.partialSource}
            partialTarget={t.partialTarget}
            partials={mode === "meeting" ? t.partials : undefined}
            emptyTitle={
              mode === "meeting"
                ? "Zoom / Meet を双方向に通訳"
                : "自動で双方向に翻訳"
            }
            emptyBody={
              mode === "meeting"
                ? "会議アプリの出力を BlackHole / Open-Loopback に向け、入力自動選択のまま始めてください。"
                : "「会話を始める」を押して、日本語でも英語でもそのまま話してください。話した言語を自動で判定し、相手の言語に翻訳してチャットに表示します。"
            }
          />
        ) : (
          <LiveTranscript
            segments={t.segments}
            partialSource={t.partialSource}
            partialTarget={t.partialTarget}
            live={live}
          />
        )}
      </main>

      <footer className="controls">
        <div className="options">
          {mode === "live" && (
            <button
              className={`audio-toggle ${t.audioOn ? "on" : ""}`}
              onClick={() => t.setAudioOn(!t.audioOn)}
              aria-pressed={t.audioOn}
            >
              <span className="audio-ico">{t.audioOn ? "🔊" : "🔇"}</span>
              音声出力 {t.audioOn ? "ON" : "OFF"}
            </button>
          )}
          <button
            className={`audio-toggle flip ${flipped ? "on" : ""}`}
            onClick={() => setFlipped((v) => !v)}
            aria-pressed={flipped}
            title="相手に見せる（画面を上下反転）"
          >
            <span className="audio-ico">🔄</span>
            相手向き
          </button>
          {t.segments.length > 0 && (
            <button className="ghost" onClick={t.clear}>
              履歴を消す
            </button>
          )}
          {live && (
            <button className="ghost danger" onClick={stopCurrentSession}>
              終了
            </button>
          )}
        </div>

        <div className="live-controls">
          <button
            className={`record ${live ? "on" : ""}`}
            onClick={
              mode === "talk"
                ? onConvToggle
                : mode === "meeting"
                  ? onMeetingToggle
                  : onLiveToggle
            }
            disabled={connecting}
          >
            <span className="record-icon" />
            {startLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- Language bars ---------------- */

function LangBar({
  langA,
  langB,
  onChangeA,
  onChangeB,
  onSwap,
  disabled,
}: {
  langA: string;
  langB: string;
  onChangeA: (v: string) => void;
  onChangeB: (v: string) => void;
  onSwap: () => void;
  disabled: boolean;
}) {
  return (
    <div className="langbar">
      <LangSelect
        value={langA}
        onChange={onChangeA}
        exclude={langB}
        disabled={disabled}
      />
      <button
        className="swap"
        onClick={onSwap}
        disabled={disabled}
        aria-label="言語を入れ替え"
      >
        ⇄
      </button>
      <LangSelect
        value={langB}
        onChange={onChangeB}
        exclude={langA}
        disabled={disabled}
      />
    </div>
  );
}

function LiveTargetBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="langbar live">
      <span className="live-arrow">すべてを翻訳 →</span>
      <LangSelect value={value} onChange={onChange} />
    </div>
  );
}

function MeetingInputPanel({
  devices,
  auto,
  inputCheck,
  sessionStats,
  evidenceStatus,
  micDeviceId,
  meetingDeviceId,
  onAutoChange,
  onMicChange,
  onMeetingChange,
  onRefresh,
  onInputCheckToggle,
  onCopyEvidence,
  disabled,
  evidenceDisabled,
}: {
  devices: AudioInputDevice[];
  auto: boolean;
  inputCheck: InputCheckState;
  sessionStats: MeetingSessionStats;
  evidenceStatus: EvidenceCopyStatus;
  micDeviceId: string;
  meetingDeviceId: string;
  onAutoChange: (value: boolean) => void;
  onMicChange: (value: string) => void;
  onMeetingChange: (value: string) => void;
  onRefresh: () => void;
  onInputCheckToggle: () => void;
  onCopyEvidence: () => void;
  disabled: boolean;
  evidenceDisabled: boolean;
}) {
  const hasLoopback = devices.some(isLoopbackDevice);
  const selectedMeeting = meetingDeviceId
    ? devices.find((device) => device.deviceId === meetingDeviceId)
    : null;
  const remoteInputSilent =
    (inputCheck.status === "checking" || inputCheck.status === "checked") &&
    inputCheck.meeting <= 0.02;
  const remoteLaneSilent =
    sessionStats.elapsed !== "00:00" &&
    sessionStats.remoteSegments === 0 &&
    (sessionStats.selfSegments > 0 || sessionStats.selfActive);
  const showRemoteRouteHint = remoteInputSilent || remoteLaneSilent;
  return (
    <section className="meetpanel" aria-label="会議音声入力">
      <div className="meetauto">
        <div>
          <span className="meetauto-title">入力を自動選択</span>
          <span className="meetauto-sub">
            {selectedMeeting
              ? `相手音声: ${selectedMeeting.label}`
              : "BlackHole 16ch を優先"}
          </span>
        </div>
        <button
          className={`autoswitch${auto ? " on" : ""}`}
          onClick={() => onAutoChange(!auto)}
          aria-pressed={auto}
          disabled={disabled}
        >
          {auto ? "ON" : "OFF"}
        </button>
      </div>
      <div className="meetgrid">
        <DeviceSelect
          label="自分のマイク"
          value={micDeviceId}
          devices={devices}
          onChange={onMicChange}
          disabled={disabled || auto}
        />
        <DeviceSelect
          label="相手音声"
          value={meetingDeviceId}
          devices={devices}
          onChange={onMeetingChange}
          disabled={disabled || auto}
          preferLoopback
        />
      </div>
      <div className="meetpanel-foot">
        <span className={hasLoopback ? "meetstatus ok" : "meetstatus"}>
          {hasLoopback
            ? "Loopback入力を検出"
            : "BlackHole / Open-Loopback 未検出"}
        </span>
        <div className="meetpanel-actions">
          <button className="meetrefresh" onClick={onRefresh} disabled={disabled}>
            候補更新
          </button>
          <button
            className={`meetrefresh${evidenceStatus === "copied" ? " copied" : ""}`}
            onClick={onCopyEvidence}
            disabled={evidenceDisabled}
          >
            {evidenceStatus === "copied"
              ? "コピー済み"
              : evidenceStatus === "error"
                ? "コピー失敗"
                : "証跡コピー"}
          </button>
        </div>
      </div>
      <div className="meetstats" aria-label="会議通訳セッション状態">
        <span>経過 {sessionStats.elapsed}</span>
        <span className={sessionStats.selfActive ? "on" : ""}>
          私 {sessionStats.selfSegments}
        </span>
        <span className={sessionStats.remoteActive ? "on" : ""}>
          相手 {sessionStats.remoteSegments}
        </span>
      </div>
      <div className="meterbox">
        <button
          className={`meterbtn${inputCheck.status === "checking" ? " on" : ""}`}
          onClick={onInputCheckToggle}
          disabled={disabled || inputCheck.status === "starting"}
        >
          {inputCheck.status === "checking"
            ? "入力チェック停止"
            : inputCheck.status === "starting"
              ? "確認中..."
              : inputCheck.status === "checked"
                ? "再チェック"
              : "入力チェック"}
        </button>
        {inputCheck.status !== "idle" && (
          <div className="metergrid">
            <InputMeter label="私" level={inputCheck.mic} />
            <InputMeter label="相手" level={inputCheck.meeting} />
          </div>
        )}
        {inputCheck.status === "error" && inputCheck.message && (
          <p className="metererror">{inputCheck.message}</p>
        )}
        {showRemoteRouteHint && (
          <p className="meterhint">
            相手音声が
            {selectedMeeting ? ` ${selectedMeeting.label} ` : " loopback "}
            に入っていません。Chrome / Zoom / Meet のスピーカー出力を BlackHole
            または BlackHole を含む Multi-Output にしてください。
          </p>
        )}
      </div>
    </section>
  );
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function InputMeter({ label, level }: { label: string; level: number }) {
  const percent = Math.round(level * 100);
  const active = level > 0.04;
  return (
    <div className="meterlane">
      <span className="meterlabel">{label}</span>
      <span className="meterbar" aria-label={`${label} 入力レベル ${percent}%`}>
        <span style={{ width: `${Math.max(2, percent)}%` }} />
      </span>
      <span className={active ? "meterstate on" : "meterstate"}>
        {active ? "入力あり" : "待機"}
      </span>
    </div>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  onChange,
  disabled,
  preferLoopback,
}: {
  label: string;
  value: string;
  devices: AudioInputDevice[];
  onChange: (value: string) => void;
  disabled: boolean;
  preferLoopback?: boolean;
}) {
  return (
    <label className="devselect">
      <span className="devselect-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">自動（推奨）</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {preferLoopback && isLoopbackDevice(device) ? "● " : ""}
            {device.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LangSelect({
  value,
  onChange,
  exclude,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
  disabled?: boolean;
}) {
  const lang = getLanguage(value);
  return (
    <label className={`langselect${disabled ? " disabled" : ""}`}>
      <span className="langselect-flag">{lang.flag}</span>
      <span className="langselect-name">{lang.name}</span>
      <span className="langselect-caret">▾</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="言語を選択"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} disabled={l.code === exclude}>
            {l.flag} {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------------- Conversation (LINE-style chat) ---------------- */

function ChatTranscript({
  segments,
  langA,
  langB,
  partialSource,
  partialTarget,
  partials,
  emptyTitle,
  emptyBody,
}: {
  segments: Segment[];
  langA: string;
  langB: string;
  partialSource: string;
  partialTarget: string;
  partials?: PartialSegment[];
  emptyTitle: string;
  emptyBody: string;
}) {
  if (
    segments.length === 0 &&
    !partialSource &&
    !partialTarget &&
    (!partials || partials.length === 0)
  ) {
    return <Empty title={emptyTitle} body={emptyBody} />;
  }
  const sideOfLang = (src: string) => (src === langA ? "a" : "b");
  const sideOfSpeaker = (speaker?: Segment["speaker"]) =>
    speaker === "self" ? "a" : speaker === "remote" ? "b" : null;
  return (
    <div className="chat">
      {segments.map((s) => {
        const src =
          s.sourceLang ?? (s.outputLang === langA ? langB : langA);
        return (
          <ChatMsg
            key={s.id}
            side={sideOfSpeaker(s.speaker) ?? sideOfLang(src)}
            srcLang={src}
            speaker={s.speaker}
            original={s.source}
            translated={s.target}
            refined={s.refined}
          />
        );
      })}
      {partials?.map((partial) => {
        const src =
          partial.sourceLang ?? (partial.outputLang === langA ? langB : langA);
        return (
          <ChatMsg
            key={partial.id}
            side={sideOfSpeaker(partial.speaker) ?? sideOfLang(src)}
            srcLang={src}
            speaker={partial.speaker}
            original={partial.source}
            translated={partial.target}
            pending
          />
        );
      })}
      {!partials?.length && (partialSource || partialTarget) && (
        <ChatMsg
          side={sideOfLang(detectPairLanguage(partialSource, langA, langB) ?? langA)}
          srcLang={detectPairLanguage(partialSource, langA, langB) ?? langA}
          original={partialSource}
          translated={partialTarget}
          pending
        />
      )}
    </div>
  );
}

function ChatMsg({
  side,
  srcLang,
  speaker,
  original,
  translated,
  pending,
  refined,
}: {
  side: "a" | "b";
  srcLang: string;
  speaker?: Segment["speaker"];
  original: string;
  translated: string;
  pending?: boolean;
  refined?: boolean;
}) {
  const lang = getLanguage(srcLang);
  const avatar = speaker === "self" ? "私" : speaker === "remote" ? "相手" : lang.flag;
  return (
    <div className={`msg ${side}${pending ? " pending" : ""}`}>
      <span
        className={`msg-avatar${speaker ? " speaker" : ""}`}
        title={speaker === "self" ? "私のマイク" : speaker === "remote" ? "相手音声" : lang.name}
        aria-hidden
      >
        {avatar}
      </span>
      <div className="msg-bubble">
        {/* translation on top, transcription (original) below */}
        <p className="msg-main">
          {translated || "…"}
          {refined && (
            <span className="msg-badge" title="GPT-5.5で最適化済み">
              ✨
            </span>
          )}
        </p>
        {original && <p className="msg-sub">{original}</p>}
      </div>
    </div>
  );
}

/* ---------------- Live transcript ---------------- */

function LiveTranscript({
  segments,
  partialSource,
  partialTarget,
  live,
}: {
  segments: Segment[];
  partialSource: string;
  partialTarget: string;
  live: boolean;
}) {
  if (segments.length === 0 && !partialSource && !partialTarget) {
    return (
      <Empty
        title="ライブ翻訳"
        body={
          live
            ? "話しかけてください。聞こえた音声をリアルタイムで翻訳します。"
            : "出力言語を選び「翻訳をはじめる」を押してください。講演や動画など、聞こえる音声を字幕で翻訳します。"
        }
      />
    );
  }
  return (
    <div className="live-feed">
      {segments.map((s) => (
        <div key={s.id} className="live-line done">
          <p className="live-target">{s.target}</p>
          {s.source && <p className="live-source">{s.source}</p>}
        </div>
      ))}
      {(partialSource || partialTarget) && (
        <div className="live-line current">
          <p className="live-target">{partialTarget || "…"}</p>
          {partialSource && <p className="live-source">{partialSource}</p>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Mic / error help ---------------- */

function MicHelp({
  platform,
  isMicProblem,
  message,
  onRetry,
}: {
  platform: Platform | null;
  isMicProblem: boolean;
  message: string | null;
  onRetry: () => void;
}) {
  const steps = isMicProblem && platform ? micFixSteps(platform) : [];
  return (
    <div className="michelp" role="alert">
      <div className="michelp-head">
        <span className="michelp-ico">🎤</span>
        {isMicProblem ? "マイクを使えませんでした" : "エラーが発生しました"}
      </div>
      {message && <p className="michelp-msg">{message}</p>}
      {steps.length > 0 && (
        <ol className="michelp-steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      <div className="michelp-actions">
        <button className="michelp-btn primary" onClick={onRetry}>
          もう一度試す
        </button>
        <button
          className="michelp-btn"
          onClick={() => window.location.reload()}
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}

/* ---------------- Empty state ---------------- */

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <div className="empty-glyph">🌐</div>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
