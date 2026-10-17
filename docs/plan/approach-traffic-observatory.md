# 出入り口交通観測所 (Approach Traffic Observatory) 設計

2026-10-17 設計。O0〜O4 実装済み(2026-10-17)。O4 の採否は未決。

## 状態

- O0: `scripts/lib/observeViews.mts`(標本・ビュー)、sim:server の `observe/*` と `advance` + `sampleEvery`、`npm run sim -- --sample-every-months N --samples f.ndjson`、`npm run observe -- run/report`(`scripts/observe.mts`, `scripts/lib/observeReport.mts`)。例: `experiments/approach-baseline.json`。
- O1: `src/services/approachId.ts` の `approachIdForLeg`(descriptor も同じ関数を呼ぶ)。
- O2: `approachLedger.ts`(economy slice `approachTraffic` と `approachLedgerDecays`)。記録のみで、golden の差分は economy slice の新フィールドだけ(`simGoldenDiff` で確認)。
- 実装時の注記:
  - 月ストライドで進めた結果は、1 回で同じ期間を進めた結果と一致しない(既存の性質。標本の有無では変わらない)。O0 の完了条件は「sim:server と `npm run sim` の同ストライド実行でハッシュ・標本が一致」で確認した。
  - 渡河施設を共有する `crossing:<c>` の出入り口は経済側に施設 id が無いため、v1 の台帳では `route:<r>:edge:<cell>` で記録する。
  - 同一市場内の出荷(`MarketShipment`)は経路を持たないため、相手都市の方向に最も近い路線の門で両端を記録し、通過は数えない。
  - descriptor `roads[].approachTraffic` は O4 で実装(下記)。新規地図は `fmg:small --wait-extensions`(Province/Islet 規模、`fmg-extensions` を有効化)で生成する。
- O3: `src/city-editor/services/analysis/approachGrowthProbe.ts`(approachId ごとの ribbon budget/length・ribbon 内の lot 数・門前宿・石畳)、`scripts/observeCeProbe.mjs`(スナップショットの複製に対して別プロセスで実行)、`observe/burgs/:b/growth`、実験定義 `ceProbe.at` による区切り実行、レポートの一致率(`ce.csv`, `ce-summary.json`)。
- O3 の初回結果(`experiments/approach-baseline.json`、province 3000 cells、seed 101–103、warmup 2 年 + 10 年、+2y/+10y、上位 10 都市、計 58 都市・時点):
  - P の Top-1 一致 37%(n=51)、Spearman 平均 −0.21(n=27)。路線粒度の traffic は Top-1 64%(n=11)、ρ 0.10(n=20)。
  - 全都市で urban morphology が有効なため descriptor は `traffic` を渡さず(`burgSiteDescriptor.ts` の `withoutEconomy`)、CE の ribbon は隣接都市の人口と道路種別(`approachGrowthWeight`)で決まる。現状の CE 発展は FMG の交通量とほぼ無関係であることが確認できた。O4 の比較対象はこの状態。
  - 出入り口が 2〜3 本の小都市が多く、ρ は値が粗い。全球規模の地図での再測定が望ましい。
- 既存の土台: `npm run sim`(Node でのヘッドレス時間経過)、`npm run sim:server`(チャンネル + REST、[simulation-channel-server.md](simulation-channel-server.md) §13/§16)、`npm run map:server`([map-server.md](map-server.md))、交易回廊台帳 `tradeCorridorLedger.ts`([fmg-economy-to-city-editor.md](fmg-economy-to-city-editor.md) §6)、CE の `UrbanGrowthPlan.regions[].approachId`。

## 1. 目的

新規生成・既存の地図に対して Advance Time を進め、経済データを定期的に収集し、

1. 都市間の流通網(陸路・川・海路)の**区間ごとの使用量**を時系列で測る。
2. 各都市の**出入り口(approach = CE の門の候補)ごと**の流入・流出量を測る。
3. どの出入り口が「発展しやすいか」を、交通量と CE が実際に描く郊外(approachRibbon)・門前宿・舗装の結果で検証する。

これをシード・期間・設定を変えて繰り返し、比較できるようにする(実験 → 収集 → 集計 → 報告の一続きの仕組み)。

### 非目的

- シミュレーションの経済式そのものの調整(この仕組みで見つけた問題は別の設計書で扱う)。
- ブラウザ UI の新規ダイアログ(v1 は CLI と REST、静的 HTML レポートのみ)。
- 分散実行([simulation-lab.md](simulation-lab.md) L3)。単一マシンで複数子プロセスまで。

## 2. 現状の計測とその不足

| 既存の値 | 場所 | 不足 |
| :--- | :--- | :--- |
| `Route.traffic` | `publicWorks.ts recordRouteTraffic` | 路線全体で 1 つの値。都市を貫通する路線は両側の出入り口に同じ値が付く(`burgRoadProjection.ts` が `route.traffic` をそのまま各 leg に写す)。向き・積荷・陸路以外が無い。 |
| `TradeCorridor` | `tradeCorridorLedger.ts` | 都市ペア単位で `routeIds` と `routeHits` はあるが、**端の都市のどの出入り口を通ったか**が無い。 |
| `roads[].trafficRank` | descriptor | 上と同じ理由で、出入り口の区別が路線粒度で止まる。 |
| 0.7 年減衰 | 両台帳 | 累計の「今の勢い」しか残らず、時系列は外部で保存しない限り失われる。 |

結論: 時系列は**外部収集**で、出入り口粒度は**FMG 側に記録点を 1 つ足す**ことで解決する。

## 3. 全体構成

```
┌──────────── 実験定義 (experiment.json) ────────────┐
│ maps: 新規(seed, 設定) / 既存(.fmg) / チャンネルid │
│ advance: 期間・ストライド, extensions, settings      │
└───────────────┬─────────────────────────────────────┘
                ▼
  npm run observe -- run experiment.json        (scripts/observe.mts, 新規)
   ├─ 新規地図: 生成 (fmg:small / map:server --lab と同じ Node 生成経路)
   ├─ sim:server のチャンネルを作成 (POST /api/sim/channels)
   └─ ループ: ops advance(stride) → GET …/observe/sample → NDJSON 追記
                ▼
  data/observatory/<runId>/
     run.json, samples/<channel>.ndjson, snapshots/*.fmg(任意), ce/<burg>.json
                ▼
  npm run observe -- report <runId>   → report.html + CSV
```

- **実行系は sim:server に寄せる**。理由: チャンネル = 1 地図 1 子プロセスで隔離・再開可能、ジャーナルで再現可能、人がブラウザ(チャンネル選択ダイアログ §14)で同じ状態を見に行ける。
- `npm run sim` 単体でも同じ収集ができるように、収集関数はワーカー側のモジュール(`scripts/lib/observeViews.mts`)に置き、sim:server と sim CLI の両方から呼ぶ。
- map:server は読み取り専用の配布(人やAIへの地図共有)に使い、時間を進める主体にはしない。既存地図は map:server が持つ .fmg を `GET /api/map` で取ってチャンネルに投入できる。

## 4. FMG 側の追加: 出入り口台帳 (Approach Ledger)

### 4.1 出入り口の定義(FMG と CE で共通の鍵)

`burgRoadProjection.ts` の `approachId` をそのまま正とする:

- `burg:<b>:route:<r>:edge:<cell>` — 都市セルから最初に出る隣接セルで区別。都市を貫通する路線は両側が別 id になる。
- `burg:<b>:crossing:<c>` — 渡河施設を共有する束ねられた入口。

同じ判定を経済側でも使えるよう、`approachId` を求める部分を純関数 `approachIdForLeg(burg, routeId, exitCell, crossingId?)` として `src/services/` に切り出す(descriptor 生成と台帳の両方が呼ぶ。二重実装しない)。

路線に乗らない移動(荒野・海・川)は疑似出入り口とする:

| 種別 | id | 判定 |
| :--- | :--- | :--- |
| 海 | `burg:<b>:sea` (港が複数になれば `:harbour:<h>`, [fmg-harbour-model.md](fmg-harbour-model.md)) | 区間 `type: sea` の端 |
| 川 | `burg:<b>:river:up` / `:down` | 区間 `type: river` の端、流向で区別 |
| 野道 | `burg:<b>:open:<方位8分割>` | 路線に乗らない陸区間。方位は `entryAzimuth` と同じ計算 |

### 4.2 記録点

台帳と同じ 3 か所(`recordCaravanCorridor`・`recordMarketShipment`・国家調達の出発)で、経路の**両端**について:

- 起点側: 最初の区間の、都市セルを出る最初の点 → `outbound`。
- 終点側: 最後の区間の、都市セルに入る直前の点 → `inbound`。
- 途中で通過する都市(経路上のセルが他の都市セルと一致): その都市の入った側と出た側に `through` を加える。宿・門前の発展は通過交通でも起きるため、端と区別して残す。

セルは `TradeRoutePoint` の 3 要素目、無ければ `findCell(x, y)`。

### 4.3 データ

```ts
// src/extensions/economy/generators/approachLedgerTypes.ts (新規)
export interface ApproachTraffic {
  approachId: string;
  burgId: number;
  routeId: number | null;
  mode: "land" | "river" | "sea" | "open";
  /** 0.7 年減衰の累計(TradeCorridor と同じ保持率)。 */
  inbound: { departures: number; cargoSlots: number; value: number };
  outbound: { departures: number; cargoSlots: number; value: number };
  through: { departures: number; cargoSlots: number };
  /** 上位の品目(cargoSlots)。 */
  goodsSlots: Record<string, number>;
  /** 相手都市(cargoSlots 上位 8)。 */
  partners: Record<string, number>;
}
```

- 保存先は economy slice の `approachTraffic`(都市 × 出入り口数なので、都市 200 なら 1000 件前後)。減衰は `decayTradeCorridors` と同じ年次で行う。
- descriptor の `roads[]` には `approachTraffic`(上記の要約)を追加し、既存の `traffic`/`trafficRank` は残す。CE 側の利用切り替えは §7.3。
- **シミュレーション結果を変えない**: 台帳は記録のみで、どのシステムも読まない(v1)。golden hash は economy slice を含むので更新が必要になるが、`world` の他の値が一致することを `simGoldenDiff` で確認する。

## 5. 収集 API (sim:server への追加)

`GET /api/sim/channels/:id/observe/...`(子プロセスで `observeViews.mts` を実行。読み取りのみ):

| パス | 内容 |
| :--- | :--- |
| `observe/sample` | 1 回分の標本(§6)。`?detail=burgs,routes,approaches,corridors,markets` で絞る |
| `observe/approaches[?burg=b]` | 出入り口台帳の生値 |
| `observe/routes` | 路線ごと `traffic`・`pavedShare`・`group`・長さ・通過回廊数 |
| `observe/corridors[?top=N]` | 交易回廊(既存台帳)と `listCorridorNeeds` |
| `observe/burgs/:b/growth` | その都市を CE 生成し、`UrbanGrowthPlan.regions` を approachId ごとに集計(§7) |

ops は既存の `advance` を使う。長期実行のため `{"type":"advance","months":N,"sampleEvery":{"months":1}}` を追加し、子プロセス内でストライドごとに標本を取り `data/channels/<id>/observe.ndjson` に追記する(HTTP 往復を年×12 回しなくて済む。§5 の個別 GET は対話・デバッグ用)。

## 6. 標本スキーマ (NDJSON 1 行 = 1 時点 × 1 チャンネル)

```json
{
  "v": 1, "runId": "r20261017-a", "channel": "world-3", "revision": 41,
  "date": "1853-07-01", "elapsedDays": 181,
  "world": { "population": 0, "burgs": 0, "treasury": 0, "caravansActive": 0, "shipmentsInFlight": 0 },
  "burgs":  [{ "id": 12, "pop": 0, "market": 3, "port": true, "walls": true, "capital": false }],
  "routes": [{ "id": 18, "group": "roads", "traffic": 0, "pavedShare": 0 }],
  "approaches": [{ "id": "burg:12:route:18:edge:1413", "in": 0, "out": 0, "through": 0, "slots": 0, "value": 0, "topGoods": ["grain"] }],
  "corridors": [{ "a": 12, "b": 40, "slots": 0, "mode": { "land": 0, "river": 0, "sea": 0 }, "delay": 0, "threat": 0 }]
}
```

- 値は**減衰後の累計**(台帳の値そのもの)と、前標本との差分 `Δ` を集計時に出す(差分=その期間の実流量)。
- 地図の静的情報(セル・路線形状・都市座標・出入り口の方位)は run 開始時と路線網が変わった時(Public Works の昇格)だけ `static.json` に出し、毎標本には入れない。
- 1 地図 200 都市・10 年・月次で約 120 行 × 数百 KB。SQLite 等は使わず NDJSON + CSV(ヘッドレス統計ランナーの設計と同じ方針)。

## 7. 「発展しやすい出入り口」の測り方

### 7.1 FMG 側の指標(毎標本)

出入り口 `k` について、期間の差分から:

| 指標 | 式 | 意味 |
| :--- | :--- | :--- |
| 流量 | `Δ(in+out).cargoSlots` | 物が通る |
| 通過 | `Δthrough.departures` | 宿・厩舎の需要 |
| 都市内占有率 | `流量_k / Σ_j 流量_j` | その都市で主の門か |
| 安定度 | 占有率の期間間の順位相関(Kendall τ) | 一時的な交易か、恒常的な街道か |
| 多様度 | `goodsSlots` のシャノン指数 | 市場的(多品目)か、専用路(穀物だけ等)か |
| 相手の重み | `Σ partners × 相手都市人口` | 大都市へ向く門か |

**発展ポテンシャル** `P_k = 占有率 × (0.5 + 0.5·安定度) × log(1+流量)` を初期定義とし、係数は §7.3 の CE 実測で較正する(推定値のまま固定しない)。

### 7.2 CE 側の実測(選んだ時点だけ、重い)

指定時点のスナップショットについて、対象都市を Node の CE(ce:perf と同じ jsdom + Vite module runner)で生成し、approachId ごとに:

- `UrbanGrowthPlan.regions` のうち `kind: approachRibbon` の `budget`・`length` の合計。
- 門前宿(`gateInnPlacement.ts`)が置かれたか、石畳化(`COBBLE_RANK`)されたか。
- その門の外の住戸数(lot 数)。

を `ce/<burg>@<date>.json` に保存する。

### 7.3 較正と検証

- 目的は「FMG の交通量から、CE がどこを伸ばすかを当てられるか」。`P_k` の都市内順位と CE の ribbon budget 順位の一致率(Top-1 一致・Spearman)を報告する。
- 現状の CE は路線粒度の `trafficRank` を使うため、貫通路線の両門が同じ扱いになる。§4 の台帳ができた後、CE の `roadUse()` を `approachTraffic` 優先に切り替える案を**別段階**で比較する(切り替え前後で同じ run を CE 再生成し、一致率と見た目の差を並べる)。
- 時間変化の検証: 10 年進めた後の `P_k` 上位の門が、Public Works の道路昇格・舗装(`pavedShare`)を受けているか(FMG 側の自己整合)。

## 8. 実験定義とレポート

```json
// experiments/approach-baseline.json
{
  "id": "approach-baseline",
  "maps": [
    { "kind": "new", "seeds": [101, 102, 103], "options": { "culturesSet": "european", "settlementPattern": "standard", "cells": 10000 } },
    { "kind": "file", "path": "maps/paia.fmg" },
    { "kind": "channel", "id": "world-1", "fork": true }
  ],
  "extensions": ["economy", "nobility"],
  "timeline": "new",
  "warmup": { "years": 2 },
  "advance": { "years": 10, "sampleEvery": { "months": 1 } },
  "ceProbe": { "at": ["+2y", "+10y"], "burgs": { "topByPopulation": 10, "ids": [] } },
  "workers": 3
}
```

- 新規地図は Cultures set を `european`、Settlement pattern を Standard に固定する既定値を持つ(Fantasy 系だと国家・人口が成立せず測れない。AGENTS.md の動作確認設定)。
- `warmup` の期間は標本を捨てる(初期在庫・初期キャラバンの過渡応答を除く)。
- `fork: true` は既存チャンネルを複製して進める(元のチャンネルを汚さない)。
- 歴史モード/Fast-Forward([advance-time-history-mode.md](advance-time-history-mode.md) / [advance-time-fast-forward.md](advance-time-fast-forward.md))は経済決済をモックするため**交易台帳が実測にならない**。実験定義で有効にした場合は run.json に記録し、レポートで「モック期間」として標本を除外する。
- `report.html`: 都市ごとの出入り口の方位ローズ(流量)、時系列、`P_k` と CE ribbon の散布図、地図全体の路線使用量の上位一覧。CSV(`approaches.csv`, `routes.csv`, `corridors.csv`)も出す。

## 9. 段階計画

| 段階 | 内容 | 完了条件 |
| :--- | :--- | :--- |
| O0 | 既存値だけで収集: `observe/sample`(routes・corridors・burgs)、`advance` + `sampleEvery`、`npm run observe -- run/report` の骨格 | fixture を 1 年月次で回し 12 行、`npm run sim` の同条件とハッシュ一致 |
| O1 | `approachIdForLeg` の切り出し(descriptor の approachId が変わらないことをテスト) | 既存 CE テスト・descriptor テストが緑 |
| O2 | 出入り口台帳(§4)と標本の `approaches` | 貫通路線の両門に別の値が付く地図で確認。economy 以外の golden 一致 |
| O3 | CE プローブ(§7.2)と一致率レポート | 3 シード × 上位 10 都市で一致率を出す |
| O4 | CE の `roadUse()` を `approachTraffic` 優先にする比較実験 | O3 の一致率と見た目を並べて採否を決める |

## 10. リスクと未決事項

- **Market 単位の端**: キャラバンの起点・終点は Market の中心 Burg。周辺の都市から市場へ集まる流れは経路上の通過として数えるが、市場町の門に過大に集まる。O2 でどの程度か実測する。
- **路線網の変化**: Public Works の昇格で route id が変わると approachId も変わる。`static.json` の再出力時に旧→新の対応表を出す(対応が取れない場合は切れ目として扱う)。
- **CE プローブの所要時間**: 巨大都市は数秒〜十数秒([ce-giant-city-fastest-generation-investigation.md](ce-giant-city-fastest-generation-investigation.md): 6 s 程度)。既定は上位 10 都市・2 時点に絞る。
- **河川・橋**: 川を渡る出入り口の発展を評価する場合も、橋の可否は `bridgeSkewPolicy.ts` の判定に従う。上限外で渡し船になる地点は `ferryCrossings` として別に表示し、橋前提の発展候補には含めない。
- 標本の決定性: 収集は読み取りのみだが、`observe/burgs/:b/growth` は CE と同じく道の収束処理をワールドに反映する(§16 の `/site` と同じ)。実験中は**スナップショットの複製**に対して実行し、進行中のチャンネルには触れない。

## 11. O4 実装と結果(2026-10-17)

- descriptor: `roads[].approachTraffic = { cargoSlots, through, share }`(`src/services/approachId.ts attachApproachTraffic`)。`burgEconomyExtensions.getBurgApproachTraffic`(Economy が登録、CLI では読み込んだ slice から `useLoadedApproachLedger`)。`traffic`/`trafficRank` と違い urban morphology でも descriptor には残す。共有渡河 `crossing:<c>` は束ねた路線の台帳行を合算する。
- CE: 生成設定 `approachGrowthSource: "neighbors" | "traffic"`(既定 neighbors)。`traffic` のとき `approachGrowthWeight` は隣接都市人口の代わりに「都市内で最大の出入り口に対する share 比」を使う(道路種別係数・外交による閉鎖は維持)。既定では `generateCity` が `approachTraffic` を入力から取り除くため、既存の都市は変わらない(baseline の neighbors 結果が O3 と完全一致)。
- 比較: `npm run observe -- reprobe <run> [--variants neighbors,traffic] [--svg]` が保存済みスナップショットを両設定で再生成し、`ce/<probe>/<burg>-<variant>.svg` とレポートの変化量を出す。`observe/burgs/:b/growth?variants=neighbors,traffic` でも同じ。
- baseline(O3 と同じ 58 都市・時点)の結果:

| CE 設定 | P Top-1 | P ρ | 路線 traffic Top-1 | 路線 traffic ρ |
| :--- | :--- | :--- | :--- | :--- |
| neighbors(現行) | 37% (n=51) | −0.21 (n=27) | 64% (n=11) | 0.10 (n=20) |
| traffic | 75% (n=48) | 0.26 (n=25) | 100% (n=9) | 0.19 (n=18) |

  - 切り替えで最大 ribbon の門が変わった都市 28/58、ribbon 内 lot の平均 59% が別の門へ移った(見た目の変化は大きい)。
  - traffic 設定でも一致率が 100% にならないのは、ribbon budget が面積の可用性(`available`)と配分(`allocateGrowthBudget`)でも決まるため。
- 目視確認(`node scripts/observeSvgDiff.mjs <ce-dir>` が差分 SVG と index.html を出す)で分かったこと:
  - 58 組中 30 組は SVG が完全に同一。差がある 28 組でも変わる家は最大 100 戸程度(全 57,807 棟中、城外の住戸は両設定とも約 2%)。
  - 上の一致率は ribbon の **budget**(と帯内の lot 数)で測っており、実際に描かれる城外の家とは一致しない。例: burg 72 は traffic 設定で最も交通量の多い門に budget 778 が付くが、城外住戸は 71 → 17 に減り、残りは城内に回った。
  - したがって O4 の効果を判断する指標は「門ごとの城外の家の数」にすべきで、budget ベースの一致率は過大評価。プローブの指標を差し替えるまで採否は保留。
- 採否は上記の指標修正、SVG の目視、全球規模での再測定の後に決める。採用する場合は CE UI の設定追加と既定値の切り替え(既存都市の見た目が変わる)の扱いを別途決める。
