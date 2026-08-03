# プレイヤーキャラクターの市場売買と都市小売在庫

| 項目 | 内容 |
| :-- | :-- |
| 状態 | Phase 1-3 の最小縦切りを実装済み（2026-08-03）。物流・価格の精緻化は継続 |
| 対象 | Economy / Characters / Nobility 拡張、および Goods / Markets UI |
| 作成日 | 2026-08-03 |
| 非対象 | upstream の Economy UI・手動市場計算の移植、全一般 Goods の完全複式簿記 |

### 実装状況（2026-08-03）

- 実装済み: Economy slice の小売・卸売・輸送中在庫、保存量 validator、Manager/Rival Merchant の品目群販売権、購入・売却 command と receipt、商人 `wealth`・税・Market treasury・Character inventory の原子的更新、Player Character HUD からの `Character Market` 画面。
- 実装済み: 新規／既存 Market の在庫は初回に中心 Burg の卸売へ移行され、人口比の店頭目標へ直接輸送される。購入は店頭だけから行い、購入直後の補充は行わない。
- 実装済み: 都市の自動生産が `Markets.sell` で Market に納入される時、その同じ Burg の卸売・集荷在庫にも置く。したがって工房 B で作られた商品は、次回の補充で B の店頭を優先して満たし、余剰だけが他都市へ直接輸送される。
- 実装済み: `Markets.collectRuralProduction` の通常 Goods は、各農村セルから同一 Market 内で最も近い Burg の `collectionBurg` へ直接入る。季節変動する food tag と森林減耗する Wood も同じ集荷先をキャッシュし、Market 合計在庫との保存則を保つ。`stapleFood` は既存の Food Ledger が別途管理する。
- 実装済み: 都市間補充は道路・河川・海路グラフの `TradeRoutePlanner` と既存の隊商移動速度を使って到着日を決める。到着した店頭在庫は配送日数の加重平均を保持し、プレイヤーの ask/bid に一日 0.4%、最大 15% の locality surcharge を反映する。経路がない旧データでは従来の直線距離推定へ安全にフォールバックする。
- 未実装: Markets/Goods Stock Overview の所在別表示、Character Details の inventory 表示。Burg が一つもない Market や既存の別システムが増減させた `Market.goods.stock` の差分は、従来どおり中心 Burg の卸売在庫へ reconcile する。

## 1. 結論

プレイヤーキャラクターは、現在滞在している Burg の店頭で商品を売買できるようにする。店員・荷役人を一人ずつ Character として作る必要はないが、既存の Market Manager / Rival Merchant は実在する商会主として、品目群の販売権と利益を持つ。各地の店頭はその商会の抽象的な支店・代理人であり、店員の個別 Character ではない。

在庫は、意味としては次の二層にする。

1. `Market.goods[goodId].stock` は、従来どおり **市場圏全体が所有する販売可能在庫の合計**である。首都（`centerBurgId`）に表示される市場情報は、この合計を示すのであって、その都市だけに全量が物理的に積まれていることを意味しない。
2. 新設する Burg ごとの **小売在庫**は、合計在庫のうち実際にその都市の店頭で即時に売買できる量である。小売在庫の合計は Market 合計を超えない。

ただし合計から小売在庫を引いた量を「どこにでも瞬間移動できる未配分在庫」にはしない。市場圏内の各 Burg に置かれた**卸売・集荷在庫**、または出発地・到着地・到着時刻を持つ**輸送中在庫**として位置を記録する。Market の中心 Burg はこの台帳の一ノードになり得るが、唯一の倉庫ではない。市場圏は会計・商会・価格の単位であり、首都を必ず経由する物流網ではない。

これにより、どの都市でも商売をでき、在庫不足・遠隔地の品薄・市場間の交易を意味のあるものにしながら、既存の生産・隊商・価格計算の正本を `Market.goods` のまま保てる。

## 2. 現状の表示とデータの正しい意味

まず、Goods レイヤーの三種の表示を次のように扱う。これらを「市場の在庫アイコン」と誤解したまま機能を足さない。

| 地図表示 | 現行データ・実装 | 正しい意味 | 今後の UI 方針 |
| :-- | :-- | :-- | :-- |
| 数字なしの丸い商品アイコン (`#goodsIcons`) | `goodCellColumn` に置かれた bonus resource | 資源の地理的配置。市場または都市の在庫ではない | クリックは Goods Editor を開く現行挙動を維持する。ツールチップを「Resource location; not stock」に直す |
| セルの濃淡 (`#goodsCells`) | `getCellProduction()` による選択商品の農村生産量。選択商品の合計を全セル最大値で正規化 | そのセルの当期・推定農村生産。資源アイコンだけのセルは生産に加えない表示復元である | 「Rural production (not stock)」と明示する。将来はセル詳細から品目別生産量を読めるようにする |
| 数字付きの都市プレート (`#goodsBurgs`) | `Production.getBurgProduction(burg)` の上位三品目 | 都市で記録された生産量。市場、首都、または店頭在庫ではない | `Production Overview` を **Burg Production Ledger** に改名する |

現在の `Production Overview` の `bought` / `sold` は、手動のプレイヤー売買状態ではない。生産処理が作る `Deal` に対して、その Burg が市場へ売ったか、市場から生産原料等を買ったかを表示したラベルである。upstream の Production Overview を移植して意味を合わせるのではなく、次のように表示を改める。

- `Manufactured` → `Produced`（都市の製造出力）
- `Sold` → `Sold to market`（自動生産サイクルでの市場への納入）
- `Bought` → `Purchased for production`（自動生産サイクルでの市場からの調達）
- プレイヤーの売買履歴は混ぜず、後述の **Market / Character Trade** 画面にだけ出す。

この整理により、「数字付きアイコンを押すと市場で BUY / SELL を手計算する画面が出る」という期待を廃止する。都市プレートは生産診断であり、実際のプレイヤー売買入口はプレイヤー HUD と、その人物が滞在する Burg の Market ダイアログに置く。

## 3. 市場の領域・店舗・在庫の定義

### 3.1 Market は国家ではない

`marketCellColumn` と `burg.market` が示す Market は、国家領土とは独立した**商圏**である。国境をまたいでも市場 ID が同じなら、同じ商圏の価格・在庫・商人組織に接続する。国家は課税・治安・戦争価格補正を与える別の主体である。

そのため、プレイヤーがある Burg で売買する際の決定順は次のとおりとする。

```text
player Character.location
  -> Burg
  -> burg.market
  -> Market の地域価格・合計在庫・商人運転資金
  -> Burg の店頭小売在庫

point-of-sale Burg.state
  -> その売買にかかる売上税の徴収先
```

市場の中心 Burg は市場名・表示・管理者・集計のアンカーであり、唯一の売買場所ではない。

### 3.2 都市の「商人がいる」条件

v1 は、削除されておらず `burg.market > 0` で有効な Market を参照する全 Burg に商人がいるものと仮定する。港、首都、人口閾値、個別の商人 Character を追加の必須条件にしない。これが「過疎地には商人がいない」表現を永久に放棄する意味ではない。将来の宿屋・隊商・市場規模が整った段階で `retailServiceLevel` を導入し、極小集落には注文販売だけを残せる。

Market Manager / Rival Merchant は、既存どおり市場圏の商会主である。店頭ごとに一人ずつ新しい Character を生成すると Character 数、死亡・移動・雇用の整合性だけが増えるため、v1 では採用しない。既存商人が遠方 Burg に商品を売る場合は、本人が常駐するというより、支店・番頭を雇っているものとして扱う。

### 3.3 商人の品目棲み分けと、プレイヤー売買の帳簿

同一の棚にいる全商人が同一品を同一価格で競売するモデルは採らない。価格競争を精密に扱わない現段階では、同じ商品の価格だけが無意味に競合し、誰が利益を得たかも曖昧になるためである。代わりに、各 Market の Manager と生存中の Rival Merchant に**品目群ごとの販売権（concession）**を割り当てる。

既存の `inferGoodsTradeAffinity()` が持つ `localBulk` / `tradeStaple` / `luxury` / `military` の四分類を、最初の販売権単位として使う。各分類は原則一商会に属し、商人が三人なら一人が二分類を受け持つ。市場生成・商人の死亡・後継者就任時だけ、seed と商人の stewardship / influence を使って安定的に再配分する。各 Good はその分類から一人の担当商人を O(1) で決められるため、Burg ごと・商品ごとに全商人を走査しない。

```ts
type MarketMerchantPortfolio = {
  marketId: number;
  merchantId: number;
  affinities: GoodsTradeAffinity[];
  /** 商品代金のうち商会主へ確定帰属する小売粗利。例: 1,200 = 12% */
  retailMarginBps: number;
};

/** 実際に売れた組合せだけ作る。全 Burg × 全 Good の帳簿は作らない。 */
type MerchantGoodSalesLedger = {
  marketId: number;
  merchantId: number;
  goodId: number;
  playerUnitsSold: number;
  playerGrossSales: number;
  playerRetailProfit: number;
  lastTransactionTick: number;
};
```

`BurgMarketLedger.merchants[].revenue/share` は現在、自動生産の `Deal` と人口から毎回再計算する**表示用の推定シェア**である。その値を個人の現金帳簿として再利用してはならない。`MerchantGoodSalesLedger` を Economy slice に別途置き、売買履歴には `merchantId` も保存する。行は、プレイヤー取引が初めて成立した `Market × Merchant × Good` にだけ作るので、プレイヤー一回の取引の計算量・更新行数は一定である。

購入時の金銭配分は次のようにする。税は商品代金に含めず別に計算する。

```text
goodsValue       = units * player ask price
merchantProfit   = goodsValue * retailMarginBps / 10,000
marketNetRevenue = goodsValue - merchantProfit
salesTax         = goodsValue * point-of-sale tax rate

Character[merchantId].wealth += merchantProfit
MerchantGoodSalesLedger.playerRetailProfit += merchantProfit
Market.marketTreasury.balance += marketNetRevenue
State.treasury += salesTax
Player.wealth -= goodsValue + salesTax
```

つまりプレイヤーが大量に A を買えば、A の販売権を持つ商人だけが取引と同時に富み、他の競合商人の `wealth` は増えない。Market treasury は卸売在庫・補充・買取の共通資金を保ち続けるので、商会ごとの在庫所有・借金・輸送資産まで直ちに分割する必要はない。Player が商品を売る場合は、担当商会の取扱実績だけ記録し、買取資金は v1 では従来どおり Market treasury から出す。個別商会が自己資本で買い取る信用・破産モデルは後続に分ける。

担当商人が死亡・失踪した場合、既存の商人後継処理で portfolio を再配分するまで Manager を暫定担当にする。既に確定した `Character.wealth` と過去の取引行は書き換えない。これにより、現在の商人 Character 群をゲーム上の意味ある勝者・敗者にしつつ、毎月の全商品・全都市・全商人の収支計算は導入しない。

## 4. 採用する在庫モデル

### 4.1 永続データ

Economy の namespaced slice に、概念上次のデータを追加する。実際の保存場所は `simulation.extensions.economy` とし、`pack` augmentation を再導入しない。

```ts
type RetailGoodStock = {
  /** 店頭にあり、この Burg で即時に売買できる Economy unit 数 */
  onHand: number;
  /** 次回補充時に目指す店頭量。診断・UI用で、在庫の二重計上には使わない */
  target: number;
  lastRestockedTick: number;
  /** 現在棚にある在庫の加重平均輸送日数。価格差に使う */
  transportDays: number;
};

type BurgRetailInventory = {
  burgId: number;
  marketId: number;
  goods: Record<number, RetailGoodStock>;
};

/** Market が所有し、この Burg の集荷所・卸売倉庫に実在する在庫 */
type BurgWholesaleInventory = {
  burgId: number;
  marketId: number;
  goods: Record<number, number>;
};

/** 個々の荷車 Character は作らないが、移動中の貨物は位置と到着時刻を持つ */
type MarketShipment = {
  id: number;
  marketId: number;
  goodId: number;
  units: number;
  originBurgId: number;
  destinationBurgId: number;
  dispatchedTick: number;
  arrivalTick: number;
  travelDays: number;
};

type PlayerMarketTransaction = {
  id: number;
  tick: number;
  characterId: number;
  burgId: number;
  marketId: number;
  /** この Good の販売権を持ち、利益を受け取る商会主 */
  merchantId: number;
  direction: "buy" | "sell";
  goodId: number;
  units: number;
  unitPrice: number;
  goodsValue: number;
  merchantProfit: number;
  salesTax: number;
  totalPaid: number;
};
```

`Character.inventory?: Record<number, number>` は既に Characters の型に存在する。プレイヤーが購入した Goods はここへ増やし、売却時に減らす。市場・Burg・Character のいずれも同じ `inventory` を共有してはならない。

### 4.2 守る不変条件

市場 `m` と品目 `g` について、常に次を満たす。

```text
Market.goods[g].stock
  = Σ Burg の retail[m, Burg, g].onHand
  + Σ Burg の wholesale[m, Burg, g].onHand
  + Σ shipment[m, g].units
retail, wholesale, shipment の各量 >= 0
```

`Market.goods[g].stock` を「中心都市の倉庫在庫」に意味変更してはならない。既存の生産、隊商、輸出 staging、建設、造船がこの数値を販売可能な市場合計として読んでいるためである。位置台帳はこの合計の内訳であり、同じ command で更新・検証する。Markets Overview では、今後 `Total market stock`、`Retail shelves`、`Wholesale depots`、`In transit` を分けて表示する。

### 4.3 初期配分と補充

市場生成後、および月次の Economy 生産精算の直後に `RetailInventory.planReplenishment(marketId)` を実行する。各 Economy tick では `MarketShipment` のうち到着時刻を過ぎたものを到着 Burg の卸売在庫へ移す。

1. **生産地への計上:** Burg B の製造品は、まず B の卸売・集荷在庫へ入る。農村セルの生産は、道路・水路で到達可能な最寄りの同一 Market Burg を `collectionBurg` として生成時に決め、そこへ入れる。これにより「どの村で作られたか」を失わない。既存セーブの所在不明な旧在庫だけは、移行時に Market 中心 Burg の卸売在庫へ置く。
2. **店頭目標の算出:** Market に属する有効 Burg を列挙し、各 Good の `target` を人口シェアと `marketFlowBudget` の cycle demand から計算する。初期値は **0.5 cycle 分の local cover** を上限とし、Good の demand / bulk / luxury 分類で係数を変えられるようにする。
3. **直送する補充計画:** 店頭が不足する Burg に対し、同じ Burg の卸売在庫を先に棚へ移す。足りなければ、在庫を持つ Burg のうち配送コスト（経路時間、道路・水路、危険度）最小のものから選び、`originBurg -> destinationBurg` の shipment を作る。中心 Burg を経由地として自動選択しない。
4. **到着後の販売:** 到着貨物は到着 Burg の卸売在庫となり、次の補充処理で店頭へ置かれる。店頭 `onHand` に入るまではプレイヤーは買えない。日中の Buy 操作で他都市から瞬間補充しない。
5. **供給不足時:** 合計在庫が不足するときは、全店へ最低限の比率で配分する。一都市だけが全量を抱えないようにする。中心都市には小さな優先係数を持たせてもよいが、首都への全量集中はしない。

この粒度では個々の隊商・商人 Character は生成しない。一つの `MarketShipment` は月次の集約貨物であり、実際の荷車の列を表すものではない。しかし、出発地・到着地・到着時刻を保存するため、貨物の場所と待ち時間は曖昧にしない。補充・到着は同一 Market 内の内部移送であり、`Market.goods.stock`、価格、`Deal`、隊商を増減させない。市場間の移動は既存の `runGlobalTrade()` / Export staging / Caravan が引き続き唯一の経路である。これにより、都市小売在庫を追加しても既存の物流量を二重計上しない。

### 4.4 村で買う場合と、首都を経由しない物流

村・町 B にいるプレイヤーが買えるのは、B の店頭にある `retail.onHand` だけである。B が製造地であっても、生産者から無制限に直接買う「farm-gate」取引は v1 では提供しない。B の抽象的な商人が B の卸売・集荷在庫を店頭へ出した量を買う。これは商人 D が一人で独占しているという意味ではなく、その Burg の商業組織を集約して表す。

したがって、B で作られる商品 A については次のようになる。

```text
B で生産 -> B の卸売在庫 -> B の店頭 -> プレイヤーが B で購入
                         \-> C の店頭が不足する時だけ B -> C の輸送中在庫 -> C の卸売在庫 -> C の店頭
```

C の需要を満たすために A が B から C へ送られた後、B の店頭が不足したなら、補充計画はまず B に残る卸売在庫・新しい B の生産を使う。それも尽き、実際に C にしか余剰がない時だけ C -> B の返送を作る。**市場の中心であることを理由に B -> C -> B を強制することはない。**

村 E で生産される商品 F を B で買う場合も同じである。B の店頭が必要とし、E の卸売在庫が最も安い供給源なら、貨物は `E -> B` として直接送られる。C の棚または倉庫を通るのは、C に在庫が実際にあり、かつ C が最も合理的な供給源である場合だけである。輸送中の F は B では買えず、到着して店頭に補充された後に買える。

保存量を抑えるため、`onHand === 0` かつ `target === 0` の Good 行は slice に保存しない。ただし、在庫がある品目を一度に全都市へ配分しても、通常の Burg 数 × Good 数は扱える規模であり、正確さを犠牲にした「購入時に初めて在庫を作る」遅延生成は採らない。

### 4.4 現行画面への反映

- Goods Editor の全世界在庫は、Market 合計を一度だけ足す。店頭行を別に足して二重計上してはならない。
- Goods Stock ダイアログは、Market 合計と各 Burg の店頭内訳を階層表示する。合計列は Market 合計だけである。
- Markets Overview の品目表は地域合計、店頭合計、卸売在庫、輸送中量、基準価格を示す。
- Burg の経済概要には、その Burg の店頭在庫と「この都市で購入可能」の表示を追加する。都市生産プレートの数字は変更しない。

## 5. 価格と金銭決済

### 5.1 価格は「市場圏の公示価格 + 小売差」

完全な全国一律価格にも、都市ごとに独立した価格曲線にもせず、次を採用する。

```text
midPrice       = Market.goods[goodId].price
marketAsk      = customerBuyPrice(midPrice, burgId, goodId)
marketBid      = customerSellPrice(midPrice, burgId, goodId)
localityFactor = 1 + localDistributionSurcharge(burg, goodId)

player ask = marketAsk * localityFactor
player bid = marketBid / localityFactor
```

- `midPrice` は Market 全体で一つ。既存の需給、戦争、food stress、交易による変化をそのまま受ける。
- `customerBuyPrice` / `customerSellPrice` の既存 10% spread は維持する。ただし名前は「顧客が買う／売る」の向きが読み取りづらいため、新 API では `marketAskPrice` / `marketBidPrice` を導入し、旧名は互換 alias にする。
- `localityFactor` は Market 中心からの距離ではなく、その Burg の棚に実際に届いた在庫の加重平均配送日数を小さく表す。同一 Burg の卸売在庫から棚へ置ける品は 1.00、到着在庫は一日ごとに 0.4% を加算し、遠隔・悪路でも上限は 1.15 とする。道路・河川・海路グラフがある場合は `TradeRoutePlanner` と隊商速度で配送日数を求め、旧データで経路が得られない場合だけ直線距離へフォールバックする。
- したがって B の製造品が B の店頭にあるなら、B の価格は通常 C と同額か低く、必ず C の価格で買うわけではない。逆に C に多量の在庫があり B へ返送する局面では B の価格が高くなり得る。同一商圏の基準価格は一つだが、実売買価格は配送費を含む。この差は個別の都市価格投機ではなく、店頭への配送・回収費を表す。

価格をリクエスト側から渡してはならない。コマンド実行時に再見積もりし、実際に成立した単価・税・合計を receipt として返す。市場価格は購入後に既存と同じ市場圧力で上げ、売却後に下げる。

### 5.2 お金の行き先

プレイヤー売買は、既存の一般 Goods 自動生産会計を全面改修せずに、**Player Character・担当商人 Character・Market の間だけ保存する現金取引**として導入する。

| 操作 | 商品 | 現金 | 税 |
| :-- | :-- | :-- | :-- |
| Player buys | Burg 店頭 `onHand`、Market 合計、Character へ同量を移す | `Character.wealth` を減額。商品代金は担当商人の小売粗利と `market.marketTreasury.balance` の純収入へ分ける | point-of-sale Burg の `state.salesTax` を `state.treasury` へ入れる。支払総額には税を含める |
| Player sells | Character から Burg の卸売在庫へ移し、Market 合計を増額する（次の補充時に店頭へ配分する） | `market.marketTreasury.balance` を減額し、`Character.wealth` を商品代金分増額 | v1 は買取時の追加税なし。後続で商人課税を導入する場合も player の受取額を遡及変更しない |

`marketTreasury.balance` は既に商会の実在する運転資金であるため、プレイヤー取引の相手方に使う。`BurgMarketLedger.revenue` は表示用の導出値なので使わない。一般 Goods の既存 `Markets.buy()` / `sell()` が作る自動生産 `Deal` の決済を、この変更に合わせて遡及実装することもしない。

買取は、(a) Character の所持量、(b) Market の空き受入れ量、(c) `marketTreasury.balance` の三つで上限をかける。資金不足時に `ruralGrainPayable` のようなプレイヤー向け未払を作らない。売り手にとって「即金で買う店」であることを v1 の契約とする。

## 6. 売買サービスと拡張境界

Economy が Nobility の Zustand store や Characters の UI を直接読む設計にはしない。Economy は価格・小売在庫・市場資金・税計算を所有し、プレイヤー選択と表示は Nobility / Characters 側が持つ。

ホストの `ExtensionAPI` に、他拡張から利用できる小さな commerce contract を追加するか、同等の明示的な command facade を作る。

```ts
type RetailQuoteRequest = { characterId: number; burgId: number; goodId: number; units: number };
type RetailQuote = {
  maxBuyUnits: number;
  maxSellUnits: number;
  merchantId: number;
  merchantName: string;
  askUnitPrice: number;
  bidUnitPrice: number;
  salesTax: number;
};

// Economy 所有。コマンド実行中に全検証・全更新を一つの commit として行う。
commerce.quote(request): RetailQuote;
commerce.buy(request): PlayerMarketTransaction;
commerce.sell(request): PlayerMarketTransaction;
```

`characterId` は常に明示し、Economy は「現在のプレイヤー」をグローバルに探さない。Nobility の Player Character Panel が選択中 ID と現在地を解決して渡す。これなら将来、一般 Character、隊商、クエストからも同じ取引サービスを使える。

`commerce.buy` / `commerce.sell` は `registerExtensionCommand()` の一つの transaction で実行し、次をすべて確認してから書き換える。

1. Economy と必要な Character データが有効で、Character は生存し、移動中でなく、`character.location === burgId` である。
2. Burg と Market が存在し、`burg.market === marketId`、Good が有効である。
3. 正の有限 units、店頭在庫または Character inventory、現金、税、受入れ上限を検証する。
4. 価格を再計算する。古い画面の quote、クライアントが渡した価格、負数・NaN を信用しない。
5. 商品、Player と担当商人の `Character.wealth`、`Character.inventory`、店頭在庫、Market 合計、Market treasury、State treasury、品目別商人帳簿、取引ログを同時に更新する。

失敗時は何も変更しない。成功時は Economy / Character / State の変更 topic を一 commit として publish し、UI は receipt を描画してから再読込する。`Deal` は自動生産・市場間交易の記録のままにし、プレイヤー取引を偽の `burg ↔ market` Deal として混ぜない。

## 7. プレイヤー向け UI

### v1 の入口

Player Character Panel に、現在地が有効 Market Burg のときだけ **Trade at <Burg>** を表示する。押すと `Character Market` ダイアログを開く。

- 上部: Character 名、所持金、所在地、Market 名、Market Manager 名
- 品目表: icon、品名、**担当商人名**、単位フレーバー、店頭在庫、購入単価、買取単価、プレイヤー所持量、数量入力、Buy / Sell
- 下部: 商品代金、売上税、合計、取引後の所持金を確認できる見積り
- 履歴: 直近の `PlayerMarketTransaction`。自動生産の Bought / Sold 行は載せない

Market Overview からも「Visit as selected character」を開けるが、Character が別の Burg にいる場合は、その中心市場に瞬間移動して売買させず、「<current Burg> で取引する」へ誘導する。地図の Markets レイヤーを押す行為は市場圏の管理・診断であり、遠隔購入ボタンにはしない。

### 表示上の保留事項

`Good.value` と `Market.goods.price` は Economy unit（多くは卸売ロット）の会計値であり、必ずしもパン一個・ワイン一杯の小売価格ではない。[goods-unit-scale.md](goods-unit-scale.md) の unit flavor と [currency-denomination.md](currency-denomination.md) の通貨表示を取引画面でも再利用する。ロットを分割して個売りする仕組みは本計画の対象外である。

## 8. 実装フェーズと受入条件

### Phase 0 — 意味の是正（先行して安全に実施可能）

- Goods の三表示のツールチップと UI 文言を §2 に合わせる。
- `Production Overview` を `Burg Production Ledger` に改名し、`bought` / `sold` の説明を自動生産向けに変える。
- 関連する Playwright selector・説明を更新する。SVG と WebGL hybrid の双方で同じ pick / dialog 経路を用いる。

**受入条件:** 数字なし資源アイコンをクリックしても市場在庫や取引画面を開かず、数字付き都市プレートが生産記録を示すことが UI 文言から明確である。

### Phase 1 — 小売在庫の正本と補充

- `RetailInventory` module、slice schema / migration / validator を Economy に追加する。
- Market ごとの商人 portfolio を既存 Manager / Rival Merchant から初期化し、死亡・後継時の再配分と `MerchantGoodSalesLedger` の migration を実装する。
- 新規生成、map load、Market 追加・削除・territory 変更、Good 無効化・削除、月次生産精算に対する reallocate を実装する。
- Markets / Goods Stock の集計を二重計上せず、店頭・卸売・輸送中の所在を表示するように更新する。

**受入条件:** 任意の Market / Good で §4.2 の所在合計が `Market.goods.stock` と常に一致し、輸送中の品を買えず、再生成・保存読込・市場削除後にも孤児行が残らない。

### Phase 2 — quote と原子的な player transaction

- `commerce.quote/buy/sell` と receipt / 監査ログを実装する。
- `Character.inventory`、Player と担当商人の `wealth`、Market treasury、State treasury、`MerchantGoodSalesLedger` の更新を一 command にする。
- Character が別都市・移動中・死亡・無市場地にいる場合を拒否する。

**受入条件:** 1 回の購入／売却について、商品と Player・担当商人・Market・State の現金変化を receipt から追跡でき、失敗した command はすべての残高と在庫を不変に保つ。

### Phase 3 — UI とゲームプレイ接続

- Player Character Panel / Character Market Dialog を追加する。
- Inventory を Character Details に表示し、取引履歴へリンクする。
- 取引後に Economy、Player HUD、Market Overview の更新を commit 購読で同期する。Renderer から state を書き換えない。

**受入条件:** プレイヤーが都市 A で買った品が Character inventory に残り、都市 B の別 Market で売るまで市場在庫へ戻らない。同一 Market の別都市では A の店頭在庫だけが即時に減り、月次補充まで無限購入できない。

### 必須テスト

- retail・wholesale・shipment 合計、到着時刻、非負値の property / unit tests
- 品目群の担当商人、低在庫、低所持金、低 Market treasury、税あり、境界をまたぐ Market、無市場 Burg の command tests
- 購入→保存→読込→売却で inventory と money が保存される integration test
- SVG と `webglHybrid` の双方で、Goods icon / Burg plate / Market icon が正しいダイアログへ行く E2E test
- `Market.goods.stock` を二重計上しない Goods Editor / Market Overview regression test

## 9. 明示的に採用しない案

| 案 | 不採用理由 |
| :-- | :-- |
| 全商品を Market 中心 Burg にだけ置き、他都市では取引不可 | 商圏と都市の生活を表せず、プレイヤー移動と地域性を不必要に阻害する |
| 都市ごとに商人 Character を必ず生成する | NPC 数、死亡、移動、雇用の整合性だけを増やし、v1 の売買価値を増やさない |
| `Market.goods.stock` を各都市在庫へ完全に置換する | 生産・隊商・建設・造船・市場間交易が読む既存正本を同時に壊す |
| プレイヤー取引を既存 `Deal` に混ぜる | 自動生産の `Bought` / `Sold` と UI・会計・履歴が再び混線する |
| 全商人に同じ Good を同じ市場価格で販売させる | 価格競争を未実装のまま利益帰属だけを曖昧にし、プレイヤーの大量購入が誰を富ませたか説明できない |
| upstream の Goods / Production Overview を移植する | TypeScript / React / slice / command / WebGL architecture と隔絶しており、現在のモデルを後退させる |
| 一般 Goods の既存自動会計を同時に完全決済へ変える | Food Ledger 以外の生産・税・隊商・商人 ledger を一括再設計する範囲拡大になる |

## 10. 未決定だが v1 を止めない事項

- 小売在庫目標の品目別係数（bulk / staple / luxury / military）の実数は、既存 `marketFlowBudget` の 12-cycle 診断で調整する。まずは共通の 0.5 cycle cover で導入してよい。
- 遠隔地 surcharge を実経路時間から計算するか、補充元 Burg からの簡易距離にするかは Phase 2 の性能測定で決める。価格の上限だけは v1 から持つ。
- 店頭の品目ごとの容量、注文取り寄せ、信用取引、盗難、商会の従業員・出資者への収益配分は後続テーマである。
- 商会ごとの自己資本、在庫所有、個別の輸送資産、買取不能・破産は後続テーマである。v1 では販売権と小売粗利だけを個人へ帰属し、共同の Market treasury を卸売・補充・買取資金として残す。
- プレイヤーが所持品を消費・装備・贈与・隊商へ積む機能は、今回の「購入して所有する」境界の後に別計画で接続する。
