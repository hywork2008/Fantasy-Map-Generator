# 生活費の目安 (Cost of Living Estimate)

## 概要

`src/ui/components/tabs/CustomAboutContent.tsx` の About タブに、この世界の住人が生きていくのにおよそどれくらいの硬貨が必要かという「生活費の目安」を追加した(`about.costOfLiving*` キー、`src/i18n/locales/en.json` / `ja.json`)。

これはゲームプレイに影響する新しいメカニクスではなく、既存のシミュレーション定数から導いた**世界観説明用のフレーバーテキスト**である。本ドキュメントは、その数値がどの定数・計算式から、どういう仮定を足して導かれたかを記録する。

## 前提: 内部金額は銀貨基準、画面では3額面の硬貨表示

`formatPrice()` は商品価格・国庫残高(`burg.treasury` / `state.treasury`)・個人の所持金(`Character.wealth`)を、金貨🟡・銀貨⚪・銅貨🟤の内訳として表示する。内部の数値は従来どおり銀貨(SP)基準で保存され、通貨ごとに別の換算や為替は存在しない。既定値では金貨1枚=銀貨12枚、銀貨1枚=銅貨12枚であり、Options → Simulation Settingsで表示レートを変更できる。

## 使用した実在の定数

| 定数 | 値 | 出典 | 意味 |
|---|---|---|---|
| `GROSS_FOOD_NEED` | 0.43 | `src/extensions/economy/generators/foodConstants.ts:2` | 住人一人が一年生きるのに必要な食料量(Grain換算の抽象単位、rural/urban共通)。`foodProduction.ts:343-344` の `annualRuralNeed` / `annualUrbanNeed` で人口に乗算され、Food Ledgerの需給計算に使われる実際のゲームバランス定数。 |
| Grainの基準価格 | `value: 1`(銀貨1枚/wain) | `src/extensions/economy/generators/goods-generator.ts:224-229` | Grainという商品(`unit: "wain"`)の小売基準価格。市場状況で変動するが、起点は銀貨1枚/wain。 |
| `FARMGATE_PRICE_SHARE` | 0.8 | `src/extensions/economy/generators/foodProduction.ts:46` | 農家の直売(farmgate)価格は小売価格の80%であるという係数。`foodProduction.ts:197`, `:355` で使用。 |
| `STARTING_BURG_TREASURY_PER_POPULATION` | 20 | `src/extensions/economy/generators/foodProduction.ts:67` | Burg生成時、`burg.population`(実人口ではなく生成スコア)1につき銀貨20枚を初期国庫として与える係数(`foodProduction.ts:212`)。 |
| `BACK_PAY_CYCLES_MIN` / `MAX` | 6 / 18 | `src/extensions/economy/generators/characterStipends.ts:155-156` | `seedMissingCharacterWealth()` が、まだ俸給を受け取っていないキャラクターに「6〜18サイクル分の後払い」相当の初期所持金をでっち上げる際の倍率レンジ(`docs/plan/state-treasury-department-budget.md` §7項目8)。ゲーム側が「数年分の貯蓄」を通常の所持金スケールとして扱っている前例。 |

## 存在しない/仮定で補った要素

コードベースに以下の定数は**存在しない**。About タブの数値は、これらについては外部からの仮定を明示的に足して概算した。

- **一人当たり食料需要のrural/urban差**: `GROSS_FOOD_NEED` はrural/urban同一値であり、都市住民が食料以外に負担する諸経費(小売マージン、住居費以外の雑費)はシミュレートされていない。都市住民の生活費は「同じ食料需要 + 小売価格・諸経費分の上振れ」という定性的な仮定でレンジを広げただけで、専用の乗数定数はない。
- **世帯人数**: `Character.family` は系譜(配偶者・子供の人数)を持つが、「平均世帯サイズ」という定数はゲーム内に存在しない。4〜5人という一般的な前近代世帯の目安値を外部から採用した。
- **住宅価格**: 住宅の売買・賃貸を扱うメカニクスは未実装であり、価格定数も存在しない(`docs/simulation/goods.md` に建材に関する未実装ブレインストームのメモがあるのみ)。目安値は上記の `STARTING_BURG_TREASURY_PER_POPULATION = 20` を「この世界の金銭スケールにおける1住民あたりの元手」の参照点として流用し、その前後(±50%程度)を住宅価格帯とした。ゲームが計算した価格ではない。

## 計算方法

### 農民(農村住民)一人の最低生存費 — 約0.3〜0.4銀貨/年

```text
GROSS_FOOD_NEED(0.43) × Grain単価(0.8〜1.0銀貨/wain, farmgate〜小売)
  = 0.43 × 0.8 ≈ 0.34
  = 0.43 × 1.0 = 0.43
→ 約0.3〜0.4銀貨/年(丸め、既定レートでは銅貨4〜5枚)
```

農村住民は自給・farmgate価格に近い前提。

### 都市住民一人の生活費 — 約0.4〜0.8銀貨/年

同じ `GROSS_FOOD_NEED` を小売価格で購入し、食料以外の諸経費分を上乗せするという定性的な仮定で、農民の目安のおよそ1〜2倍のレンジを取った。専用の乗数はなく、目安として幅を持たせている。

### 4〜5人家族の生活費 — 約2〜4銀貨/年

```text
一人当たり生活費(下限側 約0.4〜0.5、農民〜都市住民の中間) × 世帯人数(4〜5人、外部仮定)
  ≈ 0.5 × 4 = 2.0
  ≈ 0.8 × 5 = 4.0
→ 約2〜4銀貨/年
```

### 質素な住宅一軒 — 約10〜30銀貨

```text
STARTING_BURG_TREASURY_PER_POPULATION(20) を「一住民あたりの元手」の参照点とし、
その前後 ±50% を住宅価格帯の目安とした。
→ 約10〜30銀貨
```

`BACK_PAY_CYCLES_MIN〜MAX`(6〜18)がキャラクターの初期所持金として「数年分の貯蓄」を通常スケールとして扱っている前例とも整合する(数年〜十数年分の生活費に相当するオーダー)。

## 位置づけと注意点

- About タブの数値は**世界観説明用**であり、UI 文言そのものは引き続き flavor である。
- ただし Character 個人の `wealth` については、`characterLivingCosts.ts` が生産サイクルごとに生活費 sink を適用する（`Taxes.collectTaxes()` の俸給支払いの後）。役職別の lifestyle 額と wealth 連動の status upkeep は [character-wealth-balance.md](./character-wealth-balance.md) を正とする。About の「農民 0.3〜0.4 銀/年」は人口マクロの食料需要からの概算であり、個人 sink の `LIVING_COST_BY_TIER` とは別系統（スケールは近いが 1:1 ではない）。
- 農民/都市住民/家族の3項目は実在の定数(`GROSS_FOOD_NEED`, Grain価格, `FARMGATE_PRICE_SHARE`)から機械的に導けるが、住宅価格の1項目だけは既存の金銭スケールに合わせた**推測値**であることを明記しておく。将来、住宅購入メカニクスを実装する場合はこの目安値をそのまま採用せず、実装時に改めて設計すること。

## 商品ロットと小売の参照値

Goods の `value` は個々の小売品の値札ではなく、Production・Markets・Caravans が使う Economy unit ごとの会計値である。`goodsUnitFlavor.ts` はこの計算に接続しない表示専用の補足として、既定カタログの Boots を20足分、Bread を20個分のロットと読む。既定レートでの基準価格はそれぞれ一足あたりおよそ銅貨4枚、一個あたりおよそ銅貨1枚となる。

Wine と Beer は樽の卸売価格を杯数で割らない。酒場での一杯を「およそ銅貨1枚」とする独立した世界観上の参照値であり、実際の市場価格・国庫・生産収支を変更しない。この区別により、卸売ロットの取引バランスを保ったまま、食事や日用品の規模感を説明できる。

## 今後の課題

- 都市住民の諸経費や世帯人数について専用の定数がなく、目安値の幅がやや恣意的。将来的にurban専用の生活費定数を追加する場合は、ここに記載した目安値との整合を確認すること。
- 住宅価格の目安は `STARTING_BURG_TREASURY_PER_POPULATION` からの類推に過ぎない。住宅購入/賃貸メカニクスが実装された際は、このドキュメントと `CustomAboutContent.tsx` の翻訳キーを実装後の実際の価格帯に合わせて更新する必要がある。

src/extensions/economy/generators/goods-generator.ts
src/ui/components/tabs/CustomAboutContent.tsx
src/i18n/locales/ja.json
