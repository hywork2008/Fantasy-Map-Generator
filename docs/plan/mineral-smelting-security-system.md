# 鉱石精錬・治安システム設計(Ore → Ingot → 交易 + 盗難リスク)

## 状態

Phase A 実装済み（Ore/Ingot のカタログ分離・既存セーブ移行）。Phase B〜D は未着手。
`docs/plan/mineral-resource-system.md`(鉱物資源システム)の続編であり、
同ドキュメント §12「未決定事項」の「個別 Ore Good を Phase 2 から導入するか、精錬済み金属相当の
まま進めるか」に対して、本書は **導入する** という決定を行う。

`docs/plan/mineral-resource-circulation-fixes.md` の Fix 3(鉱床の可視化)の後続として着手する
想定。実装フェーズ A〜D(§7)の順で進める。

---

## 1. 背景と目的

現行実装(`mineralResources.ts` / `mineOperations.ts`)は `reserveTons` を「鉱石重量ではなく、
便宜上『回収可能な精錬済み金属相当量』」として扱い、鉱石(Ore)と精錬済み金属(Ingot)を区別
していない。これは初期実装の意図的な単純化だったが、以下を実現するために区別を導入する。

- 鉱山(採掘)と精錬(加工)を空間的に分離し、史実の製錬所立地(水利・燃料に依存し、必ずしも
  鉱山や町の中ではない)を反映する
- 精錬能力を持たない国家が鉱石を輸出し、精錬能力を持つ国家がインゴットを輸出するという交易
  依存関係を生む
- 鉱山サイト・精錬サイト・交易路のそれぞれ異なる脆弱性に治安・盗難リスクを結びつける

対象は精錬工程が意味を持つ6品目: Iron / Copper / Tin / Lead / Silver / Gold。
Coal / Saltpeter / Sulfur は燃料・火薬原料のままで Ingot 段階を持たない。

---

## 2. データモデル

### 2.1 Ore / Ingot Good

| 段階 | Good名 | 役割 |
|---|---|---|
| 鉱石 | `Iron Ore` / `Copper Ore` / `Tin Ore` / `Lead Ore` / `Silver Ore` / `Gold Ore` | `MineOperation.produceMonth()` の産出物。市場で取引可能な中間財 |
| インゴット | `Iron Ingot` / `Copper Ingot` / `Tin Ingot` / `Lead Ingot` / `Silver Ingot` / `Gold Ingot` | `SmelterOperation` の産出物。武具・貨幣・交易の最終投入財 |

`TRADE_PROFILES`(`goods-generator.ts:1209-1214`)は Ore と Ingot で別々に設定する。Ore は
重量あたり価値が低いため長距離輸送のペナルティを Ingot より重くし、「精錬所は鉱山の近くに
置く方が得」という経済合理性をシミュレーションに反映する。

`mineralResources.ts` の `MINERAL_COMMODITIES` は以下のように分割する。

```ts
export const ORE_COMMODITIES = ["iron", "copper", "tin", "lead", "silver", "gold"] as const;
export type OreCommodity = (typeof ORE_COMMODITIES)[number];

// Coal/Saltpeter/Sulfur は従来通り単段階(Ingot化しない)
export const FUEL_MINERAL_COMMODITIES = ["coal", "saltpeter", "sulfur"] as const;
export type FuelMineralCommodity = (typeof FUEL_MINERAL_COMMODITIES)[number];
```

`MineralDeposit.yields` の `commodity` は Ore 側の commodity 名を指す(鉱床はあくまで鉱石を
産出する)。`isMineSuppliedGoodName` はOre名・Ingot名の両方を判定対象に含めるよう拡張する
(鉱石はMineOperation由来、インゴットはSmelterOperation由来であり、どちらも人口比例の自然
生産の対象外であるべきため)。

### 2.2 SmelterOperation

`MineOperation`(`mineralResources.ts:81-92`)と対になる新しい型。

```ts
export interface SmelterOperation {
  i: number;
  depositId: number;        // 対応する MineOperation の鉱床
  cell: number;             // 鉱床セル自身、または近傍探索で選ばれた最良セル
  burgId: number;
  marketId: number;
  waterPower: number;       // 河川の有無ベース。既存 getAccessibility() の river 項に相当
  fuelAccess: number;       // 森林バイオーム近接度
  technology: number;
  smeltingYield: number;    // Ore→Ingot の歩留まり(例 0.8。スラグ・精錬ロスを表現)
  annualCapacityTons: number;
  securityInvestment: number; // 0..1。精錬所単体の警備投資水準(§5.2)
  active: boolean;
}
```

---

## 3. 精錬所の立地(案B: 独立サイト)

町(Burg)に紐付けず、`MineralDeposit.getAccessibility()`(`mineralResources.ts:311-317`、
河川・道路・港を見て0〜1のスコアを出す)と同じ決定論的ハッシュ選択パターンを流用し、**水利
(河川=水車動力)と燃料(森林バイオーム近接度)**寄りの重みでスコアリングする。

生成タイミング: 各 `MineOperation` が `active` になったタイミングで、鉱床セルとその近傍セル
(`cells.c[cell]`)を `waterPower + fuelAccess` の合成スコアで評価し、最良の1セルを選ぶ。

- 1鉱山につき1精錬所として開始する(MVP)。複数鉱山を1つの精錬所に統合する最適化は本書の
  スコープ外とし、将来の拡張候補として残す(§8)。
- `burgId`/`marketId` は `MineOperation.findNearestBurgId()` と同じロジックで、精錬所セルに
  最も近い(同一市場圏の)Burgを採用し、行政上・治安計算上の帰属に使う。

---

## 4. 生産サイクルの月次ワイヤリング

`production-generator.ts` の呼び出し順を以下のように変更する。

```
Markets.collectRuralProduction()
MineOperations.produceMonth()     // 既存: Ore を市場在庫へ供給
SmelterOperations.produceMonth()  // 新規: 市場のOre在庫を消費しIngotを産出
Minting.settleMonthly()           // 変更: Gold/Silver/Copper "Ingot" を参照
MilitaryResources.settleMonthly() // 変更: Iron/Lead "Ingot" を参照
Markets.initializeMarketPrices()
```

`SmelterOperations.produceMonth()` は `Markets.consumeForMint()`/`consumeForMilitary()`
(`markets-generator.ts:143-166`)と同じ「市場在庫の一定割合を上限に消費する」パターンを再利用し、
処理量の上限は `waterPower × fuelAccess × technology`(`MineOperation.produceMonth()` の
`extractionFactor` と同型の合成)で制限する。産出した Ingot は `Markets.addMineSupply()` 相当の
関数(命名は `addSmelterSupply()` などに改める)で市場在庫へ加える。

---

## 5. 治安・盗難システム

被害が発生するのは以下の2箇所のみ。**鉱山サイト自体の在庫(採掘直後)は対象外**とする
(合意事項)。

### 5.1 被害2: 精錬所在庫の盗難(サイト固有)

精錬所は町の外にある無防備な施設という前提で、`SmelterOperation.securityInvestment` を持たせ、
産出直後(まだ市場に出る前)の Ingot 在庫に対してロールする。

```
smelterTheftRisk = baseRisk
  × frontierMultiplier(cell)          // wilderness/outpost/incorporated(frontierExpansion.ts)
  × dangerMultiplier(cells.danger)    // 既存の脅威レイヤー(PackedGraph.cells.danger)
  × warMultiplier(state.supplyStrain) // 既存(index.tsx:1311-1316)
  × isolationMultiplier(1 - deposit.accessibility)
  × (1 - securityInvestment)
```

`securityInvestment` の維持費は、精錬所が帰属する Burg の State の `treasury` から月次で天引きする。

### 5.2 被害3: 行商全般の盗難(既存 caravans.ts の拡張、全商品対象)

`caravans.ts:399-416` に**既に存在する**、貨物種別を問わない盗賊ロス機構
(`caravan.state = "lost"`)をそのまま拡張する。現状は `0.001 × warIntensity` のみで平時は
ゼロだが、frontier/danger の項を足し込み、**州レベルの街道警備投資**による軽減項を加える。
これは Ore/Ingot に限らず、経済拡張が運ぶ**全てのGood・全てのキャラバン**に一律適用される。

```
caravanBanditRisk = 0.001
  × (1 + warIntensity)                // 既存項を維持
  × frontierMultiplier(buyerMarketCell)
  × dangerMultiplier(cells.danger)
  × (1 - stateTradeSecurityInvestment)
```

新規に State 単位の `TradeSecurityLedger` を追加する。

```ts
export interface TradeSecurityLedger {
  stateId: number;
  investmentLevel: number;    // 0..1
  monthlyUpkeepPaid: number;
  lastCaravansLost: number;   // 表示・デバッグ用の直近実績
}
```

`Minting`/`MilitaryResources` と同じパターンで、月次に `state.treasury` から維持費を支払う。
支払えなければ `investmentLevel` の実効値を按分して下げる(既存の資金不足時の挙動と揃える)。

### 5.3 前提の確認: settlement pattern との関係

`frontierMultiplier` を両リスク式の主要項に据えることで、`initialSettlementPattern ===
"standard"`(デフォルト、Statesが陸地をほぼ埋める)かつ平時であれば、被害2・3ともにほぼゼロに
収束する。リスクが顕在化するのは次のいずれかの場合のみ:

- `frontier`/`scattered` パターンで `wilderness`/`outpost` ステージの土地に鉱山・精錬所がある
- 通常パターンでも戦争中(`supplyStrain` 上昇)で街道の治安が緩む
- 辺境で `accessibility` が低い(道路・河川・港が乏しい)鉱床・精錬所

---

## 6. 既存モジュールへの影響一覧

| ファイル | 変更内容 |
|---|---|
| `mineralResources.ts` | `MINERAL_COMMODITIES` を `ORE_COMMODITIES`/`FUEL_MINERAL_COMMODITIES` に分割。`isMineSuppliedGoodName` をOre/Ingot両対応に拡張 |
| `mineOperations.ts` | 産出物をOreとして扱う(ロジック自体は変更小) |
| `smelterOperations.ts`(新規) | `SmelterOperation` の生成・月次処理・治安ロール |
| `goods-generator.ts` | Iron/Copper/Tin/Lead/Silver/Gold を Ore として再定義し、対応するIngotを新規追加。Tools/Weapons/Bronze/Armor/Artillery/Jewelry の各レシピをIngot参照に変更。`TRADE_PROFILES` にOre/Ingot両方のエントリを追加 |
| `minting.ts` | `METAL_COIN_VALUES` の参照先をGold/Silver/Copper **Ingot** に変更 |
| `militaryResources.ts` | Iron/Lead の参照先を **Ingot** に変更 |
| `caravans.ts` | `banditRiskPerDay` の計算式に frontier/danger/警備投資項を追加(§5.2) |
| `economyContext.ts` | `SmelterOperation[]`・`TradeSecurityLedger[]` の getter/setter を追加 |
| `production-generator.ts` | 月次呼び出し順に `SmelterOperations.produceMonth()` を追加(§4) |
| `index.tsx` | 生成・regenerateコマンド・tick配線にSmelter/TradeSecurityを追加 |
| `drawMineralDeposits.ts` / `economyWebglLayers.ts` | (Fix 3後続)精錬所サイトの可視化を追加するかは別途検討 |

---

## 7. 実装フェーズ

- [x] **Phase A**: Ore/Ingot 分離
  - [x] `goods-generator.ts` の6品目をOreとして再定義し、対応するIngotを追加
  - [x] Tools/Weapons/Bronze/Armor/Artillery/Jewelry レシピをIngot参照に更新
  - [x] `TRADE_PROFILES` にOre/Ingot両方のエントリを追加(Oreは長距離輸送に不利な設定)
  - [x] `minting.ts`/`militaryResources.ts` の参照先をIngotに更新
  - [x] `mineralResources.ts` の `MINERAL_COMMODITIES` 分割、`isMineSuppliedGoodName` 拡張
  - [x] 既存セーブ互換(旧`.fmg`にOre/Ingotが無い場合の補完方針を決める)
- [ ] **Phase B**: `SmelterOperation` 新設
  - [ ] 型定義・生成モジュール(`smelterOperations.ts`)
  - [ ] 近傍セル探索による立地選定(水利+燃料スコアリング)
  - [ ] 月次生産ワイヤリング(§4)
- [ ] **Phase C**: 被害2(精錬所盗難)
  - [ ] `SmelterOperation.securityInvestment` フィールドと維持費支払い
  - [ ] `smelterTheftRisk` 計算・月次ロール
  - [ ] `frontierMultiplier`/`dangerMultiplier`/`isolationMultiplier` の具体的な係数決定
- [ ] **Phase D**: 被害3(行商全般)
  - [ ] `TradeSecurityLedger` 新設(State単位)
  - [ ] `caravans.ts` の `banditRiskPerDay` 拡張
  - [ ] Toolsタブでの投資水準UI(未決定、§8)

---

## 8. 未決定事項

- 複数鉱山を1つの精錬所に統合するケースをいつ・どう扱うか(現状は1鉱山=1精錬所のMVP)
- `smeltingYield`(Ore→Ingot歩留まり)の初期値と、技術進歩でどう変化させるか
- `frontierMultiplier`/`dangerMultiplier`/`isolationMultiplier`/`baseRisk` の具体的な数値
  (Phase C/Dで実データを見ながら調整する前提)
- `TradeSecurityLedger.investmentLevel` をプレイヤーがどこで設定するか(Toolsタブの新規UIか、
  既存の税率設定に相乗りするか)
- 既存セーブ(Ore/Ingot分離前に生成された `.fmg`/旧`.map`)は Phase A で移行済み。旧 Iron 等の
  Good ID と市場在庫・取引中貨物は **Ore としてそのまま維持**し、対応する Ingot Good は在庫ゼロで
  末尾に追加する。これにより資産を複製せず、Phase B の精錬所だけが Ingot の新規供給源になる。
