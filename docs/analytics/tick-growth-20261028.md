# 長期実行で月ごとに遅くなる原因の計測（2026-10-28）

[計画](../plan/tick-growth-measurement.md)の記録。計測用 Mac mini M4、`feature/migrate2rust`（1c5a60cc）に`scripts/auditTickGrowth.mts`を加えて実行した（スクリプトは未コミットの状態で計測）。

    NODE_OPTIONS=--max-old-space-size=3072 node --import tsx scripts/auditTickGrowth.mts \
      docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg \
      docs/analytics/tick-growth-20261028/world-48.json 48 --cpu-profile-months=2,48

## 月の時間の伸び方

48か月で67分。1か月の時間は直線より速く伸びる（ほぼ月数の2乗）。

| 月 | 1 | 12 | 24 | 36 | 48 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1か月の時間（秒） | 16 | 27 | 75 | 142 | 279 |
| うち`production:rural`の self（秒） | 1 | 9 | 48 | 103 | 220 |
| うち`production:fillDemand`の self（秒） | 0 | 2 | 10 | 18 | 30 |

`heapUsed`は0.45〜1.8GBの間で上下し、増え続けない。メモリは原因ではない。

## 伸びた処理（序盤1〜12か月と終盤37〜48か月の1か月あたりの self）

| ラベル | 序盤（ms） | 終盤（ms） | 伸び率 |
| --- | ---: | ---: | ---: |
| 月全体 | 12,732 | 191,009 | 15.0 |
| `production:rural` | 1,857 | 148,470 | 80.0 |
| `production:fillDemand` | 549 | 25,579 | 46.6 |
| `production:burgLoop` | 1,235 | 4,895 | 4.0 |
| `production:slaughter` | 41 | 2,564 | 62.3 |
| ラベルの外 | 670 | 1,435 | 2.1 |
| `system:characters.roster.finalize` | 3,067 | 3,500 | 1.1 |

`selfUnreliable`は0（非同期のラベルの入れ子の乱れなし）。

## CPU プロファイル（関数の self）

| 月 | 1位 | 割合 |
| --- | --- | ---: |
| 2 | `structuredClone`・`personalCash.ts`（それぞれ約0.7秒） | 各10% |
| 48 | `livestockLots.ts` の無名関数 | 91%（254秒） |

## 件数の推移

| 月 | 0 | 12 | 24 | 36 | 48 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 都市 | 411 | 412 | 413 | 414 | 416 |
| 市場 | 16 | 17 | 18 | 19 | 21 |
| 隊商 | 30 | 158 | 142 | 158 | 158 |
| 群れの表 | 7,897 | 15,280 | 15,280 | 15,276 | 15,276 |
| 飼料の表 | 2,157 | 2,161 | 2,161 | 2,161 | 2,161 |

都市・市場・隊商・群れは12か月目以降ほぼ一定で、時間の伸びと対応しない。家畜のロット台帳（`economy.livestockLots.lots`）の件数は、今回の件数の深さ（slice の1段目）では数えていない。

## 判定

- 遅くなる原因は家畜のロット台帳（`src/extensions/economy/generators/livestockLots.ts`）である。`recordLivestockLotFlow`と`moveOwnedLivestock`は、家畜の取引1件ごとに`Object.values(ledger.lots).filter(...)`で全ロットを走査し、1回の呼び出しの中でも`matching()`を何度も作り直す。ロットは取引ごとに増え（`addLot`・`copyLotShare`）、所有・輸送中のロットは消えにくいため、ロット数は月とともに増える。取引数×ロット数で、1か月の時間が月数のほぼ2乗で伸びる。
- `production:rural`・`production:fillDemand`・`production:slaughter`は、いずれも家畜の取引でこの台帳を呼ぶ処理と見られる。
- 直し方の見込み:
  1. 計算量を下げる: ロットを`status`・`marketId`・`species`（所有は`ownerId`・`locationId`）の索引で引き、1回の呼び出しで`matching()`を一度だけ作る。
  2. 件数の伸びを止める: 頭数がごく小さいロットの消去、同じ市場・種・出所のロットの統合、`exits`の集約。
  ロット数の推移を数えて、1と2のどちらが主かを確かめてから計画する。

## 追加: ロットの件数と golden の差（2026-10-28）

`auditTickGrowth.mts`に、家畜のロット台帳の件数（`livestockLots`）、件数の間隔（`--count-every`）、golden のセクション別の出力（`--hash-sections`）を加えた。24か月（3か月ごとの件数）で、ロットは12か月目以降に月約2,800件ずつ直線的に増え（24か月目44,501件、うち市場40,053件）、`shipments`は87,454件、`exits`のキーは47,490件まで増えた。詳細は[台帳の計画](../plan/livestock-lot-ledger-performance.md)。

observer なしの3か月を2回、observer ありの3か月を1回実行し、golden をセクション別に比べた。差は3回とも`world.notes`だけで、シミュレーションの状態は決定的で、observer は結果を変えない。golden の全体ハッシュが毎回変わるのは`world.notes`による。

## 追加: L1（ロットの索引）の効果（2026-10-28）

[台帳の計画](../plan/livestock-lot-ledger-performance.md)の L1（取引ごとの全ロット走査を、市場×種・所有者×種の索引に置き換え）の後に、同じ条件で48か月を再計測した（`tick-growth-20261028/world-48-l1.json`）。

| 月 | 1 | 12 | 24 | 36 | 48 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1か月の時間（秒、前→後） | 16→16 | 27→17 | 75→16 | 142→17 | 279→20 |
| `production:rural`の self（秒、前→後） | 1→1 | 9→1 | 48→1 | 103→1 | 220→1 |

- 48か月の合計は69分→9分。月の時間は48か月を通じてほぼ一定（序盤と終盤の比1.09）。
- 12か月の golden はセクション別に`world.notes`以外が変更前と一致した（`raw/l1-before-12.sections.json`・`raw/l1-after-12.sections.json`）。
- ロットは48か月目に104,643件、`shipments`は265,514件、`exits`のキーは173,999件で、件数は増え続ける。速度には効かなくなったが、保存ファイルの大きさには効く（L3）。

## 計測が結果を変えないことの確認（手順7）

12か月の golden ハッシュ（`hashArchiveBytes(host.saveArchive())`）は、observer あり `93398b63…`、なし `b1e982c0…`、なしの再実行 `dd1be9ca…` で、observer なし同士でも一致しなかった。保存されるアーカイブか、この実行経路そのものが実行ごとに変わるため、この方法では observer の影響を判定できない。→ 追加の確認で、差は`world.notes`だけと分かった（上記）。

## 出力SHA-256

    7b847fe5c548b31c6f559c031de955087981e189aa4b5cecd52bcb0a0cf34221  tick-growth-20261028/world-48.json
    ad1e88bd58c6ecfbc9447ab1db852787eb410fc2b82e7be72acacde0ba4ff579  raw/tick-growth-20261028-world-48.log
    2222a0e5f4ccd8ea88488cc272fc477ed16422c2cf9fe09d9005b1215b77caeb  raw/tick-growth-5e73a277-m2.cpuprofile
    d10536a4c98af2eaa1487b453edd99c76379808c4a615f30404c363359d4ca0c  raw/tick-growth-5e73a277-m48.cpuprofile
    bae6370755510fc52ea0fbbfd02a4a0e633c08049c9c1abd3d2b46df8b3645c8  raw/tick-growth-20261028-obs-12.json
    eaaec30aaea3e847a0d580dbf59d758926f5d451cac4c93567d2a0e0e3e5052c  raw/tick-growth-20261028-noobs-12.json
    3a26665d655e5b0595ec72233755e398ac8a1044fcf6539d71e43b3945c46682  raw/tick-lots-24.json
    2ba30d06ac612435142df8afd5a73190132fe16ea5b4705d64b5c82e8666e8bc  raw/tick-hash-3-a.sections.json
    e85277b687511e7895babf1ae7cdd3ac96f6ff1e2c31a1172f59dd2fcc3a6bdb  raw/tick-hash-3-b.sections.json
    9b6afbe6fab07f3965884e53086441f4edbcea3015c37d02a75e2d0c10c28d6b  raw/tick-hash-3-obs.sections.json
    3552f1010c3ecf5e8e458bb1a6791066d7fe2f7d702f6825da3b1a7ec233a7dd  tick-growth-20261028/world-48-l1.json
    517601b8a94629f31535817574ef36ed0d6dd5c8a60b28bb0243bea98edc5145  raw/tick-growth-20261028-world-48-l1.log
    908b25968133ac2ac56757887b7ab0f8e633b78e0379048b1896281bc75e35d7  raw/l1-before-12.sections.json
    a0d16b362008201bcde7bdf2676168bb0ada3689af433587e9d4e1c56ab63e21  raw/l1-after-12.sections.json
