# Realtime Translate 🌐

スマホネイティブUIの**リアルタイム多言語音声翻訳**Webアプリ。話した言葉をその場で別の言語の**音声＋字幕**に翻訳します。

OpenAI の専用モデル [`gpt-realtime-translate`](https://developers.openai.com/api/docs/models/gpt-realtime-translate) を、ブラウザから **WebRTC** で直接利用します（入力音声は70以上の言語を自動検出）。

## 特長

- **リアルタイム字幕がメイン** — 話した内容をその場で文字に起こして翻訳表示。**音声出力はワンタップでON/OFF**（既定はOFF）。
- **会話モード（自動双方向 / LINE風チャット）** — 「会話を始める」を押したら、あとは日本語でも英語でもそのまま話すだけ。話した言語を自動判定して相手の言語へ翻訳し、**原文（上）＋訳文（下）を一文ごとに対応づけた吹き出し**を、話者の言語で左右に振り分けて表示します（ボタンの押し分け不要・マイク許可は1回だけ）。
- **会議モード（Zoom / Google Meet）** — 自分のマイクと、BlackHole / Open-Loopback などの仮想入力へ流した相手音声を自動選択して別々に拾い、物理マイクは `私`、再生音声は `相手` として双方向翻訳します。
- **ライブモード** — 講演・動画・会議など、聞こえてくる音声をひとつの言語へ連続翻訳（テロップ表示）。
- **低遅延 / S2S** — STT→翻訳→TTSの分割ではなく、音声をそのまま翻訳。音声出力ON時は声のトーンも引き継がれます。
- **スマホ最適化** — iOS/Android のモバイルWebで動作（マイクはタップ操作の直後に取得）。セーフエリア対応・大きなタップ領域・PWA対応。
- **APIキーは漏れない** — サーバ側で短命の ephemeral client secret を発行し、ブラウザには標準APIキーを渡しません。

## 仕組み

```
ブラウザ ──POST /api/session──▶ Next.js Route Handler ──▶ OpenAI
  │                              (OPENAI_API_KEY で client_secret 発行)
  │◀── ephemeral client secret ──┘
  │
  └─ WebRTC (SDP) ──▶ https://api.openai.com/v1/realtime/translations/calls
        マイク音声を送信 ／ 翻訳音声トラック＋字幕デルタを受信
```

- トークン発行: `POST /v1/realtime/translations/client_secrets`（モデル `gpt-realtime-translate`）
- 接続: `POST /v1/realtime/translations/calls`（`oai-events` データチャネル）
- 出力言語の切替: `session.update` の `audio.output.language`
- 受信イベント: `session.input_transcript.delta`（原文）/ `session.output_transcript.delta`（訳文）

## セットアップ

```bash
pnpm install
cp .env.example .env.local   # OPENAI_API_KEY を設定
pnpm dev
```

[http://localhost:3000](http://localhost:3000) を開く（マイク利用のため `localhost` または HTTPS が必要）。

## Zoom / Google Meet で使う

ブラウザだけでは Zoom デスクトップアプリや Meet タブの相手音声を自動で直接取得できません。会議モードでは、OS 側で相手音声を BlackHole / Open-Loopback に流し、このアプリが `自分のマイク` と `相手音声` の最適候補を自動選択します。翻訳表示では、物理マイク由来を `私`、loopback 由来を `相手` として固定します。

最小構成:

1. Zoom / Meet のスピーカー出力を `BlackHole 16ch` または `BlackHole 2ch` にする。
2. 自分も相手の声を聞くため、`pnpm meeting:monitor:start` で Open-Loopback monitor bridge を起動する。これは `BlackHole 16ch -> MacBook Proのスピーカー` のように、人間用の monitor へ音を返す。
3. このアプリで `会議` モードを開き、`入力を自動選択` を ON のままにする。
4. `入力チェック` で `私` と `相手` の入力レベルを確認する（OpenAI には接続しません）。
5. `pnpm meeting:prepare-smoke -- zoom` または `-- meet` で local route を prefill した証跡を作る。
6. OpenAI Realtime と外部 Zoom / Meet 音声を使う live run として明示承認してから、`会議通訳を始める` を押し、相手だけ / 自分だけ / 同時発話の 3 ケースで字幕が出ることを確認する。
7. 10分 smoke / 30分 endurance の実行後、直前の `入力チェック` snapshot が `私` / `相手` とも 0% でない状態で `証跡コピー` を押し、`pnpm meeting:append-runtime-evidence docs/evidence/<timestamp>-zoom-smoke.md --clipboard` で `Runtime Evidence` table を evidence file 末尾に追記する。

YouTube / Chrome 音声でテストする場合も同じで、Chrome の再生先が通常スピーカーのままだと `相手` lane は無音です。macOS の出力、または Chrome / 会議アプリ側の speaker を BlackHole に向け、`pnpm meeting:monitor:start` で Open-Loopback から実スピーカー/ヘッドホンへ返してください。Multi-Output Device でも代替できますが、この repo では Open-Loopback monitor bridge を優先します。

Open-Loopback を使う場合は `/Users/tachibanashuuta/LocalWork/Code/Open-Loopback` の `Meeting Mix` / monitor ルートを使い、会議アプリ音 + 自分のマイクを安定して扱える仮想入力として渡します。詳細は [`docs/meeting-audio-routing.md`](./docs/meeting-audio-routing.md)、ローカル証跡は [`docs/meeting-local-verification.md`](./docs/meeting-local-verification.md)、実通話の確認手順は [`docs/meeting-smoke-checklist.md`](./docs/meeting-smoke-checklist.md) を参照。

ローカル preflight:

```bash
pnpm meeting:preflight
pnpm meeting:device-selection-smoke
pnpm meeting:verify
pnpm meeting:route-snapshot
pnpm meeting:prepare-smoke -- zoom
pnpm meeting:backfill-evidence --all
pnpm meeting:append-runtime-evidence docs/evidence/<timestamp>-zoom-smoke.md --clipboard
pnpm meeting:record-observation docs/evidence/<timestamp>-zoom-smoke.md --live-approval="approved by operator at 2026-06-16T15:00:00+09:00" --speaker-route="BlackHole 16ch + headphones" --meeting-mic="HyperX SoloCast" --case="Remote only|pass|相手 lane 2 segments"
pnpm meeting:check-evidence docs/evidence/<timestamp>-zoom-smoke.md
pnpm meeting:next-proof --text
pnpm meeting:proof-status
pnpm meeting:new-evidence -- zoom
pnpm meeting:new-evidence -- meet
pnpm meeting:monitor:start
pnpm meeting:monitor:status
pnpm meeting:monitor:stop
```

`meeting:next-proof` は既定で機械処理しやすい JSON を出します。実通話中に読む場合は `--text` を付けると、approval gate / live 前コマンド / `証跡コピー` 後コマンド / 観察記録 / 記録後監査の順に表示されます。`commands` は live 前に実行できる placeholder なしのものです。clipboard を読む command は `runtimeEvidenceCommands` に入り、実通話後にアプリ内 `証跡コピー` を押してから実行します。`templateCommands` は `<...>` や `<timestamp>` を実観察値 / 生成後 path に置き換えてから実行し、その後 `finalCommands` で check / proof-status を走らせます。

### 環境変数

| 変数 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | サーバ側のみ。Realtime translation の client secret 発行に使用。 |
| `OPENAI_PROJECT` | 任意。複数 project / legacy key で課金先 project を明示したい時に使用。 |
| `OPENAI_ORGANIZATION` | 任意。複数 organization を使う時に使用。 |

`429` で `quota` / `billing` と出る場合、API key は読めていますが OpenAI 側の利用枠か請求設定で止まっています。課金が有効な project の key に切り替えるか、必要なら `OPENAI_PROJECT=proj_...` を `.env` に追加して dev server を再起動してください。

## Vercel へのデプロイ

このリポジトリを Vercel に接続し、Environment Variables に `OPENAI_API_KEY` を追加するだけです（ビルド設定はNext.js標準）。複数 project を使う場合は `OPENAI_PROJECT` も追加してください。

```bash
vercel --prod
```

## 技術スタック

Next.js 16 (App Router) / React 19 / TypeScript / WebRTC / OpenAI `gpt-realtime-translate`。UIは依存ライブラリなしの自作CSS。

## メモ

- 入力言語は自動検出されるため、話す言語を選ぶ必要はありません（選ぶのは「翻訳先」だけ）。
- 出力対応言語はアプリ内の13言語。`lib/languages.ts` で増減できます。
- 課金は音声時間に対して発生します（モデル料金は OpenAI の料金表を参照）。
