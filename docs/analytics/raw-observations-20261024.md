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

## E1 季節飼料（同日追補）

[分析記録](economy-e1-seasonal-feed-20261024.md)、[派生比較](economy-e1-seasonal-feed-comparison-20261024.json)。同じ固定入力と設定。Worldは乾草持越しのため修正前後36か月、Provinceは12か月。全量出力はGit管理外。

| ファイル（docs/analytics/raw/） | バイト数 | SHA-256 |
| --- | ---: | --- |
| economy-e1-feed-before36-world-102-20261024.json | 171045744 | `848c3d1d525f493160f53af8e1484815ef20626ff7e8e3c1ad8dc2831c40e48f` |
| economy-e1-feed-seasonal36-world-102-20261024.json | 171296510 | `67784263574989a7b940210c188258730a4cae18ae6494c5ae0c18a3ba42b7cc` |
| economy-e1-feed-seasonal-province-101-20261024.json | 2520470 | `5d08f4bc171cb4e6997f23dc735ca2b6a8eaddfcd160bbb60a1cfcfaf8b0b68e` |

`before36`は636a0729f時点の経済に実決済観測だけを追加した基準。初期/最初の12区間の経済値が前回の最終Worldと完全一致することを照合した。重複する診断確認用の12か月全量出力は削除した。修正前後の各年の飼料決済期間も一致する。`seasonal36`は季節備蓄・採草計画・修復9を含む最終版。各全量出力に実行時ソースハッシュがあり、最終Worldの全記録済みsrcと監査本体/ヘルパーが現在のファイルと一致することを確認した。派生スクリプトは実行後に36か月集計へ拡張し、比較JSON自身にそのハッシュを保存する。

最終版の再実行（修正前は記録済みソースへの復元が必要）:

```sh
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/raw/economy-e1-feed-seasonal36-world-102-20261024.json 36
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/raw/economy-e1-feed-seasonal-province-101-20261024.json 12
```

段階別出力が揃った状態で比較を再生成:

```sh
node --import tsx scripts/summarizeEconomyE1.mts docs/analytics/economy-e1-seasonal-feed-comparison-20261024.json docs/analytics/raw/economy-e1-feed-before36-world-102-20261024.json docs/analytics/raw/economy-e1-feed-seasonal36-world-102-20261024.json docs/analytics/raw/economy-e1-food-routes-final-province-101-20261024.json docs/analytics/raw/economy-e1-feed-seasonal-province-101-20261024.json
```

## E1 飼料決済の期間（同日追補）

[記録](economy-e1-feed-calendar-20261024.md)、[派生比較](economy-e1-feed-calendar-comparison-20261024.json)。同じ固定2入力・設定で12か月。変更前Worldは既存seasonal36の最初の12区間、Provinceは既存seasonal出力。変更前11期間、変更後12期間で分母が異なる。最終版とその直前の観測の初期/全区間が一致し、重複出力は削除した。

| ファイル（docs/analytics/raw/） | バイト数 | SHA-256 |
| --- | ---: | --- |
| economy-e1-feed-calendar-final-world-102-20261024.json | 57083630 | `18d83b20f643b98591e8db6b69bb248818d48db1137ccb9149c21b086db79018` |
| economy-e1-feed-calendar-final-province-101-20261024.json | 2522714 | `a2d87f994e8d4ce48069c60525ce674f7cd76b3d6d645e7a9e01d29f5bdade02` |

最終版の再実行:

```sh
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/raw/economy-e1-feed-calendar-final-world-102-20261024.json 12
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/raw/economy-e1-feed-calendar-final-province-101-20261024.json 12
node --import tsx scripts/summarizeEconomyE1.mts docs/analytics/economy-e1-feed-calendar-comparison-20261024.json docs/analytics/raw/economy-e1-feed-seasonal36-world-102-20261024.json docs/analytics/raw/economy-e1-feed-calendar-final-world-102-20261024.json docs/analytics/raw/economy-e1-feed-seasonal-province-101-20261024.json docs/analytics/raw/economy-e1-feed-calendar-final-province-101-20261024.json
```
