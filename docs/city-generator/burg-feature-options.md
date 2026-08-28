# City Generator — Burg フィーチャー（港 / 城砦 / 城壁 / 広場 / 寺院）の取り込み設計

`src/ui/dialogs/BurgEditorDialog.tsx` の Features 行（`burgPort` / `burgCitadel` /
`burgWalls` / `burgPlaza` / `burgTemple` / `burgShanty` / `burgCapital`）を、
City Generator（`src/city-generator/`）の **生成オプション** として取り込むための設計。
`design.md`（ページ配置・S0–S3 パイプライン）、`draft.md`（5 ステップ + Inspector）、および
TownGeneratorTS の生成順 `~/Projects/TownGeneratorTS/docs/city-generation-and-rendering.md §2`
（2.1 区画 → 2.2 交差整理 → 2.3 城壁 → 2.4 街路 → 2.5 街区 → 2.6 建物）を前提とする。
`docs/plan/city-generator/v2/` は **不採用**（Voronoi を禁じた失敗案。参照しない）。

---

## 0. 要約（TL;DR）

| 論点 | 結論 |
| ---- | ---- |
| FMG 側の変更 | **不要**。7 個の真偽値は既に `BurgSiteDescriptor.burg.*` に含まれ、`src/services/burgSiteDescriptor.ts:213-219` が出力し、`burg-editor.ts` の `copyCityGeneratorInput` / `openCityGenerator` が両方ハンドオフ済み。`DESCRIPTOR_VERSION` バンプも不要 |
| City 側の現状 | パイプラインはフラグを **一切読んでいない**。`grep` すると型定義・`synthSite.ts`（合成時に population から捏造）・テストにしか出てこない。`siteInput.ts` の `siteToParams` / `siteToGeography` は `site.burg.*` を参照しない |
| 追加する構造 | `CityGeography`（水・道）と対になる `CityProgram`（建造物プログラム）。`generateCity(params, geo, program)` の第 3 引数。デフォルト全 false で既存テスト互換 |
| フラグの作用先 | `walls` → S3 の緻密度 + **S4**（内周ループを描画壁に昇格）。`plaza` / `citadel` → **S4**（内周ループ確定と同時に配置）。`temple` / `port`（harbor 街区） / `shanty` → **S6**（街区割り当て）。港の水門のみ S4。TownGeneratorTS では 2.3（壁・城塞）と 2.5（街区）に対応 |
| スタンドアロン UI | Options パネルに **Features トグル行**（Port / Walls / Citadel / Plaza / Temple / Shanty）を追加。`synthSite` は population からの捏造をやめ `SiteConfig.features` を使う（初期値だけ population 由来） |
| インポート UI | descriptor 由来。`describeDescriptor` の読み出しに行を追加し **読み取り専用**表示（geography 固定の原則に合わせる。上書き可否は §12 未決） |
| 出荷単位 | **M4a** = `CityProgram` 配線 + Features UI + `walls` の S3 緻密度補正（視覚変化なし）。**M4b** = S4（内周・門・壁・広場セル・城塞セル）。**M6** = S6 の temple / port / shanty。§10 |

---

## 1. 現状の把握

### 1.1 データはすでに届いている

`site/burgSiteDescriptor.ts:76-92`:

```ts
burg: {
  id; name; group; type; seed; population;
  capital: boolean; port: boolean; citadel: boolean; plaza: boolean;
  walls: boolean; temple: boolean; shanty: boolean;
};
```

FMG 側 `getBurgSiteDescriptor()` は `Boolean(burg.port)` 等をそのまま詰めるだけ。
`suggestedGates`（= 道路レグ数）と `suggestedArchetype` も既にある。

### 1.2 City 側はどこも読んでいない

- `site/siteInput.ts` … `frame` と `rivers` / `waterbody` / `roads` だけを見る。`burg` は `seed` のみ。
- `core/pipeline.ts` … `CityParams` + `CityGeography` しか受け取らない。`burg` フラグを渡す経路がない。
- `site/synthSite.ts:46,108-114` … スタンドアロン時に `walls = population >= 3_000`、
  `plaza = population >= 1_500` などと **勝手に決めている**（UI から変えられない）。
- `ui/CityGeneratorPage.ts` … トグルは Coast / Rivers / River shape / Relief のみ。

つまり必要なのは「契約を増やす」ことではなく「既にある契約を消費する」こと。

---

## 2. データモデル — `CityProgram`

`core/types.ts` に追加。`CityGeography` が「分類対象の地形」なのに対し、
`CityProgram` は「置くべき建造物の要求」。両者は直交する。

```ts
/** Burg エディタの Features が決める、都市に置くべき建造物プログラム。
 *  地形（CityGeography）とは独立。全 false = 何もない開放集落。 */
export interface CityProgram {
  /** 城壁都市。false なら S4 の壁リングを生成せず、周縁は outskirts リボンのみ。 */
  walls: boolean;
  /** 城砦（要塞化された内郭）。壁の有無に関わらず配置可。 */
  citadel: boolean;
  /** 中央広場（市場）。建物を置かない void セルとして確保。 */
  plaza: boolean;
  /** 大聖堂・寺院区。 */
  temple: boolean;
  /** 港。waterbody があるときのみ有効（§4.5）。 */
  port: boolean;
  /** 城壁外スラム（faubourg の貧民版）。 */
  shanty: boolean;
  /** 首都。ランドマークの格を上げる軽微な修飾のみ（§4.7）。 */
  capital: boolean;
}

export const DEFAULT_PROGRAM: CityProgram = {
  walls: false, citadel: false, plaza: false,
  temple: false, port: false, shanty: false, capital: false
};
```

### 2.1 パイプライン signature

```ts
// core/pipeline.ts
export function generateCity(
  params: CityParams,
  geo: CityGeography = EMPTY_GEO,
  program: CityProgram = DEFAULT_PROGRAM,   // ← 追加。既存呼び出し・テストは無指定で従来動作
): GenerationResult
```

### 2.2 出力型の追加

```ts
// core/types.ts
export type CellTag =
  | "land" | "sea" | "urban" | "outskirts" | "rural"
  | "shanty";                                  // ← 追加（outskirts の兄弟。城壁外スラム）

export type PrecinctKind = "citadel" | "plaza" | "temple" | "harbor";

/** 面を占める建造物区画。plaza/temple は 1..2 セル、citadel/harbor は複数セル。 */
export interface Precinct {
  kind: PrecinctKind;
  cellIds: number[];
  /** 代表点（ラベル / draft.md の Inspector 用）, local meters。 */
  anchor: Point;
  /** citadel の内郭リング等の閉ポリゴン。無ければ cellIds のセル外周を使う。 */
  ring?: Point[];
  label: string;                              // "Citadel" / "Market square" 等
}

export type OverlayKind =
  | "shoreline" | "gateBearing"
  | "wall" | "gate" | "quay" | "moat";        // ← S4 系を追加

// GenerationResult と Snapshot に追加
precincts: Precinct[];
```

`Snapshot` にも `precincts: Precinct[]` を持たせ、進行スライダーで「区画が出現する」様子を見せる。

`Precinct` は S6（TownGeneratorTS 2.5）で各 `urban` セルに付くワード型のうち **名前付き**のもの
（`plaza` / `temple` / `citadel` / `harbor`）を面としてまとめた射影。無名の職人区・スラム等は
セルのワード型フィールド（or `CellTag`）に留め、`Precinct` にはしない。

---

## 3. `siteInput` / `synthSite` / UI の変更

### 3.1 `site/siteInput.ts` — 純パススルー

```ts
export function siteToProgram(site: BurgSiteDescriptor): CityProgram {
  const b = site.burg;
  return {
    walls: b.walls, citadel: b.citadel, plaza: b.plaza,
    temple: b.temple, port: b.port, shanty: b.shanty, capital: b.capital
  };
}
```

`index.ts` に re-export。`CityGeneratorPage.build()` は両モードで第 3 引数に `siteToProgram(...)` を渡す
（インポート = descriptor から、スタンドアロン = 合成 descriptor から）。

### 3.2 `site/siteConfig.ts` — スタンドアロンで編集可能に

```ts
export type CityFeatureSet = Omit<CityProgram, "capital">;  // capital は synth では常に false

export interface SiteConfig {
  coast: CoastShape;
  rivers: RiverShape[];
  relief: boolean;
  features: CityFeatureSet;                   // ← 追加
}

/** population からの妥当な初期チェック状態。UI 表示後はユーザーが自由に変更。 */
export function defaultFeatures(population: number): CityFeatureSet {
  const walls = population >= 3_000;
  return {
    walls,
    plaza: population >= 1_500,
    temple: true,
    citadel: false,
    port: false,                              // Coast を選ぶと UI 側で true に引き上げ
    shanty: population >= 8_000
  };
}
```

- `DEFAULT_SITE_CONFIG.features = defaultFeatures(presetPopulation("smallCity"))` 相当。
- ~~`siteConfigKey()` に features を連結~~ → **M4a では見送り**。M4a の features は S0–S3 幾何に
  無影響（`burg.*` bool を立てるだけ）で、key に入れると synth の grid/coast/river RNG stream ──
  すなわち S0–S3 回帰ネット ── を可視利得ゼロで攪乱する。実際 24-combo マトリクスの `cape+beside`
  が河口不整合で落ちた。features が synth 幾何に効く機能を得たらその時 key に加える。
- `randomSiteConfig()` は各フラグを独立に roll（`port` は `coast !== "none"` のときだけ）。

### 3.3 `site/synthSite.ts` — 捏造をやめる

`synthSite.ts:46,108-114` の population ヒューリスティックを削除し、`config.features` を
`descriptor.burg.*` にそのまま書く。`port` は `config.features.port && waterbody !== null`
（`synthSite` は既に `waterbody` を計算済みなので整合が取れる）。`capital: false` 固定。

### 3.4 `ui/CityGeneratorPage.ts` — Features トグル行

Options パネルの Relief 行の下に、Burg エディタと同じ 6 項目のトグル（チップ or チェックボックス）:

```text
Features   [Port] [Walls] [Citadel] [Plaza] [Temple] [Shanty]
```

- クリックで `patch({ features: { ...cfg.features, walls: !cfg.features.walls } })` → `regenerate()`。
- `synthOnly` 配列にこの行を足し、インポートモードでは非表示。
- `Port` は `cfg.coast === "none"` のとき disabled（港には水域が要る）。
- Coast を `none` 以外にした瞬間、`port` の初期値を true に引き上げる（`onConfig` 内で補正）。

### 3.5 インポートモードの読み出し（`describeDescriptor`）

`CityGeneratorPage.ts:328` の rows に追記（読み取り専用）:

```text
Walls      Yes / No
Citadel    Yes / No
Plaza / Temple   Yes · Yes
Port       Yes（waterbody あり）/ —
Shanty     Yes / No
```

`geography = 実 descriptor 固定` の原則に合わせ、v1 は編集不可。上書き可否は §12。

---

## 4. 各フィーチャーの意味論（ステージ別）

すべて決定論。配置 RNG は `makeRng(`${params.seed}:program:${kind}`)` で個別に取る
（`pipeline.ts` の `${seed}:coast` / `${seed}:river:${i}` と同じ流儀）。

| フラグ | 作用ステージ（TownGeneratorTS 対応） | 前提 | 出力 |
| ------ | ---------- | ---- | ---- |
| `walls` | S3（緻密度）+ S4（2.3 内周ループ→描画壁） | — | `Overlay{wall,gate,moat?}` |
| `plaza` | S4（2.1/2.5 中央セル→Market） | urban セルが 1 つ以上 | 中央 `urban` セルに `plaza` マーク → S6 で `Precinct{plaza}` |
| `citadel` | S4（2.3 手順6 城塞セル + 内周へ融合） | — | `Precinct{citadel}` + `Overlay{wall}`（内郭） |
| `temple` | S6（2.5 rateLocation「広場の近く」） | urban セルが 1 つ以上 | `Precinct{temple}` |
| `port` | S6（harbor 街区）+ S4（水門のみ） | `waterbody != null` | `Precinct{harbor}` + `Overlay{quay,gate}` |
| `shanty` | S6（2.5 Slum を城壁外に明示配置） | 街道が 1 本以上 | `CellTag "shanty"` × 3–6 |
| `capital` | 全般（微修飾） | — | 既存区画の拡大のみ |

### 4.1 `walls`

**S3 への影響（M4a）**
`pipeline.ts` が `classifyUrban` に渡す半径を `program.walls` で調整:

- `walls: true` → `cityRadiusMeters * WALLED_COMPACTION`（≈ 0.92）。壁内は密なので市街核を締める。
- `walls: false` → 係数 1.0。加えて `RIBBON_REACH`（`classifyUrban.ts:25`）を実質 1.8 まで伸ばし、
  outskirts リボンを長く引く（開放集落は街道沿いにだらだら伸びる）。

**S4（M4b、`design.md §4.2` の S4、TownGeneratorTS 2.2–2.3 相当）**
S4 は `walls` に関わらず必ず走る ── 内周ループ `border` と門は街路（S5）・街区（S6）の前提。
`walls` が制御するのは「`border` を描画壁 + 塔に昇格するか」だけ。手順:

1. **`optimizeJunctions` の移植**（2.2）── 最終グリッドの `Cell.polygon` について辺長
   `< cellSize/6` の隣接頂点を中点に統合し、共有セルの参照を付け替え、重複頂点を除く。
   これを経ないと S7 のセットバックで街路に切れ端・食い違い交差が出る。
2. **エンベロープ** = `urban` セル集合を囲う単純閉ループ。M4b 初回は外周をそのまま
   （`findCircumference` 相当、`Cell.neighbors` で境界辺を一周。河川が市街を割るなら bank
   成分ごとに 1 ループ、`design.md §4.1-4`）だが、`urban` はいびつなので **これを直接なぞると
   凹んだ長い壁・海側の一様な壁**になる。囲う形（`hull` / `notchFilled` / `sectorPolygon` …）・
   海岸辺の扱い（`open` / `seaWall` / `harborBasin` …）・壁線の規則性・完全性のオプション体系は
   **`wall-patterns.md`** に分離。M4b 仕上げで `hull` / `notchFilled` + 海側 `open` + `polygonal` を入れる。
3. **門** = descriptor の各 `roads[].path`（無ければ `roadBearings` レイ）がループと交わる点。
   本数を `suggestedGates` に合わせてループ頂点を微調整。門頂点の外側セルが 1 個だけなら
   そのセルを分割して道路用地にする（2.3 手順2）。
4. `walls: true` → ループを `wall-patterns.md` の `wallLine` / `wallCoast` に従って描画壁 + 塔に、
   40–70 m 間隔で塔、門脇に一対の塔。川沿いは水門 2 箇所、壁は水域を横断しない。
   `walls: false` → ループは不可視境界のまま（描画壁・塔なし。`wallExtent:none` と同義）。
   周縁は outskirts リボンのみ。`citadel` の内郭リングは `walls` に関わらず描く（§4.2）。

### 4.2 `citadel`

要塞化された内郭。S4 の `border` に外側から隣接する `land` セル（`sea` は除く。原点から `≥ 0.15R`）を
候補にスコアリング。TownGeneratorTS 同様「内周のすぐ外側」に置くので上限は設けない
（`border` ≈ 都市半径なので `0.6R` 上限は付けない）:

| 加点 | 条件 |
| ---- | ---- |
| +2.0 | `terrain.heightfield` を centroid でサンプルした標高が近傍極大（`relief` 時に強く効く）── **未配線**（§12.3） |
| +1.5 | いずれかの river 折れ線に `≤ 1.2·cellSize`（天然の堀） |
| +1.0 | bearing が「内陸方向」（= 平均道路方位の逆、海があれば `shoreAzimuthDeg` の逆）±35° 内 |
| −1.0 | plaza アンカーから `≤ 2·cellSize`（広場と城の取り合いを避ける） |

`< 0.15R` の候補は大きく減点（中心に城は置かない）。同点は cell id 昇順で決定論的に。

argmax のセル + その `neighbors` リング（計 5–9 セル）を `Precinct{citadel}` に。TownGeneratorTS では
城塞はセル index `nPatches`（`withinCity` だが `withinWalls` ではない＝内周の外側に接するセル）で、
S4 の `border` 確定時に配置される。それに倣い **S4 で `border` に隣接する外側セルを 1 つ城塞に**。
`walls: true` なら内郭リングを `border` に融合（接触弧で連結。2.3 手順6「城は壁線上に置いてよい」）。
`walls: false` でも内郭リング（`Overlay{wall}` の小ループ）は描く。
S5 で城門から城塞への専用街路を 1 本引く（他のランドマークと共有しない）。
城塞セルのコンパクトさが 0.75 未満なら配置失敗として seed を進めて再生成（2.3 手順6）。

### 4.3 `plaza`

中央広場（市場）。`origin` から `0.28R` 以内の `urban` セルから 1 つ選ぶ:

```text
argmin over urban cells c:  dist(c.centroid, origin)
                          − 40 · (GATE_CONE_DEG 以内に入る roadBearings の本数)
```

= 中心に近く、かつ主要な街道軸が集まるセル（史実の市場は大通りの交差点）。TownGeneratorTS では
中央セル（index 0、区画頂点が原点に最も近いセル）がそのまま `plaza` になる。**S4 で中央 `urban`
セルに `plaza` マークを付け**（S5 街路の終点になるので街路より前に要る）、S6 で `Market` 街区に。
選んだセル（+ `capital` なら隣接 1 セル）は以後の敷地生成で **建物を置かない void** として扱う。
門前小広場は S5 で門ノードにできる街路空間の膨らみとして後段。

### 4.4 `temple`

大聖堂・寺院区。**S6（街区割り当て、TownGeneratorTS 2.5）** で `Cathedral` 相当の
`rateLocation`＝「広場に接する、または近い」で決める。実装は `origin` から `[0.12R, 0.4R]` の
`urban` セルのうち **plaza アンカーに近い**セル。ただし plaza と同一セルは不可、`citadel` 隣接セルは
−1.0 ペナルティ（城と大聖堂の取り合いを避ける）。1 セル（`capital` で +1 セル）を `Precinct{temple}`。
S4 への依存なし（広場マークさえあれば置ける）。

### 4.5 `port`

**`port && waterbody` のときのみ有効。** それ以外は無視してログ（`port` だけ true で水域なし = FMG 上のデータ不整合）。
TownGeneratorTS に港はなく、本プロジェクト独自の追加。

**S4（水門のみ）** ── `border` が海に最も近づく箇所に水門（`Overlay{gate}`）を 1 つ。
`walls: true` なら壁の海側の開口。`geo.roadBearings` に「海方位」を 1 本足して S3 の市街核が
波止場側へ伸びるようにする。

**S6（harbor 街区）** ──

1. `nearestOnPolyline(origin, shoreline)` で海岸線上の最近点 P。
2. P から内陸側に最初の `urban`（無ければ `land`）セル = harbor アンカー。
3. 海岸線接線方向 ±0.5R 内で `sea` セルに隣接する `urban` セルを 1–3 個足して `Precinct{harbor}`。
4. `Overlay{quay}` = 区画がまたぐ海岸線セグメント。

`waterbody` があるが `port: false` = 崖／湖岸で船を着けない町。harbor 区画・quay・水門は作らない
（S3 の楕円リーチ〈`design.md §4.2 S3`〉はそのまま。海沿いに広がるが港湾機能はない）。

### 4.6 `shanty`

城壁外スラム。TownGeneratorTS 2.5 では `Slum` は「キューが尽きたときのフォールバック街区」かつ
`rateLocation`＝「中心から遠い」。`shanty` フラグは **S6 でこれを城壁外に明示配置**する指示:

- `walls: true` … 最も往来の多い門の街道 1–2 本沿い、`border` の **すぐ外**
  （`reach ∈ [borderR, borderR·1.4]`、bearing が `RIBBON_CONE_DEG` 以内）の `outskirts` / `rural`
  セルを `CellTag "shanty"` に。
- `walls: false` … 最も往来の多い街道 1 本沿い、`reach ∈ [cityR·0.95, cityR·1.4]` のセル。

「往来の多さ」= `BurgSiteRoadEntry.nextBurg.distanceMeters` の大きい順、無ければ非 searoute の先頭 2 本。
計 3–6 セル。S7 の敷地生成で密度を下げる（`ALLEY/2` セットバック）。

### 4.7 `capital`

大枠は本設計の対象外。効くのは既存区画の格上げのみ:

- `plaza` 区画 +1 セル、`citadel` 内郭リング +1 周。
- `suggestedGates` は既に FMG が首都で多めに出す（道路レグ数由来）ので S4 側で自然に反映。
- **他フラグを強制的に true にはしない**（ユーザーの Features 設定を尊重）。

---

## 5. 出力とスナップショット（スライダー統合）

`pipeline.ts` の `steps: Snapshot[]` に、TownGeneratorTS 2.2–2.6 に対応する段を足す。
各 Snapshot は `precincts` と拡張 `overlays` を持つ:

| index | label | 内容 | フラグ |
| ----- | ----- | ---- | ---- |
| 既存 | `S3 · Urban core` | 既存 + `walls` による半径補正 | `walls` |
| 新 | `S4 · 内周と門` | `optimizeJunctions` → `border` ループ → 門 → (`walls`) 描画壁・塔・水門 → `plaza` セル → `citadel` セル | `walls` `plaza` `citadel` `port` |
| 新 | `S5 · 街路` | 門→広場の街路（A\*）、市外 `roads[].path` の二重線、動脈平滑化。**市内街路は描かない** | — |
| 新 | `S6 · 街区` | 各 `urban` セルにワード型、`temple` / `harbor` / `shanty`、faubourg リボン | `temple` `port` `shanty` |
| 新 | `S7 · 敷地` | セルをセットバックで inset → **セル辺が街路として出現**、地区ごとに再帰分割 | — |

`walls: false` でも S4 は走る（`border`・門は S5 / S6 の前提）。描画壁・塔・水門だけを省く。
区画・門・ワードは `label` とメタ（kind, cellIds）を持ち、`draft.md` の Inspector からクリック可能にする。

---

## 6. 描画とパレット

`render/palette.ts` に追加:

```ts
export const TAG_FILL = {
  …,
  shanty: "#d8cdb4",          // outskirts より少しくすませる
};

export const PRECINCT_FILL: Record<PrecinctKind, string> = {
  citadel: "#b9a789",         // urban より濃い石色 + ハッチ
  plaza:   "#e7dfc9",         // 明るい void
  temple:  "#c9bfe0",         // 既存 RIVER_TRACK.smooth 系の紫寄り
  harbor:  "#a9b8b0"          // urban と sea の中間
};

export const WALL = "#6b6459";
export const QUAY = "#7c7468";      // 実装時に微調整
export const MOAT = RIVER.fill;
```

`render/svg.ts`:

- `renderCity` に precinct 描画パスを追加（セル塗りの上、river band の下）。citadel は
  塗り + 外周ストローク（`WALL`）+ 45° ハッチ。plaza は塗りのみ。
- `overlayNode()` を `wall` / `gate` / `quay` / `moat` に拡張。壁は太い実線、門は壁の切れ目 +
  一対の塔ドット、quay は海岸線に平行な太線。
- 既存 `gateBearing` オーバーレイは S3 デバッグ用として残す（門の確定位置は `gate` オーバーレイ）。

---

## 7. 決定論とシード

| 用途 | シード |
| ---- | ------ |
| plaza 配置 | `${seed}:program:plaza` |
| temple 配置 | `${seed}:program:temple` |
| citadel 配置 | `${seed}:program:citadel` |
| harbor 配置 | `${seed}:program:harbor` |
| 壁リング揺らぎ | `${seed}:program:walls` |
| shanty 選択 | `${seed}:program:shanty` |

同一 `(params, geo, program)` → バイト同一の `GenerationResult`。
`program` を変えても `gridStages` / `shoreline` / `riverPaths` は不変（フラグは S3 以降にしか効かない。
ただし `walls` は S3 の半径補正に効くので `urban` / `outskirts` 集合は変わる）。

---

## 8. 相互作用・ガード・優先順位

| 状況 | 挙動 |
| ---- | ---- |
| `port: true` かつ `waterbody: null` | harbor を作らずログ。`console.warn("port set but no waterbody")` |
| `waterbody != null` かつ `port: false` | 海沿いだが港湾なし。quay / 水門なし。S3 楕円リーチは維持 |
| `citadel` と `temple` の候補セルが競合 | temple 側に −1.0 ペナルティ（§4.4）。それでも同一なら temple を 1 セルずらす |
| `plaza` と `temple` が隣接 | 許容（史実でも大聖堂前が広場）。ただし同一セルは不可 → temple を再選 |
| `walls: false` かつ `shanty: true` | 壁が無いので最往来街道 1 本沿い・`cityR` 基準で配置（§4.6） |
| `walls: false` かつ `citadel: true` | 内郭リング（小ループ）だけ描く。主壁リングは無し |
| urban セルが 0（極小集落） | plaza / temple / citadel をスキップ。ログのみ |
| `capital: true` | 既存区画の拡大のみ。フラグ強制なし |

配置順序: **S4 = plaza（中央セル固定）→ citadel（`border` 隣接）**、**S6 = harbor（海岸線拘束）→ temple（広場近傍）→ shanty（城壁外）**。
先に置いたものの `cellIds` を後段の候補から除外し、重なりを防ぐ。

---

## 9. FMG 本体への変更（＝ほぼ不要）

| ファイル | 変更 |
| -------- | ---- |
| `src/services/burgSiteDescriptor.ts` | **なし**。7 真偽値・`suggestedGates`・`suggestedArchetype` は出力済み |
| `src/controllers/burg-editor.ts` | **なし**。`openCityGenerator` / `copyCityGeneratorInput` は descriptor 全体を渡す |
| `site/burgSiteDescriptor.ts`（City 側の型コピー） | **なし**。`burg.*` は既に定義済み。`DESCRIPTOR_VERSION` バンプ不要 |
| `docs/city-generator/design.md` | §3.2 の「市街セル」行に本書への参照を追記。§4.2「S4 以降」を S4→S7（TownGeneratorTS 2.2–2.6 対応）に展開。§7 マイルストーン表に M4a / M4b / M5 / M6 / M7 を追加 ── **本タスクで実施済み** |

---

## 10. マイルストーン配置

`design.md §7` の S4–S7 系列（TownGeneratorTS 2.2–2.6）に沿い、7 フラグは 3 増分に分けて入れる:

| M | 内容 | 検証 |
| --- | ---- | ---- |
| **M4a ✅** | `core/types.ts` に `CityProgram` + `DEFAULT_PROGRAM`。`generateCity(params, geo, program = DEFAULT_PROGRAM)`。`siteInput.siteToProgram`（`burg.*` → `CityProgram` 純パススルー、`index.ts` 再エクスポート）。`SiteConfig.features: CityFeatureSet` + `defaultFeatures(population)` + `FEATURE_KEYS`。`synthSite` は population ヒューリスティック削除 → `config.features` をそのまま `burg.*` へ（`port` のみ `&& waterbody`）。UI = Features トグル行（synthOnly、Port は coast=none で disabled、coast 選択で port を引き上げ）+ imported 読み出し 5 行。`pipeline` は `program.walls` で `classifyUrban` 半径 `×0.92`（`WALLED_COMPACTION`）。**視覚的な新要素なし**（`walls:true` で `urban` 集合が締まるだけ）。§3.2 の `siteConfigKey` への features 連結は見送り（上記） | `tsc` 0、`vitest` 98/98（`core/program.test.ts` 4: 全 false ≡ 無指定でバイト一致、`walls:true` で urban が厳密部分集合かつ小、他 6 フラグは S3 無影響、決定論。`site/siteConfig.test.ts` 6: `defaultFeatures` population スケール・`randomSiteConfig` の 6 フラグ両値 roll・landlocked は port 無し・key は features 非依存。`site/siteInput.test.ts` +2: `siteToProgram` verbatim）、biome / lint:legacy クリーン。ブラウザ実測（dev）: Features 行が初期 Walls/Plaza/Temple/Shanty on、トグルで再生成、Bay 選択で Port enabled+active・None で disabled、imported で Features 行非表示＋読み出しに descriptor フラグ 5 行、console エラー無し。build: city payload 38.5 KB、world/d3/three 参照 0 |
| **M4b** | S4（`design.md §4.2`）── `optimizeJunctions` 移植 + `border` ループ + 門 + `walls:true` の描画壁・塔・水門 + `plaza` セル + `citadel` セル。Snapshot `S4 · 内周と門` | `tsc` 0、`vitest`（`border` は単純閉曲線・`urban` を内包、門数 = `suggestedGates`、河川分断時は成分ごとに 1 ループ、`plaza`≠`citadel` セル、`citadel` は `border` 隣接かつ原点から ≥0.15R、`walls:false` で描画壁 Overlay なし、シード安定）、ブラウザ（4 archetype で壁・門・城塞が妥当、`walls` トグルで壁が出入り） |
| **M6** | S6（`design.md §7`）の一部 ── `temple`（`Cathedral` rateLocation）、`port` の harbor 街区 + quay、`shanty` の城壁外配置 | S5（街路）実装後。`vitest`（`temple` は広場近傍・plaza と別セル、`harbor` は `waterbody` 必須・`sea` 隣接、`shanty` は `border` 外側 3–6 セル）、ブラウザ |

M5（街路）と M7（敷地）は本書の対象外 ── `design.md §7` を参照。

---

## 11. 非目標

- 敷地割り・建物ポリゴン（S7 / TownGeneratorTS 2.6）。本書は区画の**位置・範囲・ワード型**まで。
- 街路網そのものの設計（S5 / 2.4）。本書はフラグが S5 に渡す前提（門・広場セル）だけを規定。
- citadel 内部の郭・櫓・館の配置。
- quay の実ジオメトリ（桟橋・突堤の形）。`Overlay{quay}` は海岸線セグメントを太線で示すのみ。
- 堀（moat）の詳細。M4b のオプション。
- `capital` を起点にしたスケール再設計。

---

## 12. 未決事項

1. **インポートモードで Features を上書きできるか。** v1 は読み取り専用（geography 固定に合わせる）。
   seed 再ロールと同様に「フラグだけ変えて再生成」を許すかは要検討。許すなら
   `Mode.imported` に `programOverride?: Partial<CityProgram>` を足す。
2. **`shanty` を `CellTag` にするか `Precinct` にするか。** 本書は面クラス（`outskirts` の兄弟）としたが、
   faubourg リボンと一体で扱うなら `Precinct{kind:"shanty"}` の方が素直かもしれない。M6 で確定。
3. **citadel の標高極大判定。** `terrain.heightfield` は 17×17（`synthTerrain`）。セル centroid での
   バイリニア補間で足りるか、`relief: false` のとき +2.0 加点が無効化されて配置が
   「内陸方向の壁縁」一択に寄らないか、実測で確認。
4. **`plaza` の void をレンダラーがどう扱うか。** M4b 時点では塗りを変えるだけ。S7（敷地生成）で
   「敷地除外セット」に接続する。
5. **門数と `suggestedGates` のズレ。** `border` と道路の交差数が `suggestedGates` に合わないとき、
   `border` 頂点を動かして交差数を合わせる（TownGeneratorTS 2.3 手順2）。M4b。
6. **`capital` の扱いを広げるか。** 現状は微修飾のみ。首都専用のランドマーク（宮殿・城門広場・
   大聖堂の格上げ）を別プログラムとして起こすかは将来課題。
