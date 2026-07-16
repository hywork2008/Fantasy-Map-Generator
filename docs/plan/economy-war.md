# 戦時経済 — 価格変動システム

## 概要

戦争状態にある国家（State）に属する都市（Burg）では商品価格が変動する。  
軍事物資・生活必需品は高騰し、嗜好品・贅沢品は暴落する。  
価格差を利用して「安い地域で仕入れ、高騰した戦場近くで売る」プレイを可能にする。

> **関連（未実装の設計）**: 春／秋の戦争による作付け・収穫ショック（`foodStress`）は
> `warIntensity` とは別シグナルとして食料生産・流通・価格・翌人口期の餓死へ効かせる。
> 詳細は `docs/plan/military/manpower-ecosystem.md` §18。

---

## 設計提案（最初の案）

### 1. 戦争で価格が変動する物資の分類

#### A. 直接的な軍事物資（極端な高騰）

戦争で直接消費・消耗されるため、最も価格が高騰します。

- 対象品目: Arms, Artillery, Gunpowder, Horses, Elephants, Camels, Harnesses, Ships
- 最大価格倍率: **3.0倍 〜 5.0倍**

#### B. 戦略的原材料・インフラ物資（緩やかな高騰）

- 対象品目: Iron, Copper, Saltpeter, Coal, Leather, Tools, Wood, Cloth, Ropes, Tar
- 最大価格倍率: **2.0倍 〜 3.0倍**

#### C. 生活必需品・食料（期間経過による高騰）

- 対象品目: Grain, Cattle, Fish, Game, Salt, Honey, Boots, Garments
- 最大価格倍率: **2.0倍 〜 4.0倍**

#### D. 嗜好品・贅沢品（価格の暴落）

- 対象品目: Gemstones, Silk, Spices, Gold, Silver, Pearls, Amber, Wine, Tea, Tobacco
- 最大価格倍率: **0.1倍 〜 0.5倍**

---

## 実装済みアーキテクチャ

### データフロー

```
advanceTime() tick
  └─ Economy tick hook (index.tsx)
       ├─ pack.states[].diplomacy で "Enemy" を持つ State を検出
       ├─ その State に属する Burg の BurgMarketLedger.warIntensity を更新
       └─ 30 日ごとに scheduleProductionRefresh(true) を呼び出す

scheduleProductionRefresh (queueMicrotask)
  └─ Production.produce()
       └─ fillBurgsDemand()
            └─ Markets.customerBuyPrice(price, market.centerBurgId, goodId)
                 └─ Markets.getWarPriceModifier(burgId, goodId)
                      └─ BurgMarketLedger.warIntensity + warDurationTicks を参照
                           └─ 商品の warEconomyType に応じた倍率を返す
```

### 関連ファイル

| ファイル | 役割 |
| :--- | :--- |
| `src/extensions/economy/index.tsx` | tick hook。戦争国の検出と warIntensity 更新、月次リフレッシュのスケジュール |
| `src/extensions/economy/generators/burgMarketLedgers.ts` | BurgMarketLedger 型と getBurgMarketLedger() |
| `src/extensions/economy/generators/markets-generator.ts` | getWarPriceModifier() による倍率計算と customerBuyPrice() / customerSellPrice() への適用 |
| `src/extensions/economy/generators/goods-generator.ts` | 各商品の warEconomyType 定義 |

---

## BurgMarketLedger の戦争フィールド

```typescript
export interface BurgMarketLedger {
  burgId: number;
  marketId: number;
  merchants: BurgMarketMerchantEntry[];
  warIntensity?: number;      // 0.0 〜 2.5。戦争中の激しさ
  warDurationTicks?: number;  // 戦争状態の累計日数
}
```

### warIntensity の更新ルール

毎 tick（advanceTime 呼び出しごと）に以下を実行する：

```typescript
// 戦争中の State に属する Burg
ledger.warIntensity = Math.min(2.5, (ledger.warIntensity || 0) + 0.1);
ledger.warDurationTicks = (ledger.warDurationTicks || 0) + effectiveDays;

// 平和になった Burg（回復）
ledger.warIntensity = Math.max(0, ledger.warIntensity - 0.1);
if (ledger.warIntensity <= 0.001) {
  ledger.warIntensity = 0;
  ledger.warDurationTicks = 0;
}
```

| 状態 | warIntensity | warDurationTicks |
| :--- | :--- | :--- |
| 平和 | 0.0 | 0 |
| 戦争中（増加） | 0.1 ずつ増加、最大 2.5 | 日数を加算 |
| 終戦後（回復） | 0.1 ずつ減少 → 0 でリセット | 0 にリセット |

---

## 価格倍率の計算式

`Markets.getWarPriceModifier(burgId, goodId)` が返す倍率：

### 値上がり物資（military / essential / strategic）

```
durationFactor = min(1.0, warDurationTicks / 10)
modifier = 1 + baseMultiplier × warIntensity × (1 + durationFactor)
```

| warEconomyType | baseMultiplier | intensity=1.0 初期 | intensity=2.5 長期 |
| :--- | :--- | :--- | :--- |
| military | 1.5 | 2.5倍 | 最大 8.5倍 |
| essential | 1.2 | 2.2倍 | 最大 7.0倍 |
| strategic | 0.8 | 1.8倍 | 最大 5.0倍 |

### 値下がり物資（luxury）

```
modifier = max(0.1, 1 - 0.3 × warIntensity)
```

| warIntensity | 倍率 |
| :--- | :--- |
| 1.0 | 0.70倍 |
| 2.0 | 0.40倍 |
| 2.5（上限） | 0.25倍（最低保証 0.1倍） |

### 適用タイミング

`Production.produce()` 内の `fillBurgsDemand()` および Markets Overview ダイアログの
`getMarketGoodPrices()` から呼ばれる。倍率は **市場センター Burg の ledger** を参照する。

---

## 商品分類一覧（実装済み）

### military — 軍事物資（baseMultiplier=1.5 / 最大 8.5倍）

Horses, Elephants, Camels, Arms, Gunpowder, Artillery, Sails, Harnesses

### essential — 生活必需品（baseMultiplier=1.2 / 最大 7.0倍）

Grain, Cattle, Fish, Game, Olives, Honey, Salt, Dates,
Furs, Whales, Sugarcane, Garments, Boots, Slaves

### strategic — 戦略原材料（baseMultiplier=0.8 / 最大 5.0倍）

Wood, Iron, Copper, Tin, Tar, Saltpeter, Coal,
Leather, Cloth, Ropes, Barrels, Tools

### luxury — 嗜好品（暴落 / 最低 0.25倍）

Silver, Gold, Marble, Wine, Gemstones, Dyes, Incense, Silk, Spices, Amber,
Pearls, Oil, Tea, Tobacco, Clay, White sand, Ceramics, Glass, Paper, Ink, Books

### warEconomyType 未設定（戦争の影響なし）

以下の商品は現状 warEconomyType が定義されておらず、戦争の影響を受けない。

| 商品 | 推奨分類 |
| :--- | :--- |
| Stone | strategic（建築資材として） |
| Hemp | strategic（ロープ原料） |
| Sheep | essential（食料・毛皮） |
| Preserved food | essential（軍用保存食） |
| Cheese, Beer, Vinegar | essential |
| Candles, Soap | essential または strategic |
| Coins, Jewelry | luxury |
| Liquor | luxury |
| Perfume | luxury |

---

## 更新サイクル

- tick hook が発火するたびに `warIntensity` / `warDurationTicks` を更新
- `Production.produce()` は **30日ごと**（または森林変化時）に実行
- 価格倍率は `produce()` 実行時に動的に計算される（ledger には保存されない）
- マップリロード後も `pack.burgMarketLedgers` に永続化された `warIntensity` が復元される

---

## 今後の拡張候補

- [ ] warEconomyType 未設定の商品への分類追加（Stone, Hemp, Sheep 等）
- [ ] Province / 包囲戦（Siege）フラグによる warIntensity の強制最大化
- [ ] Burg 単位（市場センター以外）での価格差計算
- [ ] Trade Opportunities ダイアログでの「戦争プレミアム」の可視化
- [ ] 戦争終結後のリカバリー価格の段階的変化のUI表示
