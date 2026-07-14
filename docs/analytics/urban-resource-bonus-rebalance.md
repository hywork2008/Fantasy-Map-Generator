# Urban Resource Bonus Rebalance

## Summary

Burgs Overview で Wealth(`product / population`)降順ソートすると、人口の小さい村・要塞クラスの都市が首位を占め、人口数千〜数万のtown/city/capitalより高いWealthを示すことがあった。原因は `src/extensions/economy/generators/production-generator.ts` の「都市の地場資源ボーナス」計算式にあった、人口スケールと無関係な定数フロア(下限)。フロアを撤去し、rural側の同種ロジック(`getCellProduction`)と同じ「下限なしの比例値」に統一した。

## 経緯

ユーザーが `temp/debug/Lania GenerationPipeline.Burgs *.csv`(Burgs Overviewからのエクスポート)をWealth降順でソートしたところ、`Sugarmenes`(group: fort, Population 374)が全都市中最高のWealth(47.68)を記録しており、Population 4703のtownのWealth(27.78)を上回っていた。Productも17.82と、同程度の人口(373)のtrading_post `Bit Na`(Product 7.22)の倍以上だった。

### 第一次調査(CSVベース)

`production-generator.ts` の該当箇所:

```ts
// 修正前
const BONUS_URBAN_PRODUCTION = 1;
const MIN_BONUS_PRODUCTION = 1;
...
const bonus = minmax(population * BONUS_URBAN_PRODUCTION, MIN_BONUS_PRODUCTION, MAX_BONUS_PRODUCTION); // MAX=5
const localBonus = bonus * modifier; // modifier = biome/culture/state/religion/zone倍率
```

CSVの `Population` 列(374、45036など、表示用の実人口)をそのまま `population` だと仮定し、「`population * 1` は374のような実人口では常に上限5でクランプされ、都市規模に関わらず定額の地場資源収益になっているのではないか」という仮説を立てた。この仮説は**誤り**だったことが後述のライブ検証で判明した。

### 第二次調査(ライブ検証で判明した誤り)

`npm run dev` + Playwright CLI で実際にマップを生成し、Economy拡張(要 `characters` 拡張の有効化)を有効化して `window.fmg.actions.advanceTime()` で生産サイクルを進めた上で `pack.burgs` を直接ダンプしたところ、`burg.population` は実人口ではなく **`populationRate` / `urbanization` 乗算前のスコア値**(概ね0.05〜20程度、village: 0.1〜2、fort: 上限1 など `burgs-generator.ts` の `getDefaultGroups()` のグループ判定閾値と同じスケール)であることが判明した。Burgs Overviewの `Wealth`/`Product` 列も、この生スコアを使って計算されている(`src/extensions/economy/index.tsx:156`)。

この結果、CSV上の「Population 374」相当の `fort` は実際には `burg.population ≈ 0.2〜1` 程度のスコアであり、`MIN_BONUS_PRODUCTION=1` のフロアにより**常に最低1ユニット(×modifier)の地場資源ボーナスが保証されていた**。フロア値1は、スコアが0.05でも0.95でも同じ — つまり「桁違いに小さい集落ほど、実際のスケールに対して割高な定額ボーナスを受け取る」構造になっていた。逆に `MAX_BONUS_PRODUCTION=5` の上限は、town以上の規模(スコア5以上)でのみ効いており、こちらは元々の設計として妥当だった。

一度、CSVの数値を鵜呑みにして `BONUS_URBAN_PRODUCTION` を `1 → 0.002` に変更する誤った修正を適用したが、ライブ検証で全都市(首都含む)の地場資源ボーナスがほぼゼロになる(スコアの上限20でも `20 * 0.002 = 0.04` にしかならない)ことを確認し、この修正は破棄した。実際に必要だったのは係数の変更ではなく、**下限(フロア)の撤去のみ**だった。

## 修正内容

`src/extensions/economy/generators/production-generator.ts`:

```ts
// 修正後
const BONUS_URBAN_PRODUCTION = 1; // 変更なし

// rural側 getCellProduction (production-utils.ts) と同じく下限なし
const bonus = Math.min(population * BONUS_URBAN_PRODUCTION, MAX_BONUS_PRODUCTION);
const localBonus = bonus * modifier;
```

`MIN_BONUS_PRODUCTION` 定数と `minmax()` の使用を削除し、`Math.min()` のみによる上限クランプに変更。`MAX_BONUS_PRODUCTION`(rural/urban共有定数、production-utils.ts)は変更していないため、town以上の規模の都市の地場資源ボーナスには影響がない。

## 検証結果

同一シード(`econtest1`)・同一手順(Economy/Characters拡張を有効化 → `advanceTime(90)` で3ヶ月分の生産サイクルを実行)で、修正前後のコードをそれぞれ再生成して `pack.burgs` を比較した。

### 修正前(`minmax(pop, MIN=1, MAX=5)`)— Wealth上位

| Burg | Group | 生スコア(population) | Product | Wealth |
|---|---|---:|---:|---:|
| Shush | village | 0.16 | 15.64 | **95.63** |
| Rushen | village | 0.13 | 8.97 | 70.41 |
| Lintiaquin | village | 0.16 | 10.08 | 61.49 |
| Gomand | village | 0.48 | 26.55 | 55.34 |
| Durenghes | village | 0.17 | 7.98 | 48.28 |
| Ratiq | town | 5.42 | 186.80 | 34.47 |
| Polis | village | 0.21 | 6.36 | 30.53 |

### 修正後(`Math.min(pop, MAX=5)`、下限なし)— Wealth上位

| Burg | Group | 生スコア(population) | Product | Wealth |
|---|---|---:|---:|---:|
| Nipparbi | fort | 0.27 | 13.53 | **50.42** |
| Trolissos | village | 1.44 | 45.78 | 31.72 |
| Halia | town | 4.44 | 140.76 | 31.70 |
| Teridadab | village | 0.23 | 6.90 | 29.86 |
| Weildendern | town | 4.38 | 128.06 | 29.21 |
| Ablos | city | 17.82 | 472.74 | 26.53 |

修正前は生スコア0.13〜0.21という極小規模の村がWealth 48〜96という極端な値を示していたが、修正後は同程度の極小スコア(0.21〜0.35)の村・要塞のWealthは24〜30程度に収まり、town/cityのWealth(24〜32)と同じレンジに自然に混ざるようになった。最大値も95.63→50.42へと約半分に低下し、単一の突出した外れ値が生じなくなったことを確認した。

なお、この現象は `fort` グループ固有の不具合ではなく、「生スコアが1未満の非常に小規模な集落(hamlet/village/fort/trading_post)が高価値な地場資源(Gold, Gemstones等)と有利なmodifierに当たった場合」に起こり得るものだったため、上記の通り修正前後どちらのサンプルにも `village` グループの外れ値が含まれている。

### 既存テスト

- `npx tsc --noEmit`: エラーなし
- `npx vitest run`(全体): 558 passed / 6 skipped
- `npm run lint` / `npm run madge`: エラーなし
- 上記の生産フォーミュラを直接検証する既存ユニットテストは存在しなかった(`production-generator.ts` 自体に `.test.ts` がなく、`seasonalPricing.integration.test.ts` は `produce()` を直接実行しない)

## 今後の課題

- `production-generator.ts` に生産フォーミュラ専用のユニットテストが無いため、今回のような回帰は静的解析だけでは検出できない。`createBurgProductionState()` の地場資源ボーナス計算を対象にした最小限のテストを追加する余地がある。
- Burgs Overviewの `Wealth` 列は「実人口」ではなく `populationRate`/`urbanization` 適用前の生スコアで割った値であり、直感的な「一人当たり」指標としては誤解を招きやすい。表示側で実人口を使う、あるいは列名/ツールチップで生スコアである旨を明示する改善は別課題として残る。
