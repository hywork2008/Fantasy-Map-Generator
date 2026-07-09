# 経済

参考資料 docs/plan/char-economy.md

## マーケット

Statesと同じようにBurgsというNodeがRoutesで繋がっている。
国は兵を動かしてこれらの支配地域を広げるが、マーケットはライバルを蹴落としたり協力して商売における支配地域を広げる。
売上の一部は税としてマーケットが位置する国家に取られる。
State AとBがそれぞれ15, 20 Burgsを持つとする。
Market CはAの支配地域に5、Bの支配地域に10と重なっていたら、税はそれぞれの地域を支配する国に、その国の税率で支払われる。
なのでStatesとMarketsの重なりは必ずしも一致する訳では無い。

### Market Manager

キャラクターの能力値はdocs/plan/characters.mdを参照。

PietyやZealが高い商人は同じ宗派の宗教国家で商売しやすい。
※つまり登場人物には信仰を設定する必要がある。無宗教含む。


#### Skills

どの分野の商品の目利きが出来るかはSkillsによる。
Intrigueが高く、マーケットが広域の商人は為政者と癒着して情報で儲ける事が出来る。

#### Personality

Greedが高い商人は安く仕入れて高く売ろうとする。
CompassionやHonorが高く、Greedが低い商人は儲けでは無く、社会の公益性の為に商売をする。
Guileが高い商人は人を騙しやすく、騙されにくい。為政者との癒着を狙う場合もこれが高い方が良い。

## 戦争の余波

戦争によって都市BurgのWealthやTreasuryが低下する時、その都市のマーケットはどのMarket Managerも支配していない、商売の空白地帯となる。
その空白地帯で一定期間内に最大の売上・市場シェアを握った商会が、その都市のマーケットの支配者となる。

## 実装状況: Burgごとの商人シェア

このセッションで、Market全体の責任者である`Market Manager`とは別に、各Burgの都市市場で複数商人が売上シェアを持つ仕組みを追加した。

### 実装済みデータモデル

`src/extensions/economy/generators/burgMarketLedgers.ts`を追加し、`pack.burgMarketLedgers`を正規データとして持つ。

```ts
export interface BurgMarketLedger {
  burgId: number;
  marketId: number;
  merchants: BurgMarketMerchantEntry[];
  lastUpdatedTick?: number;
  vacantSinceTick?: number;
}

export interface BurgMarketMerchantEntry {
  characterId: number;
  revenue: number;
  share: number;
  influence?: number;
}
```

- `controllerCharacterId`は保存しない。
- 都市市場の支配商人は、`merchants`のうち`share`または`revenue`が最大の商人として導出する。
- 各商人キャラクターには`CharacterRole`として`source: "economy"`, `kind: "burgMarketMerchant"`, `entityType: "burg"`を付与する。
- `share`は保存時に`revenue / totalRevenue * 100`で再計算する。

### 実装済み同期処理

`syncBurgMarketLedgers()`を追加した。

- Market所属の各Burgに2-5人の商人を作成する。
- 人口、首都、港、plazaに応じて商人数を増やす。
- Market中心Burgでは、既存の`market.managerCharacterId`を商人リストに含める。
- 売上配分は`stewardship`, `intrigue`, `diplomacy`, `sociability`, `greed`, `guile`, `prestige`, `appearance`で重み付けする。
- BurgがMarketから外れた場合、古い`burgMarketMerchant` roleを掃除する。
- Economy無効化時は`pack.burgMarketLedgers`とEconomy-only商人roleを削除する。

呼び出し箇所:

- `Markets.generate()`
- `Markets.addMarket()`
- `Markets.removeMarket()`
- Markets manual assignmentのapply時
- `Production.produce()`後
- Economy有効化時
- map reinit hook

### 実装済みUI

Market Overviewをタブ化した。

- `Goods`タブ: 既存の品目別stock/price表。デフォルト表示。
- `Burg merchants`タブ: 今回追加したBurgごとの商人シェア表。

`Burg merchants`タブには以下を表示する。

- Burg
- Top Merchant
- Share
- Revenue
- Rivals

Cell Infoにも`Market Holder`行を追加し、選択セルにBurgがある場合は支配商人名とshareを表示する。

Characters Detailsでは、`burgMarketMerchant` roleをBurg名とMarket名で表示する。

### 実装済みTrade Opportunities

安く買って高く売る候補を見るため、`MarketTradeOpportunitiesDialog`を追加した。

導線:

- Market Overview footerの`icon-exchange`
- Markets Overview footerの`icon-exchange`

内容:

- `<select>`で品目を選ぶ。
- 各Market間の価格差から、利益が出る候補だけを表示する。
- 表示項目は`Buy at`, `Sell at`, `Buy`, `Sell`, `Cost`, `Unit profit`, `Units`, `Total`。
- CSV export対応。

計算式:

- buy price: source marketの`Markets.customerBuyPrice(sourceGood.price)`
- sell price: target marketの`Markets.customerSellPrice(targetGood.price)`
- transport cost: Market中心Burg間距離をmap diagonalで正規化し、`good.value`を掛ける
- unit profit: `sellPrice - buyPrice - transportCost`
- total profit: `unitProfit * sourceGood.stock`

この計算は`goods x markets^2`で、現在のMarket数なら十分軽い。UIでは上位200件に制限している。

### 追加テスト

追加・更新したテスト:

- `src/extensions/economy/generators/burgMarketLedgers.test.ts`
- `src/extensions/economy/controllers/marketTradeOpportunities.test.ts`

確認済み:

- 各Burgに複数商人が作られる。
- `revenue`から`share`が再計算され、合計がおおむね100%になる。
- Market中心BurgではMarket Managerが商人リストに含まれる。
- BurgがMarketから外れると古い商人roleが掃除される。
- 価格差がある品目について、buy-low / sell-high候補が生成される。

実行済み検証:

- `npx vitest run src/extensions/economy/controllers/marketTradeOpportunities.test.ts src/extensions/economy/generators/burgMarketLedgers.test.ts src/extensions/economy/generators/marketManagers.test.ts src/extensions/economy/generators/markets-generator.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

## 今後実装すべき内容

### 品目ごとの商人シェア

現在の`BurgMarketLedger`はBurg全体の総売上シェアだけを持つ。Market Overviewの`Burg merchants`タブで品目ごとに表示を切り替えるには、品目別売上を保存する必要がある。

候補データモデル:

```ts
export interface BurgMarketMerchantEntry {
  characterId: number;
  revenue: number;
  share: number;
  revenueByGood?: Record<number, number>;
  shareByGood?: Record<number, number>;
  influence?: number;
}
```

または、より正規化するなら以下の別ledgerを追加する。

```ts
export interface BurgMarketGoodLedger {
  burgId: number;
  marketId: number;
  goodId: number;
  merchants: BurgMarketMerchantEntry[];
}
```

推奨は前者。現UIのBurg単位ledgerに自然に載り、保存量と実装差分が小さい。

実装内容:

- `Production.produce()`でBurgがMarketへ売った`Deal`を品目ごとに集計する。
- 各商人の`revenueByGood[goodId]`を能力・性格補正で配分する。
- `shareByGood[goodId]`を再計算する。
- `MarketOverviewDialog`の`Burg merchants`タブ上部に`<select>`を置き、`All goods`または特定Goodで表を切り替える。

処理量は`burgs x merchants x goods`になり得るが、実際には「そのBurgで売上が発生したGood」だけを対象にすれば軽い。

### 商人の信仰・宗教国家との相性

メモにある「PietyやZealが高い商人は同じ宗派の宗教国家で商売しやすい」を実装するには、Characterに信仰を追加する必要がある。

候補:

```ts
export interface Character {
  religionId?: number;
}
```

生成時は`pack.cells.religion[burg.cell]`から初期化し、無宗教は`0`または`undefined`として扱う。

その後、商人の売上重みまたは`influence`に以下を反映する。

- 同宗教圏: Piety/Zealが高いほど加点
- 異宗教圏: Zealが高いほど減点
- 世俗的商人: Pietyが低くGreed/Guileが高い場合、宗教相性の影響を小さくする

### 戦争の余波と空白地帯

現在はBurgごとに常に商人ledgerが補完される。戦争や略奪でBurgの`wealth`, `treasury`, `population`, `product`が急落した時の「商売の空白地帯」は未実装。

実装案:

- 前回tickまたは前回production時の`product`, `treasury`, `population`をledgerに保存する。
- 一定割合以上低下したら`vacantSinceTick`を設定する。
- vacant中はTop Merchantのshareを減衰させ、複数商人のshareが接近するようにする。
- 一定期間後、最大`revenue + influence`の商人が新たな支配商人になる。

必要な公開関数:

```ts
markBurgMarketVacant(burgId: number, reason: "warAftermath" | "raid" | "manual"): void
```

NobilityやMilitary系イベントからこの関数を呼ぶことで、戦争結果とEconomyを疎結合に連携できる。

### 商人の行動AI

現在の売上配分は静的な能力重みで決まる。次フェーズでは商人ごとの性格で行動を変える。

- Greed高: 高利益商品の買い占め、価格差の大きいTrade Opportunitiesを優先
- Compassion/Honor高・Greed低: 都市需要の充足、食料や生活必需品を優先
- Guile高: 競合商人のshareを削る、為政者との癒着を狙う
- Intrigue高: 広域Marketや複数Stateにまたがる情報優位で利益を得る
- Stewardship高: 地元Burgの安定した生産・流通で利益を伸ばす

### Trade Opportunitiesの精度改善

現在のTrade OpportunitiesはMarket間価格差からの見積もりで、実際の需要上限や輸送能力は未考慮。

改善候補:

- target market側の不足量、需要、safety reserveを使って`maxUnits`を制限する。
- StateのsalesTaxを輸送前後のコストに含める。
- sea route / road / route距離を使い、直線距離ではなく交易路距離に近づける。
- 商人ごとに得意Goodを持たせ、候補routeを担当商人へ割り当てる。
- 表から選んだrouteを実際の`Deal`または商人行動として予約する。
