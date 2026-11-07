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
| [Eva Crane Trust「Early English beekeeping」](https://www.evacranetrust.org/uploads/document/400fe90f27902b22bd24552c495914998fc978c5.pdf)（Local Historian 29(3), 1999） | 13世紀の『Hosebonderie』では、よく手入れした巣箱1つと分かれた群れで、年に約1ガロン（6.4 kg）。正味は約5.5 kg。 |
| [Honey revisited（British Journal of Nutrition, 1996）](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/089AA277548E5093AD47B5BF119F2456/S0007114596000554a.pdf/honey-revisited-a-reappraisal-of-honey-in-pre-industrial-diets.pdf) | 中世イングランドの1人あたりの蜂蜜は、Craneの推測で年約2 kg。Alice de Bryeneの家（1412〜13年、40人）は年0.3 kg。Domesdayは領主の巣箱しか数えていない。 |
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

- 量は、どのタグも同じにする（§6で月0.6樽/1,000人）。
  - バイオームの間で量の違いを付けられる史料は、まだ無い。
- 地図の上の特産のセル（`distribution`）も、同じ4つのタグにする。
- 湿地・泥炭地・ツンドラ・砂漠・氷河・溶岩の土地では、取れないままにする。
- 保存した地図: `migrateHoneyForageLands`で、蜂蜜が今の既定（森だけ、0.04）のままなら、新しい既定にする。Goods editorで変えたものは変えない。

## 4. 土地を広げた結果

[honey-biome-20261107.md](../analytics/honey-biome-20261107.md)§2（site-bonus-20261107のH = 25の地図4枚、始まりの時点、量は月0.04樽のまま）:

- 寒冷ステップ・草原・荒れ地・乾燥低木地・火山の土で、農村の人1人あたり年約0.08〜0.09 kgの蜂蜜が取れるようになった。
- 世界の蜂蜜は、年2,270 tから2,872 t（1.27倍）になった。
- 泥炭地・湿地は0のままである。泥炭地の市場の町のエールの不足は、蜂蜜酒では埋まらない。

## 5. 今の蜂蜜の使われ方

[honey-biome-20261107.md](../analytics/honey-biome-20261107.md)§3（シード2103、12か月）:

- 農村の採取は月約360樽ある。使われるのは、レシピの材料（酢・薬）の月約9樽だけである。
- 家計の需要が無い。`demandCoverage: { food: 0.5 }`の町の需要は、ほぼ0である。
- そのため在庫が積み上がり、値は値打ち（4）の1/3まで下がる。
- 量を史料まで上げるなら、使い道も史料に合わせて入れる必要がある。

## 6. 量・値・家計の蜂蜜

### 6.1 史料

| 史料 | 内容 |
| --- | --- |
| Allsop & Brand Miller「Honey revisited」（British Journal of Nutrition 75, 1996） | 砂糖の前は、蜂蜜がふつうの人の日々の甘味だった。蜂蜜はガロン・ファーキン・樽の単位で売られた。1350年ごろのイングランドで1ガロン約7ペンス（1 kg約1.3ペンス）で、同じ量のバターとほぼ同じ値、精製した砂糖の約1/30（Rogers 1866）。蜂蜜酒は、ブドウの取れない土地で17世紀まで広く飲まれた。1人あたりの量は、Crane（1975）の推測で年約2 kg、Alice de Bryeneの家（1412〜13年、40人、砂糖もあった）で0.3 kg。 |
| Crane「Early English beekeeping」（Local Historian 29(3), 1999） | 13世紀の『Hosebonderie』で、よく手入れした巣箱1つと分かれた群れで年約1ガロン（6.4 kg）、正味は約5.5 kg。蜂蜜酒は、巣から蜂蜜を取った後の巣を水に浸した液からも作った。 |
| 13〜14世紀イングランドの写本の蜂蜜酒、ポーランドの蜂蜜酒の等級（[検索の要約](http://www.greydragon.org/library/13thCenturyMead.html)） | 蜂蜜1に水4（体積）。ポーランドのczwórniakは1:3、trójniakは1:2。 |

### 6.2 決めた値

| 項目 | 前 | 後 | 根拠 |
| --- | --- | --- | --- |
| 採取（`biomeOutputByTag`の各タグ） | 月0.04樽/1,000人 | **月0.6樽/1,000人** | 農村の人1人あたり年約1.2 kg、Generic文化の1.2倍で約1.5 kg。ガリシアの1750年代（0.28巣箱/人 × 正味5.5 kg）に合わせた |
| 値（1樽168 kg） | 4 | **1.5** | 1 kgで穀物の値の3.9倍。1350年ごろ蜂蜜1ガロン7ペンス、小麦1クォーター6シリング（エールと同じ基準、[ale-cask-repricing.md](ale-cask-repricing.md)）。前の値は10.7倍だった |
| 家計の蜂蜜 | 無し | **1人あたり年1 kg**（町と農村、市場で買う） | Craneの推測2 kgと、砂糖もあった家の0.3 kgの間。採取（約1.5 kg）の残りを、蜂蜜酒・酢・薬に回すため |

- 家計の蜂蜜は、ワールドの設定`fmg-household-honey-kg`（Simulation settingsの「家計の蜂蜜 1人あたり年 kg」）にした。範囲は0〜3 kg、0は家計の蜂蜜を無くす。
- 需要は`foodProcessingLedger.ts`の`getMonthlyHouseholdDemand`の`Honey`で出し、チーズやワインと同じく市場の在庫から買う（`settleFoodProcessingHouseholds`）。
- 保存した地図:
  - 採取の量と土地は`migrateHoneyForageLands`で直す（今の既定のままの時だけ）。
  - 値は`ALE_CASK_REPRICING`の`Honey: [4, 1.5]`で、`migrateWeightRepricing`が直す。

### 6.3 計測

[honey-biome-20261107.md](../analytics/honey-biome-20261107.md)§4（シード2103・2102、12か月）:

- 1人あたりの採取は年約1.1 kg（町の人も含む。農村の人1人あたり約1.3 kg）になった。
- 家計の需要は99〜100%満たされ、家計が採取の約88%を使う。
- 残りの約11%は使い道が無く、在庫が増え、値は値打ちの約1/4（0.38〜0.39）まで下がる。この残りを蜂蜜酒の材料にする（§7の2）。

## 7. 未確定事項

1. 地中海・ステップの量を森より多くするか。イベリアとウクライナの森林ステップは、主な産地だった。
2. 蜂蜜酒（Mead）の需要と流通量。ウクライナでは16〜17世紀に蜂蜜の多くを飲み物にした（§2）。
3. 蜂蜜酒の器（樽か陶器か）と、寒い土地の粘土。
