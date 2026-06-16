# Meeting Audio Routing

作成日: 2026-06-16

## 結論

通常は `会議` モードで自動選択を ON のまま開始する。アプリは BlackHole / Open-Loopback の loopback 入力を相手音声、自分の物理入力をマイクとして選び、別々の Realtime session へ送る。UI では物理マイク由来を `私`、loopback 由来を `相手` として表示する。

## 自動選択ルール

相手音声:

1. `BlackHole 16ch`
2. `BlackHole 2ch`
3. `Open-Loopback`
4. その他 `loopback` / `audio router` 系入力

自分のマイク:

1. 専用 USB マイク（例: HyperX / SoloCast / Yeti / Shure / RODE 系）
2. その他 loopback / virtual 系ではない音声入力
3. 見つからない場合は手動選択へ fallback

会議モードでは、loopback lane の相手音声を壊さないため echo cancellation / noise suppression / auto gain control を無効化する。物理マイク lane は通常のマイクとして取得し、表示上は常に `私` として扱う。

証跡上の lane map は `私=translator mic`、`相手=translator remote/playback` で固定する。`translator mic` が物理マイク候補、`translator remote` が BlackHole / Open-Loopback の再生音声候補であることを `pnpm meeting:preflight` と `証跡コピー` の両方で残す。

実通話直前に `pnpm meeting:route-snapshot` を実行すると、同じ local route 状態を `docs/evidence/` の Markdown に保存できる。これは「どの入力を使う状態だったか」の証跡であり、実 Zoom / Meet 通話が成功した証明ではない。

Zoom / Meet smoke の準備では `pnpm meeting:prepare-smoke -- zoom|meet` を使う。route snapshot と smoke evidence template が同じ timestamp で生成され、smoke evidence 側に app URL / translator mic / translator remote / snapshot path / local preflight が入る。既存 template が古い場合は `pnpm meeting:backfill-evidence --all` で空欄の local route fields だけを補完できる。`live approval` 行がない古い template は空欄行だけ追加され、承認値は実通話後の `meeting:record-observation` で入れる。
実通話後は `pnpm meeting:check-evidence <docs/evidence/*-smoke.md>` を実行し、空欄 / `pending` / live approval 欠落 / snapshot 欠落 / local preflight WARN / device not found / duration 不足 / 片lane欠落が残っていないことを確認する。
Zoom / Meet / 30分 endurance が揃ったかは `pnpm meeting:proof-status` で監査する。

## BlackHole 最小構成

1. Zoom / Google Meet のスピーカー出力を `BlackHole 16ch` にする。
2. 自分も相手音声を聞く場合は、macOS の Multi-Output Device で `BlackHole 16ch` とヘッドホン/スピーカーを同時出力にする。
3. このアプリで `会議` を選ぶ。
4. `入力を自動選択` を ON のまま `会議通訳を始める` を押す。
5. 開始前に `入力チェック` を押すと、OpenAI に接続せず `私` と `相手` の入力レベルだけ確認できる。会議通訳開始時には meter を止め、最後のレベルを `checked` snapshot として保持する。
6. `会議通訳を始める` を押して、10分 smoke または30分 endurance を実行する。
7. 実行中または実行後に `証跡コピー` を押すと、現在の app URL / browser / `自分のマイク` / `相手音声` / 入力チェック snapshot / duration / lane counts を `Runtime Evidence` table として secret なしで記録できる。`pnpm meeting:append-runtime-evidence <smoke.md> --clipboard` で evidence file 末尾へ追記する。
8. 字幕が出ない場合だけ、`候補更新` を押して手動選択へ切り替える。

YouTube / Chrome で quick test する場合も、Chrome の再生音が BlackHole に流れている必要がある。macOS の default output が `MacBook Proのスピーカー` のままだと、アプリ側の `相手音声=BlackHole 16ch` は無音になる。`入力チェック` で `相手` メーターが 0% の時は、Chrome / Zoom / Meet の speaker route を BlackHole または BlackHole を含む Multi-Output Device に直す。

## Open-Loopback を使う場合

`/Users/tachibanashuuta/LocalWork/Code/Open-Loopback` は、BlackHole だけでは monitor や no-echo lane が扱いづらい場合の補助 route として使う。

使う判断:

- BlackHole に出すと自分が相手音声を聞けない。
- Zoom / Meet の send lane と receive lane を分けたい。
- 相手音声を会議へ戻さない no-echo proof が必要。

境界:

- この Web app は翻訳入力を作るだけで、Zoom / Meet の microphone send lane は制御しない。
- 相手音声を meeting microphone send へ戻す構成は採用しない。
- Open-Loopback 側の synthetic counter は lane 契約の proof であり、実 Zoom / Meet 通話 proof ではない。

## Verification Gates

| Gate | 合格条件 |
|------|----------|
| Browser UI | `会議` タブが表示され、自動選択 ON で開始できる |
| Device Selection | 相手音声が BlackHole / Open-Loopback、マイクが物理入力になる |
| Local Input Check | OpenAI に接続せず、`私` と `相手` の入力レベルが別々に表示される |
| Evidence Copy | `証跡コピー` が live smoke evidence の末尾へ貼れる `Runtime Evidence` table を出す |
| Append Runtime Evidence | `pnpm meeting:append-runtime-evidence <smoke.md> --clipboard` が clipboard の `Runtime Evidence` table を追記する |
| Record Observation | `pnpm meeting:record-observation <smoke.md>` が live approval / speaker route / meeting mic / case pass evidence を記録し、古い template には `live approval` 行を追加する |
| Route Snapshot | `pnpm meeting:route-snapshot` が実通話直前の local route 状態を `docs/evidence/` に保存する |
| Prepare Smoke | `pnpm meeting:prepare-smoke -- zoom|meet` が route snapshot と prefilled smoke template をペアで生成する |
| Backfill Evidence | `pnpm meeting:backfill-evidence --all` が既存 smoke template の空欄 local route fields と欠けた `live approval` 空欄行だけを補完する |
| Evidence Check | `pnpm meeting:check-evidence <file>` が実通話後の smoke evidence completeness を検査する |
| Proof Status | `pnpm meeting:proof-status` が Zoom / Meet / endurance の全体完了を監査する |
| Next Proof | `pnpm meeting:next-proof` が次に必要な live smoke / endurance 手順を JSON / `--text` runbook で出し、live 前の `commands` / `証跡コピー` 後の `runtimeEvidenceCommands` / `templateCommands` / `finalCommands` の順序を分ける |
| Lane Mapping | 物理マイク由来が `私`、loopback 由来が `相手` として表示される |
| Remote Only | 相手だけが話して `相手` 側に字幕が出る |
| Mic Only | 自分だけが話して `私` 側に字幕が出る |
| Mixed | 相手と自分が交互に話して入力元どおり左右の会話履歴に残る |
| No Echo | 相手音声が Zoom / Meet の microphone send lane に戻らない |
| Endurance | 30 分で device lost / reconnect loop が起きない |

## Known Limits

- ブラウザは Zoom デスクトップアプリの相手音声を直接自動取得できない。
- Google Meet をブラウザで開いていても、このアプリが別タブの音声を無断で取得することはしない。
- 同一 script の言語ペアは、話者ではなく言語判定に依存するため左右振り分けが弱い場合がある。
