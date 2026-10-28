# 長期実行で月ごとに遅くなる原因の計測 計画・手順書

## 状態

- 2026-10-28 計画。
- 2026-10-28 計測。原因は家畜のロット台帳の全走査（[記録](../analytics/tick-growth-20261028.md)）。
- 関連: [Rust 化の設計](rust-simulation-core.md) の R0、[Advance Year パフォーマンス調査](../analytics/advance-year-performance.md)。

## 1. 背景

World 固定入力（`docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg`）を Node で長期実行すると、月が進むほど1か月の処理が遅くなる。

| 観測 | 内容 |
| --- | --- |
| 計測用 Mac mini M4（`auditFeedShortage.mts`、96か月、ヒープ上限6GB） | 78か月目までで3時間24分。最初は1か月1〜2分、78か月目付近では1か月に数分以上かかる |
| CPU | 実行中ずっと100%（1コア分）。Node のシミュレーションは単一スレッド |
| メモリ | 約1GB で、上限6GB に届かない。GC・メモリ不足は原因ではない |
| 計測スクリプトの影響 | 頭数・飼料不足の計測は、どちらも遅くなる。飼料不足の計測が月ごとにセルを記録するのは最後の12か月だけ。遅くなっているのはシミュレーション本体 |

時間とともに増える何か（都市・市場・隊商・履歴など）に比例するか、それ以上の速さで、1か月の計算量が増えていると考えられる。この性質は Rust に移しても残るので、Rust 化より先に原因の処理を特定して直す。

## 2. 目的

1. 1か月あたりの時間が、どの月から、どの速さで伸びるかを記録する。
2. 時間が伸びた処理（tick のラベル）を、序盤と終盤の比較で特定する。
3. 伸びた処理と、件数が伸びたもの（都市・市場・隊商・群れ・台帳・履歴）を対応づける。
4. 2と3から、直す処理の候補と直し方の見込みを出す。

### 非目的

- この計測でコードを直すこと。修正は結果を見てから、別に計画する。
- 96か月以上の実行。48か月で十分に遅くなる（72か月目付近では1か月に3時間近くかかる）。

## 3. 計測の設計

### 3.1 実行条件

| 項目 | 値 |
| --- | --- |
| 入力 | `docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg` |
| 期間 | 48か月 |
| ワールド設定 | E1 の計測と同じ（`fmg-long-distance-trade=on`、`fmg-caravan-raids=off`） |
| 機械 | 計測用 Mac mini M4。ほかの計測と同時に走らせない |
| ヒープ上限 | `NODE_OPTIONS=--max-old-space-size=3072`（メモリは原因ではないが、余裕を持たせる） |
| ソース | 計測時のコミットを記録する（未コミットの変更があれば差分も残す） |

### 3.2 取るもの

| 種類 | 粒度 | 内容 |
| --- | --- | --- |
| 月の所要時間 | 月ごと | `advanceWorld(host, { months: 1 })` の壁時計の時間（ms）と、実行開始からの累計 |
| ラベル別の時間 | 月ごと・ラベルごと | `setTickStepObserver` の enter と exit の間の時間。呼び出し回数、合計（total）、子ラベルを除いた自分だけの時間（self） |
| ラベルの外の時間 | 月ごと | 月の時間から、最上位のラベルの合計を引いた残り。ラベルの付いていない処理の重さを示す |
| 件数 | 年ごと（12・24・36・48か月目）と1か月目 | 都市数、市場数（`getMarkets()`）、隊商数（`getCaravans()`）、群れの表の行数、主な台帳・履歴の配列の長さ（§3.4） |
| ヒープ | 月ごと | `process.memoryUsage()` の `heapUsed` と `rss`（増え方の確認用） |
| CPU プロファイル | 2か月分 | 2か月目と48か月目だけ、`node:inspector` の `Profiler` で取る。ラベルの粒度で原因が絞れない時に、関数単位で見る |

### 3.3 ラベル時間の測り方

- `measureTickStep` と `measureTickStepAsync` は入れ子になる（例: `production:settle` の中に `production:produce`、その中に `production:burgLoop`）。observer はスタックを持ち、exit で次を記録する。
  - total: そのラベルの enter から exit まで
  - self: total から、直下の子ラベルの total を引いたもの
- `measureTickStepAsync` は途中で await するため、別のラベルが間に入る可能性がある。スタックの先頭と exit のラベルが一致しない時は、ラベルごとの開始時刻の表から total を計算し、self は計算しない（`selfUnreliable` として数える）。
- observer はワールドを変えない（`tickProfiler.ts` の契約）。計測の有無で結果が変わらないことは §5 の手順7で確かめる。

### 3.4 件数の対象

最初の実装では次を数え、足りなければ CPU プロファイルの結果から追加する。

- `pack.burgs`（削除済みを除く）、`getMarkets()`、`getCaravans()`
- 群れの表（`getOrCreateFaunaStockTable()`）、飼料の表（`getOrCreateLivestockFeedTable()`）の行数
- 市場ごとの台帳・履歴の配列（`foodLedger` など、配列か `Map` の要素数）の合計と最大
- economy の slice の最上位のキーのうち、配列か `Map` のものの要素数（汎用。伸びたものを後から探せるように全て記録する）

### 3.5 出力

- スクリプト: `scripts/auditTickGrowth.mts`
- 使い方: `auditTickGrowth.mts <archive.fmg> <output.json> [months=48] [--cpu-profile-months=2,48]`
- 出力 JSON（`schemaVersion: 1`）:
  - `inputSha256`、`sourceCommit`、`months`、`worldSettings`、`node`（版）
  - `months[]`: `{ month, wallMs, elapsedMs, heapUsed, rss, unlabeledMs, labels: { [label]: { calls, totalMs, selfMs } } }`
  - `counts[]`: `{ month, burgs, markets, caravans, faunaRows, feedRows, ledgers: {...}, economySlice: {...} }`
  - `growth[]`: ラベルごとに、序盤（1〜12か月目）と終盤（37〜48か月目）の1か月あたりの self と total、その比（伸び率）。伸び率の大きい順
- CPU プロファイル（`.cpuprofile`）は大きくなるため、`docs/analytics/raw/` に出力し、Git 管理外とする。SHA-256 だけを記録に書く（[AGENTS.md の観測データの保存](../../AGENTS.md)）。
- 進捗は標準エラーに、1か月ごとに時刻と所要時間つきで出す（`[tick-growth] 2026-10-28T10:15:02 12/48 wall=95s`）。進捗の行を `tail` で捨てない。

## 4. 判定の方法

1. **月の時間の伸び方**: 月の時間を月数に対して並べ、ほぼ一定・直線的な伸び・それより速い伸びのどれかを見る。
2. **伸びた処理**: `growth[]` の上位から、終盤の1か月あたりの self が大きく、伸び率も大きいラベルを選ぶ。ラベルの外の時間（`unlabeledMs`）が伸びている時は、CPU プロファイルで関数を特定する。
3. **件数との対応**: 伸びたラベルの時間を、件数の推移と比べる。例えば時間が隊商数の2乗に沿って伸びていれば、隊商の組み合わせを扱う処理を疑う。
4. **直し方の見込み**: 候補ごとに、「件数の伸びを止める（履歴の打ち切りなど）」「計算量を下げる（索引・差分更新）」「頻度を下げる」のどれが合うかを書く。

## 5. 手順

1. 計測用 Mac のリポジトリを、計測するコミットに合わせる。

   ```sh
   git fetch && git checkout <commit>
   npm ci
   ```

2. スクリプトの型を確かめる。

   ```sh
   npx tsc --noEmit -p .
   ```

3. 短い試行（3か月）で、出力の形と進捗の行を確かめる。

   ```sh
   NODE_OPTIONS=--max-old-space-size=3072 node --import tsx scripts/auditTickGrowth.mts \
     docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg \
     docs/analytics/raw/tick-growth-trial.json 3 --cpu-profile-months=2
   ```

4. 本計測（48か月）を走らせる。標準エラーはファイルに残す。

   ```sh
   NODE_OPTIONS=--max-old-space-size=3072 node --import tsx scripts/auditTickGrowth.mts \
     docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg \
     docs/analytics/tick-growth-20261028/world-48.json 48 --cpu-profile-months=2,48 \
     2> docs/analytics/raw/tick-growth-20261028-world-48.log
   ```

5. 実行中は、ほかの計測を同じ機械で走らせない。進捗は `tail -f docs/analytics/raw/tick-growth-20261028-world-48.log` で見る。
6. 終わったら、出力 JSON（2MB 以下ならコミット対象）、`.cpuprofile` とログ（`raw/`、管理外）の SHA-256 を取る。

   ```sh
   cd docs/analytics && shasum -a 256 tick-growth-20261028/*.json raw/tick-growth-20261028-*
   ```

7. 計測が結果を変えていないことを確かめる。12か月の短い実行を observer あり・なしで1回ずつ行い、golden ハッシュ（`src/simulation/goldenHash.ts`）を比べる。スクリプトに `--no-observer` を用意し、終了時にハッシュを出す。
8. 記録を `docs/analytics/tick-growth-20261028.md` に書く。§4 の判定、上位の伸びたラベルの表、件数の推移の表、SHA-256 の一覧を載せる。
9. 結果に応じて、直す処理の計画を `docs/plan/` に作る（または該当する既存の計画書に追記する）。[Rust 化の設計](rust-simulation-core.md) の R0 の項に、結果への参照を加える。

## 6. 見積もり

- 48か月の本計測: 2〜3時間（計測用 Mac で、96か月の計測の78か月目までが3時間24分だったことから）。CPU プロファイルを取る2か月分は、その月だけ遅くなる。
- スクリプトの作成と試行: 半日以内。

## 7. 次の作業

計測は完了。原因は家畜のロット台帳で、修正は[台帳の計画](livestock-lot-ledger-performance.md)で進める。**次は同計画の L1（索引）の実装。**
