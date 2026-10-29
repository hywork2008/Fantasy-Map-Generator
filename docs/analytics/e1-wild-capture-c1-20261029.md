# 野生の動物の捕獲C1: 捕まえてよいセルの割合（2026-10-29）

[設計書](../plan/wild-animal-capture-domestication.md)§6のC1の記録。権利の方針表`src/extensions/economy/generators/wildCaptureRightsPolicy.ts`を作り、人の住む陸のセルごとに農民が野生馬を捕まえてよいかを判定した（`scripts/auditWildCaptureRights.mts`）。振る舞いは変えていない。

    NODE_OPTIONS=--max-old-space-size=6000 node --import tsx scripts/auditWildCaptureRights.mts docs/analytics/raw/e1-herd-cells-20261028/world-144.fmg docs/analytics/e1-wild-capture-c1-20261029/world-1312-0.json 0
    NODE_OPTIONS=--max-old-space-size=6000 node --import tsx scripts/auditWildCaptureRights.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/e1-wild-capture-c1-20261029/province-1300-12.json 12

World は§7.72で保存した1312年1月の状態、Province は1300年から12か月進めた1301年1月。どちらも時代は highMedieval。

## 方針表（すべて仮）

上から順に判定する。

| 判定 | 条件 | 捕獲 |
| --- | --- | --- |
| noState | 国に属さないセル | 可 |
| foragingCulture | セルの文化が Hunting・Nomadic・Desert | 可 |
| openForm | 国の政体が Monarchy・Theocracy 以外（Republic・Union・Anarchy） | 可 |
| outsideForestLawEra | 時代が earlyMedieval より前か preIndustrialEra より後（ローマ法の無主物、狩猟権の廃止） | 可 |
| lordsForest | 上のいずれでもなく、バイオームのタグに forest を含む（王の森・領主の狩猟権） | 不可 |
| commonsCustom | 上のいずれでもない草原・湿地・荒蕪地など（共同体の慣習） | 可 |

## 結果

不足は、出荷の条件（頭数＋自然増＞目標）を満たさないセルの「目標−頭数」（千頭）。

| 地図 | セル | 可のセル | 目標 | 可の目標 | 不足 | 可の不足 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| World 1312 | 2,157 | 76% | 399.8 | 75% | 145.2 | 99% |
| Province 1301 | 118 | 92% | 20.7 | 74% | 9.8 | 74% |

World の判定ごと（セル／不足千頭）: commonsCustom 778／80.3、openForm 377／44.2、foragingCulture 441／17.5、noState 39／1.3、lordsForest 522／1.9。

World の国ごとの可のセルは19%（Joria）〜100%。Monarchy は70%、Republic・Union は100%。文化の型では Marsh 51%・River 61%・Generic 62%・Naval 83%・Hunting 100%。Province は94セルが国に属さず、2つの Monarchy の森9セル（目標5.4千頭、不足2.6千頭）が不可になる。

- **World では権利はほとんど上限にならない。** 不可のセルは4分の1あるが、森のセルの馬はすでに目標に近く、不足の99%は捕まえてよいセル（草原・湿地の共同体の土地と共和国）にある。
- **Province では不足の4分の1が領主の森にある。** 小さな地図で森の比率が高いため。この不足は捕獲では埋まらず、自然増に任せる。
- 国ごとの差は政体と森の比率で決まり、文化の型の効果は Hunting の国（Rosia・Nikia など）で森も可になることに限られる。

## 判定

方針表は C2 にそのまま使える。権利の制限は World の馬の不足にはほとんど効かず、捕獲の頭数は C2 の上限（不足の一部ずつ・野生の取り分）で決まる。

## 出力SHA-256

    78e4699990df3c6712ad7132cc9f88c0e5ca8fd1b4b5825d6f3c950beea67d08  e1-wild-capture-c1-20261029/province-1300-12.json
    9952b88803c78ecec3d0694db91136c64c2c9f534b2bdef3184051423425ddcf  e1-wild-capture-c1-20261029/world-1312-0.json
