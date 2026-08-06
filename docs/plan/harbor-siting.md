# 港湾・造船所の立地条件 — Elevation・Depth・Coastal Habitat の統合設計

| 項目 | 内容 |
| :--- | :--- |
| Status | **Implemented (2026-08-06)** — Elevation Unsuitable ゲート、`elevationFactor`、Coastal Habitat 基質別`coastalHabitatFactor`（`sandyBeach`/`coastalDune`/`tidalFlat`）、水深ティア別`large`容量、いずれも実装済み。基質の二値排他（旧`allowsFormalHarbor()`）は廃止し、すべて容量側の連続倍率に統合した(§4.3, §4.4)。干拓メカニクス・Economy側の経常維持費（`elevationFactor`/`coastalHabitatFactor`を有効に保つための支出）は未実装のまま(§6) |
| Parent | なし(独立した設計書。[biomes.md](biomes.md)「港湾・船舶と砂浜」節から分離) |
| Related | [biomes.md](biomes.md)(`coastalHabitat`/`sandyBeach`/`tidalFlat`の分類)、[ships.md](ships.md) §4(港湾収容力の計算式)、[enclosure-gameplay-applications.md](enclosure-gameplay-applications.md)(`pack.cells.enclosure`の造船所補正案)、[../simulation/ocean-currents.md](../simulation/ocean-currents.md) §6(enclosure算出)、[urban-water-and-sanitation-system.md](urban-water-and-sanitation-system.md)(干拓・排水インフラとの将来的な接続点、§6) |
| Scope | 正式な港湾・造船所（`collectPortCandidates()`/`developPort()`/`computeShipyardCandidates()`が判定する候補地、および`computeBurgPortCapacity()`が算出する収容力）に、Elevation（陸側の標高）・Depth（水側の水深）・Coastal Habitat（陸側の基質）の条件を追加する設計 |

## 1. 背景

これまでのセッションで以下を決定・確認済み:

1. `coastalHabitat === "sandyBeach"` のセルは正式な港湾・造船所の候補から除外する、という設計が
   当初存在した（旧`allowsFormalHarbor()`）。**この決定は§4.3で撤回した** — 基質は候補地ゲートでは
   なく収容力側の連続倍率（`coastalHabitatFactor`）で扱う。
2. `tidalFlat`（干潟）も同様に除外すべきと当初判断したが、これも§4.3の撤回に含まれる。
3. 上記いずれも、陸地・水域の**地形条件**であって、標高・水深という別軸の条件はまだ考慮されていない
   （という認識は変わらない — 本書はこの続きとしてElevation/Depthの条件を設計した）。

本書はその続きとして、Elevation（港が接する陸地セルの標高）と Depth（係留・進水に使う水域の水深）
の条件を設計する。ユーザー指摘のとおり、現状は陸地セルが標高100m超でも `allowsFormalHarbor()` さえ
通れば港候補になり得るし、水深についてはそもそもどのコードも見ていない。

## 2. 前提となるデータの性質

### 2.1 Elevation（`pack.cells.h`）は単一サンプル値であり、セル内の平均・中央値ではない

`reGraph()`（[main.ts:1704-1764](../../src/main.ts#L1704-L1764)）は、`grid.cells.h` の1点をそのまま
`pack.cells.h` の初期値としてコピーする（`addNewPoint()` が呼ばれる箇所を参照）。つまり `pack.cells.h[i]`
は「そのセルが代表する範囲の平均標高」でも「中央値」でもなく、**生成元グリッドの1サンプル点の標高を
Voronoiセルへそのまま引き継いだ値**である。セル内部に急峻な崖と緩やかな浜が両方含まれるようなケースの
平均化は行われていない。したがって「セル平均か中央値か」という論点自体は成立せず、実装上は
`pack.cells.h[burg.cell]` を素直にそのセルの標高として扱ってよい。

### 2.2 標高のメートル換算 — 既存の `heightToMeters()` を再利用する

[height.ts](../../src/utils/height.ts) に既に切り出し済み:

```ts
heightToMeters(h, exponent) = h < 20 ? 0 : (h - 18) ** exponent
```

`exponent` は `useOptionsState` の `heightExponent`（既定値 1.8、範囲 1–5、マップごとに変更可能）。
**しきい値は必ずメートル単位で定義し、`heightToMeters()`/その逆関数でその場の `heightExponent` から
`h` を導出する。** `h` の生値に固定しきい値を付けると、`heightExponent` を変えたマップで意味が変わって
しまう（`routeGrade.ts` が勾配計算で既にこの流儀を採用している）。

参考: `heightExponent = 1.8`（既定値）での対応表:

| `h` | 標高 (m) |
| -: | -: |
| 20 | 3.5 |
| 24 | 25.2 |
| 25 | 33.2 |
| 26 | 42.2 |
| 30 | 87.6 |
| 31 | 101.2 |
| 35 | 164 |
| 40 | 261 |

### 2.3 Depth（水側）— 既存コードに埋もれている換算式を抽出する必要がある

`heightToMeters()` に相当する水深版は独立関数として存在しない。実際には
[cellInfoService.ts:133-144](../../src/services/cellInfoService.ts#L133-L144) の `getHeight()`
（UI表示用フォーマッタ）の内部に、水セル向けの分岐として既に実装されている:

```ts
// h: 0 < h < 20 の水セルのみ
depthMeters = ((h - 20) / h) * 50
```

これは `heightExponent` に依存しない固定式（レガシー実装をそのまま踏襲）。`h=0`（`markupPack()` の
`DEEP_WATER_LIMIT` 付近まで及ぶ深海マーキング）は元コードでもガード対象外で、実質「測定不能なほど
深い」を意味する。

**設計指示**: `height.ts` の方針（"Display/UI strings stay in `cellInfoService.getHeight`; pure
numeric meters live here"）に倣い、この式を `depthToMeters(h: number): number` として `height.ts`
に抽出する（`h <= 0` は十分に深いとみなすセンチネル値、例えば `-9999` を返す）。`getHeight()` 側は
新関数を呼ぶだけに書き換える。UIの表示文言を変えない、既存動作を変えないリファクタ。

参考: 対応表:

| `h` | 水深 (m) |
| -: | -: |
| 19 | 2.6 |
| 18 | 5.6 |
| 17 | 8.8 |
| 16 | 12.5 |
| 14 | 21.4 |
| 12 | 33.3 |
| 10 | 50 |
| 8 | 75 |
| 5 | 150 |
| 1 | 950 |

### 2.4 `haven` セル単体の水深を使ってはいけない

`pack.cells.haven[cellId]` は「陸セルから見て最も近い水セル」として定義される
（`defineHaven()`, [features.ts:149-156](../../src/generators/features.ts#L149-L156)）。定義上、
海岸線に最も近い、つまり最も浅い水セルが選ばれる。実際の生成では `haven` の `h` はほぼ常に 18〜19
（水深 2.6〜5.6m）に張り付く。**`haven` セル自身の水深をそのまま港の水深条件に使うと、ほぼ全ての
海岸が「水深不足」判定になってしまう**。これはユーザーが指摘した「3メートルは怖い」という違和感の
直接の原因でもある — 現状 `haven` の水深がまさにその程度の値になりやすい設計だからである。

これを避けるため、Depth条件は **`haven` から短いホップ数だけ水セルを辿り、到達できる最深セルを見る**
方式にする。`waterDepthTrend()`（[coastalHabitatAssignment.ts:77-99](../../src/generators/coastalHabitatAssignment.ts#L77-L99)）
や `calculateEnclosure()`（[features.ts:339-377](../../src/generators/features.ts#L339-L377)）が同じ
「水セルのみを辿るBFS」パターンを既に使っており、実装はこの再利用で足りる。

## 3. しきい値の決定

### 3.1 Elevation

| ティア | 標高 | 扱い |
| :--- | :--- | :--- |
| Ideal | ≤ 30m | 制限なし。標準の港湾収容力式（[ships.md](ships.md) §4）をそのまま使う |
| Marginal | 30m 〜 100m | 候補地としては許可するが、改善・維持費が必要（§4） |
| Unsuitable | > 100m | 正式な港湾・造船所の候補から除外（`sandyBeach`/`tidalFlat` と同列） |

根拠:

- 実在の港湾施設（桟橋・波止場）そのものは、地形に関わらずほぼ常に海抜0〜数mに置かれる。しかし
  本エンジンの解像度では1セルが集落全体（港湾施設＋背後の市街地）を代表するため、セル標高が
  「海へのアクセス整備の難易度」の代理指標になる。
- Ideal 上限 30m は、緩やかな丘陵地に開けた港町（地中海沿岸の一般的な港町の多く）を無条件で許可する
  水準。
- Marginal 上限 100m は、ユーザーが挙げた「標高100m以上は港に向かなそう」という基準をそのまま採用。
  この帯は、アマルフィ海岸やチンクエテッレのような、切り立った斜面にジグザグ道・階段・段々畑状の
  インフラで港へアクセスする実例に対応する — 建設・維持は現実に困難だが、不可能ではない。
- 100m 超は、フィヨルドの絶壁のような「港湾インフラを築く足場自体がない」地形とみなし、改善コストを
  払っても正式な港にはできない。ただし個人漁師の小舟が接岸できる余地は残す（`shoreFishing.ts` が
  `sandyBeach` に対して既に持っている「正式港湾ではないが小規模生活活動は許可する」という区分と同じ
  扱い — 断崖の小さな入江に杭橋や梯子で小舟を上げる、という程度の解釈）。

### 3.2 Depth

水深は「港が存在できるかどうか」ではなく、**どの船体サイズまで収容できるか**（[ships.md](ships.md)
§2 の小型/中型/大型ティア）を制限する条件として設計する。単一のしきい値で港全体を諾否判定するのでは
なく、`computeBurgPortCapacity()`（[portCapacity.ts:46-68](../../src/extensions/shipbuilding/generators/portCapacity.ts#L46-L68)）
が既に持つティア構造にそのまま重ねる。

| 船体ティア | 必要水深 | 探索半径（`haven`からのホップ数） |
| :--- | -: | -: |
| 小型 (Sloop) | 2m | 1 |
| 中型 (Caravel) | 4m | 2 |
| 大型 (Galleon) | 6m | 3 |

根拠（実在の喫水を参考値として使用。本プロジェクトは大砲以前の設定なので、これらは「参考にした現実の
数値」であって直接転記ではない — [ships.md](ships.md) §2.4 の既存方針に合わせる）:

- 小型: 沿岸哨戒・伝令用の小型船を想定。2mは典型的な沿岸漁船・スループ級の喫水を上回る安全域。
  探索半径1（`haven` 自身、または隣接1セル）で足りるようにし、「小型ティアはほぼ常に確保される」
  という§4の要件（港湾設備をゼロにしない）を、Depth条件の側でも壊さないようにする。
- 中型: キャラベル級の遠洋交易船を想定。喫水2.5〜4m相当の実例を参考に4mとした。
- 大型: ガレオン級を想定。喫水4.5〜7m相当の実例を参考に6mとした。ユーザーが懸念した「3mで大型船を
  進水させるのは怖い」を正面から解消する値。

`haven` 自身の水深（§2.4のとおり典型的に2.6〜5.6m）だけでは中型・大型の条件を満たせないことが多いため、
探索半径を段階的に広げて「港の入口からdredgeで到達できる深い水域が近くにあるか」を見る設計にした。

## 4. 「条件が少し外れているだけなら維持費を払って改善する」モデル

**（2026-08-06 改訂）** 当初案ではハードな二値排他を Elevation の Unsuitable 帯に加え `sandyBeach`／
`tidalFlat` にも適用する設計だったが、これは§4.3で後述する理由により撤回した。ハードな二値排他
（候補地から即除外）は **Elevation の Unsuitable 帯（>100m、足場自体がない）一つだけ**に限定する。
Elevation の Marginal 帯・Coastal Habitat の全基質（`sandyBeach`/`coastalDune`/`tidalFlat`）・Depth
の各ティアは、いずれも以下の「改善費・維持費」モデルで扱い、**港湾設備が完全にゼロになることを避ける**。

### 4.1 Elevation Marginal（30〜100m）

- 候補地としては許可する。港湾収容力の計算に `elevationFactor` を導入し、`harborFactor` と同様に
  `total` へ乗算する:

  ```text
  elevationFactor = 1.0                                  (elevationM <= 30)
  elevationFactor = lerp(1.0, ELEVATION_FACTOR_FLOOR,     (30 < elevationM <= 100)
                         (elevationM - 30) / (100 - 30))
  ```

  `ELEVATION_FACTOR_FLOOR` は `HARBOR_FACTOR_FLOOR = 0.5`（[portCapacity.ts:16](../../src/extensions/shipbuilding/generators/portCapacity.ts#L16)）
  と同じ考え方で、例えば `0.4` 程度を仮置きする（どんなに険しくても最低限の輸送力は残す）。
- この `elevationFactor` を有効に保つ（＝低下させない）ために、Economy拡張が有効な場合は当該burgに
  「switchback road / cliff lift の維持費」という経常支出を追加する。Economy拡張は本プロジェクトの
  規約どおり任意（[AGENTS.md](../../AGENTS.md) §0「Built-in Extensions」、Shipbuildingの
  `dependencies: [{ id: "economy", required: false }]` パターン — [index.ts:184](../../src/extensions/shipbuilding/index.ts#L184)）
  なので、Economy無効時はコストなしで `elevationFactor` がそのまま適用される（ペナルティはあるが
  課金はされない）。

### 4.2 Depth Marginal（大型ティアの4〜6m帯）

- 大型ティアの必要水深6mに対し、4m以上6m未満の帯を「浚渫維持で大型ティアを開放できる」マージナル
  帯とする。`LARGE_MIN_HARBOR_FACTOR`（既存の `harborFactor >= 0.5` ゲート）に加えて水深条件を
  課す際、この帯だけは容量を半減させた上で許可する:

  ```text
  large = 0                                        (depthM < 4)
  large = floor(total * LARGE_SHARE * 0.5)          (4 <= depthM < 6, 浚渫維持費が必要)
  large = floor(total * LARGE_SHARE)                (depthM >= 6)
  ```

- 4m未満は、通常の浚渫維持費では埋まらない差とみなし大型ティアを単純に閉じる。ただし**小型・中型
  ティアには一切影響しない**ため、この条件だけで港湾設備そのものがゼロになることはない（浅い入江の
  港は「大型艦は造れない/停泊できない」だけで、漁村・交易拠点としては機能し続ける）。
- Economy無効時は §4.1 と同様、コストなしでマージナル帯の容量（半減した大型ティア）がそのまま適用
  される。

### 4.3 Coastal Habitat 基質との統合（実装済み — `sandyBeach`/`coastalDune`/`tidalFlat` を二値排他から解放）

当初案（前セッション、および本書の初版）は「`sandyBeach`／`tidalFlat` は正式な港湾候補から除外する」
というハードゲート（旧`allowsFormalHarbor()`）を前提にしていた。しかし実装直前のレビューで、この方針を
`coastalDune` にまで拡張しようとした際に以下の問題が判明し、**基質側のハードゲートを全廃**する方向へ
設計を改めた:

- `COASTAL_HABITAT_KEYS`（`none`/`sandyBeach`/`rockyIntertidal`/`tidalFlat`/`coastalDune`）のうち、
  `none` は実際の海岸セルには一切割り当てられない値（`coastalHabitatAssignment.ts`の`fill(0)`初期値が、
  海岸と判定された全セルで必ず4種いずれかに上書きされるため）。つまり基質を一つずつ除外リストへ
  追加していくと、最終的に残る「正式港湾を建てられる基質」は`rockyIntertidal`一種類だけに収束する。
- これは現実の港湾立地と逆転している。世界の主要港の多くは岩盤海岸ではなく、干潟・デルタ・河口の
  軟弱地盤（ロッテルダム、上海、ハンブルク、東京湾岸など）に築かれ、浚渫・埋立・杭基礎への継続投資と
  引き換えに機能している。砂浜海岸も防波堤があれば漁港・マリーナとして機能する実例が多い。
- 底質は「港として使えるか否か」の二値条件ではなく、「どれだけ改善・維持コストを払うか」という
  連続的な条件として扱うべきであり、これは本書§4がElevation/Depthに既に採用しているモデルと同じである。
  本節の初版が「基質だけは例外的にハードゲート」としていたのは、ユーザーが前セッションで要求した
  「条件が少し外れているだけなら維持費で改善し、港湾設備をゼロにしない」という原則との食い違いだった。

**採用した設計**: `evaluateHarborCoastalHabitat()`（`harborSiteConditions.ts`）が、`elevationFactor`と
並ぶ`coastalHabitatFactor`を返す。`rockyIntertidal`と`none`は`tier: "ideal"`（factor=1、コストなし）。
`sandyBeach`・`coastalDune`・`tidalFlat`は`tier: "marginal"`で、いずれも候補地からは除外されない:

| 基質 | `coastalHabitatFactor` | 根拠 |
| :--- | -: | :--- |
| `rockyIntertidal` | 1.0（Ideal） | 天然の基礎、自然な水深に近く追加投資が要らない |
| `tidalFlat` | 0.6（Marginal） | ヴェネツィアのラグーン型 — 底質そのものは変えず、浚渫・杭基礎で航路と足場を維持する |
| `sandyBeach` | 0.5（Marginal） | 防波堤の新設＋沿岸漂砂に対する定期的な養浜が要る、`tidalFlat`より重い投資 |
| `coastalDune` | 0.5（Marginal、`sandyBeach`と同値） | 砂浜の陸側の続きであり、独立した基質として扱う根拠がない |
| `none` | 1.0（Ideal） | 海岸セルには到達しない値（防御的なデフォルト） |

`allowsFormalHarbor()`（`coastalHabitatCatalog.ts`）は削除した。`collectPortCandidates()`/
`developPort()`/`computeShipyardCandidates()`は、基質を一切見ずにElevation Unsuitableだけを
候補地ゲートとして残し、基質の影響は`computeBurgPortCapacity()`側の`coastalHabitatFactor`のみで
表現する（§5.2/§5.3）。これはenclosure-gameplay-applications.md §4.2が指摘した「候補判定(gate)には
使わず、容量(capacity)側の補正にとどめる」という教訓と同じ設計判断である。

### 4.4 干拓（恒久的な基質転換）は別メカニクスとして今後設計する

`tidalFlat`／`sandyBeach`を`rockyIntertidal`相当の`coastalHabitat`へ恒久的に書き換える干拓
（オランダのポルダー型、日本の新田開発型）は、本書のスコープ外のまま据え置く。これは一回性の資本
投資であり、§4.3の`coastalHabitatFactor`（経常的な維持費モデル）とは性質が異なる。

干拓は都市の排水・治水インフラの発展と地続きの機能であり、
[urban-water-and-sanitation-system.md](urban-water-and-sanitation-system.md) §1.2が既に
「湿地・谷底を排水して市場、城下、**港**の用地を得る」を`stormwater`/`wastewater`インフラ導入の
主要な動機の一つとして挙げている。したがって干拓を実装する際は、本書独自のメカニクスとして
新設するのではなく、同ドキュメントが定義する`WaterSanitationTier`・公共事業の建設/維持ライフサイクル
（同書§4）に、`tidalFlat`→陸地化という追加の帰結を接続する形を優先的に検討すべきである
（§6の未解決論点として記録）。

## 5. 実装への配線

### 5.1 新規ユーティリティ（実装済み）

- `src/utils/height.ts` に `depthToMeters(h: number): number` を追加（§2.3）。
  `cellInfoService.ts` の `getHeight()` はこの関数を呼ぶだけの純粋なリファクタに変更済み
  （表示文言・既存動作は変えていない）。
- 新規 `src/generators/harborSiteConditions.ts` に以下を実装:
  - `HarborElevationTier = "ideal" | "marginal" | "unsuitable"`
  - `evaluateHarborElevation(hIndex: number, heightExponent: number): { elevationM: number; tier: HarborElevationTier; elevationFactor: number }`
  - `findNearbyMaxDepthMeters(pack: PackedGraph, havenCellId: number, radiusHops: number): number`
    （`calculateEnclosure()`/`waterDepthTrend()` と同じ「水セルのみを辿るBFS」パターンを使用）
  - `evaluateHarborDepth(pack, havenCellId)`（小/中/大の3半径をまとめて評価するヘルパー）
  - `computeLargeDepthShareMultiplier(largeDepthM)`（§4.2の`large`減算式）
  - `evaluateHarborCoastalHabitat(coastalCode: CoastalHabitatCode | undefined): { tier: "ideal" | "marginal"; coastalHabitatFactor: number }`（§4.3）
  - しきい値定数（§7 参照。すべて named export、`portCapacity.ts`の既存定数と同じ扱い）
  - 単体テスト: `src/generators/harborSiteConditions.test.ts`（境界値・BFS半径・heightExponent非依存性・基質別ティアを検証）

### 5.2 候補地ゲート（Elevation Unsuitable のみ・実装済み）

- `src/generators/burgs-generator.ts` に private `elevationAllowsFormalHarbor(cellId)` を追加し、
  `collectPortCandidates()` と `developPort()` の両方で呼び出す（`tier !== "unsuitable"` のときのみ
  通過）。旧`allowsFormalHarbor(coastalHabitat)`の呼び出しは両箇所とも削除した — 基質は候補地ゲートに
  一切関与しない（§4.3）。
- `src/extensions/shipbuilding/generators/shipyardCandidates.ts` の `computeShipyardCandidates()`
  にも Elevation Unsuitable ゲートのみを残す（burgs-generator側で既に港でないburgはshipyard候補に
  なり得ないため、実質的にはここでの追加は防御的な二重チェックになる）。旧`allowsFormalHarbor`呼び
  出しはここでも削除した。
- `src/data/coastalHabitatCatalog.ts` の `allowsFormalHarbor()` 自体を削除（呼び出し元がなくなった
  ため）。`isSandyBeach()` は`shoreFishing.ts`の非公式小型船着岸判定に使われ続けるため残した。
- 単体テスト: `src/generators/burgs-generator.test.ts`（Elevation Unsuitable な burg が
  候補から除外され、残り2件で港ペアが成立すること／砂浜海岸でも港が成立すること（容量のみ縮小）を確認）。

### 5.3 収容力側（Elevation Marginal / Coastal Habitat 基質別 / Depth ティア別・実装済み）

- `src/extensions/shipbuilding/generators/portCapacity.ts` の `computeBurgPortCapacity()` に
  `elevationFactor`・`coastalHabitatFactor`（いずれも`total`への乗算）と、
  `evaluateHarborDepth()`/`computeLargeDepthShareMultiplier()`による水深ティア別`large`減算を実装済み
  （§4.1〜§4.3の式どおり）。関数シグネチャは`harborByCell: ArrayLike<number>`から
  `pack: PackedGraph` + `heightExponent: number` を受け取る形に変更した
  （`cells.h`/`cells.haven`/`cells.c`/`cells.coastalHabitat`が必要なため）。
- 単体テスト: `src/extensions/shipbuilding/generators/portCapacity.test.ts`
  （Marginal帯での容量縮小、Depthティア別の`large`0/半減/満額、基質別`coastalHabitatFactor`の適用を
  個別に検証）。
- **未実装のまま**: 維持費（Economy拡張向け）。Shipbuilding拡張の既存の疎結合パターン
  （`dependencies: [{ id: "economy", required: false }]`、CustomEventベースの通知）を再利用し、
  Economy拡張側の burg/state 経常支出に「Harbor works」的な行を追加する形を想定しているが、
  具体的な支出計算式は [state-treasury-department-budget](state-treasury-department-budget.md) 系の
  既存の経常支出パターンに合わせて別途設計する必要がある（本書のスコープ外のまま）。
  したがって、現状 Elevation Marginal / Coastal Habitat Marginal / Depth マージナル帯は「容量が
  下がるだけで実際のコストは発生しない」状態 — §4.1〜§4.3 で説明した「Economy無効時はコストなしで
  適用される」の状態が、Economy有効時にもまだ続いている。

## 6. 未解決の論点

1. `ELEVATION_FACTOR_FLOOR`（0.4）・`HARBOR_COASTAL_HABITAT_FACTOR_TIDAL_FLAT`（0.6）・
   `HARBOR_COASTAL_HABITAT_FACTOR_SANDY`（0.5）の具体値はいずれも本書での仮置きであり、バランス
   調整が必要。
2. 維持費を払わなかった場合に各`*Factor`が時間経過で更に低下する「劣化」を入れるか、単に定額の
   経常支出として扱うかは未決定（後者の方が実装コストは低い。前者はSimulation層のtick駆動ロジックが
   新たに必要）。
3. ~~`tidalFlat`への維持費モデル適用は候補地ゲートの二値述語という性質と衝突する~~ →
   **解決済み（§4.3）**: 候補地ゲート（`allowsFormalHarbor`）自体を廃止し、Elevation Unsuitableだけを
   唯一の候補地ゲートとして残すことで、基質側は完全に収容力側（`coastalHabitatFactor`）だけで表現
   できるようになった。
4. 探索半径（Depth）・標高しきい値（Elevation）・基質別`*Factor`はいずれも本書の暫定値。地形の生成
   テンプレート（フィヨルド系・平坦海岸系など）ごとに、どの程度のセルがMarginal/Unsuitableへ落ちるかを
   実データで検証してから確定するのが望ましい（§8「バランステスト」は未実施のまま）。
5. 維持費そのもの（Economy拡張側の経常支出）が未実装なため、Elevation Marginal / Coastal Habitat
   Marginal / Depth マージナル帯は現状「容量が下がるだけ」で、§4が意図した「維持費を払えば環境改善
   できる」の"維持費を払う"側の仕組みがまだ存在しない（§5.3）。
6. 干拓（`tidalFlat`/`sandyBeach`の恒久的な陸地化）は本書のスコープ外のまま。§4.4のとおり、
   [urban-water-and-sanitation-system.md](urban-water-and-sanitation-system.md)の公共事業ライフサイクル
   （同書§4）に接続する形で設計するのが望ましいという方針だけを記録し、具体設計は未着手。

## 7. 定数一覧（実装済み — `src/generators/harborSiteConditions.ts`）

| 定数 | 値 | 用途 |
| :--- | -: | :--- |
| `HARBOR_ELEVATION_IDEAL_MAX_M` | 30 | Ideal / Marginal の境界 |
| `HARBOR_ELEVATION_UNSUITABLE_MIN_M` | 100 | Marginal / Unsuitable の境界（候補地ゲート） |
| `ELEVATION_FACTOR_FLOOR` | 0.4 | Marginal帯での`elevationFactor`下限 |
| `HARBOR_DEPTH_SMALL_MIN_M` | 2 | 小型ティアに必要な水深 |
| `HARBOR_DEPTH_MEDIUM_MIN_M` | 4 | 中型ティアに必要な水深 |
| `HARBOR_DEPTH_LARGE_MARGINAL_MIN_M` | 4 | 大型ティア・維持費付きで開放される下限水深 |
| `HARBOR_DEPTH_LARGE_MIN_M` | 6 | 大型ティア・無条件で開放される水深 |
| `HARBOR_DEPTH_SEARCH_RADIUS_SMALL` | 1 | 小型ティアの水深探索ホップ数 |
| `HARBOR_DEPTH_SEARCH_RADIUS_MEDIUM` | 2 | 中型ティアの水深探索ホップ数 |
| `HARBOR_DEPTH_SEARCH_RADIUS_LARGE` | 3 | 大型ティアの水深探索ホップ数 |
| `HARBOR_COASTAL_HABITAT_FACTOR_TIDAL_FLAT` | 0.6 | `tidalFlat`基質での`coastalHabitatFactor` |
| `HARBOR_COASTAL_HABITAT_FACTOR_SANDY` | 0.5 | `sandyBeach`/`coastalDune`基質での`coastalHabitatFactor` |

`ships.md` §4.3 の既存定数（`POWER_LAW_COEFFICIENT` 等）と同じ扱いで、`portCapacity.ts` から
参照する named export として実装済み。

## 8. テスト計画

| 種別 | 検証内容 | 状態 |
| :--- | :--- | :--- |
| 単体テスト | `evaluateHarborElevation()`/`findNearbyMaxDepthMeters()`/`computeLargeDepthShareMultiplier()` の境界値（h=19/20/24/25/30/31、探索半径0/1/2/3） | ✅ `harborSiteConditions.test.ts` |
| 単体テスト | `heightExponent` を変えたときに Elevation ティア境界がメートル基準で不変であること（`h`基準では変わって良い） | ✅ `harborSiteConditions.test.ts` |
| 単体テスト | `evaluateHarborCoastalHabitat()` が `rockyIntertidal`/`none`/未定義をIdealに、`sandyBeach`/`coastalDune`/`tidalFlat`をMarginalに分類し、いずれも`tier`だけで除外を意味しないこと | ✅ `harborSiteConditions.test.ts` |
| 単体テスト | Elevation Unsuitable帯の burg が `collectPortCandidates()`/`developPort()` で候補から除外されること／砂浜海岸の burg は除外されず港が成立すること | ✅ `burgs-generator.test.ts` |
| 単体テスト | Elevation Marginal帯で `elevationFactor` が容量を縮小すること／浅い入江でDepthティア別に`large`が0・半減・満額に分かれ、小型・中型は不変であること／基質別に`coastalHabitatFactor`が容量を縮小すること（`rockyIntertidal`は無penalty、`sandyBeach`＝`coastalDune`＜`tidalFlat`の順に厳しいこと） | ✅ `portCapacity.test.ts` |
| 生成テスト | フル生成パイプラインでElevation Unsuitable帯の海岸線に正式港湾候補が生成されないこと。全基質で小型ティアがゼロにならないこと | ⬜ 未実施（上記は最小フィクスチャでのユニットテストのみ） |
| バランステスト | フィヨルド系・平坦海岸系テンプレートで各ティアの分布を確認し、§7 の定数を調整する | ⬜ 未実施（§6 論点4） |
