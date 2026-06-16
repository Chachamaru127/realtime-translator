@AGENTS.md

# Claude / Codex Handoff Notes

- Primary SSOT: `spec.md`.
- Task ledger: `Plans.md`.
- Meeting runbook: `docs/meeting-audio-routing.md`.
- Local verification evidence: `docs/meeting-local-verification.md`.
- Live smoke evidence directory: `docs/evidence/`.
- Smoke checklist: `docs/meeting-smoke-checklist.md`.
- Route snapshot command: `pnpm meeting:route-snapshot`.
- Paired live smoke prep command: `pnpm meeting:prepare-smoke -- zoom|meet`.
- Post-call evidence check: `pnpm meeting:check-evidence <docs/evidence/*-smoke.md> [--scope=smoke|endurance]`.
- Final proof status: `pnpm meeting:proof-status`.
- Keep Zoom / Meet live-call proof separate from browser UI/build proof.
- Do not start paid/external OpenAI Realtime + Zoom / Meet live proof without explicit operator approval.
- Final smoke evidence needs `live approval` like `approved by <operator> at <time>`.
- A blank `live approval` row added to an older smoke template is schema migration only, not proof.
