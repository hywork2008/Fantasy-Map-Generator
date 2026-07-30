# Economy Market Accounting Audit

最終確認: 2026-07-30

## 結論

現行EconomyのMarketは、物資在庫と価格を管理する主体であり、独立した貨幣残高・貸借対照表を持たない。したがって、Market ManagerやBurgごとの商人ledgerは現時点では売上を説明・表示するための導出データであって、商人が実際に支払える運転資金ではない。

Food Ledgerに`marketTreasury.balance`を導入する場合、既存の一般Goods取引を直ちに完全な複式的決済へ置き換えるのではなく、まずFood Ledgerの市場間食料取引だけを決済対象として独立させる必要がある。一般Goodsの貨幣会計を同時に変更すると、Burg生産、消費、税、隊商、商人ledger、State treasuryを一括で再設計することになり、食料不足・人口移動の導入範囲を大きく超える。

## 現行実装の実態

| 経路 | 物資 | 貨幣・台帳 | 評価 |
| --- | --- | --- | --- |
| 農村セル → Market | `Markets.collectRuralProduction()`がセル産出を直接`market.goods[goodId].stock`へ加算する | 農村、生産者、Marketのいずれにも支払・収益を記帳しない | 現状は物量供給だけ。農村への穀物代金は未実装 |
| Burg製造 → Market | `Markets.sell()`が在庫を増やし`Deal`を作る | `Production.produceForBurg()`が売価から税を引いた額を`burg.treasury`へ加算するが、Market側残高は減らない | Burgの売上はあるが、Marketの仕入原資は追跡しない |
| Market → Burg消費・原料 | `Markets.buy()`が市場在庫を減らし`Deal`を作る | 呼び出し側が`burg.treasury`を減らすが、Market側残高は増えない | 購入者の支出のみが存在する |
| Market → Market一般交易 | `runGlobalTrade()`が輸出元在庫を減らし、Caravan到着時に輸入元在庫を増やす | `Deal`に価格・税・維持費は記録するが、両Market間の現金移転はしない | 物資輸送と価格評価はあるが、決済なし |
| Food Ledger市場間輸入 | `resolveFoodImportNetwork()`は抽象的な四半期フローと到達量を計算する | 金額・残高を更新しない。現時点では輸出元の一般在庫も減らさず、到達量で都市の有効収容力を補正する | 食料在庫・輸送・決済を導入する前の基盤 |
| Market Manager / Burg商人 | `BurgMarketLedger`がBurg別の商人・シェアを保持する | `revenue`は当期`Deal`や`burg.product`から再配分した表示用数値で、Character・Marketの現金ではない | 商人の支配・人格拡張の土台。資本台帳ではない |
| 税 | `Deal.tax`を集計する | `Taxes.collectTaxes()`が売り手側Stateの`state.treasury`へ加算し、人口税・軍維持費も処理する | State財政だけが継続残高として機能する |

## 食料設計への意味

1. 「Marketが地域の作物を吸い取る」こと自体は、現行では物量上すでに起きている。しかし農村セルへの対価支払いは存在しない。
2. 現行の`burg.treasury`は都市行政・生産予算・消費予算を兼ねる近似値であり、Market商人の財布ではない。Market初期資本をBurg treasuryから移すと、住民・行政と商人を同一主体として扱うことになり、モデル上不自然である。
3. 現行システムは、Burgの販売時に貨幣を増やし、購入時に貨幣を減らしてもMarketへ移さない。このため、既存残高を単純に振り替えても通貨保存の前提はまだ成立しない。
4. それでもFood Ledgerには、輸入量を購入可能額で制限し、売り手へ代金を渡す局所的な決済が必要である。この局所的な保存則はFood Ledger内で完結させ、後続の一般Goods会計と接続できるようにする。

## 推奨する段階的境界

- `Market.marketTreasury.balance`はMarket商人・商会が保有する運転資金として扱い、Burg・State treasuryとは別所有者にする。
- Food Ledgerは、輸入Marketの残高から支払い、輸出Marketの残高へ同額を移す。価格、輸送費、損耗・略奪の負担先はFood Ledger固有の`FoodShipment`/`FoodTradeDeal`に記録する。
- Food Ledgerの消費後に輸出留保を超える主食は、一般GoodsのGrain在庫として取引可能にし、そのGrain価格をFood Ledgerの入札・決済へ使う。Food Ledgerの期限付き在庫を唯一の主食物量正本とし、一般GoodsのGrain stockは取引可能余剰の同期ビューとする。一般GoodsのGrain売買はFood LedgerをFIFOで同時に控除し、二重計上しない。
- `Good.tags`に`stapleFood`を追加し、v1はGrainだけに付与する。Food Ledgerが有効な間は`stapleFood`だけを既存の農村生産、Burg需要充足、一般Goods市場間交易から除外する。主食の生産・人口消費・輸送はFood Ledgerだけが担い、一般GoodsはFood Ledger余剰の在庫表示と価格形成に限る。既存`food`タグのWine、Beer、Honey、Fish、Cattleなどは従来の一般Goods経路に残す。
- v1では`stapleFood`以外のGoodsを人口の主食需要・飢餓判定へ換算しない。肉、魚、油脂などを代替カロリーとして扱う栄養モデルは後続とする。
- Cattleはv1ではFood Ledger外の一般Goodsのまま維持する。役牛と食肉・畜産物を分け、役牛を農耕・輸送力へ接続するのは後続である。
- Food LedgerのAge0–Age2は物量と平均仕入れ単価を一組で保持する。生産・輸入はAge0へ加重平均原価で入り、FIFOで取り出す都市販売・輸出・略奪・輸送は対応する原価を使う。都市小売の粗利益は当月小売価格とFIFO原価の差額で記録する。
- 農村Grainの仕入れ値は都市小売価格の80%とする。Market圏内の保管・資本費・通常損耗・取扱い・商人利益を20%の基礎差額へ集約し、市場間輸送費・護衛費・略奪損失はFoodShipmentの別原価として後続に分離する。
- 農村GrainがAge0へ入る時、Marketは仕入れ額を支払える範囲で即時決済し、残額を`ruralGrainPayable`として負債に記録する。v1では農家個別の現金残高を作らず、食料物量は支払可否にかかわらず全量をFood Ledgerへ入れる。
- 都市小売・食料輸出で入るMarket収入は、次の食料輸入より先に`ruralGrainPayable`の返済へ使う。Character・信用・政治を使う返済優先度の例外は後続である。
- FoodShipmentの輸送費は輸入MarketがGrain代金へ上乗せして払い、輸出Marketを当面の隊商手配者としてその輸送収入へ移す。運び手の賃金・飼料・船舶維持費の分配は後続である。
- FoodShipment初期版は既存の距離比例費・日数比例維持費を使うが、品目単独採算で出航を止めない。後続はFoodShipmentと一般Goods交易を経路単位の便・固定出航費・積載容量へ統合し、高価値貨物が出航費を負担する便へGrainを限界費用で相乗りさせる。固定費は重量・嵩・容量占有で配分する。
- FoodShipmentの距離比例運賃は陸路1.0・河川0.5・海運0.125の係数を掛ける。中世イングランドの穀物輸送費およそ8:4:1を正規化した初期近似であり、低価格・大容量のGrainは河川・海運で遠距離輸送しやすく、陸路は近距離または高価格時に偏る。
- 輸入Grainは積出量に対して払ったGrain代金・輸送費を実到着量で割った原価でAge0へ入り、損耗・略奪は到着品の原価を上げる。全損時は在庫を増やさず、支払総額を`foodTransportLoss`へ記録する。
- 新規地図とFood Ledgerを初めて得る旧セーブの初期残高は、Burg treasuryからの実移転ではなく、初回生産後の所属Burg treasury合計へ`0.5〜1.0`の決定的係数を掛けて与える商人資本として扱う。Burg treasuryは減らさない。
- Food Ledgerが安定した後、一般Goodsの`Markets.sell()`/`buy()`/`runGlobalTrade()`を同じMarket会計へ接続する。その時点で、農村生産者の売上、Burg消費、商人利益、税、運賃を一つの資金循環として設計する。

## 現時点でしないこと

- 農村セルまたは農家世帯ごとの現金残高を新設しない。
- `BurgMarketLedger.revenue`を現金残高として扱わない。
- Food Ledger導入だけを理由に、既存の全Goods取引の貨幣決済を変更しない。
- `marketTreasury.balance`の初期資本をBurg treasuryから強制移転しない。
