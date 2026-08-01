# 河川船・下流交易経路の修正計画

| 項目 | 内容 |
| :-- | :-- |
| Status | In progress — R1–R3 functional core implemented; UI and saved-data migration remain |
| 対象 | Core routes / rivers、Economy extension、任意の Shipbuilding extension、Trade Details |
| 前提 | [ship-in-river.md](ships/ship-in-river.md)、[merchant-transport-asset-ledger.md](merchant-transport-asset-ledger.md) |
| 調査日 | 2026-08-01 |

## 1. 結論

河川輸送は海運の小型船を流用しない。`river-barge`（浅喫水の河川船）を Economy が所有する
集計型の耐久輸送資産として追加し、既存の Cart / Wagon と同じ **TransportAssetOrder** で大工へ
発注できるようにする。Shipbuilding の `ShipHull` は海運専用の個体資産のままとする。

河川経路は `River.cells` の並び（源流から河口）を正本にした**下流方向のみ**の有向グラフとする。
このため、A（上流）→B（下流）と B→A は別の到達可能性・所要日数を持つ。上流便を黙って
同じ river-barge で成立させず、陸路または海路の代替経路が無ければ Deal を作らない。

河川船が海へ出られるのは、河口に連なる `enclosure` が十分高い保護水域だけとする。これは河口から
港へ着ける短い最終区間のためであり、外洋・通常の海路を river-barge が航行することを許す規則では
ない。反対に海運 ShipHull は河川の有向辺を使えない。海運と河運を接続する場合は、港での荷役・
積替えを明示した mixed route にする。

## 2. 現状調査

| 箇所 | 現在 | 問題 |
| :-- | :-- | :-- |
| `RoutesModule.getWaterPathCost()` | 航行可能 river edge を水運辺として双方向に返す | `searoutes` が河川を通過し、海船と河川船の区別も流向もない |
| `pack.cells.routes` | `Routes.buildLinks()` が全 route edge を双方向に保存する | 有向の下流辺を表せない。ここをそのまま交易の正本にすると上流航行を防げない |
| `TradeAnimation.findRoutePath()` | `roads` / `trails` と `searoutes` だけを land / water の二値で Dijkstra する | route 探索、表示名の animation module、輸送能力選定が結合しており、船種別の通行可否を渡せない |
| `TradeRouteSegment` / duration | `"land" | "water"`、水上は全て `seaKmPerDay` | 河川の方向・速度・積替えを保存できない |
| `TradeCargo` | water 区間に Sloop / Caravel / Galleon を選ぶ | river-barge の容量・発注・資産予約先がない |
| `MerchantTransportAssets` | 陸上は集計残高、水上は Shipbuilding の Hull 参照 | river-barge のように一方向へ移動する集計資産の到着先移管がない |
| `Burgs.developPort()` / `generateSeaRoutes()` | river port も drain feature を `burg.port` に持ち、sea route 生成の候補に入る | river access と sea access が同じ `port` 数値に畳み込まれている |

`Rivers.isNavigable(cell)`（同一 river、両端の flux が `MIN_NAVIGABLE_FLUX` 以上）と `River.cells` の
源流→河口の順序はすでにある。この二つを再利用し、Core が地形から有向河川グラフを導出する。
`enclosure` は 0–100 の保護水域スコアであって外洋航行能力ではないため、river-barge のみの短い
河口接続の制約に用いる。

## 3. 採用しない案

### A. `searoutes` をそのまま river route として使う

不採用。`pack.cells.routes` が双方向であり、既存の海軍・SeaRouteGraph も `searoutes` を双方向の
海上航路として読む。一部の呼び出しで逆向きだけ弾くと、交易、船、表示、軍事で到達可能性が食い違う。

### B. river-barge を Shipbuilding の新しい `ShipHull` class にする

不採用。Shipbuilding は港・船台・海運 hull の個体ライフサイクルを正本としている。多数かつ同質の
barge に個体 ID と船台を要求すると、Cart/Wagon と同じ商人用大工発注より複雑な interface になる。
海運 Hull と river-barge は、MerchantTransportAssets の別 adapter とする。

### C. 到着した river-barge を出発市場へ即時返却する

不採用。下流専用という前提に反し、見えない上流回送を作る。到着した barge は到着市場の台帳へ
移管するため、上流市場の出荷能力を増やすにはその市場で新造する必要がある。

### D. 上流航行を低速・高コストとして初期実装する

不採用。曳舟道、役畜、人夫、潮汐、曳航可能な岸、空船回航を一度にモデル化することになり、
「基本は片道」という目的を曖昧にする。曳舟道は将来の明示インフラとしてのみ追加できる。

## 4. データと seam

### 4.1 Core: `RiverNavigationGraph`

新しい純粋 module `src/generators/riverNavigationGraph.ts` を作る。入力は `Readonly<PackedGraph>` のみで、
Economy、Route generator、将来の軍事が個別に `River.cells` を解釈しないようにする。

```ts
type RiverNavigationEdge = {
  fromCellId: number;
  toCellId: number;
  riverId: number;
  distanceMapUnits: number;
  kind: "downstream" | "shelteredWater";
};

type RiverNavigationGraph = {
  outgoing: ReadonlyMap<number, readonly RiverNavigationEdge[]>;
  isDownstreamEdge(fromCellId: number, toCellId: number): boolean;
};

function buildRiverNavigationGraph(
  pack: Readonly<PackedGraph>,
  options: { minNavigableFlux: number; shelteredWaterMinimumEnclosure: number }
): RiverNavigationGraph;
```

- `river.cells[n] -> river.cells[n + 1]` だけを downstream edge とする。`-1`、欠損セル、閾値未満の
  cell は辺を作らない。
- 支流の最終セルと本流・湖の接続は、`River.cells` / `cells.f` / `feature.outlet` を使い、同じ
  helper 内で明示接続する。曖昧な合流は推測接続せず、テスト fixture で定義した接点だけを作る。
- 河口の water-cell 接続は、連続した水域でかつ `enclosure >= shelteredWaterMinimumEnclosure` の時だけ
  `shelteredWater` edge とする。初期値は名前付き定数（例: 60）に留め、UI option や save 値にはしない。
- この graph は Core の導出データであり、`pack.cells.routes` へ書き込まない。Core route regeneration、
  river edit、resample 後には再生成する。

この seam の leverage は、河川流向・湖接続・enclosure 判定を一箇所へ閉じ、Deal pathfinder と
`RoutesModule` がそれぞれ反対向きの river edge を作る事故を防ぐ点にある。

### 4.2 route の通行能力

交易の保存型を次へ拡張する。

```ts
type TradeRouteMode = "land" | "sea" | "river";

type TradeRouteSegment = {
  type: TradeRouteMode;
  points: TradeRoutePoint[];
  riverId?: number;
};

type TransportAllocation = {
  mode: TradeRouteMode;
  transportId: string;
  // existing capacity / used / hull fields
};
```

`"water"` は新規生成で使わない。旧 Caravan の segment は read 時だけ `"sea"` として表示互換を保ち、
すでに出航済みの payload・allocation・ETA を再計算しない。

Route generator は次の責務へ戻す。

- `searoutes` は sea / lake の双方向航路だけを生成し、river edge を通らない。
- `Burg.port` の既存値を海船可否の唯一の根拠にしない。`haven` を持つ coastal/lake access と、
  `Rivers.isNavigable(burg.cell)` の river access を小さな helper で判定する。
- river line 自体は既存 Rivers renderer が描くため、河川のすべてを `pack.routes` に複製しない。
  ただし河川港どうしの接続を地図上で失わせないため、直近の下流港へ至る区間だけは
  `Route { group: "searoutes", navigation: "river" }` として charted line を持てる。この route は
  `pack.cells.routes`、SeaRouteGraph、海流描画のいずれにも入れない表示専用データであり、実際の通行可否は
  常に RiverNavigationGraph を読む。河道セルと港アイコン座標が離れている場合は、同じセルを指す短い
  port approach point を末端に足して、航路が都市へ到達して見えるようにする。
  海路と河路を接続するには、同一 Burg の sea / river access または明示された land transfer を使う。

### 4.3 Economy: `TradeRoutePlanner`

`generators/tradeRoutePlanner.ts` を経路探索の呼び出し境界とする。互換移行の初期段階では既存
`trade-animation.ts` の探索実装をこの facade 経由で利用し、次のリファクタリングで実装本体を移す。
呼び出し側の interface は出発・到着と許可 vehicle profile だけにし、renderer / animation option を読まない。

```ts
type TradeRoutePlan = {
  segments: TradeRouteSegment[];
  durationDays: number;
};

interface TradeRoutePlanner {
  findRoute(sourceCellId: number, targetCellId: number): TradeRoutePlan | null;
  clearCache(): void;
}
```

内部では land graph、SeaRouteGraph、RiverNavigationGraph を一つの stateful Dijkstra で結び、状態を
`land | sea | river` とする。mode をまたぐ edge には港・河岸の荷役ペナルティを加える。river edge は
graph の outgoing edge だけを読むため、B→A の反転探索は不可能になる。

市場の route cache key には、従来の road / sea geometry に加え、river cell sequence、flux、feature outlet、
enclosure、河川速度・保護水域閾値を含める。市場間検索は既に ordered pair なので、A→B と B→A を
同じ結果としてキャッシュしてはならない。

### 4.4 速度・積替え

`CaravanMovementSettings` と `tradeRouteDuration.ts` に river 用の専用値を追加する。

- `riverDownstreamKmPerDay`: `seaKmPerDay` と独立した基準速度。
- `RIVER_TRANSFER_PENALTY_DAYS`: land↔river、sea↔river で発生する積卸し日数。
- 初期版では flow / gradient から連続的な速度を作らない。航行可否は flux、方向は `River.cells`、速度は
  mode 定数に分ける。これなら地形のスケールが変わっても挙動を検証できる。

`bakeCaravanTravelLegs()` も `river` leg を別速度で焼き付け、出航後に option を変えても ETA が変わらない
現行の保証を維持する。

## 5. 河川船資産と発注

### 5.1 資産モデル

`MerchantTransportLedger` に、land balance と同じ集計単位の `riverAssets` を追加する。

```ts
type MerchantRiverAssetBalance = {
  assetId: "river-barge";
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
  recoveryDays: number;
};
```

海運 `waterAssets` は Shipbuilding Hull 参照のまま残す。名称が曖昧になるため、実装時に `waterAssets` は
`seaHullAssets` へ保存移行するか、少なくとも public API では `sea` と呼ぶ。`river-barge` をそこへ混ぜない。

予約には destination を残す。

```ts
type TransportReservation = {
  // existing fields
  destinationMarketId: number;
  riverAssetTransfers: { assetId: "river-barge"; quantity: number }[];
};
```

- 出発時: source market の `reserved -> inTransit`。
- 到着時: source の `inTransit` を減らし、destination market の `available` を増やす。
- 喪失時: source に返さない。初期版は destination market の `maintenance` へ入れ、既存の回復 timer 後に
  available にする。将来、沈没・解体を導入する時はこの遷移だけを `retired` と replacement order に替える。
- 取消時: 出発前なので source market の available に戻す。

これにより、river-barge は下流へ偏在し、上流の供給地は新造しなければ輸出を続けられない。資産の移動を
見えない帰還で相殺しない。

### 5.2 大工への発注

`TransportAssetBlueprint` の union に `river-barge` を加える。完成物は `Market.goods` へ入れず、
`MerchantTransportAssets.addAvailableRiverAssets()` を通じて市場台帳へ入れる。

初期 recipe は Wood を主材料にし、Ropes / Tar を必要とする既存 Good が有効な場合だけ副材料にする。
正確な数量と `cargoCapacitySlots` は Goods の価格スケールと固定 seed 診断により決めるが、次を守る。

- Cart より明確に大きく、Sloop より小さい容量にする。
- woodworking craft-domain の work point を予約する。Shipyard worker、Shipbuilding の材料要求、通常 Good
  生産と二重計上しない。
- player order と simulation replacement は既存と同じ priority / budget / cancellation 規則を使う。

river-barge を seed するのは、下流へ到達できる river access を持つ市場だけとする。到着専用の市場には
一律 seed しないが、プレイヤーが注文しても既存の市場資産として台帳へ残る。

## 6. UI と表示

Trade Details と Market Overview に次を追加する。新規 UI は React / Zustand の既存 dialog state を使い、
表示文言は英語とする。

- route segment を `Land` / `Sea` / `Downstream river` と表示する。
- river allocation は `River barge`、capacity、used、free、utilization、source market、到着後の
  `Transfers to <market>` を表示する。
- 海運 Hull は `Sea hull` と明示し、river barge と同じ一隻に見せない。
- Market Overview の Transport assets で river-barge の available / reserved / in transit /
  maintenance、下流への出発数、到着移管数を表示する。発注フォームの blueprint 一覧にも含める。
- river-only の reverse Deal が route 不可の場合は、Trade Opportunities の理由を `No downstream route` と
  表示する。単に需要が無いように見せない。

## 7. 実装フェーズ

### R0 — 基準テストと診断

- 固定 river fixture で `River.cells` の順序、合流、河口、enclosure を確認する。
- 現在の `searoutes` が river edge を含むケース、双方向に Market route が成立するケースを regression として
  固定する。
- 完了条件: 変更前の誤った経路をテストで再現できる。

### R1 — Core river graph と sea route 分離

- Implemented: `RiverNavigationGraph` を追加し、Core test を作る。
- Implemented: Route generator から river edge を sea route generation から外し、coastal/lake と river access を分離する。
- Implemented: 上流の河川港から直近の下流港までを表示専用 `navigation: "river"` route として chart し、
  双方向の `cells.routes` や SeaRouteGraph へは入れない。
- SeaRouteGraph / naval tests が river の directed edge を海路と数えないことを確認する。
- 完了条件: 海船の route graph に river edge がなく、下流 graph にだけ A→B がある。

### R2 — 交易 pathfinder と duration

- Implemented: `RiverNavigationGraph` に下流有向 path search を追加する。
- Implemented: `riverKmPerDay` と `river` segment を追加し、ETA の river leg を海路・海流から分離する。
- Implemented: `TradeRoutePlanner` 境界を導入し、Caravans、Markets、Strategic procurement、Trade Opportunities の
  呼び出しを置換する。互換移行中は既存 `TradeAnimation` 内の探索実装を facade 経由で利用し、表示 API を壊さない。
- Implemented: `land | sea | river`、downstream speed、transfer penalty、ordered-pair cache を実装する。
- 完了条件: 上流→下流だけが river plan を得て、逆方向は land/sea fallback または `null` になる。出航後 ETA は固定。

### R3 — river-barge 台帳・予約・発注

- Implemented: river-barge を Economy 所有の集計資産とし、大工への TransportAssetOrder 完成物として台帳へ直接登録する。
- Implemented: river-barge の reserve / depart / cancel / arrival を追加し、arrival 時には source へ戻さず destination market へ移管する。
- Implemented: ledger、reservation、到着先移管、maintenance recovery を実装する。river access に基づく初期 seed は R4 と併せて追加する。
- Implemented: `TransportAssetOrder` / player order に blueprint を加える。simulation replacement の river-barge 発注は別途追加する。
- 完了条件: 同一 barge を二便に予約できず、到着後に source へ戻らず destination で再利用される。

### R4 — UI・移行・回帰

- Implemented: Trade Details に `Land` / `Sea` / `Downstream river` の区間、River barge の出発・到着先移管、
  capacity / used / free / loaded を追加する。
- Implemented: Market Overview の Transport assets に asset ごとの Ready slots と市場全体の Ready capacity を追加する。
- Implemented: Trade Opportunities が river graph の有向 edge を読み、`River` 距離を表・CSVへ追加する。
- Trade Opportunities の route-unavailable 理由を追加する。
- 旧 `water` segment と旧 ledger を migrate し、進行中 Caravan の資産を再配分しない。
- SVG / WebGL hybrid を明示固定した E2E を追加する。
- 完了条件: 画面上の asset status と reservation / Caravan の状態が一致し、Shipbuilding 有効・無効の双方で
  Economy が正常に動く。

## 8. テスト計画

- Core unit: `River.cells` の source→mouth、支流合流、lake outlet、off-map exit、flux 下限、enclosure 閾値。
- Core unit: `searoutes` が river edge を持たず、SeaRouteGraph / fleet reachability が変化しないこと。
- Economy unit: A→B の river plan は存在し B→A は存在しない、sea Hull が river plan に選ばれない、barge が
  open sea を通れない、mixed transfer の penalty。
- Economy unit: river-barge の予約、取消、到着先移管、loss recovery、source / destination 合計の整合性、
  player budget limit と材料不足。
- Integration: Deal → manifest → downstream Caravan → arrival → destination ledger。上流の残 Deal が asset / route
  不足時に未積載で残る。
- Shipbuilding regression: merchant Hull の snapshot / cargo / voyage / maintenance 状態が river-barge により
  変更されない。
- UI / E2E: Trade Details と Market Overview が同じ reservation id、route mode、空き容量を表示する。

## 9. 非目標

- 初期版で上流曳航、曳舟道、潮汐、風、船頭、役畜の位置・飼料、川ごとの通行料をモデル化しない。
- `enclosure` を外洋船の航海性能や港湾品質の万能な指標にしない。
- river-barge を個別 ShipHull、Market.goods、または State navy の資産として扱わない。
- River を描き直すためだけの新しい SVG route layer は作らない。既存 river renderer を地形表示の正本とする。
