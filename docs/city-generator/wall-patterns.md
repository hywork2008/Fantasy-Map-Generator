# City Generator — 外壁生成パターンの設計

M4b（`design.md §4.2` の S4 / `burg-feature-options.md §4.1`）の初回実装は、S3 が塗った
`urban` セル集合の外周を `smoothWall` の弱い 1 パスで平滑化してそのまま描いている。結果:

- **輪郭の凹凸がそのまま壁長になる。** `classifyUrban` は gate 触手（`GATE_PULL`）と海岸楕円で
  意図的にいびつなので、なぞると凹んだ長い壁になる。
- **海側にも一様に curtain wall が回る。** 港前面を石壁で塞ぐのは一形態にすぎない。
- **どの burg も「濃いセルを囲うだけ」で同じ絵になる。** 都市生成ツールとしては単調。

参照実装（`~/Projects/TownGeneratorTS/docs/city-generation-and-rendering.md §2.3`）が破綻しないのは、
`inner` が「原点からの距離順の最初の N パッチ」＝ほぼ円盤で、外周が最初から凸に近いから。
本プロジェクトの `urban` はそうではない。**壁の輪郭を `urban` 集合とは別レイヤーにする**必要がある。

本書は S4 の壁生成に持たせるオプション体系と、FMG descriptor 側に足すべき情報を定義する。
`docs/plan/city-generator/v2/` は不採用（`design.md §4.2` 参照）。

---

## 0. 用語

| 語 | 意味 |
| --- | --- |
| **エンベロープ** | 壁が囲うべき閉領域。S5 街路・S6 街区のトポロジ基盤。必ず単純閉ループ |
| **壁線** | エンベロープの周をどう引くか（規則性・平滑度・凹み埋め） |
| **セグメント** | 壁線を辺単位に分けたもの。辺ごとに種別（land / coast / river / citadel共有）を持ち、描画を変える |
| **岸 relief** | 汀線際の陸の高さ・傾斜。港の成立可否と `wallCoast` の既定を分ける |

---

## 1. S4 を 3 レイヤーに分ける

現状は「`urban` 外周 → 平滑化 → 全辺 `Overlay{wall}`」の 1 段。これを:

| レイヤー | 決めること | 入力 | 出力 |
| --- | --- | --- | --- |
| **1. エンベロープ** | 囲う領域の形（`wallEnvelope`） | `urban` セル集合、`cityRadius`、河川、海岸線 | 単純閉ループ（`BorderLoop`） |
| **2. セグメント分類** | ループの各辺を land / coast / river / citadel共有 に | ループ、`waterPolygon`、river `edgeTrack`、citadel precinct | 辺タグ付きループ |
| **3. 壁線描画** | 種別ごとに masonry wall / sea wall / quay / open / moat（`wallCoast` `wallLine` `wallExtent`） | タグ付きループ、`program`、岸 relief | `Overlay{wall|citadelWall|quay|rampart|moat}` + 塔 + 門 |

`urban` 集合自体はいびつなままでよい（街区・街路には有機的な形が要る）。**変えるのはエンベロープだけ。**
史実の壁も「建った市街 + 余白」を直線区間で囲い、家並みをなぞらない。

---

## 2. `wallEnvelope` ── 囲う領域の形

| id | 内容 | 向く都市 |
| --- | --- | --- |
| `hull` | `urban` セル重心の凸包 → 最寄りセル辺へ内側スナップ。凹みゼロ・最短周長 | **既定**（`walls:true`）。計画的・コンパクト都市 |
| `notchFilled` | `urban` 外周をなぞるが、深さ `> notchDepth·cellSize`（既定 3）の凹みだけ弦で橋渡し。大きな張り出し（河曲・岬）は残す | 有機的な旧市街 |
| `sectorPolygon` | 重心から `k` 本のスポーク（`k` = 6..12）、各扇形の最遠 `urban` セルまでを半径にした `k` 角形 | ローマ castrum / バスティード（規則的） |
| `denseCore` | 連結度・近傍 `urban` 率が閾値以上のセルだけ囲い、細い触手は城壁外の faubourg として残す | 郊外（faubourg）を持つ大都市 |
| `expanded` | `hull` + セル 1 リング分の余白 | 成長余地を見込む都市 |

- どれも **閉ループを返す**（`denseCore` で切り落とした触手は `shanty` / outskirts のまま城壁外）。
- 画像の「凹んで総延長が伸びる」問題は `notchFilled`（既定を検討）＋壁線 `polygonal` で解消。
- `citadel` があるセルは常にエンベロープに含める（内周の外側でも取り込む。`burg-feature-options.md §4.2`）。

---

## 3. `wallCoast` ── 海岸セグメントの扱い

エンベロープは常に閉じるが、**海側の弧の描画**を切り替える:

| id | 海側の弧を… | 妥当な条件（岸 relief） |
| --- | --- | --- |
| `open` | 壁を描かない。汀線が境界。低い護岸／杭列は任意（`Overlay{quay}` 細） | `port` かつ遠浅（傾斜 `< ~4%`） |
| `quayWall` | 低い港湾壁（curtain より薄い）+ 水門 1 | 商業港・中規模 |
| `seaWall` | 本格的な海岸城壁（M4b の現挙動） | 露出海岸・襲撃圏・`citadel`/`capital`、または `port` なし |
| `harborBasin` | 壁を海側へ張り出して泊地を囲む + 防波堤モール + 水門 | 要塞化港（`port && citadel`） |
| `setBack` | 壁を汀線の 1 セル内陸へ。波止場・造船所・倉庫は城壁外 | 中傾斜（`~4–12%`）の岸 |

- `open` でも**エンベロープの海側の辺は残す**（S5/S6 は閉領域を要る）。描画だけ `quay` or 無し。
- `harborBasin` は水門（`Overlay{gate, water:true}`）を 1、モールは `Overlay{wall}` の短い突堤 2 本。
- `wallCoast` の既定は §7 の岸 relief 推定 →（無ければ）`port ? "open" : "seaWall"`。UI で上書き可。

---

## 4. `wallLine` ── 壁線の規則性

| id | 引き方 | パラメータ |
| --- | --- | --- |
| `organic` | エンベロープ頂点を ±10% ジッタ + 地形追従（稜線・河岸に吸着） | jitter, 追従強度 |
| `polygonal` | **アンカー（門・塔・地形節点）の間を直線で結ぶ。** 中間頂点は落とす | `minSegment`（最小区間長）, 塔間隔 40–70 m |
| `geometric` | 正 `n` 角形／稜堡（星形）に整形 | `n`, 稜堡深さ |

**`polygonal` だけで周長のムダと過剰なギザギザが消える。** M4b の `smoothWall`（弱 Laplacian 1 パス）は
`organic` の弱い版に相当。`reserved`（門・城塞共有頂点）は全モードで固定。

補助パラメータ（全モード共通）:

- `notchDepth` ── これより深い凹みは壁線段階でも弦で埋める（エンベロープが `hull` 以外のとき）。
- `moatOnLand` ── 陸側に外堀（`Overlay{moat}`、壁外 5–10 m / 幅 8–15 m）。河川・海と接続可。

---

## 5. `wallExtent` ── 完全性

| id | 内容 | 条件 |
| --- | --- | --- |
| `full` | 全周を壁（海側は `wallCoast` に従う） | 既定（`walls:true`） |
| `landwardOnly` | 陸側の接近路だけ壁。水・崖の側は地形任せ | 半島の頸部、急崖に囲まれた高地、`wallCoast:open` の大部分 |
| `rampart` | 土塁 + 濠（`Overlay{rampart}`、石壁なし） | 小人口・辺境・`suggestedArchetype` が nomadic/colonial 系 |
| `none` | 壁なし（`program.walls:false` と同義。`border` は不可視境界のまま） | 開放集落 |

`program.walls` は on/off のみ。`on` の中で `full` / `landwardOnly` / `rampart` を選ぶ。

---

## 6. セグメント種別（`BorderLoop` の辺タグ）

`BorderLoop` を拡張し、周の各辺に種別を持たせる:

```ts
export type WallSegmentKind = "land" | "coast" | "river" | "citadel";

export interface BorderLoop {
  points: Point[];
  /** points[i]–points[i+1] の辺の種別（length = points.length、最後は points[n-1]–points[0]）。 */
  segments: WallSegmentKind[];
  urbanCellIds: number[];
}
```

分類ルール（S4、エンベロープ確定後）:

- `coast` ── 辺の中点が `waterPolygon` 境界の `≤ cellSize` 内、または辺の外側セルが `sea`。
- `river` ── 辺がいずれかの river `edgeTrack` に沿う（`≤ cellSize`）。壁は跨がず、両端に水門。
- `citadel` ── 辺が citadel precinct の外周と共有（`walls:true` なら主壁に融合、`burg-feature-options.md §4.2`）。
- 残り ── `land`。

描画（`render/svg.ts`）は辺タグ × `wallCoast` / `wallLine` / `wallExtent` で分岐:

| タグ | `full` | `landwardOnly` |
| --- | --- | --- |
| `land` | masonry wall + 塔 | masonry wall + 塔 |
| `coast` | `wallCoast` に従う（`open`=無 / `quayWall` / `seaWall` / …） | 無（or `quay` 細） |
| `river` | 岸沿いに薄い壁 + 水門 2 | 無（河川が防御） |
| `citadel` | 主壁と一体（`walls:true`）/ `citadelWall`（`walls:false`） | 同左 |

---

## 7. FMG 連携 ── Elevation とプランの妥当性

### 7.1 いま descriptor にあるもの

`terrain.heightfield`（`size` 17 × `spacingMeters` ≈ 窓 / 16、`elevationsMeters[]` + `waterMask[]`）、
`terrain.gradePercent`、`terrain.downhillAzimuthDeg`、`terrain.elevationMeters`。

3 km 窓で格子間隔 ~190 m なので「この汀線セルが海抜 3 m か 40 m か」は出ない
（FMG 世界セルが ~1–2 km なので元データにも無い）。

### 7.2 当面（descriptor 変更なし）

既存 heightfield の水陸境界（`waterMask` の 0↔1 変化点）付近で **標高勾配** を取り、
`waterbody.shoreAzimuthDeg` 方向の岸 relief クラスを推定:

| 推定傾斜 | 岸クラス | `wallCoast` 既定 | 備考 |
| --- | --- | --- | --- |
| `< ~4%` | 遠浅 | `open` / `quayWall` | 港向き |
| `~4–12%` | 段丘 | `setBack` | 波止場は城壁外 |
| `> ~12%` | 崖 | `seaWall`（崖上で終端）| 港は不成立。`port` フラグに UI 警告 |

UI（スタンドアロン）に上書きセレクタ: `Coast wall: auto / open / quay / sea wall / basin`。

### 7.3 descriptor v2 で足すフィールド（`DESCRIPTOR_VERSION` バンプ）

FMG は世界の高さ格子を持ち、burg-site サービスは既にそれをサンプルして `heightfield` を作っている。
安価に追加できる:

```ts
interface BurgSiteWaterbody {
  // 既存 …
  /** 汀線際の陸の性状。FMG の陸セル高 − 海面 を海岸線距離で割って導出。 */
  shoreType?: "beach" | "bank" | "cliff";
  /** 汀線際の陸の高さ (m)。数 m = 港向き、数十 m = 崖。 */
  shoreReliefMeters?: number;
  /** shoreline[] 各頂点の陸側標高サンプル (m)。無ければ shoreReliefMeters を一様適用。 */
  shoreHeightsMeters?: number[];
}

interface BurgSiteTerrain {
  // 既存 …
  /** 窓内の起伏の振幅 (m)。壁の地形追従・crest-follow の要否判断。 */
  localReliefMeters?: number;
  /** 主要な稜線の方位（compass度）。`wallLine: organic` の吸着先。null = 平地。 */
  ridgeAzimuthDeg?: number | null;
}
```

`incomingSite.ts` の `parseDescriptor` は optional なので旧 descriptor もそのまま通る
（バンプは「意味が変わったフィールドがある」ときのみ。追加だけなら不要かは §11 で確定）。

---

## 8. 既定マトリクス ── 「全部同じ」を避ける

descriptor に既にある `suggestedArchetype` / `population` / `port` / `citadel` / `capital` ＋
岸クラス（§7.2）＋河川有無で振り分け:

| 立地 | `wallEnvelope` | `wallCoast` | `wallLine` | `wallExtent` |
| --- | --- | --- | --- | --- |
| harbor・遠浅・城なし | `hull` | `open` | `polygonal` | `landwardOnly` |
| harbor・`citadel` / `capital` | `hull` | `harborBasin` or `seaWall` | `organic` | `full` |
| harbor・段丘 | `hull` | `setBack` | `polygonal` | `full` |
| harbor・崖 | `sectorPolygon` | `seaWall`（崖上終端） | `organic` crest-follow | `landwardOnly` |
| riverCrossing | `notchFilled`（河曲を残す） | ── | `organic` + `moatOnLand` | `full` |
| hillTop | `sectorPolygon`（等高線沿い） | ── | `organic` crest-follow | `full` |
| crossroads・大人口 | `expanded` / `denseCore` + faubourg | ── | `polygonal` | `full` |
| 小集落（pop < ~2000） | `notchFilled` | ── | `organic` | `rampart` or `none` |

`population` は密度も動かす: 大きいほど `denseCore` 側、小さいほど `rampart` 側。
スタンドアロン UI では上のプリセットに加え各軸を個別に上書きできる。

---

## 9. データモデル追加案（`core/types.ts`）

```ts
export interface WallPlan {
  envelope: "hull" | "notchFilled" | "sectorPolygon" | "denseCore" | "expanded";
  coast: "open" | "quayWall" | "seaWall" | "harborBasin" | "setBack";
  line: "organic" | "polygonal" | "geometric";
  extent: "full" | "landwardOnly" | "rampart" | "none";
  /** 凹み埋め深さ（cellSize 倍）。 */
  notchDepth: number;
  /** 陸側外堀を描くか。 */
  moatOnLand: boolean;
}

export const DEFAULT_WALL_PLAN: WallPlan = {
  envelope: "notchFilled", coast: "open", line: "polygonal",
  extent: "full", notchDepth: 3, moatOnLand: false
};
```

- `CityProgram` とは別（`program.walls` は「壁を持つか」、`WallPlan` は「どんな壁か」）。
- `generateCity(params, geo, program, wallPlan = DEFAULT_WALL_PLAN)` の第 4 引数、または
  `program` に `wallPlan?: WallPlan` を内包（配線の少ない後者を推奨）。
- `siteInput.ts` に `siteToWallPlan(site, program): WallPlan` ── §8 マトリクスを descriptor から引く純関数。
- `GenerationResult` の `borders: BorderLoop[]` に `segments` を追加（§6）。

---

## 10. 実装順

| 段 | 内容 | データ要件 |
| --- | --- | --- |
| **M4b 仕上げ** | `BorderLoop.segments`（§6）+ `wallEnvelope` の `hull` / `notchFilled` + `wallCoast` の `open` / `seaWall` + `wallLine` の `polygonal` / `organic` + §8 マトリクスの `siteToWallPlan` + スタンドアロン UI の Wall 行。**画像の 2 問題（海側の壁・凹みの周長）はここで解消** | 既存 descriptor のみ |
| **M4b.1** | `sectorPolygon` / `denseCore` / `expanded`、`landwardOnly` / `rampart`、`moatOnLand`、§7.2 の岸勾配推定で `wallCoast` 自動選択 | 既存 heightfield |
| **descriptor v2** | `shoreType` / `shoreReliefMeters` / `shoreHeightsMeters` / `localReliefMeters` / `ridgeAzimuthDeg`（§7.3）→ `harborBasin`、崖の rampart-omit、`setBack`、`organic` の稜線追従 | FMG service 拡張 |

---

## 11. 非目標 / 未決

1. 壁体の断面（厚み・胸壁・歩廊）、櫓・城門の建築ディテール ── S7 以降。
2. 港湾の泊地・突堤の実ジオメトリ ── `harborBasin` は概形（張り出し + モール 2 本）まで。
3. 攻城・破却で欠けた壁、増築で二重になった壁（拡張リング）── 将来。
4. **§7.3 の追加が `DESCRIPTOR_VERSION` バンプを要するか。** optional 追加のみなら不要のはず
   （`parseDescriptor` は形状チェックが緩い）。契約 `docs/plan/city-generator/v2/13-fmg-site-input.md`
   ではなく本書＋ `site/burgSiteDescriptor.ts` の型コメントで管理する方針で要確定。
5. `wallEnvelope` の既定を `hull` にするか `notchFilled` にするか ── ブラウザ実測で決める
   （`hull` は最も「設計された」見た目、`notchFilled` は河曲・岬を残せる）。
6. `denseCore` の閾値（近傍 `urban` 率 / 連結度）。窓外縁の粗密（`design.md §8.3`）と絡む。
