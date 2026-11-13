# 靴屋の手間と人数、革の鞄・入れ物

## 1. 背景

[leather-uses-20261111.md](../analytics/leather-uses-20261111.md)で、履物を全ての人に広げた（[leather-uses.md](leather-uses.md) §4.1）。すると長靴は、見込みの需要（2102で年約100万ロット）の約5%（5.6万ロット）しか作られなかった。革の在庫は、夏の傷みで減っただけで、まだ積み上がる。

あわせて、靴のほかに、交易の品の入れ物や人々の普段の鞄として、革の需要が大きかったのではないかを調べた（§4）。

## 2. 今の決まり

| | 決まり | 1人あたりにすると |
| --- | --- | --- |
| 長靴の手間 | 1ロット（20足）に0.0202（[craftDemandCalibration.ts](../../src/extensions/economy/generators/craftDemandCalibration.ts)）。`Leather`の行の「0.00005が0.05人月」と同じ尺で、約20人月 | 靴屋1人が月に約1足 |
| 靴屋の人数 | 町の人1,000人に10〜20人、典型15人（`shoemaking`、[occupationalCalibration.ts](../../src/extensions/economy/generators/occupationalCalibration.ts)） | 町の人だけ。農村の靴屋はいない |
| 革の品の手間 | 1ロット（革1枚）に0.0101、約10人月 | 長靴の半分（仮値） |
| 革の品を作る人 | 靴屋（`shoemaking`の`goodNames`に入れた） | 帯・袋・手袋の`leatherGoods`（1,000人に3〜10人）は品を持たず、0人のまま |

靴屋15人が月に1足では、町の人1,000人に年180足しか作れない。今の決まり（町の人だけ年0.25足 = 1,000人に250足）にほぼ合わせた値で、史料の手間ではない。

## 3. 史料

- 靴屋の人数。1379〜81年のイングランドの人頭税で、町の職業の分かる納税者の3.3%、パリ1297年で3.7%、モンペリエ1435〜46年で4%が靴屋だった（[urban-craft-staffing.md](urban-craft-staffing.md) §3、E1・F1・F2）。人口1,000人に約15人で、今の値と合う。
- 靴屋の手間。腕の良い靴屋は、1日に1〜2足の靴を作れたとされる（[Bondeno](https://www.bondenoshoes.com/pages/from-artisan-bench-to-assembly-line-the-history-of-mass-produced-men-s-dress-shoes)。史料の名は無い）。18世紀には、寸法を測った靴を早ければ翌日に渡し、並の値段は職人の1日の賃金ほどだった（[Revolutionary War Journal](https://revolutionarywarjournal.com/cordwainers/)）。1日1足なら、月に約20足である。
- 革の使い道。ヨークの発掘では、作られた革の品のうち、靴が最も多い（Mould, Carlisle & Cameron, *Leather and Leatherworking in Anglo-Scandinavian and Medieval York*, AY 17/16, 2003、[PDF](https://www.collections.yorkarchaeologicaltrust.co.uk/files/original/74505/GB2837-PUB-AY-17-16_Leather-and-leatherworking-in-Anglo-Scandinavian-and-Medieval-York_Q-Mould-Ian-Carlisle-and-E-Cameron.pdf)）。ほかは小刀の鞘・剣の鞘・帯・財布などである。18世紀のイングランドで靴が革の60〜70%を使った（Riello）こととも合う。
- ヨークの皮革の市民（1301〜50年）は、靴屋34.8%・なめし25.1%・毛皮13.8%・帯11.1%・鞍6.5%・手袋5.1%・袋0.4%だった（Swanson、urban-craft-staffing.md §3）。袋屋は靴屋の約1%しかいない。

## 4. 鞄・入れ物の需要

史料からは、交易の入れ物の主は革ではなかった。

- 液体：樽・壺・瓶（[returnable-drink-containers.md](returnable-drink-containers.md)）。革の瓶（costrel）・桶・水差しは家と旅で普段に使われ、内側に松脂を塗った（[TheGenealogist](https://www.thegenealogist.co.uk/featuredarticles/discover-your-ancestors/periodical/92/history-in-the-details-materials---leather-part-3-3971/)）。
- スペインでは、ワインを山羊の皮袋（cuero・odre）に入れて陸を運んだ。1529年のヴァイディッツの絵には「トレドのワインは山羊の皮袋でこう運ばれる」とある（[hogsheadwine](https://hogsheadwine.wordpress.com/2014/12/15/goatskins-of-wine-in-a-cart-and-on-the-back-of-a-slave-from-christoph-weiditzs-das-trachtenbuch-1529/)、[Wein.plus](https://glossary.wein.plus/wineskin)）。海では樽だった。山羊の皮で、牛の皮ではない。
- 乾いた品：穀物・羊毛は麻の袋・粗布の包み、ほかに籠と樽である。革で包むのは、傷みやすい品を守る時だけだった（[Battlemerchant](https://www.battlemerchant.com/en/blog/authentic-leather-in-medieval-re-enactment-use-and-historical-accuracy)。一般向けの記事）。
- 普段の鞄・財布・帯・手袋は、今の「革の品」（leather-uses.md §4.2）に入っている。袋屋が少ないこと（§3）から、鞄は帯・手袋より小さい。

数の分かる史料は見つからなかった。履物と革の品のほかに、新しい鞄の需要は置かない。山羊の皮袋は、羊・山羊の皮を財にする時（leather-uses.md §8の2）に、ワインの陸の入れ物として考える（§8の2）。

## 5. 決める仕組み（案）

### 5.1 長靴の手間

- 長靴の手間を、1ロット20足に1人月（靴屋1人が1日に約1足、月20日働く）とする。尺の値は0.001である。
- 設定`bootsLabor`を置く。既定は`perDay`（1日1足）、今の決まりは`legacy`（月1足）。

### 5.2 革の品を帯・袋・手袋の職人に

- 革の品を、`shoemaking`から`leatherGoods`（1,000人に3〜10人、典型7人）の`goodNames`へ移す。設計の誤りの直しなので、前の割り当ては残さない。
- 革の品の手間を、革1枚に0.25人月（尺の値0.00025）とする。帯・財布・手袋・水袋は、1枚の革から何日かで作れる（仮値）。典型7人で、町の人1,000人に年約340枚を作れる。見込みの需要は、町の人1,000人あたり、町と農村の人で年約500枚である（§6）。

### 5.3 農村の靴屋

- 中世の村にも靴屋がいた。人頭税の村の職業の数は、まだ集めていない（§8の1）。
- `footwearDemand`が`everyone`の時、市場の靴屋の人数に、農村の人1,000人に2人（設定`ruralShoemakersPerThousand`、既定2、仮値）を足す。農村の人の分の履物を作る手を、町の工房の人数として数える。
- 農村の人の残りの履物は、木靴・自家製の皮の靴で、市場の革を使わないとみなす（需要を作れる量で切る。値段が上がり、作れない分は満たされない）。

## 6. 釣り合いの見込み（2102）

| | 人 | 年の作れる量 | 革 |
| --- | ---: | ---: | ---: |
| 町の靴屋（1,000人に15人） | 3.0万 | 720万足 | 72万枚 |
| 農村の靴屋（1,000人に2人） | 3.7万 | 880万足 | 88万枚 |
| 履物の需要（1人1足） | | 2,030万足 | 203万枚 |
| 革の品の職人（1,000人に7人） | 1.4万 | 68万枚 | 68万枚 |
| 革の品の需要 | | 102万枚 | 102万枚 |
| 使う革の合計 | | | 228万枚（出る皮290万の約8割） |

作れる履物は需要の約8割で、足りない分で値段が上がる。残る皮（約60万）と夏の傷み（今は年約146万）で、在庫は積み上がらない見込みである。夏の傷み（`summerHideLoss` 0.1）が大きすぎるかは、計測で見る（§8の3）。

## 7. 計測の計画

北緯30°の地図2枚（2102・2103）、36か月、戦争なし・隊商の略奪なし。[leather-uses-20261111.md](../analytics/leather-uses-20261111.md)のnewと比べる。

1. 長靴・革の品の作った量と、見込みの需要に対する割合、値段。
2. 革の在庫・値段・出入り。夏の傷みの量。
3. 靴屋と帯・袋・手袋の職人の人数、町の家計・農村の家計のお金。

## 8. 未確定事項

1. 中世の村の靴屋の人数（人頭税の村の職業）と、農村の自家製の履物の割合。
2. 山羊の皮袋（ワインの陸の入れ物）。羊・山羊の皮を財にする時に考える。
3. 夏の傷みの割合。履物が作られた後に、もう一度決める。
4. 革の値段が在庫で下がらない理由（元値の付け方）。

## 9. 結果

[footwear-capacity-20261111.md](../analytics/footwear-capacity-20261111.md)。長靴は約4倍作られ、見込みの需要の23〜27%になった。革の在庫の増えはあまり減らなかった。町の家計と町の金庫が約7割減り、長靴・革の品は在庫が約1年分あっても値段が基の値の2.4〜2.7倍で下がらない。
