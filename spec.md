# Zoom / Meet Interpretation Spec

作成日: 2026-06-16

## Purpose

Zoom / Google Meet などの会議中に、相手音声と自分のマイク音声を拾い、既存の Realtime Translate の双方向翻訳 UI へ流す。

## Users And Workflows

- macOS 上で Zoom / Google Meet を使いながら通訳字幕を見たいユーザー。
- ユーザーは `会議` モードを選び、開始操作だけで最適な入力構成を自動選択できる。
- 手動入力選択は fallback であり、主導線ではない。

## Core Rules

- 会議モードの入力は `自分のマイク` と `相手音声` の 2 lane として扱う。
- 相手音声は BlackHole / Open-Loopback など、ユーザーが OS 側で明示的に流した仮想入力から取得する。
- 自動選択は `BlackHole 16ch`、`BlackHole 2ch`、`Open-Loopback`、その他 loopback 系入力の順で相手音声を選ぶ。
- 自分のマイクは loopback / virtual 系ではない音声入力から、専用 USB マイクを優先する。
- 会議モードでは 2 lane を 1 stream に混ぜず、`自分のマイク` と `相手音声` を別々の Realtime session に送る。
- 物理マイク lane は常に `私`、loopback lane は常に `相手` として UI に反映する。
- `lane map` は live smoke 証跡上も `私=translator mic`、`相手=translator remote/playback` として明示する。
- loopback lane は echo cancellation / noise suppression / auto gain control を無効化し、仮想入力の相手音声を壊さない。
- `入力チェック` は OpenAI に接続せず、物理マイク lane と loopback lane の入力レベルだけを表示する。会議通訳開始時は meter を停止して device を解放し、最後の非ゼロ snapshot を `checked` として保持する。
- 会議モードは live smoke / endurance 用に、セッション経過時間と `私` / `相手` の確定件数を表示する。停止後も最後の会議経過時間を保持し、`証跡コピー` で 00:00 に戻さない。
- `証跡コピー` は live smoke 用に現在の app URL、browser、選択中の物理マイク、loopback 入力、lane map、入力チェック snapshot、セッション経過時間、lane 件数だけを `Runtime Evidence` Markdown table として secret なしで出す。通訳 live 中も押せる。
- `meeting:route-snapshot` は実通話直前の OS audio device / app URL / env fallback / lane map を `docs/evidence/` に保存する。
- `meeting:prepare-smoke -- zoom|meet` は route snapshot と live smoke evidence template を同じ timestamp でペア生成し、smoke evidence 側に app URL / translator mic / translator remote / route snapshot / local preflight を prefill する。
- `meeting:backfill-evidence` は既存 smoke evidence の空欄 local route fields だけを route snapshot から補完し、手入力済みの実観察欄は上書きしない。古い template に `live approval` 行がない場合は空欄行だけを追加するが、承認値は入れない。
- `meeting:append-runtime-evidence` は `証跡コピー` の `Runtime Evidence` Markdown table を smoke evidence file 末尾へ追記し、Setup table の手編集を避ける。`idle` / `starting` / `error` / 0% / 10分未満 / 片 lane 0 件の runtime table は拒否する。
- `meeting:record-observation` は実通話で観察した live approval / `speaker route` / `meeting mic` / case result を smoke evidence file に安全に記録する。古い template に `live approval` 行がない場合は行を追加してから記録する。case result は `pass` のみ completion proof として扱い、no-op、Markdown table を壊す `|` / 改行入りの値、`<...>` placeholder、`approved by <operator> at <time>` 形式でない live approval は拒否する。
- `meeting:check-evidence` は実通話後の smoke evidence に空欄 / pending / fail case / placeholder / live approval 欠落 / route snapshot 欠落 / local preflight WARN / device not found / 入力チェック未反応が残っていないかを検査する。
- `meeting:proof-status` は `docs/evidence/` 全体から Zoom 10分、Google Meet 10分、30分 endurance が揃ったかを監査する。
- `meeting:next-proof` は `meeting:proof-status` の不足条件から、次に実行すべき live smoke / endurance 手順を既定 JSON で出す。`--text` では実通話中に読める順序付き runbook を出す。準備済み template があれば `existingEvidenceFile`、新規取り直し用に `freshPrepareCommand` を出す。live 前に実行できるものを `commands`、実通話後に `証跡コピー` を押してから実行するものを `runtimeEvidenceCommands`、実観察値や生成後 path を埋めてから使うものを `templateCommands`、記録後の監査を `finalCommands` に分ける。
- `meeting:next-proof` は live proof 前の approval gate を出す。ローカル prep は安全だが、`会議通訳を始める` は OpenAI Realtime と実 Zoom / Google Meet 音声を使うため、明示承認なしに live run を開始しない。
- 相手音声を会議の microphone send lane へ戻す機能は、この Web app の責務ではない。
- 実 Zoom / Meet 通話で相手に聞こえたか、相手音声が戻っていないかの確認は別 gate とする。

## Data And Contracts

```text
physical microphone
  -> OpenAI Realtime translation session
  -> UI speaker lane: 私

meeting remote audio
  -> BlackHole / Open-Loopback audio input
  -> OpenAI Realtime translation session
  -> UI speaker lane: 相手
```

The app does not store raw audio. Audio and transcript windows are sent to OpenAI only for realtime translation and transcript refinement.

## Non-Goals

- Zoom / Meet の音声設定をブラウザから自動変更する。
- OS の音声デバイスをインストール、削除、再起動する。
- 相手音声、翻訳音声、AI return 音声を会議へ送信する routing engine をこの Web app 内に実装する。
- BlackHole 1 本を send / receive 兼用する構成を推奨する。

## Open Decisions

- Open-Loopback を使った no-echo send lane 連携は別計画で扱う。
- 実 Zoom / Google Meet 10 分 smoke と 30 分 endurance の自動化方法は未決。

## Links

- `README.md`
- `docs/meeting-audio-routing.md`
- `docs/meeting-smoke-checklist.md`
- `scripts/meeting-route-snapshot.mjs`
- `scripts/prepare-meeting-smoke.mjs`
- `scripts/backfill-meeting-smoke-evidence.mjs`
- `scripts/append-meeting-runtime-evidence.mjs`
- `scripts/record-meeting-observation.mjs`
- `scripts/check-meeting-smoke-evidence.mjs`
- `scripts/meeting-proof-status.mjs`
- `scripts/meeting-next-proof-action.mjs`
- `/Users/tachibanashuuta/LocalWork/Code/Open-Loopback/docs/aisdr-mount-integration.md`
