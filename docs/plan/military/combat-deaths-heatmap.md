# Combat Deaths ヒートマップ（戦場死亡の地理可視化）

**Status**: implemented（2026-07-15）  
**Date**: 2026-07-15  
**Related**:

| Doc / Code | Relation |
| :--- | :--- |
| `docs/plan/military/war-zones.md` | 初期要望メモ（Zones との役割分担） |
| `docs/plan/military/manpower-ecosystem.md` | 兵力台帳・戦死者の人口フィードバック |
| `docs/simulation/population-dynamics.md` | 人口コホート・戦争ショックの基礎設計 |
| `src/generators/populationLossTracker.ts` | state / cell の rolling 死亡集計 |
| `src/generators/demography-simulator.ts` | `applyDemographicCasualties` |
| `src/renderers/combatDeathsRenderer.ts` | Combat Deaths レイヤー描画 |
| `src/ui/dialogs/PopulationOverviewDialog.tsx` | Deaths タブ（国家別集計・時間窓） |

---

## 1. 要望（As requested）

`Population Overview` の Deaths のうち **Combat** が、**どの地域で発生しているか** を地図上で見たい。

- 見た目の参考: `Population` レイヤー ON 時のヒートマップ（contour / choropleth）
- 戦争の「舞台」表現の参考: `Zones` レイヤー
- 方針の直感: **セルに情報を載せ、レイヤーがその値を参照して描く**

---

## 2. 実装前の計画

### 2.1 現状ギャップ（計画時点）

| 項目 | 状態 |
| :--- | :--- |
| Overview Deaths | `getDeathsByState(window)` — **国家単位**のみ |
| `recordDeaths` | `stateId × cause × 日次バケット`（最大 ~40 日） |
| 戦闘発生点 | 攻城 `targetBurg.cell`、散発戦 連隊 `cell`、戦闘画面 `this.cell` など **場所は取れる** |
| 記録 API | `applyDemographicCasualties(stateId, deadTroops)` が **state のみ**渡し、地理が落ちる |
| Population レイヤー | 生人口（`pop` / burgs）用。戦死者の rolling 累計とは意味が別 |
| Zones | 生成時の Invasion / Rebels 等の **ラベル付きポリゴン**。人数強度の連続値には不向き |

### 2.2 意味の切り分け（計画時の決定）

| 意味 | 内容 | 本機能の対象 |
| :--- | :--- | :--- |
| **A. 戦場での戦死者** | 連隊が倒れたセル | ✅ ヒートマップの主対象 |
| **B. 人口への波及** | manpower OFF 時の民間 male 配分など | ❌ 別関心（国家内の人口減） |

Overview の Combat 列は A の **国家合計**。地図は同じ Combat を **戦場セル** に載せる。

### 2.3 アーキテクチャ案（採用）

```
[戦闘解決] --cellId + people--> [populationLossTracker (state + cell)]
                                      |
                    +-----------------+------------------+
                    v                                    v
         Population Overview                    Combat Deaths レイヤー
         (getDeathsByState)                     (getCombatDeathsByCell)
                                                    |
                                                    v
                                              Tooltip / hover
```

**採用方針の要点**

1. **データ**: Overview と同じ ephemeral tracker を拡張（`pack.cells` への恒久フィールドは避ける）
2. **可視化**: Population にモードを足さず、**専用レイヤー** `Combat Deaths`
3. **時間窓**: Overview Deaths の day / week / month と共有
4. **Zones**: 強度ヒートマップの **代替には使わない**（戦域ラベル用の補完として残す）
5. **WebGL**: MVP は SVG オーバーレイ（hybrid でも `WEBGL_MANAGED` に入れず表示を保つ）

### 2.4 レイヤー案の比較（計画時）

| 案 | 判定 | 理由 |
| :--- | :--- | :--- |
| A. 専用 Combat Deaths レイヤー | **採用** | 生人口と責務分離、rolling 窓と相性が良い |
| B. Population の新 rendering mode | 不採用 | 「人口」UI と意味が衝突 |
| C. Zones のみ | 不採用（主表示） | 人数強度が表現できない、生成時 Zone と混ざる |
| D. Battle markers のみ | 不採用（主表示） | 散発戦・攻城の全量をカバーしにくい |

### 2.5 実装ステップ（計画時 MVP）

1. `recordDeaths(..., { cellId? })` + `getCombatDeathsByCell(window)`
2. `applyDemographicCasualties` と 3 戦闘入口に `cellId` を通す
3. SVG choropleth / contour の専用レイヤー + tooltip
4. `fmg:time-advanced` / レイヤー toggle / 窓変更で redraw
5. 単体テスト（cell 集計・窓・reset・telemetry）

**後回し（計画時）**

- deck.gl 本実装
- 高死亡セルの自動 Zone 生成
- famine / natural の地理
- save/load 永続化（state 死亡集計と同様セッション限定で十分）

---

## 3. 実装後の概要

### 3.1 何ができるようになったか

1. 戦闘で死んだ人数が **戦場セル** に記録される（国家合計も従来どおり Overview に残る）
2. レイヤーパネルの **Combat Deaths** を ON にすると、直近の Combat 死亡が **ヒートマップ** で見える
3. 時間窓は Population Overview → Deaths の **1 day / 1 week / 1 month** と連動
4. セル hover で `Combat deaths (last Nd): …` を表示

### 3.2 データモデル

`src/generators/populationLossTracker.ts`

| API | 役割 |
| :--- | :--- |
| `recordDeaths(stateId, people, cause, opts?: { cellId? })` | state 集計 +（combat かつ有効 cell 時）cell 集計 |
| `getDeathsByState(window)` | Overview 用（従来） |
| `getCombatDeathsByCell(window)` | 地図用 `Map<cellId, people>` |
| `getCombatDeathsAtCell(cellId, window)` | tooltip 用 |
| `advancePopulationLossClock` / `resetPopulationLossTracker` | 時計・リセット（cell 側も同時） |

- 日次バケット: `byState` + `combatByCell`
- 履歴上限: ~40 日（従来どおり）
- 単位: display people（headcount）
- `cellId` は非負整数のみ採用；無効でも state 集計は行う
- telemetry `DeathEvent` に任意 `cellId` を付与

### 3.3 戦闘入口 → cell 配線

| 呼び出し元 | 渡す cell |
| :--- | :--- |
| `src/extensions/nobility/generators/battle-resolution.ts` | `targetBurg.cell`（攻城両軍） |
| `src/extensions/nobility/generators/localSkirmish.ts` | 接触 seed 連隊 `regA.cell` |
| `src/controllers/battle-screen.ts` | 戦場 `battlefieldCell`（`this.cell`） |
| `applyDemographicCasualties(stateId, dead, cellId?)` | 上記を `recordDeaths(..., { cellId })` へ |
| `registerTroopLosses(stateId, dead, cellId?)` | Overview 専用経路でも cell 任意 |

`cellId` 無しの combat 記録は **Overview の国家合計のみ**増え、地図には載らない。

### 3.4 レンダラ / レイヤー

| 項目 | 実装 |
| :--- | :--- |
| レイヤー ID | SVG `#combatDeaths` |
| トグル | `toggleCombatDeaths`（表示名: Combat Deaths） |
| Renderer | `CombatDeathsRenderer`（`src/renderers/combatDeathsRenderer.ts`） |
| ViewContext | `EnvironmentLayers.combatDeaths` |
| 描画モード | `optionsState.combatDeathsRenderingMode`: `contour`（既定）/ `choropleth` |
| 色 | `d3.interpolateYlOrRd` |
| 窓 | `usePopulationOverviewState().deathWindow` |
| hybrid | `WEBGL_MANAGED` + deck.gl セルポリゴン。SVG/WebGL とも **Military（armies）の直下** にスタック |
| 旧セーブ | `reinitializeMapLayers` で `#combatDeaths` が無ければ append |

**redraw トリガ**

- レイヤー ON（`toggleCombatDeaths`）
- `drawLayers()`
- `fmg:time-advanced`（SVG 再描画）
- `fmg:death-window-changed`（Overview の窓変更）
- 戦闘画面 `applyResults` 完了時
- Options UI の rendering mode 変更（`react-change-combat-deaths-rendering-mode`）

### 3.5 UI / UX

- **Layers**: Combat Deaths（tooltip に Overview 窓連動の旨を記載）
- **Options → UI**: Combat deaths rendering（Smooth Contours / Cell Heatmap）
- **Population Overview**: 導入文で Combat Deaths レイヤーと窓の共有を説明
- **Tooltip**: `getCombatDeathsTip`（`cellInfoService`）— SVG hover と hybrid cell pick の両方

### 3.6 テスト

`src/generators/populationLossTracker.test.ts`

- cell 集計の加算
- 時間窓外の除外
- 無効 cellId の無視（state は計上）
- telemetry への `cellId` 伝播

### 3.7 意図的にやっていないこと

| 項目 | 理由 |
| :--- | :--- |
| Zones 自動生成 | ナラティブ戦域は別機能；強度は本レイヤーが担当 |
| 陣営別色分け | Overview Combat は双方合計；地図も同じ定義 |
| save/load 永続化 | Overview 死亡集計と同様セッション限定 |
| famine / natural の地理 | 発生地の意味が戦場と異なる |

---

## 4. 使い方（プレイヤー / デザイナー）

1. シミュレーションで戦闘を発生させる（Nobility 散発戦・攻城、Battle Screen など）
2. レイヤー **Combat Deaths** を ON
3. Population Overview → **Deaths** で day / week / month を切り替えると地図も同じ窓を再描画
4. Options → UI で contour（密度ヒート）と choropleth（セル塗り）を切替可能

---

## 5. Zones との役割分担

| 用途 | 手段 |
| :--- | :--- |
| どこで何人死んだか（強度） | **Combat Deaths** レイヤー |
| 侵攻・反乱などの「舞台」ラベル | 既存 **Zones**（生成時 type 等） |
| 激戦区に名前を付ける（将来） | 高死亡セルのクラスタ → 一時 Zone（未実装） |

詳細な要望メモは `docs/plan/military/war-zones.md`。

---

## 6. 変更ファイル一覧（実装時点）

| 領域 | ファイル |
| :--- | :--- |
| Tracker | `src/generators/populationLossTracker.ts` (+ test) |
| Demography / manpower | `demography-simulator.ts`, `manpower.ts` |
| Combat sites | `battle-resolution.ts`, `localSkirmish.ts`, `battle-screen.ts` |
| Renderer / layers | `combatDeathsRenderer.ts`, `renderers/index.ts`, `controllers/layers.ts` |
| View / init | `viewContext.ts`, `initViewLayers.ts`, `viewLayerService.ts`, `hybridLayerPolicy.ts` |
| State / UI | `layerState.tsx`, `optionsState.ts`, `populationOverviewState.ts`, `UiSettingsTab.tsx`, `PopulationOverviewDialog.tsx`, `options.ts` |
| Tips | `cellInfoService.ts`, `tooltipService.ts`, `mapInteraction.ts` |
| Telemetry | `simulationTelemetry.ts` |

---

## 7. 今後の拡張候補

1. **陣営 / state 別の死亡色** — `combatByCell` を state 別に二重化
2. **自動 Battlefield Zone** — 週次の高死亡連結成分を `pack.zones` に一時投入
3. **海戦** — SVG contour の `mask=url(#land)` だと海が消える；mask 解除 or マーカー併用
4. **Lab / telemetry 永続化** — Simulation Lab 向けに cell 死亡イベントをディスクへ
5. **WebGL contour 密度** — hybrid は choropleth のみ（SVG は contour 可）
