# 悪徳商人と物の市場（D）

**状態**: 調査メモ。未実装。  
**日付**: 2026-09-07  
**前提**: 請負・高利の悪徳商人（A）は実装済み。本書は、物の売買そのものへ悪徳商売を差し込む余地の調査結果と、将来 D を実装するときの衝突点。

関連:

| 文書 | 関係 |
| :--- | :--- |
| [occupation-epithets.md](./characters/occupation-epithets.md) | `unscrupulous_merchant` / `magnate`。系統 `commerce` は 1 人 1 id |
| [characters.md](./characters.md) | 軍人×悪徳商人の癒着で軍費が膨らむ、という未実装の意図 |
| [economy-market-accounting-audit.md](../simulation/economy-market-accounting-audit.md) | Market 現金と商人 `revenue` の会計境界 |
| [player-character-market-commerce.md](./player-character-market-commerce.md) | 品目販売権と小売マージン（プレイヤー売買） |
| [merchant-logistics-warehouses.md](./merchant-logistics-warehouses.md) | 輸出倉庫・交易運転資金（商会単位） |
| [multi-ledger-fiscal-architecture.md](./multi-ledger-fiscal-architecture.md) | 請負・信用プール・シンジケート（A の層） |

---

## 1. 結論

現行の Goods / 価格 / 隊商は **商人の意志で値が付く市場ではない**。価格は需給式、在庫は市場圏合計、取引資本は商会の `marketTreasury` である。A で動かした請負・高利は国庫（L2）を削るが、店頭の値段・品質・売り惜しみは動かさない。

D を足すなら、次のどれかを **個人に紐づける新しい経路** が要る。既存の `initializeMarketPrices()` に greed を掛けるだけでは、Walrasian 価格と衝突し、二つ名の「証拠」にもならない。

| 典型的な悪徳 | 現行 | D に必要なもの |
| :--- | :--- | :--- |
| 暴利（法外な小売・卸） | 全市場共通 `MARKET_MARGIN` 10%。価格は需要/在庫 | 個人の上乗せと、それが誰の財布に入るか |
| 売り惜しみ | 輸出予約は利益式。戦時備蓄は `warIntensity` | 人格で出荷を止める／放出する操作 |
| 品質偽装・目減り | Goods に品質次元がない | ロット品質、発覚、需要・衛生への効果 |
| 同一商品の価格競争 | 意図的に非モデル（品目群の独占販売権） | 競争そのものを導入するか、独占の濫用としてモデルするか |
| 軍需の水増し請求 | `consumeForMilitary()` は在庫の無料引き | 代金パス、水増し、将とのキックバック |

A の二つ名は生成時の greed/honor と財政役職で付く。D の事件ログ（暴利・偽物・軍需水増し）はまだ無いので、D を証拠に使ってはいけない。

---

## 2. 現行モデル（調査時点）

### 2.1 商人は価格決定者ではない

各 Market に管理者 1 人と競合商人 2 人、商会（表示名 `… Company`）が付く。`Markets.generate()` のあと `syncMerchantOrganizations()` が管理者を chairperson にする。

役割は **品目群の販売権ラベル** である。`merchantPortfolios.ts` は同一 Good の価格競争を意図的に持たない。`retailMarginBps` は既定 1,200（12%）の定数で、プレイヤー売買の領収書にしか使わない。

価格の正本は `Markets.initializeMarketPrices()`（`markets-generator.ts`）。需要/在庫比、製造原価、弾性、戦時補正 `getWarPriceModifier()`、通貨量。客側の売買は:

```text
buy  = midPrice * warMod * (1 + MARKET_MARGIN)   // MARKET_MARGIN = 0.1
sell = midPrice * warMod * (1 - MARKET_MARGIN)
```

商人個人の greed / honor はここを見ない。戦時の値上がりは `BurgMarketLedger.warIntensity` の制度補正であり、商人の売り惜しみではない。

### 2.2 商人の売上は現金ではない

`BurgMarketLedger.revenue` は当期 Deal / `burg.product` の表示用再配分である。重みに stewardship・greed・guile が入るが、`Character.wealth` にも `marketTreasury` にも入らない。会計監査の評価は「商人の支配・人格拡張の土台。資本台帳ではない」。

市場間交易（`runGlobalTrade`）は物を動かし Deal に価格を書くが、Market 間の現金移転はしない。交易運転資金は `marketTreasury.tradeWorkingCapital`（商会単位）。個人の財布ではない。

農村の一般 Goods は物量だけ市場在庫へ入り、代金が無い。stapleFood（穀物）だけ `marketTreasury.balance` / `ruralGrainPayable` で決済する。

### 2.3 軍需・食料・塩は商人が介在しない

- **軍需**: `MilitaryResources.settleMonthly()` → `Markets.consumeForMilitary()`。在庫を減らし、代金を払わない。`docs/plan/characters.md` の「軍人×悪徳商人で軍費に悪影響」は favor / Taste の計画止まり。
- **食料**: 価格はカバー率の式（0.8〜2.0 倍）。都市小売の余りが農村 IOU 返済のあと商会資本になる。商人は値を付けない。
- **塩**: 国家管理。内陸国は「商人プール」へ発注するが、キャラの人格は入らない。

Goods に品質・偽物・目減りのフィールドはない。衛生・倉庫ネズミは civic の将来行で、商人の故意ではない。

### 2.4 すでに商人人格が効いている場所（D ではない）

これらは A 側。D で二重に「暴利」を足さない。

- 請負漏出: `fiscalEvents.getTaxFarmPersonalityFactor`（首都市場管理者の greed/honor）
- 公債金利: `moneylenders.getStateDebtInterestRate`（シンジケート平均 greed、最大 +50%）
- 債権支払いの個人スキム、不履行時の信用プール逃避 / merchant mutiny
- Burg 売上シェアの表示重み（現金ではない）

---

## 3. D を足すときの衝突

1. **需給価格を greedy で底上げすると、不足と暴利が区別できない。** いまの高値は「無いから高い」。悪徳の証拠にするには、需給ターゲットからの **個人プレミアム** と、そのプレミアムの受取人を分ける必要がある。
2. **販売権が品目群で独占** なので、「競合より高く売る」は現行データでは起きない。D の暴利は独占の濫用（マージン拡大）として書くのが、競争導入より小さい。
3. **現金の受け皿が個人に無い。** プレミアムを `Character.wealth` に入れるなら、Market 残高か Burg 支出のどちらから出すかを先に決める。監査文書は `BurgMarketLedger.revenue` を現金化することを禁じている。
4. **Characters は Economy を静的 import しない。** 暴利・偽物のログを二つ名の証拠にするなら、craft の `readEconomyCraftSkill` と同じ seam、または Character 上の累計フィールドが要る。
5. **`commerce` は 1 id。** 豪商と悪徳商人は共存しない。D の事件で後から悪徳に張り替えるなら、fill-if-empty をやめ、系統の上書き規則が要る。

---

## 4. 将来の段階（未着手）

小さい順。A の請負・高利を壊さないこと。

### D1 — 独占マージンの人格化（最小）

`MarketMerchantPortfolio.retailMarginBps` を管理者/担当商人の greed/honor で動かす。いまはプレイヤー売買にしか効かない。NPC の `customerBuyPrice` に同じプレミアムを載せるなら、都市消費・原料仕入が高くなり、`burg.treasury` を削る。受取を `marketTreasury.balance` または担当の `wealth` のどちらにするかを先に決める。

対象ファイル: `merchantPortfolios.ts`, `markets-generator.ts`（`customerBuyPrice` / `MARKET_MARGIN`）, `playerCommerce.ts`。

### D2 — 軍需を有料化する（設計意図に直結）

`consumeForMilitary` を無料引きから、Market 価格（＋悪徳プレミアム）の支払いへ変える。払い元は marshalcy / L2。差額の一部を商人と、癒着した将の L0 へ。`characters.md` の軍費悪影響はここ。軍需が無料のままマージンだけ足しても、国庫は減らない。

対象ファイル: `militaryResources.ts`, `markets-generator.ts`（`consumeForMilitary`）, 部門予算の marshalcy。

### D3 — 売り惜しみ

輸出予約（`exportStaging.ts` / `MerchantTradeCapital`）に「出荷を遅らせる」判断を足す。高 greed・低 compassion の管理者が、高値市場へ出す量を絞る。戦時 `wartimeTradeReserveMultiplier` は制度備蓄のまま残し、商人の売り惜しみと混ぜない。

### D4 — 品質・偽物

Good ロットに品質を足すのは大きい。D1–D3 より後。civic の倉庫衛生・ネズミは故意の偽装ではないので、流用しない。

---

## 5. やらないこと

- `initializeMarketPrices()` の需給ターゲット自体を greed で歪めること（不足と暴利が区別できなくなる）。
- `BurgMarketLedger.revenue` を突然現金残高にすること。
- 品質フィールドも軍需の代金も無いのに、二つ名の証拠を「偽物を売った」「軍を騙した」にすること。
- A の請負・高利を、D のマージンと二重に「同じ暴利」として加算すること。

---

## 6. 参照コード

| 領域 | ファイル |
| :--- | :--- |
| 価格 | `src/extensions/economy/generators/markets-generator.ts`（`initializeMarketPrices`, `customerBuyPrice`, `MARKET_MARGIN`, `consumeForMilitary`） |
| 販売権 | `src/extensions/economy/generators/merchantPortfolios.ts` |
| 商人シェア | `src/extensions/economy/generators/burgMarketLedgers.ts`（`getMerchantWeight`） |
| 交易資本 | `src/extensions/economy/generators/merchantTradeCapital.ts`, `exportStaging.ts` |
| 軍需 | `src/extensions/economy/generators/militaryResources.ts` |
| 食料価格 | `src/extensions/economy/generators/foodLedgerConsumption.ts` |
| 請負・高利（A） | `fiscalEvents.ts`, `creditPool.ts`, `moneylenders.ts` |
| 二つ名 | `src/extensions/characters/occupationEpithets.ts` |
