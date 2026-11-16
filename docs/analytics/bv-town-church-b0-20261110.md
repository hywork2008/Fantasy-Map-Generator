# BV：人口段階の教会モデル B0（調査と計測）

2026-11-10。計画：[bv-town-church-tiers.md](../plan/bv-town-church-tiers.md)

## 1. 既存モデルの実測

`createXxx()`の生成物のバウンディングボックス（メートル）と三角形数。BVの`size`欄は実測と合っていない。

| モデル | 品質 | 長さ(x) | 幅(z) | 高さ(y) | 三角形 | `size`欄 |
| --- | --- | --- | --- | --- | --- | --- |
| `village-chapel` | low | 11.3 | 5.95 | 7.70 | 1,136 | 15×8×8 |
| `village-chapel` | high | 11.4 | 6.15 | 7.73 | 32,779 | 同上 |
| `parish-church` | low | 16.05 | 7.95 | 10.10 | 1,072 | 18×10×11 |
| `parish-church` | high | 16.5 | 8.15 | 10.15 | 58,099 | 同上 |
| `basilica-temple` | low | 62.7 | 27.8 | 42.8 | 2,146 | 64×30×46 |
| `basilica-temple` | high | 62.7 | 28.1 | 44.7 | 96,506 | 同上 |

- 現在の表の礼拝堂（T1 14×8 m・高さ10 m、T2 22×10 m・高さ12 m）は、既存モデルより一回り大きい。T1はモデルの外形に余白を足したものと読めるが、高さ10 mは実測7.7 mと合わない。
- バシリカの実測の高さは42.8〜44.7 mで、表の46 mより低い。

## 2. 史料による規模の確認

次の数値は、検索で得た二次資料の記述である。測量値ではなく、同じ建物でも資料で食い違うものがある。

| 建物 | 数値 | 出典 |
| --- | --- | --- |
| 小さな村の教会（Screveton, St Wilfrid） | 身廊＋側廊の長さ約30 ft（約9 m）、身廊の幅約17 ft（約5 m）、側廊込みの幅41 ft | [Southwell churches](https://southwellchurches.nottingham.ac.uk/screveton/harchlgy.php) |
| Long Sutton, St Mary | 身廊の長さ約80 ft（約24 m）、幅18.5 ft | [同上の検索結果](https://digital.weber.edu/details?id=159916) |
| Long Melford, Holy Trinity | 身廊約152 ft（約46 m）。聖母礼拝堂を含む全長は245〜250 ft（約75 m）と資料で幅がある | [Wikipedia](https://en.wikipedia.org/wiki/Holy_Trinity_Church,_Long_Melford)、[Historic England](https://historicengland.org.uk/listing/the-list/list-entry/1182550) |
| Norwich, St Peter Mancroft | 全長約180 ft（約55 m）、身廊の高さ60 ft（約18 m） | [教会公式](https://www.stpetermancroft.org.uk/history/nave-and-chancel)、[ancient-history-sites](https://www.ancient-history-sites.com/?p=122574) |
| Great Yarmouth, St Nicholas | 全長約236 ft（約72 m）。英国最大級の教区教会 | [Wikipedia](https://en.wikipedia.org/wiki/Great_Yarmouth_Minster) |
| Bristol, St Mary Redcliffe | 全長約76 m、身廊の高さ約17 m、塔と尖塔約80 m（上部は1872年の再建） | [Wikipedia](https://en.wikipedia.org/wiki/St_Mary_Redcliffe) |
| 教区数 | Norwichは1300年ごろ約58〜60教区で人口5,000〜1万人。Yorkは約45教区 | [Medieval churches of York](https://en.wikipedia.org/wiki/Medieval_churches_of_York)、[Norwichの教会](https://norwichmedievalchurches.org/) |

読み取れること：

- 人口5,000〜1万人のNorwichに教区教会が約60あった。大きな町でも、1つの教区教会が受け持つ人口は少ない。町の中心に1つの大きな教会を置く現在の表は、中世の姿とは一致しない。教区教会の大半は、長さ10〜30 m程度である。
- 町の主要な教会（市場の隣のSt Peter Mancroft、約55 m）や富を集めた教会（Long Melford、St Mary Redcliffe）は50〜75 mに及ぶ。ただしこれらは例外的に大きい。
- 現在の表の3,000人でバシリカ（約63×28×44 m）を置く値は、史料に照らして大きすぎる。T3（36 m）、T4（52 m）への置き換えは妥当である。
- 上の資料では、塔の高さは身廊の高さ（17〜18 m）の1.5〜4.5倍と幅が大きい（St Mary Redcliffeの80 mは例外的）。T2〜T4の塔の高さは、確かな出典が見つかっていないので暫定とする。

## 3. 計画への反映

利用者の判断（2026-11-10）：D1 表を変えてよい、D2 様式はT2〜T4が揃ってから決める、D3 T5は当初`basilica-temple`のまま（巨大都市の巨大なランドマークは別の計画）。

- T2〜T4の外形（22×10、36×20、52×28 m）は、史料の範囲に収まるので維持する。高さは暫定。
- T1は、実測（11.3×6.2×7.7 m）に余白を足した値を表に採用する案とする。B6で`civicSizeForPopulation`を更新する際に決める。
- BVの`size`欄の不一致（§1）は、B1で新モデルを登録する際に実測へ直す。既存2モデルの修正は別途判断する。
- 次の作業はB1（生成の枠組みとT2）。
