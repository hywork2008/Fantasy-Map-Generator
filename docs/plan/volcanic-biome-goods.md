# 火山性商品設計：`Volcanic soil` バイオームからの採取・採掘

## 状態

**2026-08-14 実装済み**（§6 の推奨案をすべて採用）。Economy 拡張（`economy`、既定 OFF）が対象。

- §3.1: `MineralResourcesModule.classifyProvince()` を実装（[mineralResources.ts](../../src/extensions/economy/generators/mineralResources.ts)）。旧「標高75+6%ハッシュ」ロールは削除。
- §3.2: `Pumice`（`biomeOutputByTag: { volcanic: 0.05 }`）を [goods-generator.ts](../../src/extensions/economy/generators/goods-generator.ts) に追加。
- §3.3: `VolcanicAshOperations` を `VolcanicOperations`（[volcanicOperations.ts](../../src/extensions/economy/generators/volcanicOperations.ts)）に汎用化し、Ash（volcanic タグ全体）/ Sulfur（lavaField・volcanicBarrens）/ Obsidian（lavaField のみ）を1サイトから産出。`Sulfur` は evaporite(basin) 経由の既存供給と併存。`basicEmployment.ts` / `employment-overview.ts` / `burgEmploymentComposition.ts` / `production-generator.ts` / `index.tsx` / `economyContext.ts` を追随更新。
- §3.4: 専用アイコンは追加せず、`Pumice` は `good-sand`、`Obsidian` は `good-gemstones` を暫定流用（未決定事項4の推奨どおり）。
- 未実装のまま残す項目（未決定事項1-4のうち今回のスコープ外）: `Obsidian` を原料とする加工チェーン、鉱物マップレイヤーへのサイト表示。
- テスト: `mineralResources.test.ts`（+2件）、`volcanicOperations.test.ts`（旧 `volcanicAshOperations.test.ts` を置換、6件）、`goods-generator.test.ts`（+1件）、`biomeEconomy.test.ts`（+1件）、`i18n/goodsNames.test.ts` 用に `en.json`/`ja.json` へ `Pumice`/`Obsidian` 追加。`tsc --noEmit`・`npm run lint`・`npm run madge`・`npm run build`・`npx vitest run`（2607 tests）はすべてクリーン。

前提となる直近の変更（2026-08-14 時点で `master` に取り込み済み）:

- [b3b63dce](../../src/generators/heightmap-generator.ts) 火山バイオーム実装（`volcanicBarrens` / `lavaField` / `volcanicSoil`）
- [31eb4c79] フォールバック火山配置ロジック + 全テンプレート適用の一貫性テスト
- [6a455163] `FALLBACK_MIN_PEAK_HEIGHT` を陸地しきい値（=22）まで引き下げ、全テンプレートで火山配置を保証

この結果、**Options → Generation の "Volcanism chance %" / "Active volcano chance %" を 100 にすると、テンプレートを問わずほぼ確実に実際の火山地形（活火山なら `lavaField` コア、死火山なら `volcanicBarrens` コア、いずれもその外周に `volcanicSoil` の肥沃なリング）が生成されるようになった**。本書はこの新しい・信頼できるシグナルを Economy 拡張の商品生産に接続する設計を扱う。

## 1. 目的と非目的

### 目的

- 実際に生成された火山地形（`volcanic` タグを持つバイオーム）から、火山性の商品を**採取**（人口ベースの農村生産）・**採掘**（Burg アンカー型の採掘サイト）できるようにする。
- 既存の鉱物地質システム（`mineralResources.ts` の `GeologicalProvinceKind: "volcanic"`）が、実際の火山生成とは無関係な「高標高 + 低確率ハッシュ」の代替ヒューリスティックである点を、本物のバイオーム信号に置き換える。
- Volcanism chance = 0（既定は 30）のマップでは、今日と同じく火山性商品が一切発生しないことを保証する（回帰なし）。

### 非目的

- `biome-goods-producer-ecosystem.md` が提案する「生産者数（労働力）駆動モデル」への全面移行。本書は既存の単純な `population × biomeOutputByTag` レート方式・`QuarryOperations` 型の Burg 近傍比率方式をそのまま踏襲する。
- 現実の火山鉱物学・鉱床学を厳密に再現すること（`mineral-resource-system.md` §1 の非目的方針を踏襲）。
- プレートテクトニクスモデルの導入。既存の決定論的シード付きハッシュによる豊度バラつきで十分とする。

## 2. 現状監査

### 2.1 火山バイオームは実在するが、Economy はまだ読んでいない

`biomeCatalog.ts` に3つの火山系バイオームが定義済み:

```
volcanicBarrens: habitability 3,  tags: [dry, mountain, volcanic]   // 死火山の裸クレーター
lavaField:       habitability 0,  tags: [dry, mountain, volcanic]   // 活火山の溶岩コア
volcanicSoil:    habitability 55, tags: [arable, volcanic]          // 肥沃な火山灰土の裾野
```

[biomeCatalog.ts:161-170](../../src/data/biomeCatalog.ts#L161-L170)

`volcanicSoil` は `arable` タグを持つため、Grain/Wheat 等の通常農業（`biomeOutputByTag: { arable: ... }`）は**すでに自動的に機能している**。対応が要るのは "火山ならでは" の商品のほうである。

`goods-generator.ts` を `biomeOutputByTag` で全文検索した結果、**`volcanic` タグを参照している Good は現状ゼロ**。`volcanicBarrens` / `lavaField` / `volcanicSoil` は、通常バイオームの気候マトリクスに存在しないため、他のどの `biomeOutputByTag`（`arable` を除く）にも一致しない。つまり `lavaField` / `volcanicBarrens` は事実上どの商品も生まない完全な空白地帯になっている。

### 2.2 既存の "volcanic" 地質プロヴィンスは、本物の火山と無関係

`mineralResources.ts` の `MineralGeologicalProvince` はすでに `"volcanic"` という `kind` を持ち、`Volcanic Ash` Good の唯一の供給源になっている（[volcanicAshOperations.ts](../../src/extensions/economy/generators/volcanicAshOperations.ts)）。しかしその分類ロジックは:

```ts
// classifyProvince()
if (height >= 75 && this.hash(seed, "volcanic", cellId) < 0.06) return "volcanic";
```

[mineralResources.ts:216-230](../../src/extensions/economy/generators/mineralResources.ts#L216-L230)

これは「標高 75 以上のセルを 6% の確率で "volcanic" 扱いにする」独立したハッシュロールであり、**実際にそのセルが火山かどうかとは無関係**。このロジックが書かれた当時（`urban-construction-industry.md` §3.4 の記述）は「ヒートマップ生成後にセル単位の "ここは火山" フラグが残らない」ことが前提で、意図的な代替ヒューリスティックだった:

> 火山の地質学的痕跡｜ヒートマップ生成テンプレート "Volcano" はマップ全体の初期地形整形にのみ使われ、生成後にセル単位の「ここは火山性」フラグを残さない。（`urban-construction-industry.md` 3.4節前段）

今はこの前提が崩れている。`heightmap-generator.ts` の `finalizeVolcanoes()` が `grid.cells.volcanic`（0..1 強度）/ `grid.cells.volcanicActive` を書き込み、`biomeAssignment.ts` の `classifySpecialBiome()` がそれを読んで `volcanicBarrens` / `lavaField` / `volcanicSoil` を確定させている（[heightmap-generator.ts:254-279](../../src/generators/heightmap-generator.ts#L254-L279)、[biomeAssignment.ts:235-242](../../src/generators/biomeAssignment.ts#L235-L242)）。ただし `grid.cells.volcanic` 自体は `pack.cells` 側には転写されず、`biomes.ts` の変換処理内で一時的に使われるだけ（[biomes.ts:41-93](../../src/generators/biomes.ts#L41-L93)）。**最終的に残る「ここは火山」の唯一の手掛かりは `pack.cells.biomeCode` が指すバイオームの `volcanic` タグである。**

結果として、Volcanism chance = 100% / Active volcano chance = 100% にしても:

- `Volcanic Ash` の採取候補地は、実際の火山とは無関係な「たまたま標高 75 以上で 6% を引いたセル」に立地し続ける。
- 逆に、本物の火山（`lavaField` / `volcanicBarrens`）のセルが標高条件やハッシュを外れれば、"volcanic" プロヴィンスに一切分類されないこともあり得る。

### 2.3 `Sulfur` は火山と無関係な "evaporite"（蒸発岩）源しか持たない

`DISTRICT_PROFILES` を見ると:

```ts
{ type: "evaporite", provinces: ["basin"], primary: "sulfur", commodities: ["sulfur", "saltpeter"] }
```

[mineralResources.ts:66-83](../../src/extensions/economy/generators/mineralResources.ts#L66-L83)

`Sulfur`（[goods-generator.ts:868-881](../../src/extensions/economy/generators/goods-generator.ts#L868-L881)）は `"basin"` プロヴィンス（堆積盆地の蒸発岩）からしか産出しない。現実には硫黄の代表的な産地は火山性の噴気孔（フマロール）であり、`"volcanic"` プロヴィンスに一切紐付いていないのは片手落ちになっている。

### 2.4 農村生産パイプラインは「鉱物」を明示的に除外する

`getRuralProductionContributions()` は次の除外を行う:

```ts
if (!good || !isGoodEnabled(good) || isMineSuppliedGoodName(good.name) || good.name === "Salt") continue;
```

[production-utils.ts:172-189](../../src/extensions/economy/generators/production-utils.ts#L172-L189)

`isMineSuppliedGoodName()` は `ORE_COMMODITIES`（iron/copper/tin/lead/silver/gold の ore/ingot）と `FUEL_MINERAL_COMMODITIES`（coal/saltpeter/**sulfur**）の名前集合でのみ判定する（[mineralResourcesTypes.ts:1-10](../../src/extensions/economy/generators/mineralResourcesTypes.ts#L1-L10)、[mineralResources.ts:40-48](../../src/extensions/economy/generators/mineralResources.ts#L40-L48)）。したがって:

- **`Sulfur` に `biomeOutputByTag` を追加しても、農村採取パイプラインからは常に除外される**（既存の意図的な設計 — 鉱物は Burg アンカー型の採掘サイトからのみ供給する、という既存方針。Iron Ore/Sulfur 自身のコード注釈が明言している）。
- 一方 `Volcanic Ash` は `ORE_COMMODITIES` / `FUEL_MINERAL_COMMODITIES` のどちらにも含まれないが、`biomeOutput` / `biomeOutputByTag` を最初から持たないため、結果的に農村採取パイプラインには現れない（`chance: 0` で旧来の distribution スキャッターからも除外）。**新規に追加する火山商品も、この2系統（採掘専用 or 採取専用）のどちらかに明確に倒す必要がある。**

### 2.5 `Stone`/`Marble` は "レガシー scatter + Quarry" の二重供給が既に前例としてある

`QuarryOperationsModule` の docstring:

> Persistent, Burg-anchored quarry sites feeding Stone/Marble supply **alongside (not replacing — §7 未決定事項 1 decision "併存させる")** the legacy chance/distribution scatter those Goods already carry.

[quarryOperations.ts:86-92](../../src/extensions/economy/generators/quarryOperations.ts#L86-L92)

つまり「1つの Good が2系統の供給源（旧来の scatter ＋ 新しい Burg アンカー型サイト）を同時に持つ」ことは、このコードベースで既に承認済みのパターンである。これは後述 §3.3 で `Sulfur` に火山源を追加する際の直接の前例になる。

## 3. 設計

### 3.1 地質分類の本物化（最優先・最小差分）

`MineralResourcesModule.classifyProvince()` の "volcanic" 判定を、独立ハッシュロールから実際のバイオームタグ参照に置き換える。

```ts
private classifyProvince(seed: string, cellId: number): GeologicalProvinceKind {
  const cells = getWorldContext().pack.cells;
  const biomesData = getWorldContext().biomesData;
  const height = cells.h[cellId] ?? 0;
  const regional = this.hash(seed, "province", Math.floor(cellId / 23));

  // 本物の火山バイオーム（lavaField / volcanicBarrens / volcanicSoil）を最優先で拾う。
  // 標高やハッシュではなく、heightmap-generator.ts の finalizeVolcanoes() が実際に
  // タグ付けした火山セルのみを対象にするので、Volcanism chance = 0 のマップでは
  // 一切発火しない。
  if (biomeHasTag(biomesData, cells.biomeCode[cellId], "volcanic")) return "volcanic";

  if (cells.r[cellId] && height >= 20 && height < 48) return "placer";
  if (height >= 70) return regional < 0.36 ? "granite" : "orogen";
  if (height >= 53) return regional < 0.3 ? "granite" : regional < 0.7 ? "orogen" : "shield";
  if (height >= 38) return regional < 0.42 ? "carbonate" : regional < 0.72 ? "shield" : "basin";
  return regional < 0.28 ? "carbonate" : "basin";
}
```

旧来の `height >= 75 && hash < 0.06` ロールは丸ごと削除する。これは「拡張」ではなく**誤分類の修正**である — このロールは本物の火山と無関係な、単なる高地セルを 6% の確率で "volcanic" と誤認していたため、残す理由がない。

この1関数の変更だけで、`computeVolcanicAshCandidates()` は**コード変更ゼロで**実際の火山と正しく相関するようになる（Burg 近傍セルの `"volcanic"` プロヴィンス所属を数えるロジックはそのまま — [volcanicAshOperations.ts:44-66](../../src/extensions/economy/generators/volcanicAshOperations.ts#L44-L66)）。波及効果として、`districtCount = max(4, ceil(landCells/110))` の中で `"volcanic"` プロヴィンスの規模が変わる（今までは陸地の約 0.06 × (標高75+の割合) だったのが、今後は「実際に生成された火山のセル数」になる — Volcanism chance/Active volcano chance/`volcanicSoilStrength` の3オプションが、そのまま火山性経済の規模を左右するツマミになる）。

### 3.2 採取（rural gathering）: 新規 Good `Pumice`

`volcanicSoil` の裾野で暮らす住民が拾える、再生可能・低価値の建材鉱物として新設する。

```ts
{
  name: "Pumice",
  warEconomyType: "luxury",
  tags: ["mineral", "construction"],
  icon: "good-sand", // Volcanic Ash が "good-clay" を流用しているのと同じ慣習。専用アイコンは §3.4 で別途検討
  color: "#c9c3b8",
  value: 1,
  chance: 0, // レガシー scatter は使わない。biomeOutputByTag のみで生産する
  unit: "sack",
  demandCoverage: { construction: 0.3 },
  biomeOutputByTag: { volcanic: 0.05 }
}
```

ポイント:

- `"volcanic"` タグは `volcanicBarrens`（habitability 3）/ `lavaField`（habitability 0）/ `volcanicSoil`（habitability 55）の3つに共通してつくが、`getRuralCellPopulation()` は habitability に比例するため、**実際の生産量はほぼ全て `volcanicSoil` セルから発生する**（`lavaField` は人口ほぼゼロ、`volcanicBarrens` もごく僅か）。追加のバイオーム個別分岐を書かなくても、ユーザーの要求（"`Volcanic soil` バイオームから採取できるように"）が構造的に満たされる。
- `Pumice` は `ORE_COMMODITIES` / `FUEL_MINERAL_COMMODITIES` に含めない（= `isMineSuppliedGoodName` が false のまま）ので、§2.4 で確認した農村生産パイプラインの除外に引っかからない。
- レート `0.05` は既存の同系統商品（`Grain` の `arable: 0.08` / `forest: 0.05`、`Furs` の `cold: 0.03`）と同オーダーに揃えた初期値。バランス調整は実装後にプレイテストで詰める。

### 3.3 採掘（mining）: `VolcanicAshOperations` を汎用化し `Sulfur`・新規 `Obsidian` を追加

現行の `VolcanicAshOperationsModule` は「Burg 近傍の火山プロヴィンス所属セル数を数え、それに比例した固定労働力で毎月市場へ供給する」という、`QuarryOperationsModule`（Stone + Marble を1サイトから産出）に最も近い形をすでに持っている（[volcanicAshOperations.ts](../../src/extensions/economy/generators/volcanicAshOperations.ts) 全体）。同じ形の火山系採掘モジュールを3つ並べて重複させるより、**1つの `VolcanicOperations` モジュールが3つの産品（Ash / Sulfur / Obsidian）を1サイトから産出する**方が Quarry の前例に沿っている。

火山バイオームは3種類あり、産品ごとに現実的な立地が異なるため、候補地スコアリングは「バイオームキー別の近傍セル比率」を返すよう拡張する:

```ts
export interface VolcanicSiteCandidate {
  burgId: number;
  /** volcanicBarrens + lavaField + volcanicSoil — Ash の立地条件（噴出物は裾野まで降り積もる） */
  ashNeighborCount: number;
  /** volcanicBarrens + lavaField のみ — Sulfur の立地条件（噴気孔は裸地の火口周辺に限る） */
  sulfurNeighborCount: number;
  /** lavaField のみ — Obsidian の立地条件（急冷した溶岩からのみ産出） */
  obsidianNeighborCount: number;
}
```

`computeVolcanicSiteCandidates()` は `pack.cells.biomeCode[n]` を `biomesData.keys[code]` で判定し、上記3カウントを1パスで集計する（`biomeHasTag(..., "volcanic")` で Ash 用、`biomesData.keys[code] === "lavaField"` で Obsidian 用、`"lavaField" || "volcanicBarrens"` で Sulfur 用）。

産出は既存 `produceMonth()` と同じ「単一の労働力プールを共有し、産品ごとの近傍比率で按分する」形にする（Quarry の `stoneRatio`/`marbleRatio` と同型）:

```
requiredWorkers = BASE + round((ashRatio + sulfurRatio + obsidianRatio) * PER_RATIO)
extractionFactor = min(1, volcanicWorkers / requiredWorkers) * investmentBonus
monthlyAsh      = BASE_ASH_PER_WORKER      * volcanicWorkers * extractionFactor / 12          （既存レートを踏襲）
monthlySulfur   = BASE_SULFUR_PER_WORKER   * volcanicWorkers * sulfurRatio    * extractionFactor / 12
monthlyObsidian = BASE_OBSIDIAN_PER_WORKER * volcanicWorkers * obsidianRatio  * extractionFactor / 12
```

`Sulfur` 向け供給は `Markets.addMineSupply(marketId, sulfurGood.i, monthlySulfur)` を追加で呼ぶだけでよく、`MineralDeposit` / `MineOperation` / `DISTRICT_PROFILES` には一切触れない。既存の `evaporite`（basin）経由の `Sulfur` 供給とは独立した第二の供給源として**併存**させる — これは §2.5 で確認した `Stone`/`Marble` の「レガシー scatter + Quarry 併存」決定と同じ設計判断であり、新しい前例を作るわけではない。

新規 Good `Obsidian`:

```ts
{
  name: "Obsidian",
  warEconomyType: "luxury",
  tags: ["mineral", "luxury"],
  icon: "good-gemstones", // 専用アイコンが用意できるまでの暫定流用。§3.4 参照
  color: "#1c1a1f",
  value: 12,
  chance: 0, // Volcanic Ash / Iron Ore と同じく、採掘サイト経由のみで供給する
  unit: "shard",
  demandCoverage: { luxury: 0.4 }
}
```

`Sulfur`/`Obsidian` とも `biomeOutput`/`biomeOutputByTag` を持たせない（採掘専用に倒す）ため、§2.4 の農村パイプライン除外を気にする必要がない。

### 3.4 UI / レンダリング

- `drawMineralDeposits.ts` は `MineralDeposit`（鉱脈）のみを描画しており、`VolcanicAshOperations` のサイトは現状どのレイヤーにも描画されていない（要確認だが grep 上は該当なし）。`VolcanicOperations` に汎用化するタイミングで、Burg アイコンへのバッジ表示や専用マーカーを追加するかは Phase 4 の任意項目とする。
- `Pumice`/`Obsidian` の専用 SVG シンボル（`src/index.html` の `<symbol id="good-xxx">`）は今回のスコープでは新設せず、既存アイコン（`good-sand` / `good-gemstones`）を暫定流用する。`Volcanic Ash` が `good-clay` を流用しているのと同じ既存慣習に合わせた。
- `employment-overview.ts` / `basicEmployment.ts` / `burgEmploymentComposition.ts` は `getVolcanicAshOperations()` / `ashWorks.ashWorkers` を直接参照している（[basicEmployment.ts:137-144](../../src/extensions/economy/generators/basicEmployment.ts#L137-L144) 等）。モジュール名・フィールド名を汎用化する場合はこの3ファイルの参照更新が必須。

### 3.5 オプションとの関係（新規オプション不要）

既存の3オプションがそのまま火山経済の規模を制御する:

| オプション | 効果 |
| :--- | :--- |
| `volcanismChance`（既定30） | マップに火山が生成される確率。0 なら本設計の商品は一切発生しない。 |
| `volcanoActiveChance`（既定25） | 生成された火山が `lavaField`（活火山）か `volcanicBarrens`（死火山）か。`Obsidian` は `lavaField` 限定なので、この値が低いと `Obsidian` だけ枯渇しやすい。 |
| `volcanicSoilStrength`（既定50） | `volcanicSoil` リングの広さ。広いほど `Pumice` 採取に寄与する人口セルが増える（§3.2）。 |

新規オプションは不要。ユーザーが実際に試した「Volcanism chance = 100 / Active volcano chance = 100」が、そのままこの設計が想定する「火山性経済がフルに機能する」設定になる。

## 4. フェーズ分割

1. **Phase 1（地質再接続）**: §3.1 のみ。新規 Good なし。`mineralResources.test.ts` に「`volcanic` タグ付きセルは標高・ハッシュ非依存で "volcanic" プロヴィンスになる」「旧ヒューリスティックで拾えていた無関係な高地セルはもう "volcanic" にならない」を追加。`volcanicAshOperations.test.ts` の既存フィクスチャがこのロジック変更で seed 依存の産出量を変える可能性があるため要棚卸し。
2. **Phase 2（採取）**: `Pumice` を追加。`goods-generator.test.ts` に `volcanicSoil` の `resolveBiomeOutputRate` テストを追加。
3. **Phase 3（採掘拡張）**: `VolcanicAshOperationsModule` → `VolcanicOperationsModule` に汎用化し、`Sulfur` の第二供給源・新規 `Obsidian` を実装。§3.4 の3ファイルを更新。
4. **Phase 4（仕上げ・任意）**: 専用アイコン、鉱物マップレイヤーへのサイト表示、`Obsidian` を原料にした加工品（例: `Obsidian Blades`）の検討。

## 5. テスト計画

- `mineralResources.test.ts`: §4 Phase 1 参照。
- `volcanicAshOperations.test.ts`（Phase 3 実装後はリネームまたは `volcanicOperations.test.ts` に統合）: 火山なしマップで候補地ゼロ、火山ありマップで `ashNeighborCount`/`sulfurNeighborCount`/`obsidianNeighborCount` がバイオーム別に正しくカウントされることを検証。
- `goods-generator.test.ts`: `Pumice` の `biomeOutputByTag` 解決値、`Sulfur`/`Obsidian` が農村パイプラインに一切出現しないこと（`isMineSuppliedGoodName` / `biomeOutput` 不在の確認）。
- 直近の「全テンプレートで Volcanism chance を適用したときの一貫性テスト」（`heightmap-generator.test.ts` 側、6a455163/31eb4c79）に倣い、Economy 側にも「Volcanism chance = 100 / Active volcano chance = 100 のとき、全テンプレートで少なくとも1つの `"volcanic"` プロヴィンスセルが生成される」という回帰ガードを追加することを推奨する。

## 6. 未決定事項（推奨案つき）

1. **`VolcanicAshOperationsModule` を汎用化するか、3モジュール併存にするか**— 推奨: 汎用化（§3.3）。理由: Burg 近傍スコアリング・労働力プール・`produceMonth()` の骨格がほぼ同一になり、3つ並べると重複が大きい。ただし `basicEmployment.ts` 等3ファイルの参照更新を伴うため、Phase 3 として明確に切り出す。
2. **`Sulfur` に火山源を追加するか、`Volcanic Sulfur` のような別 Good にするか**— 推奨: 既存 `Sulfur` を再利用（§2.5 の `Stone`/`Marble` 併存決定が直接の前例になる）。市場・交易・需要計算が単一の Good ID を前提にしている箇所が多く、分離すると硫黄需要が二重管理になるリスクの方が大きい。
3. **`Obsidian` を原料品にするか**— 推奨: 今回は原material のみ（Phase 3 の範囲外）。`Iron Ore → Iron Ingot → 武具` のような加工チェーンは、実際の需要（プレイテストでの黒曜石の使い道）を見てから Phase 4 以降で検討する。
4. **専用アイコン**— 推奨: 今回は既存アイコン流用（`Volcanic Ash` の `good-clay` 流用と同じ扱い）。専用 SVG は別タスクとして切り出す。
