# 痩せた家畜（2026-11-16）

## 1. 目的

冬の餌の不足のうち、干し草・穀物で埋まらない分（[livestock-feed-shortfall.md](livestock-feed-shortfall.md)）を、家畜の体の側で受ける。今の決まりでは、足りない月には、その月の乳と羊毛だけが減る（`getLivestockFeedCoverage`）。締めた家畜の肉と獣脂は1頭あたり一定で、足りなかった冬の跡が残らない。

## 2. 仕組み

1. 土地ごとに、食べられなかった餌の借り（`leanDeficitKg`、干し草の乾物）を持つ。毎月、その月の不足を足す。上限は体の蓄え（`leanReserveMonths`か月分の餌、仮値2）。蓄えを超える分は、次の作業（締め・死）で扱う。
2. 痩せた家畜は、刈らずに残った草（その月の`unharvestedKg`）を余分に食べて身を戻す。1か月に戻すのは、1か月の餌の`leanRefeedShare`（仮値0.3）まで。春以降の草の多い月に戻る。
3. 市場で締めた家畜の肉と獣脂は、その市場の土地の使った蓄えの割合（その月の餌の量で重みづけ）に`leanMaxCarcassLoss`（仮値0.25）を掛けた分だけ減る。皮と凝乳酵素は減らない。
4. 値が下がる形は、1頭から取れる肉・獣脂が減ることで表す。生きた家畜の値段そのものは、市場の需給で決まり、ここでは変えない。

## 3. 値の根拠

- 仮値で、史料との照合はまだない。前近代の家畜は、冬の終わりに体重の2〜3割を落とすことがあった（春に自分で立てない牛を牧草地へ運んだ、という言い伝え）。0.25はこの幅に置いた。
- 蓄えの2か月は、足りない分が2か月分の餌に届いたら、体の蓄えを使い切ったと見る置き方である。

## 4. 設定（Simulation settings）

| 設定 | 既定 | 選べる値 |
| --- | --- | --- |
| `leanCondition` | `carcass`（肉が減る） | `off`（前の決まり） |
| `leanReserveMonths` | 2 | 0.5〜4 |
| `leanMaxCarcassLoss` | 0.25 | 0〜0.5 |
| `leanRefeedShare` | 0.3 | 0〜1 |
| `leanCull` | `unfed`（足りない分を売る） | `off` |
| `leanCullThreshold` | 0.25 | 0〜1 |
| `leanDeaths` | `die`（死ぬ） | `off`（蓄えで止まる） |
| `leanMilkLoss` | 0.5 | 0〜1（0は前の決まり） |

## 5. 見込み

餌の不足は、今の既定で1年の必要量の約0.1%で、2〜4月の一部の市場に集まる。（結果は[記録](../analytics/livestock-lean-condition-20261116.md)：世界で0.02%以下、市場で最大1.6%）世界の肉・獣脂の減りは0.05%以下、足りない市場（2102の市場12など）では春に数%と見込む。借りは5〜7月の草で戻り、夏には0に近づく。

## 6. 残り

- 羊毛は、足りない月だけ減る。
- 冬の屠畜の実験（`winterSlaughter.ts`）の枝肉には効かせていない。
- 足りない月の飼料の予算（[livestock-feed-shortfall.md](livestock-feed-shortfall.md) §10）を、肉の減りと比べて決める。

## 7. 締めと餓え死に（2026-11-16）

1. 売る（`leanCull` unfed）：痩せた土地の借りが体の蓄えの`leanCullThreshold`（仮値0.25、蓄え2か月なら半月分の餌）を超えたら、その月の餌で足りなかった割合の頭数を、次の月の売りに足す。売りの数は、年の増えた分を売る数と、この数の大きい方。売った家畜は今までどおり市場で締め、痩せの分だけ肉が減る。
2. 死ぬ（`leanDeaths` die）：借りが体の蓄えを超えたら、超えた分（蓄えに対する割合）だけ、土地の全ての群れの頭数が死ぬ。死んだ家畜は肉にも皮にもならない。生き残りの借りは蓄えまでで、死んだ分だけ減る。
3. 売り・死・ほかの売りで頭数が減ると、借りもその分減る（前の月の餌の量に対する今の月の餌の量で掛ける）。痩せた家畜を売れば、その身の借りは持ち去られる。
4. 前の決まりは、`leanCull` off・`leanDeaths` off（借りは蓄えで止まる）で選べる。

見込み：売り始めるのは借りが1か月の餌の半分を超えた土地だけで、2102の4月の不足は市場の1か月の餌の約7%なので、売りの起きる土地は10以下、死は0。

結果（[記録](../analytics/livestock-lean-condition-20261116.md)§3）：2102の30か月で、死は0。売りは27か月目（3〜4月の二月続けて足りない）の8つの土地で、群れの約0.05%。次の月の肉は+1.7%、借りはoffの約7割。

## 8. 痩せている間の乳（2026-11-16）

乳は、足りない月の減り（`getLivestockFeedCoverage`）に加えて、使った体の蓄えの割合に`leanMilkLoss`（仮値0.5）を掛けた分だけ減り、食べ戻すまで続く（`getLeanMilkFactor`）。0は前の決まり。仮値で、史料との照合は無い。

## 9. 史料との照合（2026-11-16）

ウェブで探した範囲（下の資料）で、仮値ごとに次のとおり。値は変えていない。

| 値 | 仮値 | 見つかったもの | 判断 |
| --- | --- | --- | --- |
| `leanMaxCarcassLoss` | 0.25 | 中世の数値は無い。中世の家畜は春にはやせていた（一般向けの記事）。フィンランド中世の骨の同位体で、干し草が不作の年に飢えの跡（Bläuer）。現代の改良されていない牛の近い例：中国のヤクで、11月から5月に体重が29〜34%減る | 幅の中に置ける。体重の減りで、枝肉の減りではない |
| `leanReserveMonths` | 2 | 見つからない | 仮値のまま |
| `leanRefeedShare` | 0.3 | 見つからない | 仮値のまま |
| `leanCullThreshold` | 0.25 | 大飢饉（1315〜17年）で、1度の不作で蓄えが尽き、2度目で畑を耕す家畜を売った、という流れ（二次の記事）。売り始めの量の数値は無い | 決まりの形（不作が重なって売る）とは合う。数値は仮値のまま |
| `leanDeaths` | 蓄えを超えた分 | 現代のカナダで、冬の死が10%を超える群れは晩冬・早春に見つかる。アムステルダム島の野生の牛約1,000頭で、牧草を断たれ30%が飢え死に。1319〜20年の牛疫（病気）で牛の約3分の2が死んだ | 晩冬・早春に死ぬ形は合う。割合の根拠にはならない |
| `leanMilkLoss` | 0.5 | 見つからない | 仮値のまま |
| `feedCrisisCashShare` | 0.15 | 見つからない | 仮値のまま |
| 干し草1 load | 約915 kg | 1796年の法（36 Geo. III c. 88、ロンドンとその30マイル内）：1 load＝36 trusses、古い干し草1 truss 56 lb（1 load 18 cwt≈914 kg）、新しい干し草60 lb（19 cwt 32 lb≈980 kg）。より前の法（ウィリアム3世・メアリー2世、ジョージ2世）もtrussの重さを決めていた。Zupko（*A Dictionary of Weights and Measures for the British Isles*, 1985, sv load・truss）は、中世の末と近世の初めには干し草1 loadが18 cwt（2016 lb≈914 kg）＝36 trusses×56 lbの決まった量だったとし、Hall（c1590）「36 trusses makith a loade of haye, and euery trusse is 56 poundes」、1665年の決まりを引く。より古い例（c1440 Scrope「1 lode hey」）は重さを書かない。loadは本来、車1台の積荷で、品・車・道で変わった | 915 kgは中世の末（Hall c1590）まで遡る決まった量である。1259〜1400年（Rogersの平均の期間）に同じ重さだったかは確かめられない（[fodder-value.md](fodder-value.md) §3） |

資料：

- Medievalists.net, "Nasty, Brutish and Short: The Lives of Cattle and Sheep in Medieval Finland"（Bläuer）：https://www.medievalists.net/2017/03/nasty-brutish-short-lives-cattle-sheep-medieval-finland/
- ヤクの体重の季節の変化（PMC3474572）：https://pmc.ncbi.nlm.nih.gov/articles/PMC3474572
- Oregon State University Extension, "Late winter can be a perilous time for livestock"：https://extension.oregonstate.edu/animals-livestock/beef/late-winter-can-be-perilous-time-livestock
- "Unheard of Among Living Men: The Great Famine 1315-1322"：https://viatorinterra.substack.com/p/unheard-of-among-living-men-the-great-7af
- Wikipedia, "Great Bovine Pestilence"：https://en.wikipedia.org/wiki/Great_Bovine_Pestilence
- Wikipedia, "Truss (unit)"：https://en.wikipedia.org/wiki/Truss_(unit)
- Sizes.com, "truss"：https://www.sizes.com/units/truss.htm

探していないもの：Trow-Smith, *A History of British Livestock Husbandry*、Kershaw, "The Great Famine and Agrarian Crisis in England 1315–1322"、荘園の会計の家畜の死（murrain）の記録、Zupkoの度量衡の辞典（中世のload）。
