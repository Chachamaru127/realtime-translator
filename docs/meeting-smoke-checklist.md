# Meeting Smoke Checklist

作成日: 2026-06-16

## Local Preflight

この段階は OpenAI / Zoom / Google Meet の end-to-end proof ではない。ローカルの device / env / UI が実通話 smoke へ進める状態かだけを見る。

```bash
pnpm meeting:verify
```

`meeting:verify` は次をまとめて実行する:

```bash
pnpm meeting:preflight
pnpm meeting:device-selection-smoke
pnpm meeting:evidence-check-smoke
pnpm meeting:backfill-evidence-smoke
pnpm meeting:append-runtime-evidence-smoke
pnpm meeting:record-observation-smoke
pnpm meeting:proof-status-smoke
pnpm meeting:next-proof-smoke
pnpm meeting:system-env-smoke
pnpm meeting:secret-scan
pnpm lint
pnpm build
pnpm meeting:session-env-smoke
```

合格条件:

- `BlackHole 16ch input/output` が `PASS`
- `Physical mic candidate` が `PASS`
- `meeting:device-selection-smoke` が `{"status":"ok",...}` を返し、fixture 上でも自動選択の優先順位が固定されている
- `meeting:preflight` と `meeting:device-selection-smoke` が `私=physical mic` / `相手=loopback playback` の lane contract を出す
- `meeting:evidence-check-smoke` が pending 検出、WARN preflight / device not found / 10分未満 / 片lane証跡の拒否、completed evidence 受理の fixture を通す
- `meeting:evidence-check-smoke` が `--scope endurance` を smoke evidence path と誤認しない file 引数 parsing を通す
- `meeting:backfill-evidence-smoke` が既存 smoke evidence の空欄 local route fields だけを補完し、古い template には空欄の `live approval` 行だけを追加し、手入力済み観察欄を保持する fixture を通す
- `meeting:append-runtime-evidence-smoke` が `Runtime Evidence` table 以外を reject し、正常 table 追記後に checker が受理する fixture を通す
- `meeting:append-runtime-evidence-smoke` が unavailable/same device、lane map 不一致、`--input runtime.md` を smoke evidence path と誤認するケースを reject し、escaped pipe `\|` 入り Runtime Evidence を受理する
- `meeting:record-observation-smoke` が `fail` case を reject し、古い template の `live approval` 欄を挿入でき、観察結果記録後に checker が受理する fixture を通す
- `meeting:proof-status-smoke` が Zoom 10分 / Google Meet 10分 / 30分 endurance の不足を reject し、3条件が揃った fixture だけを accept する
- `meeting:next-proof-smoke` が Zoom不足 -> Meet不足 -> 30分不足 -> 完了の next action を順に出し、live 前の `commands` / `証跡コピー` 後の `runtimeEvidenceCommands` / `templateCommands` / `finalCommands` の command phase を分ける
- `meeting:next-proof-smoke` が live run 前の paid/external approval gate を JSON / text output に出す
- `meeting:system-env-smoke` が preflight と Next route の `.env` / `.env.local` fallback 判定を同じ `lib/serverEnvConfig.mjs` 経由で検証する
- `meeting:secret-scan` が source / evidence に OpenAI API-key-shaped 値がないことを検証する
- `OPENAI_API_KEY server fallback` が `PASS`
- `meeting:session-env-smoke` が `OPENAI_API_KEY=""` の空文字環境でも canonical `.env` fallback から client secret を返すことを mock fetch で確認する
- `Dev server for this worktree` が `PASS`
- `meeting:session-env-smoke` が `{"status":200,"hasClientSecret":true,"error":null}` を返す
- `会議` mode の `入力チェック` で `私` と `相手` が別 lane として表示される
- `入力チェック停止` 後に mic indicator / browser capture が止まり、最後の非ゼロ snapshot が `checked` として残る
- `証跡コピー` で `translator mic` / `translator remote` / `input check` を含む `Runtime Evidence` Markdown table をコピーできる
- 会議モードに `経過` / `私` / `相手` のセッション状態が表示される

実通話直前に保存する route 証跡:

```bash
pnpm meeting:route-snapshot
pnpm meeting:prepare-smoke -- zoom
pnpm meeting:prepare-smoke -- meet
pnpm meeting:backfill-evidence --all
```

`meeting:route-snapshot` は `docs/evidence/` に app URL / selected devices / lane map / env fallback / audio device list を保存する。`meeting:prepare-smoke` は同じ route snapshot と live smoke evidence template を同一 timestamp でペア生成し、template 側に app URL / translator mic / translator remote / route snapshot / local preflight を埋める。既存 template が古い場合は `meeting:backfill-evidence --all` で、空欄の local route fields だけを route snapshot から補完できる。`live approval` 行がない古い template には空欄行だけを追加する。`speaker route` / `meeting mic` / browser / input check / duration / lane segments / case result は実 Zoom / Meet の観察で埋める。これらは local route 証跡であり、Zoom / Meet end-to-end proof ではない。

## Zoom 10 Minute Smoke

前提:

- Evidence files: `pnpm meeting:prepare-smoke -- zoom`
- Approval gate: OpenAI Realtime と外部 Zoom live run の明示承認がある
- Zoom speaker: `BlackHole 16ch` または BlackHole を含む Multi-Output Device
- Zoom microphone: physical mic
- Realtime Translate: `pnpm meeting:preflight` が出した URL の `会議` mode
- `入力を自動選択`: ON
- `入力チェック`: `私` と `相手` の両方が発話/再生時に反応し、開始時に `checked` snapshot として残る
- `証跡コピー`: 10分 smoke 中または停止直後に app URL / browser / translator mic / translator remote / lane map / input check snapshot / session duration / lane segments を `Runtime Evidence` table として evidence file の末尾に貼る
- `session duration`: 10 分以上
- `lane segments`: `私` と `相手` がどちらも 1 件以上

記録すること:

| Case | 合格条件 | Result |
|------|----------|--------|
| Remote only | 相手だけが話し、`相手` 側に字幕が出る | pending |
| Mic only | 自分だけが話し、`私` 側に字幕が出る | pending |
| Alternating | 相手と自分が交互に話し、入力元どおり左右に残る | pending |
| No echo | 相手音声が Zoom microphone send に戻らない | pending |
| 10 min | 10 分で device lost / reconnect loop が起きない | pending |

記入後:

```bash
pnpm meeting:check-evidence docs/evidence/<timestamp>-zoom-smoke.md
```

## Google Meet 10 Minute Smoke

前提:

- Evidence files: `pnpm meeting:prepare-smoke -- meet`
- Approval gate: OpenAI Realtime と外部 Google Meet live run の明示承認がある
- Google Meet speaker: `BlackHole 16ch` または BlackHole を含む Multi-Output Device
- Google Meet microphone: physical mic
- Realtime Translate: `pnpm meeting:preflight` が出した URL の `会議` mode
- `入力を自動選択`: ON
- `入力チェック`: `私` と `相手` の両方が発話/再生時に反応し、開始時に `checked` snapshot として残る
- `証跡コピー`: 10分 smoke 中または停止直後に app URL / browser / translator mic / translator remote / lane map / input check snapshot / session duration / lane segments を `Runtime Evidence` table として evidence file の末尾に貼る
- `session duration`: 10 分以上
- `lane segments`: `私` と `相手` がどちらも 1 件以上

記録すること:

| Case | 合格条件 | Result |
|------|----------|--------|
| Remote only | 相手だけが話し、`相手` 側に字幕が出る | pending |
| Mic only | 自分だけが話し、`私` 側に字幕が出る | pending |
| Alternating | 相手と自分が交互に話し、入力元どおり左右に残る | pending |
| No echo | 相手音声が Meet microphone send に戻らない | pending |
| 10 min | 10 分で device lost / reconnect loop が起きない | pending |

記入後:

```bash
pnpm meeting:check-evidence docs/evidence/<timestamp>-google-meet-smoke.md
```

## 30 Minute Endurance

合格条件:

- Zoom または Google Meet のどちらかで 30 分継続
- 字幕が継続して出る
- `私` / `相手` の lane が入れ替わらない
- `session duration` が 30 分以上
- `lane segments` に `私` と `相手` がどちらも 1 件以上ある
- device lost / reconnect loop / browser permission loss が起きない
- 相手音声が会議の microphone send に戻らない
- 記入後に `pnpm meeting:check-evidence <file> --scope=endurance` が PASS する
- 最終的に `pnpm meeting:proof-status` が PASS する

## Evidence Template

`meeting:prepare-smoke` は CLI で分かる route 情報を先に埋める。アプリ内の `証跡コピー` は browser / input check snapshot / session duration / lane segments を含む `Runtime Evidence` table をコピーする。10分 smoke または30分 endurance の実行中または停止直後に次で evidence file の末尾へ追記する:

```bash
pnpm meeting:append-runtime-evidence docs/evidence/<timestamp>-zoom-smoke.md --clipboard
```

手で貼ってもよいが、コマンドを使うと `Runtime Evidence` table でない clipboard や、`idle` / `starting` / `error` / 0% / 10分未満 / 片 lane 0 件の runtime table を拒否できる。`meeting:check-evidence` は後勝ちの table row として読む。

実観察欄は `meeting:record-observation` で記録する。古い template に `live approval` 行がない場合は、CLI が行を追加してから値を書き込む。`live approval` は `approved by <operator> at <time>` 形式の実承認メモだけ final proof として通る。`result` は `pass` のみ final proof として通る。更新項目なしの no-op は reject される。Markdown table を壊さないため、値に `|` や改行を含めると reject される。`<相手 lane evidence>` のような placeholder のままでも reject される:

```bash
pnpm meeting:record-observation docs/evidence/<timestamp>-zoom-smoke.md \
  --live-approval="approved by operator at 2026-06-16T15:00:00+09:00" \
  --speaker-route="BlackHole 16ch + headphones" \
  --meeting-mic="HyperX SoloCast" \
  --case="Remote only|pass|相手 lane 2 segments" \
  --case="Mic only|pass|私 lane 2 segments" \
  --case="Alternating|pass|lane order preserved" \
  --case="No echo|pass|remote confirmed no echo" \
  --case="10 min|pass|10:03 continuous"
```

次に埋めるべき live proof は `meeting:next-proof` で確認する:

```bash
pnpm meeting:next-proof --text
```

既定の `meeting:next-proof` は JSON を出す。実通話中に読む場合は `--text` を付ける。JSON / text には approval gate が含まれ、ローカル prep は安全だが `会議通訳を始める` は paid OpenAI Realtime と外部 Zoom / Meet 音声を使う live run として扱う。`existingEvidenceFile` が出た場合はその file を追記先に使える。実通話直前に route を取り直したい場合は `freshPrepareCommand` を実行し、出力された新しい smoke evidence path を追記先にする。

`commands` は live 前に実行できる placeholder なしのコマンドだけを含む。clipboard を読む command は `runtimeEvidenceCommands` に入り、実通話後にアプリ内 `証跡コピー` を押してから実行する。`templateCommands` は `<...>` や `<timestamp>` を実観察値 / 生成後 path に置き換えてから実行する。`finalCommands` は observation 記録後に実行する check / proof-status。

```text
## Runtime Evidence

| Field | Value |
| --- | --- |
| app url | http://localhost:3002/ |
| browser | <user agent> |
| translator mic | <selected mic> |
| translator remote | <selected loopback> |
| lane map | 私=translator mic; 相手=translator remote/playback |
| input check | checked; 私 <percent>%; 相手 <percent>% |
| session duration | <m:ss> |
| lane segments | 私 <count>; 相手 <count> |

## Runtime Notes

- auto input: on
- active lanes: 私, 相手
- remote only:
- mic only:
- alternating:
- no echo:
- duration:
- notes:
```
