# Zoom Meet Interpretation Plans.md

作成日: 2026-06-16

---

## Decision Summary

Spec delta:
- path: `spec.md`
- change: Zoom / Google Meet 会議モードは、OS 側で明示的に流した loopback 入力と自分のマイクを別々の Realtime session へ渡し、UI では loopback を `相手`、物理マイクを `私` として合流する。
- why: ブラウザ単体では Zoom / Meet の相手音声を安定して自動取得できず、BlackHole / Open-Loopback を使う lane 契約が必要なため。

team_validation_mode: subagent

formatter_baseline:
- status: configured
- evidence: `package.json` に `lint` / `build`、`eslint.config.mjs` に Next ESLint 設定あり
- action: none

---

## Phase 1: Meeting Audio Capture

Purpose: Zoom / Google Meet の相手音声と自分のマイクを、設定迷子にせず双方向翻訳へ流す。

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 1.1 | root `spec.md` と会議音声 routing 方針を作成する [tdd:skip:docs-only] | `spec.md` に目的、lane、non-goal、no-echo 境界が記載されている | - | cc:完了 [local] |
| 1.2 | BlackHole / Open-Loopback の自動入力選択を実装する | `会議` モード開始時に相手音声は BlackHole 16ch 優先、自分マイクは専用USBマイク優先で選択される | 1.1 | cc:完了 [local] |
| 1.3 | mic lane と meeting lane を別々の Realtime session に接続する | 会議モードで物理マイクは `私`、loopback は `相手` として表示され、loopback 側は EC/NS/AGC 無効で取得される | 1.2 | cc:完了 [local] |
| 1.8 | 会議モードの partial / finalized chat を lane-aware にする | 発話言語ではなく入力元に基づき、物理マイク由来は右側 `私`、loopback 由来は左側 `相手` に表示される | 1.3, 1.4 | cc:完了 [local] |
| 1.9 | OpenAI 非接続の会議入力チェックを追加する | `入力チェック` で物理マイク lane と loopback lane の入力レベルを別々に表示し、停止で device を解放できる。会議開始時は最後の非ゼロ snapshot を `checked` として保持する | 1.2, 1.8 | cc:完了 [local] |
| 1.10 | 実通話前の再現可能な preflight を追加する | `pnpm meeting:preflight` が OS audio device / env fallback / dev server を secret なしで確認し、`docs/meeting-smoke-checklist.md` に Zoom/Meet gate が記載されている | 1.5, 1.9 | cc:完了 [local] |
| 1.11 | UI と preflight の自動選択ルールを共有する | `lib/audioDeviceSelection.mjs` を UI と `pnpm meeting:preflight` の両方が使い、BlackHole 16ch -> 2ch -> Open-Loopback の順で同じ候補を選ぶ | 1.2, 1.10 | cc:完了 [local] |
| 1.12 | local meeting verification を 1 コマンド化する | `pnpm meeting:verify` が preflight / lint / build / server env fallback mock を外部 OpenAI 送信なしで通す | 1.7, 1.10, 1.11 | cc:完了 [local] |
| 1.13 | live smoke 用の証跡コピーを追加する | 会議モードで選択中の `自分のマイク` / `相手音声` / 入力チェック snapshot / browser URL を、secret なしの `Runtime Evidence` Markdown table としてコピーでき、smoke evidence 末尾に貼るだけで checker が読む | 1.9, 1.10 | cc:完了 [local] |
| 1.14 | 自動デバイス選択を fixture で検証する | `pnpm meeting:device-selection-smoke` が BlackHole 16ch -> 2ch -> Open-Loopback と専用USBマイク優先を検証し、`pnpm meeting:verify` に含まれる | 1.11 | cc:完了 [local] |
| 1.15 | ローカル検証証跡を文書化する [tdd:skip:docs-only] | `docs/meeting-local-verification.md` に command gate / browser smoke / clipboard shape / remaining live gates がまとまっている | 1.6, 1.13, 1.14 | cc:完了 [local] |
| 1.16 | 実通話 smoke 証跡テンプレート生成を追加する | `pnpm meeting:new-evidence -- zoom` / `-- meet` で `docs/evidence/` 向けの Zoom / Google Meet smoke 証跡テンプレートを生成でき、`--dry-run` で内容を確認できる | 1.15 | cc:完了 [local] |
| 1.17 | 会議セッション状態を証跡に含める | 会議モードに `経過` / `私` / `相手` の状態が出て、`証跡コピー` と `meeting:new-evidence` に session duration / lane segments を記録できる | 1.13, 1.16 | cc:完了 [local] |
| 1.18 | 話者 lane contract を証跡に明示する | `証跡コピー` / `meeting:new-evidence` / `meeting:preflight` / fixture smoke が `私=physical mic`、`相手=loopback playback` の対応を残す | 1.13, 1.14, 1.17 | cc:完了 [local] |
| 1.19 | 実通話直前の route snapshot を生成する | `pnpm meeting:route-snapshot` が `docs/evidence/` に app URL / selected devices / lane map / env fallback / audio device list を secret なしで保存でき、`--dry-run` で確認できる | 1.10, 1.18 | cc:完了 [local] |
| 1.20 | live smoke 準備ファイルをペア生成する | `pnpm meeting:prepare-smoke -- zoom|meet` が同一 timestamp の route snapshot と smoke evidence template を `docs/evidence/` に作成し、template 側に app URL / translator mic / translator remote / route snapshot / local preflight を埋める | 1.16, 1.19 | cc:完了 [local] |
| 1.21 | live smoke evidence の completeness gate を追加する | `pnpm meeting:check-evidence <file>` が空欄 / pending / route snapshot 欠落 / local preflight WARN / device not found / 10分未満 / 片laneのみを検出し、fixture smoke が `pnpm meeting:verify` に含まれる | 1.16, 1.20 | cc:完了 [local] |
| 1.22 | live proof status の最終監査を追加する | `pnpm meeting:proof-status` が `docs/evidence/` 内の Zoom 10分 / Google Meet 10分 / 30分 endurance PASS 証跡を一括監査し、未完なら non-zero で失敗する。`pnpm meeting:proof-status-smoke` が最終監査ロジックの fixture を通す | 1.21 | cc:完了 [local] |
| 1.23 | 既存 smoke evidence の local route backfill を追加する | `pnpm meeting:backfill-evidence --all` が既存 smoke template の空欄 app URL / translator mic / translator remote / local preflight を route snapshot から補完し、手入力済みの実観察欄は上書きしない。fixture smoke が `pnpm meeting:verify` に含まれる | 1.20, 1.21 | cc:完了 [local] |
| 1.24 | Runtime Evidence の clipboard 追記コマンドを追加する | `pnpm meeting:append-runtime-evidence <smoke.md> --clipboard` が `証跡コピー` の Markdown table だけを evidence 末尾に追記し、fixture smoke が checker 受理まで検証する | 1.13, 1.21 | cc:完了 [local] |
| 1.25 | Runtime Evidence の弱い値を拒否する | `meeting:append-runtime-evidence` と `meeting:check-evidence` が `idle` / 0% / 10分未満 / 片 lane 0 件の runtime evidence を拒否し、fixture smoke がその拒否を検証する | 1.21, 1.24 | cc:完了 [local] |
| 1.26 | 次に必要な live proof action を出す | `pnpm meeting:next-proof` が `meeting:proof-status` の不足から Zoom 10分 / Meet 10分 / 30分 endurance の次手順を JSON で出し、準備済み template があれば `existingEvidenceFile` を返し、fixture smoke が順序と既存 path 利用を検証する | 1.22 | cc:完了 [local] |
| 1.27 | live observation の手編集を CLI 化する | `pnpm meeting:record-observation <smoke.md>` が `speaker route` / `meeting mic` / case pass evidence を記録し、`meeting:check-evidence` が `fail` case を reject する。fixture smoke が dry-run / reject / checker 受理を検証する | 1.21, 1.24 | cc:完了 [local] |
| 1.28 | observation CLI の Markdown cell 安全性を追加する | `meeting:record-observation` が `|` / 改行入りの setup / evidence 値を reject し、fixture smoke が table injection 防止を検証する | 1.27 | cc:完了 [local] |
| 1.29 | placeholder のままの live proof を拒否する | `meeting:record-observation` と `meeting:check-evidence` が `<...>` placeholder の setup / evidence 値を reject し、fixture smoke がその拒否を検証する | 1.27, 1.28 | cc:完了 [local] |
| 1.30 | observation CLI の no-op 成功を拒否する | `meeting:record-observation` が更新項目なしの実行を reject し、fixture smoke が no-op reject を検証する | 1.27 | cc:完了 [local] |
| 1.31 | next-proof の command phase を分離する | `meeting:next-proof` が `templateCommands` / `finalCommands` より前に実行する `commands`、置換して使う `templateCommands`、記録後監査の `finalCommands` を分け、fixture smoke が `commands` / `finalCommands` に placeholder が混ざらないことを検証する | 1.26, 1.29 | cc:完了 [local] |
| 1.32 | observation CLI の file 引数誤認を防ぐ | `meeting:record-observation` が file 引数なしで `--speaker-route value` だけ渡された時に value を file path と誤認せず usage error にでき、fixture smoke が検証する | 1.27, 1.30 | cc:完了 [local] |
| 1.33 | next-proof の人間向け runbook 表示を追加する | `pnpm meeting:next-proof --text` が実観察前 / 観察記録 / 記録後監査を順序付きで表示し、fixture smoke が text output の command phase 説明を検証する | 1.31 | cc:完了 [local] |
| 1.34 | browser-visible 会議 UI を current state で再確認する | Playwright MCP で `http://localhost:3002/` を開き、`会議` tab active、`自分のマイク=HyperX SoloCast`、`相手音声=BlackHole 16ch`、`証跡コピー` / `入力チェック` / `会議通訳を始める` が表示されることを `docs/meeting-local-verification.md` に残す | 1.4, 1.15 | cc:完了 [local] |
| 1.35 | live 中でも有効な Runtime Evidence をコピーできるようにする | 会議開始時に `入力チェック` を `checked` snapshot として保持し、通訳 live 中も `証跡コピー` を押せ、停止後も最後の session duration が 00:00 に戻らない。fixture smoke が `checked` input check を受理する | 1.9, 1.13, 1.25 | cc:完了 [local] |
| 1.36 | preflight env fallback を Next route と同じ loader で検証する | `lib/serverEnvConfig.mjs` が server route と preflight 共通で fallback root の `.env` / `.env.local` を判定し、`pnpm meeting:system-env-smoke` が `export OPENAI_API_KEY=...` 形式を secret 非表示で受理する。server route helper も `OPENAI_API_KEY=""` を未設定として canonical env fallback に進み、`pnpm meeting:verify` に含まれる | 1.7, 1.10, 1.12 | cc:完了 [local] |
| 1.37 | source / evidence の API key-shaped 値を検出する | `pnpm meeting:secret-scan` が OpenAI API-key-shaped 値を reject し、`.playwright-mcp/` / `.harness-mem/` などの local generated state を ignore する。`pnpm meeting:verify` に含まれる | 1.10, 1.13, 1.19 | cc:完了 [local] |
| 1.38 | Runtime Evidence 追記 CLI の file 引数誤認を防ぐ | `meeting:append-runtime-evidence` が `--input runtime.md` などの option 値を smoke evidence path と誤認せず、fixture smoke が検証する | 1.24, 1.31 | cc:完了 [local] |
| 1.39 | Runtime Evidence append 前 validation を checker と揃える | `meeting:append-runtime-evidence` が unavailable/same device、lane map 不一致、弱い input/duration/lane segments を append 前に拒否し、`meeting:check-evidence` も `--scope endurance` を file path と誤認しない | 1.21, 1.24, 1.38 | cc:完了 [local] |
| 1.40 | smoke evidence table parser を escaped pipe 対応にする | `scripts/markdown-table.mjs` で `\|` を cell 内文字として読み、Runtime Evidence の URL / browser / device label に `|` が含まれても append と checker が受理できる | 1.13, 1.21, 1.24 | cc:完了 [local] |
| 1.41 | live proof runbook に approval gate を出す | `meeting:next-proof` の JSON / `--text` が paid OpenAI Realtime と外部 Zoom / Meet live run の明示承認 gate を表示し、fixture smoke がその出力を検証する | 1.26, 1.33 | cc:完了 [local] |
| 1.42 | live approval を smoke evidence の completion 条件にする | smoke evidence template に `live approval` 欄があり、`meeting:record-observation --live-approval` と `meeting:check-evidence` が `approved by <operator> at <time>` 形式でない proof を拒否する | 1.21, 1.27, 1.41 | cc:完了 [local] |
| 1.43 | 古い smoke evidence に live approval 欄を安全追加する | `meeting:backfill-evidence` は `live approval` 欄がない古い template に空欄行だけを追加し、`meeting:record-observation --live-approval` は同じ古い template に行を追加してから実承認値を記録できる。fixture smoke が both path を検証する | 1.23, 1.42 | cc:完了 [local] |
| 1.44 | next-proof の runtime evidence 手順を after-live に分離する | `meeting:next-proof` が live 前の `commands` と、実通話後に `証跡コピー` してから走らせる `runtimeEvidenceCommands` を分け、`--text` では `After live run / 証跡コピー` として表示する。fixture smoke が clipboard command を live 前に出さないことを検証する | 1.24, 1.31, 1.33 | cc:完了 [local] |
| 1.45 | OpenAI project/org header と quota error 表示を追加する | server route が任意の `OPENAI_PROJECT` / `OPENAI_ORGANIZATION` を OpenAI request header に渡し、Realtime 接続 429 quota/billing error を利用枠・請求設定の問題として表示する。`meeting:session-env-smoke` が header 付与を mock fetch で検証する | 1.7, 1.36 | cc:完了 [local] |
| 1.46 | 相手音声の無音ルート診断を追加する | `入力チェック` / session stats で `相手` lane が無音の時、Chrome / Zoom / Meet の speaker route が BlackHole / Multi-Output に向いていない可能性を UI に表示する。`meeting:preflight` は system default output が loopback でない時に Chrome/YouTube test 向けの NOTE を出す | 1.2, 1.15, 1.45 | cc:完了 [local] |
| 1.47 | Open-Loopback monitor bridge を会議運用コマンド化する | `pnpm meeting:monitor:start/status/stop` が Open-Loopback の `--monitor-bridge` を使い、`BlackHole 16ch -> 物理 output` を常駐起動できる。`meeting:preflight` は bridge の running 状態を表示し、system output が BlackHole なのに bridge 未起動なら NOTE を出す。fixture smoke が物理 output 選択を検証する | 1.2, 1.46 | cc:完了 [local] |
| 1.4 | 会議モード UI を追加する [feature:a11y] | `会議` タブ、入力自動選択表示、手動 override、開始/停止がスマホ/デスクトップで破綻しない | 1.2, 1.3 | cc:完了 [local] |
| 1.5 | Zoom / Meet routing runbook を追加する [tdd:skip:docs-only] | README と docs に BlackHole / Open-Loopback の最小手順と live proof gate が分離して記載されている | 1.1 | cc:完了 [local] |
| 1.6 | lint / build / browser smoke で検証する | `pnpm lint` と `pnpm build` が通り、localhost の会議モード UI が表示される | 1.2, 1.3, 1.4, 1.5, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19, 1.20, 1.21, 1.22 | cc:完了 [local] |
| 1.7 | 外部 root `.env` fallback を実装する | worktree に `OPENAI_API_KEY` がない場合 `/Users/tachibanashuuta/LocalWork/Code/realtime-translator/.env` から server env を読み、`pnpm lint` / `pnpm build` が通る | 1.6 | cc:完了 [local] |

## Phase 2: Live Meeting Proof

Purpose: Web app 実装と、実 Zoom / Meet 通話での音声 routing 成立を別 gate として証明する。

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| 2.1 | Zoom manual smoke を実施する | `pnpm meeting:prepare-smoke -- zoom` で作った証跡に、Zoom で相手だけ / 自分だけ / 同時発話の 3 ケースを 10 分確認し、相手音声が send lane に戻らず、`pnpm meeting:check-evidence <file>` が PASS している | Phase 1 | blocked: 実 Zoom 通話環境が必要 |
| 2.2 | Google Meet manual smoke を実施する | `pnpm meeting:prepare-smoke -- meet` で作った証跡に、Google Meet で相手だけ / 自分だけ / 同時発話の 3 ケースを 10 分確認し、device lost がなく、`pnpm meeting:check-evidence <file>` が PASS している | Phase 1 | blocked: 実 Meet 通話環境が必要 |
| 2.3 | 30 分 endurance gate を実施する | 会議モードで 30 分字幕が継続し、音声入力 device が途中で消えず、`pnpm meeting:check-evidence <file> --scope=endurance` と `pnpm meeting:proof-status` が PASS している | 2.1, 2.2 | blocked: 実会議または同等の長時間音源が必要 |
