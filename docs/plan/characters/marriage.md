# 結婚

## 未婚率

### 調査

未婚率を設定する人口パラメーターは、現状ありません。

人口動態では出生数を `成人女性数 × demographicBirthRate × 経過年数 × 収容力の余裕` として計算しており、婚姻状態や未婚率は参照していません。[demography-simulator.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/demography-simulator.ts:25) [出生計算](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/demography-simulator.ts:68)

設定可能なのは主に以下です。

- `demographicBirthRate`（初期値 0.25）
- `demographicChildMortalityRate`（初期値 0.2）
- 初期人口飽和度 `initialPopulationSaturation`

[optionsState.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/store/optionsState.ts:39) [初期値](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/store/optionsState.ts:167)

なお、Characters拡張には君主等の個別人物向け配偶者数・独身（宗教国家で20%）のロジックがありますが、一般人口の出生・人口増減には連動していません。[personFactory.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/characters/personFactory.ts:51)

### 実装

実装しました。中世ヨーロッパ全体に「未婚率2割」という単一の史実値を当てるのは避け、晩婚・地域差を反映するモデルにしています。1300年頃のイングランド推計では初婚年齢は女性24歳・男性27歳で、高い生涯未婚率が示されています。[研究論文](https://www.cambridge.org/core/journals/social-science-history/article/abs/english-familial-demography-c-1300-a-reconstruction/42D2F954F759E4BD06CF2354FED6B5A1) 西欧婚姻パターンは特に近世で顕著ですが、地域・時期により大きく異なります。[研究レビュー](https://link.springer.com/article/10.1007/s11698-021-00237-2)

- 一般人物（Economyの市場関係者を含む）: 28歳以降は未婚率20%
- 官僚・指揮官: 10%
- 君主・領主・後継者: 3%
- 聖職系: 20%（既存の独身傾向を維持）
- 28歳未満は晩婚を表現し、未婚率を21歳未満80%、21–24歳45%、25–27歳28%に上げています。
- 既婚者の子ども数も16歳起点ではなく、女性21–26歳／男性24–29歳の初婚年齢から算出します。

[人物生成ロジック](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/characters/personFactory.ts:18) と [Nobilityの役割別設定](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/nobility/generators/characterLifecycle.ts:71) を更新し、Characters Overview に既婚/未婚と子ども数の列・ソートを追加しました。[一覧表示](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/characters/ui/components/tables/CharactersTable.tsx:71)

未婚者は配偶者0・子ども0で生成されます。時間経過中に結婚するライフサイクルはまだないため、これは生成時の状態です。

検証済み: 対象テスト9件、`npm run build`、Biome、レガシーUIチェック。