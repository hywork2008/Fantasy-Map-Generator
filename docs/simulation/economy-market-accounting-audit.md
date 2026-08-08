# Economy Market Accounting Audit

最終確認: 2026-08-08（一般GoodsのMarket決済・経済開始モードを追加）

## 結論

`marketTreasury.balance`はFood Ledgerだけでなく、都市とMarket間の一般Goods卸売にも使う実在の運転資金である。`Markets.sell()`はMarket残高が仕入額を払える時だけBurgの在庫を買い、`Markets.buy()`はBurgからの購入額をMarket残高へ戻す。従って、Marketは在庫を受け取るだけでBurg Treasuryを増やせない。

Food Ledger（stapleFood/Grain限定）では、同じ`balance`と`ruralGrainPayable`を使い、農村からのGrain仕入れ・未払い・都市小売収入からの優先返済を処理する（[foodProduction.ts](../../src/extensions/economy/generators/foodProduction.ts)・[foodLedgerConsumption.ts](../../src/extensions/economy/generators/foodLedgerConsumption.ts)）。これは完全な複式簿記ではない。農村の一般Goods生産、市場間一般交易、Food Shipmentは引き続き個別決済を持たない。

## 現行実装の実態

| 経路 | 物資 | 貨幣・台帳 | 評価 |
| --- | --- | --- | --- |
| 農村セル → Market（stapleFood以外の一般Goods） | `Markets.collectRuralProduction()`がセル産出を直接`market.goods[goodId].stock`へ加算する | 農村、生産者、Marketのいずれにも支払・収益を記帳しない | 現状は物量供給だけ。農村への代金は未実装 |
| 農村セル → Market（Food Ledger, stapleFood限定） | `FoodProductionModule`の四半期生産が`foodStockAge0`へ加算される | `settleFarmgatePayment()`が`marketTreasury.balance`から仕入原価を支払い、不足分を`ruralGrainPayable`として計上する。都市小売収入から`ruralGrainPayable`への優先返済も実装済み | 実装済み。marketTreasury.balanceは実在する運転資金であり、農村への穀物代金支払いが機能している |
| Burg製造 → Market | `Markets.sell()`が在庫を増やし`Deal`を作る | 生産開始前にMarketの利用可能資金を人口比（小村の最低重み付き）で各Burgへ予約する。その枠内で`marketTreasury.balance`から仕入額を払い、Burgは税引後売価、Stateは税を受け取る | 生産順にかかわらず都市規模に応じた仕入機会を持つ |
| Market → Burg消費・原料 | `Markets.buy()`が市場在庫を減らし`Deal`を作る | 呼び出し側が`burg.treasury`を減らし、購入額を`marketTreasury.balance`へ加算する | 購入者の支出が次回の仕入原資へ戻る |
| Market → Market一般交易 | `runGlobalTrade()`が輸出元在庫を減らし、Caravan到着時に輸入元在庫を増やす | `Deal`に価格・税・維持費は記録するが、両Market間の現金移転はしない | 物資輸送と価格評価はあるが、決済なし |
| Food Ledger市場間輸入（FoodShipment） | `resolveFoodImportNetwork()`は抽象的な四半期フローと到達量を計算する | 金額・残高を更新しない。現時点では輸出元の一般在庫も減らさず、到達量で都市の有効収容力を補正する | 農村⇄Marketの決済（上記）とは別に、市場間の輸送・決済はまだ未実装 |
| Market Manager / Burg商人 | `BurgMarketLedger`がBurg別の商人・シェアを保持する | `revenue`は当期`Deal`や`burg.product`から再配分した表示用数値で、Character・Marketの現金ではない | 商人の支配・人格拡張の土台。資本台帳ではない |
| 税 | `Deal.tax`を集計する | `Taxes.collectTaxes()`が売り手側Stateの`state.treasury`へ加算し、人口税・軍維持費も処理する | State財政だけが継続残高として機能する |

## 食料設計への意味

1. 「Marketが地域の作物を吸い取る」こと自体は、現行では物量上すでに起きている。stapleFood（Grain）の農村対価は`marketTreasury.balance`/`ruralGrainPayable`で決済され、Burg製造品はMarket残高の範囲で卸売決済される。農村の一般Goods生産への対価は依然として存在しない。
2. 現行の`burg.treasury`は都市行政・生産予算・消費予算を兼ねる近似値であり、Market商人の財布ではない。Market初期資本をBurg treasuryから移すと、住民・行政と商人を同一主体として扱うことになり、モデル上不自然である。実装済みの`marketTreasury.balance`初期化も、Burg treasuryの合計から乱数係数で新規資本を生成するだけで、Burg側を減算しない設計を守っている。
3. Burg⇄Marketの一般Goods卸売では、Market残高 → Burg Treasury → Market残高の循環を作る。販売税はこの循環からState Treasuryへ移る。市場間交易・農村一般Goodsには未決済経路が残るため、系全体の完全な通貨保存はまだ主張しない。
4. Food Ledgerでは、輸入量を購入可能額で制限し、売り手へ代金を渡す局所的な決済を農村⇄Market間で実装済みである。この局所的な保存則はFood Ledger内で完結しており、市場間のFoodShipment決済・後続の一般Goods会計との接続はまだ行っていない。

## 推奨する段階的境界

本節で提案した会計境界は、[megacity-food-import-economy.md](../plan/megacity-food-import-economy.md) §3.4・§4.1の「決定」として正式に採用済みである。個別の決定内容・数値（`marketTreasury.balance`の所有権、Food Ledgerの決済範囲、`stapleFood`タグによる一般Goodsとの分離、Age0–Age2の加重平均原価、`ruralGrainPayable`、輸送費・輸送モード係数、初期商人資本の生成方法など）は同文書を一次ソースとし、本書では重複して保持しない。今後の変更は megacity-food-import-economy.md 側にのみ加える。

## 現時点でしないこと

- 農村セルまたは農家世帯ごとの現金残高を新設しない。
- `BurgMarketLedger.revenue`を現金残高として扱わない。
- 農村一般Goods・市場間一般交易を、今回のBurg⇄Market卸売と同時に完全決済へ拡張しない。
- `marketTreasury.balance`の初期資本をBurg treasuryから強制移転しない。
