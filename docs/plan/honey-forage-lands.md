# 蜂蜜が取れる土地

## 1. 背景

木の無い土地の町のエールの代わりに、蜂蜜酒（Mead）を足す予定である（[low-habitability-site-bonus.md](low-habitability-site-bonus.md)§6の2）。その前に、蜂蜜（Honey）が取れる土地を調べた。

- 今の蜂蜜は、`biomeOutputByTag: { forest: 0.04 }`で、森のバイオームだけで取れる。
  - 単位: 農村の人1,000人あたり、月に0.04樽（1樽168 kg）。年に約81 kg。
  - 計測では、森のバイオームで農村の人1人あたり年に約0.1 kg（[honey-biome-20261107.md](../analytics/honey-biome-20261107.md)）。
- 草原・寒冷ステップ・荒れ地・地中海の林と低木地・乾燥低木地・火山の土では、蜂蜜が取れない。

## 2. 史料

| 史料 | 内容 |
| --- | --- |
| [Medievalists.net、Sapoznikの研究の紹介（2023）](https://www.medievalists.net/2023/04/honey-trade-was-widespread-in-late-medieval-europe-study-finds/) | 中世の終わりの蜂蜜の産地は、イベリアとバルト海沿岸の2つである。カスティーリャの中央には大きな養蜂場があった。エルベ川の東の森では、木の洞で蜂を飼った。イングランドは藁の巣箱（skep）、ドイツ西部とフランスは丸太の巣箱を使った。花や香草の土地の蜂蜜が、遠くへ売られた。 |
| [Encyclopedia of Ukraine「Beekeeping」](https://www.encyclopediaofukraine.com/display.asp?linkpath=pages%5CB%5CE%5CBeekeeping.htm) | 養蜂がいちばん盛んなのは森林ステップで、巣箱のほぼ半分がある。ステップにも1/3以上がある（1975年）。1910年に9県で160万の巣箱。16〜17世紀は、蜂蜜の多くを飲み物にした。 |
| [Heideimkerei（Wikipedia de）](https://de.wikipedia.org/wiki/Heideimkerei) | リューネブルクの荒れ地では、中世から19世紀まで、ヒースの花で蜂を飼った。ほとんどの農家に蜂の囲いがあった。蜂蜜・蜜蝋・羊毛が、荒れ地の農家の大事な産物だった。 |
| [Catastro de Ensenadaの研究（Historia Agraria）](https://historiaagraria.com/ARTICULO/90/RHA90_copena.htm) | 1750年代のガリシアに36万6千以上の巣箱。アストゥリアスに6万5,813。 |
| [Vecindario de Ensenada（Modernalia）](https://www.modernalia.es/items/show/1356) | 1752年のガリシアの俗人は129万9,312人。巣箱は1人あたり約0.28（計算）。 |
| [Eva Crane Trust「Early English beekeeping」](https://www.evacranetrust.org/uploads/document/400fe90f27902b22bd24552c495914998fc978c5.pdf)（検索結果の要約による） | 13世紀の『Hosebonderie』では、よく手入れした巣箱1つと分かれた群れで、年に約1ガロン（6.4 kg）。正味は約5.5 kg。 |
| [Honey revisited（British Journal of Nutrition, 1996）](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/089AA277548E5093AD47B5BF119F2456/S0007114596000554a.pdf/honey-revisited-a-reappraisal-of-honey-in-pre-industrial-diets.pdf)（検索結果の要約による） | 中世イングランドの1人あたりの蜂蜜は、Craneの推測で年約2 kg。Alice de Bryeneの家（1412〜13年、40人）は年0.3 kg。Domesdayは領主の巣箱しか数えていない。 |
| [Sapoznik「Bees in the medieval economy」](https://kclpure.kcl.ac.uk/ws/files/88269533/Bees_in_the_medieval_economy_SAPOZNIK_Accepted21February2018_GREEN_AAM.pdf)（検索結果の要約による） | 小さな農家の家計で、蜂は大事だった。蜂を飼う人1人あたり2.4〜2.8の巣箱（Aswardhurnは31人で86、Chalkは115人で277。計算）。 |

史料に無いもの:

- 泥炭地・湿原・ツンドラ・砂漠の蜂蜜。
  - アイスランド・シェトランド・ヘブリディーズは、蜂の居ない土地として扱った（low-habitability-site-bonus.md§2の乳の飲み物）。
  - スコットランドの荒れ地の蜂は、養蜂家が運んで来たものである。

## 3. 変更

蜂蜜が取れる土地を、森・草原・低木地・耕地のタグに広げる。

| タグ | 当たるバイオーム | 根拠 |
| --- | --- | --- |
| forest（今のまま） | 森のバイオーム（タイガ・マングローブを含む） | エルベ川の東の森、ポーランド・リトアニアの木の洞の養蜂 |
| grassland | 草原、サバンナ、寒冷ステップ、荒れ地 | ウクライナの森林ステップとステップ、リューネブルクの荒れ地 |
| scrub | 地中海の林と低木地、乾燥低木地 | イベリア（カスティーリャの中央の養蜂場） |
| arable | 火山の土（ほかの耕地のバイオームは、上のタグのどれかを持つ） | イングランドの農家の巣箱 |

- 量は、どのタグも今の森の量（月0.04樽/1,000人）と同じにする。
  - バイオームの間で量の違いを付けられる史料は、まだ無い。
- 地図の上の特産のセル（`distribution`）も、同じ4つのタグにする。
- 湿地・泥炭地・ツンドラ・砂漠・氷河・溶岩の土地では、取れないままにする。
- 保存した地図: `migrateHoneyForageLands`で、蜂蜜が今の既定（森だけ、0.04）のままなら、新しい既定にする。Goods editorで変えたものは変えない。

## 4. 結果

[honey-biome-20261107.md](../analytics/honey-biome-20261107.md)（site-bonus-20261107のH = 25の地図4枚、始まりの時点）:

- 寒冷ステップ・草原・荒れ地・乾燥低木地・火山の土で、農村の人1人あたり年約0.08〜0.09 kgの蜂蜜が取れるようになった。
- 世界の蜂蜜は、年2,270 tから2,872 t（1.27倍）になった。
- 泥炭地・湿地は0のままである。泥炭地の市場の町のエールの不足は、蜂蜜酒では埋まらない。

## 5. 未確定事項

1. 量そのもの。
   - 今は、農村の人1人あたり年約0.1 kgである。
   - 史料の目安は、ガリシアで1人あたり約1.5 kg（0.28巣箱 × 5.5 kg）、Craneの推測で約2 kgである。今の量は約1/15〜1/20になる。
   - 蜂蜜酒の流通量と合わせて決める（次の作業）。
2. 地中海・ステップの量を森より多くするか。イベリアとウクライナの森林ステップは、主な産地だった。
3. 蜂蜜酒の器（樽か陶器か）と、寒い土地の粘土。
