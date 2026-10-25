# E1: 計画上の草地と割り当て済みの草地の差（2026-10-25）

親計画§7.52の検証記録。コードは§7.51（[e1-cleared-pasture-20261025](e1-cleared-pasture-20261025.md)）のまま、計測だけを行った。固定入力は`docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg`、36か月、caravan raids off。

    NODE_OPTIONS=--max-old-space-size=1536 node --import tsx scripts/auditPastureCommitment.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/e1-pasture-commitment-20261025/world-36.json 36

## 段階ごとの草地（World、36か月、2,157セル）

DevelopmentPotentialの年次計画の順に並べた。

| 段階 | 草地 | 前段からの減少 |
| --- | ---: | ---: |
| 目標の群れに必要な草地（休閑地の放牧を除く、上限なし） | 25,694千ha | |
| 計画（バイオーム・開墾地の上限で頭打ち） | 18,889千ha | 6,805千ha |
| 牧夫の人手を掛けた計画 | 18,591千ha | 298千ha |
| 割り当て済み（台帳の牧草地・林間放牧地） | 13,386千ha | **5,205千ha** |
| 参考: 次の年次計画（調整幅25%） | 14,687千ha | |

- 牧夫の人手: 必要38.0千人に対し割り当て37.0千人で、充足率は全体で97%。人手が足りないセルは359あるが、差の多くを占めるのは53セル（13万ha）だけ。
- 台帳の不足（`livestock-land-shortfall`）: 2セル、2.8万ha。耕地の保護や土地不足では止まっていない。
- 差（計画−割り当て済み）の大部分を持つ段階で分けると、年ごとの調整幅が2,081セル・535万ha、牧夫の人手が53セル・13万ha、台帳が2セル・3万ha。

## 判定

約550万haの差は、ほぼ全量が年ごとの調整幅（`PASTURE_ANNUAL_ADJUSTMENT = 0.25`）による遅れである。牧夫の人手と台帳の土地不足は合わせて3%程度。

- 調整幅は、草地が年ごとに有無を繰り返す振動を防ぐために入れた（farm-labour-calibration.md §23）。毎年差の25%しか詰めないため、3回の計画で約58%しか追いつかない。加えて、人口増と§7.51の上限引き上げで計画が伸び続けている。
- 草地が足りないと収容力が下がり、前年の給与率による制限と重なって頭数の伸びを抑える。牛の「草地による制限」（100人あたり31頭）の一部は、上限ではなくこの遅れである。

## 出力SHA-256

    fa1db066d036ca2da8953745f5a54e0b75e49a860b1a81b8edf27a6279a1f472  e1-pasture-commitment-20261025/world-36.json
