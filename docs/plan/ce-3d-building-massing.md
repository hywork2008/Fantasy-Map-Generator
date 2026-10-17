# CE 建物の3D属性(マッシング)と3D表示・FMG/REへの配置

2026-10-17 設計。未実装。

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
- 属性を割り当てる関数は1つにする: `assignBuildingMassing(document, lots)`。住居容量の fit(`fitImportedHousing`)で `storeys` が確定した**後**に実行する。容量計算が使う `storeys` は唯一の値とし、massing 側に別の値を複製しない。
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

- `CityDocument.version` を上げ、`massing` を保存する。旧ドキュメントは読み込み時に `assignBuildingMassing` で補完する(loadRepairs と同じ方式)。
- 3D を描くたびに再計算しない。2D の編集(区画の移動など)で、その区画の massing だけ作り直す。

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

FMG 3D と同じ `WebGPURenderer` と TSL のマテリアルを使い、`src/renderers/` から共有モジュールとして切り出す。

### 4.2 構成

```
src/city3d/                         // shared by CE, FMG, RE (no DOM in core)
  core/massingGeometry.ts           // BuildingMassing -> positions/normals/ids (pure, testable in Node)
  core/roofGeometry.ts              // gable/hip/... on an arbitrary convex or near-convex footprint
  core/simplify.ts                  // LOD generation (§5)
  three/cityMeshes.ts               // geometry -> THREE objects, merged per block, TSL materials
src/city-editor/render3d/           // CE viewer: OrbitControls, picking -> lot inspector
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
| M0 | `BuildingMassing` の型、`assignBuildingMassing`、全区画への付与、保存と旧データの補完 | Node テスト: 全区画に massing があり、`storeys` が容量計算と一致する |
| M1 | `src/city3d/core` の押し出しと屋根のジオメトリ(Node で動き、DOM 不要) | 三角形数と閉じた形(watertight)のテスト |
| M2 | CE の 3D ビューア(three.js、ピッキング、区画の情報表示) | Playwright でスクリーンショット |
| M3 | ランドマーク・城壁・塔・門・橋の `StructureMassing` | ― |
| M4 | L1/L2 の生成と `CityMassingExport` | 三角形数の上限 |
| M5 | FMG 3D への配置(CE 未生成の都市は手続き的な代替) | ― |
| M6 | RE への配置(RE 3D の設計後) | ― |

## 8. 未決事項

- 古代の insula の 5 階建ての内部構成(1 階の店舗 taberna + 上階の賃貸)を、§3.3 の一般規則でまかなうか、専用の archetype にするか。
- 木造の張り出しで隣の区画に入る場合の扱い(2D の区画からはみ出すことを許すか)。
- FMG の save サイズの上限(都市数 × L1 を全て持つかどうか)。
