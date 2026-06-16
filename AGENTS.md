<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Rules

## Product Contract

- Read `spec.md` before changing user-visible behavior.
- `Plans.md` is the task ledger. Keep it separate from `spec.md`.
- `docs/meeting-local-verification.md` records local readiness evidence; keep live-call proof separate.
- Meeting interpretation targets macOS Zoom / Google Meet first.
- Browser-only automatic capture of Zoom / Meet remote audio is not a supported claim.

## Audio Routing Rules

- Treat meeting audio as separate lanes:
  - local microphone -> Realtime session -> UI speaker `私`
  - remote meeting audio -> Realtime session -> UI speaker `相手`
  - remote meeting audio must not be routed back to meeting microphone send
- Prefer automatic input selection:
  - remote audio: `BlackHole 16ch` -> `BlackHole 2ch` -> `Open-Loopback` -> other loopback input
  - local mic: non-loopback audio input
- Keep automatic selection in `lib/audioDeviceSelection.mjs`; UI and preflight must use the same selector.
- Do not merge meeting lanes into one WebRTC track when speaker ownership matters.
- Disable echo cancellation, noise suppression, and auto gain control on the loopback lane.
- BlackHole / Open-Loopback setup is an OS-level prerequisite, not something this web app installs.

## Verification

- Run `pnpm lint` and `pnpm build` after source changes.
- Run `pnpm meeting:preflight` before claiming local meeting readiness.
- Run `pnpm meeting:device-selection-smoke` when changing auto device selection.
- Run `pnpm meeting:verify` before claiming all local meeting gates are green.
- Run `pnpm meeting:route-snapshot` before live smoke when you need a saved local route artifact under `docs/evidence/`.
- Run `pnpm meeting:prepare-smoke -- zoom|meet` to create a paired route snapshot and live smoke evidence template.
- Run `pnpm meeting:check-evidence <docs/evidence/*-smoke.md>` after filling live smoke observations; use `--scope=endurance` when validating the 30 minute gate.
- Run `pnpm meeting:proof-status` before claiming the full Zoom / Meet interpretation goal is complete.
- Do not start OpenAI Realtime / Zoom / Meet live proof without explicit operator approval; local prep/check commands are safe, live translation is paid/external.
- Live smoke evidence must include `live approval` like `approved by <operator> at <time>`; runbook text or chat approval alone is not final proof.
- Older smoke templates may be schema-upgraded with a blank `live approval` row, but that must never be treated as approval.
- Use browser smoke for UI changes when a dev server can run.
- `入力チェック` proves local physical mic / loopback input levels only.
- `証跡コピー` and `meeting:route-snapshot` capture local app/device state for live smoke notes; they are not live-call proof.
- `pnpm meeting:new-evidence -- zoom|meet` creates only the live smoke evidence file; `pnpm meeting:prepare-smoke -- zoom|meet` creates it together with a route snapshot. Both are still pending until filled from a real call.
- `pnpm meeting:check-evidence` is the post-call evidence completeness gate; it must fail while generated templates still contain pending / empty observation fields.
- `pnpm meeting:proof-status` is the final completion audit over `docs/evidence/`; it must fail until Zoom smoke, Google Meet smoke, and 30 minute endurance evidence all pass.
- Do not mark Zoom / Google Meet live proof complete from UI presence, device listing, or synthetic counters alone.
- Live proof requires remote-only, mic-only, mixed speech, no-echo, and endurance checks.
