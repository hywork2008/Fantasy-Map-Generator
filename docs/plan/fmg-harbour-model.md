# FMG の港モデルの見直し: 港を独立した存在にし、生成の順序を固定する

状態: 設計(未実装) 2026-10-17
前身: [estuary-port-pair-relocation.md](estuary-port-pair-relocation.md)(取り下げ。§1〜§2 の事例と原因、§10 の取り下げ理由を参照)
関連: [waterfront-town-proximity.md](waterfront-town-proximity.md)、[river-vessels-and-downstream-trade.md](river-vessels-and-downstream-trade.md)、[bridge-skew-policy.md](bridge-skew-policy.md)、[simulation-channel-server.md](simulation-channel-server.md) §16

## 1. 目的

FMG では、港に関わる値が別々の段階で、別々の基準によって決まる。後から 1 つを直すと、別の所で不整合が出る。本設計では、港を都市から独立した存在(Harbour)にし、次の 4 つを 1 か所で、1 つの形(描いた海岸と描いた川)に基づいて決める。

- 港の位置
- 港が面する水域
- 港に入れる船の種類
- 航路の端点

都市の位置、港、陸の道、航路は、この順に 1 回ずつ決める。後から都市を動かして直す処理は不要にする。

## 2. 現状の構造(2026-10-17 時点のコード)

| 値 | 決まる所 | 基準 |
| --- | --- | --- |
| 港の有無 `burg.port`(水域の feature id) | `BurgsGenerator.shiftSteps` → `collectPortCandidates` / `selectPorts` / `promoteToPortSteps` | セル(`cells.haven`、`cells.harbor`、川の流量) |
| 港の種類 `seaPort` / `riverPort`、`waterAccess.port` | `updateBurgWaterAccess`、`getBurgPorts`(航路があるかどうかからも推定する) | セルの隣接 + フラグ |
| 都市の位置(海港) | `getCloseToEdgePoint`(haven との境界の辺へ寄せる) → `settledShorePort` | セルの辺 → 描いた海岸 |
| 都市の位置(河川港・河口) | `shiftTowardsRiverBankSteps` / `riverBankSteps` → `dualPortPlacementTask`(地図の準備後、読み込み時にも走る) | 描いた川と描いた海岸 |
| 描いた海岸 | `coastlineFractal`(`portCoastPlacement: "pinned"` のときは、港のセルの辺を固定する) | 港の選択に依存する |
| 海の航路 | `routes-generator` の `generateSeaRoutes`。セルの graph の上で、陸から水へは haven を通らなければならない | セル |
| 航路の端点 | `getPortAnchorPosition`(都市のセルと haven の共有辺の中点から、少し水側) | セル |
| 川の航路 | `riverLaneFrom` / `alongRiverToBurg`(`navigation: "river"`、group は同じ `searoutes`) | 川のセルの列 + 都市の位置 |
| 都市を動かした後の航路 | `reconnectRelocatedBurgSeaRoutes`(端点を付け替えるだけ) | — |
| 船の種類 | 航路の `navigation`(`"river"` か、なし)。`seaRouteGraph` は川の航路を除く。経済の利用側は未調査 | 航路単位 |

事例(world-1、Szerhir #11・Khiachaqoh #395)で見えた症状:

1. 都市がセルの外や海のセルの上へ寄り、隣の都市に重なった。
2. 河口の川の交差が、描いた海岸の外(海の上)にあった。
3. 海の航路の端点(セルの辺)と都市の位置(描いた海岸)が食い違い、修復の後に航路が陸を貫いた。
4. 港のフラグを外しても、航路が残った。
5. 川の航路が河口の近くまで下ってから、都市へ折り返した(汽水域で折り返す)。
6. 海の船と川の船の区別が航路にしかなく、外洋の船が川を遡上しないことを保証できない。

どれも、「セルで決めた値」と「描いた形で決めた値」が混ざっていること、そして後から片方だけを直していることから起きている。

## 3. 守るべき条件(不変条件)

| ID | 条件 |
| --- | --- |
| H1 | 都市は 1 セルに 1 つ。都市の中心は、自分のセルの中の描いた陸の上にある |
| H2 | 港は必ず 1 つの水域に面する。岸壁の点(quay)は、その水域の描いた岸の上で、都市のセルの中にある |
| H3 | 岸壁と都市中心の距離は、CE の都市半径 R を基準とした帯の中に収まる(waterfront-town-proximity.md §3) |
| H4 | 航路は岸壁から岸壁まで。途中はすべて、その航路の種類の水の上にある(海の航路は描いた陸を横切らない。川の航路は描いた川の中にあり、河口の岸壁より海側へ出ない) |
| H5 | 航路は、両端の港が受け入れる船の種類で走る。海の船は川の港に入らない。川の船は海の航路を走らない |
| H6 | 港がなくなれば、その港の航路も消える(航路は港に属する) |
| H7 | 都市の位置・港・航路は、生成の後で動かさない。読み込み時の修復は、H1〜H6 を満たさない港を「無効」にするだけで、都市を動かさない |

これらは機械的に検査できる形で定め、§7 の診断 API の受け入れ条件にする。

## 4. 港のモデル

```ts
interface Harbour {
  i: number;
  burg: number;
  /** sea: open coast; lake; river: on a navigable river; estuary: where a river meets the sea. */
  kind: "sea" | "lake" | "river" | "estuary";
  waterFeature: number;      // ocean/lake feature id (sea, lake, estuary)
  riverId?: number;          // river, estuary
  cell: number;              // the burg cell; the quay lies inside it
  quay: [number, number];    // map units, on the drawn shore or bank
  normal: [number, number];  // unit vector from the quay into the water
  vessels: ("sea" | "river")[]; // sea: ["sea"], river: ["river"], estuary: both (transshipment)
  status: "valid" | "invalid";
  reason?: string;           // why it is invalid (kept for the waterfront report)
}
```

- `pack.harbours` に保存する。都市は `burg.harbours: number[]` だけを持つ。
- `burg.port`、`seaPort`、`riverPort`、`waterAccess.port` は、有効な港から計算した値にする。保存データとの互換のため、当面は保存時に書き出す。
- 河口の都市は、「海港と河川港の 2 つのフラグ」ではなく、**河口港 1 つ**を持つ。河口港では海の船と川の船が荷を積み替える。これが、外洋の船が川を遡らない根拠になる(H5)。
- 1 つの都市が別々の水域に面する港を 2 つ持つこと(例: 海と、川の上流側の河岸)は許す。ただし、どちらの港も H2 を満たす必要がある。

## 5. 生成の順序

| 段階 | 内容 | 使う形 |
| --- | --- | --- |
| G1 | 都市のセルを選ぶ(現状の配置と、quadtree による間隔) | セル |
| G2 | 描いた海岸と描いた川を確定する。川の多角形は描いた海岸で切る(河口より海側は海として扱う) | 描いた形 |
| G3 | 港の候補: 都市のセルの中で、描いた岸の区間を水域ごとに求める。候補の区間がない港は作らない | 描いた形 ∩ セル |
| G4 | 港の選択(今の `selectPorts` の数の制約・文化・国の条件を引き継ぐ)と、岸壁の点の決定。同じ haven を共有する隣の都市とは、それぞれ自分のセルの区間だけを使う | 描いた形 ∩ セル |
| G5 | 都市の位置: 岸壁から法線の逆方向へ、H3 の距離をとる。河川港・河口港は、今の乾いた正方形の判定(`findRiverSettlementSiteSteps`)を使う。ただし、探索範囲は自分のセルの中に限る | 描いた形 ∩ セル |
| G6 | 航路: 岸壁を端点にして引く(§6) | 描いた形 |
| G7 | 陸の道と橋: 都市の確定した位置から引く。橋の角度は `bridgeSkewPolicy` | 描いた形 |
| G8 | 検査: H1〜H6。満たさない港は `invalid` にして、その航路を作らない。都市は動かさない | — |

- 今の `portCoastPlacement: "pinned"`(港のセルの辺を固定して海岸を描く)は、海岸が港の選択に依存し、G2 と G3 の順序が循環する。代わりに、G4 で決めた岸壁の点を固定点として海岸を描き直す方式(岸壁の周辺だけを局所的に描き直す)にする。この描き直しは、岸壁の点を動かさないことを条件にする。
- `dualPortPlacementTask`、`settledShorePort`、`settledRiverSite` の寄せ、`reconnectRelocatedBurg*` は不要になる。廃止は段階的に行う(§8)。

## 6. 航路

### 6.1 海の航路

- 経路の探索は、今と同じく水のセルの graph の上で行う(コストと時代による制約はそのまま)。端点だけを変える。
- 端点は岸壁の点にする。岸壁から最初の水のセルの中心までの区間は、描いた水の上を通ることを確かめる。通らなければ、その港からの航路は作らない(H4)。
- 描く線(Catmull-Rom の曲線)が描いた陸をかすめないよう、線を作った後に陸との交差を検査する。交差すれば、交差するセルの区間を中心線の折れ線に戻す。

### 6.2 川の航路

- 川の航路は、川の港(または河口港)の岸壁から岸壁まで、描いた川の中心線に沿う。
- 河口港の岸壁より海側には出ない。今の `alongRiverToBurg` は川のセルの列の最後(海のセル)まで進んでから都市へ戻るので、「汽水域で折り返す」線になる。これを廃止する。
- 河口港どうし(同じ川の、別の河口)を川の航路で結ぶことはしない。

### 6.3 船の種類

- 航路に `vessel: "sea" | "river"` を持たせる(今の `navigation` を置き換える)。両端の港の `vessels` に含まれる種類だけを許す。
- 利用側の監査: `seaRouteGraph`(川を除外済み)、`warRouteFinder`、`warFrontierBurgs`、経済の交易(`extensions/economy/context/trade.ts`、`vesselOwnership.ts`)、`getBurgPorts`、CE のサイト記述子。外洋の船が川の航路を使う経路が残っていないかを H0 で調べる。

## 7. 診断(受け入れ条件)

`/api/sim/channels/:id/diagnostics/settlement` を拡張する。または `/diagnostics/harbours` を新設する。

| 指標 | 内容 | 目標 |
| --- | --- | --- |
| `outsideHomeCell` | H1 を満たさない都市 | 0 |
| `crowdedPairs` | 元のセル中心の距離の 0.5 倍より近い都市の組 | 0 |
| `harbourOffShore` | 岸壁が描いた岸の上にない、またはセルの外にある港 | 0 |
| `laneCrossesLand` | 描いた陸を横切る海の航路 | 0 |
| `riverLaneBeyondMouth` | 河口港の岸壁より海側へ出る川の航路 | 0 |
| `vesselMismatch` | 端点の港が受け入れない船の種類の航路 | 0 |
| `orphanLanes` | 有効な港を端点に持たない航路 | 0 |
| `crossingsInSea` | 描いた陸の外にある川の交差 | 0 |
| `invalidHarbours` | G8 で無効になった港の数と理由 | 記録する(River-Port Lab の seed 1〜200 で、変更の前後の分布を比べる) |

## 8. 実装計画

| 段階 | 内容 |
| --- | --- |
| H0 | 診断を §7 まで拡張し、world-1 と River-Port Lab で現状の件数を記録する。§6.3 の利用側の監査 |
| H1 | `Harbour` の型と `pack.harbours`。今のフラグから計算して作る(読み取り専用)。保存と読み込み |
| H2 | G2: 川の多角形を描いた海岸で切る。川の交差をこの多角形で求める |
| H3 | G3〜G5: 新しい港の選択と都市の位置。オプションで切り替え、新しい地図だけに適用する |
| H4 | G6: 岸壁を端点とする航路と、`vessel`。川の航路の折り返しを廃止する |
| H5 | G8 の検査と、CE のサイト記述子が港(岸壁)を読むようにする |
| H6 | 旧方式(`dualPortPlacementTask`、寄せ、端点の付け替え)の廃止と、既定の切り替え |

各段階の完了条件は、§7 の該当する指標が 0 になること。H3 以降は新しい地図だけに適用する。

## 9. 既存の保存データ

- 読み込み時に、今のフラグと都市の位置から港を作る(H1)。H1〜H6 を満たさない港は `invalid` にし、その航路を表示と経済から外す。都市は動かさない(H7)。
- 都市の位置そのものがおかしい保存データ(world-1 の Szerhir のように、セルの外や海の上にあるもの)は、自動では直さない。Tools に「港と都市の再生成」(G3〜G7 を、その地図の上でもう一度走らせる)を用意し、利用者が明示的に実行する。経済の状態(港の施設や船)の引き継ぎ方は、未決事項とする。

## 10. 未決事項

- G4 で岸壁の周辺だけを描き直す方式が、`coastlineFractal` の今の実装で可能かどうか。不可能なら、港のセルの区間は直線の海岸にする(取り下げた設計の §5.1 と同じ)。
- 河口港の積み替えを、経済(交易の費用・時間)にどう反映するか。
- 湖の港と、湖から流れ出る川(`resolveLakePortFeature`)の扱い。湖の港は「湖」の水域に属し、海の船は入らない、を基本とする。
- `invalid` になった港を持つ都市の `type`(Naval)を、文化の既定値に戻すかどうか。
- 0.5 などの係数は、River-Port Lab の分布で較正する(推定値のままにしない)。
