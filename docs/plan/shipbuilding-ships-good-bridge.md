# Shipbuilding Phase 10 — Ships Good の船級分割と造船余剰在庫

| 項目 | 内容 |
| :--- | :--- |
| Status | 計画中（設計確定済み、未実装） |
| Parent | [shipbuilding.md](shipbuilding.md) Phase 10（新規追加予定） |
| Prerequisite | Phase 3（建造キュー・所有者判定）, Phase 8（[資材消費ゲート](shipbuilding-material-consumption.md)）, [ships.md](ships.md) §4（港湾収容力） |
| Scope | Economy の `Ships` Good を船級別3種へ分割し、陸路輸送を禁止し、造船所の余剰キャパシティから在庫を供給し、港の収容上限に達したら生産を止める。既存の `owner: "state"/"market"` ShipHull ライフサイクル（航海訓練・偽装通商・諜報, [ships.md](ships.md) §4.5）には一切触れない。 |

## 1. 目的・経緯

`docs/temp/ships.md` の調査メモを起点に、Economy の `Ships` Good（`goods-generator.ts`）と Shipbuilding の
`ShipHull`（`shipyardQueue.ts`）が無関係な2つの数字になっている問題を洗い出した。本 Phase はそのうち
「一般に売買される汎用船舶在庫」側だけを直す。「既存 ShipHull を手放す・買い替える」メカニクス（下記 §2
非目標3）は意図的に後続 Phase へ先送りする。

### 現状の問題点（根拠つき）

1. **陸路輸送が可能** — `isGoodTradePermitted()`（`tradeOpportunityEstimator.ts:87-89`）と
   `estimateSpeculativeTrade()`（同ファイル:103-125）はルート区間が陸(`land`)か海(`sea`)かを一切見ない。
   `Ships` の `trade` プロファイルは `weight: 5, bulk: 5`（`goods-generator.ts:1108`）で最大値だが、これは
   輸送コスト計算に効くだけで、隊商(caravan)による陸路運搬そのものは禁止されていない。
2. **実体と無関係な湧き production** — `Ships` は `recipes: [{ Wood: 2, Sails: 2, Ropes: 2, Tar: 1 }]`
   （`goods-generator.ts:773`）を持つため、`production-generator.ts` の汎用レシピ処理経由で、実際の
   Shipyard が存在しない生産地でも在庫が生まれる。`shipyardQueue.ts` の建造完了は `Ships` Good に一切
   触れておらず（`docs/plan/shipbuilding.md` 4章に明記の通り意図的に分離）、2つの「船の数」が完全に独立。
3. **単一SKU問題** — `Ships` は `value: 80` の1種類のみ（`goods-generator.ts:766-777`）で、
   `shipClasses.ts` の Sloop/Caravel/Galleon 3ティアや、`portCapacity.ts` が既に持つ small/medium/large
   の区分と対応しない。商人がティアを跨いで買い替える・追加する対象が小型船1種類しか存在しない。
4. **収容上限が存在しない** — `PortCapacity`（`portCapacity.ts`）は表示専用の導出値で、建造・在庫のどちらも
   制約しない（[ships.md:162-164](ships.md#L162)にも明記: 平時はほぼ全艦が `voyage` 状態のため港はほぼ
   埋まらず、この収容力は元々「動員中に港へ留まっている艦数」の表示にしか使われていない）。
5. **オーナーシップの衝突** — `ShipyardOwner` は `"state" | "market"` の2種類のみ（`shipyardQueue.ts:23`）。
   `owner: "market"` の船体は `shipVoyages.ts` が「常時稼働し毎年収入を生む恒久資産（商船隊）」として
   実装済み（[ships.md §4.5](ships.md#L141)）。ここに手を入れず、かつ「商人が古い船を手放し新しい船を
   買う」体験を提供する必要がある。

## 2. 非目標（Phase 10のスコープ外）

1. 既存 `owner: "state"/"market"` の `ShipHull` ライフサイクル（`shipVoyages.ts` の航海訓練・偽装通商・
   諜報・収入メカニクス）の変更。
2. 既存の商船隊 (`owner: "market"`) を手放す・売却する・買い替えるメカニクス。これは合意済みの将来課題
   （§7「残る調整ポイント」参照）であり、別 Phase（Phase 11 仮称）で扱う。
3. 港湾収容力そのものの拡張機能（入江・内海の遮蔽による係留、船専用の非集落港湾施設の建設など）。
   アイデアとしてのみ記録し、設計・実装はしない（§8）。
4. 大砲・戦列艦ルート、および `shipClasses.ts` のティア数自体の変更。

## 3. 採用する設計

### 3.1 `Ships` Good を船級別3種へ分割

`shipClasses.ts` の3ティアと1:1対応する3つの Good に置き換える。名前を `SHIP_CLASSES[].name` とそのまま
一致させ（`Sloop` / `Caravel` / `Galleon`）、`shipClassId` によるルックアップを両システムで共有できるように
する。

| Good name | 対応 shipClassId | buildPointsRequired | value |
| :--- | :--- | ---: | ---: |
| Sloop | `sloop` | 10 | 80（既存値を維持） |
| Caravel | `caravel` | 25 | 200 |
| Galleon | `galleon` | 60 | 480 |

`value = buildPointsRequired * VALUE_PER_BUILD_POINT`（`VALUE_PER_BUILD_POINT = 8 = 80 / 10`）として算出し、
ハードコードではなく `shipClasses.ts` の値から導出する。将来 `buildPointsRequired` が変わっても Goods 側の
価格が自動追従する。

- 3種とも `recipes` は持たせない（問題2の解消）。`chance: 0` は維持（受動的な biome 生成はしない）。
- `tags: ["naval"]`、`warEconomyType: "military"` は維持。`demandCoverage.military` はティアの
  `buildPointsRequired` 比で按分する（暫定: Sloop 0.5 を基準に按分）。
- `GOOD_TRADE_PROFILES`（`goods-generator.ts:1055-1127`）の `Ships` エントリを3エントリに複製・分割する。

### 3.2 `seaOnly` フラグ（陸路輸送の禁止）

`Good` に `seaOnly?: boolean` を追加し、3つの船 Good すべてに設定する。`isGoodTradePermitted()` に
「`seaOnly` の場合、ルート全区間が `"sea"` でなければ不可」を追加する。`naval` タグは他の実在する原材料
（Sails/Tar/Ropes など、実際に陸路輸送できるもの）にも付いているため判定には使わない（既存タグの意味を
変えない）。

### 3.3 造船所の余剰キャパシティによる在庫供給（新設 `owner: "shipyard"`）

既存の `owner: "state"/"market"` キュー・`_hulls`・`_completedHulls` には一切触れない。`ShipyardOwner` に
第三の値 `"shipyard"` を追加し、既存の `_queues`/`getMaterialsForWork()` と同じ仕組みを再利用した、
並行する建造ストリームとして実装する。

- **対象burgは `determineOwner(burg) === "market"` のみ**。`"state"`（首都/城塞の国家造船所）では
  このストリームを一切走らせない。国家は自らの艦隊拡張に必要な分だけを既存キューで作り続け、それ以外は
  作らない。国家が有事に船を急ぎ増やしたい場合は、既存の商船を接収する、という設定上の説明のみで済ませ、
  ゲームメカニクスとしては実装しない（§2非目標に準じる — Phase 7の外国干渉と同様、実装を最小に留める
  判断）。
- 割り当てる build points は、その burg の `market` キューがその tick で消費しきれなかった余剰分のみ
  （`SHIPYARD_BUILD_POINTS_PER_YEAR` のうち、Phase 8の資材ゲートや進捗上限で消費されなかった残り）。
  固定割合の事前配分はしない。
- この `"shipyard"` ストリームが完成させた分は `ShipHull` を作らず、その burg の市場の対応する
  `Ships`階級Good の在庫に直接 +1 する（`_hulls` に一切触れないため、「成功したら減算」のような曖昧な
  状態遷移は発生しない）。
- **建造対象ティアの選定方針（需要トラッキングを作らない簡易ヒューリスティック）**:
  - Galleon（大型）はこのストリームでは**常に対象外**。買い手が付くか不確実な高額船を供給側の都合だけで
    作らない。Galleonは既存の `state`/`market` キューが自らの艦隊のために建造する場合のみ発生する。
  - 既定は Sloop（小型）を作る。
  - 例外として、Caravel（中型）が解禁済み **かつ** その市場の Sloop 在庫が 0 より多い **かつ** Caravel
    在庫が 0 の場合のみ、その tick は Caravel を作る。
  - 一度 Caravel を1隻在庫化したら、その在庫が 0 に戻るまで（＝売れる/消費されるまで）は再び Caravel を
    作らない。売れ残っている間は Sloop 側に戻る。これにより供給過多で売れ残ることを自然に回避する。

### 3.4 港の収容上限による生産停止

`portCapacity.ts` の `computePortCapacity()` が返す `small/medium/large` を、既存の「動員中に港へ留まって
いる艦数」上限（[ships.md §4.5](ships.md#L162)）と**同じ物理的な係留資源**として扱う。ティアごとに:

```text
使用中 = (そのburgのdocked状態ShipHull数、そのティア) + (その市場のShips階級Good在庫数、そのティア)
使用中 < portCapacity[tier] の間だけ owner: "shipyard" ストリームはそのティアのbuild pointsを積む
```

- **上限に達したらそもそも製造しない**（未着手のまま保留するバックログは持たない。合意済み）。
- 在庫は既存の軍事需要消費（`demandCoverage`）や `seaOnly` 交易輸出で自然に減るため、それに応じて
  生産が自動的に再開する。
- 副次効果として、戦時に国家が艦隊を `docked`（動員）へ召還すると同じ港の係留資源を消費するため、
  Goods向けの新造船生産がその分圧迫される。これは意図した挙動として許容する（有事に港が軍用優先に
  なる、という現実に即した自然な結果）。平時はほぼ全艦が `voyage` で港を埋めないため
  （[ships.md §4.5](ships.md#L162-164)）、通常時にこの圧迫はほぼ発生しない。

## 4. 実装マイルストーン

### M10.0 — Goods カタログの分割

- `goods-generator.ts`: `Ships` を `Sloop`/`Caravel`/`Galleon` の3エントリへ分割。`recipes` を削除し、
  `value` を `shipClasses.ts` 由来の計算値にする。`seaOnly: true` を追加。
- `GOOD_TRADE_PROFILES` を3エントリに複製。
- unit test: 既存 `Ships` を参照するテストの更新、3エントリの value/trade profile 検証。

### M10.1 — `seaOnly` ルート判定

- `Good` 型に `seaOnly?: boolean` 追加。
- `tradeOpportunityEstimator.ts` の `isGoodTradePermitted()` にルート全区間 `sea` 判定を追加。
- unit test: 陸路区間を含むルートで3船級すべてが不許可になること、既存の他 Good の陸路取引が
  影響を受けないこと。

### M10.2 — `owner: "shipyard"` 余剰生産ストリーム

- `shipyardQueue.ts`: `ShipyardOwner` に `"shipyard"` を追加。既存 `_queues`/`_hulls` とは別の内部状態
  （例: `_surplusQueues: Map<burgId, ...>`）で管理し、`determineOwner(burg) === "market"` の burg でのみ
  動作する。完成時は `ShipHull` を作らず市場在庫 +1 のリクエストを Economy へ CustomEvent で通知する
  （`ShipbuildingMaterialRequest` と同じ「型だけ共有・直接import しない」契約パターンを踏襲）。
- ティア選定ヒューリスティック（Galleon対象外、Sloop既定、Caravel在庫0かつSloop在庫>0の時のみCaravel）
  を実装する。
- unit test: 既存 `state`/`market` キューの挙動が無変更であること、余剰ストリームの完成が
  `_hulls`/`_completedHulls`/`shipVoyages.ts` に一切影響しないこと、state所有burgではこのストリームが
  一切動作しないこと、Galleonが選ばれないこと、Caravel在庫がある間はCaravelを作らずSloopに戻ること。

### M10.3 — 収容上限ゲート

- `portCapacity.ts` の計算結果を、`docked` 状態 `ShipHull` 数（ティア別）とGoods在庫数の合算に対する
  上限として Economy 側から参照できるようにする（burgId → marketId解決含む）。
- 上限到達時に `owner: "shipyard"` ストリームが build points を積まないことを保証。
- unit test: 在庫のみで上限に達している場合／dockedなShipHullとの合算で上限に達している場合の両方で
  生産が止まること、在庫が減るか艦が`voyage`へ戻れば再開すること。

## 5. リスクと対策

| リスク | 対策 |
| :--- | :--- |
| `owner: "shipyard"` 追加により `shipVoyages.ts`/`shipyards-overview.ts` の `owner` 網羅性チェックが崩れる | 型を `"state" \| "market" \| "shipyard"` の union にし、既存の switch/条件分岐が新値を無視するとコンパイルエラーになる箇所を洗い出してから着手する。ただし `"shipyard"` ストリームは `ShipHull`/`_hulls` を一切生成しないため、`shipVoyages.ts`（`_hulls` を走査するのみ）は実質的に触れる必要がない想定。 |
| 収容上限（docked hull数 + Goods在庫の合算）の判定で、`docked` 状態のShipHull数を数える際にティア対応（`getShipSizeTier`）を誤ると過小/過大な上限になる | 既存の `getShipSizeTier(shipClass)` をそのまま再利用し、新しい対応表を作らない。 |
| Good 分割により既存セーブデータ・テストの `"Ships"` 参照が壊れる | `goods-generator.ts`/テストの `"Ships"` 文字列参照箇所（既存は定義とテストのみ、他モジュールに波及なしを確認済み）を全て更新してから着手する。 |

## 6. 完了条件

1. Economy の Goods カタログに `Sloop`/`Caravel`/`Galleon` が独立した在庫・価格を持つ Good として存在し、
   `Ships` という単一エントリは存在しない。
2. 3船級すべてが、全区間が海路のルートでしか取引されない。
3. 3船級の在庫は、実在する Shipyard の余剰建造キャパシティからのみ供給され、無関係な生産地からは
   生まれない。
4. 各港・各ティアの在庫は `portCapacity.ts` 由来の上限に達すると増えなくなり、上限到達中は該当ティアの
   余剰生産が build points を消費しない。
5. 既存の `owner: "state"/"market"` `ShipHull` ライフサイクル（航海訓練・偽装通商・諜報・収入）の
   既存 unit test が無改修で通過する。

## 7. 決定済みの調整ポイント

前回時点で未決定だった3点は以下の通り確定した。

- **余剰キャパの配分方針**: 固定割合の事前配分はしない。`market` キューがその tick で消費しきれなかった
  分だけを回す。**`state`（国家造船所）ではこのストリームを一切走らせない** — 国家は自らの艦隊拡張に
  必要な分だけを作り、有事に急ぎ船が必要な場合は既存の商船を接収する、という設定上の説明に留め、
  接収そのものはゲームメカニクスとして実装しない（§3.3）。
- **収容上限の共有**: `portCapacity.ts` の上限は、既存の「動員中に港へ留まっている艦数」表示と
  この新しいGoods在庫を**同じ物理的な係留資源**として共有する。戦時の艦隊召還がGoods向け新造船生産を
  圧迫する副次効果を意図的に許容する（§3.4）。
- **建造対象ティアの選定方針**: 需要トラッキングの仕組みは作らない。Galleon（大型）は買い手が不確実な
  ため常に対象外。既定はSloop。Caravelが解禁済みかつSloop在庫>0かつCaravel在庫=0の場合のみCaravelを
  作り、Caravel在庫が0に戻るまでは再度作らない（§3.3）。

## 8. 将来の拡張候補（未設計・アイデアのみ）

- **地形依存の追加収容力**: 港が coastline に囲まれ入口が狭い内海(閉鎖水域)にあり外洋に直接面していない
  場合、錨泊による安全な追加係留を許可する。
- **専用港湾施設**: 集落を伴わない、船を係留するためだけの港湾インフラを建設可能にし、収容上限を
  拡張する。

## 9. 既存メカニクスとの非衝突の確認（この Phase 提案時のレビュー結果）

- `owner: "market"` の商船隊（`shipVoyages.ts`）は本 Phase で無改修。§2 非目標1参照。
- 「商人が古い船を手放す・買い替える」体験は、既存オーナーシップのリファクタリング（後続 Phase）で
  対応する。本 Phase は「新造船を港で買える」体験のみを提供する。
- `portCapacity.ts` の既存の「動員中の艦数」表示用途と、本 Phase が新設する在庫上限は**同じ物理的な
  係留資源を共有する**前提で設計を確定した（§3.4、§7）。平時はほぼ全艦が `voyage` で港を埋めないため
  （[ships.md §4.5](ships.md#L162-164)）、通常時に両者が競合することはほぼない。戦時の艦隊召還が
  Goods向け新造船生産を圧迫するのは意図した副次効果として許容する。
