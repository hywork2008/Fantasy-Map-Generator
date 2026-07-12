# 交易バランス調整：長距離・小口薄利（害悪）取引の排除と間引き仕様案（改定版）

現在、マップ生成後に `Trade Animation` に表示される取引（Deals）の中には、「移動距離（Distance）が極めて長いにもかかわらず、取引価値（Value）や数量（Units）が極めて小さい」取引が多数含まれています。
これらは、商会（Merchant Organization）の維持コストや盗賊リスク、時間的コスト（ROI）を考慮すると、現実の経済シミュレーションとして不自然（害悪）であり、描画・計算負荷の面でもマイナスとなっています。

本ドキュメントでは、海路の移動速度向上（陸路32km/dayに対し海路60km/day）の仕様追加に伴い、**従来の「距離400km上限」を廃止し、「移動日数ベース」で不合理な取引を排除する**ための再設計案、および**「海路優先ルーティング」**の仕様を提示します。

---

## 1. 根本原因の分析

現在の `markets-generator.ts` における `runGlobalTrade` と `tradeOpportunityEstimator.ts` のロジックには、以下の特徴があります。

1. **強制的な黒字化ロジック (`minimumSellPrice`)**
   `estimateSpeculativeTrade` 内で、販売価格（`sellPrice`）が以下のように計算されています。
   ```typescript
   const minimumSellPrice = buyPrice + transportCost + good.value * profitMargin;
   const sellPrice = roundPrice(Math.max(quotedSellPrice, minimumSellPrice));
   ```
   これにより、輸送費（`transportCost`）がどれだけ高くなっても、販売側でそれを全て回収する価格設定がなされるため、理論上の「単位あたり利益（`unitProfit`）」は常に黒字になり得ます。
2. **小口取引に対する制限の甘さ (`MIN_PROFIT = 1`)**
   取引の成否判定は「取引全体の総利益が `1` 以上」という極めて緩い基準のみです。
   ```typescript
   if (totalProfit < MIN_PROFIT) continue; // MIN_PROFIT = 1
   ```
   例えば、穀物（`value = 2` 程度）をマップの端から端まで（輸送費が莫大）運ぶ場合でも、販売価格を輸送費分上乗せし、ほんの `0.5` ユニット運ぶだけで総利益が `1.0` を超えれば、システム上は「有効な取引」として成立してしまいます。

---

## 2. 再設計仕様案

### 案B (採用確定): 商品の「価値密度」による最大輸送日数制限
中世の交易において、穀物や木材、石材などの「低価値・大容積」な商品は長距離輸送には適さず、主に地元で消費されていました。一方で、香辛料や絹、宝石などの「高価値・小容積（高価値密度）」な商品だけが長距離交易に用いられました。

- **仕様**:
  - 商品の「価値密度（Value Density）」を算出:
    `valueDensity = good.value / (good.trade.weight + good.trade.bulk)`
  - 価値密度に基づいて、その商品の最大許容輸送**日数**（Days）を決定:
    `allowedMaxDays = BASE_MAX_DAYS * (valueDensity * DENSITY_MULTIPLIER)`
  - この日数を計算されたルートの所要日数が超える場合、取引を最初から不成立（`null`）とする。

---

### 新仕様1: 距離制限から「移動日数制限」への移行
従来の `MAX_MERCHANT_TRADE_RANGE_KM = 400` による一律の距離制限を廃止し、陸海それぞれの移動速度を考慮した「移動日数（Duration Days）」による制限に移行します。

- **移動日数の算出式**:
  `durationDays = (陸路の距離 / 32) + (海路の距離 / 60) + (陸海切り替え回数 * 乗り換え日数ペナルティ) + 荷役準備日数`
- **商会規模に応じた最大許容日数の設定**:
  - **Local（小規模・個人）**: 最大 12 日（陸路で約380km、海路で約720km相当）
  - **Regional（中規模）**: 最大 25 日（陸路で約800km、海路で約1500km相当）
  - **Major（大規模・大商会）**: 最大 50 日（大航海・遠隔地交易を可能にする）
- **商品特性に応じた制限（案Bとのシナジー）**:
  - 傷みやすい食品類（`timeValueTrend < 0`）は、商会の規模に関わらず最大移動日数を `7〜10日` 等に厳しく制限する。

---

### 新仕様2: 海路優先ルーティング (All-Water Route First)
目的地（Exporter市場 ⇄ Importer市場）が決まった際、陸海混合の最短経路を探す前に、**「海路（searoutes）だけで接続可能か」**を検証し、接続可能であればその海路ルートを最優先で割り当てます。これにより、海路だけで行ける目的地へ不要な陸路を経由してしまう不条理な経路選択を防ぎます。

- **ルーティング処理の流れ**:
  1. **フェーズ1（海路単独探索）**:
     Dijkstra探索時、海路エッジ（`group === "searoutes"`）のみを通過可能として経路を探索する。
  2. **フェーズ2（陸海混合探索）**:
     フェーズ1で経路が見つからなかった場合のみ、従来通り陸路と海路の両方を含めた探索を行う。
  3. **コストの最適化**:
     探索におけるエッジの重み（Cost）を、固定値（陸5・海1）から実際の速度比（陸32km/day・海60km/day）に合わせた移動時間ベースに修正する。また、陸海切り替え時に `SWITCH_COST`（港での積載・荷降ろし時間ペナルティ。例: 2日分＝陸路換算で64km相当）を適用する。

---

### 案D (推奨・検討): Caravan維持費（時間・距離に応じた固定コスト）の導入
移動日数 `durationDays` に応じた Caravan（運搬隊）の固定維持経費（日当、食費、護衛費用など）を導入し、取引の最終的な純利益（Net Profit）から差し引きます。

- **仕様**:
  - 日数に応じた維持費: `caravanMaintenance = durationDays * CARAVAN_DAILY_MAINTENANCE_COST` (例: 1日あたり `0.5` 価値)
  - 最終利益計算: `netProfit = totalProfit - caravanMaintenance`
  - `netProfit < MIN_PROFIT (1)` の場合は取引不成立。
- **効果**: 遠方への小口取引は維持費で赤字になるため自動的に間引かれ、長距離を運ぶなら「高価値な商品」か「大口取引」のどちらかでなければ成立しなくなります。

---

## 3. 各アプローチの計算コストと採用判定

| アプローチ | 追加される計算負荷 | 処理への影響 | 採用ステータス |
| :--- | :--- | :--- | :--- |
| **案B: 価値密度による日数制限** | **極小**（事前計算可） | 遠距離ペアを即時スキップでき、**全体処理を高速化**する。 | **採用確定** |
| **新仕様1: 日数ベース制限** | **極小**（四則演算数回） | 距離判定を日数判定に置き換えるだけなので、負荷変化なし。 | **採用確定**（400km上限廃止） |
| **新仕様2: 海路優先ルーティング** | **小〜中**（Dijkstraの最大2回実行） | 探索回数が最大2倍になるが、海路のみの探索は探索空間（エッジ数）が極めて狭いため高速。全体の経路探索回数が数千回程度であれば無視できるレベル。 | **採用検討**（ルートの不条理解消に必須） |
| **案D: Caravan維持費の導入** | **極小**（四則演算とMath.ceil） | 見積もり後に足切りするため、ループ回数は減らないが計算負荷はほぼゼロ。 | **採用推奨**（不経済な長距離小口取引を自然に排除可能） |

---

## 4. 設計・実装イメージ

### 1) 経路探索の改修 (`findRoutePath` の海路優先化)
`src/extensions/economy/generators/trade-animation.ts` 内の `findRoutePath` を改修。

```typescript
// trade-animation.ts

// 速度設定の反映
const LAND_SPEED = 32;
const SEA_SPEED = 60;
const PORT_TRANSFER_PENALTY_DAYS = 2; // 乗り換えペナルティ（2日）

// ダイクストラ探索の共通化
function runDijkstra(
  startCell: number,
  endCell: number,
  isWaterOnly: boolean
) {
  // isWaterOnly が true の場合、エッジ判定で searoutes 以外をスキップする
  // 重み(cost)を移動時間ベースで計算:
  // - 海路エッジ: 距離 / SEA_SPEED
  // - 陸路エッジ: (isWaterOnlyなら進入不可) / 距離 / LAND_SPEED
  // - 陸海切り替え時: PORT_TRANSFER_PENALTY_DAYS を加算
}

export function findRoutePath(startCell: number, endCell: number) {
  // Step 1: まず海路のみでのルートを探索
  const waterRoute = runDijkstra(startCell, endCell, true);
  if (waterRoute) return waterRoute;

  // Step 2: 海路のみで見つからない場合、陸海混合の最速ルートを探索
  return runDijkstra(startCell, endCell, false);
}
```

### 2) 日数ベースの取引許容判定 (`isMarketTradePermitted` の拡張)
`src/extensions/economy/generators/merchantOrganizations.ts` を修正。

```typescript
export function isMarketTradePermitted(source: Market, target: Market, distanceMapUnits: number, routeSegments: any[]): boolean {
  const world = getWorldContext();
  
  // ルートから移動日数を計算
  const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
  
  const organizations = world.pack.merchantOrganizations ?? [];
  if (!organizations.length) return true;

  // 商会の中に、この移動日数を許容できる規模のものが存在するかチェック
  return organizations.some(organization => {
    const maxDays = getOrganizationMaxDays(organization.scale);
    if (durationDays > maxDays) return false;
    
    return isInHomeGround(organization, source, target);
  });
}
```

### 3) 利益計算における維持費の控除 (`estimateSpeculativeTrade` の改修)
`src/extensions/economy/generators/tradeOpportunityEstimator.ts` の `estimateSpeculativeTrade` を修正。

```typescript
const CARAVAN_DAILY_COST = 0.5; // 1日あたりの固定維持費

export function estimateSpeculativeTrade(input: SpeculativeTradeInput): SpeculativeTradeEstimate | null {
  // ... (前段処理)

  // ルート日数に応じた Caravan 維持費の計算
  const durationDays = calculateRouteDurationDays(input.routeSegments, input.distanceScale);
  const caravanMaintenance = durationDays * CARAVAN_DAILY_COST;

  // 総利益から維持費を引いた純利益で判定
  const rawTotalProfit = unitProfit * maxUnits;
  const netTotalProfit = rawTotalProfit - caravanMaintenance;
  
  if (netTotalProfit < MIN_PROFIT) return null; // 維持費負けする取引を排除

  return {
    buyPrice,
    sellPrice,
    transportCost: roundPrice(transportCost),
    unitProfit,
    maxUnits,
    totalProfit: roundPrice(netTotalProfit) // 純利益を返す
  };
}
```

---

## 5. 船（Caravan）の出現頻度の抑制と間引き（集積化）案

毎日少量の取引で船が個別に出発し、海路に数珠つなぎになる現象は、船の有限性（アセット制限）や描画負荷の観点から不自然です。これらを「一定期間ごとにまとめて荷役・出港する」仕組みにして間引くための仕様案です。

### 1) 港湾での「荷役・集積期間 (Cargo Accumulation Period)」の導入
Deals が発生した際、即座に Caravan を出発させるのではなく、港で荷物をまとめてから出港する「待機フェーズ」を設けます。

- **仕様**:
  - `Caravan` の状態（`state`）に、従来の `"transit" | "arrived" | "lost"` に加え、**`"loading"`（荷役中）** を追加します。
  - `spawnFromDeals` で生成された新しい Caravan は、まず `state = "loading"` として生成され、マップ上には描画されない（非表示）か、港のセル上で静止させます。
  - **集積期間 (Accumulation Days)**:
    - 商会規模や商品のカテゴリに応じて設定（例: 一般商品は 7日間、高級品は 14日間、または一律 10日間）。
  - 集積期間中に、同じ出発地・目的地（Seller ⇄ Buyer）の Deal が追加で発生した場合、既存の `"loading"` 状態の Caravan の `payload` に統合（マージ）します。
  - 集積期間が終了（または `advanceTime` で指定日数が経過）した時点で、`state = "transit"` に移行し、マップ上を動き出します。
  - **効果**: 同一ルートの取引が完全に1隻の船に集約され、出発タイミングも同期されるため、海路上の船の数を劇的に削減できます。

### 2) 出港スケジュール（定期便化）の導入
船の出発タイミングを、毎日ではなく特定の周期（スケジュール）に制限します。

- **仕様**:
  - `Caravan` に `departureDay` メタデータを付与します。
  - 例えば「毎月1日・10日・20日」のみを出港日とし、集積された荷物は最寄りの出港日にまとめて出発させます。
  - 移動中の Caravan のアップデート（`Caravans.tick`）は毎日行いますが、新規出発は10日ごとになるため、海路が「細切れの船の列」になるのを防ぎ、大船団が一定間隔で進むような見栄えになります。

### 3) そもそも取引数自体を自然に減らす（案B・案Dによる足切り効果）
最も根本的かつ効果的な間引きは、**「無駄な取引（Deals）そのものを生成しない」**ことです。
- **価値密度制限（案B）** と **日数制限（新仕様1）** により、長距離の低価値取引がそもそも不成立になります。
- **Caravan維持費（案D）** により、遠方への小口取引は維持費で赤字になるため、商人が取引を諦めます。
- この二重の足切りにより、Deals の総数自体が激減するため、特別な集積ロジックを入れずとも、海路上の船の密度は自然と適正なレベル（数分の一以下）に落ち着く可能性が高いです。

#### 開発フェーズの推奨ステップ
1. **ステップ1**: **案B**、**新仕様1（日数ベース）**、**案D（維持費）** をまず実装し、Deals 数と Caravan 数がどの程度自然に間引かれるかを測定する。
2. **ステップ2**: それでも海路の混雑が目立つ場合、上記 **1) 荷役・集積期間（10日間の loading 状態）** を導入し、同一ルートの Caravan を時間軸上でマージするロジックを追加する。

