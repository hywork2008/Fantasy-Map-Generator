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

本節で提案した会計境界は、[megacity-food-import-economy.md](../plan/megacity-food-import-economy.md) §3.4・§4.1の「決定」として正式に採用済みである。個別の決定内容・数値（`marketTreasury.balance`の所有権、Food Ledgerの決済範囲、`stapleFood`タグによる一般Goodsとの分離、Age0–Age2の加重平均原価、`ruralGrainPayable`、輸送費・輸送モード係数、初期商人資本の生成方法など）は同文書を一次ソースとし、本書では重複して保持しない。今後の変更は megacity-food-import-economy.md 側にのみ加える。

## 現時点でしないこと

- 農村セルまたは農家世帯ごとの現金残高を新設しない。
- `BurgMarketLedger.revenue`を現金残高として扱わない。
- Food Ledger導入だけを理由に、既存の全Goods取引の貨幣決済を変更しない。
- `marketTreasury.balance`の初期資本をBurg treasuryから強制移転しない。
