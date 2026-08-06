# 交易品カタログ拡充計画(exchange)

`src/extensions/economy/generators/goods-generator.ts` の `GOODS_DATA`(現在 73 品目)を、古代〜近世の史実交易品を参照して拡充するための調査・設計ドキュメント群。

[docs/simulation/goods.md](../../simulation/goods.md) に挙がっている追加要望(小麦・大麦・蕎麦・米・芋・綿・カカオ・一角獣(Narwhal)の角・ゴム・煉瓦・鉄製農具・「家を何で建てるか」の建材文化差)をすべて包含する。

## ファイル構成

| ファイル | 内容 |
| :--- | :--- |
| [01-ancient-goods.md](01-ancient-goods.md) | 古代(青銅器時代〜古典古代)の主要交易品カタログ |
| [02-medieval-goods.md](02-medieval-goods.md) | 中世(〜15世紀)の主要交易品カタログ |
| [03-early-modern-goods.md](03-early-modern-goods.md) | 近世(大航海時代〜18世紀)の主要交易品カタログ |
| [04-goods-data-candidates.md](04-goods-data-candidates.md) | **GOODS_DATA 形式の新規エントリ具体案**(優先度付き・実装チェックリスト付き) |

史実の時代フレーバーとは別軸で、Culture set が `highFantasy` / `darkFantasy` のときに出したいジャンル・フレーバー品(ポーション、ミスリル、竜の鱗など)は [../fantasy-culture-set-goods.md](../fantasy-culture-set-goods.md) を参照。

各時代カタログの表では、既存 `GOODS_DATA` との対応を次の記号で示す:

- ✅ **既存** — 現行の Good がそのまま該当する
- 🆕 **新規候補** — [04-goods-data-candidates.md](04-goods-data-candidates.md) にエントリ案あり
- 🔁 **既存流用** — 既存 Good のレシピ追加・タグ調整、または近縁の既存品で代替する

## 時代区分(このプロジェクトでの作業定義)

ファンタジー世界なので実在の年代・地理には縛られない。「その時代らしい交易の構図」を再現するためのフレーバー区分として扱う:

| 区分 | 実史のイメージ | 交易の構図 |
| :--- | :--- | :--- |
| 古代 | 青銅器時代〜西ローマ崩壊(〜500年頃) | 錫・銅の長距離調達、穀物艦隊、香料の道、絹の道の開通 |
| 中世 | 〜1500年頃 | 羊毛⇔毛織物、ハンザの北方物産、地中海の香辛料中継、サハラ縦断の金と塩 |
| 近世 | 大航海時代〜1800年頃 | 喜望峰ルートの香辛料直買付、新大陸作物、銀の世界循環、三角貿易 |

なお新大陸("コロンブス交換")由来の作物は、ファンタジー地図には「旧大陸/新大陸」の区別が存在しないため、地理ではなく**時代フレーバーとして**導入可否を決める(時代ゲート案は 04 の §5 参照)。

## GOODS_DATA スキーマ早見表

新規エントリを書くときの較正基準。詳細は `goods-generator.ts` の `Good` インターフェイス参照。

### value の較正(既存品ベース)

| 帯 | 位置づけ | 既存例 |
| :--- | :--- | :--- |
| 1–2 | かさばる日用品・主食 | Wood 1, Stone 1, Grain 1, Clay 1, Fish 1, Coal 2 |
| 3–8 | 加工品・地域特産 | Salt 3, Honey 4, Wine 5, Cloth 5, Leather 6, Marble 8, Bronze 8 |
| 10–20 | 遠距離奢侈品 | Horses 10, Incense 12, Silk 16, Spices 18, Pearls 18, Silver 20, Gemstones 20 |
| 22+ | 別格 | Arms 24, Perfume 28, Elephants 30, Gold 40, Coins 45, Jewelry 55, Artillery 70 |

### chance と distribution

- `chance: 0` = 天然配置なし(レシピ生産専用)。`distribution` も不要。
- `chance: 1–5` = セル配置抽選の通過率(%)。既存品は基幹資源 4–5、特産 2–3、希少 1。
- `distribution` DSL で使える述語: `biome(...)`, `minHeight(h)`, `maxHeight(h)`, `minTemp(t)`, `maxTemp(t)`, `shore(...rings)`(1=沿岸陸、-1=沿岸水域), `river()`, `elevation()`, `habitability()`, `minHabitability(n)`, `type(...featureGroups)`, `random(n)`, `nth(n)`。

### バイオーム ID

| ID | バイオーム | ID | バイオーム |
| :--- | :--- | :--- | :--- |
| 1 | Hot desert(熱帯砂漠) | 7 | Tropical rainforest(熱帯雨林) |
| 2 | Cold desert(寒冷砂漠) | 8 | Temperate rainforest(温帯雨林) |
| 3 | Savanna(サバンナ) | 9 | Taiga(タイガ) |
| 4 | Grassland(草原) | 10 | Tundra(ツンドラ) |
| 5 | Tropical seasonal forest(熱帯季節林) | 11 | Glacier(氷河) |
| 6 | Temperate deciduous forest(温帯落葉樹林) | 12 | Wetland(湿地) |

### その他のフィールド

- `multipliers.cultureType`: `Generic | Hunting | Highland | River | Lake | Naval | Nomadic`(`src/types/models.ts` の `CULTURE_TYPES`)。
- `demandCoverage`: `food / utilities / construction / military / luxury`(`DEMAND_PRIORITY`)。人口 × `DEMAND_TARGET_FACTORS` が需要量になるため、**同カテゴリの Good を増やしても需要総量は増えない**(供給側だけ厚くなる)点に注意。
- `recipes` の材料名は `GOODS_DATA` 内の `name` と**完全一致**が必須(`defaultGoods` 構築時に `findIndex` で解決し、失敗すると throw)。
- `warEconomyType`: `military / essential / strategic / luxury`(省略可)。
- `icon`: `src/index.html` 内の SVG `<symbol id="good-xxx">` を参照。新規 Good はシンボル追加が必要。

## 既存カタログの時代適合状況(要約)

既存 73 品目はおおむね「中世〜近世の汎ヨーロッパ+シルクロード」をカバーしており、3 時代すべてで通用する品が大半(Grain, Salt, Wine, Iron, Silk, Spices, Slaves, Furs...)。不足しているのは:

1. **穀物の内訳**(小麦・大麦・米・蕎麦・芋)— 現状 `Grain` に一本化
2. **繊維の内訳**(綿・亜麻)— 現状 `Hemp`/`Sheep`/`Silk` のみ
3. **古代フレーバー**(パピルス・貝紫・象牙・レバノン杉・黒曜石・鉛)
4. **中世北方・イスラム圏フレーバー**(蜜蝋・明礬・硫黄・磁器・一角獣の角)
5. **近世の新作物**(ジャガイモ・トウモロコシ・カカオ・コーヒー・藍・ゴム)
6. **建材の多様化**(煉瓦)と**農業資本財**(鉄製農具)

具体的な追加案は [04-goods-data-candidates.md](04-goods-data-candidates.md) を参照。
