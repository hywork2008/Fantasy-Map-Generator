# 道の高低差と移動速度・馬打峠級難所

ルート沿いに標高差（勾配）を計測し、陸路の移動速度・所要日数に反映する。あわせて「馬打峠」級の急坂区間を自動判別する。

関連:

- 現状調査: Trade Animation の Land 距離は 2D `Math.hypot` のみ（高低差なし）
- 交易日数: `src/extensions/economy/generators/tradeRouteDuration.ts`、`trade-animation.ts`
- キャラバン前進: `src/extensions/economy/generators/caravans.ts`
- 軍隊行軍: `src/generators/regimentMovement.ts`、`landRouteGraph.ts`（冬の高標高クローズあり）
- 表示: routes / rivers の Elevation Profile（`elevation-profile.ts`）
- 既存の距離・日数・薄利排除: `docs/plan/trade.md`、`docs/plan/drop-poor-trade.md`
- **陸路の敷設そのもの**（生成時に高標高を嫌う）: [`docs/plan/land-route-elevation-cost.md`](./land-route-elevation-cost.md) — 本ドキュメント（旅行コスト）とは分離。生成側を先に直すと「残る峠」が意味を持ち本計画と相性が良い

**実装状況**: **Phase 0–1 完了**（計測 + Elevation Profile + 交易所要日数 / pathfinding grade + `MerchantRoutePreference` UI）。Phase 2（キャラバン可変速度前進）は未着手。本ドキュメントが旅行側仕様のソース・オブ・トゥルース。

---

## 0. 確定した方針（ユーザー決定）

| 項目 | 決定 |
| :--- | :--- |
| 距離表示 (Land km) | **平面距離のまま**。高低差は距離に足さない |
| 高低差の効き方 | **速度 / 所要日数**に反映する（effort） |
| 馬は遅くなるだけか、峠を避けるか | **商人プレイ時にプレイヤーが選択可能**にする（後述 §2.4） |
| 峠の危険（熊・山賊イメージ） | 将来の flavor / risk 候補。**今の段階ではモデルに入れない** |
| routes 生成アルゴリズム | **旅行側 Phase 0–2 では触らない**。生成側の標高忌避は別計画 [`land-route-elevation-cost.md`](./land-route-elevation-cost.md) で進める（式は共有しない） |
| 軍隊への適用 | Phase 3（任意）。交易を先行 |
| 全体スイッチ | `gradeEffectStrength = 0` で現行互換 |

---

## 1. 背景と問題

### 1.1 現状

| 処理 | 高低差 |
| :--- | :--- |
| Trade Animation の Land 列 | なし（2D ポリライン × `distanceScale`） |
| キャラバン所要日数・前進 | 陸/海の定数 km/日のみ |
| `Routes.getLength` | 2D のみ |
| routes 生成 `getLandPathCost` | **到着セルの絶対標高**バイアスのみ（Δh ではない） |
| Elevation Profile | ascent/descent は **表示専用** |
| `landRouteGraph` 季節 | 高緯度 or `h ≥ 60` を冬に **通行不可**（離散ゲート） |

### 1.2 望む挙動

1. 急坂・長い登りで荷馬・荷車が遅くなる  
2. 「馬打峠」級区間を等級として判別し、UI と（将来）経路選択の材料にする  
3. 商人として遊ぶとき、**峠を許容して直線的に行く / 遠回りして避ける**を選べる  
4. 地図上の「距離」は現実の道のり（平面）として信頼できる表示のまま残す  

---

## 2. 概念モデル

```
pack.routes / pack.cells.h / distanceScale / heightExponent
        │
        ▼
┌───────────────────────┐
│  routeGrade (pure)    │  Phase 0: 計測・等級のみ
│  heightToMeters       │
│  sampleEdgeGrade      │
│  buildRouteGradeProfile│
│  classifyPass         │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  Traveler + Policy    │  Phase 1+: 速度・経路選択
│  GradeSensitivity     │
│  RoutePreference      │  preferSpeed | avoidHardPass | …
└───────────┬───────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
  所要日数      経路 Dijkstra 重み
  キャラバン前進   (方針によって変化)
```

### 2.1 距離と努力の分離

| 量 | 意味 | 用途 |
| :--- | :--- | :--- |
| `planarKm` | 平面沿い km | Trade Animation の Land、CSV、地図スケール |
| `travelDays` / speed multiplier | 勾配で割増した時間 | 適格判定・維持費・到着 |
| `PassClass` / tags | 難所等級 | UI・命名・（Phase 1+）経路方針 |

### 2.2 基本量（エッジ 1 ホップ）

セル `a → b`（ルート点 `p_i → p_{i+1}`）:

| 記号 | 定義 |
| :--- | :--- |
| `runKm` | `Math.hypot(dx,dy) * distanceScale`（`distanceUnit` が mi のときは呼び出し側で換算、または Phase 0 は km 前提で `distanceScale` が km 換算済みの既存慣習に合わせる） |
| `hM(c)` | `heightToMeters(cells.h[c], heightExponent)` |
| `riseM` | `hM(b) - hM(a)`（上り正） |
| `grade` | `riseM / (runKm * 1000)`。`runKm` が極小なら `0` |
| `absGrade` | `\|grade\|` |

高さ換算は既存表示ロジックと一致させる:

```text
h < 20  →  0 m（陸路エッジでは実質使わない）
h ≥ 20  →  (h - 18) ** heightExponent   // m（heightUnit=m 時）
```

`burgSiteDescriptor.ts` 内の private `heightToMeters` と同式。Phase 0 で **共有 util に切り出す**。

### 2.3 馬打峠級の判別（離散等級）

| `PassClass` | 条件（いずれか） | 意味 |
| :--- | :--- | :--- |
| `flat` | 既定 | 問題なし |
| `rolling` | 連続区間で `maxAbsGrade ≥ G_rolling` | 起伏あり |
| `steep` | `maxAbsGrade ≥ G_steep` が `L_steep` km 以上連続 | 荷車に厳しい |
| `hardPass` | `maxAbsGrade ≥ G_hard` が `L_hard` km 以上 **または** 移動窓 `W_km` 内で `ascentM ≥ A_hard` | **馬打級**（馬にキツい） |
| `extreme` | `maxAbsGrade ≥ G_extreme` **または** 窓 `W_ext` で `ascentM ≥ A_extreme` | 荷降ろし・徒歩主体イメージ |

タグ（派生）:

- `horseHard` ← `hardPass` 以上  
- `wagonHard` ← `steep` 以上  
- `winterRisk` ← 端点の `max(h) ≥ WINTER_ROAD_CLOSURE_ELEVATION`（既存 60）と OR（表示用。通行可否は季節モジュールのまま）

**熊・山賊**: タグや danger 連携は **将来枠**のみ。Phase 0–2 では `risk` フィールドも持たない。

### 2.4 商人の経路方針（プレイヤー選択）— Phase 1+

速度モデルとは独立した **経路選択ポリシー**。

```ts
/** Player-facing (and later NPC) preference when multiple land paths exist. */
export type MerchantRoutePreference =
  /** Minimize travel days (grade slows horses; may still take a steep shortcut). */
  | "preferSpeed"
  /** Extra cost on horseHard / hardPass edges so pathfinding detours when viable. */
  | "avoidHardPass";
```

| 方針 | Dijkstra エッジコスト | イメージ |
| :--- | :--- | :--- |
| `preferSpeed`（初期デフォルト） | `travelDays(edge, traveler)` のみ | 急でも短ければ通る。馬は遅くなる |
| `avoidHardPass` | `travelDays * avoidMultiplier(passClass)` | 峠を嫌って遠回り |

- UI: 商人プレイ / Trade 設定でトグルまたはセレクト  
- NPC 商隊: 当面は全体デフォルト（`preferSpeed`）。パーソナリティ連動は後回し  
- **危険（熊・山賊）は今は乗せない**ので、`avoidHardPass` は「馬にキツい急坂を嫌う」動機のみ。将来 danger を足すなら別倍率  

Phase 0 ではこの enum と設定キー名だけ仕様に固定し、**実装・配線は Phase 1**。

---

## 3. 速度モデル（Phase 1 概要・Phase 0 では未適用）

搬送体 `GradeSensitivity`:

```ts
export interface GradeSensitivity {
  freeGrade: number;       // これ未満は m≈1
  criticalGrade: number;   // これ以上は minMultiplier
  ascentBias: number;      // 上りを厳しく（例 1.2）
  descentFactor: number;   // 下りの |grade| 係数（例 0.85）
  minMultiplier: number;   // 床（例 0.15）
}
```

区分線形:

```text
gEff = grade > 0 ? grade * ascentBias : abs(grade) * descentFactor
if gEff ≤ free → m = 1
else if gEff ≥ critical → m = minMultiplier
else m = lerp(1, minMultiplier, (gEff - free) / (critical - free))
v = landKmPerDay * draftSpeedMultiplier * m * gradeEffectStrength'
// gradeEffectStrength' = 0 のとき常に m=1 扱い
days += runKm / v
```

累積登り窓（峠）: 連続 `W_km` で `ascentM ≥ A_hard` ならその窓に追加 `m_pass`（例 0.5）を掛ける——Phase 1 で実装。

既存 `DRAFT_ANIMAL_TYPES`（horse / ox）に `GradeSensitivity` を載せる。

**前進方式（Phase 2）**: 案 A — `currentDistance` は平面 km のまま、点列ごとに可変速度で日数消費。

---

## 4. アーキテクチャ配置

| モジュール | 層 | Phase | 内容 |
| :--- | :--- | :--- | :--- |
| `src/utils/height.ts` | util | **0** | `heightToMeters` / 共有 |
| `src/services/routeGrade.ts` | service（純関数） | **0** | 勾配・プロファイル・等級 |
| `src/services/routeGrade.test.ts` | test | **0** | 数値・等級 |
| Elevation Profile 連携 | controller / store / UI | **0** | 表示のみ |
| `caravanMovement` GradeSensitivity | economy | 1 | 感度 |
| `trade-animation` / `tradeRouteDuration` | economy | 1 | 日数・探索コスト |
| `TradeRouteSegment` に cell 保持 | economy types | 1 | 勾配に必須 |
| 商人 `MerchantRoutePreference` UI | economy UI | 1 | プレイヤー選択 |
| `caravans.advanceCaravan` | economy | 2 | 可変速度前進 |
| `landRouteGraph` / `regimentMovement` | core | 3 | 軍隊（任意） |
| 峠名提案・地図アイコン | UI | 4 | 表現 |

Built-in economy は同一バンドルのため `src/services/routeGrade.ts` を直接 import してよい。  
動的 ZIP 拡張向け ExtensionAPI 公開は Phase 1 以降の任意。

### 4.1 cell id の保持（Phase 1 必須・Phase 0 はセル配列 API）

現状 `TradeRouteSegment.points` は `[x,y]` のみで cell が落ちる。  
Phase 0 のプロファイル API は **`cells: number[]` + 任意の平面長**、または **`points: [x,y,cell][]`** を受け取る。  
Economy 側の segment 型拡張は Phase 1。

---

## 5. Phase 0 — 具体仕様（実装単位）

**目標**: 速度・経路・交易ロジックは一切変えない。  
計測ライブラリと unit test、Elevation Profile への読み取り専用表示まで。

### 5.1 成果物チェックリスト

| # | 成果物 | 必須 |
| :--- | :--- | :--- |
| 0.1 | `src/utils/height.ts` — `heightToMeters` | ✅ |
| 0.2 | `burgSiteDescriptor` が共有 util を使う（重複削除） | ✅ 推奨 |
| 0.3 | `src/services/routeGrade.ts` — 型・定数・純関数 | ✅ |
| 0.4 | `src/services/routeGrade.test.ts` | ✅ |
| 0.5 | Elevation Profile に max grade / pass summary を表示 | ✅ |
| 0.6 | `gradeEffectStrength` 等の runtime 配線 | ❌ Phase 1 |
| 0.7 | 交易・軍隊の速度変更 | ❌ Phase 1+ |

### 5.2 `src/utils/height.ts`

```ts
/**
 * Convert pack height index (0–100 style) to meters above the land baseline.
 * Matches historical getHeight() / burgSiteDescriptor heightToMeters:
 *   h < 20 → 0
 *   h ≥ 20 → (h - 18) ** exponent
 */
export function heightToMeters(h: number, exponent: number): number;

/** Clamp / default heightExponent from options (1..5, default 1.8). */
export function normalizeHeightExponent(raw: number | undefined): number;
```

- `rn` で整数 m に丸めるか、勾配用に小数を残すか: **勾配計算は小数 m を保持**し、表示時のみ `rn`。  
  `burgSiteDescriptor` は現状 `rn` 済み — 共有関数は `round?: boolean` または  
  `heightToMeters` は raw、`heightToMetersRounded` を別 export。  
  **推奨**: `heightToMeters` は丸めなし、呼び出し側で `rn`。burgSiteDescriptor は呼び出し時に `rn`。

`cellInfoService.getHeight` は文字列 UI 用のまま。内部で `heightToMeters` を使うリファクタは任意（Phase 0 でやると一貫するが必須ではない）。

### 5.3 `src/services/routeGrade.ts` — 型

```ts
export type PassClass = "flat" | "rolling" | "steep" | "hardPass" | "extreme";

export type PassTag = "horseHard" | "wagonHard" | "winterRisk";

/** One hop between consecutive samples (cells or route points with cell ids). */
export interface EdgeGradeMetrics {
  fromCell: number;
  toCell: number;
  /** Planar distance in km (map units × distanceScale). */
  runKm: number;
  /** Signed rise in meters (to - from). */
  riseM: number;
  /** riseM / (runKm * 1000); 0 if runKm below epsilon. */
  grade: number;
  absGrade: number;
}

export interface ClassifiedPass {
  class: Exclude<PassClass, "flat">;
  /** Inclusive indices into the cells[] / edges[] sequence. */
  fromIndex: number;
  toIndex: number;
  fromCell: number;
  toCell: number;
  lengthKm: number;
  maxAbsGrade: number;
  totalAscentM: number;
  tags: PassTag[];
}

export interface RouteGradeProfile {
  planarKm: number;
  totalAscentM: number;
  totalDescentM: number;
  maxAbsGrade: number;
  /** Length-weighted mean of absGrade. */
  meanAbsGrade: number;
  edges: EdgeGradeMetrics[];
  passes: ClassifiedPass[];
  /** Worst class present, or "flat". */
  worstClass: PassClass;
}

export interface RouteGradeOptions {
  distanceScale: number;
  heightExponent: number;
  /** pack.cells.h */
  heights: ArrayLike<number>;
  /**
   * Optional map-unit lengths between cells[i] and cells[i+1].
   * If omitted, runKm cannot be computed from cells alone — caller must pass
   * points or precomputed segmentLengthsMapUnits.
   */
  segmentLengthsMapUnits?: number[];
  /** Override thresholds (tests / future options). */
  thresholds?: Partial<RouteGradeThresholds>;
}

export interface RouteGradeThresholds {
  /** Min runKm for a non-zero grade; below → grade 0. */
  minRunKm: number;
  G_rolling: number;
  G_steep: number;
  L_steepKm: number;
  G_hard: number;
  L_hardKm: number;
  W_hardKm: number;
  A_hardM: number;
  G_extreme: number;
  W_extremeKm: number;
  A_extremeM: number;
  /** For winterRisk tag only (align with landRouteGraph). */
  winterElevationH: number;
}
```

将来（Phase 1 で同ファイル or 隣接モジュールに追加予定・Phase 0 では型コメントのみ）:

```ts
// Phase 1 — not implemented in Phase 0
// export type MerchantRoutePreference = "preferSpeed" | "avoidHardPass";
// export interface GradeSensitivity { ... }
```

### 5.4 デフォルトしきい値（チューニング用定数）

```ts
export const DEFAULT_ROUTE_GRADE_THRESHOLDS: RouteGradeThresholds = {
  minRunKm: 0.05,       // 50 m 相当未満はノイズ扱い
  G_rolling: 0.05,      // 5%
  G_steep: 0.10,        // 10%
  L_steepKm: 0.5,
  G_hard: 0.15,         // 15% — 馬打級勾配
  L_hardKm: 0.3,
  W_hardKm: 3,
  A_hardM: 250,         // 3 km 窓で +250 m
  G_extreme: 0.22,
  W_extremeKm: 2,
  A_extremeM: 400,
  winterElevationH: 60  // landRouteGraph.WINTER_ROAD_CLOSURE_ELEVATION
};
```

数値はプレイ感で後から Options 化する。Phase 0 は **モジュール定数 + options 引数オーバーライド**のみ。

### 5.5 公開関数

```ts
/** Single edge from two cells and a planar map-unit length. */
export function sampleEdgeGrade(
  fromCell: number,
  toCell: number,
  lengthMapUnits: number,
  options: Pick<RouteGradeOptions, "distanceScale" | "heightExponent" | "heights" | "thresholds">
): EdgeGradeMetrics;

/**
 * Build a full profile from an ordered cell path and per-segment map-unit lengths
 * (same length as cells.length - 1).
 */
export function buildRouteGradeProfile(
  cells: readonly number[],
  segmentLengthsMapUnits: readonly number[],
  options: RouteGradeOptions
): RouteGradeProfile;

/**
 * Convenience: route.points is [x, y, cell][].
 * Lengths from consecutive XY; cells from point[2].
 */
export function buildRouteGradeProfileFromPoints(
  points: ReadonlyArray<readonly [number, number, number]>,
  options: Omit<RouteGradeOptions, "segmentLengthsMapUnits">
): RouteGradeProfile;

/** Map PassClass → display label (EN for UI parity with rest of app). */
export function passClassLabel(c: PassClass): string;

/** Tags derived from a class (+ optional endpoint height for winterRisk). */
export function tagsForPass(
  class: PassClass,
  maxEndpointH: number,
  thresholds: RouteGradeThresholds
): PassTag[];
```

#### `buildRouteGradeProfile` アルゴリズム

1. `cells.length < 2` または lengths 不一致 → 空プロファイル（zeros, `worstClass: "flat"`, edges/passes 空）  
2. 各 i で `sampleEdgeGrade(cells[i], cells[i+1], lengths[i], …)`  
3. `planarKm` / `totalAscentM` / `totalDescentM` / `maxAbsGrade` / 加重 `meanAbsGrade`  
4. **連続急坂スキャン**: `absGrade ≥ G_steep` / `G_hard` / `G_extreme` の run-length を km で累積し、`L_*` を満たす区間を `ClassifiedPass` 候補に  
5. **移動窓スキャン**: 各開始エッジから `runKm` 累積が `W_hardKm` / `W_extremeKm` に達するまで `riseM>0` を加算。`A_*` 超過ならその窓を pass 候補（class は hard / extreme）  
6. 候補をマージ（包含される弱い等級は吸収、重なりは worse class 優先）  
7. 各 pass に `tagsForPass`  
8. `worstClass = max(passes.class)`（順序: flat < rolling < steep < hardPass < extreme）  
9. `rolling`: steep 未満だが `maxAbsGrade ≥ G_rolling` の連続を短い rolling pass にするかは **任意**。Phase 0 では **worstClass と maxAbsGrade 表示を優先**し、`passes` 配列には `steep` 以上のみ入れる（ノイズ抑制）

### 5.6 Elevation Profile 連携

現状:

- `openElevationProfile(cells, routeLen, isRiver)` が cell 列から chart 用 height（表示単位の整数）と totalAscent/Descent を計算  
- ascent は **表示 height の差分**で、メートル勾配公式とは別系統  

Phase 0 の追加:

1. `openElevationProfile` 内で、隣接セル間の平面距離を  
   `hypot(p[a], p[b])` で求め、`buildRouteGradeProfile(cells, lengths, { distanceScale, heightExponent, heights })` を呼ぶ  
2. `useElevationProfileState` にオプションフィールドを追加:

```ts
gradeProfile: RouteGradeProfile | null;
// open() に gradeProfile を渡す。河川プロファイルでは null のままでよい
```

3. `ElevationProfileDialog` のヘッダまたはチャート下にテキスト行:

```text
Max grade: 16% · Climb: 420 m · Descent: 380 m · Difficulty: Hard pass (horse)
```

- 河川 (`isRiver`) では等級を出さない（または ascent のみ従来表示）  
- チャート本体の色帯（pass 区間ハイライト）は Phase 0 では **任意**。最低限は数値サマリ  

4. 既存の `totalAscent` / `totalDescent`（表示 height 差分）は後方互換で残し、  
   **勾配用の m は `gradeProfile.totalAscentM` を優先表示**する。  
   混乱を避けるため UI ラベルを `Climb (m)` と明示。

### 5.7 テスト（`routeGrade.test.ts`）

| ケース | 期待 |
| :--- | :--- |
| 平坦: 同一 h、100 map unit、scale=1 | grade 0, planarKm=100, worst flat, passes=[] |
| 片側急坂: runKm=1, riseM が 150 → grade≈0.15 | absGrade≈0.15, hard 連続条件を満たせば hardPass |
| 合成: 長い 3km で緩やかに +250m | 窓条件で hardPass（max grade は 0.15 未満でも可） |
| 極小 runKm | grade 0（ゼロ除算なし） |
| extreme しきい値 | worstClass extreme |
| thresholds オーバーライド | テスト専用に G_hard を下げて判定が動く |
| 空 / 1 cell | 空プロファイル、throw しない |
| `buildRouteGradeProfileFromPoints` | XY 距離と cell 高さが整合 |

軍隊・交易の結合テストは Phase 0 では不要。

### 5.8 受け入れ条件（Phase 0 Done）

- [x] `heightToMeters` が util にあり、burg 記述子と式が一致（テストまたは共有）  
- [x] `buildRouteGradeProfile` が純関数で world / DOM に依存しない  
- [x] unit test が CI で緑  
- [x] ルートの Elevation Profile を開くと max grade と difficulty が見える  
- [x] 交易速度・キャラバン位置・所要日数が **現行とビット同等**（ロジック未配線）  
- [x] `npm run lint` / `tsc` / 関連 vitest クリーン  

### 5.9 実装順序（Phase 0 作業チケット）

1. `src/utils/height.ts` + burgSiteDescriptor の利用置換  
2. `src/services/routeGrade.ts` + テスト  
3. `elevationProfileState` / `openElevationProfile` / Dialog サマリ  
4. 手動確認: 山岳ルートで Hard pass が出るシードを 1 つメモ  

---

## 6. Phase 1 — 交易所要日数・経路方針（概要）

1. `TradeRouteSegment.points` に cell を保持（`findRoutePath` / caravan spawn）  
2. `getEdgeTravelDays` / `calculateRouteDurationDays` に grade 倍率  
3. `DRAFT_ANIMAL_TYPES` に `GradeSensitivity`  
4. `MerchantRoutePreference`:  
   - 設定 UI（Trade Animation Settings または Options）  
   - `preferSpeed` | `avoidHardPass`  
   - pathfinding コストに `avoidHardPass` 時のみ hard エッジへ倍率（例 ×3）  
5. `gradeEffectStrength`（0 = 旧挙動）  
6. Trade Animation に Climb / Max grade / Passes 列または tooltip（任意）  
7. deal 適格・maintenance が新日数を使用（既存 drop-poor-trade と整合）  

**危険（熊・山賊）は入れない。**

---

## 7. Phase 2 — キャラバン実移動

- `advanceCaravan`: 点列 or 細分エッジ単位の可変 `v(grade)`  
- 出発時に係数を焼き付け（tick 中再計算しない）  
- `currentDistance` は平面 km（案 A）  

---

## 8. Phase 3 — 軍隊（任意）

- `landRouteGraph` の重みを effort 化、または行軍時 edge 倍率  
- infantry / mounted プロファイル  
- 冬クローズ（既存）と勾配の併用テスト  

---

## 9. Phase 4 — 表現

- 自動「○○峠」候補（hardPass 最高点付近）  
- 地図アイコン  
- 手動 override  
- （将来）danger / 山賊リスクを `avoidHardPass` や別ポリシーに接続  

---

## 10. 設定キー（将来 localStorage）

| キー | Phase | デフォルト | 意味 |
| :--- | :--- | :--- | :--- |
| `fmg-grade-effect-strength` | 1 | `1` | 0 で速度影響オフ |
| `fmg-merchant-route-preference` | 1 | `preferSpeed` | プレイヤー経路方針 |
| （しきい値群） | 1+ 任意 | §5.4 | 上級チューニング |

Phase 0 では永続化しない。

---

## 11. 明示的非目標

- Phase 0–2 で routes **生成**コスト式の変更  
- 熊・山賊・danger による損失・遅延（将来）  
- 海路の「勾配」  
- Land 列を有効距離に置き換えること  
- 3D メッシュ連続スロープ  

---

## 12. リスクと注意

| リスク | 緩和 |
| :--- | :--- |
| heightExponent 変更で等級が激変 | プロファイルは都度計算；しきい値は m と grade 比で定義 |
| セル解像度が粗く勾配が過大/過小 | minRunKm、連続距離条件、窓条件の二重化 |
| 平面最短と日数最短の乖離 | UI で Land vs ETA を分離説明 |
| Elevation Profile の旧 ascent と m の二重表示 | ラベルで単位を明示 |
| path cache と方針変更 | Phase 1 で preference 変更時 `clearRouteCache` |

---

## 13. セッション引き継ぎ

**Phase 0–1 完了**（2026-07-27）。

成果物:

| パス | 内容 |
| :--- | :--- |
| `src/utils/height.ts` | `heightToMeters` / `normalizeHeightExponent` |
| `src/services/routeGrade.ts` | 勾配・プロファイル・PassClass・`calculateLandTravelDays` |
| `src/services/routeGrade.test.ts` | 等級 + 速度倍率 + avoidHardPass コスト |
| Elevation Profile | 陸路で Max grade / Climb (m) / Difficulty サマリ |
| `caravanMovement` | `gradeEffectStrength`, `merchantRoutePreference`, draft `GradeSensitivity` |
| `trade-animation` / `tradeRouteDuration` | cell 保持・grade 日数・pathfinding 回避倍率 |
| Trade Animation Settings | Grade effect % + land route preference |

次に着手する作業: **§7 Phase 2**（`advanceCaravan` 可変速度前進。案 A: `currentDistance` は平面 km）。

確認済みユーザー決定:

1. Land = 平面距離のまま  
2. 勾配 → 速度/日数  
3. 峠回避 vs 速度優先は **商人プレイで選択**（Phase 1）  
4. 熊・山賊は **今は気にしない**  

仮置き（プレイ感で後から調整可）:

- hardPass 回避倍率 ×3 / extreme ×4  
- ox 感度曲線（`DEFAULT_OX_GRADE_SENSITIVITY`）  
- 軍隊 Phase 3 は未定  
