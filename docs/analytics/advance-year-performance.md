# Advance Year パフォーマンス調査

調査日: 2026-08-03  
対象: Tools → Advance Year（および `window.fmg.actions.advanceTime(1)` の日次展開）  
計測ハーネス: `npm run perf:advance-year`（`scripts/benchmarkAdvanceYear.ts`）  
生データ: `docs/analytics/advance-year-benchmark-latest.json`（最終実行で上書きされる）

---

## 1. 結論（先に読む）

| 優先度 | ホットスポット | 周期 | 当初 | P0 後 | **P1 後** |
| :--- | :--- | :--- | ---: | ---: | ---: |
| ~~P0~~ | 日次 retail reconcile | 毎日 | ~37s | ~0.02s | **~0.02s** ✅ |
| ~~P1~~ | 月次 production settle | 月次 ×12 | ~15s | ~11s | **~7.8s** ✅ 改善 |
| **P2** | core `tickManpower` | 毎日 | ~4s | ~4s | **~4.0s**（次の本命） |
| **P2** | military fallback | 毎日 | ~2.5s | ~2.4s | **~2.5s** |
| 残り P1 | `planRetail` / `burgLoop` | 月次 | — | — | ~3.7s / ~2.7s |

| シナリオ | 当初 wall | P0 後 | **P1 後** |
| :--- | ---: | ---: | ---: |
| Economy ON | **~60s** | ~19s | **~15s（約 4×）** |
| Economy OFF | ~6.8s | ~6.8s | ~6.8s |

### P0 で実施したこと

1. **日次 `tickRetailInventory` を due shipment 配送のみに限定**
2. **外部 stock 変化は dirty フラグ** → 月次 / 明示 reconcile
3. **`physicalTotal` 一括 Map / market→burgs インデックス**
4. **月次の二重 reconcile 除去**

### P1 で実施したこと

1. **retail/wholesale 行の O(1) インデックス**（月次 plan の線形 find を排除）
2. **merchant portfolio 同期のインデックス化**
3. **単一 burg 市場の shipment 計画スキップ**
4. **burg worker ループの 4 worker ごと re-rank**（フル goods 評価回数を削減）
5. **空 good の ensurePositions スキップ / DEBUG 時のみ candidates 収集**

---

## 2. 時間進行の実行モデル

```
Advance Year (UI) / advanceTime(1)
  → 暦日 ~365–366 回の simulation.stepDay
      各日:
        1. clock / season
        2. core: agriculturalStress（オプション）
        3. core: demographics
        4. core: manpower
        5. registered systems（phase 順）:
             economy.tick  → shipbuilding.tick → technology.tick
             → frontier-expansion.tick → nobility.tick
        6. (nobility 無効時) military fallback
        7. コミット + 通知
      月次境界: economy が microtask で production.settle を N 回
```

- 1 暦日 = 1 `tickCount`、1 回の system パス（P2-5）。
- UI は rAF + フレーム予算（~12ms）で複数日をまとめて進めるが、**semantics は日次**。
- `cadence: { every: 1 }` のため登録 system は毎日呼ばれる。**重い処理は各 module 内の self-gate**（年次・四半期・月次カウンタ）で間引く。

### 2.1 今回修正した計測上の落とし穴

`production.settle` は `queueMicrotask` で shipbuilding の後に遅延実行される。  
複数日を同期的にまとめて進めると microtask がバッチ末尾に1回しか走らず、**月次 settle が1回に潰れる**可能性があった。

`productionSettlementsDue` カウンタで「溜まった月数ぶん settle」するよう修正済み。  
計測でも **12 回** の `production:settle` を確認（うるう年 366 日 / 30 日）。

---

## 3. 周期別カタログ

### 3.1 毎日（~365 回 / 年）

| 処理 | 所有者 | 備考 | 計測上の重さ |
| :--- | :--- | :--- | :--- |
| `tickAgriculturalCalendar` | core | simAgriculture | 小（~0.3ms/日） |
| `simulateDemographics` | core | simDemographics | 小（~0.6ms/日） |
| `tickManpower` | core | simManpower | **中（~11ms/日）** |
| `Caravans.tick` | economy | 荷積み・移動・紛失 | 極小 |
| **`tickRetailInventory`** | economy | **毎日 `reconcileRetailInventory` を無条件実行** | **極大（~100ms/日）** |
| `StrategicProcurement.reconcileCaravans` | economy | 到着/紛失時のみ実質仕事 | 極小 |
| warIntensity / supplyStrain 更新 | economy | burgs 走査 | 極小 |
| `tickUrbanPregnancy` / `tickConstructionHiring` | economy | 日次 | 小 |
| 多数の `settleAnnual()` 呼び出し | economy | **年次 self-gate**（ほとんどの日は early return） | 小 |
| `tickForestRegrowth` | economy | 微小 | 極小 |
| shipbuilding logging / queue / voyage | shipbuilding | 有効時 ~4ms/日 | 小〜中 |
| nobility age / espionage / movement 等 | nobility | 有効時 ~11ms/日 | 中 |
| `Military.updateDynamic` + regiment movement | nobility or core fallback | 毎日 | 中 |

### 3.2 週次（construction hire）

| 処理 | 周期 | 備考 |
| :--- | :--- | :--- |
| `tickConstructionHiring` 内 anonymous hire round | **7 日** | 日次 tick 内で累積 |

### 3.3 月次（~12 回 / 年）— `production.settle`

| 処理 | 計測ラベル | 1回あたり（711 burgs） |
| :--- | :--- | :--- |
| `Production.produce()` | `production:produce` | ~530ms |
| └ startCycle（rural / mines / prices…） | `production:startCycle` | ~10ms |
| └ per-burg worker/sales loop | `production:burgLoop` | **~400ms** |
| └ global trade / caravan spawn / demand | `production:finishCycle` | ~120ms |
| `InnStays.settleMonthly` | `production:innStays` | 極小 |
| food ledger 月次消費 | `production:foodConsumption` | ~1ms |
| `Taxes.collectTaxes` | `production:taxes` | ~7–14ms |
| state economy summaries | `production:stateSummaries` | 小 |
| **`synchronizePlayerCommerce`** | **`production:playerCommerce`** | **~670ms** |

`synchronizePlayerCommerce` の中身:

```ts
syncMarketMerchantPortfolios();
reconcileRetailInventory();   // 日次と同じ重い reconcile
planRetailReplenishment();    // さらに market×good×burg の補給計画 + 経路
```

### 3.4 四半期（~4 回 / 年）

| 処理 | 周期 | 計測 |
| :--- | :--- | :--- |
| `FoodProduction.generateQuarterlyLedger` + capacity clamp + bandit raid | 90 日 | 合計 ~60ms / 年（4 calls） |

### 3.5 年次（self-gate、1 回 / 年が本体）

| 処理 | ゲート |
| :--- | :--- |
| AgTech / IndustrialTech investment | `settleAnnual` year guard |
| `DevelopmentPotential.updateAnnualAgriculture` / burg groups | year guard |
| `UrbanLaborIntake.updateAnnualState` + basic employment reconcile | year |
| Inn / UrbanWater / Guild\* / Academy / StateSecret / Martial\* / GuildTreasury | year |
| `MineOperations.prospect` | 365 日カウンタ |
| host `technology.tick` → `settleTechnologyAnnual` | year |
| host `frontier-expansion.tick` | 内部 annual guard |

年次本体はまとめても数百 ms オーダーで、**日次 retail より桁違いに軽い**。

---

## 4. 実測結果

### 4.1 条件

- Seed: `advance-year-perf`
- Map: **4566 cells**, **711 burgs**（各 burg に market → market 数も 711）
- Path: bulk `advanceTime(1)`（日次 semantics + バッチ snapshot）
- Chromium headless, Vite dev server

### 4.2 比較

| シナリオ | wall clock | 備考 |
| :--- | ---: | :--- |
| 拡張なし（core only） | **~6.8s** | manpower 58% + militaryFallback 37% |
| characters + **economy** | **~60s** | retail 日次が支配 |
| + shipbuilding + nobility | **~66s** | nobility ~4s, shipbuilding ~1.6s を上乗せ |

### 4.3 Economy ON（characters+economy）内訳（上位）

| label | total ms | calls | avg ms | 解釈 |
| :--- | ---: | ---: | ---: | :--- |
| economy:retailInventory | **37249** | 366 | **101.8** | **P0** |
| production:settle | 14654 | 12 | 1221 | 月次一式 |
| production:playerCommerce | 8057 | 12 | **671** | 月次 retail 再計算（P1） |
| production:produce | 6495 | 12 | 541 | |
| production:burgLoop | 4915 | 12 | 410 | produce の本体 |
| core:manpower | 4008 | 366 | 11.0 | P2 |
| core:militaryFallback | 2552 | 366 | 7.0 | nobility 無し時 |
| production:finishCycle | 1455 | 12 | 121 | trade/spawn/demand |
| core:demographics | 221 | 366 | 0.6 | 軽い |
| economy:quarterlyFood | 58 | 4 | 14.5 | 軽い |

※ 親ラベル `economy` / `economy:caravans` / `production:settle` は子ステップと二重計上になる。壁時計は **~60s** が真実。

---

## 5. なぜ `tickRetailInventory` が重いのか

```303:324:src/extensions/economy/generators/retailInventory.ts
export function tickRetailInventory(tick = currentTick()): boolean {
  // ... deliver due shipments ...
  reconcileRetailInventory();          // ← 毎日・無条件
  if (changed) planRetailReplenishment();
  return changed;
}
```

`reconcileRetailInventory` → 各 market で `ensurePositions`:

- `physicalTotal(market, good)` が **全 retail / wholesale / shipment 行を線形走査**
- market 数 ≈ burg 数（711）、good 種類が多いと **O(markets × goods × inventory rows)** / 日
- 到着が無くても毎日フル reconcile

加えて月次 `synchronizePlayerCommerce` が **同じ reconcile + より重い `planRetailReplenishment`** を再実行。

---

## 6. 最適化候補（推奨順）

### ~~P0 / P1~~ — 実装済み（§1）

### P2 — core manpower / military（次の本命、P1 後 wall の ~40%）

1. `tickManpower` の ~11ms/日（年 ~4s）— 日次ではなく週次/月次で足りるか仕様確認。
2. nobility 無効時の `militaryFallback`（~7ms/日）。
3. 残月次: `planRetail`（~230ms/月）・`syncLedgers`（~74ms/月）の追加間引き。

### やらない方がよいこと

- 年次 guild/knowledge — 既に十分軽い。
- 四半期 food — 年 60ms 程度。
- キャラバン移動 — ほぼ無料。
- 日次 retail — P0 後は年 ~20ms。

---

## 7. 計測の再現方法

```bash
# 端末1
npm run dev

# 端末2
npm run perf:advance-year -- --extensions=characters,economy
npm run perf:advance-year -- --extensions=characters,economy,shipbuilding,nobility
npm run perf:advance-year -- --extensions=                 # core only
npm run perf:advance-year -- --path=ui                     # Tools と同じ rAF 経路
```

ブラウザ手計測:

```js
localStorage.setItem("debug", JSON.stringify({ tickProfiler: true }));
// reload
window.fmg.actions.resetTickProfile();
// Tools → Advance Year、完了後:
console.table(window.fmg.actions.getTickProfile());
```

`measureTickStep` は `TIME` フラグ時に有効（現状常時 true）。  
サブステップラベル:

- `economy:*` — tick 内
- `production:*` — 月次 settle / produce 内

---

## 8. 実装で追加したもの（本調査）

| 変更 | 目的 |
| :--- | :--- |
| `measureTickStep` を economy / production に埋設 | サブステップ可視化 |
| `window.fmg.actions.getTickProfile` / `resetTickProfile` | テスト・ベンチから取得 |
| `productionSettlementsDue` カウンタ | バッチ日進みでも月次数 settle |
| `scripts/benchmarkAdvanceYear.ts` + `npm run perf:advance-year` | 再現可能な壁時計計測 |

---

## 9. 次のアクション提案

1. **P0 実装**: `tickRetailInventory` の無条件 `reconcileRetailInventory` を dirty-gated にし、`physicalTotal` を O(1)/インデックス化。  
2. 同じ seed で `perf:advance-year` を再実行し、目標 **wall < 20s**（retail 日次が支配的な前提）を確認。  
3. 必要なら `tickManpower` の周期を仕様と照合して P2 に着手。
