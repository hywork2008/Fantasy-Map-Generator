# City Editor — 地形防御（天然の要害）を活用した城郭（Citadel）配置設計

作成日: 2026-10-07。状態: **設計案（先行調査 `factors.md` §2 の具体化）**。
関連文書:

- [城と城壁の設計](castles-and-fortifications.md)
- [城郭実装記録](castles-implementation.md)
- [FMG連携の地形・バイオーム要素調査](temp/survey/factors.md)
- [FMGの都市配置・直交渡河・街道網の生成設計](../plan/fmg-settlements-and-perpendicular-crossings.md)

---

## 1. 目的と背景

### 1.1 目的

中世ヨーロッパをはじめとする歴史的城郭都市において、城塞（Citadel / Castle）は単なる都市の幾何学的中心やランダムな端部に置かれるのではなく、**「地形の険しさ（高台、断崖、河川の蛇行）を利用して防衛コストを最小化し、周囲を威圧・監視できる天然の要害」**に配置された。

本設計は、FMG（Fantasy Map Generator）の局所地形・水文解析と、CE（City Editor）の城郭配置エンジン（`src/city-editor/core/gen/castlePlacement.ts`）を連携させ、**地形の防御的利点を最大限に活かした城郭配置**を実現することを目的とする。

### 1.2 現状の課題

現行の `castlePlacement.ts`（`placeCastleRegion`）における候補セル評価は、以下のような単純な線形結合にとどまっている：

```typescript
// 現行の候補セル採点（castlePlacement.ts:276-281）
const height = terrainHeight(terrain, center) ?? 0;
return (
  height * 2 +
  (position === "edge" ? d * 0.05 : -d * 0.2) -
  Math.abs(Math.abs(polygonArea(pts)) - target) * 0.001
);
```

この実装には以下の問題がある：

1. **局所比高（Prominence）の欠如**: 絶対標高 `height` のみを参照しているため、全体が傾斜している土地では単に「最も山側の端」に吸い寄せられ、周囲より一段高い丘頂（Hilltop）や尾根（Ridge）を識別できない。
2. **天然障壁（Natural Barriers）の未評価**: 急崖（Cliff）や深い河岸、湖岸、海岸が評価に含まれておらず、背後を自然の障壁で守れる「岬（Promontory）」の立地を優先できない。
3. **配置形式（Edge / Central）の盲目的な乱数決定**: `position: "auto"` は単に 85% edge / 15% central の固定乱数で決めており、「中央に独立した丘があるから中央型にする（Old Sarum型）」「崖際だから外周一体型にする（Richmond型）」といった地形連動の判断ができない。
4. **FMG側の戦術地形解析が未伝達**: FMGは17×17の局所標高場（`heightfield`）や河川物理幾何を保持しているが、都市選定時に把握した「要塞としての適地（立地理由）」をCEに伝達する契約が存在しない。

---

## 2. 地形防御類型（Tactical Terrain Archetypes）

中世都市城郭の立地を、工学的・幾何学的に判定可能な5つの類型に定義する。

| 類型 | 歴史的代表例 | 地形条件 | 推奨配置と形態 |
| :--- | :--- | :--- | :--- |
| **岬・断崖型 (Promontory)** | Richmond, Conwy, Luxembourg, 崖上の古城 | 急斜面・断崖（Slope > 20%）または切り立った河岸/海岸に面した高台の突端。 | `edge` + `integrated`（外周一体型）。断崖側を天然の防御壁とし、市街地側にのみ強固な囲壁・主門・堀を築く。 |
| **孤立丘頂型 (Hilltop / Motte)** | Old Sarum, Lincoln, 城山都市 | 周囲の市街地より明確に一段高い局所最高点（比高差 > 10m、全方向で下り勾配）。 | `central`（中央型）または市街地が斜面に偏る場合は `edge` + `detached`（独立型）。全周を城郭囲壁で閉じる。 |
| **蛇行半島先端型 (Meander Loop)** | Bern, Toledo, Besançon, Durham | 河川がΩ字状に蛇行し、3方を深い水域で囲まれた半島状地形の内側。 | 先端の高台に `edge` + `integrated` または `detached`。川を天然の巨大な堀として背後に背負う。 |
| **河岸・水門型 (Riverfront / Water Gate)** | Tower of London, Sforza | 平坦地だが水運の要衝となる主要河川・港湾に面する。 | `edge` + `integrated`。水際へ直接出られる水門・専用船着場と、市街側の二重堀。 |
| **平地型 (Plain / Crossroads)** | 平野部の宿場町・市場町 | 有意な比高・断崖・水域防壁が存在しない平坦地。 | 既存の距離・面積基準によるフォールバック。外周または中央。 |

---

## 3. FMGとCEのデータ契約（Descriptor拡張）

### 3.1 `BurgSiteDescriptor` への追加フィールド

FMGの都市敷地選定時（`burgSiteDescriptor.ts`）に局所地形を解析し、CEに**戦術的推奨値**を渡す。

```typescript
export interface TacticalSiteAnalysis {
  /** 地形防御の類型 */
  archetype: "promontory" | "hilltop" | "meanderLoop" | "riverfront" | "plain";

  /** 推奨される城郭アンカー座標 (メートル、都市中心 [0, 0] からの相対) */
  suggestedAnchor: [number, number];

  /** 局所比高 (m): 周囲平均標高に対するアンカー地点の比高差 */
  prominenceMeters: number;

  /** 推奨配置形式 */
  recommendedPosition: "edge" | "central";

  /** 推奨接続関係 */
  recommendedRelationship: "integrated" | "detached";

  /** 天然障壁（崖・水域）が面している方位角範囲 (度, 0=北, 90=東) */
  naturalBarrierAzimuthBands: Array<[number, number]>;
}

// BurgSiteDescriptor の拡張
export interface BurgSiteDescriptor {
  // ... 既存フィールド ...
  terrain: BurgSiteTerrain;

  /** 城郭（Citadel）配置のための戦術地形解析（オプショナル） */
  tacticalSite?: TacticalSiteAnalysis;
}
```

### 3.2 グレースフル・デグラデーション（Graceful Degradation）

- `tacticalSite` が提供されない場合（旧セーブデータ、合成生成 `synthSite`、テスト用fixture等）、CE側で `terrain.heightfield` と `waterAreas` から同様の解析をオンザフライで実行し、同等の判断を行う。

- 外部入力の有無によって生成アルゴリズムのコアが分岐しない構造とする。

---

## 4. CE側のアルゴリズム刷新

### 4.1 局所地形解析エンジン（`tacticalTerrain.ts` 新設）

`src/city-editor/core/gen/tacticalTerrain.ts` を新設し、`heightfield`（17×17）と水域ポリゴンから以下の指標を高速かつ決定論的に算出する：

1. **局所比高マップ（Prominence Map）**:
   - グリッド各点 $(x, y)$ の標高 $H(x, y)$ に対し、近傍（半径 $R \approx 100\text{m} \sim 200\text{m}$）の平均標高 $\bar{H}_{local}$ を引いた値：
     $$\text{Prominence}(x, y) = H(x, y) - \bar{H}_{local}$$
   - 正の極大値（Local Maxima）を「丘頂（Hilltop）」候補とする。
2. **急斜面・断崖検出（Cliff & Slope Map）**:
   - ソーベルフィルタ（Sobel filter）等により各グリッドの勾配（Grade %）を算出：
     $$\text{Grade}(x, y) = \sqrt{(\partial H/\partial x)^2 + (\partial H/\partial y)^2}$$
   - 勾配が $25\%$ を超え、かつ水域または低地に向かって急降下する境界を「断崖（Cliff）」としてマーク。
3. **水域近接・包摂度（Water Enclosure）**:
   - 点 $(x, y)$ から放射状にレイキャストを行い、周囲 360度のうち水域（河川・海）が占める角度割合を測定。
   - $180^\circ \sim 270^\circ$ が水域に囲まれている場合を「蛇行ループ・半島先端」として判定。

### 4.2 候補セルの採点式刷新（`castlePlacement.ts`）

`placeCastleRegion` 内の候補セルソート（`candidates.sort`）を、戦術評価を組み込んだ複合採点式に改変する。

```typescript
interface CellTacticalScore {
  prominenceScore: number;    // 局所比高（周囲よりどれだけ高いか）
  barrierScore: number;       // 天然障壁ボーナス（崖や水域に面しているか）
  fmgAnchorBonus: number;     // FMG推奨点への近接ボーナス
  urbanEdgeScore: number;     // 市街地境界・中心距離との幾何整合
  areaPenalty: number;        // 目標面積との乖離ペナルティ
  arterialBlockPenalty: number; // 主要街道の遮断ペナルティ
}
```

#### 採点項目の詳細設計

1. **局所比高スコア ($S_{\text{prom}}$)**:
   - 候補セルの重心における比高 $\text{Prominence}$。
   - 周囲より高いほど加点（例: $+1\text{m}$ ごとに $+5.0$ 点）。平坦なら $0$。
   - 絶対標高ではなく「周囲との比高」を使うことで、高台の上の平坦地や山麓の傾斜地でも正しく局所的な頂上を捉える。
2. **天然障壁ボーナス ($S_{\text{barrier}}$)**:
   - 候補セルの外側境界（市街地と接しない辺）が、水域（河川・海）または断崖（Cliff）に面している場合、防衛線節約ボーナスを加算。
   - 面している境界長の割合に応じたボーナス（最大 $+40.0$ 点）。
   - これにより、「川沿いの崖の上」「海の突端」のセルが飛躍的に優先される。
3. **FMG推奨アンカー近接度 ($S_{\text{anchor}}$)**:
   - `descriptor.tacticalSite?.suggestedAnchor` が存在する場合、そのアンカー座標 $A$ と候補セル重心 $C$ のユークリッド距離 $d_A = \|C - A\|$ に基づくガウス重み：
     $$S_{\text{anchor}} = 50.0 \times \exp\left(-\frac{d_A^2}{2 \sigma^2}\right) \quad (\sigma \approx 60\text{m})$$
4. **主要街道・水路遮断ペナルティ ($P_{\text{arterial}}$)**:
   - 候補セルが、FMGからインポートされた主要街道（`importedRoads`）や主要門（`suggestedGates`）の直近（幅 15m以内）を完全に塞ぐ場合は強い減点（$-50.0$ 点）。
   - 城が交通の要衝を支配することは重要だが、街道そのものを通過不能にして街路生成を破綻させてはならない。

### 4.3 配置形式（Position & Relationship）の決定論的適応

現行の乱数 `rng() < 0.85 ? "edge" : "central"` を、地形特性に基づく決定論的判定に改変する：

```typescript
function resolveCastlePositionSettings(
  settings: CastleSettings,
  tactical: TacticalSiteAnalysis,
  urbanCenter: Point
): { position: "edge" | "central"; relationship: "integrated" | "detached" } {
  if (settings.position !== "auto" && settings.relationship !== "auto") {
    return { position: settings.position, relationship: settings.relationship };
  }

  // 地形類型に応じた推奨の自動決定
  if (tactical.archetype === "hilltop") {
    // 孤立した丘が都市中心部にある場合は中央型・独立型
    const distToCenter = Math.hypot(tactical.suggestedAnchor[0] - urbanCenter[0], tactical.suggestedAnchor[1] - urbanCenter[1]);
    if (distToCenter < 80) {
      return { position: "central", relationship: "detached" };
    }
  }

  if (tactical.archetype === "promontory" || tactical.archetype === "meanderLoop") {
    // 岬や蛇行先端は外周一体型（崖・水域を背負う）
    return { position: "edge", relationship: "integrated" };
  }

  // 特徴のない平地などの場合は従来の比率（外周優先）
  return {
    position: settings.position === "auto" ? "edge" : settings.position,
    relationship: settings.relationship === "auto" ? "integrated" : settings.relationship
  };
}
```

---

## 5. 城郭囲壁と天然障壁の統合（Natural Barrier Integration）

### 5.1 崖・水域側の「無壁化」または「低胸壁化」

歴史的な断崖城郭（Richmond Castleなど）では、切り立った崖側には巨大な石造城壁を築かず、崖そのものを障壁として利用した。

- `trial.defenseCircuits` の `naturalBarriers` 配列に、急崖または深い水域に接するメッシュ辺を登録する。
- 描画時（`render/svg.ts`）および防御判定（`fortifications.ts`）において：
  - 天然障壁辺は、通常の厚い石造壁（幅 3m・塔付き）ではなく、**崖沿いの胸壁（Parapet / Thin Wall 幅 1m）**として描画するか、崖記号（Hachures / Cliff lines）と一体化させる。
  - 市街地に面する陸側正面（Land Front）にのみ、**強固な主壁・角塔・主門（Gatehouse）・深い堀**を集中的に生成する。

### 5.2 蛇行ループの「ネック（首）」遮断

蛇行半島に都市が位置する場合：

- 半島先端に城郭（Citadel）を置き、
- 半島の付け根（最も幅が狭い陸側のネック部）を横断するように都市城壁（Town Wall）の主防御線を配向する。
- 城門と都市門の軸が一直線上に並び、都市全体が多重の防御構造を持つように誘導する。

---

## 6. 実装ステップとマイルストーン

既存の直交渡河・水域契約を破壊せず、段階的に検証しながら進める。

### ステップ 1: CE側の局所地形解析と採点式刷新（基盤整備）

- **対象**: `src/city-editor/core/gen/tacticalTerrain.ts` の新設、`castlePlacement.ts` の改修。

- **内容**:
  - `heightfield` からの比高（Prominence）および断崖勾配（Grade %）の算出モジュール。
  - `placeCastleRegion` での候補セル採点式に局所比高と水域・断崖隣接ボーナスを導入。
  - 既存の固定fixture（Tobogobo, Tives, Autruyles, Shroutumn）での回帰テスト（城が消えたり不正な形状にならないことの確認）。

### ステップ 2: FMG側の戦術地形解析とDescriptor契約（連携接続）

- **対象**: `src/services/burgSiteDescriptor.ts`, `src/city-editor/core/gen/site/burgSiteDescriptor.ts`。

- **内容**:
  - FMG側で都市候補決定時に、地形・河川ポリゴンから `TacticalSiteAnalysis` を算出。
  - Descriptor v4 拡張として `tacticalSite` をCEへ渡す。
  - CEの `siteInput.ts` および `placeCastleRegion` で推奨アンカーを優先。

### ステップ 3: 天然障壁（Natural Barriers）と片側城壁の表現（ビジュアル・防御洗練）

- **対象**: `src/city-editor/core/fortifications.ts`, `src/city-editor/render/svg.ts`。

- **内容**:
  - 崖・水域に面する城郭辺を `naturalBarriers` として扱い、陸側正面への防御集中（主門・主塔・堀）を表現。
  - 3D / WebGL レンダラーへの標高・崖情報の引き渡し。

---

## 7. 受入テスト基準

| テストケース | 期待される検証結果 |
| :--- | :--- |
| **片側に急崖がある都市** | 城郭が平坦な市街地側ではなく、急崖に面した高台の突端（Promontory）に配置される。崖側は自然の境界として扱われる。 |
| **中央に独立した丘がある都市** | 城郭が丘の頂上に配置され、独立型中央城郭（`central` + `detached`）として成立する。 |
| **河川の蛇行ループ内の都市** | 城郭が蛇行の内側の先端付近に配置され、水面を背負う。 |
| **完全な平坦地（比高ゼロ）** | 局所比高スコアがゼロとなり、既存の幾何・面積・距離基準へ安全にフォールバックして城が正常に生成される。 |
| **主要街道との交差** | 城郭が主要街道の接続点や主要門を完全に塞がず、城門までの進入路が確保される。 |
| **決定論の維持** | 同一seed・同一パラメータで再生成した際、城郭の位置・向き・形状が100%一致する。 |
