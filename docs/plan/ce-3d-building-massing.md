# CE 建物の3D属性(マッシング)と3D表示・FMG/REへの配置

2026-10-17 設計。同日補強（§9、§10）。実装は CE 単体の M0–M3。M4 以降は未実装。

## 1. 目的と最終形

1. CE で生成した都市の建物を、建物ごとに「階数・各階の用途・屋根・材質・高さ」を持つ 3D 描画可能なデータにする。
2. CE 内で 3D 表示する。
3. その都市から簡略版(LOD)を作り、FMG の 3D (viewMesh) と、将来 3D を追加する RE に配置する。

データ(§3)を描画ライブラリから独立させ、CE・RE・FMG の3つが同じ出力を読む形にする。

## 2. 現状

| 項目 | 現状 | 3D に足りないもの |
| --- | --- | --- |
| `BuildingLot.storeys` | 住居だけ `applyResidentialStoreys` が設定する。外周部は 2 以下、`medievalFabric` は 2/3 固定 | 非住居(工房・倉庫・店舗専業・ランドマーク)は未設定で、容量計算では 1 として扱う |
| `uses` / `residentialFloorShare` | 区画全体の用途の集合と、住居に使う床の割合 | どの階が何に使われるかが無い |
| `archetype` / `role` | 区画の性格(small-house〜port-workyard)と棟の役割(main/wing/store/workshop/stable/shed) | 高さ・屋根に変換する規則が無い |
| `LandmarkInstance` | 位置・回転・敷地ポリゴン・asset 参照 | asset の高さ・形の情報が無い |
| 城壁・塔・門・橋 | 2D の線・ポリゴン | 高さが無い |
| 地形 | CE のローカル地形は平坦。FMG のセル標高は descriptor にある | 建物の接地標高 |
| FMG 3D | `src/renderers/three-d-renderer.ts`(three.js WebGPU + TSL) | 都市を置く口が無い |
| FMG 2D | `src/renderers/webgl/deckRenderer.ts`(deck.gl OrthographicView) | ― |
| RE | 2D(`src/region-editor/render`) | 3D 自体が無い |

## 3. データ設計

### 3.1 原則

- **描画用の正本は生成時に一度だけ確定させる。** 描画側で乱数や推定をしない(CE・FMG・RE で見た目が一致し、決定論も保てる)。
- 2D の `BuildingLot` は壊さない。3D 属性は `BuildingLot.massing` として足し、旧データでは無いもの(optional)として扱う。
- 属性を割り当てる関数は1つにする: `assignBuildingMassing(document, lots)`。住居容量の fit で `storeys` が確定した**後**に実行する。`massing.storeys` は描画側が lot を見ずに済む複製で、必ず `BuildingLot.storeys`（未設定の住居は容量計算と同じく 1）と一致する。別の階数を持たない。確定した手順は §9。
- 長さの単位はメートル、座標は CE ローカル(既存の `Point`)を使う。

### 3.2 型

```ts
// src/city-editor/types/contracts/buildingMassing.ts
export type FloorUse =
  | "residential" | "retail" | "craft" | "storage" | "stable"
  | "civic" | "religious" | "military" | "service";

export type RoofForm =
  | "gable" | "hip" | "flat" | "lean-to" | "pyramid" | "conical" | "dome" | "spire";

export type WallMaterial = "timber-frame" | "stone" | "brick" | "mudbrick" | "wattle" | "plaster";
export type RoofMaterial = "thatch" | "tile" | "slate" | "shingle" | "lead" | "turf";

export interface FloorSpec {
  /** 0 = ground floor. Cellars are kept separately and are not drawn. */
  level: number;
  use: FloorUse;
  heightMeters: number;
}

export interface BuildingMassing {
  /** Same value as BuildingLot.storeys (cellars excluded); duplicated here so renderers need only this object. */
  storeys: number;
  floors: FloorSpec[];          // length === storeys
  cellar: boolean;
  /** Upper-floor overhang (jetty) per floor, metres. 0 for antiquity / stone. */
  jettyMeters: number;
  eaveHeightMeters: number;     // sum(floors.heightMeters)
  roof: {
    form: RoofForm;
    pitchDeg: number;
    /** Ridge direction in radians, CE local frame. Medieval gable-to-street is perpendicular to the frontage. */
    ridgeAzimuth: number;
    material: RoofMaterial;
  };
  wall: WallMaterial;
  /** Ground elevation from FMG cell heights (metres above sea level). */
  baseElevationMeters: number;
  /** Shading only; must not affect geometry. */
  tint: number;                 // 0..1 deterministic per-building variation
}
```

`BuildingLot` に `massing?: BuildingMassing` を追加する。ランドマーク・城壁・塔・門・橋には、別の型 `StructureMassing` を用意する(線分に沿った押し出し: 幅・高さ・胸壁の有無。塔は円柱か角柱と屋根)。

### 3.3 割り当て規則

| 属性 | 規則 |
| --- | --- |
| 階数(住居) | 既存の `applyResidentialStoreys` の値を使う |
| 階数(非住居) | `role` から決める: workshop 1–2、store/warehouse 2–3(階高を大きく)、stable/shed 1、`port-workyard` の倉庫は 3 まで。時代の `residentialStoreys(period).maximum` を超えない |
| 各階の用途 | `uses` に retail か craft があれば 1 階をその用途、2 階以上を住居にする。`residentialFloorShare` は、この階の分け方から逆算した値に揃える(容量計算と 3D で矛盾させないため。値の算出は1か所に集約する)。storage が主の区画は全階を storage、屋根裏を storage にする規則は任意 |
| 階高 | 1 階 3.5–4.5 m(店舗・工房・倉庫は高い)、上階 2.8–3.2 m。時代ごとの表を `src/utils/urbanMorphology.ts` 系に置く |
| 張り出し(jetty) | 中世の timber-frame で上階ごとに 0.3–0.6 m。古代と石造は 0 |
| 屋根の形 | 細長い区画は gable、正方形に近い区画は hip/pyramid、古代の insula と地中海文化は低勾配の tile か flat、塔は conical/spire、教会はランドマーク asset に従う |
| 棟の向き | 区画が通りに面する最長の辺を求め、中世北方は妻入り(辺に直交)、古代・地中海は平入り(辺に平行)にする。文化と伝統(`project_culture_civilization_overhaul` の tradition)で切り替える |
| 材質 | 文化・時代・バイオーム(森林量)・富(archetype: patrician/elite は stone)で決める。`docs/plan` の文化別の表に揃える |
| 接地標高 | descriptor にある FMG セル標高を、区画の重心で双線形補間する(`project_ce_river_flow_elevation` と同じ入力)。斜面では基壇(plinth)で吸収する |
| 色の揺らぎ | `seed + lot.id` から決定論的に作る |

### 3.4 保存

当初は `CityDocument` に massing を保存する案だった。建物ロットは文書に無く `buildBlockFabric` が導出するため、今回は保存しない。手順は §9.2。

## 4. CE 単体の 3D 表示

### 4.1 ライブラリの選定: three.js を推奨

| 観点 | three.js | deck.gl | その他 |
| --- | --- | --- | --- |
| FMG で使っているか | 3D(viewMesh)で使用中。WebGPU + TSL | 2D の hybrid レンダラで使用中(OrthographicView) | ― |
| 勾配屋根・張り出し・塔 | 自前でジオメトリを作れる | `SolidPolygonLayer` は平らな押し出しだけ。屋根は `SimpleMeshLayer` に自前のメッシュを渡す必要がある | MapLibre の fill-extrusion も平屋根だけ |
| 数万棟 | InstancedMesh か、ブロック単位で BufferGeometry を結合する | 得意(属性バッファで一括) | ― |
| 最終目的(FMG 3D への配置) | **同じシーンに直接入れられる** | three のシーンと重ねるには deck を別キャンバスにして、カメラと深度を同期する必要がある | Babylon.js は3系統目の依存になる |
| ピッキング | Raycaster か、ID を GPU に書き出す方式 | 標準で付いている | ― |

**結論:** three.js を使う。理由は、最終的に FMG の three.js シーンに置くこと、屋根の形が必要なことの2つ。deck.gl の利点(大量データの宣言的描画とピッキング)は、ブロック単位のジオメトリ結合と ID バッファで代替できる。deck.gl を使うのは、CE 内の「平屋根の押し出しだけを使う、検証用の簡易表示」程度に留める。

ジオメトリはライブラリに依存しない。CE のビューアは `WebGLRenderer` と `MeshLambertMaterial` を使う（§9.8）。FMG と同じ `WebGPURenderer` と TSL へ載せるのは M5 で、同じ頂点バッファを渡す。

### 4.2 構成

```
src/city3d/                         // shared by CE, FMG, RE (no DOM in core)
  core/massingGeometry.ts           // BuildingMassing -> positions/normals/ids (pure, testable in Node)
  core/roofGeometry.ts              // gable/hip/... on an arbitrary convex or near-convex footprint
  core/simplify.ts                  // LOD generation (§5)
  three/cityMeshes.ts               // geometry -> THREE objects, merged per block, TSL materials
src/city-editor/renderers/           // CE viewer: OrbitControls, picking -> lot inspector
```

- 屋根は、凸に近い区画では straight skeleton を簡略化した方式(長辺方向の棟 + 寄棟)で作る。凹な区画は凸分割してから作る。作れない区画は flat に落とす。
- ジオメトリはブロック単位で1つの BufferGeometry に結合し、頂点属性 `buildingIndex` を持たせる。これでピッキングと、選択した区画の強調表示に使う。

## 5. 簡略版(LOD)

| LOD | 用途 | 内容 | 目安 |
| --- | --- | --- | --- |
| L0 | CE の 3D | 全建物、屋根、張り出し | 都市全体で 10^5 三角形程度まで |
| L1 | RE の 3D / FMG で近接 | 街区ごとに建物を union して1つの塊にする。高さは面積加重の中央値、屋根は gable 一枚か flat。ランドマーク・城壁・塔は L0 の簡略形 | 1 都市 2–5k 三角形 |
| L2 | FMG の 3D(縮尺の大きい表示) | 市街地の外形 + 平均の軒高、城壁、ランドマークの上位 3–5 棟(教会の尖塔・城の天守)だけ | 1 都市 200–500 三角形 |

- LOD は CE で作り、`CityMassingExport` として出力する: `{ burgId, ceRevision, origin, lods: { L1, L2 } }`。座標は CE ローカルのメートル単位で、配置のための変換(FMG の座標・方位・縮尺)を持たせる。
- 保存先は FMG 側の burg に紐づくキャッシュとする(`.fmg` の任意セクション。圧縮した Float32 配列)。CE を開いていない都市は手続き的な代替(人口・時代・城壁から作る L2 の汎用の塊)で表示し、CE で生成した都市だけを実データに差し替える。
- 同じ都市で CE を作り直したら `ceRevision` で無効にする。

## 6. FMG 3D / RE への配置

- FMG の 3D は地形に縦方向の誇張(exaggeration)をかけている。建物にはそれとは**別の**縮尺を適用し、地形の誇張に合わせて伸ばさない。表示上は、建物の縮尺を都市の大きさに合わせて誇張する設定を用意する(実寸のままでは FMG の縮尺では見えないため)。
- 接地は FMG の三角形の標高から取る。CE の `baseElevationMeters` との差は、都市全体の基準高で吸収する。
- 都市の範囲の地形を少し平らにする(CE の外縁で地形と馴染ませる)処理は L1 だけに適用する。
- RE の 3D は、RE の地形の上に L1 を配置する。RE に 3D を追加すること自体は別の設計書の範囲とする(このドキュメントは `src/city3d` を共有する前提だけを決める)。

## 7. 段階

| 段階 | 内容 | 確認 |
| --- | --- | --- |
| M0 | `BuildingMassing`、`assignBuildingMassing`、`buildBlockFabric` の戻りへの付与。文書バージョンは上げない | Node テスト: 非ランドマークに massing があり、住居容量が変わらない |
| M1 | `src/city3d/core` の押し出しと屋根（Node、DOM 不要） | 閉じた形（watertight）のテスト |
| M2 | CE の 3D ビューア（WebGL、オービット、ピッキング、読み上げ） | ブラウザで 3D を開いて棟を拾う |
| M3 | ランドマーク・城壁・塔・門・橋の `StructureMassing` と CE 3D への描画。手順は §10 | 閉じた形のテスト。ブラウザで城壁と門を見る |
| M4 | L1/L2 の生成と `CityMassingExport` | 今回はやらない |
| M5 | FMG 3D への配置 | 今回はやらない |
| M6 | RE への配置 | 今回はやらない |

## 8. 決着（2026-10-17）

- 古代の insula は専用 archetype を作らない。1 階が retail、上階が residential の一般規則で表す。
- 張り出しは 2D の区画と容量の外にはみ出してよい。隣棟・街路への衝突は解かない。総量は 1.2 m で止める。
- FMG の save サイズは M5 まで決めない。今回は massing を保存しない。

## 9. 今回の実装で確定したこと

RE と FMG への配置は対象外。ゴールは、CE の建物に 3D 属性を付け、CE の中で都市（建物の塊と地面）を 3D 表示すること。

### 9.1 建物は保存しない

`BuildingLot` は `CityDocument` に無い。`buildBlockFabric` が導出する。

- `massing` は保存しない。`CityDocument.version` は上げない。loadRepairs でも補完しない。
- `assignBuildingMassing` は純粋関数で、`buildBlockFabric` がキャッシュへ入れる直前に全棟へ付ける。
- キャッシュは既存の fabric WeakMap。指紋が変われば棟ごと作り直す。区画単位の部分更新は、区画が個別に永続化されていないのでやらない。
- ランドマーク（`landmark: true`）と頂点が 3 未満のリングには付けない。

### 9.2 階数

住居容量が使う数と massing の数は同じにする。容量を変えない。

- `storeys` が 1 以上で既にあるときはそれを使う。lot には書き戻さない。
- 住居（`isResidentialBuilding`）で未設定のときは、容量計算と同じく 1 とする。lot には書かない。
- 非住居で未設定のときだけ lot に書く（容量は 0 なので住居数は変わらない）。上限は `residentialStoreys(period).maximum`。period は `urbanMorphology.period`、無ければ `historicalPeriod`、無ければ `ageOfExploration`。

| 条件 | 階数 |
| --- | --- |
| `role` が shed または stable | 1 |
| `role` が workshop | min(2, 上限) |
| `role` が store、または archetype が warehouse-compound / port-workyard | min(3, 上限) |
| その他の非住居 | min(2, 上限) |

範囲の乱数は使わない。

### 9.3 階の用途

`residentialFloorShare` は容量が既に読んでいる。書き換えない。階の並びはその割合の量子化。

1. `uses` が無ければ `["residential"]`。住居を含むかは、`uses` に residential がある、または（`uses` が無く role が main か未設定）のとき。
2. 地上階: role が workshop、または craft があり retail が無い → craft。retail がある → retail。role が stable → stable。role が store / shed、または residential が無く storage がある → storage。それ以外 → residential。
3. 住居を含み地上階が住居なら全階 residential。住居を含まず地上階が storage / stable / craft なら全階その用途。
4. 地上階が店舗か工房で上に住居があるとき、住居階数は `round(share * storeys)` を 0 .. storeys-1 に収める。share の既定は、用途が混ざるとき 0.55、否则 0.85（既存と同じ）。上階は住居を先に埋め、残りは地上階と同じ用途。
5. 古典・後期古代で軒高が 21 m を超えたら、全階高を `21 / 軒高` 倍する。

| 用途 | 地上 (m) | 上階 (m) |
| --- | --- | --- |
| residential | 3.2 | 2.9 |
| retail, craft | 4.0 | 3.2 |
| storage | 4.5 | 3.6 |
| stable | 3.6 | 3.0 |

`eaveHeightMeters` は階高の和。`cellar` は false（地下室は平面を伸ばすだけで階にしない）。`baseElevationMeters` は 0（CE の地面は平ら。FMG 標高は M5）。

### 9.4 材質・屋根・張り出し

バイオームは `document.biome` の name / key / tags。砂漠・arid・steppe は乾燥。forest・taiga・jungle・woodland は森林。地中海系は faith が classicalPolytheism / semiticPolytheism / sunni / shia / judaism / orthodox / zoroastrian、または fortification が islamic / classical。東アジア系は faith が sinitic / neoConfucian / shintoBuddhist / mahayana / theravada / vajrayana / hindu、または fortification が japanese / sinitic。富裕は archetype が patrician-house / elite-compound。

壁:

1. 乾燥かつ非富裕 → mudbrick
2. 富裕、または古典・後期古代、または fortification が classical → stone
3. 東アジア系 → timber-frame
4. 地中海系 → lateMedieval 以降は plaster、それより前は stone
5. 中世（early / high / late） → timber-frame
6. 森林 → timber-frame
7. それ以外 → brick

屋根材: mudbrick は turf。地中海系・古代・東アジアは tile。中世の timber-frame は thatch。それ以外の timber-frame は shingle。lateMedieval 以降で地中海系でなければ slate。残りは tile。

屋根形: shed / stable は lean-to。mudbrick、または古代で 4 階以上は flat。凹ポリゴンは flat（張り出しも 0）。否則、最長辺 / 最短辺が 1.45 以上なら gable、未満なら hip。

勾配（度）: flat は 2。thatch 48、tile 32、slate 40、shingle 38、turf 8、lead 15。

棟の向き（ラジアン、CE ローカル、`atan2(dy, dx)`）: 正面の代理は最短辺。中世で地中海系でも東アジア系でも古代でもないとき、棟はその辺に直交（妻入り）。それ以外は辺に平行（平入り）。

張り出し: 壁が timber-frame で中世かつ凸なとき、上階ごとに 0.4 m。幾何は `min(1.2, 階番号 * 0.4)` だけ外側へオフセットする。2D と容量は変えない。それ以外は 0。

色の揺らぎ: `growthRandom(`${generationSeed ?? fabric.seed ?? "massing"}:massing:${lot.id ?? faceId:index}:tint`)`。幾何には影響しない。

### 9.5 幾何

`src/city3d/core/massingGeometry.ts`。入力はポリゴンと massing。出力は壁と屋根の三角形（position, normal）。three.js を import しない。

- 軸: three の X = CE の X、Y = 高さ、Z = CE の Y。
- 凸で gable / hip: 棟線は `v = vMid` と外形の交点。gable はその交点を両端にし、hip は両端を `min(半幅, 半長)` だけ内側へ寄せ、棟高は `その長さ * tan(勾配)`。各辺を棟へつなぐ。妻側の直立した三角形は壁に入れる。
- lean-to: 最長辺を高い棟にし、その辺は軒から棟までの垂直な面（壁）。他の辺は軒の高さから棟へつなぐ。
- flat と凹: 外形を耳切りして軒高で塞ぐ。
- 張り出し: 凸オフセット。階と階の間の下面（soffit）を塞ぐ。
- 底面は y = 0。壁・屋根・底・soffit で閉じる。作れないリングは null（描かない）。

### 9.6 ビューア

`src/city-editor/renderers/cityView.ts`。地図の「3D / 2D」ボタンで開く。開くまで WebGL もジオメトリも作らない。

- `WebGLRenderer`、`OrbitControls`、半球光と平行光。地面は `frame.extentMeters` の円盤。
- 壁を 1 メッシュ、屋根を 1 メッシュにまとめ、頂点色で材質と tint を塗る。
- 頂点属性 `buildingIndex` と Raycaster で棟を拾い、階数・壁・屋根・軒高と階用途を表示する。拾った棟は稜線で強調する。
- fabric オブジェクトが同じ間はメッシュを作り直さない。2D のパンでは作り直さない。
- M2 の時点では城壁・塔・門・橋・ランドマーク asset を出さない。M3 で §10 のとおり足す。

### 9.7 テスト

- `buildingMassing.test.ts`: 階の並び、容量不変、倉庫の階数、材質、古代の 21 m、決定論。
- `massingGeometry.test.ts`: flat / gable / hip / lean-to / 張り出しが閉じていること、棟が軒より高いこと。

## 10. M3 構造物

建物と同じく保存しない。`CityDocument.version` は上げない。`collectCityStructures(document)` が描画の直前に決める。2D が描く位置と幅を使い、高さだけをここで足す。堀、広場、坂、星形要塞の斜面は描かない。

### 10.1 型

`src/city-editor/types/contracts/structureMassing.ts` の `StructureMassing`。kind は `wall` | `tower` | `gate` | `bridge` | `landmark`。材質は城壁の `stone` | `wood`。形は中心線の帯（`centerline` と `widthMeters`）か、閉じた `footprint` のどちらか。`heightMeters` は基壇からの躯体高。屋根の立ち上がりは含まない。`baseElevationMeters` は地面からの底面。`roof` は `none` | `flat` | `gable` | `hip` | `pyramid`。`parapet` は `none` | `outer` | `both`。胸壁は歯を一枚ずつ作らず、帯の上の低い縁にする。`spire` は足跡の重心に載る円錐。穴あきポリゴンの穴は抜かない。

### 10.2 城壁

立っている `kind: "wall"` の中心線を押し出す。`defenseCircuits` に載っていて、その全てが `razed` の壁は出さない。回路に載らない壁は出す。新様式の城の壁もこの中心線で出す（縄張ポリゴンは重ねない）。

幅は `style.widthMeters`。胸壁の有無は `resolveWallGeometry` の `hasWalkway`。城の壁（`castleWallIds`）は高さを 2 m 足す。

| 材質 | 胸壁あり | 胸壁なし |
| --- | --- | --- |
| stone | 躯体 8 m、胸壁 1.1 m | 躯体 5 m |
| wood | 躯体 4.5 m、胸壁 0.8 m | 躯体 3.2 m |

胸壁の幅は `parapetWidth`。外側へ `(壁厚 - 胸壁幅) / 2` ずらす。外側は町の中心（広場、無ければ `[0,0]`）から遠い側。

### 10.3 塔と門

2D の `townFortificationSvg` と同じ位置にする。新様式の城の壁にはこの円塔を置かず、`buildFortressPlan` の塔を使う。

- 壁上の円塔: 半径 `幅 * 0.8`。間隔は城 32 m、それ以外 `max(45, blockSize * 1.4)`。川の中と、門から `幅 * 3` 以内は置かない。高さは壁の躯体 + 4 m。石は pyramid（円に近ければ円錐）、木は flat。
- 古典城の隅塔: 折れ角 30° 以上、半径 `幅 * 1.05`、門から 14 m 以内は置かない。
- 門: `gateCrossingFrame` があるもの。開口は 2D と同じ式（`passageWidthMeters` か `max(道路幅 + 2.2, 壁厚 * 0.9)` に斜めの余裕）。壁の中心線を開口の半分ずつ欠く。
- 門の脇塔: 一辺 `壁厚 * 1.6` の正方形。開口の外へその半分。高さは壁 + 2.5 m、pyramid。新様式の門には置かない。
- 門の楣: 開口を渡る梁。底面は壁高 − 1.2 m、厚さ 1.2 m、奥行きは壁厚。kind は `gate`。
- 新様式の城は `buildFortressPlan` の塔と建物を出す。防御門のポリゴンは通路を含むので押し出さない。建物の高さは天守 18 m、小天守 12 m、広間・御殿・礼拝堂 9 m、それ以外 6 m。天守は pyramid、ほかは gable。

### 10.4 橋

`bridgeDecks` のうち、斜角が `documentBridgeSkewLimit` を超えるものは出さない（2D と同じ）。幅はデッキ幅。底面 0.4 m、厚さ 0.55 m。両側に幅 0.35 m、高さ 0.9 m の欄干。

### 10.5 ランドマーク

- `document.landmarks` の asset 足跡（無ければ site）を、位置・回転・縮尺のあとで押し出す。高さは `clamp(sqrt(面積) * 0.55, 7, 22)`。長辺 / 短辺が 1.45 以上なら gable、未満なら hip。名前が church / cathedral / basilica / chapel / shrine / abbey / mosque / temple / stupa / minster を含むとき、最大の足跡に尖塔を載せる。
- 寺院要素は 2D と同じ長辺・短辺・回転の矩形。megalith は高さ 2.2 m の flat。shrine は木造 5.5 m の gable。chapel は 7 m、basilica は `clamp(長辺 * 0.28, 9, 16)`。chapel と basilica に尖塔。種別が無ければ長辺 24 m 未満を chapel とする。
- 古典城の `parts` は足跡を押し出す。keep は 16 m の pyramid、chapel は 9 m の gable、ほかは 7 m の gable。
- `landmark: true` の建物ロットは建物マッシングを付けず、高さ 12 m の gable として出す。

### 10.6 幾何とビューア

`src/city3d/core/structureGeometry.ts`。three.js を import しない。帯は左右にオフセットした四角柱（隅はマイター、長さは幅の 4 倍まで）。足跡は `buildingSurfaces` に渡す。円塔の pyramid は円錐になる。底面・側面・上面で閉じる。尖塔は軒高から載せる小さな pyramid。

ビューアは壁用と屋根用のメッシュを建物と別に足す。`buildingIndex` は構造物配列の番号。近い方を拾い、種類・材質・高さを表示する。fabric が同じ間は作り直さない。
