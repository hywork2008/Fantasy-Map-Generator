# 人口ミニマム版

地図全体に対して以下のような生成時プリセットfrontier・初期人口率の目安20–35%以下のものにfrontierのようなIDを与えるとしたらどのようなIDが良いか？

1. ローマの建国神話に登場する双子の兄弟ロームルスとレムスと仲間たち
2. 無人島に流れ着いた個人
3. 購入した無人島に移り住んだ家族
4. 遺伝的多様性を保ちながら繁殖するのに必要最低限と言われている70人前後の開拓団
5. 母国からの支援・資材を持ち込むある程度の規模の開拓団
6. 5が複数国競い合う形で別の上陸地点から

| # | 推奨 ID | 表示名の例 |
| ---: | --- | --- |
| 1 | `founding-clan` | 建国氏族 |
| 2 | `castaway` | 漂着者 |
| 3 | `pioneer-family` | 開拓家族 |
| 4 | `viable-colony` | 最小開拓団 |
| 5 | `sponsored-expedition` | 支援付き開拓団 |
| 6 | `rival-expeditions` | 競合する開拓団 |

```ts
type InitialSettlementPattern =
  | "founding-clan"
  | "castaway"
  | "pioneer-family"
  | "viable-colony"
  | "sponsored-expedition"
  | "rival-expeditions";
```
