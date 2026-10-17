# シミュレーション・チャンネルサーバー 設計・計画

## 状態

- 2026-10-17 設計。§13 の「地図の公開(AI 向け)」を先行実装した。§11 の N0–N5 は未実装。
- 前提: [simulation-core-separation.md](simulation-core-separation.md) の S0–S6 完了(Node で全拡張が動き、ブラウザ・Node のハッシュがビット単位で一致し、保存・再読み込みをはさんだ継続も一致する)。本書は同書 §11 の「範囲外」の応用のうち、API サーバを扱う。
- 既存の [map-server.md](map-server.md)(`npm run map:server`、.fmg 1 つを共有、編集者 1 人)を置き換えるのではなく、その上位互換として作る。

## 1. 目的

- Node.js のプロセスが FMG の世界を複数(チャンネル `world-1`, `world-2`, …)保持し、時間進行をサーバー側で実行する。
- 各チャンネルは専用のフォルダにデータを永続化する。
- ブラウザは起動時・Load ダイアログで「ローカル(現行)」と「サーバーのチャンネル」を選べる。チャンネルに接続すると、Advance Time・コマンドはサーバーで実行され、結果がブラウザに届く。
- 複数のブラウザが同じチャンネルに接続し、同じ世界を見て操作できる。

### 非目的

- ローカルモードの廃止・変更。サーバーが無ければ現行どおり動く(`mapServer.ts` と同じく fail soft)。
- 地図**生成**のサーバー実行(生成は分離計画の非目的のまま。生成はブラウザで行い、できた .fmg をチャンネルに登録する)。
- 描画のサーバー実行。描画は常にブラウザ。
- リアルタイム共同編集(同じ都市を 2 人が同時に書き換える等の細粒度マージ)。§7 の排他で扱う。

## 2. 基本方針: サーバーが正、ブラウザは複製

ブラウザの描画・ダイアログは `window.fmg` / `worldContext` の型付き配列とオブジェクトを**直接**読む(レンダラ 46 モジュール以上)。これを RPC 越しの読み取りに書き換えるのは現実的でなく、性能も出ない。そこで:

- **サーバーのチャンネル = 正本**。ワールドを書き換えるのはサーバーの `SimulationHost` だけ。
- **ブラウザ = 読み取り用の複製**。今と同じく手元の `worldContext` に世界を持ち、描画・UI はそれを読む。描画側のコードは変えない。
- ブラウザの「書き込み」(Advance Time・拡張コマンド・編集)は、ローカルで実行せずサーバーへ送る。サーバーが実行して新しい版(revision)を作り、全接続者に届ける。

これが成り立つのは、分離計画で次が保証済みだから:

| 保証 | 出典 | ここでの意味 |
| --- | --- | --- |
| Node とブラウザで同じ結果 | §20・§21 | サーバーで進めた結果は、ブラウザで進めた場合と同じ |
| 保存→読み込みで継続が一致 | §23 | サーバーが送る .fmg をブラウザで読み込んでも状態が欠けない(複製が正本と同値) |
| 読み込み時の修復は版数で 1 回だけ | §23.1 | 複製を何度読み込み直してもワールドが変わらない |
| `SimulationHost` が唯一の入口 | §5・§19 | ブラウザ側は Host を差し替えるだけで経路を切り替えられる |

## 3. 構成

```
 browser A ─┐   HTTP + SSE              ┌─ channel process: world-1 ─ SimulationHost(Node Adapter)
 browser B ─┼──────────► channel server ┼─ channel process: world-2 ─ SimulationHost
 browser C ─┘   (scripts/simServer.mts) └─ ...
                         │
                         └─ data/channels/<id>/  (§5 ストレージ)
```

- **チャンネルごとに 1 子プロセス**(`child_process.fork` か `worker_threads`)。コアにはモジュールレベルの状態が残っており(§19.5: 103 ファイル・238 個)、1 プロセスに Host は 1 つが前提。`map:server` もプロセスごと入れ替える方式を取っている。
  - 子プロセスは `createNodeSimulationHost` + `loadWorld` / `advanceWorld`(`src/simulation/adapters/node.ts`)を使う。`map:server` の jsdom + Vite module runner は使わない(DOM 不要になったため)。Burg Site Descriptor など UI 寄りの API が必要なら、既存の `mapServerWorker.mjs` を別に併用する。
  - 使われていないチャンネルは子プロセスを止め(アイドル N 分)、次の接続で最新スナップショットから起こす。
- 親プロセス(チャンネルサーバー)は HTTP・認証・SSE・操作の直列化キューだけを持ち、ワールドには触れない。
- 依存の追加は避ける(`map:server` と同じく `node:http` で足りる)。WebSocket は不要: 下り(サーバー→ブラウザ)は SSE、上りは通常の POST で十分。
  - 理由: 通信の大半は .fmg 本体(GET、ETag でキャッシュ可)で、通知は版ごとの小さなイベントだけ。SSE の `Last-Event-ID` を revision にすれば、再接続時の取りこぼしの回復がそのまま書ける。Node には WebSocket のサーバー実装が標準で無い(`ws` の追加か自前のハンドシェイクが要る)。
  - 注意: `EventSource` はヘッダを付けられないので、SSE の認証は Cookie か `fetch` のストリーム読みで行う(URL のクエリにトークンを載せない)。
  - WebSocket に切り替える条件: 他の接続者のカーソル・選択の表示、高頻度の小さな op、ロックステップ(§6.3)、バイナリ差分の双方向送信が必要になった時。クライアント側は送受信を `ChannelTransport` インターフェイスの裏に置き、差し替えられるようにする。

## 4. 操作(ops)と版

チャンネルの状態を変えるものはすべて **op** として 1 本のキューで直列に実行し、成功するごとに `revision` を 1 つ進める。

| op | 内容 | 主な送り手 |
| --- | --- | --- |
| `advance` | `{ years, months, days }`。`advanceWorld` を実行 | Tools タブ・Advance Time ダイアログ |
| `command` | `ExtensionCommandRequest`(`host.dispatch`) | 拡張の UI |
| `replaceWorld` | .fmg 全体の置き換え(§7 の編集の確定・新しい地図の登録) | 編集リースの保持者・管理者 |
| `setWorldSettings` | `simulation.worldSettings`(§18)の変更 | 管理者 |

- op には `opId`(クライアント生成の UUID、再送の重複排除)と `baseRevision` を付ける。`advance` と `command` は `baseRevision` が古くても実行してよい(サーバーの最新状態に対して実行され、結果が届く)。`replaceWorld` は `baseRevision` 一致が必須で、不一致は 409(`map:server` の `If-Match` と同じ)。
- `advance` は長い(fixture 1 年で約 8.5 秒)。実行中の進捗は SSE の `progress`、中止は `POST .../ops/:opId/cancel`(Host の `shouldStop` に相当)。実行中に来た op はキューで待つ。同時に 2 つの `advance` を受けた場合は、キューに積む(「2 人が 1 か月ずつ押したら 2 か月進む」)。誤操作を防ぐ設定として「実行中・待機中の advance があれば新しい advance は 409」を選べるようにする。
- 乱数: `advance` はチャンネルの時間軸シード(§13.3)で決まるので、同じ op 列からは同じ結果になる。

## 5. ストレージ

FMG の世界は「.fmg = 完全な状態」で、差分の単位(トピック)はまだ粗い(`DataTopic` は約 20 種)。そこで DB/KVS ではなく、**スナップショット + op ジャーナル**のファイル構成にする。

```
data/channels/world-1/
  channel.json          # id, 表示名, 作成日, 権限設定, 有効な拡張, 現在の revision とスナップショット名
  journal.ndjson        # 1 行 1 op: { revision, opId, op, user, at, durationMs, hash }
  snapshots/
    r000000.fmg         # 登録時
    r000412.fmg         # 定期(例: advance で暦の年が変わるたび / N op ごと)
  current.fmg -> snapshots/r000412.fmg 相当(channel.json が指す)
```

- **復元**: 最新スナップショットを読み込み、それより後のジャーナルの op を順に再実行する。§20・§23 の決定性により、結果は止まる前と同じになる。ジャーナルの `hash`(`hashArchiveBytes` の要約)で再実行結果を検証できる。
- **書き込みは一時ファイル→rename**(`map:server` と同じ)。ジャーナルは追記のみ。
- **履歴**: スナップショットは過去の版として残るので、「r412 の世界を見る」「r412 から分岐して world-3 を作る」が安くできる(分岐 = スナップショットのコピー + 新しい channel.json)。
- 容量: .fmg は数 MB〜数十 MB。スナップショットの保持数(最新 K 個 + 年ごと 1 個 など)を `channel.json` で決める。
- 将来 SQLite に移す場合も、この 2 つ(スナップショット BLOB・ジャーナル行)をそのままテーブルにするだけで済むよう、ストレージは `ChannelStore` インターフェイス(`loadLatest` / `appendOp` / `writeSnapshot` / `listSnapshots`)の裏に置く。headless-sim-stats の結果(NDJSON+SQLite)とも同じ流儀。

## 6. ブラウザとの同期

### 6.0 採用する方式(2026-10-17 改訂): 命令の配信 + 区画の差分

クライアント側の改竄は許容する(サーバーはクライアントの結果を信用しなくてよいが、検証もしない)方針になったため、.fmg 全体を配る方式 A を基本にしない。

- **advance と typed command → 命令だけを配る**(方式 C のロックステップ)。サーバーは op を確定順に番号付けして全員に配り、自分でも実行して永続化する。各ブラウザは同じ op を手元の Host で実行する。§21 の bit-exact により結果は一致する。advance は世界のほぼ全体を変えるので、結果を送るより命令を送るほうが桁違いに小さい。
  - 各 op の後にサーバーは区画ハッシュ(`hashWorldDocument` の `sections`)を配る。ブラウザは自分のハッシュと比べ、違う区画だけを取り直す(下記)。改竄・バグ・拡張の有効状態の食い違いはこれで自然に直る。
  - 遅い端末は、自分の実行が終わるまで op を溜める。溜まりすぎたら(例: 未実行の advance が合計 1 年超)、実行をやめて区画の差分で追いつく。
- **従来のエディタの直接書き換え → 区画の差分を送る**。エディタは `pack` をその場で書き換えるので命令にできない。確定時にクライアントが区画ハッシュを取り、変わった区画だけをサーバーへ送る(`replaceSections`、`baseRevision` 一致が必須)。サーバーは取り込んで全員に新しいハッシュを配り、各ブラウザは違う区画だけを取りに来る。編集リース(§7.2)が不要になり、同時編集は「同じ区画を触ったら後勝ち・409」で扱える。
- **途中参加** → 最新スナップショットの .fmg を取得し、それ以降の op を実行(または差分で追いつく)。.fmg 全体の転送はこの時だけ。
- 区画の単位は、golden の `sections` と同じ分け方(`world.pack.burgs`、`simulation.extensions.economy` の子 など)から始める。区画を部分的に読み込み直す処理(`applySections`)は新規。読み込み後の派生データの再計算と再描画は、該当トピックの `WorldChangeSet` を発行して既存の購読に任せる。

方式 A は、`applySections` が完成するまでの最初の足場(N2)として残す。

### 6.1 方式 A: スナップショット配信(最初の足場)

1. 接続: `GET /api/channels/:id/archive` で現在の .fmg と `revision`(ETag)を取得し、ローカルの Host で `loadArchive` → 通常の読み込み後の描画。
2. SSE `GET /api/channels/:id/events` を購読。op が確定すると `{ type: "revision", revision, opKind, topics }` が届く。
3. ブラウザは新しい .fmg を取得して読み込み直す。開いているダイアログ・選択・表示位置は保つ(読み込み直しは `fmg:world-loaded` 経由で既存の再描画が走る)。
4. Advance Time の進捗は SSE の `progress` で、今の Tools タブの進捗表示(time-simulation store)に流す。

- 正しさは §23 で保証済みで、実装が小さい。欠点は 1 op ごとに .fmg 全体を送る・読み込むこと。Advance Time(日〜年単位)には十分だが、細かいコマンドを連打すると重い。
- 改善: 連続した `revision` は間引く(取得中に新しい版が来たら、終わってから最新だけ取る)。

### 6.2 方式 B: トピック差分(方式 A の後)

- `WorldCommit.changes`(`WorldChangeSet`: `fromRevision`/`toRevision`/変わったトピック)を使い、変わったトピックの部分だけを送る。`extension.*` は拡張の state slice(`extensionStateSliceRegistry`)単位、`simulation.cells` 等は型付き列単位。
- `advance` は多くのトピックを変えるので、効果があるのは主に `command`。方式 A で計測してから着手する。

### 6.3 方式 C: ロックステップ(研究課題)

- ブラウザと Node が bit-exact に一致する(§21)ので、サーバーは op 列だけを配り、各ブラウザが自分で同じ op を実行する方式も原理的に可能。通信量は最小だが、遅い端末は進行に追いつけず、ずれた時は方式 A で再同期が要る。サーバーの `hash` と照合して、ずれを検出できる。
- 今回は実装しない。方式 A が帯域で行き詰まった時の選択肢として残す。

## 7. 編集(UI がワールドを直接書き換える操作)

Burg Editor・Province 編集・heightmap 編集など、従来のエディタの多くは `pack.*` のフィールドをその場で書き換える(`lint-world-writers` が見ているのはオブジェクト全体の代入だけ)。これらを全部 op に書き換えるのは本計画の範囲を超える。そこで段階を分ける:

1. **閲覧・進行モード**(既定): 接続中はエディタの確定操作を無効化する(ボタンを disabled、ツールチップで理由を示す)。Advance Time と、typed command として登録済みの拡張コマンドだけが使える。
2. **編集リース**: 1 人が `POST /api/channels/:id/lease` で編集権を取る(有効期限つき、他の接続者には「X が編集中」と表示)。保持者はローカルで今どおり編集し、「サーバーに反映」で .fmg 全体を `replaceWorld`(`baseRevision` 一致必須)として送る。リース中、他者の `advance` は待たせる(編集の土台がずれないように)。これは `map:server` の PUT とほぼ同じで、既存コードを流用できる。
3. **typed command 化**(長期): よく使う編集(名前の変更、国境の変更など)から `WorldRuntime` の typed command にしていく。command になった編集はリースなしで誰でも送れる。これは world-writer 整理(P1-3 / P2-12)と同じ方向。

## 8. ブラウザ側の切り替え

- `SimulationHost` インターフェイスを満たす **`RemoteSimulationHost`**(`src/simulation/adapters/remote.ts`)を作る。
  - `world` / `simulation`: ローカルの複製を返す(読み取りは今と同じ)。
  - `advance` / `startAdvance` / `dispatch`: サーバーへ op を送る。`advance` は同期 API だが、リモートでは完了を待てないので、リモート時は `startAdvance` 経由のみ許し、`window.fmg.actions.advanceTime` は op の完了を待つ Promise を返す(戻り値の型の変更が要る。呼び出し元を棚卸しする)。`dispatch` はリモート時 `null` を返し、結果は次の revision で届く(呼び出し元が戻り値を使っている箇所を棚卸しする。17 ファイル)。
  - `loadArchive`: サーバーからの .fmg の読み込みに使う(ローカルの読み込みと同じ処理)。
  - ローカルで登録されたシミュレーション部(システム・map-ready タスク)は、リモート時は実行しない。複製に対して tick が走ると正本とずれるため。
- `app.ts` の `setSimulationHost` で、モードに応じてローカル Host かリモート Host を入れる。切り替えはページの読み込み単位(接続・切断 = 読み込み直し)にし、実行中の差し替えはしない。
- **選択の UI**:
  - URL: `?server=https://host:port&channel=world-1`(共有しやすい)。
  - Load ダイアログに「Server channels」タブ: チャンネル一覧(名前・暦・revision・接続人数・最終更新)、接続ボタン、新規作成(今の地図を登録)。
  - 接続中は画面の端に接続先・revision・接続人数・同期状態(最新 / 取得中 / 切断)を表示。切断時は自動で再接続し、復帰したら最新を取る。
  - Save ダイアログ: 「ローカルにダウンロード」は常に可能(複製を保存)。
- 文言は i18n ファイルに置く(ソースに日本語を書かない)。

## 9. API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | /api/health | `{ ok, version, channels: n }` |
| GET | /api/channels | 一覧 |
| POST | /api/channels | 作成。本文は .fmg(新しい地図)か `{ fromChannel, revision }`(分岐) |
| GET | /api/channels/:id | `channel.json` 相当 + 接続人数 + 実行中 op |
| DELETE | /api/channels/:id | 管理者のみ |
| GET | /api/channels/:id/archive[?revision=r] | .fmg、ETag=revision。過去版はスナップショットがある版だけ |
| GET | /api/channels/:id/events | SSE: `revision`・`progress`・`lease`・`presence`・`error` |
| POST | /api/channels/:id/ops | op の送信 → `202 { opId, queuedAt }`。結果は SSE |
| POST | /api/channels/:id/ops/:opId/cancel | 実行中の advance の中止 |
| GET | /api/channels/:id/journal[?since=r] | op の履歴 |
| POST/DELETE | /api/channels/:id/lease | 編集リースの取得・延長・解放 |

## 10. 認証・権限

- 最初はトークン方式(`map:server` と同じ)。チャンネルごとに `viewer`(読む)・`operator`(advance・command)・`editor`(リース・replaceWorld)・サーバー全体の `admin`(作成・削除)。
- 接続者の表示名はクライアントが名乗るだけ(認証とは別)。ジャーナルの `user` に残す。
- 公開ネットワークに置く場合は前段にリバースプロキシ(TLS・認証)を置く前提とし、本体はアカウント管理を持たない。

## 11. 実装計画

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| N0 | `ChannelStore`(ファイル)と、チャンネル 1 つを持つ子プロセス(`scripts/lib/simChannelWorker.mts`): 読み込み・`advance`・`command`・スナップショット・ジャーナル・復元 | Node テスト: op 列を実行→プロセスを止める→復元→続けて実行、の結果が止めずに実行した場合とハッシュ一致 |
| N1 | チャンネルサーバー(`scripts/simServer.mts`、`npm run sim:server`): HTTP・SSE・キュー・複数チャンネル・アイドル停止・トークン | curl で 2 チャンネルを作り、別々に進めて互いに影響しない |
| N2 | `RemoteSimulationHost` + 方式 A 同期 + URL 指定での接続 + 接続状態の表示 + 接続中のエディタ無効化 | Playwright: 2 ページを同じチャンネルに接続し、A が 1 か月進めると B の暦と都市人口が A と一致。ローカルで同じだけ進めた結果ともハッシュ一致 |
| N3 | Load ダイアログのチャンネル一覧・作成・分岐、Advance の進捗・中止、再接続 | 手動確認 + e2e 1 本 |
| N4 | 編集リースと `replaceWorld` | 2 ページで、リースの無い側のエディタが無効、リース側の編集が反映される |
| N5 | §6.0: op のロックステップ配信 + 区画ハッシュ照合 + `applySections` による区画差分(取得・送信) | 2 ページで advance を op 配信のみで同期し、区画ハッシュが毎回一致。片方で Burg 名を変えると、その区画だけが転送されて反映される |

- `map:server` は N3 の時点で、チャンネル 1 つ・editor 1 人の特別な場合として `sim:server` に寄せるか判断する(Burg Site Descriptor の API は残す)。

## 12. リスクと未決事項

- **方式 A の重さ**: 大きな地図の .fmg 読み込みは数秒かかる。Advance の後なら許容範囲だが、command の連打には向かない。N2 で読み込み時間を計り、N5 の要否を決める。
- **ローカルの tick が複製を書き換える**: リモート時にローカルのシミュレーション部を止め漏らすと、複製が正本とずれる。N2 で、接続中に複製のハッシュが受信した .fmg のハッシュと一致し続けることを検査する(開発ビルドのみ)。
- **UI がワールドに書き込む箇所の残り**: §23.2 で在庫の配置の書き込みは解消したが、他にも残っている可能性がある。同じ検査で見つける。
- **`advance` と `dispatch` の同期 API**: 戻り値を使う呼び出し元を N2 の前に棚卸しする。
- **`map-ready` タスク**: 生成直後の economy 準備などは、チャンネル登録時にサーバーで `prepare({ all: true })` を走らせるか、ブラウザで済ませた .fmg を登録するかを決める(後者が単純。登録時に `loadRepairs` の版数を確認する)。
- **拡張の有効状態**: チャンネルの有効な拡張は `channel.json` が正。ブラウザの Extensions タブの設定と食い違う場合、接続中はチャンネル側に従い、タブは読み取り専用にする。
- **ワールドに保存しない設定**(§16.3 で「ブラウザ側」と分類したもの)は、各ブラウザで違ってよい(表示の設定など)。結果に影響するものは §18 で既にワールドにある。

## 13. 先行実装: ブラウザの地図を公開して AI が API で操作する(2026-10-17)

スタンドアロンのブラウザで作った地図(設定・時間経過も含む)を、ボタン 1 つでサーバーのチャンネルに複製し、AI・スクリプトが REST で同じ地図を読み・進められるようにした。ブラウザとチャンネルは**同期しない**(公開した時点の複製。以後ブラウザ側の変更は送られない)。§6 の同期は N2 以降。

### 13.1 使い方

```
npm run sim:server -- [--port 8788] [--host 127.0.0.1] [--data data/channels] [--token T]
FMG_SIM_SERVER=http://127.0.0.1:8788 npm run dev     # Vite が /api/sim を転送
```

- Save ダイアログに「Simulation server」ボタンが出る(サーバーが応答する時だけ)。押すと今の地図を `POST /api/sim/channels` し、チャンネル id(`world-1`, …)と API の URL を表示する。`--token` 指定時は最初にトークンを聞く(`fmg.simServer.token`)。
- ビルド成果物から使う場合は `VITE_SIM_SERVER` にサーバーの URL を指定する(CORS は許可済み)。

### 13.2 API(`/api/sim`。書き込みは `--token` 指定時 `Authorization: Bearer T` が必須)

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | /health | `{ ok, channels, auth }` |
| GET / POST | /channels | 一覧 / 作成(本文 = .fmg、`?name=`・`?id=`・`?extensions=economy,…`) |
| GET / DELETE | /channels/:id | 情報 + 要約(暦・件数・有効な拡張) / 削除 |
| GET | /channels/:id/archive | 現在の .fmg(ETag = revision) |
| GET | /channels/:id/{burgs,states,provinces,cultures,religions,markers,rivers,routes}[?q=名前] | 一覧(各要素の数値・文字列・真偽のフィールドだけ) |
| GET | /channels/:id/:collection/:i | 1 件(全フィールド) |
| POST | /channels/:id/ops | `{"type":"advance","years":0,"months":1,"days":0}` か `{"type":"command","extensionId":…,"name":…,"payload":…}`。**完了まで待って**結果(新しい revision・暦・所要時間)を返す。`X-FMG-User` はジャーナルに残る |
| GET | /channels/:id/journal[?since=r] | op の履歴 |
| GET | /channels/:id/events | SSE(`revision`) |

例: `curl -X POST -H 'Authorization: Bearer T' -d '{"type":"advance","months":1}' http://127.0.0.1:8788/api/sim/channels/world-1/ops`

### 13.3 実装

- `scripts/simServer.mts`(親: HTTP・認証・SSE)と `scripts/lib/simChannelWorker.mts`(チャンネルごとの子プロセス。`createNodeSimulationHost` + `loadWorld`、op を 1 つずつ実行)。10 分使われないチャンネルは子プロセスを止め、次の要求で `current.fmg` から起こす。
- ストレージ(§5 の簡易版): `data/channels/<id>/{channel.json, current.fmg, snapshots/r000000.fmg, journal.ndjson}`。op ごとに `current.fmg` を一時ファイル→rename で書き換え、ジャーナルに追記する。定期スナップショットとジャーナルからの復元は N0。
- ブラウザ: `src/io/simServer.ts`(`probeSimServer`・`publishToSimServer`)、`saveMap("simServer")`。
- **拡張の有効状態**: .fmg には含まれない(ブラウザの Extensions タブの状態)。公開時にブラウザで有効なシミュレーション拡張を `?extensions=` で送り、`channel.json` に保存して子プロセスはその集合で Host を作る。送らないと Node は全拡張を有効にし、economy を使っていない地図では読み込み時の商品カタログの移行(`migrateIndustrialSteamGoods`)が空のカタログで `Unknown ingredient Coal` を投げて落ちた(実際に発生)。

### 13.4 検証

- fixture を `POST` → `advance 1 month` → `archive` を取得したハッシュが、`npm run sim -- fixture --months 1 --hash` と一致した。
- 2 チャンネルを別々に進めて互いに影響しないこと、トークンなしの書き込みが 401 になることを確認した。
- Playwright(実ブラウザ): 地図を生成 → 3 日進める → Save ダイアログのボタンで公開 → チャンネルの暦(1853-1-4)と都市数(63)がブラウザと一致し、API から 10 日進められた。

## 14. チャンネル選択ダイアログ(2026-10-17)

- `SimChannelsDialog`(`src/ui/dialogs/SimChannelsDialog.tsx`、id `simChannels`): チャンネルの一覧(名前・id・暦・都市数・revision)と「接続」「削除」。地図作成モード(Build map の進行ダイアログ)が最初に開いた時、サーバーにチャンネルがあれば 1 回だけ自動で開く。Load ダイアログの「Simulation channels」ボタンからも開ける。
- **接続**(`src/io/simChannelConnection.ts`): チャンネルの .fmg を取得して通常の読み込み(`uploadMap`)を行い、SSE の `revision` を購読して、サーバーで op が確定するたびに読み込み直す(§6.1 方式 A の受信側のみ)。読み込み中に次の版が来たら、終わってから最新を 1 回だけ取る。ブラウザでの変更・Advance Time はサーバーに送られない(送信は N2)。チャンネルが削除されると、手元の地図はローカルの複製として残る。
- **削除**: `DELETE /api/sim/channels/:id` は**トークン不要**(誰でも削除できる。共有の作業用ワールドとして扱う方針)。確認ダイアログのあとに実行し、接続中の全員に SSE `deleted` を送る。
- 一覧に暦と件数を出すため、公開時に要約を `channel.json` に保存するようにした(op のたびに暦は更新される)。
- 検証(Playwright): fixture のチャンネルがある状態でページを開く → ダイアログが自動で開く → 接続で都市 95 の世界が読み込まれる → API で 5 日進める → ブラウザが自動で 1064-1-6 に追従 → ダイアログから削除 → 一覧が空になる。ページのエラー 0。

## 15. 切断(2026-10-17)

- ダイアログ: 接続中のチャンネルの行は「接続」の代わりに「切断」を出し、一覧の上に接続先を表示する(`subscribeSimChannelConnection` + `useSyncExternalStore`)。切断すると SSE の購読をやめ、読み込んだ地図はローカルの複製として残る。
- **自動切断**: 接続したまま別の地図を扱うと、次の revision でチャンネルの地図に上書きされるため、次の 2 つで自動的に切断し、ツールチップで知らせる。
  - 別の地図の読み込み: `uploadMap` の先頭で呼ばれる `onMapUpload`(`src/io/load.ts`、新設)を購読し、チャンネル自身が取得した Blob 以外なら切断(ファイル・ブラウザ保存・URL・Dropbox・map:server のいずれも `uploadMap` を通る)。
  - 新しい地図の生成: `generationProgressStore` の `isOpen` が false→true になったら切断(`beginStage`)。
- 検証(Playwright): 切断ボタンの後に API で進めても暦が変わらない。接続中にファイルから読み込むと切断され、その後の API の advance で上書きされない。接続中に New Map → Generate で切断される。ページのエラー 0。

## 16. デバッグ用の読み取り API(2026-10-17)

人が「チャンネルの URL + 都市番号」を共有するだけで、AI がブラウザなしで FMG・CE の入力を再現できるようにする。事例と設計は [estuary-port-pair-relocation.md](estuary-port-pair-relocation.md) §7。

- `GET /api/sim/channels/:id/debug`: エンドポイントの一覧(自己記述)。
- `GET …/burgs/:id/context`: 所属セル・都市の下のセル・移動距離・描いた海岸に対する位置・`waterfrontIssues`・近くの都市・接続する道と川の交差(角度の概算、海の上か)。
- `GET …/burgs/:id/site`: CE のサイト記述子(`getBurgSiteDescriptor`)。CE を開いたときと同じく道の収束処理を走らせ、その結果はメモリ上のワールドに反映される(次の op で保存される。ブラウザで CE を開いた場合と同じ)。
- `GET …/cells/:id`: セルの詳細(多角形・高さ・川・haven・都市・隣接・道)。
- `GET …/diagnostics/settlement?minSeparationRadii=2`: 世界全体の検査(セル外の都市・寄り過ぎの組・海の上の川の交差)。セル外の判定は再配置と同じ許容範囲(`settlementSiteBounds.ts`)を使う。範囲内の都市は `tolerated: true` で一覧に出すが、件数には数えない。
- 実装: `scripts/lib/simDebugViews.mts`(子プロセス側)、`simChannelWorker.mts` の `debug` 要求、`simServer.mts` の経路。
- 検証: world-1 で `/burgs/11/context` が「セル 1412(海)上、海岸の海側 63 m、Road #18 の交差が海上・概算 49°」を返した。`/burgs/11/site` は 200(3.2 秒)。不正な id は 400。
