# 生活費の目安 (Cost of Living Estimate)

## 概要

`src/ui/components/tabs/CustomAboutContent.tsx` の About タブに、この世界の住人が生きていくのにおよそどれくらいの🟡が必要かという「生活費の目安」を追加した(`about.costOfLiving*` キー、`src/i18n/locales/en.json` / `ja.json`)。

これはゲームプレイに影響する新しいメカニクスではなく、既存のシミュレーション定数から導いた**世界観説明用のフレーバーテキスト**である。本ドキュメントは、その数値がどの定数・計算式から、どういう仮定を足して導かれたかを記録する。

## 前提: 🟡 は単一の抽象通貨

`src/utils/unitUtils.ts:105-106` の `formatPrice()` が示す通り、🟡 は商品価格・国庫残高(`burg.treasury` / `state.treasury`)・個人の所持金(`Character.wealth`)すべてに共通する、この世界唯一の抽象通貨である。単位ごとに別通貨が存在するわけではないため、「食料の価格」と「所持金の額」は同じ🟡単位でそのまま比較できる。

## 使用した実在の定数

| 定数 | 値 | 出典 | 意味 |
|---|---|---|---|
| `GROSS_FOOD_NEED` | 0.43 | `src/extensions/economy/generators/foodConstants.ts:2` | 住人一人が一年生きるのに必要な食料量(Grain換算の抽象単位、rural/urban共通)。`foodProduction.ts:343-344` の `annualRuralNeed` / `annualUrbanNeed` で人口に乗算され、Food Ledgerの需給計算に使われる実際のゲームバランス定数。 |
| Grainの基準価格 | `value: 1`(1🟡/wain) | `src/extensions/economy/generators/goods-generator.ts:224-229` | Grainという商品(`unit: "wain"`)の小売基準価格。市場状況で変動するが、起点は1🟡/wain。 |
| `FARMGATE_PRICE_SHARE` | 0.8 | `src/extensions/economy/generators/foodProduction.ts:46` | 農家の直売(farmgate)価格は小売価格の80%であるという係数。`foodProduction.ts:197`, `:355` で使用。 |
| `STARTING_BURG_TREASURY_PER_POPULATION` | 20 | `src/extensions/economy/generators/foodProduction.ts:67` | Burg生成時、`burg.population`(実人口ではなく生成スコア)1につき20🟡を初期国庫として与える係数(`foodProduction.ts:212`)。 |
| `BACK_PAY_CYCLES_MIN` / `MAX` | 6 / 18 | `src/extensions/economy/generators/characterStipends.ts:155-156` | `seedMissingCharacterWealth()` が、まだ俸給を受け取っていないキャラクターに「6〜18サイクル分の後払い」相当の初期所持金をでっち上げる際の倍率レンジ(`docs/plan/state-treasury-department-budget.md` §7項目8)。ゲーム側が「数年分の貯蓄」を通常の所持金スケールとして扱っている前例。 |

## 存在しない/仮定で補った要素

コードベースに以下の定数は**存在しない**。About タブの数値は、これらについては外部からの仮定を明示的に足して概算した。

- **一人当たり食料需要のrural/urban差**: `GROSS_FOOD_NEED` はrural/urban同一値であり、都市住民が食料以外に負担する諸経費(小売マージン、住居費以外の雑費)はシミュレートされていない。都市住民の生活費は「同じ食料需要 + 小売価格・諸経費分の上振れ」という定性的な仮定でレンジを広げただけで、専用の乗数定数はない。
- **世帯人数**: `Character.family` は系譜(配偶者・子供の人数)を持つが、「平均世帯サイズ」という定数はゲーム内に存在しない。4〜5人という一般的な前近代世帯の目安値を外部から採用した。
- **住宅価格**: 住宅の売買・賃貸を扱うメカニクスは未実装であり、価格定数も存在しない(`docs/simulation/goods.md` に建材に関する未実装ブレインストームのメモがあるのみ)。目安値は上記の `STARTING_BURG_TREASURY_PER_POPULATION = 20` を「この世界の金銭スケールにおける1住民あたりの元手」の参照点として流用し、その前後(±50%程度)を住宅価格帯とした。ゲームが計算した価格ではない。

## 計算方法

### 農民(農村住民)一人の最低生存費 — 約0.3〜0.4🟡/年

```text
GROSS_FOOD_NEED(0.43) × Grain単価(0.8〜1.0 🟡/wain, farmgate〜小売)
  = 0.43 × 0.8 ≈ 0.34
  = 0.43 × 1.0 = 0.43
→ 約0.3〜0.4🟡/年(丸め)
```

農村住民は自給・farmgate価格に近い前提。

### 都市住民一人の生活費 — 約0.4〜0.8🟡/年

同じ `GROSS_FOOD_NEED` を小売価格で購入し、食料以外の諸経費分を上乗せするという定性的な仮定で、農民の目安のおよそ1〜2倍のレンジを取った。専用の乗数はなく、目安として幅を持たせている。

### 4〜5人家族の生活費 — 約2〜4🟡/年

```text
一人当たり生活費(下限側 約0.4〜0.5、農民〜都市住民の中間) × 世帯人数(4〜5人、外部仮定)
  ≈ 0.5 × 4 = 2.0
  ≈ 0.8 × 5 = 4.0
→ 約2〜4🟡/年
```

### 質素な住宅一軒 — 約10〜30🟡

```text
STARTING_BURG_TREASURY_PER_POPULATION(20) を「一住民あたりの元手」の参照点とし、
その前後 ±50% を住宅価格帯の目安とした。
→ 約10〜30🟡
```

`BACK_PAY_CYCLES_MIN〜MAX`(6〜18)がキャラクターの初期所持金として「数年分の貯蓄」を通常スケールとして扱っている前例とも整合する(数年〜十数年分の生活費に相当するオーダー)。

## 位置づけと注意点

- これらの数値は `Taxes.collectTaxes()` や `characterStipends.ts` の俸給計算など、実際にお金を動かすロジックには一切使われていない。About タブに表示するだけの読み物であり、ゲームバランスを拘束するものではない。
- 農民/都市住民/家族の3項目は実在の定数(`GROSS_FOOD_NEED`, Grain価格, `FARMGATE_PRICE_SHARE`)から機械的に導けるが、住宅価格の1項目だけは既存の金銭スケールに合わせた**推測値**であることを明記しておく。将来、住宅購入メカニクスを実装する場合はこの目安値をそのまま採用せず、実装時に改めて設計すること。

## 今後の課題

- 都市住民の諸経費や世帯人数について専用の定数がなく、目安値の幅がやや恣意的。将来的にurban専用の生活費定数を追加する場合は、ここに記載した目安値との整合を確認すること。
- 住宅価格の目安は `STARTING_BURG_TREASURY_PER_POPULATION` からの類推に過ぎない。住宅購入/賃貸メカニクスが実装された際は、このドキュメントと `CustomAboutContent.tsx` の翻訳キーを実装後の実際の価格帯に合わせて更新する必要がある。

src/extensions/economy/generators/goods-generator.ts
src/ui/components/tabs/CustomAboutContent.tsx
src/i18n/locales/ja.json
