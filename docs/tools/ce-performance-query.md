# ce:perf の計測結果から改善対象を絞り込む

`ce:perf` が出力した `report.jsonl` は都市×反復ごとに1行、1行に数十の工程が入る巨大なファイルで、
そのままAIモデルのコンテキストに入れることはできない（596都市で8 MB）。`ce:perf:query` は
JSONLを直接読み、「どの都市が遅いか」「どの工程が時間を使っているか」「それは規模の問題か」を
**数十行のMarkdown表**に要約する。チューニング対象を絞るまでは、JSONLやCSVを直接読まずこのコマンドを使う。

```sh
npm run ce:perf:query -- <report.jsonl> <command> [arg] [options]
```

入力は `ce:perf` の `report.jsonl` のみ（`.summary.json`・`.meta.json`・CSVは不要）。ファイルは読むだけで、何も書き込まない。
`--json` を付けると同じ内容をJSONで出力する（後続のスクリプト処理向け）。

## 絞り込みの手順（この順に実行する）

| 段階 | 知りたいこと | コマンド |
| --- | --- | --- |
| 1 | 全体像と、狙うべき方向（都市か工程か） | `overview` |
| 2 | 工程ごとの時間（どこを直すか） | `stages --self` |
| 3 | 遅い都市（どの入力で再現するか） | `cities` |
| 4 | その工程が特に遅い都市 | `stage <工程>` |
| 5 | 1都市の工程内訳・不採用理由 | `city <burgId>` |
| 6 | 規模に対して悪化する工程か | `scaling --self` |
| 7 | 再試行で捨てた時間 | `retries` |
| 8 | 修正前後の比較 | `compare <before> <after>` |

### 1. overview — 方向を決める

```sh
npm run ce:perf:query -- temp/benchmarks/triviers-1014.jsonl overview
```

見る項目と判断:

- **上位10%の都市が全体に占める割合**（例: 42.0%）。高い（5割超）→ 少数の遅い都市を `cities` で調べる。10%に近い→ 全都市が均等に遅いので工程（`stages`）を直す。
- **時間 ∝ dwellings^k**。k≈1 は住宅数に比例、k≈2 は2乗で悪化。k が0.5前後なら固定費の比重が大きく、小さい都市の高速化が全体に効く。
- **相関 r**（dwellings/population/faces）。0.8以上なら遅さの主因は規模。低ければ入力の形状（海岸・河川・城壁など）が原因なので `cities` の個別調査へ。
- **再試行で捨てた時間の割合**。数%を超えるなら `retries`。
- **自己時間の上位工程**。子工程を除いた時間で、合計が生成時間になる＝重複がない。**最初の改善候補はここ**。

### 2. stages — 時間を食う工程

```sh
npm run ce:perf:query -- <report> stages --self --top 12     # 重複なし。改善候補の順位付け
npm run ce:perf:query -- <report> stages --depth 2           # 累計時間。親子の包含関係を見る
```

- `--self`: 子工程を除く自己時間。割合の合計が100%になり、「何が全体の何%か」に使える。
- 既定（累計）: 子を含む時間。親子で重複するので**足し合わせない**。工程ツリーの上位から降りて犯人を探す用途。
- 列: `合計 s`（全都市の合計）、`生成時間比`、`median/p95/max`。**合計が大きい**＝全体に効く工程。**p95/maxが中央値より桁違いに大きい**＝一部の都市だけで爆発する工程（`stage` で都市を特定）。
- 試行ごとの `attempt-1..8` は `attempt-*` にまとめて集計する。`fit-housing` は試行の外側の工程なので別に出る。
- 親工程の自己時間（例: `generation` 自体の self）が大きい場合、子に計測されていない処理がある。計測の追加が必要。

### 3. cities — 遅い都市

```sh
npm run ce:perf:query -- <report> cities --top 10                  # 生成が遅い順
npm run ce:perf:query -- <report> cities --by ms/dwelling --top 10 # 規模の割に遅い都市（効率の悪い入力）
npm run ce:perf:query -- <report> cities --by wasted               # 失敗試行で捨てた時間が多い順
npm run ce:perf:query -- <report> cities --by coastal-reservations # 特定工程が遅い順（--self可）
```

`--by` は `generationMs`（既定）・`totalMs`・`dwellings`・`population`・`faces`・`attempts`・`wasted`・`ms/dwelling`、
または工程名（パス全体でも末尾の名前でも可）。最右列は「その都市で自己時間が最大の工程」で、
複数の遅い都市で同じ工程が並ぶなら、それが共通の原因。

**`generationMs` 順で上位に来る都市は、規模が大きいだけの可能性がある。** 規模の割に遅い都市を探すには
`--by ms/dwelling`、または `--size small` のようにサイズを揃えて比較する。

### 4. stage — 工程が遅い都市

```sh
npm run ce:perf:query -- <report> stage fit-housing/coastal-reservations --top 10
npm run ce:perf:query -- <report> stage apply-plan --self
```

工程名はパス全体・末尾の名前・部分一致のいずれも可（完全一致があればそれのみ）。出力の
「この工程の時間 ∝ dwellings^k」は、その工程が規模にどう依存するか。「都市内の割合」が高い都市は、その工程を直せば
その都市が大きく速くなる。再現用の都市IDはここで決め、`ce:perf` の `--burg <id>` で単独計測する。

### 5. city — 1都市の内訳

```sh
npm run ce:perf:query -- <report> city 8 --min-ms 50 --depth 3
```

工程ツリー（累計・自己・都市内の割合・呼出回数）と、再試行した場合の不採用理由を出す。ID（数値）か名前の完全一致で指定。
`attempt-1..N` が並ぶ都市は、各試行が同じ工程を繰り返している＝失敗の原因を直すと試行回数が減って大きく速くなる。

### 6. scaling — 規模に対する増え方

```sh
npm run ce:perf:query -- <report> scaling --self --top 10
npm run ce:perf:query -- <report> scaling --self --by faces
```

工程ごとに「時間 ∝ 規模^k」の k を対数回帰で求める。k≈0 は規模に依らない固定費、k≈1 は線形、**k≥1.5 は超線形**で、
大きい都市ほど急に悪化する（アルゴリズム自体の見直し候補）。標本が5都市未満の工程は除く。合計時間が小さい工程の k は
気にしなくてよい（`合計 s` と併せて判断する）。

### 7. retries — 再試行・不採用

```sh
npm run ce:perf:query -- <report> retries
```

再試行した都市と不採用になった都市、失敗試行で捨てた時間、不採用理由（`unconnected-gates`、`castle-no-access` など）の件数。
`rejected` は全試行を使い切って生成できなかった都市で、その時間は全て無駄になる。理由の多いものから直すと、
速度と成功率の両方が改善する。

### 8. compare — 前後比較

```sh
npm run ce:perf:query -- before.jsonl compare after.jsonl --self
```

両方に存在する都市IDだけを比べ、合計時間、工程別の差（差の絶対値順）、悪化・改善した都市を出す。
**同じ入力CSV・同じマシン・同じ条件**で測った場合のみ意味がある（`.meta.json` の `inputHash` / `cpu` / `repeat` を確認）。
1回測定のばらつきは数%あるので、小さな差は `--repeat 3` で測り直してから判断する。

## 共通オプション

| オプション | 内容 |
| --- | --- |
| `--top <n>` | 表示件数（既定15） |
| `--self` | `stages` / `stage` / `scaling` / `compare` / `cities --by <工程>` で自己時間を使う |
| `--depth <n>` / `--min-ms <ms>` | `stages` / `city` / `scaling` で階層の深さ・小さい行を絞る |
| `--size <name>` / `--status <s>` | サイズ（small/medium/large）・状態（generated/rejected）で都市を絞る |
| `--min-dwellings <n>` / `--max-dwellings <n>` | 住宅数の範囲で絞る。規模を揃えた比較に使う |
| `--json` | JSON出力 |

フィルタは全コマンドに効く。例: 小規模都市だけの工程を見る `stages --self --size small --max-dwellings 500`。

## 読むときの注意

- 時間はms。JSONLの `timings.generationMs` をCE生成時間として扱う（FMG側のdescriptor作成は含まない。`ce-performance.md` 参照）。
- 工程の累計時間は包含関係があるため足し合わせない。割合を出すときは自己時間を使う。
- `attempt-*` は同一都市内で合算される。1都市1サンプルとして統計を取る。
- 反復（`--repeat`）がある場合、`cities` などは各反復を別行として扱う。都市単位でまとめたいときは `.summary.json` を参照する。
- 計測は1プロセス1回の値で、機械の負荷でぶれる。結論を出す前に別の出力名で再計測して再現を確認する。

## 計測例（triviers-1014.jsonl: 596件）

2026-10-14 の計測に対し `overview` → `stages --self` → `stage` と進めた結果（数値は計測時点のもの）:

1. 上位10%の60都市が生成時間の42%。k≈0.47なので固定費が大きく、小さい都市の工程が全体の大半を占める。
2. 自己時間は `fit-housing/coastal-reservations` 16%、`generation`直下 16%、`fit-housing/legacy-fabric/local-fabric` 14%、`attempt-*/apply-plan` 13%、`attempt-*/plan` 8%で約7割。
3. `coastal-reservations` は最大2.2秒で規模の割に重く、上位都市（Leigh・Wihulbo・Seriemigny）の最大要因。
4. 再試行は7都市、捨てた時間は13秒（3.4%）だが、Seriemigny（6試行）は10.6秒のうち5.4秒を捨てている。原因は `castle-no-access`。

→ 次の調査対象は `coastal-reservations`（全体への影響が最大）と、再試行の原因（`castle-no-access` / `unconnected-gates`）。
