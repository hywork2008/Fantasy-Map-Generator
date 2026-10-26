# E1: 草地の拡大による開墾とProvinceへの影響（2026-10-26）

親計画§7.54の検証記録。§7.53（`PASTURE_ANNUAL_EXPANSION` = 0.5）と、その前の挙動（拡大も0.25、定数を一時的に0.25へ戻して実行）を同じ固定入力で48か月比較した。

    NODE_OPTIONS=--max-old-space-size=1536 node --import tsx scripts/auditHerdScale.mts docs/analytics/inputs/salt-s0-aligned-20261023/{world-102,province-101}.fmg <output.json> 48

`auditHerdScale.mts`に、区画の種類別の森林転換面積（`convertedForestHaByKind`、潜在森林と重なる面積）を追加した（schemaVersion 3）。

## 結果（1304年初、拡大0.25→0.5）

| 指標 | World | Province |
| --- | --- | --- |
| 草地（千ha） | 14,651→17,735（+3,084） | 439→464（+25） |
| うち森林転換（千ha） | 2,752→3,275（+523） | 236→253（+17） |
| 森林転換の合計（耕地・草地・放棄地、千ha） | 8,270→8,790（+6.3%） | 851→868（+2.0%） |
| 耕地の森林転換（千ha） | 3,182→3,179 | 590→590 |
| 牛／羊（100人あたり） | 11.9／39.5→15.2／49.6 | 18.7／111.5→20.5／115.3 |
| 飼料不足（直近12か月） | 5.2→5.5% | 0→0% |
| 耕地/人・単収 | 2.17ha・284kg 不変 | 2.11ha・251kg 不変 |
| 主食の充足（農村／都市、4年目） | 98.7／94.8→98.8／95.1% | 100／100% 不変 |

- Worldでは増えた草地の約17%だけが森を切った土地で、残りは草原・ステップ等の未利用地。森林転換の合計は6%増に留まる。
- Provinceは森林系バイオームが多く、増えた草地の約68%が森林転換だが、絶対量は1.7万haで合計の2%。草地は§7.51の時点でほぼ計画に近く、効果は小さい。
- 耕地の森林転換・主食は不変。拡大は年を追って小さくなり（World +2,645→+524千ha/年）、開墾が止まらず進む傾向は見られない。

## 判定

草地の拡大による開墾の増加は許容範囲で、Provinceへの悪影響もない。§7.53の変更は維持する。

## 出力SHA-256

    fba31460b18ecea95a0c865c4bc60779d0e072f86210605a1a6b5eb26107abe2  e1-pasture-clearance-20261026/world-before.json
    2cd8ae53b7539dc2b98d1beff1ffa8967c9b0b2fd4246dc6c001b0539dd5fc8c  e1-pasture-clearance-20261026/world-after.json
    a891cdbb82a4e6cd7b6af91498df6e94e22943ff24e24c2d7acba9b7fa5f7464  e1-pasture-clearance-20261026/province-before.json
    119516e74017eeea3eee87430218f746a86324a84c2d1b421a8eb728dd369df0  e1-pasture-clearance-20261026/province-after.json
