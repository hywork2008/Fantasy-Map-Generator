# 02. アーキテクチャ・データモデル

## 1. 技術スタック（変更なし）

| 項目 | 採用 | 備考 |
|------|------|------|
| 言語 | TypeScript (strict) | |
| ビルド | Vite | |
| 描画 | deck.gl 9 (OrthographicView) | 2.5D 押し出し表示 |
| UI | Tweakpane | パラメータパネル |
| テスト | Vitest | 単体・プロパティ・スナップショット |
| 幾何演算 | 自前実装を基本とし、ブーリアン演算のみ @turf/turf | turf への依存は `core/geometry` 内に隔離する |

## 2. 既存コードの扱い

| 対象 | 方針 |
|------|------|
| `src/render/`, `src/ui/`, `src/io/`, `src/main.ts` | **再利用**。データモデル変更に追従して修正 |
| `src/generation/rng.ts` | **再利用・拡張**（ストリーム分岐を追加、下記 §5） |
| `src/generation/geometry.ts` | **移設・拡張**（`src/core/geometry.ts` へ） |
| `src/generation/` のその他（streets, wards, lots, buildings, walls, districts, landmarks, terrain, sewers, aqueduct, tunnels, roadCorridor, stats） | **新実装で置き換え**。各マイルストーン完了時に旧ファイルを削除し、参照実装として残さない |
| `src/types.ts` | **v2 モデルへ全面改訂**（下記 §4） |
| 地下構造（下水・カタコンベ・水道橋） | v2 スコープ外。バックログへ（[12-roadmap.md](12-roadmap.md) 参照） |

## 3. モジュール構成

```
src/
  core/            # 汎用基盤。都市のドメイン知識を持たない
    rng.ts         # シード付き乱数 + ステージ別ストリーム分岐
    geometry.ts    # ベクトル・ポリゴン演算（inset, clip, 面積, 最近点...）
    graph.ts       # 平面グラフ（ノード・エッジ・面抽出）
    curves.ts      # スムージング（Chaikin / Catmull-Rom）・リサンプリング
    grid.ts        # スカラー場グリッド（地形・コスト場）と A* 経路探索
  model/
    types.ts       # CityModel v2 の型定義（§4）
  generation/      # ステージごとに 1 ファイル。純関数のみ
    index.ts       # generateCity(params): パイプラインの組み立てのみを行う
    terrain.ts     # S1: 地形・河川
    skeleton.ts    # S2: 骨格（広場・門・ランドマーク敷地）
    arteries.ts    # S3: 幹線道路
    walls.ts       # S4: 城壁・城門
    streets.ts     # S5: 二次・三次街路
    blocks.ts      # S6: 街区抽出（平面グラフの面）
    districts.ts   # S7: 地区割当
    lots.ts        # S8: バーゲージ・プロット分割
    buildings.ts   # S9: 建物・施設
    fields.ts      # S6b: 城壁外の耕地・郊外
  validation/
    metrics.ts     # 構造妥当性メトリクス（テストと HUD の両方から使う）
  render/          # deck.gl レイヤー構築、デバッグ表示
  ui/              # Tweakpane, HUD, URL 状態
  io/              # GeoJSON / PNG エクスポート
```

原則:

- `generation/` の各ステージは **入力（前ステージの成果物 + params + rng ストリーム）→ 出力（モデルの一部）** の純関数。モジュール内に可変グローバル状態を持たない。
- `core/` は `model/` に依存しない。`generation/` は `render/`・`ui/` に依存しない。
- deck.gl・DOM に触れるのは `render/`・`ui/`・`main.ts` のみ。`generation/` と `validation/` は Node（Vitest）単体で実行可能に保つ。

## 4. データモデル v2（骨子）

中心となるのは **道路の平面グラフ** である。街区・敷地・建物はすべてグラフから導出される。以下は骨子であり、実装時にフィールド追加は許容する（削除・意味変更は本書を更新すること）。

```ts
type Point2 = [number, number];
type Ring = Point2[]; // 閉リング（先頭 = 末尾）

/** 道路網の平面グラフ。全交差点はノード化されている（不変条件） */
interface RoadGraph {
  nodes: RoadNode[];          // { id, p: Point2, edgeIds: number[] }
  edges: RoadEdge[];          // { id, a: nodeId, b: nodeId, roadId }
  roads: Road[];              // 論理的な 1 本の道（エッジ列をまとめたもの）
}

type RoadRank = "highway" | "artery" | "street" | "alley";
interface Road {
  id: number;
  rank: RoadRank;
  width: number;              // m。rank ごとの規定幅 ± 揺らぎ
  path: Point2[];             // スムージング済みポリライン
  edgeIds: number[];
}

interface Block {
  id: number;
  ring: Ring;                       // 凹多角形可
  frontages: BlockFrontage[];       // 辺ごとの接道情報
  districtId: number;
  inWall: boolean;
}
interface BlockFrontage {
  edgeStart: number;                // ring 上の辺インデックス
  roadId: number;
  rank: RoadRank;                   // 商業価値の高い順: artery > street > alley
}

interface Lot {
  id: number;
  blockId: number;
  ring: Ring;
  frontage: { roadId: number; rank: RoadRank; span: [Point2, Point2] } | null;
  // frontage === null は袋地。建物は建てず use は garden/yard に限る（不変条件）
  use: LotUse;                      // house | shop | workshop | garden | yard | precinct ...
  frontWidth: number;               // 間口 m
  depth: number;                    // 奥行 m
}

interface Building {
  id: number;
  lotId: number;
  parts: Ring[];                    // 矩形の組み合わせ。parts[0] が主屋
  frontageDir: Point2;              // 接道辺の単位接線。主屋はこれに平行
  floors: number;
  height: number;
  roof: { style: "thatch" | "tile" | "slate"; ridgeAxis: "parallel" | "perpendicular"; height: number };
  kind: BuildingKind;               // house | rowhouse | shop | church | ... （09 参照）
}

interface Wall {
  ring: Ring;
  towers: Point2[];
  gates: Gate[];                    // { position, direction, roadId } — 必ず幹線上にある
  moat?: Ring;
}

interface District { id: number; type: DistrictType; blockIds: number[]; }
type DistrictType = "market" | "noble" | "craft" | "trade" | "poor" | "religious" | "castle" | "suburb" | "farmland";

interface CityModel {
  params: CityParams;
  terrain: TerrainModel;            // 高度場・傾斜場・川・橋候補（04 参照）
  skeleton: SkeletonModel;          // 広場・門アンカー・ランドマーク敷地（03 参照）
  graph: RoadGraph;
  wall: Wall;
  blocks: Block[];
  districts: District[];
  lots: Lot[];
  buildings: Building[];
  landmarks: Landmark[];
  fields: FieldStrip[];             // 城壁外の耕地短冊
  stats: ValidationReport;          // 11 のメトリクス算出結果を常に同梱
}
```

### CityParams v2

```ts
interface CityParams {
  seed: string;
  sizePreset: "small" | "medium" | "large";   // 15 / 40 / 100 ha
  siteArchetype: "riverCrossing" | "hillTop" | "harbor" | "crossroads"; // 04 参照
  numGates: number;            // 3–6
  plannedQuarter: boolean;     // バスティード地区を 1 つ含めるか
  irregularity: number;        // 0–1。道路・敷地の揺らぎ量の全体係数
  wallShape: "organic" | "polygon";
}
```

`numWards`・`wallStarDepth` など v1 のボロノイ由来パラメータは廃止する。

## 5. 決定論と乱数

- `generateCity(params)` は純関数。同一 params → 同一 `CityModel`（スナップショットテストで担保）。
- 乱数は **ステージ別ストリーム** を使う: `rng.fork("arteries")` のように `hash(seed + stageName)` で独立ストリームを作る。これにより、あるステージのパラメータ変更が他ステージの結果を巻き添えにしない（デバッグと差分確認が容易になる）。
- `Math.random`・`Date.now` の使用は `generation/`・`core/` 内で禁止。

## 6. パフォーマンス予算

| 項目 | 予算 |
|------|------|
| 中都市（40 ha）の全生成 | < 1.5 s |
| 大都市（100 ha）の全生成 | < 5 s |
| 再描画（生成なし） | 60 fps 維持 |

予算超過時は最適化タスクを起票する。予算のためにステージの不変条件を壊してはならない。
