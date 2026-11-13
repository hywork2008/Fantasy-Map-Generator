# 獣脂の蝋燭と蜜蝋の蝋燭を分ける

## 1. 背景

[household-goods-values.md](household-goods-values.md) §5.1で、蝋燭（Candles）全体を獣脂の蝋燭の値（基の値2.4）にした。蝋燭は一つの品で、作り方が油・蜜蝋・獣脂のどれでも同じ値になり、教会と貴族の蜜蝋の蝋燭も安くなっていた。また、値付けの材料の需要は作り方の初めの材料（油）を見るため、獣脂の値段に蝋燭の需要が入らなかった（[candle-demand.md](candle-demand.md) §7の4）。

## 2. 史料

- 家の灯りは獣脂の蝋燭で、教会の儀礼の蝋燭は、ずっと高い蜜蝋だった（Rogers I p.442、[Manchester Hive](https://www.manchesterhive.com/downloadpdf/view/journals/bjrl/21/1/article-p176.pdf)）。
- 1338年サマセットで獣脂の蝋燭1ポンド1.5ペンス、1374年に蜜蝋1ポンド8ペンス、蝋燭に作る手間1ポンド1ペンス（Rogers I p.449、[Medieval Prices](http://faculty.goucher.edu/eng240/medieval_prices.html)）。14世紀の蜜蝋は獣脂の17倍以上になることもあった（Caspall、[ebrary](https://ebrary.net/303692/history/artificial_lighting)）。
- 1400〜1540年、蜜蝋はほぼ宗教か王侯・貴族の家だけで使われた（Rogers、同）。

## 3. 決める仕組み

| | 獣脂の蝋燭（Tallow Candles、新しい品） | 蝋燭（Candles、蜜蝋の蝋燭） |
| --- | --- | --- |
| 作り方 | 獣脂1樽から1ブロック（100 kg） | 蜜蝋1ブロックか油1樽から1ブロック。獣脂の作り方は外す |
| 基の値 | 2.4（穀物約11 kg / kg） | 14（穀物約66 kg / kg、§2の8+1ペンス） |
| 需要 | 町と農村の家の灯り（`candleDemand`・`candleKgPerPerson`、[candle-demand.md](candle-demand.md)） | 町の人1人年0.1 kg（仮値、教会と大きな家）と、贅沢の需要 |
| 作り手 | 町の蝋燭・石鹸の職人（`chandlery`）と村の蝋燭作り | 同じ職人 |

- 品の札: 獣脂の蝋燭は札なし・`utilities` 1。蜜蝋の蝋燭は今の`luxury`・`ritual`、`utilities` 0.5・`luxury` 0.5のまま。
- 保存した地図は、移し（`migrateTallowCandleGoods`）で獣脂の蝋燭を足し、蝋燭の獣脂の作り方を外す。蝋燭の在庫はそのまま蝋燭（蜜蝋の蝋燭）とする。
- `householdGoodValues`は長靴と革の品だけにする。前の`historical`で蝋燭に付いた2.4は、蜜蝋の蝋燭の14に戻す。
- 一つの品の決まりは選べるようにしない。品の目録の分け方を設定で切り替えると、保存した地図の品と在庫を行き来させる必要があるためで、他の品の分け方（亜麻の衣服、毛織物など）と同じく、一方向の移しとする。

## 4. 計測の計画

北緯30°の地図2枚、36か月。[byproduct-disposal-20261113.md](../analytics/byproduct-disposal-20261113.md)のnewと比べる。獣脂の蝋燭・蜜蝋の蝋燭の作った量と値段、獣脂の使い道と値段、蜜蝋の在庫。

## 5. 未確定事項

1. 蜜蝋の蝋燭の1人あたりの量（教会の量の史料）。
2. 油の蝋燭（油の灯り）を別にするか。
3. 農村の家が浸して作る獣脂の蝋燭を、市場を通さず家の中で作るか。

## 6. 結果

[candle-split-20261113.md](../analytics/candle-split-20261113.md)。家の灯りはほぼ全てが獣脂の蝋燭になり、作った量（2102で年約19.6万ブロック）は分ける前と同じだった。蜜蝋の蝋燭は年254ブロックで、町の人1人年0.1 kgの約1割にとどまった。買うのが贅沢の需要と人物の贅沢だけで、教会の買いが無いためである。蜜蝋は分ける前も後も積み上がる。
