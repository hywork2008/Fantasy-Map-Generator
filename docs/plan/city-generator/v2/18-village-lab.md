# 18. Village Lab — SVG 先行の形態検証環境

| 項目 | 値 |
|------|-----|
| 文書 ID | 18-village-lab |
| 日付 | 2026-07-13 |
| 改訂 | r1 |
| ステータス | **Active** |
| 関連 | [17-village-morphology-v2.md](17-village-morphology-v2.md)、[16-compact-village.md](16-compact-village.md)、[10-rendering-ui.md](10-rendering-ui.md) |

---

## Overview

村落形態（特に pop ~50–100）の説得力は **平面の道・間口・疎密** で決まる。deck.gl 3D 上で継ぎ足すと形態バグと描画ノイズが混ざる。

**Village Lab** は:

1. **生成は 1 本**（`generateCity` / 将来の roads-first コア → `CityModel`）
2. **描画は SVG 2D が先行**（同じ rings / paths を平面図にする）
3. deck.gl は形態が 17 の受け入れを通った **後** に同じ model を載せる

```text
params (seed, pop, site, …)
        │
        ▼
 generateCity / generateVillageLab  →  CityModel
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
  SVG Lab (今)    unit tests     deck.gl city (既存)
                  + village metrics
```

**禁止**: SVG 内に別生成アルゴリズムを書くこと。SVG は可視化のみ。

---

## Goals & Non-Goals

### Goals

- 村を **トップダウン SVG** で即時再生成・比較できる
- 17 の **morphology API（V1）** を export + 単体テスト可能にする（製品 `generateCity` の見た目は K48 どおり当面変更しない）
- **V0 相当**: 村向けメトリクス（V1b 住居数、M13 N/A 等）を `validateCity` に載せる
- seed / pop / site を URL で共有し、見た目回帰の基準にする

### Non-Goals

- deck.gl 村の見た目改善（後工程）
- Watabou 互換 API / タグ UI
- 都市生成の SVG 化
- PR-V3 の roads-first 製品切替（Lab は切替前の homestead も可視化する）

---

## Architecture

### モジュール

| パス | 役割 |
|------|------|
| `src/generation/villageMorphology.ts` | `VillageMorphologyId`, `pickVillageMorphologyId`, `finalizeVillageMorphology`, `useRoadsFirstVillage`（V1 API; 製品未配線） |
| `src/generation/villageBudget.ts` | budget に optional `morphologyId` 等 |
| `src/lab/renderVillageSvg.ts` | `CityModel` → SVG 文字列 / DOM |
| `src/lab/main.ts` + `lab.html` | Lab UI エントリ |
| `src/validation/metrics.ts` | village 分岐: V1b, M13 N/A |

### データ契約

- 入力: 既存 `CityParams`（`settlementType: 'village'` を Lab が強制可）
- 出力: 既存 `CityModel`（変更なし）
- Lab 付加: `plannedBudget = finalizeVillageMorphology(computeVillageBudget(p), …)` を **HUD 表示用**（生成経路と独立に 17 形態をプレビュー）

### 製品経路との関係（K48）

| 経路 | morphology | 描画 |
|------|------------|------|
| `/` deck.gl | `applyVillageMorphology` + homestead（現行） | WebGL |
| `/lab.html` SVG Lab | 同上で生成 + **finalize を並列プレビュー** | SVG |
| 将来 PR-V3 | `finalize` + roads-first | Lab で先に検証 → deck.gl |

---

## SVG レンダラ仕様

### レイヤ（下→上）

1. water（rivers / waterbody polygons）
2. fields
3. envelope ring（破線）
4. lots（house fill 薄、garden 更に薄）
5. roads（rank で色・幅）
6. buildings
7. landmarks / precincts outline
8. optional: nodes as dots when debug

### 座標

- 生成系: メートル直交、Y 北向き想定
- SVG: `viewBox` に bbox + padding、**Y 反転**（`scale(1,-1)` group または transform）

### 操作

- 再生成 / 乱数 seed
- pop 10–100
- siteArchetype
- レイヤ ON/OFF
- SVG ダウンロード
- URL: `?seed=&pop=&site=&lab=1`

---

## V0 / V1 スコープ（本実装）

### V1（morphology API）

- `villageMorphology.ts` 公開
- `VillageBudget.morphologyId?` 等 optional フィールド
- **unit tests only** — `index.ts` は `applyVillageMorphology` のまま

### V0（metrics）

- village: `V1b_dwellingCount`（exact N vs targetDwellings）
- village: `M13_gateCount` → **pass: true（N/A）**
- city: 既存 M\* 不変

### Lab

- `lab.html` + SVG 描画 + パネル
- メイン UI から Lab へのリンク任意

---

## Lab 生成モード（2026-07-13）

| mode | モジュール | 既定 |
|------|------------|------|
| **block-accretion** | `villageBlockAccretion.ts`（[19](19-block-accretion-village.md)） | **Lab 既定** |
| roads-first | `villageRoadsFirst.ts`（17 有機成長） | 比較用 |
| homestead | 製品 `generateCity` | ベースライン |

### block-accretion（主）

街区（1–3 戸スロット）を黄金律で連鎖 → スロットに家 → 街区 front から道を導出。

### roads-first V2（比較・レガシー Lab）

| モジュール | 役割 |
|------------|------|
| `villageRoadsFirst.ts` | 有機 streets + frontage |
| `villageWiggle.ts` | artery wiggle |
| `villageFrontage.ts` | exact-N 間口 |

URL 例: `/lab.html?seed=alsarah&pop=100&mode=block-accretion`

## Acceptance

1. `npm test` 全パス; city golden snapshot 不変
2. `npx vite` で `/lab.html` が開き、村 SVG が表示される
3. `finalizeVillageMorphology` が決定論的（同 seed 同結果）
4. village 生成で M13 が全体 pass を落とさない
5. SVG に roads + buildings + water が含まれる（空図でない）
6. Lab roads-first: pop 50 で道路・間口住居が生成され、決定論的; 製品 `generateCity` は homestead のまま

---

## Key Decisions

| ID | 決定 | 理由 |
|----|------|------|
| L1 | One generator, two renderers | 二重アルゴリズム禁止 |
| L2 | Lab は別 HTML エントリ | deck.gl 本線を汚さない |
| L3 | V1 API は製品未配線 | 17 K48 |
| L4 | 素 SVG（依存追加なし） | 検証速度優先 |
| L5 | 現行 homestead も Lab で描く | 現状診断と将来比較のベースライン |

---

## PR Plan（本作業の粒度）

単一実装バッチとして:

1. Doc 18 + README 索引
2. `villageMorphology.ts` + tests
3. village metrics V0
4. `renderVillageSvg` + `lab.html` + `lab/main.ts`
5. 16 先頭バナー（17/18 参照）

将来: roads-first を Lab 専用フラグで試し、17 受け入れ後に deck.gl 接続。
