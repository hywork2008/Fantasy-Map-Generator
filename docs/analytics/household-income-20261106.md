# 町の家計の収入と、エールの値段（2026-11-06）

[market-goods-settlement.md](../plan/market-goods-settlement.md)§3.1の続き。家計がエールの代金を払う形（`householdGoodsPayment: "pay"`）では、エールの大部分が飲まれなかった。町の家計の収入と、エールなどの値段が釣り合っているかを、史料と比べて調べた。コードは変えていない。

## 1. 条件

- 地図: start-stock-20261105のP1の地図（`world-2101.fmg`、`world-2104.fmg`）。24か月、襲撃なし、平和。表は13〜24か月目。
- コード: 53741cf95に、market-goods-settlement.mdの変更（既定: 委託、家計は払わない）を当てたもの。
- 計測スクリプト: [incomeprobe.mts](household-income-20261106/incomeprobe.mts)（集計は[summarize.py](household-income-20261106/summarize.py)）。読み取りのみ。
  - 町の家計の財布（`creditHouseholdWealth`・`debitHouseholdWealth`）の出入りを、呼び出した関数ごとに市場ごとに数える（`setHouseholdWealthFlowObserver`）。
  - 毎月、町の人の数、エールの需要と市場の値段、飲まれたエール、主食の小売の値段を記録する。
- 金額は、町の人1人・1年あたりにした（SP）。

## 2. 結果

### 2.1 町の家計の収入と支出

| | 2101 | 2104 |
| --- | ---: | ---: |
| 町の人 | 659,043 | 809,517 |
| **収入** | **0.587** | **0.685** |
| 農村の家計が町で使う分（`spendRuralHouseholdsInTowns`） | 0.337 | 0.431 |
| 人物の生活費（`applyCharacterLivingCosts`） | 0.066 | 0.075 |
| 織物の請負（`runTextileCommissions`） | 0.025 | 0.033 |
| 生産の賃金（`executeManufacture`） | 0.023 | 0.024 |
| 塩の卸（`paySaltWholesale`） | 0.011 | 0.030 |
| 水兵の給料（`payNavyCrew`） | 0.028 | 0.013 |
| その他 | 0.097 | 0.079 |
| **支出** | **0.589** | **0.693** |
| 主食（`settleMonthlyFoodConsumption`） | 0.343 | 0.346 |
| 肉（`sellMeat`） | 0.077 | 0.114 |
| 町の職人と店（`spendUrbanHouseholdSurplus`） | 0.075 | 0.148 |
| 暖房（`settleMonthlyHeating`） | 0.071 | 0.067 |
| その他 | 0.023 | 0.018 |

- 収入と支出はほぼ同じで、家計は入った分をその年に使い切る。
- 収入の57〜63%は、農村の家計が町で使う分である。生産の賃金は4%しかない。
  - 生産の賃金の率は設計どおり（労働者1人の食費の1.5倍、1人・年0.645）。0.023は、町の人の約3.6%が生産で働いている量にあたる。
  - 町の仕事のうち、シミュレーションする財の生産はごく一部で、残りの町の収入は、農村の家計や人物の支出として入っている。

### 2.2 エールの代金

| | 2101 | 2104 |
| --- | ---: | ---: |
| エールの需要を市場の値段で買うと | 0.780 | 0.792 |
| 同じ量を基準の値（`Beer.value` 2.4/1,000 L）で買うと | 0.576 | 0.597 |
| 飲まれた分（委託・家計は払わない）を市場の値段で | 0.640 | 0.604 |
| 収入に対する、需要の基準の値での代金 | 98% | 87% |
| 収入に対する主食の支出 | 58% | 50% |

- エールの需要を基準の値で買うだけで、収入のほぼ全部になる。市場の値段は、在庫が足りないので基準の値の1.3倍前後である。
- 家計に払わせると（§3.1のv2）、主食の後に残る分でエールの1〜2割しか買えないのは、このためである。

## 3. 史料との比較（イングランド、1300年前後）

### 3.1 史料の値

| 項目 | 値 | 出典 |
| --- | --- | --- |
| 男の日雇いの日給 | 1300〜1310年 1.35 d、1310〜1320年 1.46 d | Humphries & Weisdorf（Dyerによる） |
| 職人の日給 | 1290年代 2.5 d、建築の職人 1310〜1337年 4 d | Dyer、Munro |
| 小麦 | 1クォーター（480ポンド、約218 kg）約6 s（ふつうの年） | Clark（Agrarian Historyによる） |
| エール（町） | 小麦が3 s〜3 s 4 dの時、1 dで2ガロン（Assize of Ale、1266年頃）。14世紀の実際の値段は、上等 1.5 d、並 0.75〜1 d/ガロン | Assize of Bread and Ale、Dyer |

### 3.2 1人・1年に直した値

町の人の主食を、モデルと同じ1人・年199 kg（`GROSS_FOOD_NEED` 0.43 wain）とする。エールは、モデルと同じ成人300 L（`ALE_TARGETS.urbanLitersPerAdultYear`）、成人の割合0.65で、1人・年43ガロンとする。

| | 史料（小麦6 s、エール1 d/ガロン） | モデル（基準の値） |
| --- | ---: | ---: |
| 主食 | 66 d | 0.43 SP |
| エール | 43 d | 0.47 SP（水の危険で最大1.5倍） |
| エール/主食 | 0.65 | 1.1（最大1.6） |
| エールと穀物の1 kgの値の比 | 約0.67 | 1.1 |

- エールの値は、主食と比べて史料の約1.7倍である。`Beer.value`の根拠（[goods-physical-units.md](../plan/goods-physical-units.md)§29.1、1 kgでGrainの0.7〜1.5倍）の範囲には入るが、上の側にある。
- 家族4.5人・年250日働くとして、1人・年の収入にすると、日雇いの家族で78 d、職人の家族で167 d になる。
  - 主食は収入の、日雇いの家族で85%、職人の家族で40%。モデルの50〜58%は、その間にある。
  - エール（成人300 L）は、日雇いの家族では収入の55%、職人の家族では26%。日雇いの家族は、主食と合わせて収入を超える。
- 成人300 L（Unger、15〜16世紀の低地地方）や1日2パイント（Bennett、醸造する家）は、暮らしに余裕のある家の量である。1300年頃の日雇いの家族が、市場の値段でこれだけ買えたとは言えない。
- 家族の人数・働く日数・小麦の値段は仮定であり、比は目安である。

## 4. 分かったこと

1. **モデルの町の家計の収入は、主食の割合で見ると、史料の日雇いと職人の間にある。** 収入の水準そのものは大きくずれていない。
2. **エールの値段が、主食と比べて史料の約1.7倍ある。** 基準の値でも、需要を買うと収入のほぼ全部になる。
3. **エールの需要（成人300 L）は、余裕のある家の量で、町の全員に当てるのは多い。** 史料の値段でも、日雇いの家族は買えない。
4. 家計は払わない既定（market-goods-settlement.md）では、町の家計は代金を払わずに需要の8割前後を飲む。家計の財布から見ると、エールはただである。

## 5. 直し方の候補

まだ実装していない。

| 候補 | 何を変えるか | 気をつけること |
| --- | --- | --- |
| a. エールの値を下げる | `Beer.value`を2.4から、1 kgで穀物の約0.67倍（約1.5）へ | 醸造の1 lotの利益が減る。§29.1では、利益が落ちてBeerの生産が止まった。原料（穀物1 wain、樽0.4）と賃金を引いた利益を確かめる |
| b. エールの需要を収入で決める | 払う形（`pay`）で、主食の後に残る分で買える量を飲む。需要を減らす分は、水の危険の上乗せを残す | 今の収入では需要の2〜3割になる。作った量が余る |
| c. 町の需要を家の暮らし向きで分ける | 成人300 Lを、余裕のある家（職人・商人）の分だけにし、日雇いの家は少なくする | 町の人を暮らし向きで分ける数が要る（史料を探す） |
| d. 町の家計の収入を上げる | 生産の賃金が収入の4%しかない形を直す | 範囲が広い。町の仕事のうちシミュレーションしない分を、どう収入にするかの設計が要る |

- aとcは、どちらも史料に寄せる直し方で、組み合わせられる。
- bは、aかcの後でないと、エールの大部分が飲まれなくなる。

## 6. 全量出力

`docs/analytics/raw/household-income-20261106/`（Git管理外）のSHA-256:

| ファイル | SHA-256 |
| --- | --- |
| income-2101.json | f55261dcee8cb08e0aed1368a8ab79bdf549408845748f46dd8efd9b5d528929 |
| income-2104.json | fc2ada96641254a2f757969a0949be14c23cd5ac38b4d85efda644b43fd27291 |

## 7. 出典

- Humphries, J. & Weisdorf, J., "The Wages of Women in England, 1260–1850" — https://ora.ox.ac.uk/objects/uuid:6508f179-e832-4a5b-ad5c-e2d2ab6f8d4d/files/sfn106z45f
- Munro, J., "Wage-Stickiness, Monetary Changes, and Real Incomes in Late-Medieval England" — https://www.economics.utoronto.ca/munro5/REH21MunroWageStickiness.pdf
- Clark, G., "Markets and Economic Growth: The Grain Market of Medieval England" — https://faculty.econ.ucdavis.edu/faculty/gclark/210a/readings/market2000.pdf
- Assize of Bread and Ale — https://en.wikipedia.org/wiki/Assize_of_Bread_and_Ale 、https://sourcebooks.fordham.edu/source/breadbeer.asp
- Dyer, C., Standards of Living in the Later Middle Ages（1989）の値の抜き書き — http://faculty.goucher.edu/eng211/c14_price_list.htm 、https://medieval.ucdavis.edu/120D/Money.html
