# 休閑地削減とカリ肥料接続：輪作・化学肥料による収量モデルの拡張 (Fallow Reduction & Potash Connection)

## 状態

**設計案（未実装）**。ユーザーからの指摘「リン酸/カリウム/窒素肥料でセルの `foodCapacity` が元の値より大きくなり得るが、三圃制農業・四圃輪作を省いて収量を最大化する実装は既にあるか、するのは妥当か」を発端に、既存の収量モデルを監査した結果をもとにした設計。監査の過程で、カリウム肥料相当の `Potash` Good が既存であり（[goods-generator.ts:2376](../../src/extensions/economy/generators/goods-generator.ts#L2376)、木灰から精製する工業用炭酸カリウム）ながらガラス・石鹸向けの一般需要 (`demandCoverage: utilities`) にしか接続されておらず、農業への経路が無いことが判明したため、その接続（§4）も本書の設計範囲に含める。

本書は独立した2つの機能を扱う:

- **設計A（§3）**: 四圃輪作・窒素肥料の採用度に応じて、休閑地の面積比率そのものを縮小する「実効作付面積比率」の新設。
- **設計B（§4）**: 既存の `Potash` Good を農村施肥ストックに変換し、単位面積あたり収量ボーナスとして接続する縦切り。設計Aとは軸が異なり（§3.5参照）、実装上も独立（どちらか一方だけの実装が可能）。

## 1. 目的と非目的

### 目的

- 現状 `ANNUAL_SOWN_SHARE = 0.67`（三圃制の「2/3作付・1/3休閑」比率）が、技術・肥料の採用レベルに関わらず**全セル・全時代で固定**になっている点を是正する。四圃輪作と化学窒素肥料は、史実では休閑・マメ科輪作が担っていた地力回復機能を代替し、休閑地なしの連作を可能にした技術であり、この効果を作付面積比率という別軸でモデル化する（設計A）。
- `ruralFoodCapacity`（＝ユーザーの言う「セルの `foodCapacity`」の内部名、[agriculturalLandUse.ts:195](../../src/extensions/economy/generators/agriculturalLandUse.ts#L195)）と `requiredFieldAreaHectares()` の両方が、同じ「実効作付面積比率」を参照するようにする。
- 既存の乗算チェーン方式（`AGTECH_YIELD_BONUS_MAX` 等、[agriculturalLandUse.ts:657-675](../../src/extensions/economy/generators/agriculturalLandUse.ts#L657-L675)）と同じ「独立した技術ごとの直接項を足し込む」設計を踏襲し、既存コードとの一貫性を保つ。
- 既存の `Potash` Good を、`FertilizerInvestment`/`NitrogenFertilizerInvestment` と同型の農村施肥ストックに接続し、収量ボーナス軸に反映する（設計B）。新しい Good・鉱物・技術ノードは追加しない。
- 設計Aは新しい Good・技術ノード・市場シグナルを一切追加しない。既に `AgriculturalConditions` に流れている `fourCourseRotationByCell` / `nitrogenFertilizerStockByCell`（[agriculturalLandUse.ts:142](../../src/extensions/economy/generators/agriculturalLandUse.ts#L142), [:172](../../src/extensions/economy/generators/agriculturalLandUse.ts#L172)）だけを使い、`agriculturalLandUse.ts` 内部の計算式変更のみで完結させる。

### 非目的（本書の範囲外）

- `soilFertility`（土壌の有機的疲弊・回復モデル）の変更。§3.4で理由を説明する通り、設計Aは意図的に独立させる。
- `phosphateFertilizer` を設計Aの入力に加えること。§3.5で理由を説明する。
- `BASE_NET_YIELD_KG_PER_SOWN_HECTARE` や既存の `*_YIELD_BONUS_MAX` 系の再較正。
- 四圃輪作・窒素肥料の adopted 判定条件そのものの変更（既存の技術ツリー判定はそのまま利用する）。
- 工業採掘によるカリ鉱床（Stassfurt型カリ岩塩鉱床、1861年相当）の新設。設計Bは既存の木灰由来 `Potash` のみを対象とし、鉱山ベースの大規模カリ肥料（`Phosphate Rock` に相当する新規鉱物・鉱床・プラント）は別の縦切りとして扱う。
- `Potash` の新しい Good への分割（例: 農業用 `Potassium Fertilizer` を工業用 `Potash` と別カタログ項目にすること）。既存の1つの Good に「ガラス・石鹸」と「農業」という2つの需要先を持たせる、`Sulfuric Acid` と同じ「一Good・複数消費経路」パターンを踏襲する。
- `Potash` の `demandCoverage`/`chance`/`recipes` など既存フィールドの変更。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 作付面積比率 | `ANNUAL_SOWN_SHARE = 0.67` はモジュール定数。技術・肥料レベルに関わらず全セル・全時代で不変。 | [agriculturalLandUse.ts:26](../../src/extensions/economy/generators/agriculturalLandUse.ts#L26) |
| 利用箇所①（食料容量の天井） | `supportedPeople(cultivableHectares, yieldKgPerHa)` が `ANNUAL_SOWN_SHARE` を使って「全耕作可能地を使った場合の食料生産上限」を計算し、`ruralFoodCapacity`/`foodPotential` に反映される。呼び出し元は1箇所のみ。 | [agriculturalLandUse.ts:557-562](../../src/extensions/economy/generators/agriculturalLandUse.ts#L557-L562), [:326-328](../../src/extensions/economy/generators/agriculturalLandUse.ts#L326-L328) |
| 利用箇所②（必要面積の逆算） | `requiredFieldAreaHectares(people, yieldKgPerHa)` が同じ定数を使い、人口を養うのに必要な「休閑込みの総圃場面積」を逆算する。呼び出し元は `calculateAgriculturalLandProfile`（実際の作付面積算定）と `reconcileForestClearanceForAgriculture`（開墾判定）の2箇所。 | [agriculturalLandUse.ts:413-418](../../src/extensions/economy/generators/agriculturalLandUse.ts#L413-L418), [:338](../../src/extensions/economy/generators/agriculturalLandUse.ts#L338), [:509](../../src/extensions/economy/generators/agriculturalLandUse.ts#L509) |
| 収量式の既存項 | `calculateYieldKgPerHectare()` は `fourCourseRotationByCell` と `nitrogenFertilizerStockByCell`/`fertilizerStockByCell` を既に受け取り、単位面積あたり収量への乗算ボーナスとしてのみ使っている。休閑面積比率には一切影響しない。 | [agriculturalLandUse.ts:657-675](../../src/extensions/economy/generators/agriculturalLandUse.ts#L657-L675) |
| 四圃輪作の他の効果 | 収量+12%・労働-8%に加え、`soilFertility` の回復ボーナス（`FOUR_COURSE_SOIL_RESTORATION_BONUS`）と `floweringForageArea`（クローバー放牧地、既存 `cultivatedArea` の内訳の一部を占めるだけで総面積を増やさない）を持つ。 | [agriculturalLandUse.ts:1030-1031](../../src/extensions/economy/generators/agriculturalLandUse.ts#L1030-L1031), [:357-358](../../src/extensions/economy/generators/agriculturalLandUse.ts#L357-L358) |
| `soilFertility` と化学肥料の非接続 | `phosphateFertilizer`/窒素肥料はいずれも `soilFertility` に触れない設計判断が明記済み。理由は (a) `MAX_SOIL_FERTILITY = 1.1` の天井で史実の効果を表現しきれない、(b) 購入財の効果と土壌疲弊という別物理量を混線させると既存の「乗算チェーンへの直接項」という設計から外れる。 | [phosphate-fertilizer-vertical-slice.md:352-355](./phosphate-fertilizer-vertical-slice.md#L352) |
| データの供給経路 | `fourCourseRotationByCell`/`fertilizerStockByCell`/`nitrogenFertilizerStockByCell` は `DevelopmentPotentialModule.getAgriculturalConditions()` で毎年解決され、`AgriculturalConditions` 経由で既に `agriculturalLandUse.ts` に渡っている。 | [developmentPotential.ts:353-383](../../src/extensions/economy/generators/developmentPotential.ts#L353-L383) |
| カリウム肥料 (`Potash`) | Good自体は既存（木灰から精製、`recipes: [{ Ash: 1.5 }]`、`chance: 0` で鉱山採掘ではない）。`requiredTechnology` は無し。`demandCoverage: { utilities: 0.3 }` に加え、Soap（3レシピ）・Glass（`White sand`との複合レシピ）の原料としても消費される。農業・`soilFertility`・収量式への接続は無く、独立した農村施肥ストック（`Market.potashFertilizerStock`相当）も存在しない。 | [goods-generator.ts:2376-2389](../../src/extensions/economy/generators/goods-generator.ts#L2376-L2389), [:1396](../../src/extensions/economy/generators/goods-generator.ts#L1396), [:2097-2099](../../src/extensions/economy/generators/goods-generator.ts#L2097-L2099) |
| 既存Fertilizer投資モジュールの型 | `FertilizerInvestment`/`NitrogenFertilizerInvestment` はほぼ同一構造（対象Good名・定数名のみ異なる）: 対象Goodの `isGoodEnabled()` チェック→市場ごとの`cultivatedArea`集計→`TARGET_*_PER_HECTARE`から購入希望量算出→`marketTreasury`予算内で`Markets.consumeForMarketInvestment()`→EWMAで`market.*Stock`を更新。 | [fertilizerInvestment.ts](../../src/extensions/economy/generators/fertilizerInvestment.ts), [nitrogenFertilizerInvestment.ts](../../src/extensions/economy/generators/nitrogenFertilizerInvestment.ts) |
| `isGoodEnabled()` の判定基準 | `requiredTechnology` が無い Good（`Potash`・`Tools`など）は無条件で有効。`AgTechInvestment`（Tools購入）も技術ゲート無しで動作している既存の前例。 | [goods-generator.ts:133-139](../../src/extensions/economy/generators/goods-generator.ts#L133-L139), [agTechInvestment.ts:58-59](../../src/extensions/economy/generators/agTechInvestment.ts#L58-L59) |
| 年次呼び出し順序 | `index.tsx` が `AgTechInvestment→FertilizerInvestment→NitrogenFertilizerInvestment→IndustrialTechInvestment` の順に毎年1回呼ぶ。「農業投資はState/鉱山投資より優先」という明記済みの原則。 | [index.tsx:2944-2957](../../src/extensions/economy/index.tsx#L2944-L2957) |
| settle-year guardとsave互換性 | `fertilizerInvestmentLastSettledYear`等はGood/技術ノードを伴わない単純スカラーで、`economyContext.ts`の`yearFromSlice`/`writeYearToSlice`パターンに載るだけ。`extensionStateSlices.ts`への個別登録は無い（`Market.fertilizerStock`/`nitrogenFertilizerStock`も同様、オプショナル数値フィールドの追加のみで済んでいる）。 | [economyContext.ts:1698-1716](../../src/extensions/economy/economyContext.ts#L1698-L1716) |

## 3. 設計A: 休閑地削減（輪作・窒素肥料）

### 3.1 概念モデル

休閑（三圃制の1/3休閑）とマメ科・四圃輪作は、史実では主に**窒素の生物学的回復**のために存在した。化学肥料のうち、この役割を代替できるのは硫安・硝安などの**窒素肥料**であり、過リン酸肥料（リン酸肥料）は史実でも土壌の窒素循環には関与せず、既存単価あたり収量を直接押し上げる別種の効果として扱われてきた。この非対称性を、`calculateYieldKgPerHectare()` が既に持つ「収量への直接ボーナス」（リン酸・窒素・四圃式すべてが対象）とは別に、**「作付できる面積の比率」という第二の軸**として新設する。この軸には四圃輪作と窒素肥料だけが寄与し、リン酸肥料は寄与しない。

これは「三圃制・四圃輪作を省いて収量を最大化する」実装ではなく、**休閑地というコストそのものを、輪作・化学窒素の採用度に応じて連続的に縮小する**実装である。三圃制（`threeFieldAgriculture`）はベースラインとして常に有効なままで、`ANNUAL_SOWN_SHARE` 自体は変更しない（後方互換の基準値として残す）。

### 3.2 新規定数

```ts
/**
 * Ceiling on the fraction of cultivable land actively cropped in a given year. Even with
 * full rotation and chemical fertilizer, field margins, drainage, crop-calendar gaps, and
 * equipment access keep a residual share below 100% — this is not a claim that fallow fully
 * disappears, only that it shrinks toward a modern-agriculture floor. calibration TBD.
 */
export const EFFECTIVE_SOWN_SHARE_CEILING = 0.92;

/**
 * Norfolk-style four-course rotation replaces bare fallow with a fodder/legume course, so most
 * of the historical fallow gap closes on rotation alone, before any chemical input exists.
 * Smaller than NITROGEN_FERTILIZER_FALLOW_REDUCTION_MAX because it still relies on a course
 * being spent on non-staple fodder rather than staple crop. calibration TBD.
 */
export const FOUR_COURSE_FALLOW_REDUCTION_MAX = 0.1;

/**
 * Synthetic nitrogen replaces the biological nitrogen-fixation that fallow/legume rotation
 * exists to provide, so nitrogen fertilizer — not phosphate — substitutes for the rest of the
 * fallow requirement. Phosphate's historical role (superphosphate, 1842) was a yield boost
 * unrelated to the soil nitrogen cycle, so PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX stays yield-only
 * and does not feed this lever (see §3.5). calibration TBD, same order as
 * FOUR_COURSE_FALLOW_REDUCTION_MAX.
 */
export const NITROGEN_FERTILIZER_FALLOW_REDUCTION_MAX = 0.15;
```

`ANNUAL_SOWN_SHARE(0.67) + FOUR_COURSE_FALLOW_REDUCTION_MAX(0.10) + NITROGEN_FERTILIZER_FALLOW_REDUCTION_MAX(0.15) = 0.92 = EFFECTIVE_SOWN_SHARE_CEILING`。両方が採用率1.0に達した時点でちょうど天井に触れる関係にしているが、`Math.min()` によるクランプは将来別の寄与項が追加された場合の安全弁として残す。

### 3.3 収量への反映（`agriculturalLandUse.ts`）

新しいヘルパーを `calculateYieldKgPerHectare()` の近くに追加する:

```ts
function calculateEffectiveSownShare(conditions: AgriculturalConditions, cellId: number): number {
  const fourCourseRotation = conditions.fourCourseRotationByCell?.[cellId] ?? 0;
  const nitrogenFertilizer = conditions.nitrogenFertilizerStockByCell?.[cellId] ?? 0;
  return Math.min(
    EFFECTIVE_SOWN_SHARE_CEILING,
    ANNUAL_SOWN_SHARE +
      FOUR_COURSE_FALLOW_REDUCTION_MAX * fourCourseRotation +
      NITROGEN_FERTILIZER_FALLOW_REDUCTION_MAX * nitrogenFertilizer
  );
}
```

既存の2関数へ第3引数を追加し、デフォルト値で後方互換を保つ（第6引数省略時の既存挙動維持、というリン酸肥料スライスのテスト方針と同じパターン）:

```ts
export function requiredFieldAreaHectares(
  people: number,
  yieldKgPerHa: number,
  sownShare: number = ANNUAL_SOWN_SHARE
): number {
  if (people <= 0 || yieldKgPerHa <= 0 || sownShare <= 0) return 0;
  return (people * STAPLE_NEED_KG_PER_PERSON_YEAR) / (EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK * yieldKgPerHa * sownShare);
}

function supportedPeople(
  cultivableHectares: number,
  yieldKgPerHa: number,
  sownShare: number = ANNUAL_SOWN_SHARE
): number {
  return (cultivableHectares * sownShare * yieldKgPerHa * EDIBLE_SHARE_AFTER_SEED_LOSS_STOCK) / STAPLE_NEED_KG_PER_PERSON_YEAR;
}
```

3つの呼び出し箇所（[:326](../../src/extensions/economy/generators/agriculturalLandUse.ts#L326)・[:338](../../src/extensions/economy/generators/agriculturalLandUse.ts#L338)・[:509](../../src/extensions/economy/generators/agriculturalLandUse.ts#L509)）で `calculateEffectiveSownShare(conditions, cellId)` を一度計算し、`supportedPeople`/`requiredFieldAreaHectares` に渡す。`conditions` はすべての呼び出し箇所で既にスコープ内にあるため、シグネチャの変更は最小限で済む。

### 3.4 なぜ `soilFertility` に触れないか

リン酸肥料スライスと同じ理由をそのまま踏襲する。加えて、本機能固有の理由が1つある: `soilFertility` の疲弊・回復式（`advanceAgriculturalSoils()`、[agriculturalLandUse.ts:1005-1059](../../src/extensions/economy/generators/agriculturalLandUse.ts#L1005-L1059)）は「**作付済みの土地で何を育てているか**（主穀比率・マメ科比率）」を扱っており、本機能が扱う「**耕作可能地のうちどれだけが今年作付されているか**」とは別の物理量である。三圃制の「休閑」と、輪作の「クローバー・マメ科への転作」は歴史的にはどちらも "rotation" と呼ばれるが、このコードベースでは既に別の変数（面積比率 vs 土壌状態）に分離されており、本機能はその分離を維持したまま面積比率側だけを拡張する。したがって二重計上の心配はない。

### 3.5 なぜ Phosphate Fertilizer / Potash を対象にしないか

過リン酸肥料（1842年相当）は史実でもリンの供給源であり、土壌の窒素循環・休閑の要否には関与しない。休閑・マメ科輪作が回復するのは主に窒素であり、リンは連作でも大きく枯渇しない元素として扱われてきた。よって `PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX` は既存どおり単位面積あたり収量のみに効かせ、`calculateEffectiveSownShare()` には `fertilizerStockByCell`（リン酸）を含めない。

カリウム（`Potash`）についても同じ分類が成り立つ: カリウムは主に品質・耐病性・水分調整に関わる元素で、窒素循環や休閑の要否とは独立である。したがって§4で設計する `potashFertilizerStockByCell` も `calculateEffectiveSownShare()` には含めず、`calculateYieldKgPerHectare()` 側（リン酸と同じ「収量ボーナスのみ」の分類）にのみ接続する。

### 3.6 副次的な整合性チェック（設計の妥当性の裏付け）

- `requiredFieldAreaHectares()` の分母が大きくなるため、同じ人口を養うのに必要な「休閑込み総面積」が縮小する。これは `reconcileForestClearanceForAgriculture()` を通じて、四圃輪作・窒素肥料を採用した国家ほど**同じ人口を養うための開墾量が減る**という効果を自然にもたらす（土地節約的な農業集約化という史実の効果と整合）。
- `subsistenceArea = requiredArea * SUBSISTENCE_FIELD_RESERVE` も同時に縮小するため、自給に必要な面積が減った分だけ余剰労働力が輸出用の増反（`laborAffordableArea`）や都市への人口流出（`migratableAdults`）に回りやすくなる。これは農業生産性向上が都市化を後押しするという既存モデルの意図（[population-food-supply.md](../simulation/population-food-supply.md)）とも整合する。

## 4. 設計B: Potashの農業接続（収量ボーナス）

### 4.1 概念モデル

`Potash` は木灰由来の炭酸カリウムで、既にガラス・石鹸向けの交易財として実装済みである（§2）。カリウムは主に品質・耐病性・水分調整に関わる元素であり、窒素循環・休閑の要否とは独立なので、§3.5の結論に従い**収量ボーナス軸のみに接続**し、`calculateEffectiveSownShare()`（作付面積比率）には寄与させない。

新しい Good は追加しない。既存の `Potash` をそのまま農村施肥ストックの購入対象にする。これは `Phosphate Rock`/`Phosphate Fertilizer` のような新規鉱物・新規化学製品を要した過リン酸肥料スライスとは異なり、**既存の1つの Good に新しい消費経路（農業）を追加するだけ**の縦切りであり、`Sulfuric Acid` が職人生産とState資本設備という2つの供給経路を持つのと同型の「一Good・複数消費経路」パターンの応用である。

技術ノードは新設しない。`Potash` 自体に `requiredTechnology` が無く（木灰精製は古代からの技術で常時利用可能）、これは `Tools`（`AgTechInvestment` の入力、同じく `requiredTechnology` 無し）と同型である。「Phosphate/Nitrogen Fertilizerのような近代化学製品」ではなく「既存の古くからの副産物を農地にも回す」という性質のため、`AgTechInvestment` と同じ無条件パターンに倣う（§4.7で二重計上リスクを議論する）。

### 4.2 新規定数（`agriculturalLandUse.ts`）

```ts
/**
 * Potash (wood-ash-derived potassium carbonate) applied to fields as a market-purchased soil
 * amendment, distinct from the ambient household-scale ash return already implicit in
 * BASE_NET_YIELD_KG_PER_SOWN_HECTARE. Potassium mainly affects crop quality/disease
 * resistance/water regulation rather than the nitrogen-limited fallow cycle (see §3.5), so this
 * stays yield-only, like PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX, and does not feed
 * calculateEffectiveSownShare(). Set below FOUR_COURSE_YIELD_BONUS_MAX(0.12) — the pre-industrial,
 * low-K-concentration (~3-7% K2O by mass) wood-ash source is smaller than either the industrial
 * fertilizers or a free adopted practice. calibration TBD.
 */
export const POTASH_FERTILIZER_YIELD_BONUS_MAX = 0.08;
```

`calculateYieldKgPerHectare()` の乗算チェーンに1項追加:

```ts
function calculateYieldKgPerHectare(/* ... */): number {
  return (
    BASE_NET_YIELD_KG_PER_SOWN_HECTARE *
    effectiveClimateYield *
    (1 + AGTECH_YIELD_BONUS_MAX * effectiveAgTech) *
    (1 + STATE_YIELD_BONUS_MAX * stateProductivity) *
    (1 + FOUR_COURSE_YIELD_BONUS_MAX * (conditions.fourCourseRotationByCell?.[cellId] ?? 0)) *
    (1 + PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX * (conditions.fertilizerStockByCell?.[cellId] ?? 0)) *
    (1 + NITROGEN_FERTILIZER_YIELD_BONUS_MAX * (conditions.nitrogenFertilizerStockByCell?.[cellId] ?? 0)) *
    (1 + POTASH_FERTILIZER_YIELD_BONUS_MAX * (conditions.potashFertilizerStockByCell?.[cellId] ?? 0)) // 追加
  );
}
```

`AgriculturalConditions` に追加:

```ts
/**
 * Market-purchased Potash adoption coverage, resolved to cells by DevelopmentPotential from
 * Market.potashFertilizerStock — same shape as fertilizerStockByCell/nitrogenFertilizerStockByCell.
 */
readonly potashFertilizerStockByCell?: Float32Array;
```

### 4.3 Market型拡張

`marketTypes.ts` に追加（既存 `fertilizerStock`/`nitrogenFertilizerStock` と同型・同じ0..1 EWMA意味論）:

```ts
/**
 * Rural Potash adoption stock (0..1 EWMA), driven by PotashFertilizerInvestment.settleAnnual().
 * Separate account from fertilizerStock/nitrogenFertilizerStock — three independent stocks
 * sharing a market's treasury, not a rewrite of either sibling.
 */
potashFertilizerStock?: number;
```

### 4.4 `PotashFertilizerInvestment` モジュール（新規ファイル）

`fertilizerInvestment.ts` をほぼそのまま複製する。対象Good名と定数名以外の構造上の差分は無い:

```ts
// potashFertilizerInvestment.ts
export const TARGET_POTASH_PER_HECTARE = 0.006; // calibration TBD — 木灰由来で嵩張るため施用量は控えめに設定
export const POTASH_BUDGET_SHARE_OF_TREASURY = 0.12; // 既存2兄弟と同じ優先度階層
export const POTASH_ADOPTION_RATE = 0.15; // 既存2兄弟と同じEWMAペース

export class PotashFertilizerInvestmentModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getPotashFertilizerInvestmentLastSettledYear() === year) return false;
    setPotashFertilizerInvestmentLastSettledYear(year);

    const potashGood = getGoods().find(good => good.name === "Potash");
    if (!potashGood || !isGoodEnabled(potashGood)) return true;
    // 以下、cultivatedHectaresByMarket 集計 → 予算内購入 → market.potashFertilizerStock の
    // EWMA更新まで、fertilizerInvestment.ts:47-92 と同一パターン。
  }
}

export const PotashFertilizerInvestment = new PotashFertilizerInvestmentModule();
```

`Potash` は `requiredTechnology` を持たないため `isGoodEnabled()` は常に真を返す（[goods-generator.ts:133-139](../../src/extensions/economy/generators/goods-generator.ts#L133-L139)）。これは新しい技術ゲートを追加しないことを意味し、`AgTechInvestment`（Tools購入）と同じ「技術に依存しない、生産余力と治安・市場網だけに依存する」投資として扱う。

`economyContext.ts` に `getPotashFertilizerInvestmentLastSettledYear`/`setPotashFertilizerInvestmentLastSettledYear` を、既存の `getFertilizerInvestmentLastSettledYear` と同じ `yearFromSlice`/`writeYearToSlice` パターンで追加する（[economyContext.ts:1698-1705](../../src/extensions/economy/economyContext.ts#L1698-L1705)と同型）。

### 4.5 呼び出し順序（`index.tsx`）

```ts
AgTechInvestment.settleAnnual();
FertilizerInvestment.settleAnnual();
NitrogenFertilizerInvestment.settleAnnual();
PotashFertilizerInvestment.settleAnnual(); // 追加 — 同じ marketTreasury.balance を3番目の農業投資として消費
IndustrialTechInvestment.settleAnnual();
```

既存2兄弟と同じ「農業投資はState/鉱山投資より優先」という原則（[index.tsx:2944-2957](../../src/extensions/economy/index.tsx#L2944-L2957)、`rural-agtech-investment.md` §6.3）をそのまま延長する。

### 4.6 `developmentPotential.ts` 接続

`resolveFertilizerStockByCell()` と同型の `resolvePotashFertilizerStockByCell()` を追加し、`getAgriculturalConditions()`（[developmentPotential.ts:353-383](../../src/extensions/economy/generators/developmentPotential.ts#L353-L383)）の戻り値に `potashFertilizerStockByCell: resolvePotashFertilizerStockByCell(cellCount)` を加える。

### 4.7 二重計上リスクとその緩和

`BASE_NET_YIELD_KG_PER_SOWN_HECTARE`(450kg/sown-ha) は中世農業の慣行収量として較正されており、農家が自分の炉の灰を自分の畑に撒くという零細規模の慣行（家計内自給）は、既にこの基準値へ暗黙に織り込まれている可能性が高い。本機能が新しく代表するのは、本来ガラス・石鹸向けの交易財である `Potash` を農業向けに転用・購入するという、**家計内自給を超えた市場規模の施肥**である。この区別を成立させるため:

- ボーナス上限を四圃式(0.12)より低い0.08に設定し、化学肥料(0.2/0.3)はもちろん「無償の慣行」である四圃式よりも慎重な値にする。
- `TARGET_POTASH_PER_HECTARE`(0.006)は`Tools`(0.02)より小さく、購入量そのものを控えめにする。
- それでもプレイテストで収量が過大に見える場合は、§8のOpen Questionsで追加の緩和策（era-0技術の最低限のゲート等）を検討する。

### 4.8 save互換性

新規Goodを追加しないため `migrateXGoods()` は不要。`Market.potashFertilizerStock` はオプショナル数値フィールドの追加であり、既存の `fertilizerStock`/`nitrogenFertilizerStock` と同じく `extensionStateSlices.ts` への個別登録は不要（確認済み: 現行2兄弟もこのファイルに登録が無い、[economyContext.ts:1698-1716](../../src/extensions/economy/economyContext.ts#L1698-L1716)）。settle-year guardは `economyContext.ts` の既存スライス機構にキーを追加するのみで済む。

## 5. Phase分割

新規 Good・鉱物・プラントが不要なため、いずれのPhaseも比較的小さい。設計A・設計Bは互いに依存しないため、どちらから着手してもよい。

- **Phase 1（設計A、§3）**: 定数追加、`requiredFieldAreaHectares`/`supportedPeople` のシグネチャ変更と3箇所の呼び出し更新。既存の `fourCourseRotationByCell`/`nitrogenFertilizerStockByCell` 供給経路はそのまま利用。
- **Phase 2（設計B、§4）**: `marketTypes.ts`/`AgriculturalConditions` へのフィールド追加、新規 `potashFertilizerInvestment.ts`、`economyContext.ts` へのsettle-year guard追加、`developmentPotential.ts` の解決関数追加、`index.tsx` への呼び出し追加。

## 6. テスト計画

`agriculturalLandUse.test.ts` に追加（設計A・B共通）:

- 同一セル・同一条件で `nitrogenFertilizerStockByCell` あり/なしを比較し、`ruralFoodCapacity`（＝`supportedPeople` 経由）が上昇すること。
- 同様に `fourCourseRotationByCell` あり/なしでも上昇すること。
- 両方を採用率1.0にした場合、実効作付面積比率が `EFFECTIVE_SOWN_SHARE_CEILING`(0.92) を超えないこと（クランプの回帰確認）。
- `fertilizerStockByCell`（リン酸）・`potashFertilizerStockByCell`（カリ）のみを変化させても実効作付面積比率が変化しないこと（§3.5の分離の回帰確認）。
- `requiredFieldAreaHectares()`/`supportedPeople()` の第3引数省略時、既存の `ANNUAL_SOWN_SHARE` 基準の挙動と完全一致すること（後方互換）。
- `reconcileForestClearanceForAgriculture()`: 同一人口・同一土地で窒素肥料ありのセルの方が開墾対象面積が小さくなること。
- 同一セルで `potashFertilizerStockByCell` あり/なしを比較し、`yieldPerArea` が上昇すること。省略時に既存挙動と完全一致すること。

新規 `potashFertilizerInvestment.test.ts`（`fertilizerInvestment.test.ts` と同型）:

- 予算内で `Potash` が購入され `market.potashFertilizerStock` が上昇すること。
- 供給停止年（`Potash` 市場在庫ゼロ）は緩やかに減衰すること。
- `cultivatedArea` がゼロの市場では購入量もゼロになること。
- `Potash` の既存消費者（ガラス・石鹸レシピ、`demandCoverage: utilities`）と同じ市場在庫を取り合う状態でも、`Markets.consumeForMarketInvestment()` が在庫不足時に購入量を正しく絞ること。

## 7. 受け入れ条件

- `phosphateFertilizer` のみが `adopted` かつ市場在庫がある状態では、実効作付面積比率は `ANNUAL_SOWN_SHARE` から変化しない。
- `fourCourseRotation`/`syntheticAmmonia`（窒素肥料）が `adopted` になっただけでは変化しない。既存の農村施肥ストック（`Market.nitrogenFertilizerStock`）が実際に積み上がって初めて反映される（フラグ駆動の一括倍率を禁止する既存原則の踏襲）。
- `Potash` の市場在庫が積み上がるまでは収量に影響しない（同上の原則を設計Bにも適用）。
- `Potash` の既存消費（ガラス・石鹸向け `demandCoverage: utilities`、Soap/Glassレシピ）は本機能追加後も変更されない。農業向け購入は既存需要に対する**追加の需要源**であり、置き換えではない。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 8. 決定事項 / Open Questions

1. `FOUR_COURSE_FALLOW_REDUCTION_MAX`(0.10)・`NITROGEN_FERTILIZER_FALLOW_REDUCTION_MAX`(0.15)・`EFFECTIVE_SOWN_SHARE_CEILING`(0.92) はいずれも calibration TBD。既存の `*_YIELD_BONUS_MAX` 系と同様、プレイテストで調整する前提。
2. `POTASH_FERTILIZER_YIELD_BONUS_MAX`(0.08)・`TARGET_POTASH_PER_HECTARE`(0.006) も同様に calibration TBD。
3. `Potash` に技術ゲートを設けない設計（§4.1・§4.7）は、`BASE_NET_YIELD_KG_PER_SOWN_HECTARE` との二重計上リスクを完全には排除しない。プレイテストで序盤から収量が過大に見える場合、`POTASH_FERTILIZER_YIELD_BONUS_MAX` を更に下げるか、`literacyAndMarkets`（era-0、既に常時diffused）等の既存技術を市場流通の前提として最低限のゲートに使うことを検討する。
4. `EFFECTIVE_SOWN_SHARE_CEILING` をちょうど「基準値+両寄与項の最大値」に一致させず、意図的に少し低く（例: 0.88）して「化学肥料があっても畦道・水路等で100%には届かない」余地を残すかは未決。現在の案では両者が偶然一致しているため、将来の第3の寄与項の追加時に再検討する。
5. 工業採掘によるカリ鉱床（Stassfurt型、非目的として除外済み）を将来実装する場合、既存の `Potash` Good をそのまま大規模化するか、`Phosphate Rock`/`Phosphate Fertilizer` のように新規Good（例: `Potash Ore`）へ分離するかは未決。

## 9. 関連ドキュメント

- [phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md) §3.8-3.9 — `FertilizerInvestment` の設計一次ソース、`soilFertility` を避ける設計判断の一次ソース（本書§3.4/§4.1が踏襲）
- [synthetic-ammonia-vertical-slice.md](./synthetic-ammonia-vertical-slice.md) — `nitrogenFertilizerStockByCell` の供給経路
- [rural-agtech-investment.md](./rural-agtech-investment.md) — 「State全体への一括倍率を禁止」という設計原則、および技術ゲート無しの投資（Tools/`AgTechInvestment`）の一次ソース
- [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) — 化学肥料と農業側受け皿（輪作・土壌）の現状監査
