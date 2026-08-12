# Seasons: 季節シミュレーション仕様

本ドキュメントは、地軸傾斜（23.5°、地球相当）と緯度から導かれる春夏秋冬の季節サイクルと、それが
農業生産・穀物価格・冬季の道路閉鎖・海流の4つのゲームプレイ要素へどう波及するかをまとめた仕様書です。
`docs/simulation/advance-time.md` の年/月/日クロック（`src/generators/timeEngine.ts`）を基盤としており、
季節そのものは新しい時計を持たず、既存の `simulationContext.currentMonth`/`currentDay` から都度導出されます。

## 0. 設計方針

- **季節はグローバルな単一値ではない**: マップは南北両半球にまたがりうるため、「今は冬だ」という判定は
  常に「どの緯度で」を伴う。`simulationContext.worldSeason`（後述）はカレンダーUI表示専用の代表値であり、
  経済・道路・海流の各ロジックは自分自身の緯度で `getSeason(latitude, month)` を都度呼ぶ。
- **既存の仕組みを流用する**: 気候（`temperatureEquator`/`temperatureNorthPole`/`temperatureSouthPole`）、
  緯度変換（`getLatitude()`）、tick フック（`registerTimeTickHook`）、経路グラフの毎tick再構築
  （`landRouteGraph.ts`/`seaRouteGraph.ts`）など、既存のインフラに新規ロジックを薄く載せる形で実装している。
  新しい永続状態やUIはカレンダーの季節ラベル表示のみ。

## 1. 季節計算コア: `src/utils/seasonUtils.ts`

依存を持たないリーフモジュール（`context/`・`generators/`・`extensions/` を import しない）。
どのレイヤーからでも安全に import できるよう意図的にこう設計している。

| 関数 | 説明 |
| :--- | :--- |
| `isLeapYear(year)` / `getDaysInMonth(year, month)` | グレゴリオ暦のうるう年・月日数計算。元は `timeEngine.ts` にあったが、この機能追加時にこちらへ移動し、`timeEngine.ts` が import する形にした（重い方のモジュールが軽い方に依存する、正しい依存方向にするため）。 |
| `getDayOfYear(year, month, day)` | 1月1日を1とする通日。 |
| `getSolarDeclinationDeg(dayOfYear)` | 太陽赤緯の近似式 `-23.5° * cos(360/365 * (day+10))`。北半球の夏至（day≈172）付近で+23.5、冬至（day≈355）付近で-23.5になる。 |
| `getSeasonalAmplitude(latitudeDeg, climate)` | 緯度ごとの季節による気温振れ幅（°C）。赤道で0、極で最大になる `sin(\|latitude\|)` 型。振れ幅の大きさはマップ自身の `temperatureEquator`/`temperatureNorthPole`/`temperatureSouthPole` の差から算出するため、ユーザーが設定した気候と整合する（新規の無関係な定数を追加していない）。 |
| `getSeasonalityStrength(latitudeDeg)` | `[0,1]` に正規化された緯度別季節強度。赤道で0（一年中ほぼ一定の気候）、極で1（最大の季節差）になる、気候設定に依存しない `sin(\|latitude\|)` のみの関数。`getSeasonalAmplitude` が気温オフセット用に気候差でスケールされるのに対し、こちらは食料生産など「季節性そのものの強さ」を緯度だけでブレンドしたい消費者向け。 |
| `getSeasonalTemperatureOffset(latitudeDeg, year, month, day, climate)` | `grid.cells.temp`（生成時に一度だけ計算される年間平均気温、`src/main.ts` の `calculateTemperatures()`）に**足し合わせる**用の符号付きオフセット。既存の静的な `temp` 配列自体は書き換えない。現状このオフセットを実際に読み取っている消費者はまだいない（将来、季節による気温表示や氷結演出を追加する際のためのビルディングブロックとして用意）。 |
| `getSeason(latitudeDeg, month): "spring" \| "summer" \| "autumn" \| "winter"` | 北半球基準の気象学的3か月区切り（12-2月=冬、3-5月=春、6-8月=夏、9-11月=秋）を、南半球（`latitudeDeg < 0`）では反転させる。連続的な太陽赤緯ではなく離散的な4区分にしているのは、農業・道路の各ロジックが「今は冬か」という単純な判定を必要とするため。 |
| `getCurrentDirection(month): 1 \| -1` | 海流の季節反転を表す**単一のグローバルな**東西バイアス（緯度帯別ではない）。+1=春夏（東向きが順風）、-1=秋冬（西向きが順風）。ユーザーの要望どおりの単純な全域反転モデルで、実際の貿易風のような緯度帯別の複雑さは意図的にスコープ外にしている。 |

## 2. `simulationContext.worldSeason`（表示専用）

- `src/context/simulationContext.ts` に追加したフィールド。マップの代表緯度（`mapCoordinates.latN`/`latS` の中点）
  と `currentMonth` から `timeEngine.ts` の `advanceTime()`/`syncSimulationClockFromOptions()` 内で
  `updateWorldSeason()` により再計算される。
- 用途は `src/renderers/draw-calendar.ts` のカレンダーオーバーレイに季節ラベルを追加することのみ
  （`"{year} {era} · {Season}"`）。`window.fmg.simulation.worldSeason` としても読み取り可能。
- **経済・道路・海流の各ロジックはこのフィールドを読んではいけない**。マップが両半球にまたがる場合、
  代表緯度の季節と実際のセル/市場の季節が食い違うため。各消費者は自分の緯度で `getSeason()` を呼ぶこと。

## 3. 農業と穀物価格の季節サイクル（`src/extensions/economy/`）

> **移行予定（2026-08-12）**: この節の `food` タグ一律の季節曲線は現在の暫定実装である。主食 Food Ledger の地図全体四半期補正とは別系統であり、果樹・家畜まで同じ秋収穫曲線を受け得る。両者を、赤道横断地図にも対応する少数の季節地域とセルの農業気候ゾーン別・作物別・必要な作付コホート別の月次作物暦へ統合する。セル別の月次気候再計算は行わず、`seasonRegion × zone × crop × cohort` の暦キャッシュを参照する。詳細は [季節別作物暦・農繁期・混合農業労働](../plan/seasonal-crop-calendars.md) を参照。

戦時の影響は、生産量や一律の飢餓死亡ではなく、実際に進行中の紛争による市場の食料価格上昇として扱う。

- `src/extensions/economy/generators/production-utils.ts` の `getCellProduction()` 内、既存の
  `modifier(good)` 合成チェーン（`getModifiers` × `getDepletionMultiplier`）に
  `getSeasonalProductionMultiplier(good, cellId)` を追加した。
- `tags.includes("food")` を持つ財（Grain 等）にのみ効く。セルの緯度と現在月から季節を求め、
  `SEASONAL_FOOD_PRODUCTION_MULTIPLIER`（spring 0.3 / summer 0.3 / autumn 3.0 / winter 0.4、
  4季節の平均がちょうど1.0）を出力量に掛ける。年間の総生産量は季節無視版と変わらず、
  分布だけが秋（収穫期）に集中する。
- **赤道付近は季節差がフラットになる**: 上記のテーブルは温帯の「秋に一括収穫、他の季節は低調」という
  サイクルをモデル化したものであり、赤道直下のような一年中温暖な気候にはそのまま当てはまらない。
  そのため `getSeasonalityStrength(latitude)`（`src/utils/seasonUtils.ts`、赤道で0・極で1の
  `sin(\|latitude\|)`）でテーブルの値を `1 +（表の値 − 1）× strength` の形で1.0（平坦）方向へ
  線形ブレンドしている。この式は `strength` の値によらず4季節の平均を常にちょうど1.0に保つ
  （表自体の平均が1.0であるため）。結果として、高緯度セルは実質フル振幅の季節サイクルを維持しつつ、
  赤道付近のセルはほぼ一年中同じ生産量になる。
- **価格側には新しいコードを追加していない**。`markets-generator.ts` の `initializeMarketPrices()` に
  既にある `ratio = (demand+smoothing)/(stock+smoothing)` という需給比の価格式が、秋の在庫急増を
  自動的に安値として、端境期（収穫直前）の在庫枯渇を自動的に高値として反映する。これは意図的な設計判断:
  在庫駆動の値動きで十分であることを `seasonalPricing.integration.test.ts`（実際の
  `collectRuralProduction()`/`initializeMarketPrices()` を使った12〜24か月シミュレーション）で確認済み。
  ただし `PRICE_FLOOR_FACTOR`/`PRICE_CEILING_FACTOR`（0.25倍〜3倍）の値幅次第では収穫直後〜端境期の間、
  価格が底値付近に張り付く期間が長く出ることがある（在庫が需要に対して極端に多いケース）。将来これが
  「変動が微妙すぎる」方向で問題になった場合は、`customerBuyPrice()`/`customerSellPrice()`
  （`markets-generator.ts:706-714`、`getWarPriceModifier()` と同じ読み取り時オーバーレイのパターン）に
  季節価格モディファイアを追加する拡張余地を残してある。

## 4. 冬季の道路閉鎖（`src/generators/landRouteGraph.ts`）

- `buildLandRouteGraph(pack, seasonal?)` の第2引数（`SeasonalRouteContext = { month, mapCoordinates, graphHeight }`）
  を省略すると常時開通（旧挙動）のまま。`regimentMovement.ts` の `advanceAllRegimentMovement()` が
  唯一の呼び出し元で、`worldContext.options.month` を渡している。
- 各ルート区間ごとに、区間中点の緯度（`getLatitude`）と両端セルの標高の高い方（`pack.cells.h`）を見て、
  **冬季**かつ「高緯度（`WINTER_ROAD_CLOSURE_LATITUDE = 55°` 以上）」または
  「高標高の山道（`WINTER_ROAD_CLOSURE_ELEVATION = 60` 以上）」のいずれかに該当すれば、
  その区間を経路グラフから丸ごと除外する（`Infinity` センチネルではなく、単に `addEdge` を呼ばない）。
- 既存の仕組みをそのまま再利用: `findLandRoutePath()`（Dijkstra）が閉鎖区間を自然に迂回し、
  迂回路もなければ `regimentMovement.ts` の既存オフロードフォールバック
  （`findOffRoadLandPath` + `OFF_ROAD_SPEED_MULTIPLIER = 0.6`）が効く。新規の移動コストモデルは追加していない。
- **既知の制約**: これは「経路の再計画（新規行軍の立案）」にのみ影響する。`advanceAlongPath()` は
  既に確定した `r.path` を生ピクセル距離で歩くだけでグラフを再参照しないため、冬が来た瞬間に
  山道を行軍中の部隊が強制停止・迂回することはない（次に再計画されるまでそのまま進む）。
  「雪で道が塞がる」の意味を「新規の行軍計画が避けるようになる」に限定したv1のスコープであり、
  「行軍中に足止めされる」を実装する場合は `advanceAlongPath()` のループ内で区間ごとの通行可否を
  都度チェックする改修が別途必要（本仕様では未実装）。

## 5. 海流の季節反転（`src/generators/regimentMovement.ts`）

- **`seaRouteGraph.ts` の辺の重みではなく、`advanceAlongPath()` の予算消費ロジックに直接実装している。**
  理由: `seaRouteGraph.ts` に保存された距離は経路の**選択**（`findSeaRoutePath`）にしか使われず、
  `advanceAlongPath()` は実際の移動時に `cells.p` から生ピクセル距離を自前で再計算するため、
  経路グラフの辺重みをいくら変えても航行速度には一切影響しない（設計時にPlanエージェントのレビューで
  発見した重要な訂正点）。
- `advanceAlongPath(pack, r, budget, onCellEntered?, month?)` に `month` 引数を追加。
  艦隊（`r.n` が truthy）の場合のみ、区間ごとに `getCurrentCostMultiplier(fromPoint, toPoint, month)`
  （東西成分と `getCurrentDirection(month)` の一致/不一致で `CURRENT_FAVORABLE_MULTIPLIER = 0.7` /
  `CURRENT_UNFAVORABLE_MULTIPLIER = 1.4` を返す。南北方向のみの移動は影響なし＝倍率1）を求め、
  その区間の**予算消費**（`remainingOnEdgeCost = (edgeLength - progress) * costMultiplier`）にだけ
  適用する。`r.edgeProgress`/`r.x`/`r.y` は常に実距離（ピクセル単位）のまま保つため、位置情報を
  参照する他のコードには影響しない。
- 陸上部隊（`r.n` が 0）や `month` 省略時は倍率1（旧挙動と完全に同じ）。
- **v1のスコープ外**: 緯度帯別の貿易風のような複雑な海流モデルは実装していない（ユーザーの要望どおり、
  単純な全域季節反転のみ）。`seaRouteGraph.ts` の辺重みへの方向性バイアス追加（経路選択自体も海流に
  有利な航路を好むようにする副次的改善）や、`tradeOpportunityEstimator.ts` の海上輸送コストへの季節反映は
  将来の拡張候補として未着手。

## 6. テスト

| ファイル | 内容 |
| :--- | :--- |
| `src/utils/seasonUtils.test.ts` | 通日計算・太陽赤緯・季節振れ幅・`getSeasonalityStrength`（赤道0/極1）・`getSeason`/`getCurrentDirection` の南北半球反転。 |
| `src/extensions/economy/generators/production-utils.test.ts` | 高緯度（~80°）では秋の穀物生産量が夏の5倍を超えること、赤道付近（~2°）では夏秋の差が1.5倍未満に収まる（ほぼフラット）ことを確認。 |
| `src/extensions/economy/generators/seasonalPricing.integration.test.ts` | 実際の `collectRuralProduction()`/`initializeMarketPrices()` を24か月分回し、収穫直後（12月）が端境期（8月）より安値になることを確認するend-to-endテスト。 |
| `src/generators/landRouteGraph.test.ts` | 冬季に高緯度・高標高区間がグラフから除外され、夏季・季節指定なしでは開通したままであることを確認。 |
| `src/generators/regimentMovement.test.ts` | 同一予算で東航時、順風の月が逆風の月より進む距離が大きいこと、陸上部隊・月省略時は影響を受けないことを確認。 |
