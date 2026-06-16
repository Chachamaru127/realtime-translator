# Meeting Local Verification

作成日: 2026-06-16

このファイルは、実 Zoom / Google Meet smoke の前に完了しているローカル証跡をまとめる。ここでの PASS は device / env / UI / build の readiness を示すだけで、実通話 end-to-end proof ではない。

## Command Gate

実行コマンド:

```bash
pnpm meeting:verify
```

直近結果:

```text
PASS BlackHole 16ch input/output
PASS BlackHole 2ch installed
PASS Physical mic candidate
PASS OPENAI_API_KEY server fallback
PASS Dev server for this worktree
remote audio: BlackHole 16ch
local mic: HyperX SoloCast
lane map: 私=local mic -> self lane; 相手=remote audio/playback -> remote lane
env file: /Users/tachibanashuuta/LocalWork/Code/realtime-translator/.env
dev url: http://localhost:3002
meeting:device-selection-smoke: {"status":"ok","laneContract":"私=physical mic; 相手=loopback playback",...}
meeting:route-snapshot --dry-run: contains app url / translator mic / translator remote / lane map / audio device tables
meeting:prepare-smoke --dry-run: contains paired route snapshot, smoke evidence paths, and prefilled app url / translator mic / translator remote / local preflight
meeting:evidence-check-smoke: {"status":"ok","pendingDetected":true,"scopeOptionValueNotFilePath":true,"weakEvidenceRejected":true,"prefilledSetupRendered":true,...}
meeting:backfill-evidence-smoke: {"status":"ok","dryRunDidNotWrite":true,"backfilledRouteFields":true,"insertedMissingLiveApproval":true,"preservedManualFields":true,...}
meeting:append-runtime-evidence-smoke: {"status":"ok","invalidPatchRejected":true,"weakPatchRejected":true,"sameDeviceRejected":true,"missingFileArgWithOptionValueRejected":true,"escapedPipeRuntimeEvidenceAccepted":true,"appendedRuntimeEvidence":true,"checkerAcceptedAppendedPatch":true}
meeting:record-observation-smoke: {"status":"ok","noOpRejected":true,"failResultRejected":true,"unsafeSetupRejected":true,"unsafeEvidenceRejected":true,"placeholderSetupRejected":true,"placeholderEvidenceRejected":true,"unapprovedSetupRejected":true,"legacyLiveApprovalInserted":true,"missingFileArgWithOptionValueRejected":true,"dryRunDidNotWrite":true,"observationRecorded":true,"checkerAcceptedRecordedEvidence":true}
meeting:proof-status-smoke: {"status":"ok","emptyRejected":true,"zoomOnlyRejected":true,"smokeOnlyRejected":true,"completeAccepted":true}
meeting:next-proof-smoke: {"status":"ok","emptySuggestsZoom":true,"zoomOnlySuggestsMeet":true,"smokeOnlySuggestsEndurance":true,"pendingZoomUsesExistingFile":true,"commandPhasesAreExplicit":true,"runtimeEvidenceCommandsAreAfterLive":true,"textOutputExplainsCommandPhases":true,"textOutputIncludesApprovalGate":true,"enduranceUsesExistingSmokeFile":true,"completeSuggestsDone":true}
meeting:system-env-smoke: {"status":"ok","nextEnvFallbackDetected":true,"nextEnvLocalFallbackDetected":true,"emptyEnvFallbackDetected":true,"secretNotPrinted":true}
meeting:session-env-smoke: {"status":200,"hasClientSecret":true,"emptyEnvFallback":true,"scopedHeaders":true,"error":null}
meeting:secret-scan: {"status":"ok","openAIKeysFound":0}
saved route snapshot: docs/evidence/2026-06-16T03-49-21-route-snapshot.md
saved Zoom prep pair: docs/evidence/2026-06-16T03-53-09-route-snapshot.md + docs/evidence/2026-06-16T03-53-09-zoom-smoke.md
saved Google Meet prep pair: docs/evidence/2026-06-16T04-07-11-route-snapshot.md + docs/evidence/2026-06-16T04-07-11-google-meet-smoke.md
backfilled existing smoke templates: app url / translator mic / translator remote / local preflight / blank live approval row when missing
lint: pass
build: pass
meeting:session-env-smoke: {"status":200,"hasClientSecret":true,"emptyEnvFallback":true,"error":null}
```

## Browser Smoke

対象 URL:

```text
http://localhost:3002
```

直近再確認:

- 2026-06-16 13:58 JST に Playwright MCP で `http://localhost:3002/` を開き、`会議` tab へ切り替えた。
- HTTP response は `200 OK`。
- console は React DevTools / HMR の dev log のみ。
- snapshot 上で `会議` button が active、`会議音声入力` region が表示される。
- snapshot 上で `自分のマイク` は `HyperX SoloCast (0951:170f)`、`相手音声` は `BlackHole 16ch (Virtual)` として選択される。
- snapshot 上で `証跡コピー` / `入力チェック` / `会議通訳を始める` が表示される。

確認済み:

- `会議` tab が表示される。
- `入力を自動選択` が ON。
- `自分のマイク` は `HyperX SoloCast (0951:170f)`。
- `相手音声` は `BlackHole 16ch (Virtual)`。
- `Loopback入力を検出` が表示される。
- `証跡コピー` が clipboard に `translator mic` / `translator remote` / `lane map` / `input check` を含む `Runtime Evidence` Markdown table を出す。
- `入力チェック` は `私` / `相手` の別メーターを表示する。
- `入力チェック停止` 後に meter は停止し、最後のレベルが `checked` snapshot として残る。
- 会議モードに `経過` / `私` / `相手` のセッション状態が表示される。
- 390px 幅でも `候補更新` / `証跡コピー` / `入力チェック` / `会議通訳を始める` が表示領域内に収まる。

## Clipboard Evidence Shape

`証跡コピー` は次の形で、smoke evidence file の末尾に貼れる `Runtime Evidence` table を出す:

```text
## Runtime Evidence

| Field | Value |
| --- | --- |
| app url | http://localhost:3002/ |
| browser | <user agent> |
| translator mic | HyperX SoloCast (0951:170f) |
| translator remote | BlackHole 16ch (Virtual) |
| lane map | 私=translator mic; 相手=translator remote/playback |
| input check | checked; 私 <percent>%; 相手 <percent>% |
| session duration | <m:ss> |
| lane segments | 私 <count>; 相手 <count> |

## Runtime Notes

- auto input: on
- active lanes: <lanes>
- remote only:
- mic only:
- alternating:
- no echo:
- duration:
- notes:
```

実通話後は clipboard から直接追記できる:

```bash
pnpm meeting:append-runtime-evidence docs/evidence/<timestamp>-zoom-smoke.md --clipboard
```

このコマンドは `Runtime Evidence` heading と required fields がない clipboard を拒否する。さらに `input check` が `idle` / `starting` / `error` / 0%、`session duration` が10分未満、`lane segments` が片 lane 0 件の clipboard も live proof 用 runtime evidence として拒否する。

## Route Snapshot Shape

`pnpm meeting:route-snapshot` は `docs/evidence/<timestamp>-route-snapshot.md` を生成する。`--dry-run` では書き込まず内容だけ確認できる。
`pnpm meeting:prepare-smoke -- zoom|meet` は同じ timestamp の route snapshot と smoke evidence template をペア生成し、smoke evidence 側の `app url` / `translator mic` / `translator remote` / `lane map` / `route snapshot` / `local preflight` を prefill する。
既存 template が古い場合は `pnpm meeting:backfill-evidence --all` で、空欄の local route fields だけを route snapshot から補完する。`live approval` 行がない古い template には空欄行だけを追加する。browser / speaker route / meeting mic / input check / duration / lane segments / case results は実観察欄なので上書きしない。

記録するもの:

- app URL
- `translator mic`
- `translator remote`
- lane map
- env fallback path and key presence only
- selected BlackHole / Open-Loopback / ZoomAudioDevice candidates
- audio input / output device tables
- remaining live proof list
- paired smoke evidence path when generated by `meeting:prepare-smoke`

記録しないもの:

- `OPENAI_API_KEY` の値
- 実 Zoom / Meet の合否
- raw audio

## Evidence Check

実通話後に smoke evidence を埋めたら、次で空欄 / `pending` / live approval 欠落 / route snapshot 欠落 / `local preflight` WARN / device `not found` / 10分未満 / 30分未満 / `私` または `相手` の片lane欠落を検査する:

```bash
pnpm meeting:check-evidence docs/evidence/<timestamp>-zoom-smoke.md
pnpm meeting:check-evidence docs/evidence/<timestamp>-google-meet-smoke.md
pnpm meeting:check-evidence docs/evidence/<timestamp>-zoom-smoke.md --scope=endurance
pnpm meeting:record-observation docs/evidence/<timestamp>-zoom-smoke.md --live-approval="approved by operator at 2026-06-16T15:00:00+09:00" --speaker-route="BlackHole 16ch + headphones" --meeting-mic="HyperX SoloCast" --case="Remote only|pass|相手 lane 2 segments"
pnpm meeting:next-proof --text
pnpm meeting:proof-status
```

生成直後の template は `pending` と空欄があるため、この検査は失敗するのが正しい。case result が `fail` の場合や `<...>` placeholder のままの場合も final proof にはならない。古い template に `live approval` 行がない場合、`meeting:record-observation --live-approval=...` は行を追加してから値を書けるが、値は `approved by <operator> at <time>` 形式でなければ通らない。`meeting:proof-status` も Zoom / Meet / 30分 endurance が揃うまでは失敗するのが正しい。`meeting:next-proof` はその不足から次に実行する live smoke / endurance 手順を既定 JSON で出し、`--text` では approval gate と実通話中に読める順序付き runbook を出す。ローカル prep は安全だが `会議通訳を始める` は paid OpenAI Realtime と外部 Zoom / Meet 音声を使う live run として扱う。準備済み template があれば `existingEvidenceFile`、取り直し用に `freshPrepareCommand` を併記する。`commands` は live 前に実行できるもの、`runtimeEvidenceCommands` は実通話後に `証跡コピー` してから使うもの、`templateCommands` は実観察値 / 生成後 path に置き換えてから使うもの、`finalCommands` は記録後の check / proof-status として分ける。

## Still Required

- Zoom 10 minute smoke:
  - `pnpm meeting:prepare-smoke -- zoom` で route snapshot と smoke template を作る
  - remote only -> `相手`
  - mic only -> `私`
  - alternating -> lane が入れ替わらない
  - no echo -> 相手音声が Zoom microphone send に戻らない
  - 10 min -> device lost / reconnect loop なし
  - `pnpm meeting:check-evidence <zoom-smoke.md>` が PASS
- Google Meet 10 minute smoke:
  - `pnpm meeting:prepare-smoke -- meet` で route snapshot と smoke template を作る
  - remote only -> `相手`
  - mic only -> `私`
  - alternating -> lane が入れ替わらない
  - no echo -> 相手音声が Meet microphone send に戻らない
  - 10 min -> device lost / reconnect loop なし
  - `pnpm meeting:check-evidence <google-meet-smoke.md>` が PASS
- 30 minute endurance:
  - 字幕継続
  - device lost / reconnect loop / browser permission loss なし
  - lane 入れ替わりなし
  - `pnpm meeting:check-evidence <smoke.md> --scope=endurance` が PASS
  - `pnpm meeting:proof-status` が PASS
