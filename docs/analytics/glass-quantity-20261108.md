# ガラスの量と値段の史料との比べ直し（2026-11-08）

[barilla.md](../plan/barilla.md) §5の8。ガラスの値段にアルカリの費用を全部入れると、ガラスの買い物が約20%減った（[barilla-20261108.md](barilla-20261108.md) §6）。今までのガラスの量は、アルカリの費用が半分の値段で合わせたものなので、量と値段を史料と比べ直した。コードは変えていない。

## 1. モデルの値

- 計測は[barilla-20261108.md](barilla-20261108.md)の地図2枚の13〜24か月目（1年）。人口は地図の始めの値（[popprobe.mts](glass-quantity-20261108/popprobe.mts)、[pop-2102.json](glass-quantity-20261108/pop-2102.json)・[pop-2103.json](glass-quantity-20261108/pop-2103.json)）。
- ガラスと小麦は、どちらも1荷465 kg（[goodMeasureCatalog.ts](../../src/extensions/economy/generators/goodMeasureCatalog.ts)）。基準の値は、ガラス6、小麦1.2。1 kgでガラスは小麦の5倍。
- 値1は、小麦1クォーター（約218 kg）6シリングの基準で約11シリング（[wood-ash-potash.md](../plan/wood-ash-potash.md)、[ale-cask-repricing.md](../plan/ale-cask-repricing.md)）。ガラス1 kgは約1.7ペンス。

| | 2102 base | 2102 new4 | 2103 base | 2103 new4 |
| --- | ---: | ---: | ---: | ---: |
| 町の人 | 2.00百万 | | 1.36百万 | |
| 農村の人 | 18.3百万 | | 8.98百万 | |
| 作ったガラス（森の小屋と町、荷） | 612 | 564 | 495 | 443 |
| 作ったガラス（t） | 285 | 262 | 230 | 206 |
| 1人あたり（kg） | 0.014 | 0.013 | 0.022 | 0.020 |
| 町の人1人あたり（kg） | 0.142 | 0.131 | 0.170 | 0.152 |
| 町の買い物、町の人1人あたり（kg） | 0.144 | 0.123 | 0.140 | 0.117 |
| 森の小屋の数（÷7.7荷） | 60 | 60 | 52 | 44 |
| 小屋の数、100万人あたり | 3.0 | 3.0 | 5.0 | 4.3 |

- このほか、海軍の輸入（`navyImport`）が年91〜267荷あった。

## 2. 史料

### 2.1 値段

| 時と所 | ガラス | 1 kgあたり | 小麦との比（1 kg） |
| --- | --- | --- | --- |
| 1350年代、ウェストミンスターの聖スティーブン礼拝堂 | チディングフォールドの白いガラス、重さ1単位（約5ポンド、約2.3 kg）で6ペンス | 約2.6ペンス | 約8倍 |
| 1485年、ロンドンのコールド・ハーバー | イングランドのガラス1フィート1ペンス、ノルマンディー6ペンス、ヴェネツィア5ペンス、オランダ4.5ペンス | イングランド約1.7ペンス、ノルマンディー約10ペンス | イングランド約5倍、ノルマンディー約30倍 |
| 1687年、ベッドフォード伯の家 | クォートの瓶1ダース2シリング6ペンス | 約2.5ペンス | 約1.2〜1.8倍（1690年代の小麦） |
| 1754年、アンゲルシュタインの瓶の小屋 | 瓶1ダース20ペンス | 約1.7ペンス | - |

- 1350年代は[Tudor Society](https://www.tudorsociety.com/medieval-stained-glass-to-tempt-an-artist-by-toni-mount/)。ガラスは重さ（`wey`、約5ポンド）で買い、赤いガラスは2シリング2ペンス、青は3シリングだった。6ペンスが重さ1単位の値段かは、はっきり書かれていない。
- 1485年は[VCH Middlesex, Industries: Glass](https://www.british-history.ac.uk/vch/middx/vol2/pp155-158)。イングランドのガラスは板が小さかったとされる。1フィート（約0.09 m²）の板ガラスは、厚さ2.5 mmで約0.6 kgとした。
- 1687年は[Olive R. Jones, Cylindrical English Wine and Beer Bottles](https://secure-sha.org/assets/documents/Cylindrical%20English%20Wine%20and%20Beer%20Bottles%20-%20English.pdf)。ガラスのクォートの瓶は、1671年の4シリングから1687年の2シリング6ペンスに下がった。
- 瓶は1つ約1 kg（[Dungworth 2012](https://www.researchgate.net/publication/274508915_Three_and_a_half_centuries_of_bottle_manufacture)）。1690〜1700年の瓶に859 gのものがある（[PAS](https://commons.wikimedia.org/wiki/File:A_Post_Medieval_glass_wine_bottle_dating_from_AD_1690-1700._(FindID_891131)_(cropped).jpg)）。
- 小麦は、1350年代と1485年が1クォーター約6シリング（1 kg約0.33ペンス）。1690年代は1ブッシェル3.1〜4.5シリング（1クォーター25〜36シリング、1 kg約1.4〜2.0ペンス、[Clark, The Price History of English Agriculture](https://faculty.econ.ucdavis.edu/faculty/gclark/papers/Agprice.pdf)）。

### 2.2 量

- 1695年のイングランドでは、約40の小屋が瓶を作り、年24万ダース（288万本）だった（Houghton、[Dungworth 2012](https://www.researchgate.net/publication/274508915_Three_and_a_half_centuries_of_bottle_manufacture)）。1本1 kgで約2,900 t。
  - 1696年の小屋は全部で約88〜90（[VCH Middlesex](https://www.british-history.ac.uk/vch/middx/vol2/pp155-158)、[BIAS Journal 1984](https://b-i-a-s.org.uk/wp-content/uploads/2021/01/BIAS_Journal_17_BRISTOL_GLASSMAKERS.pdf)）。
  - 人口を約520万人とすると、瓶だけで1人年約0.55 kg。1615年の木の燃料の禁止の後の、石炭の炉の時代である。
- 森のガラスの時代の小屋の数：
  - 1406年のシュペッサルトの取り決めは、約20の小屋（マインツのシュペッサルト4、リーネック1〜2、フォーゲルスベルクとレーン）に及んだ（[Partenstein](https://gbv-partenstein.de/wp-content/uploads/2011/10/glasmacher.pdf)）。
  - 1466年、カウフンゲンの森に8つの小屋（[Großalmerode](https://www.grossalmerode.de/freizeit-tourismus/tourismus/geschichte/)）。
  - ボヘミアは、1350〜1420年の文書に約21（ボヘミア11、シレジア8、モラヴィア3）、16世紀に24〜34（[bohaglass](https://www.bohaglass.co.uk/bohemian-glass-the-enduring-legacy/)、[ArchDeco](https://www.archdecotravel.com/journal/bohemian-glass-cut-and-color)、出典の弱いサイト）。
  - 1つの森に同時に動くのは、多くて2〜3の小屋だった（[Hellental](https://historisches-museum-hellental.de/glasforschung-im-umfeld-des-hellentals.html)）。
- 小屋1つの量：
  - 木材から：1 kgに約1 Rm、年2,000〜3,000 Fmで約3〜4 t（[Waldglas](https://de.wikipedia.org/wiki/Waldglas)、モデルは3.6 t）。
  - 1406年の取り決めの上限から：親方1人と下働き1人で1日に杯300個。森のガラスの杯（クラウトシュトルンク、高さ8〜11 cm）を約90 gとすると（[複製品の重さ](https://www.mittelalter-lagerbedarf.de/Glas/Trinkbecher-Krautstrunk-hoch::2121.html)）、1日27 kg、34週で約5 t。親方が何人いたかは分からない。

## 3. 比べた結果

### 3.1 値段

- モデルのガラス（1 kg約1.7ペンス、小麦の5倍）は、1485年のイングランドのガラス（約1.7ペンス、約5倍）と同じで、1350年代のチディングフォールドの白いガラス（約8倍）より少し安い。
- 値段を直して2〜11%上がっても、5.1〜5.6倍で、この間に入る。
- ノルマンディー・ヴェネツィアの良いガラス（約30倍）は、ガラスの財と分けていない。
- 1680〜90年代の瓶（小麦の約1.2〜1.8倍）は、石炭の炉と大きな小屋の後の値段で、モデルの時代より後である。

### 3.2 量

- モデルの1人あたり（年0.013〜0.022 kg）は、1690年代のイングランドの瓶（約0.55 kg）の約1/25〜1/40である。石炭の時代の前で、この差は史料の時代の差と合う。
- 森のガラスの時代とは、小屋の数で比べた。モデルの小屋は100万人に3〜5で、地図全体（2,000万人と1,000万人）に44〜60ある。
  - 史料では、シュペッサルトとフォーゲルスベルク・レーンで約20、カウフンゲンの森で8、ボヘミアで24〜34で、中部ドイツとボヘミアだけで50を超える。これらの土地の人口の史料は探していないので、1人あたりにはしなかった。
  - ガラスの土地は、遠くへ売った（1406年のシュペッサルト、ボヘミア）。地図全体の平均では、モデルの小屋の数は少なくはない。
- 小屋1つの量には、木材からの3〜4 tと、1406年の上限からの親方1組で約5 tの幅がある。親方が何組かで、量は数倍まで変わる。
- 値段を直した約20%の減りは、この幅より小さい。

### 3.3 決めたこと

- ガラスの値段の直し（アルカリの費用を全部入れる）は、そのままにする。基準の値6と、値段を直した後の値段は、中世・近世のイングランドのガラスの値段と合う。
- ガラスの量は替えない。約20%の減りは、小屋1つの量の不確かさより小さく、史料で合わせ直す根拠が無い。

## 4. 未確定事項

1. 小屋1つの量。木材からの3〜4 tと、1406年の取り決めの親方1組の上限（約5 t）が、親方の数で数倍違う。シュペッサルトの小屋の親方の数（`Stände`）の史料で決める。
2. ガラスの値打ちの分け方。ノルマンディー・ヴェネツィアの良いガラスはイングランドのガラスの約6倍で、ガラスの財は1つである。
3. 海軍の輸入（`navyImport`）が、ガラスの供給の17〜29%あった（§1）。どこから来たことにしているかは調べていない。
