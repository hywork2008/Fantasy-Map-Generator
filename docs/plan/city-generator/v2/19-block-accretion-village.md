# 19. 街区連鎖村落（Block Accretion）— Lab 主経路

| 項目 | 値 |
|------|-----|
| 文書 ID | 19-block-accretion-village |
| 日付 | 2026-07-13 |
| ステータス | **Active（Lab 主実験）** |
| 関連 | [17](17-village-morphology-v2.md)、[18](18-village-lab.md)、[16](16-compact-village.md) |

---

## Overview

roads-first の有機街路成長 + 後付け間口（17 Lab V2）は、SVG 上でも **説得力ある集落に収束しにくい**。  
ユーザー診断:

> いくつかの住居が綺麗に入る **街区** が先にあり、土地にはめて、街区のどの位置に家を建てるかだけがランダム。  
> あとは街区に沿った家同士を **道で繋ぐ**。  
> 1つ目の街区の次は、**角度と距離の黄金律**で置く。

本 doc はその因果を **正** とし、Lab の既定生成を **街区ベース** に切り替える。

### 実装（2026-07-13 再構築）: 向かい二列 + 緩曲線 + T 字

一列＋脇の一本道、という破綻を経て次に固定:

```text
1. 緩く曲がる本通り centerline（正弦の横ずれ）
2. 各ステーションで **左右に向かい合う街区**（河岸は乾側のみ）
3. pop が大きいと **T 字側道** + 側道沿いの家
4. greenVillage: 広場を空け **環状道**、家は外側を向く（中心を貫かない）
5. 道 = spine / ring + 側道 + highway（放射・迂回網は禁止）
```

| 形態 | 道路 | 家 |
|------|------|-----|
| street / crossroads / riverBank | 曲線本通り ± T | 二列（河は一列） |
| greenVillage | 環 + 放射 approach | 環の外側 |

---

## なぜ roads-first 有機成長が足りないか

| 問題 | 結果 |
|------|------|
| 道が先に不規則に伸びる | 間口矩形が載らない・underfill |
| 家が「道の脇の乱点」 | 連続したバーゲージ列に見えない |
| 街区の単位がない | 密度・空隙・角度の秩序が無い |
| 後付け接続 | 「好き勝手な線」に見える |

---

## 単位: VillageBlock（街区）

1 街区 = **同じ通りに面する 1 列の敷地帯**（短冊が 1〜3 戸分）。

```ts
interface VillageBlock {
  id: number;
  /** Front edge midpoint (on the future street) */
  frontMid: Point2;
  /** Unit along the street (frontage direction) */
  along: Point2;
  /** Unit into the lots (from street toward yards) */
  inward: Point2;
  /** Total frontage width of the block (m) */
  frontWidth: number;
  /** Lot depth (m) */
  depth: number;
  /** How many house slots (1–3) */
  slots: number;
  /** Occupied slot indices (which of 0..slots-1 get a house) — random subset with density */
  occupied: number[];
  ring: Ring; // outer parcel of whole block
}
```

典型寸法（pop 10–100）:

| 項目 | 値 |
|------|-----|
| 1 戸分間口 | 14–22 m |
| 奥行 | 18–28 m |
| slots | 1（小）/ 2（中）/ 3（大村で稀） |
| 街区間ギャップ（道+余地） | 6–12 m |
| 連鎖距離（front mid 間） | ≒ 0.5×(wA+wB) + gap |

---

## 黄金律: 次街区の置き方

既存街区集合 `B` に対し、次街区は **親街区 `P ∈ B` を1つ選び**、相対変換で置く。

### 相対パターン（重み付き）

| パターン | 角度（親 along 基準） | 距離 | 用途 |
|----------|----------------------|------|------|
| **continue** | 0° ± 8° | 親 front 端 + gap + 子 half-width | リボン延長（主） |
| **opposite** | 180°（道の向かい） | 道幅 + 2×setback | 両側町並み |
| **branch-L / R** | ±85–95° | 親側面中央から gap | 横丁 |
| **green-step** | 親から hub 周り +Δθ | ringR | green 村のみ |

重み例（streetVillage）: continue 0.50 / opposite 0.25 / branch 0.25。  
greenVillage: green-step 0.55 / continue 0.25 / branch 0.20。  
riverBank: continue 0.60（河と平行）/ branch 0.25 / opposite 0.15（対岸禁止）。

### 受理条件

- envelope 内（または半径 1.15× まで）
- 既存街区と lot リング非重複（minSep ≥ 3 m）
- 水・セットバック・片岸（riverCrossing）
- 最大連鎖距離: 既存 front から 80 m 以内に親がいる

失敗したら別パターン / 別親を試す。全滅なら **停止**（underfill 許容、spiral 禁止）。

---

## 家の配置（街区の中だけランダム）

```text
for each block:
  for slot in 0..slots-1:
    if occupied: place house lot in slot strip
    house setback from front 3–6 m
    optional garden behind
```

`occupied` は街区密度で決める（全 slots 埋めることも、1 だけ空けることも可）。  
**家のワールド位置の乱数はスロット内の微小ジッタのみ**（±1 m）。街区ごと飛ばない。

---

## 道の導出（家の後ではなく街区の後）

**禁止（荒れの原因だったもの）**: 全街区ペアの近傍リンク、各街区ごとの分断セグメント乱発、ハブ星型、ランダム field alley。

**正しい導出（accretion 木に従う）**:

1. **continue 連鎖** → 1 本の連続ストリート（mid 点列を結合）
2. **opposite** → 親と同じ通りを共有（追加道路なし）
3. **branch / greenStep** → 親ストリート上の最近点へ **T 字リンク 1 本のみ**
4. **highway** → 外側から hub へ 1 本、hub から root ストリートへ 1 本

道は「家を結ぶ」のではなく **街区の表通り + 親子の接合** だけ。

---

## 形態との対応

| morphologyId | 第1街区 | 連鎖バイアス |
|--------------|---------|--------------|
| streetVillage | hub 脇、approach 平行 | continue + opposite |
| greenVillage | hub 周り ringR | green-step |
| crossroadsHamlet | hub、3 方向へ branch 多め | branch 0.4 |
| riverBank | 乾岸、河平行 | continue along bank |
| dispersed | 1–2 街区のみ、短い接続 | continue のみ |

---

## Lab / 製品

| 経路 | 既定 |
|------|------|
| `/lab.html` | **block-accretion**（本 doc） |
| Lab 比較 | roads-first / homestead を残す |
| 製品 `generateCity` | 当面 homestead（K48）。本方式が Lab で安定したら切替 |

---

## Key Decisions

| ID | 決定 |
|----|------|
| **BA1** | 一次単位は道路セグメントではなく **街区** |
| **BA2** | 配置は **相対角・距離ルールの連鎖**（黄金律テーブル） |
| **BA3** | 家の乱数は **スロット内のみ** |
| **BA4** | 道は **街区 front の導出** |
| **BA5** | spiral / 星型 N 埋め禁止（16/17 と同精神） |
| **BA6** | Lab 既定を block-accretion に変更 |

---

## Acceptance（Lab）

1. pop 50/100 で街区が連続し、SVG 上で「通り沿いの家並み」に読める  
2. `countDwellingLots` ≥ 0.9 N（golden seeds は exact 目標）  
3. 家が道に面する（frontage を持つ）  
4. riverCrossing で水上 lot 0  
5. 決定論的  

---

## PR

1. Doc 19 + README  
2. `villageBlockAccretion.ts` + Lab 既定  
3. テスト  
4. （将来）製品配線  
