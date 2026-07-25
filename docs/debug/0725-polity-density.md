# Polity density vs States number

## Q1

Polity densityオプションが0だと国家は0ですが、1にすると国家は2になり、国家を1にする事が出来ませんが、どのような設計思想でしょうか？

## A1

これは意図された「密度」解釈です。非 `standard` マップでは、`statesNumber` は国家数そのものではなく、定住ネットワークに対する国家核の密度・上限です。

- `0` は明示的な「国家なし」。
- `1` 以上では、離れた定住圏を無理に一国家へ接続しないため、少なくとも定住圏ごとに国家核を置きます。
- そのため生成された定住圏が2つなら、値1でも最低2国家になります。

実装は `max(plan.regions.length, …)` で下限を定住圏数に固定しています。[initialPolities.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/initialPolities.ts:65)  
「開拓前線」プリセット自体が定住圏を1〜3個作るので、seed により2個になればご質問の挙動になります。[initialSettlementPatterns.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/data/initialSettlementPatterns.ts:21)

設計上の狙いは、遠隔の流域・海岸の集落を「国家を1つにしたい」という理由だけで道路外の領土や行政回廊で結ばないことです。計画書にも、ネットワークの地域・ノード数が実際の首都数を制限する、と明記されています。[frontier-expansion.md](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/docs/plan/frontier-expansion.md:353)

したがって、値1は「国家を1つ」ではなく「非ゼロ時の最小 polity density」です。単一国家を選べるようにしたいなら、これは現状の設計では表現できず、別途「国家数を厳密指定する」モード／オプションを設けるのが自然です。なお `standard` パターンだけは従来どおり値を国家数として扱います。
