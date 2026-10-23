# E1の全量観測の所在とハッシュ（2026-10-24）

全量JSONはGit管理外の`docs/analytics/raw/`、派生値は[比較JSON](economy-e1-comparison-20261024.json)に保存する。固定入力はE0と同じ1300年・High Medieval・Standard・populationRate1000。Worldは12か月と、新市場の初回決済だけを確認する追加1か月を分離する。Provinceは12か月。

| ファイル（docs/analytics/raw/） | バイト数 | SHA-256 |
| --- | ---: | --- |
| economy-e1-before-world-102-20261023.json | 60465377 | `203691db87c32ff38c1271fc35de14cc035f3f882e4d7bd3c1321bf9e36e8b57` |
| economy-e1-current-province-101-20261024.json | 2480221 | `678b80b7ba352a05010a905fac3c9eaa1db11d9b0e26645e716ebedc5fba5422` |
| economy-e1-current-world-102-20261024.json | 60388337 | `85c2be1559e86c83087e956325afc1b1470d7161f0bd1f270604a5af262892f6` |
| economy-e1-food-world-102-20261024.json | 60414366 | `770ffbb2b4cb1fc79e6f4a5417d6579cdd0e32615026a3028c1f66ecc2972681` |
| economy-e1-labor-world-102-20261024.json | 60388337 | `e109c73f82e7f2ada51b88953006a7d2a96110c0b1215ce19a1b9967c2d3259c` |

各出力は同一の固定入力から独立に開始した。`before`は修正前の挙動（2026-10-23に実行）、`food`は新市場の空台帳作成だけ、`labor`はそれに実群れの世話労働・開墾の人口倍率修正を加えた段階、`current`はさらに保存済みの派生列の再計算版を8へ上げた最終コード。`labor`までの食料決済の空台帳代入は1つの式、最終コードでは同じ代入と参照を2文に整形した。各実行時の正確なソースは`sourceHashes`と`sourceTreeSha256`で区別する。最終コードの同一入力では`labor`と`current`の初期・全13区間の経済観測値が一致したことを別途照合した。

前回の別ブランチの590年province-101観測2ファイルは固定入力が異なるため削除し、今回の比較へ混ぜていない。途中のProvince観測は最終版と重複するため残さない。

最終コードの再実行:

```sh
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/raw/economy-e1-current-world-102-20261024.json 13
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/raw/economy-e1-current-province-101-20261024.json 12
```

段階別出力が揃った状態で派生比較を再生成:

```sh
node --import tsx scripts/summarizeEconomyE1.mts docs/analytics/economy-e1-comparison-20261024.json docs/analytics/raw/economy-e1-before-world-102-20261023.json docs/analytics/raw/economy-e1-food-world-102-20261024.json docs/analytics/raw/economy-e1-labor-world-102-20261024.json docs/analytics/raw/economy-e1-current-world-102-20261024.json docs/analytics/raw/economy-e1-current-province-101-20261024.json
```

## E1 市場16の食料輸入経路（同日追補）

[分析記録](economy-e1-food-routes-20261024.md)、[派生比較](economy-e1-food-routes-comparison-20261024.json)。固定入力、Standard、High Medieval、populationRate1000、1300-01-01〜1301-01-01、遠隔交易on・隊商襲撃off。全量出力は引き続きGit管理外。段階ごとの実行時ソースハッシュは各JSONに保存する。

| ファイル（docs/analytics/raw/） | バイト数 | SHA-256 |
| --- | ---: | --- |
| economy-e1-food-routes-before-world-102-20261024.json | 56204600 | `bdfd4e6c7cc90b0c8509eb68fb0d011ade4dfcd9209b7ffcc843a77b54cdc75b` |
| economy-e1-food-routes-final-province-101-20261024.json | 2499738 | `d4af22af327b6feebdf1dffefa72e94b0176244318ad52b8b774b6658c1715f9` |
| economy-e1-food-routes-final-world-102-20261024.json | 56238920 | `3dcb33d1bcedf04c07c4cc04556d26f9e3490acfb223358fa2f14876853d1a16` |
| economy-e1-food-routes-mixed-world-102-20261024.json | 56223073 | `48089b410ce98f3052bae1133d573ea915016eb5f121a7eb8e1629fd88072c33` |

`before`は輸入診断だけを追加した修正前、`mixed`は港経由の道路＋海路を追加した段階、`final`は実在庫による輸出選択・新品種の輸入保持と数量精度の診断を加えた最終版。診断追加だけの`before`は、既存のE1 World最終出力と初期・最初の12区間の経済観測値が一致した。数量精度の分類を補った最終再実行も、その直前の経済観測値と一致し、重複する全量出力は削除した。旧段階の`emptyCrop`には微小な残必要量で丸め後の積載量が0になる場合も含まれ、最終版では`belowQuantityPrecision`と区別する。

最終版を再実行:

```sh
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/raw/economy-e1-food-routes-final-world-102-20261024.json 12
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/raw/economy-e1-food-routes-final-province-101-20261024.json 12
node --import tsx scripts/inspectFoodMarket.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/economy-e1-market16-profile-20261024.json 16
```

段階別出力が揃った状態で派生比較を再生成:

```sh
node --import tsx scripts/summarizeEconomyE1.mts docs/analytics/economy-e1-food-routes-comparison-20261024.json docs/analytics/raw/economy-e1-food-routes-before-world-102-20261024.json docs/analytics/raw/economy-e1-food-routes-mixed-world-102-20261024.json docs/analytics/raw/economy-e1-food-routes-final-world-102-20261024.json docs/analytics/raw/economy-e1-food-routes-final-province-101-20261024.json
```
