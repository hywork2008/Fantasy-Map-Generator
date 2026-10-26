# 穀物の保存期間と市場在庫の年齢区分

## 0. 決定記録

**2026-10-18 起案**: [megacity-food-import-economy.md](megacity-food-import-economy.md) の Food Ledger は、市場の穀物を3か月刻みの3区分（Age0〜Age2、計9か月）で持ち、9か月を超えた残りと在庫上限（年間需要の9か月分）を超えた分を `storageOverflow` へ捨てている。この9か月は「中世は長く保存できない」「1年で食べきる」「収穫前にはほとんど食べ尽くしている」という指示から AI が導いた値で、史料に基づいていない。本書は史料を確認したうえで、区分と上限を作り直す。

**2026-10-18 実装**: §3.1〜§3.5 を実装した（[grainStorage.ts](/src/extensions/economy/generators/grainStorage.ts)、foodProduction.ts、stapleCropInventory.ts ほか）。`stateFoodReserve` はコードにまだ存在しないため、§3.2 の国家の備蓄の変更は、それを実装する時に本書に従う。輸出の余裕（§3.5）は、四半期の作物暦を先読みする代わりに、農家が各月に売りに出した量を1年分記録した `offeredIntakeByMonth` から求める。1年分がそろうまでは3か月分とする。

**2026-10-18 計測（seed 101・102・103、15年分、5〜15年目、修正前 → 修正後）**

| 項目 | 101 | 102 | 103 |
| --- | --- | --- | --- |
| `storageOverflow` ÷ 都市の需要の3か月分 | 50 → 0.1 | 33 → 0.0 | 52 → 0.1 |
| 1月に在庫が1か月分未満の市場 | 28% → 28% | 83% → 66% | 3% → 2% |
| 1月に価格が上限の市場 | 53% → 49% | 93% → 75% | 33% → 28% |
| 持ち越し（Age3）÷ 都市の需要の3か月分（1月） | 0 → 2.4 | 0 → 2.0 | 0 → 2.4 |
| 四半期の傷み | 0 → 1.0〜4.0% | 0 → 0.3〜2.5% | 0 → 1.6〜2.9% |

overflow が溜まり続ける問題はなくなり、持ち越しも生まれた。一方、seed 102 の端境期の品切れは残っている。在庫が尽きる市場では、農家が売りに出した量をすべて買っても、売れ残り（`unsoldHarvest`）が0になっている。需要の大部分は都市ではなく、自分の蓄えを食べ尽くした農家の買い戻し（`ruralMarketDraw`）だった。つまり、残る不足の原因は保存期間ではなく、農村の生産と農村の需要の釣り合いである。

## 1. 計測で見えた問題（seed 101・102・103、K=16、15年分）

| 項目 | 結果 |
| --- | --- |
| 都市の需要 ÷ 農村の需要 | 2.6〜3.9%。後背地の穀物は足りている |
| seed 102: 1月の市場在庫 ÷ 都市の需要の3か月分 | 0.11（93%の市場で価格が上限2.0） |
| seed 102: 4月の同じ値 | 14.1（収穫の直後は余っている） |
| `storageOverflow` | 3つの seed とも単調に増え、都市の需要の約33〜53四半期分 |

原因は次の3つである。

1. **(a) 買った分をその場で捨てる**: 買い付けの量は「9か月分の上限 − 手持ち ＋ 今期の消費」だが、直後の上限処理が9か月分へ切り詰める。今期の消費分は代金を払ったのに、入荷と同時に `storageOverflow` になる（[foodProduction.ts](/src/extensions/economy/generators/foodProduction.ts) の `generateQuarterlyLedger` と `applyStorageCap`）。
2. **(b) 年1回の収穫が1年持たない**: 4月に買った穀物は Age0 → Age1 → Age2 と進み、翌年1月に捨てられる。上限も9か月分なので、収穫が年1回の土地では1〜3月が構造的に空になる。
3. **(c) 捨てた穀物が減らない**: `storageOverflow` は製粉所の消費でしか減らず、表に出す在庫（`exportable + storageOverflow`）を水増ししている。

都市の規模と農地の釣り合い（[agriculturalLandUse.ts](/src/extensions/economy/generators/agriculturalLandUse.ts)、都市人口の上限）は原因ではない。

## 2. 史料の確認

### 2.1 「収穫前に食べ尽くす」は「1年分を持つ」という意味

- 中世北欧の穀物は、脱穀前の束のまま納屋や稲むらに置き、冬から春にかけて少しずつ脱穀した。束で置く方法が北欧の標準で、脱穀後は穀物庫に移した（Doherty 2023, *Medieval Archaeology*、Patcham 荘園）。穀物は収穫から次の収穫まで、少しずつ取り崩して食べた。
- 「端境期（hungry gap）」は、前年の穀物が次の収穫の直前、夏になって尽きることを指す（Weald & Downland、Piers Plowman 研究）。在庫が9か月で尽きるのではなく、**11〜12か月目に尽きかける**状態である。
- 中世イングランドの農家は、金利が高かったため、穀物を2年続けて持ち越すことは少なかった（McCloskey & Nash 1984, "Corn at Interest", AER 74(1)）。2人は保管の費用の主な部分は物理的な傷みではなく金利だとし、「収穫後の1年で食べるための保管」と「次の年以降へ持ち越す保管（carry-over）」を区別している。
- 18世紀末〜19世紀前半のイングランドでは、ほぼ毎年、次の収穫の後まで少し持ち越していた。古い小麦は新しい小麦より高く売れた（Brunt & Cannon、Whitaker 農場 1810〜1846年）。

**結論**: 普通の年は「次の収穫まで12か月分を持ち、少し持ち越す」。何年分も貯めるのは、国家の穀物庫や豊作の後の例外である。9か月で捨てる設定は短すぎる。

### 2.2 物理的な傷みは小さい

- 伝統的な農家の貯蔵での損失は、1回の保管期間でおおむね5%未満（FAO, *Grain storage techniques*）。
- マラウイ南部では、最長10か月の保管でトウモロコシ3%以下、モロコシ2%未満だった。月あたり0.2〜0.3%にあたる（Greenwich 大学 Tropical Stored Products Centre）。
- ケニアでは、9か月以内の保管で1.7〜5.5%だった（Tyler 1982 を引いた FAO の表）。
- ネズミによる損失は、米国1925年の調査で年5.5%、ケニア2018年の調査で3か月に2.2〜6.9%。
- 損失が大きくなるのは、虫に弱い改良品種（20〜25%超）や、乾燥が不十分な場合である。

**結論**: 期限で一度に捨てるより、四半期ごとに少しずつ傷む方が史料に合う。傷みは年4〜8%程度。高温で湿った土地では大きくし、古い穀物ほど少し大きくする。

### 2.3 赤道直下は「通年で収穫できる」わけではない

- 赤道付近の東アフリカでは雨季が年2回ある。3〜5月の長雨季と10〜12月の短雨季で、間に6〜9月の乾季と1〜2月の短い乾季がある。主な作付けは長雨季である。雨水に頼る作物は年1〜2回の収穫で、毎月は取れない。
- FAO の農業生態ゾーン区分は、生育できる期間を温度と水の両方で決める。熱帯でも乾季は生育を止める。
- これは [seasonal-crop-calendars.md](seasonal-crop-calendars.md) がすでに採用しており、作物暦（`getCropHarvestWeight`）にも入っている。灌漑した短期作物だけが通年で収穫できる。
- 一方、Food Ledger の設計（megacity-food-import-economy.md §163、§177、§217）には、「赤道直下は四半期の供給が均等なので、3か月分の在庫で足りる」という古い前提が残っている。

**結論**: 赤道付近でも、在庫は次の収穫まで持つ必要がある。年2回の収穫なら約6か月分、年1回なら約12か月分である。保管の長さを緯度で決めず、その市場の実際の収穫暦で決める。高温で湿った土地では保管が短くなるのではなく、傷みが大きくなる（2.2）。

## 3. 設計

### 3.1 年齢区分を4つにし、最後の区分は期限なしで傷ませる

| 区分 | 期間 | 扱い |
| --- | --- | --- |
| Age0 | 0〜3か月 | 新しく買った分と輸入した分が入る |
| Age1 | 3〜6か月 | |
| Age2 | 6〜9か月 | |
| **Age3（新設）** | **9か月〜** | Age2 から移った分を足していく。期限で捨てない |

- 消費・輸出・略奪の順番は Age3 → Age2 → Age1 → Age0 の FIFO とする。
- 区分ごとに数量と平均の仕入れ単価を持ち、それぞれ傷む。今の Age2 → overflow を Age2 → Age3 に置き換える。
- Age4 以降は作らない。2年以上の持ち越しはまれで（McCloskey & Nash）、決めているのは金利という経済の事情である。区分を増やしても挙動はほとんど変わらず、保存データだけが増える。何年分も貯めるのは国家の穀物庫で、それは別の仕組み（`stateFoodReserve`）が担う。

### 3.2 少しずつ傷む

毎四半期の初め、区分を進める前に、各区分を次の割合だけ減らす。

```text
lossShare(age) = BASE_QUARTERLY_LOSS × climateLossMultiplier × ageLossMultiplier(age)
```

| 定数 | 出発値 | 根拠 |
| --- | --- | --- |
| `BASE_QUARTERLY_LOSS` | 0.015（年に約6%） | 2.2 の、1回の保管期間で5%未満とネズミの損失 |
| `ageLossMultiplier` | Age0〜2 は 1.0、Age3 は 2.0 | 持ち越した穀物は虫が増えて品質も落ちる。年12%相当の速さになり、持ち越しは自然に細る |
| `climateLossMultiplier` | 寒冷 0.7、温帯 1.0、暖かい 1.3、熱帯で湿潤 2.0 | 高温多湿で虫とカビが増える（FAO）。市場の中心セルの `seasonality`・`waterRegime` に合わせる |

- 傷んだ分は記録だけして、お金は動かさない。原価は残った分に乗ったまま（区分ごとの平均単価は変えない）。
- 国家の備蓄（`stateFoodReserve`）も同じ4区分と傷み方にそろえ、9か月で捨てる処理をやめる。

### 3.3 在庫の上限を「次の収穫まで」にそろえる

- `STORAGE_CAP_MONTHS` は 9 から **12** にする。
- 上限で切り詰めるのは **今期の消費分を足した量** とし、買い付けの式（上限 − 手持ち ＋ 今期の消費）と一致させる。これで不具合 (a) がなくなる。
- 上限を超えた分は、今どおり安い輸出の候補にする（megacity §396）。

### 3.4 `storageOverflow` を傷ませ、表の在庫から外す

- 屋外に積んだ余りとみなし、毎四半期 25% を傷ませる。製粉所と安値輸出は今どおり先に使える。
- 都市の小売・価格・見かけの在庫（`market.goods[Grain].stock`）には数えない。数えるのは `exportable` だけにする。

### 3.5 価格と輸出の余裕を、実際の収穫暦で決める

- `EXPORT_RESERVE_MONTHS = 3` は「赤道直下は四半期の供給が均等」が根拠だった。これを「その市場の作物暦で、次の主な収穫までの月数」に置き換える。
  - 年1回の収穫の市場は、収穫の直後に最大で約12か月分を残す。年2回なら約6か月分。灌漑した通年の作物だけの市場は3か月分。
- 価格の `coverageRatio`（megacity §177）は今の決定のまま、次の主な収穫までの供給予定と需要の比で決める。
  - 「完全に均等な赤道型の地図」という例外は、§2.3 の作物暦が均等になった場合にだけ使う。

## 4. 影響と移行

- `FoodLedger` に `foodStockAge3` と `foodStockAge3UnitCost` を足す（[marketTypes.ts](/src/extensions/economy/generators/marketTypes.ts)）。作物ごとの在庫（`stapleCropInventory.ts`）にも age3 を足す。`foodStockAge2` を参照するファイル約10個に Age3 を加える。
- 旧セーブは Age3 = 0 で読み込む。今ある `storageOverflow` はそのまま残し、3.4 の傷みで数年かけて減る。
- 旧セーブでも動きが変わるので、Node 用の基準データを更新する（`npm run test:sim-golden -- --env node --update`）。
- 確かめること（seed 101・102・103、15年分）
  - 1月に市場在庫が尽きる市場の割合。目標は1割未満（不作の年を除く）。
  - 価格が上限に張り付く市場の割合。
  - `storageOverflow` が頭打ちになるか。
  - 都市の食費の充足率、家計の手元のお金（年間の食費の何か月分か、目標3〜6）。

## 5. 実装の順序

1. 3.3（上限の式を買い付けとそろえる）。不具合 (a) の修正で、単独で入れられる。
2. 3.1・3.2（Age3 と傷み）と、国家の備蓄の同じ変更。
3. 3.4（`storageOverflow` の傷みと、表の在庫から外す）。
4. 3.5（輸出の余裕を作物暦で決める）。megacity-food-import-economy.md の §157・§163・§225・§227・§328 に、本書へ置き換えたことを追記する。

## 6. 出典

- McCloskey, D. N. & Nash, J. (1984) "Corn at Interest: The Extent and Cost of Grain Storage in Medieval England", *American Economic Review* 74(1): 174–187. <https://deirdremccloskey.com/docs/graham/nash.pdf>
- Brunt, L. & Cannon, E. "English farmers' wheat storage and sales in the late eighteenth and early nineteenth centuries", Economic History Society. <https://ehs.org.uk/english-farmers-wheat-storage-and-sales-in-the-late-eighteenth-and-early-nineteenth-centuries/>
- Doherty, A. (2023) Patcham 荘園の納屋の研究, *Medieval Archaeology*. <https://independent.academia.edu/AnnaDoherty16>
- Weald & Downland Living Museum "The Hunger Gap". <https://www.wealddown.co.uk/museum-news/the-hunger-gap/>
- FAO, *Grain storage techniques*, Chapter 1. <https://www.fao.org/4/x2230E/x2230e04.htm>
- Tropical Stored Products Centre, "A practical appraisal of on-farm storage"（Malawi）. <https://gala.gre.ac.uk/id/eprint/10790/>
- FAO, *Post-harvest losses*, Chapter 6. <https://www.fao.org/4/W1544E/W1544E05.htm>
- Eastern African rainfall variability（長雨季・短雨季）. <https://www.oxfordmartin.ox.ac.uk/publications/drivers-and-impacts-of-eastern-african-rainfall-variability>
- Campbell ほか (2011) "Harvest Shortfalls, Grain Prices, and Famines in Preindustrial England", *Journal of Economic History*. <https://pure.qub.ac.uk/en/publications/harvest-shortfalls-grain-prices-and-famines-in-preindustrial-engl/>
