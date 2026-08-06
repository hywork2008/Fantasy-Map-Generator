# High Fantasy Dungeons — Placement Plan

- **Status**: Design + Phase 1–3 implemented (placement, danger, clear, spontaneous spawn); Tools UI deferred
- **Last updated**: 2026-08-04
- **Scope**: High Fantasy first; Dark Fantasy can reuse the same data model later
- **Related**: [wild-oikoumene-frontier.md](wild-oikoumene-frontier.md), [danger-layer.md](danger-layer.md), [mineral-resource-system.md](mineral-resource-system.md)

---

## 0. Goal

地図上に **ダンジョン** を配置する。ダンジョンは次の概念の合成である:

| 既存レイヤー | ダンジョンでの対応 |
| :--- | :--- |
| **Danger** | ボス強さ（rarity / power）と局所危険 |
| **Mineral Deposits** | 富（宝・埋蔵）— 鉱床そのものではないが「同じ場所に危険と富がある」読み味 |

**この計画の範囲は配置・存在・討伐による消滅の骨格まで。** 内部探索・ボス戦シミュレーション・戦利品経済は非目標。

---

## 1. Requirements

1. ダンジョンは **陸地** に **0 個〜複数**。海は将来の可能性のみ（優先度 ≈ 0）。
2. **危険が高いほど富と相関しやすい** が、**危険 ≠ 富の保証**。
3. **危険が高く富が無い** ダンジョンが **都市近く** に現れ、対処せざるを得ないケースがある。
4. **数十年〜数百年** スケールで **自然発生** する（初期配置だけではない）。
5. 各ダンジョンに **ボス**。強さは Danger の **rarity 梯子** と同じ感覚。
6. **ボス討伐 → ダンジョン消滅**（地図上から消える）。
7. **内部マップ・討伐プレイは作らない**。存在と配置とクリア結果だけ。

---

## 2. Non-goals

| Out of scope now | Why |
| :--- | :--- |
| One-page-dungeon iframe / room graph | レガシー Marker の flavor のみ。本システムの中核にしない |
| ターン制ボス戦・パーティ編成 | 別システム |
| 戦利品の市場流通・国家予算 | 後続（economy 連携は Phase 後期） |
| 海域ダンジョン | 優先度 ≈ 0 |
| ダンジョンが `cells.state` を書き換える | wild-oikoumene 不変条件（危険 ≠ 領有）を守る |

---

## 3. Relationship to existing systems

### 3.1 Legacy `markers-generator` dungeons (`type: "dungeons"`, 🗝️)

- 低人口セルへ装飾 Marker + Watabou iframe。
- **方針**: High Fantasy では **レガシー dungeon 生成を multiplier=0** し、`pack.dungeons` + `type: "dungeon-site"` に置き換える。

### 3.2 Monsters / Danger field

- ボスは **Monster 配列に混ぜない**（lifecycle が違う）。
- Active ボスは `rebuildDangerField` に Monster 相当の `power` として合成される。
- High Fantasy: **r1–r2 主体、r3 稀、r4–r5 なし**。

### 3.3 Mineral deposits (economy)

- `treasureTier` は `MineralDeposit` のコピーではない。
- 配置スコアは近傍鉱床 richness を **任意バイアス** に使う（economy OFF でも生成可）。

### 3.4 Wilderness ecology

- Hunt/cull は当面 Monster のみ。dungeon clear は別 API（`clearDungeon`）。
- Danger rebuild 時は active dungeons も必ず含める。

---

## 4. Domain model

See `Dungeon` in `src/types/models.ts` and `pack.dungeons` on `PackedGraph`.

### Archetypes

| kind | Share | Placement bias | Treasure |
| :--- | ---: | :--- | :--- |
| wealth_lair | ~35% | high danger + mineral/height | mid–high |
| problem_lair | ~25% | near burgs / border; min rarity often 2 | 0–1 |
| lost_vault | ~25% | far from oikoumene | high |
| empty_ruin | ~15% | noise | 0–1 |

### Correlation

```
P(high treasure | high rarity) > P(high treasure | low rarity)
BUT P(treasureTier === 0 | rarity ≥ 2) > 0
```

---

## 5. Pipeline

```
Threats.generate → settlement / states / wildLand
  → Markers.generate (legacy dungeons suppressed on highFantasy)
  → Dungeons.generate (land placement, markers, danger rebuild with bosses)
  → (later) dungeonEcology spontaneous spawn
```

---

## 6. Implementation phases

### Phase 0 — Design ✅

### Phase 1 — Data + initial placement

- [x] `Dungeon` type + `pack.dungeons`
- [x] `dungeonProfiles` + `dungeons-generator.ts`
- [x] Markers + notes (no Watabou)
- [x] Disable legacy dungeon markers when highFantasy
- [x] Unit tests
- [x] dataFieldOwnership

### Phase 2 — Danger + clear

- [x] Bosses contribute to danger rebuild (via `dungeonsAsDangerSources`)
- [x] `Dungeons.clear` removes site + rebuilds danger (no state claim)

### Phase 3 — Spontaneous spawn

- [x] `dungeonEcology.tick` annual Jan-1 spawn under maxActive
- [x] `Dungeons.spawnOne` append path

### Deferred

- Sea dungeons, boss combat, loot economy, interior maps, Dark Fantasy profile, Tools clear UI

---

## 7. Invariants

1. Land-only for v1.
2. Active count may be **0**.
3. `treasureTier` is not a pure function of `bossRarity`.
4. Clear removes site; does not annex cells.
5. No interior simulation.
