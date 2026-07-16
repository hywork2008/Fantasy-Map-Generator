# GOODS_DATA 新規エントリ案

[README.md](README.md) の時代カタログで 🆕 とした品目の、`src/extensions/economy/generators/goods-generator.ts` `GOODS_DATA` 形式の具体案。value / chance / distribution は既存 73 品目の較正基準(README 参照)に合わせてある。

## 1. 実装チェックリスト(Good 1 件追加あたり)

1. `GOODS_DATA` にエントリ追加(本ファイルの案をベースに)。
2. `GOOD_TRADE_PROFILES` に `tradeProfile()` を追加(§6)。未登録でも `getDefaultGoodTradeProfile()` のヒューリスティックにフォールバックするが、特徴的な品は明示すべき。
3. `src/index.html` に SVG `<symbol id="good-xxx">` を追加(既存の `good-wood` 等と同じスプライト群、2849 行目付近)。
4. レシピ材料名は `GOODS_DATA` 内の `name` と完全一致必須(`defaultGoods` 構築時に `findIndex` 解決、失敗すると throw)。材料側 Good を先に追加すること。
5. 時代ゲートが必要な品は `isGoodEnabled()` の拡張とセットで(§5)。
6. **配置バランス**: `generate()` は 1 セル 1 Good の奪い合い(shuffle して先勝ち)+ Good ごとの上限 `resourceMaxCells`。天然配置(`chance > 0`)の品を 10 件以上増やすと既存品の配置密度が目に見えて薄まるため、追加時は既存品も含めた `chance` の再調整を検討する。
7. **需要バランス**: 需要総量は人口 × `DEMAND_TARGET_FACTORS` で固定。food カバレッジ品を増やすほど食料需要は満たしやすくなる(供給側だけ厚くなる)ので、穀物分割は §2.1 の方針で行う。

## 2. 優先度 A — goods.md 要望分

### 2.1 穀物の分割(Wheat / Barley / Rice / Buckwheat / Potatoes)

設計論点: 既存 `Grain` は Beer / Liquor のレシピ材料であり、demandCoverage `food: 1` の基幹品。分割には 2 案ある:

- **案 a(置換)**: `Grain` を削除して 5 穀物に置換。Beer / Liquor のレシピを穀物ごとに展開する必要があり(大麦ビール・米酒など時代色は出る)、レシピ組合せが爆発する。
- **案 b(併存・推奨)**: `Grain` を「汎用穀物」としてレシピ用に残しつつ `chance` を 4→2 に下げ、各穀物を chance 2 程度の「地域特色」として追加する。既存レシピ・セーブ互換を壊さず段階導入できる。

```typescript
{
  name: "Wheat",
  warEconomyType: "essential",
  tags: ["food"],
  icon: "good-wheat",
  color: "#e8c96f",
  value: 1,
  chance: 2,
  distribution: "biome(4, 6) && habitability()",
  unit: "wain",
  demandCoverage: { food: 1 },
  multipliers: { cultureType: { River: 1.2, Lake: 1.2, Nomadic: 0.5 } },
  biomeOutput: { 4: 0.1, 6: 0.1 }
},
{
  name: "Barley",
  warEconomyType: "essential",
  tags: ["food"],
  icon: "good-barley",
  color: "#d9c47e",
  value: 1,
  chance: 2,
  distribution: "biome(2, 4, 6) || (biome(9) && random(30))",
  unit: "wain",
  demandCoverage: { food: 1 },
  multipliers: { cultureType: { Highland: 1.3, Nomadic: 0.5 } },
  biomeOutput: { 2: 0.05, 4: 0.08, 6: 0.08 }
},
{
  name: "Rice",
  warEconomyType: "essential",
  tags: ["food"],
  icon: "good-rice",
  color: "#f2efe1",
  value: 2,
  chance: 3,
  distribution: "minTemp(15) && (biome(12) || (river() && biome(5, 7, 8)))",
  unit: "wain",
  demandCoverage: { food: 1 },
  multipliers: { cultureType: { River: 1.5, Lake: 1.3, Nomadic: 0.3 } },
  biomeOutput: { 5: 0.1, 7: 0.1, 12: 0.15 }
},
{
  name: "Buckwheat",
  warEconomyType: "essential",
  tags: ["food"],
  icon: "good-buckwheat",
  color: "#b8a284",
  value: 1,
  chance: 2,
  distribution: "minHeight(30) && biome(4, 6, 9)",
  unit: "wain",
  demandCoverage: { food: 1 },
  multipliers: { cultureType: { Highland: 1.4 } },
  biomeOutput: { 9: 0.05 }
},
{
  name: "Potatoes",
  warEconomyType: "essential",
  tags: ["food"],
  icon: "good-potatoes",
  color: "#c8a165",
  value: 1,
  chance: 3,
  distribution: "(minHeight(40) && biome(3, 4)) || (biome(4, 6, 10) && random(40))",
  unit: "wain",
  demandCoverage: { food: 1 },
  multipliers: { cultureType: { Highland: 1.5, Nomadic: 0.5 } },
  biomeOutput: { 4: 0.08, 10: 0.05 }
},
{
  name: "Maize",
  warEconomyType: "essential",
  tags: ["food"],
  icon: "good-maize",
  color: "#eec643",
  value: 1,
  chance: 2,
  distribution: "biome(3, 4, 5) && habitability()",
  unit: "wain",
  demandCoverage: { food: 1 },
  biomeOutput: { 3: 0.1, 5: 0.1 }
},
```

穀物ごとの性格付け: Wheat=温帯低地の標準、Barley=寒冷・乾燥に強い(ビールの本来の主材)、Rice=温暖湿地・河川(River 文化の主食)、Buckwheat=高地・痩地の救荒作物、Potatoes=高地・寒冷地の革命児(近世ゲート候補)、Maize=サバンナ〜熱帯の高収量作物(近世ゲート候補)。

### 2.2 綿(Cotton)

```typescript
{
  name: "Cotton",
  warEconomyType: "strategic",
  tags: ["clothing"],
  icon: "good-cotton",
  color: "#f7f4ec",
  value: 3,
  chance: 3,
  distribution: "biome(3, 5) || (biome(1, 2) && river())",
  unit: "bale",
  multipliers: { cultureType: { River: 1.3 } },
  biomeOutput: { 3: 0.08, 5: 0.08 }
},
```

砂漠+河川(灌漑農業)でも育つのが史実的特徴(エジプト・インダス)。**Cloth のレシピに `{ Cotton: 1 }` を追加**して織物チェーンに接続する(§4)。

### 2.3 カカオ(Cacao)

```typescript
{
  name: "Cacao",
  warEconomyType: "luxury",
  tags: ["luxury", "food"],
  icon: "good-cacao",
  color: "#6b4423",
  value: 12,
  chance: 2,
  distribution: "biome(7) && random(50)",
  unit: "bag",
  demandCoverage: { luxury: 1 },
  biomeOutput: { 7: 0.05 }
},
```

### 2.4 一角獣の角(Narwhal horn)

```typescript
{
  name: "Narwhal horn",
  warEconomyType: "luxury",
  tags: ["luxury", "aquatic"],
  icon: "good-narwhal-horn",
  color: "#e8e4da",
  value: 35,
  chance: 1,
  distribution: "shore(-1) && type('ocean') && maxTemp(0)",
  unit: "horn",
  demandCoverage: { luxury: 1 },
  multipliers: { cultureType: { Naval: 1.5, Hunting: 1.5 } }
},
```

Whales(`maxTemp(7)`)よりさらに狭い極北海域限定。value 35 は Gold(40)に迫る意図的な高値 — 「ユニコーンの角」として王侯が同重量の金以上を払った史実の再現。ファンタジー世界では本物のユニコーン由来としてもよい。

### 2.5 ゴム(Rubber)

```typescript
{
  name: "Rubber",
  tags: ["construction", "naval"],
  icon: "good-rubber",
  color: "#3e3a39",
  value: 8,
  chance: 1,
  distribution: "biome(7) && random(30)",
  unit: "bale",
  demandCoverage: { utilities: 0.5 }
},
```

本格利用は加硫法(1839)以降なので厳密には時代外。近世マップでは時代ゲート(§5)で無効化するか、「防水材・弾性材の珍品」として少量流通に留める。ゴムの木そのもの(原生林)は distribution の熱帯雨林条件で表現される。

### 2.6 煉瓦(Bricks)

```typescript
{
  name: "Bricks",
  tags: ["construction"],
  icon: "good-bricks",
  color: "#b0472e",
  value: 2,
  chance: 0,
  recipes: [
    { Clay: 1, Wood: 0.5 },
    { Clay: 1, Coal: 0.5 }
  ],
  unit: "pallet",
  demandCoverage: { construction: 1 },
  multipliers: { cultureType: { River: 1.4, Lake: 1.2, Hunting: 0.4 } }
},
```

焼成燃料として Wood / Coal の 2 レシピ。日干し煉瓦文化(河川・乾燥地帯)は River multiplier で表現。

**建材の文化差(goods.md「家を何で建てるか」メモへの応答)**: Bricks 追加で construction カバレッジが Wood / Stone / Clay / Marble / Bricks の 5 本立てになる。現状の demandCoverage は品目間で無差別なので、「石の文化・煉瓦の文化・木の文化」を出すには (a) cultureType multiplier で産出側を偏らせる(上記の案。Wood: Hunting 1.5 / Stone: Hunting・Nomadic 0.6 は設定済み)か、(b) 将来的に需要側(demand 解決順)にも culture 重みを入れる仕組みが必要。(b) は production/market 側の変更なので別計画とする。

### 2.7 鉄製農具(Farm tools)

```typescript
{
  name: "Farm tools",
  warEconomyType: "essential",
  tags: ["construction"],
  icon: "good-farm-tools",
  color: "#8c7853",
  value: 6,
  chance: 0,
  recipes: [{ Iron: 0.5, Wood: 0.5 }],
  unit: "set",
  demandCoverage: { utilities: 1 }
},
```

goods.md の「製鉄技術依存」の注記どおり、レシピを Iron のみとする(Bronze 農具は史実でも贅沢すぎて普及しなかった)。既存 Tools(value 14, Iron/Bronze + Coal)との差別化は「安価・農村向け」。**発展案**: 都市圏の Farm tools 保有量が穀物系 `biomeOutput` を底上げする生産ボーナス(農業革命の表現)は production 側の機構追加が必要なので、まずは通常の utilities 財として導入する。

## 3. 優先度 B — 時代色の強い新規品

### 3.1 古代フレーバー

```typescript
{
  name: "Flax",
  tags: ["clothing"],
  icon: "good-flax",
  color: "#aebf8a",
  value: 2,
  chance: 2,
  distribution: "biome(4, 6, 8) && (river() || random(40))",
  unit: "bale",
  multipliers: { cultureType: { River: 1.3, Lake: 1.2 } },
  biomeOutput: { 6: 0.05, 8: 0.05 }
},
{
  name: "Papyrus",
  tags: ["ritual", "educational"],
  icon: "good-papyrus",
  color: "#e3d9b0",
  value: 3,
  chance: 2,
  distribution: "minTemp(18) && (biome(12) || (river() && biome(1, 3)))",
  unit: "ream",
  multipliers: { cultureType: { River: 1.5 } }
},
{
  name: "Purple dye",
  warEconomyType: "luxury",
  tags: ["luxury"],
  icon: "good-purple-dye",
  color: "#66023c",
  value: 24,
  chance: 1,
  distribution: "shore(1) && minTemp(14) && random(40)",
  unit: "flask",
  demandCoverage: { luxury: 1 },
  multipliers: { cultureType: { Naval: 1.5 } }
},
{
  name: "Ivory",
  warEconomyType: "luxury",
  tags: ["luxury"],
  icon: "good-ivory",
  color: "#f2e8d5",
  value: 22,
  chance: 1,
  distribution: "(biome(1, 3, 5, 7) && nth(4)) || (shore(-1) && maxTemp(2))",
  unit: "tusk",
  demandCoverage: { luxury: 1 },
  multipliers: { cultureType: { Hunting: 1.5 } }
},
{
  name: "Cedar",
  warEconomyType: "strategic",
  tags: ["construction", "naval", "luxury"],
  icon: "good-cedar",
  color: "#7d5e3c",
  value: 6,
  chance: 1,
  distribution: "minHeight(30) && biome(6) && random(40)",
  unit: "pile",
  demandCoverage: { construction: 0.5, luxury: 0.5 },
  multipliers: { cultureType: { Highland: 1.3, Naval: 1.2 } }
},
{
  name: "Obsidian",
  tags: ["mineral"],
  icon: "good-obsidian",
  color: "#31313d",
  value: 5,
  chance: 1,
  distribution: "minHeight(60) && nth(3)",
  unit: "crate",
  demandCoverage: { utilities: 0.3, luxury: 0.3 },
  multipliers: { cultureType: { Highland: 1.4, Hunting: 1.3 } }
},
{
  name: "Lead",
  warEconomyType: "strategic",
  tags: ["ore"],
  icon: "good-lead",
  color: "#6f7285",
  value: 3,
  chance: 2,
  distribution: "minHeight(50) || (minHeight(30) && elevation() && nth(3))",
  unit: "wagon",
  demandCoverage: { construction: 0.3 },
  multipliers: { cultureType: { Highland: 1.4 } }
},
```

補足: Ivory の distribution は熱帯(象牙)と極北沿岸(セイウチ牙)の 2 系統を 1 品目に束ねている。分けるほどの差はない。Papyrus は **Books のレシピに `{ Papyrus: 1, Ink: 0.5 }` を追加**して安価な書物材料チェーンを作る(§4)。

### 3.2 中世フレーバー

```typescript
{
  name: "Wax",
  tags: ["ritual", "preservative"],
  icon: "good-wax",
  color: "#f0d9a8",
  value: 6,
  chance: 0,
  recipes: [{ Honey: 1 }],
  unit: "block",
  demandCoverage: { utilities: 0.3, luxury: 0.3 }
},
{
  name: "Alum",
  warEconomyType: "strategic",
  tags: ["mineral"],
  icon: "good-alum",
  color: "#dfe6ea",
  value: 7,
  chance: 1,
  distribution: "minHeight(50) && nth(5)",
  unit: "bag",
  demandCoverage: { utilities: 0.3 }
},
{
  name: "Sulfur",
  warEconomyType: "strategic",
  tags: ["mineral", "military"],
  icon: "good-sulfur",
  color: "#e8d44d",
  value: 5,
  chance: 2,
  distribution: "minHeight(60) && random(30)",
  unit: "barrel",
  demandCoverage: {},
  multipliers: { cultureType: { Highland: 1.3 } }
},
{
  name: "Porcelain",
  warEconomyType: "luxury",
  tags: ["luxury", "storage"],
  icon: "good-porcelain",
  color: "#dce9f0",
  value: 14,
  chance: 0,
  recipes: [{ Clay: 1, "White sand": 0.5, Coal: 1 }],
  unit: "crate",
  demandCoverage: { luxury: 1 },
  multipliers: { cultureType: { River: 1.2, Nomadic: 0.3 } }
},
```

補足: Wax は Honey からの派生財(史実どおり養蜂の副産物)。**Candles のレシピに `{ Wax: 1 }` を追加**すると教会需要チェーンが繋がる。Sulfur は Saltpeter と同じく「demandCoverage 空 = 軍需レシピ専用の中間財」設計で、**Gunpowder に硫黄入りレシピを追加**する(§4)。Porcelain は Ceramics(value 4)の高級版で、Glass と同様に割れ物(trade profile の durability 低 / lossRisk 高、§6)。

### 3.3 近世フレーバー

```typescript
{
  name: "Coffee",
  warEconomyType: "luxury",
  tags: ["luxury"],
  icon: "good-coffee",
  color: "#4b3621",
  value: 10,
  chance: 2,
  distribution: "minHeight(30) && biome(3, 5, 7)",
  unit: "bag",
  demandCoverage: { luxury: 1 },
  multipliers: { cultureType: { Highland: 1.3 } },
  biomeOutput: { 5: 0.05 }
},
{
  name: "Indigo",
  warEconomyType: "luxury",
  tags: ["luxury"],
  icon: "good-indigo",
  color: "#284b8f",
  value: 9,
  chance: 1,
  distribution: "biome(3, 5, 7) && random(40)",
  unit: "bag",
  multipliers: { cultureType: { River: 1.2 } }
},
```

Indigo は既存 Dyes(value 8, 汎用)と役割が重なる。導入するなら「Dyes=在来染料(茜・ウォード)、Indigo=高値の輸出向け熱帯染料」と棲み分け、Garments のレシピに Indigo 変種を足すかは任意。重複を避けたい場合は見送って Dyes に一本化してもよい(判断保留でカタログには残す)。

## 4. 優先度 C — 既存 Good の拡張で対応(新規品不要)

| 対象 | 変更 | 再現するもの |
| :--- | :--- | :--- |
| Cloth | `recipes` に `{ Cotton: 1 }`, `{ Flax: 1 }` を追加 | 綿布・リネン |
| Liquor | `recipes` に `{ Sugarcane: 1, Wood: 1, Barrels: 0.5 }` を追加 | ラム酒(三角貿易) |
| Candles | `recipes` に `{ Wax: 1 }` を追加 | 蜜蝋蝋燭(教会需要) |
| Gunpowder | `recipes` を `[{ Saltpeter: 0.5, Sulfur: 0.25, Coal: 0.25 }]` に変更(または併記) | 黒色火薬の史実配合(硝石・硫黄・木炭) |
| Books | `recipes` に `{ Papyrus: 1, Ink: 0.5 }` を追加 | パピルス巻子本 |
| Beer | `recipes` に `{ Barley: 1, Barrels: 1 }`, `{ Rice: 1, Barrels: 1 }` を追加(穀物分割 案 b 採用時) | 大麦ビール・米酒 |

**新規品を立てず既存品で代替するもの**(時代カタログの 🔁): 黒檀→Mahogany、乳香・没薬→Incense、サフラン・バニラ・唐辛子→Spices、コチニール→Dyes、瀝青→Tar、ラピスラズリ→Gemstones、干鱈・ガルム→Preserved food、原毛→Sheep。いずれも既存品の説明範囲内で、品目を分けても交易シミュレーション上の挙動が変わらないため。

## 5. 時代ゲート設計案

現状の前例: `GUNPOWDER_ERA_GOODS`(name の Set)+ `isGoodEnabled()` が `options.gunpowderEraEnabled` を見て Gunpowder / Artillery を無効化する([docs/plan/guns-era.md](../guns-era.md))。

同じ機構を一般化する案:

```typescript
// goods-generator.ts
type GoodEra = "ancient" | "medieval" | "earlyModern";
const ERA_ORDER: GoodEra[] = ["ancient", "medieval", "earlyModern"];

// Good に追加(省略時は全時代で有効)
interface Good {
  /* ... */
  availableFrom?: GoodEra;
}

// worldContext.options.techEra?: GoodEra を追加し、isGoodEnabled() を拡張:
export function isGoodEnabled(good: Pick<Good, "name" | "availableFrom">): boolean {
  const options = getWorldContext().options;
  if (options.gunpowderEraEnabled === false && GUNPOWDER_ERA_GOODS.has(good.name.toLowerCase())) return false;
  if (good.availableFrom && options.techEra) {
    if (ERA_ORDER.indexOf(good.availableFrom) > ERA_ORDER.indexOf(options.techEra)) return false;
  }
  return true;
}
```

- `availableFrom: "earlyModern"` 候補: Potatoes, Maize, Cacao, Coffee, Rubber, Indigo(コロンブス交換・消費革命系)。Tobacco / Sugarcane も史実上はここだが、既存品の挙動変更になるので第 2 段階とする。
- `availableFrom: "medieval"` 候補: Porcelain, Alum, Buckwheat(伝播史ベース。ファンタジー的にはゲート不要という判断もあり)。
- `isGoodEnabled()` は generate / regeneratePlacement / getBiomesProduction / 各 UI が既に参照しているため、拡張はこの 1 関数で全系に波及する。
- 発展形として `advanceTime()` の経過で era が進み Good が解禁される演出も可能だが、`simulationContext.era` は現状自由文字列なので別途設計が要る(本計画のスコープ外)。

## 6. GOOD_TRADE_PROFILES 追加案

`tradeProfile(weight, bulk, rarity, distancePremium, timeValueTrend, durability, lossRisk)`。

```typescript
Wheat: tradeProfile(4, 4, 1, -1, -1, 2, 3),
Barley: tradeProfile(4, 4, 1, -1, -1, 2, 3),
Rice: tradeProfile(4, 4, 1, -1, -1, 3, 3),
Buckwheat: tradeProfile(4, 4, 1, -1, -1, 2, 3),
Potatoes: tradeProfile(4, 4, 1, -2, -2, 2, 4),
Maize: tradeProfile(4, 4, 1, -1, -1, 2, 3),
Cotton: tradeProfile(2, 4, 2, 1, 0, 3, 2),
Flax: tradeProfile(2, 4, 2, 0, 0, 3, 2),
Cacao: tradeProfile(1, 2, 4, 3, -1, 2, 3),
Coffee: tradeProfile(1, 2, 4, 3, 0, 3, 2),
"Narwhal horn": tradeProfile(1, 1, 5, 3, 0, 5, 2),
Rubber: tradeProfile(3, 4, 3, 2, 0, 3, 2),
Bricks: tradeProfile(5, 5, 1, -2, 0, 4, 2),
"Farm tools": tradeProfile(3, 3, 2, 1, 0, 5, 1),
Ivory: tradeProfile(2, 2, 5, 3, 0, 5, 2),
"Purple dye": tradeProfile(1, 1, 5, 3, 0, 3, 2),
Papyrus: tradeProfile(1, 2, 2, 1, 0, 2, 3),
Obsidian: tradeProfile(3, 3, 3, 2, 0, 4, 2),
Cedar: tradeProfile(4, 5, 3, 1, 0, 4, 2),
Lead: tradeProfile(5, 4, 2, 0, 0, 5, 1),
Wax: tradeProfile(2, 2, 2, 1, 0, 4, 1),
Alum: tradeProfile(3, 3, 4, 2, 0, 5, 1),
Sulfur: tradeProfile(3, 3, 3, 1, 0, 4, 2),
Porcelain: tradeProfile(3, 3, 4, 3, 0, 1, 5),
Indigo: tradeProfile(1, 2, 4, 3, 0, 4, 2)
```

設計意図の要点: 穀物系は「重い・かさばる・地元で売るべき・腐る」(distancePremium 負)。Cacao / Coffee / Purple dye / Narwhal horn / Ivory は「軽量・希少・遠いほど儲かる」の遠隔交易品。Porcelain は Glass と同じ「高価だが割れる」(durability 1 / lossRisk 5)。Bricks は Stone と同じ地産地消型。

## 7. 導入フェーズ案

| フェーズ | 内容 | 品目数 |
| :--- | :--- | :--- |
| 1 | 優先度 A のうちレシピ専用品(Bricks, Farm tools)+ 穀物分割(案 b) | 8 |
| 2 | 優先度 A の残り(Cotton, Cacao, Narwhal horn, Rubber)+ Cloth/Liquor レシピ拡張 | 4 |
| 3 | 優先度 B(古代・中世・近世フレーバー 13 品)+ Gunpowder 硫黄レシピ | 13 |
| 4 | 時代ゲート(§5)の実装と `availableFrom` の付与 | — |

フェーズ 1–2 が goods.md の要望を全消化する。フェーズごとに §1 チェックリスト(特に配置密度の再調整)を通すこと。
