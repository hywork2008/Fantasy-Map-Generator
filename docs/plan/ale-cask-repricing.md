# エールと樽の値を史料に寄せる（2026-11-07）

## 1. 背景

[household-income-20261106.md](../analytics/household-income-20261106.md)で、次のことが分かった。

- エールの値（`Beer.value` 2.4/1,000 L）は、1 kgで穀物の1.1倍あり、主食と比べて史料の約1.7倍である。町の家計がエールの需要を基準の値で買うだけで、収入の87〜98%になる。
- エールの量（成人300 L）は、史料の町の平均（イングランドの中世後期で1人275〜300 L、1520年代のコヴェントリーで1人約500 L）の範囲か、それより少ない。

方針（ユーザーの決定、2026-11-07）:

- エールの値を史料に寄せる（候補a）。
- 量を家の暮らし向きで分ける案（候補c）はやめる。暮らし向きで分けた史料が見つからず、町の平均の量は史料と合っているため。
- エールの値を下げると、醸造の原価のうち樽の傷み（1,000 Lで樽0.4、値2で0.8）が穀物（約0.9）と同じくらいになり、醸造が赤字になる。そのため、樽の値も史料に寄せる。

## 2. 史料

| 項目 | 値 | 出典 |
| --- | --- | --- |
| 小麦 | 1クォーター（約218 kg）約6 s（ふつうの年、1300年前後） | Clark（Agrarian Historyによる） |
| エール（町） | 小麦3 s〜3 s 4 dの時に1 dで2ガロン（Assize of Ale、1266年頃）。14世紀の実際の値段は上等1.5 d、並0.75〜1 d/ガロン | Assize of Bread and Ale、Dyer |
| 空の樽 | 3 d（Dyerなどからの抜き書き。元の史料は確かめていない） | GameDev.net "Medieval Price List" |
| 樽屋の日給 | 3 d | History Hit（M. Lewis） |

- 樽の値の史料は弱い。樽屋の日給と同じ額なので、樽1つが樽屋の1日分の仕事にあたる、という形で目安にする。

## 3. 変更

### 3.1 値

| 品 | 今の値 | 新しい値 | 根拠 |
| --- | ---: | ---: | --- |
| Beer（1,000 L ale tun） | 2.4 | 1.5 | 小麦6 sの時にエール1 d/ガロン。1 kgで穀物の約0.67倍（1,010 kg × 0.67 × 穀物1 kgの値） |
| Barrels（空の樽1つ） | 2 | 0.1 | §3.2 |

### 3.2 樽の値を0.1にする理由

- 史料の3 dは、モデルの値にすると約0.02である（穀物1 SP ≈ 463 kg ≈ 2.1クォーター ≈ 153 d）。
- モデルの樽1つの原価は約0.06である。
  - 木材: 62.5 kg（25 kgの樽、歩留まり40%、`BARREL_WOOD_PER_LOT`）で、約0.01。
  - 賃金: 1つあたり0.00106労働点（1.06人・月、`laborPointsPerLotAtDefaultRate`）で、生活賃金（労働点1・月あたり約43〜54）を掛けて約0.05。
- 0.02にすると、樽屋は賃金だけで赤字になる。そのため、原価に利幅を足した0.1にする。史料の約5倍で、今の値（約100倍）よりずっと近い。
- 残る差は、樽1つの労働量である。史料では樽屋の約1日分、モデルでは約30日分ある。モデルの労働量は、樽屋の人数（町の人1,000人に約5人、[urban-craft-staffing.md](urban-craft-staffing.md)）を、町のエールの詰め替えの樽だけで割って出している。史料の樽屋は、ニシン・塩・ワイン・バターなどの樽も作った。直すには、樽の需要を数え直す必要があり、本書の範囲から外す（§5）。

### 3.3 醸造の原価（1,000 L、基準の値）

| | 今 | 変更後 |
| --- | ---: | ---: |
| 穀物1 wain（Barley 0.9） | 0.9 | 0.9 |
| 樽の傷み0.4 | 0.8 | 0.04 |
| 賃金（0.0002労働点） | 約0.01 | 約0.01 |
| 売値 | 2.4 | 1.5 |
| 1 lotの利益 | 約0.69 | 約0.55 |

1 lotの利益は2割ほど減るだけで、[goods-physical-units.md](goods-physical-units.md)§29.1で生産が止まった0.14よりずっと大きい。

### 3.4 そのほかの影響

- 樽を材料にする品（Wine 0.08、Cider・Perry 0.4、Pomace Wine 0.08、Liquor 0.04）の原価が下がる。値は変えない。
- 樽は、値打ちの密度で運べる日数が決まる（`getGoodMaxTradeDurationDays`）。値が下がるので、樽はより近くにしか運ばれない。史料でも樽は地元で作るものなので、そのままにする。
- 家計がエールに払う形（`householdGoodsPayment: "pay"`）では、同じ収入で買える量が1.6倍になる。

### 3.5 古い保存

`migrateWeightRepricing`で、値が今の既定のままのもの（Beer 2.4、Barrels 2）だけを新しい値にする。Beerは、§29の前の値（4）からも、2.4を経て1.5になる。Goods editorでプレイヤーが変えた値は残す。

## 4. 計測

- 地図: start-stock-20261105のP1の地図4枚。48か月、襲撃なし、平和。
- コード: 変更前（market-goods-settlement.mdのv3）と変更後。
- 見るもの: エールの作った量と飲まれた量、エールと樽の市場の値段、醸造と樽屋の生産量、樽による不足、樽屋の町の金庫、Wine・Cider・Perryの生産、町の家計の収入と支出、町の人口。
- `householdGoodsPayment: "pay"`でも1回計り、家計が払う形でエールがどれだけ飲まれるかを見る。

### 4.1 結果（2026-11-07、[記録](../analytics/ale-cask-20261107.md)）

- 4年目に飲まれたエールは需要の83〜99%（変更前75〜91%）。醸造は止まらず、出した量は1〜19%増えた。
- エールの市場の値段は1.85〜2.13（変更前2.67〜3.18）、樽は0.10〜0.12で、原価（約0.06）を下回らない。樽を出した量は1.7〜2.4倍。
- 預かりの値打ちは4〜6割減った（値2の樽が売れ残っていた分）。町の人口・家計の収入と支出はほぼ変わらない。
- エールの需要を基準の値で買う代金は、町の家計の収入の55〜62%（変更前87〜98%）。
- `pay`では飲まれた量は需要の11〜21%で、ほとんど増えない。家計が払える額の上限で決まる。

## 5. 未確定事項

- 樽1つの労働量（モデル約30日、史料約1日）。樽の需要をエールの詰め替え以外にも数えて、樽屋の人数から労働量を出し直すか。
- Cider・Perry（2.4・2.5）も、エールと同じ考えで値を下げるか。原料の林檎・梨の値（§29.2、史料の確認は未了）と一緒に見直す。
- 樽の値の史料（元の会計記録）。Thorold Rogers, *A History of Agriculture and Prices in England* の第1・2巻に当たる。

## 6. 出典

- Clark, G., "Markets and Economic Growth: The Grain Market of Medieval England" — https://faculty.econ.ucdavis.edu/faculty/gclark/210a/readings/market2000.pdf
- Assize of Bread and Ale — https://en.wikipedia.org/wiki/Assize_of_Bread_and_Ale 、https://sourcebooks.fordham.edu/source/breadbeer.asp
- Dyer, C., Standards of Living in the Later Middle Ages（1989）の値の抜き書き — http://faculty.goucher.edu/eng211/c14_price_list.htm
- GameDev.net, "Medieval Price List" — https://archive.gamedev.net/archive/reference/articles/article251.html
- History Hit, "What Would a Penny Buy You in Medieval England?" — https://www.historyhit.com/money-in-medieval-england/
- 町の平均のエールの量 — https://en.wikipedia.org/wiki/Beer_in_England 、https://microkhan.com/2010/02/10/blitzed-on-feudalism/
