# City Editor — 手動都市作製の設計

`src/city-generator/` が決定論的に都市案を**生成**するのに対し、City Editor はその案または空の格子を出発点に、セル・辺・都市要素を直接編集して保存する独立 MPA である。本書では TownGeneratorTS の操作感（セル格子を編集し、辺に道・壁・川を載せる）を目標とする。ただし TownGeneratorTS の GPL コードは参照・移植しない。既存の `docs/city-generator/` と公開アルゴリズム、FMG の MIT コードだけを利用する。

## 1. 決定事項

| 項目 | 決定 |
| --- | --- |
| URL / ビルド | Vite MPA の `/city-editor/`。`src/app.ts` / world-map の module graph には入れない |
| 初期格子 | `city-generator` の最終 Voronoi 格子を変換して使える。空の新規図では同じ Voronoi builder を使う |
| 編集の真実源 | SVG ではなく、恒久 ID を持つ平面メッシュ + 辺のフィーチャーグループ + 都市要素 |
| 河川 | **頂点列**を流れの真実源とし、隣接する頂点間の既存セル辺を導出する。海・湖に接する頂点で終端し、水域内の river edge は持たない |
| 自動生成 | 選択範囲または未固定のセルだけに実行。手で置いた/固定した要素を再生成で失わない |
| 取消 | すべての確定編集は undo / redo のコマンド。ドラッグ中はプレビューだけで、pointer up で 1 コマンドにする |

### 1.1 Voronoi と自由な頂点移動を両立させない

Voronoi は「母点から導出されたセル」という性質であり、共有頂点を任意に動かした時点で厳密な Voronoi ではなくなる。このため、編集対象を **Voronoi 由来の平面メッシュ** と定義する。

- **Voronoi モード**: 母点の追加・削除・移動で全体を再計算する。新しいセル配置を素早く作るためのモード。
- **手動メッシュモード**: 頂点の移動、セルの分割/併合、辺への敷設を行う。セルが Voronoi である必要はない。

モードを曖昧にして「頂点を動かしても Voronoi」と表示しない。Voronoi の再計算はトポロジーを置換する破壊的な操作なので、既存の辺フィーチャーを持つ文書では移管プレビューと確認を必須にする。

## 2. MPA とモジュール境界

`vite.config.ts` の `rollupOptions.input` へ、既存の `main` と `city` を残したまま次を追加する。

```ts
cityEditor: path.resolve(__dirname, "src/city-editor/index.html")
```

```text
src/city-editor/
  index.html                     # #city-editor-root、editor 専用 CSS
  main.ts                        # mountCityEditor のみ
  core/
    types.ts                     # CityDocument / Mesh / FeatureGroup / CityElement
    document.ts                  # 新規文書、JSON serialize/parse、schema version
    fromGeneration.ts            # GenerationResult / CityExport -> CityDocument
    mesh.ts                      # adjacency、面積、edge lookup、再構築
    validate.ts                  # 交差、ゼロ面積、feature 参照の検証
    geometry.ts                  # nearest edge、snap、split/merge、縮尺変換
    voronoiEdit.ts               # site ベースの再生成と移管レポート
    featureGroups.ts             # 辺列の延長、分割、削除、競合検査
    cityElements.ts              # ward/precinct/lot の生成・固定規則
    commands.ts                  # reversible command と履歴
  render/
    svg.ts                       # document -> SVG layers、hit targets、selection overlay
    palette.ts
  ui/
    CityEditorPage.ts            # DOM shell、tool state、キーボード操作
    Toolbar.ts
    Inspector.ts
    LayersPanel.ts
    FeatureGroupsPanel.ts
    HistoryPanel.ts
  io/
    cityEditorFile.ts            # .fmg-city-editor.json の import/export
    incomingCity.ts              # sessionStorage / URL hash の受け渡し（後述）
```

`src/city-editor/` は `src/app.ts` を import しない。初期生成と City Generator 出力の取り込みに限って `src/city-generator/core/*` とその export 型を import してよい。これにより world-map bundle からの分離を保ちつつ、格子生成アルゴリズムを二重実装しない。

## 3. 永続データモデル

SVG の `path` や浮動小数点座標を ID として使わない。頂点移動後も同じ辺を `river #1` が参照し続けることが必要なためである。

```ts
type Id = string;
type Point = [number, number]; // local metres; +X east, +Y north

interface Vertex { id: Id; point: Point; locked?: boolean }
interface Edge {
  id: Id;
  a: Id; b: Id;               // canonical endpoint order
  leftFace: Id | null;
  rightFace: Id | null;       // null = map boundary
  locked?: boolean;
}
interface Face {
  id: Id;
  // counter-clockwise. `forward` gives the direction through the canonical Edge.
  boundary: Array<{ edgeId: Id; forward: boolean }>;
  site?: Point;               // Voronoi origin; manual edits may leave it stale
  properties: FaceProperties;
}
interface Mesh { vertices: Record<Id, Vertex>; edges: Record<Id, Edge>; faces: Record<Id, Face> }

interface EdgeRef { edgeId: Id; forward: boolean }
interface CityElement {
  id: Id;
  kind: "ward" | "plaza" | "citadel" | "temple" | "harbor" | "gate" | "tower" | "building";
  faceIds: Id[];
  geometry?: Point[];         // buildings / custom precincts only
  generated: boolean;
  locked: boolean;
  properties: Record<string, unknown>;
}
interface CityDocument {
  format: "fmg-city-editor";
  version: 1;
  frame: { extentMeters: number; cityRadiusMeters: number };
  mesh: Mesh;
  featureGroups: FeatureGroup[];
  elements: CityElement[];
  source?: CityDocumentSource;
  view?: { center: Point; zoom: number }; // optional, not part of geometry
}
```

`Face.boundary`、`Edge.leftFace/rightFace`、頂点座標の三者は相互検査する。隣接表・面ポリゴン・edge hit-test 用 index は毎回導出値であり、ファイルへ冗長保存しない。

### 3.1 河川は頂点列、道路・城壁は辺列

道路と城壁は選択した実 edge の列をそのまま保存する。河川は、流向と合流/河口を曖昧にしないため、頂点 ID の順序列を保存する。隣接する二頂点には必ず一つの Mesh edge が存在し、その edge 列は描画・bank 分断・建物セットバック用に導出する。個々の edge に `river: true` のような重複状態は保持しない。

```ts
interface EdgeFeatureGroup {
  id: Id;
  kind: "road" | "wall";
  name: string;
  segments: EdgeRef[];
  style: { widthMeters: number; class?: string };
  locked?: boolean;
}
interface RiverGroup {
  id: Id;
  kind: "river";
  name: string;
  /** upstream -> downstream. Each adjacent pair must be a real Mesh edge. */
  vertices: Id[];
  source: { vertexId: Id; kind: "mapBoundary" | "spring" | "tributary" };
  mouth: { vertexId: Id; kind: "mapBoundary" | "water" | "river"; targetId?: Id };
  style: { widthMeters: number; class?: string };
  locked?: boolean;
}
type FeatureGroup = EdgeFeatureGroup | RiverGroup;
```

`mouth.kind === "water"` は、終端 vertex が `sea` / `lake` / `openWater` face に接していることを要求する。この water face は `FaceProperties` の明示的な水域種別であり、単に青く塗られたセルではない。最後の頂点から先へ進む河川 edge は保存しない。描画は丸い cap、または水面にクリップした短い河口の装飾で閉じるが、それはメッシュや経路の一部ではない。

セル辺の分割では、該当 edge を通る `RiverGroup.vertices` に新 vertex を挿入する。これが edge ID の置換より一段処理を要する代わりに、河口・合流・流向が data 上で直接読める。

| 組合せ | 扱い |
| --- | --- |
| road + road | 同一グループの延長のみ許可。別グループへの重複追加は拒否 |
| river + river | 同一 edge の共用は拒否。合流は共有**頂点**で upstream River の mouth を downstream River に接続する |
| river + road | 河川が導出する edge との重複は拒否。交差は共有頂点に bridge 要素を置く将来拡張 |
| wall + road | 許可。ただし road が wall を横切るのではなく、壁の終端頂点へ Gate 要素を作る |
| wall + river | 許可（岸壁/水門）。wall group に `waterGate` 要素を関連付けられる |

道路・城壁の削除は「選択 edge を group から取り除き、連続でなくなった残りを新しい `Road #n` / `Wall #n` 群へ分割する」か「group 全体を削除」の二択にする。河川の trim は選択 vertex を新しい mouth にして下流側を除去する。孤立した名前だけを残さない。

### 3.2 河川の基準: セル辺 vs セル頂点

「頂点基準」といっても、二つの頂点を結べばその間には必ずセル辺がある。mesh 外の自由線を許さない限り、河川の**通過区間**は edge から導出される。ここで比較するのは、河川を保存・選択・終端判定する主語を edge に置くか、流向を持つ vertex 列に置くかである。

| 案 | メリット | デメリット |
| --- | --- | --- |
| A. edge 列を保存（当初案） | 道路・城壁と同一型で実装が小さい。edge split/merge 時にフィーチャーを移管しやすい。bank を隔てる edge を直接特定できる | 河口が「どの edge で終わるか」になり、水域へ入る edge を追加しがち。流向・source・mouth・合流先が group 外の推測になる。海/湖セルでの扱いを誤ると FMG と同様に水面を突き抜ける |
| B. vertex 列を保存（採用） | `source -> … -> mouth` と流向が明示的。water face に接する vertex を河口にでき、水域内 edge が不要。合流は同一 vertex で明快。UI も「現在の終端頂点から次の辺を選ぶ」と自然 | 実際の通過 edge は依然必要で、頂点だけでは自由曲線にはならない。edge split 時に vertex 列への挿入が必要。粗い格子では水際 vertex が少なく、望む河口位置がない |
| C. FMG 型の独立 polyline | 任意の滑らかな川幅・河口・FMG descriptor への忠実な追従が容易 | セル変形後に川・城壁・建物の set-back が乖離する。水面を越えた区間を別規則で切る必要があり、二つの座標系を再び持つ |

**採用は B を基本にしたハイブリッド**である。River group の永続表現と河口/合流 UI は vertex 基準、通過 edge・bank 分断・set-back・描画の中心線はそこから導出する。水域に接する頂点がない場合は、任意の水面内へ延長しない。利用者は (1) 水際 edge を split して river-mouth vertex を作る、または (2) Cell Split で河口へ通じる land edge を作る。この一手間は、海中に見えない river edge を自動挿入するより安全で説明可能である。

FMG 由来の大河が都市窓で水面の大部分を占める場合は、そもそも `RiverGroup` にしない。`openWater` face（都市側 bank を shoreline とする）に分類し、支流だけをその water vertex で終端させる。これは既存の `docs/city-generator/water-context.md` の「幅の広い川は water area」という方針とも一致する。

## 4. 操作と UI

画面は City Generator と同じ north-up SVG + pan/zoom を使う。描画の下から `terrain / cells / roads / rivers / walls / city elements / selection & handles` の順とし、hit target は表示線より太くして選択しやすくする。

### 4.1 常設 UI

- 左ツールバー: Select、Vertex、Cell、Voronoi sites、Road、Wall、River、Ward/Element、Pan。
- 上部: New / Import / Export、Undo / Redo、grid 表示、snap、全セル倍率、生成/検証。
- 右 Inspector: 選択した vertex / edge / face / feature group / element の数値・属性・ロック。
- 右 Layers: セル、母点、頂点、道路、城壁、河川、ward、建物を表示/ロック。非表示レイヤーは hit-test しない。
- 下部 Groups: `River #1` のような一覧、色、太さ、名称、source/mouth vertex（道路・壁は開始/終端 edge）、選択、複製、削除。River/road/wall の作成ボタンは番号を自動採番する。
- 下部 Status: 現在の tool、snap 値、選択数、検証エラー、未保存状態。

### 4.2 基本操作

| Tool | 操作 | 確定結果 |
| --- | --- | --- |
| Select | click / shift-click | 対象を選択し Inspector を表示 |
| Vertex | vertex を drag | 共有頂点を一度だけ移動。隣接する全セルを同時更新 |
| Scale all cells | 基準点（map center / selected face centroid）と倍率を指定 | 全頂点、face site、都市半径、線幅を同率で変換。範囲も自動拡張する |
| Cell | face を選択し Split | 対向する二つの boundary edge を選び、切断線で 1 face を 2 face にする |
| Cell | face と隣接 face を選択し Merge | 共有 edge を除去して単純多角形に併合。凹多角形は許可するが交差は許可しない |
| Voronoi sites | site を add / move / delete | 新しい Voronoi 格子を作り、移管レポートを確認して置換 |
| Road / Wall | 既存 group を選ぶか New、edge を順に click | 端点が連続する場合だけ append/prepend。逆順 click も吸収 |
| River | New を押し、source vertex と隣接 edge を順に選ぶ | vertex 列を upstream → downstream に追加。water face 接続 vertex では Finish を促す |
| Road / Wall | selected edge を click | group 内の区間だけを除去し、必要なら group を分割 |
| River | selected vertex / edge を click | vertex を mouth として trim、または group 全体を削除 |
| Ward / Element | cells を paint、または face を選んで Add | ward、plaza、citadel、temple、harbor、gate/tower を作成・固定 |

`Esc` は現在の辺列/頂点列作成を破棄、`Enter` は辺列または river vertex 列を確定、`Delete` は選択対象を削除、`Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` は undo / redo とする。選択に応じて無効なコマンドを表示しない。

### 4.3 River editor と同じ「流れ」の操作感

River tool は FMG の `rivers-creator.ts` と同様に、点を羅列するのではなく選んだ順を保持する。ただしこのページでは自由座標でなく**セル頂点**である。

1. `New River` を押すと `River #n` を作り、source vertex を選ぶ。
2. ハイライトされるのは現在の終端 vertex に接続する edge のみ。click で上流→下流の順に延長する。
3. water face に接する vertex、map boundary、または既存 River の終端でだけ `Finish` が有効になる。水面側へ edge を選択する UI は出さない。
4. junction では既存 River の終端へ接続できる。合流先は別 group として維持する。
5. `Finish` で確定。Inspector から名前、幅、色、bank 名を編集できる。
6. Groups 一覧を選べば全区間を同色で強調し、任意 vertex から trim/delete できる。

道路・城壁も同じ `FeatureGroup` UI を使う。河川だけを特別な自由曲線にしないので、頂点をドラッグすれば道路・壁・川は常に同じ格子に整合して変形する。

## 5. 幾何と安全性

すべての編集前に候補状態を作り、以下に失敗したら commit しない。ドラッグ中には最後に有効だった座標へ clamp する。

1. edge の長さが `minEdgeLength` 未満でない。
2. 隣り合わない edge 同士が交差/接触しない。
3. 各 face の boundary が閉じ、頂点が重複せず、面積の絶対値が `minFaceArea` 以上。
4. face の向きは CCW。外枠と face の外へ出る操作は許可しない（frame 拡張は Scale all cells だけ）。
5. road/wall の全 `segments.edgeId`、river の全 `vertices`、`CityElement.faceIds` が存在する。river の隣接 vertex 対は実 edge を持ち、mouth は指定した water face / River group / map boundary に接続し、group の連続性・役割競合を満たす。

vertex snap は `off / grid / vertex / edge projection`。edge projection は既存 edge 上のスナップだけで、edge を勝手に分割しない。分割は明示的な Cell Split 操作に限定する。

### 5.1 Voronoi 再生成時の移管

site を編集して再計算すると edge ID は変わる。実行前に次の移管表を出す。

| データ | 移管規則 |
| --- | --- |
| face properties / ward | 旧 face centroid を含む新 face へ移す。複数は面積重なり最大を採用 |
| precinct / building | centroid が入る face を割り当てる。収まらない building は unplaced として一覧へ |
| road/wall | 古い edge polyline を新 edge graph へ nearest + A* で投影。完全連続でない group は「未移管」とする |
| river | 旧 vertex spine を新 graph へ nearest + A* で投影し、mouth は接続先 water face / parent river に接する候補 vertex へ再解決する。見つからない group は「未移管」とする |

未移管 group を黙って削除しない。Preview で「移管済み / 要確認 / 未移管」を表示し、利用者が確認してから新 mesh を採用する。MVP では feature group が存在する文書での Voronoi 再生成を警告付きの明示操作にし、手動メッシュ編集を優先する。

## 6. 都市要素の作製

セル形状と線形フィーチャーが基盤で、都市要素は別レイヤーとして載せる。これにより「セルを直したら街路・河川がずれる」問題と「再生成で手作業が消える」問題を分離する。

### 6.1 MVP

- Face properties: sea level 基準の `elevation`（`0` 以下 = water）、`land/sea/urban/outskirts/rural`、ward kind、buildable、locked。
- Precinct tools: plaza、citadel、temple、harbor をセル選択から作製し、名称・ロックを編集。
- 道路・河川・城壁を障害/セットバックとして使い、選択したセルまたは `buildable && !locked` セルに ward と建物ロットを生成。
- `Generate selected` と `Regenerate unlocked` を別ボタンにする。前者は選択外を変更せず、後者も `locked` の `CityElement` は保持する。
- Gate/tower は wall group の vertex にだけ置ける。道路が壁に到達した場所では Gate 作成を提案するが自動作成はしない。

既存 `city-generator/core/{wards,buildings,streets}.ts` の純粋な規則は、`CityDocument` の face polygon と edge reservation を入力できる小さな adapter を通して再利用する。生成コードが `GenerationResult` 全体や UI に依存する場合は、先に core 内へ純粋関数として抽出する。City Editor から City Generator の UI/pipeline を改変・逆 import しない。

### 6.2 後続

- building footprint の個別移動・回転・削除、橋、water gate、quay、複数層の道路種別。
- 境界セルを選ぶ Wall assistant（都市セルの外周を候補として提示するが、確定は group 編集）。
- FMG Burg の feature flags から初期 precinct を提案し、Editor 側の手編集を world map へ書き戻さない export。

## 7. 入出力と City Generator 連携

保存形式は `*.fmg-city-editor.json`。format/version と上記 `CityDocument`、任意の source（元 City Export の digest、Burg descriptor の ID/seed）を保存する。JSON schema の version は City Generator export とは独立に管理する。

開始経路は三つにする。

1. **New**: extent、cell size、seed から Voronoi 格子だけを作る。
2. **Open City Generator export**: `CityExport` の最終 `result.cells`、river paths、walls/streets/wards/buildings を `CityDocument` に変換する。polygon の共有座標を量子化して一つの Vertex/Edge に正規化する。river path は land 側 edge graph に投影し、最初に water face へ接する vertex を mouth にする。既存出力に水面内の点があっても Editor JSON へは移さない。
3. **FMG Burg handoff（後続）**: City Generator と同じ `BurgSiteDescriptor` を sessionStorage/hash で受け、最初に生成案を出してから `fromGeneration` へ変換する。

City Editor は world map を直接更新しない。Export SVG/PNG と Editor JSON を提供し、将来の FMG 側取り込みは別の明示的な契約として設計する。

## 8. 実装順と受入条件

| Milestone | 範囲 | 受入条件 |
| --- | --- | --- |
| E0 | MPA scaffold、空文書、SVG pan/zoom、JSON export/import | `/city-editor/` が world bundle を import せず build できる |
| E1 | `GenerationResult -> Mesh`、cell/edge/vertex 選択、検証、undo/redo | 同一境界を共有するセルが一つの Edge ID を共有する |
| E2 | Vertex drag、snap、Scale all cells、Cell Split/Merge | 不正な交差/ゼロ面積を commit せず、undo で完全復元する |
| E3 | Road/Wall/River groups と Groups UI | `River #1` を vertex 列として作製・延長・trim・合流でき、水域接続 vertex で終端し、頂点移動後も導出 edge が追従する |
| E4 | ward/precinct、選択範囲の都市要素生成、lock | locked element は regenerate で不変、道路/河川セットバックに建物が侵入しない |
| E5 | site add/delete と Voronoi 再生成プレビュー、City Export/FMG handoff | 未移管 feature を明示し、確認なしに消さない |

最低限の unit test は mesh 正規化、頂点移動の reject、split/merge、edge group の連続性/分割、**water face 接続 vertex を mouth にした river が water 側 edge を一つも導出しないこと**、undo/redo、JSON version を対象にする。browser test は `/city-editor/` の MPA 起動、River #1 の作製・頂点 drag・export/import round trip、再生成移管ダイアログを確認する。

## 9. 採用しない案

- SVG path を直接ドラッグして後からセルと照合する方式: 辺の共有・交差・river group の恒久性を保証できない。
- 河川をセルと独立した Bézier 曲線/水面ポリゴンにする方式: セル変形・城壁・建物セットバックと必ず乖離する。
- すべての手編集後に Voronoi を自動再計算する方式: 頂点形状、edge ID、利用者が意図した道路/河川を壊す。
- 生成時の `Cell.id` を編集文書の恒久 ID に流用する方式: split/merge/re-Voronoi で衝突・参照切れになる。
