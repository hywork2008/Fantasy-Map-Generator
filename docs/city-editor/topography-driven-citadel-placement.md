# City Editor — 地形防御（天然の要害）を活用した城郭（Citadel）配置設計

作成日: 2026-10-07。状態: **設計案（先行調査 `factors.md` §2 の具体化）**。2026-10-07 に史料レビューを反映（§2・§4・§5・§8）。
関連文書:

- [城と城壁の設計](castles-and-fortifications.md)
- [城郭実装記録](castles-implementation.md)
- [FMG連携の地形・バイオーム要素調査](temp/survey/factors.md)
- [城と街道の配置順序の再設計](castle-road-siting-order.md)（§4.2 の主要街道遮断ペナルティを必須条件に置き換え）
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
3. **配置形式（Edge / Central）の盲目的な乱数決定**: `position: "auto"` は単に 85% edge / 15% central の固定乱数で決めており、「丘が町の端にあるから丘上の外周一体型にする（Lincoln型）」「崖際だから外周一体型にする（Richmond型）」といった地形連動の判断ができない。
4. **FMG側の戦術地形解析が未伝達**: FMGは17×17の局所標高場（`heightfield`）や河川物理幾何を保持しているが、都市選定時に把握した「要塞としての適地（立地理由）」をCEに伝達する契約が存在しない。

---

## 2. 地形防御類型（Tactical Terrain Archetypes）

中世都市城郭の立地を、工学的・幾何学的に判定可能な類型に定義する。蛇行型は首と先端の2つに分け、丘頂型は自然の丘と人工のモット（土盛り）を分ける（根拠は §8）。

| 類型 | 歴史的代表例 | 地形条件 | 推奨配置と形態 |
| :--- | :--- | :--- | :--- |
| **岬・断崖型 (Promontory)** | Richmond, Conwy, Luxembourg (Bock), Edinburgh | 急斜面・断崖、または切り立った河岸・海岸に面した高台の突端。 | `edge` + `integrated`。崖側は当初は壁を設けないか、館の背面壁で兼ねる（§5.1）。市街地側にのみ囲壁・主門・堀を築く。 |
| **丘頂型 (Hilltop)** | Lincoln, Edinburgh（crag-and-tail）, Old Sarum（例外） | 周囲より明確に一段高い自然の局所最高点。 | **既定は `edge` + `integrated`**。町は丘から斜面を下って育つため、城は町の高い側の端（Lincoln は上町の南西角）になる。`central` は丘が市街地に完全に含まれる場合に限る（§4.3）。 |
| **蛇行・首型 (Meander Neck)** | Durham, Besançon（17世紀の要塞） | 河川が三方を囲む半島で、陸側の首が高い。 | 首に `edge` + `integrated`。城が唯一の陸路を押さえる。[castle-road-siting-order.md](castle-road-siting-order.md) C1 の例外（城門が関所になる型）として扱う（§5.2）。 |
| **蛇行・先端型 (Meander Tip)** | Bern (Nydegg), Toledo（Alcázar は最高所） | 三方を水域が囲む半島で、首が低い、または先端側が高い。 | 先端または半島内の最高所に `edge` + `integrated`。町は首に向かって伸び、市壁は首を横断する。主街路は首の門から城へ向かい、城で行き止まる。 |
| **河岸・水門型 (Riverfront)** | Tower of London, Wallingford, York | 平坦地だが主要河川・港湾に面する。 | `edge` + `integrated`。水際への水門と、市街側の堀。 |
| **モット型 (Motte)** | Norwich, Oxford, Cambridge | 有意な比高・断崖・水域が無い平坦地。 | 人工の土盛りを築く。外周または町の一角に置き、既存の街区を潰して建てる（Oxford では土盛りの下にサクソン期の集落跡が残る）。採点は平地のフォールバックだが、形態は土盛り＋外郭とする。 |

---

## 3. FMGとCEのデータ契約（Descriptor拡張）

### 3.1 `BurgSiteDescriptor` への追加フィールド

FMGの都市敷地選定時（`burgSiteDescriptor.ts`）に局所地形を解析し、CEに**戦術的推奨値**を渡す。

```typescript
export interface TacticalSiteAnalysis {
  /** 地形防御の類型 */
  archetype: "promontory" | "hilltop" | "meanderNeck" | "meanderTip" | "riverfront" | "motte";

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

  /** アンカーから最寄りの泉・河川・湖までの距離 (m)。井戸の掘削深さの代理 */
  waterSourceDistanceMeters: number;

  /** 細かい標高データで判定したか。false の場合 CE は類型を信用しすぎない */
  analyzedAtFineResolution: boolean;
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

- `tacticalSite` が提供されない場合（旧セーブデータ、合成生成 `synthSite`、テスト用fixture等）、CE側で `terrain.heightfield` と `waterAreas` から**簡易版**の解析をその場で実行する。
- 簡易版が判定するのは `riverfront`・`motte`・大きな比高の `hilltop` だけとする。17×17 の標高データは間隔が町の幅÷16（幅1.5kmで約94m）しかなく、崖の縁・小さな丘・蛇行の首の高さを判定できないため（§4.1）。崖・蛇行の類型は FMG 側で細かい標高データから判定し、`tacticalSite` で渡す。

- 外部入力の有無によって生成アルゴリズムのコアが分岐しない構造とする。

---

## 4. CE側のアルゴリズム刷新

### 4.1 局所地形解析エンジン（`tacticalTerrain.ts` 新設）

> **解像度の制約**: CE の `heightfield` は 17×17 点、間隔は町の幅÷16（[burgSiteDescriptor.ts](../../src/services/burgSiteDescriptor.ts) の `spacingMeters`）。幅1.5kmの町で約94mになる。以下の閾値は、この間隔では次のように扱う。
>
> - 断崖（勾配 > 25%）: 平均化されるため「急斜面」としか判定できない。崖の縁の判定は FMG 側で行う。
> - 比高（半径100〜200mの周囲平均）: 1〜2点ぶんしか比べられない。CE では半径を `max(200m, 2×spacing)` とする。
> - 比高 > 10m の小さな丘（直径50〜100m）: 点の間に埋もれる。CE では判定せず、`motte` として扱う。

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
  waterSupplyPenalty: number;  // 水の確保の難しさ
  overlookScore: number;       // 市街地を見下ろせるか
}
```

#### 採点項目の詳細設計

1. **局所比高スコア ($S_{\text{prom}}$)**:
   - 候補セルの重心における比高 $\text{Prominence}$。
   - 周囲より高いほど加点（$+1\text{m}$ ごとに $+5.0$ 点、**上限 $+75$ 点（比高15m相当）**）。平坦なら $0$。上限が無いと、比高だけで面積・街道の条件をすべて上回ってしまう。
   - 絶対標高ではなく「周囲との比高」を使うことで、高台の上の平坦地や山麓の傾斜地でも正しく局所的な頂上を捉える。
2. **天然障壁ボーナス ($S_{\text{barrier}}$)**:
   - 候補セルの外側境界（市街地と接しない辺）が、水域（河川・海）または断崖（Cliff）に面している場合、防衛線節約ボーナスを加算。
   - 面している境界長の割合に応じたボーナス（最大 $+40.0$ 点）に、**障壁の高さの係数 $\min(1, \text{比高}/10\text{m})$ を掛ける**。ただし `riverfront` 類型では係数を最低 $0.5$ とする。
     $$S_{\text{barrier}} = 40 \times \text{面している割合} \times \max(k_{\min}, \min(1, \text{Prominence}/10))$$
   - 係数が無いと、平坦な河岸（+40）が比高5mの丘（+25）より優先され、「川沿いの崖の上」を優先する意図と逆になる。河岸型の城（Tower of London, Wallingford）は史実に多いので、平坦な河岸を0点にはしない。
3. **FMG推奨アンカー近接度 ($S_{\text{anchor}}$)**:
   - `descriptor.tacticalSite?.suggestedAnchor` が存在する場合、そのアンカー座標 $A$ と候補セル重心 $C$ のユークリッド距離 $d_A = \|C - A\|$ に基づくガウス重み：
     $$S_{\text{anchor}} = 50.0 \times \exp\left(-\frac{d_A^2}{2 \sigma^2}\right) \quad (\sigma \approx 60\text{m})$$
4. **水の確保の減点 ($P_{\text{water}}$)**:
   - 城内には井戸が必須だった（Oxford の城の土盛りには井戸室が残る）。Old Sarum は高所で水が乏しく、住民が谷へ移って13世紀に町が衰えた（§8）。
   - 比高と、最寄りの泉・河川までの距離から井戸の深さを見積もり、減点する。例: $P_{\text{water}} = -\min(30, 0.5 \times \text{Prominence} + 0.05 \times d_{\text{water}})$。
   - 比高の加点と打ち消し合うことで、「高すぎて水の無い丘」より「水の得られる一段高い場所」が選ばれる。
5. **市街地の見下ろし ($S_{\text{overlook}}$)**:
   - ノルマン期の都市城は、住民を威圧することも目的だった。候補から市街地の各面の重心へ、標高データ上で見通しが通る割合に応じて最大 $+15$ 点。
   - [castle-road-siting-order.md](castle-road-siting-order.md) H6（門・橋を見下ろせる距離）と同じ考え方で、地形側の項として持つ。
6. **街道の遮断**: 減点ではなく、[castle-road-siting-order.md](castle-road-siting-order.md) §3.4 の必須条件 C1〜C4 で除外する（実装済み）。本書の採点は、必須条件を通過した候補の順位付けにだけ使う。

### 4.3 配置形式（Position & Relationship）の決定論的適応

現行の乱数 `rng() < 0.85 ? "edge" : "central"` を、地形特性に基づく決定論的判定に改変する：

```typescript
function resolveCastlePositionSettings(
  settings: CastleSettings,
  tactical: TacticalSiteAnalysis,
  urbanFaces: Point[][]
): { position: "edge" | "central"; relationship: "integrated" | "detached" } {
  if (settings.position !== "auto" && settings.relationship !== "auto") {
    return { position: settings.position, relationship: settings.relationship };
  }

  if (tactical.archetype === "hilltop") {
    // 既定は端。町は丘から下って育つ（Lincoln, Edinburgh）。中央型は、
    // 丘が市街地に完全に含まれる場合だけ（Old Sarum は水不足で衰えた例外）。
    const enclosed = hilltopEnclosedByUrban(tactical.suggestedAnchor, urbanFaces);
    return enclosed ? { position: "central", relationship: "detached" } : { position: "edge", relationship: "integrated" };
  }

  // 岬・蛇行（首・先端）・河岸は外周一体型（崖・水域を背負う）
  if (tactical.archetype !== "motte") return { position: "edge", relationship: "integrated" };

  // モット型（平坦地）は従来の比率（外周優先）
  return {
    position: settings.position === "auto" ? "edge" : settings.position,
    relationship: settings.relationship === "auto" ? "integrated" : settings.relationship
  };
}
```

---

## 5. 城郭囲壁と天然障壁の統合（Natural Barrier Integration）

### 5.1 崖・水域側の「無壁」と、背面壁を兼ねる館

Richmond Castle の南側（スウェール川の崖側）は、当初は壁が無く、崖そのものに守られていた。後から建てられた南の幕壁には、11世紀の館（Scolland's Hall）が寄りかかっている（§8）。

- `trial.defenseCircuits` の `naturalBarriers` 配列に、急崖または深い水域に接するメッシュ辺を登録する。
- 天然障壁辺の扱い:
  - 既定では**壁を描かず**、崖記号（Hachures / Cliff lines）または水際線で示す。
  - 後代の改修や大きな城では、館・広間などの主要建物を障壁辺に沿って配置し、その背面を壁として描く（Richmond 型）。城内の建物配置（`castleLayout.ts`）で、大きな建物を障壁辺に寄せる規則として持つ。
  - 幅1mの胸壁として描くのは、表現上の簡略化として許容する。
- 市街地に面する陸側正面（Land Front）にのみ、**強固な主壁・角塔・主門（Gatehouse）・深い堀**を集中的に生成する。

### 5.2 蛇行地形：首型と先端型

蛇行半島の城は、首と先端の比高で2つに分ける。

- **首型（Durham）**: 首が先端より高い、または同程度に高い場合。
  - 城を首に置き、唯一の陸路を押さえる。市街地は城の背後、半島の内側に広がる。
  - 城が街道の上に乗るため、[castle-road-siting-order.md](castle-road-siting-order.md) の C1（城は街道の脇に置く）に反する。同文書 §6 の「城門自体が関所になる型」の例外として、この類型でのみ C1 を「城を貫かずに城の脇を通る陸路が首に残ること」へ緩める。それができない首幅なら先端型に退く。
- **先端型（Bern）**: 首が低い、または先端側が高い場合。
  - 城を先端（または半島内の最高所。Toledo の Alcázar）に置く。
  - 市壁の主防御線は首を横断する。町が首の方へ伸びるにつれて、市壁は外側へ作り直される（Bern）。
  - 主街路は首の都市門から城へ向かい、**城で行き止まる**。城を貫いて町の外へ抜けることはなく、城の入口は都市門と別にする（[castle-road-siting-order.md](castle-road-siting-order.md) H3・H5）。

---

## 6. 実装ステップとマイルストーン

既存の直交渡河・水域契約を破壊せず、段階的に検証しながら進める。

### ステップ 1: CE側の局所地形解析と採点式刷新（基盤整備）

- **対象**: `src/city-editor/core/gen/tacticalTerrain.ts` の新設、`castlePlacement.ts` の改修。

- **内容**:
  - `heightfield` からの比高（Prominence）および断崖勾配（Grade %）の算出モジュール。
  - `placeCastleRegion` での候補セル採点式に局所比高（上限付き）、高さ係数付きの障壁ボーナス、水の確保の減点を導入。
  - CE の簡易版解析は `riverfront`・`motte`・大きな比高の `hilltop` だけを判定する（§3.2）。
  - 既存の固定fixture（Tobogobo, Tives, Autruyles, Shroutumn）での回帰テスト（城が消えたり不正な形状にならないことの確認）。

### ステップ 2: FMG側の戦術地形解析とDescriptor契約（連携接続）

- **対象**: `src/services/burgSiteDescriptor.ts`, `src/city-editor/core/gen/site/burgSiteDescriptor.ts`。

- **内容**:
  - FMG側で都市候補決定時に、地形・河川ポリゴンから `TacticalSiteAnalysis` を算出。崖の縁・蛇行の首と先端の比高・小さな丘は、FMG のセル標高より細かい解析（または河岸の形状）で判定する。
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
| **市街地の端に丘がある都市** | 城郭が丘の上に、外周一体型（`edge` + `integrated`）で配置される。 |
| **丘が市街地に完全に含まれる都市** | 城郭が丘の頂上に、独立型中央城郭（`central` + `detached`）として配置される。 |
| **蛇行ループ（首が高い）** | 城郭が首に置かれ、城の脇を通る陸路が首に残る。 |
| **蛇行ループ（首が低い）** | 城郭が先端または半島内の最高所に置かれ、市壁が首を横断し、主街路が城で行き止まる。 |
| **高いが水源から遠い丘と、低いが川に近い高台** | 水の確保の減点により、後者が選ばれる。 |
| **平坦な河岸と比高5mの丘の両方がある都市** | 障壁の高さ係数により、平坦な河岸が自動的に勝つことはない。 |
| **完全な平坦地（比高ゼロ）** | モット型として扱われ、既存の幾何・面積・距離基準へ安全にフォールバックして城が正常に生成される。 |
| **主要街道との交差** | 城郭が主要街道の接続点や主要門を完全に塞がず、城門までの進入路が確保される。 |
| **決定論の維持** | 同一seed・同一パラメータで再生成した際、城郭の位置・向き・形状が100%一致する。 |

---

## 8. 史料による検証（2026-10-07）

| 史例 | 史料が示すこと | 本書への反映 |
| :--- | :--- | :--- |
| Durham | 川が三方を囲み、残る一方に狭い首がある。城はその陸側の首を押さえる（[The Bailey](https://wikipedia.com/wiki/The_Bailey)、[Comerford](https://www.patrickcomerford.com/2025/09/to-see-durham-is-to-see-english-sion.html)） | 蛇行・首型を新設（§2・§5.2） |
| Besançon | 城塞のある Mont Saint-Étienne は蛇行の首を占める。ヴォーバンが1684年に完成させた稜堡式要塞（[Citadel of Besançon](https://en.wikipedia.org/wiki/Citadel_of_Besan%C3%A7on)、[citadelle.com](https://www.citadelle.com/en/a-voir-a-faire/la-citadelle-de-besancon)） | 首型の例。中世の例ではない旨を表に注記 |
| Bern | Nydegg 城は蛇行の先端。町は首の方へ伸びた | 蛇行・先端型の代表例 |
| Lincoln | ノルマン期の城は上町の南西角に建てられ、町の残りが外郭として使われた（[Gatehouse](https://www.gatehouse-gazetteer.info/English%20sites/LincolnCastle.html)、[Lincolnshire HER](https://heritage-explorer.lincolnshire.gov.uk/Monument/MLI70129)） | 丘頂型の既定を端・一体型に変更（§4.3） |
| Old Sarum | 高所で風が強く水が乏しいため住民が谷へ移り、1240年頃までに大半が Salisbury へ移った（[English Heritage](https://www.english-heritage.org.uk/siteassets/home/learn/school-visits/free-school/teachers-kits/old-sarum-teachers-kit-2015.pdf)、[Southampton大](https://southampton.ac.uk/assets/imported/transforms/content-block/UsefulDownloads_Download/0E07897513AB42CBBCD4E0C41616C534/Old%20Sarum%20Cathedral%20and%20the%20move%20to%20New%20Salisbury.pdf)） | 中央型は例外扱い。水の確保の減点を新設（§4.2） |
| Richmond | 南側は当初、スウェール川への急な落差に守られて無防備だった。後の南の幕壁に Scolland's Hall が寄りかかる（[English Heritage](https://www.english-heritage.org.uk/visit/places/richmond-castle/history-and-stories/description/)、[h2g2](https://www.h2g2.com/edited_entry/A2256770)、[Historic England](https://www.historicengland.org.uk/listing/the-list/list-entry/1010627)） | 崖側は無壁、または館の背面壁で兼ねる（§5.1） |
| Norwich, Oxford | Norwich の城の土盛りはイングランド最大で、全くの人工物（[Norfolk Museums](https://www.museums.norfolk.gov.uk/-/media/museums/downloads/learning/norwich-castle/ocr-documents/norwich-castle-keep-graphic-panel-1.pdf)）。Oxford の土盛りの下にはサクソン期の集落跡が残り、土盛りには井戸室がある（[Historic England](https://historicengland.org.uk/listing/the-list/list-entry/1007730)） | 平地型をモット型に改め、自然の丘頂型と分離（§2）。井戸の必要性を §4.2 の根拠に |
| Castello Sforzesco | ミラノの市壁の北西にある内陸の城で、大河には面していない | 河岸型の事例から削除し、Wallingford・York に差し替え |

### 8.1 未決事項

- **既存の防御施設の再利用**: Lincoln（ローマ時代の城壁）や Old Sarum（鉄器時代の丘砦）のように、古い防御線が城の位置を決めた例は多い。旧城壁を導入する段階で、「旧防御線の角」を候補の加点として扱う（[castle-road-siting-order.md](castle-road-siting-order.md) §6 のノルマン型と同じ課題）。
- **配点の較正**: 比高の上限（+75）、障壁の高さ係数、水の確保の減点の係数は推定値である。実装時にライブ計測で較正する。
- **首型の首幅の閾値**: 城の脇に陸路を残せる最小の首幅は、城の規模と道幅から決める必要があり、実測で決める。
