# E1: 群れの更新を職業の割り当ての前に回す（2026-10-27）

親計画§7.59の検証記録。§7.58で、年次処理の職業の割り当て（`updateAnnualAgriculture`）が群れの出生・加齢（`updateAnnualFaunaCohorts`）より先に走り、出生前の群れの分しか牧畜の暦を取らないことが分かった。`src/extensions/economy/simulation.ts`の年次処理で、群れの更新を割り当ての前に移した。前の値は§7.54のafter（同じ固定入力・48か月）。

    NODE_OPTIONS=--max-old-space-size=1536 node --import tsx scripts/auditHerdScale.mts docs/analytics/inputs/salt-s0-aligned-20261023/{world-102,province-101}.fmg <output.json> 48
    NODE_OPTIONS=--max-old-space-size=1536 node --import tsx scripts/auditFeedShortage.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg e1-herd-order-20261027/world-feed.json 48

## 結果（1304年初、前→後）

| 指標 | World | Province |
| --- | --- | --- |
| 飼料不足（直近12か月） | 5.5→1.4% | 0→0% |
| 割り当て時/干草の時点の牧畜の必要人数 | 約0.77→約1.02 | — |
| 牛（100人あたり） | 15.2→12.7 | 20.5→17.9 |
| 羊（100人あたり） | 49.6→53.0 | 115.3→114.1 |
| 牛の収容力（千頭） | 599→940 | — |
| 草地・うち森林転換（千ha） | 17,735・3,276→17,724・3,273 | 464・253→463・253 |
| 耕地/人・単収 | 2.17ha・284kg 不変 | 2.11ha・251kg 不変 |
| 主食の充足（農村） | 98.8→98.7% | 100% 不変 |

World の牛の推移（100人あたり、各年1月）:

| | 1301 | 1302 | 1303 | 1304 |
| --- | ---: | ---: | ---: | ---: |
| 前 | 15.6 | 14.8 | 15.0 | 15.2 |
| 後 | 10.5 | 10.7 | 11.2 | 12.7 |

- 割り当てが干草の時点の群れを見るようになり、飼料不足は5.5%から1.4%に下がった。
- 牛が低いのは1年目の差による。初年の更新が地図生成直後の土地で行われるため、最初の伸びが小さい。その後は前の挙動（横ばい）と違って毎年増えており、前年の給与率で抑えられていた収容力（599→940千頭）が開いている。
- 草地・開墾・耕地・主食は実質不変。

## 判定

順序の変更は維持する。牛の頭数が前の水準を超えるか、および残る不足1.4%（森林系の畑仕事との重なり）は、より長い期間で確かめる。

## 出力SHA-256

    5cd5234ef3cc4c430543bb33f3e45efcfa5ffdb53ae6290dc80a250e43d6c15c  e1-herd-order-20261027/world-after.json
    78a97768429515aa0d1f2794c8189736446341eea9af557cf935620be73e7b19  e1-herd-order-20261027/province-after.json
    3f2bf8dbbb48c164ef2f91d7c1696bad8429b7bb8999b0db0feebabc3ff34c49  e1-herd-order-20261027/world-feed.json
