# Wild oikoumene & frontier danger (Fantasy presets)

- **Status**: Design + Phase 0–5 implementation  
- **Last updated**: 2026-08-04  
- **Related**: [frontier-expansion.md](frontier-expansion.md), [danger-layer.md](danger-layer.md), [multi-race-geopolitics.md](../world/help/multi-race-geopolitics.md)

---

## 0. Goal

Produce maps where:

1. **Human (and allied folk) living space is limited** — States do not paint all land.
2. **Wilderness has standing threats** — danger field + monsters / beasts that cull settlement and justify empty land.
3. **Threats are playable** — most can be fought; only Dark Fantasy keeps world-ending rarity 4–5.
4. **States keep distance** from high-danger cores (expand cost / ban; later wild_reserve tags).

---

## 1. Preset split

| Culture set | Settlement default | Threat profile |
| :--- | :--- | :--- |
| **highFantasy** | **`marches`** + **oikoumeneLandShare ≈ 45%** | **Light**: rarity **1–2** moderate; **3** rare; **4–5 none** |
| **darkFantasy** | **`marches`** + same land-share control | **Heavy**: rarity 3–5 present; 1–2 background |
| world / european / … | `standard` (compatibility) | No threat generation (current) |

### Oikoumene land share (configurable)

Option **`oikoumeneLandShare`** (UI: 15–85%): target share of **suitable land capacity** that becomes the settled oikoumene for non-`standard` patterns. Overrides the pattern’s built-in `settledFootprint`.

| Share | Effect |
| ---: | :--- |
| ~30% (Frontier preset) | Small nuclei, long wild frontiers |
| **~45% (Marches / Fantasy default)** | Several polity islands; each state tends to face wilderness/danger more than endless mutual borders |
| ~55% (Scattered) | Larger realms, still some unclaimed land |
| 100% (Standard) | Full habitable fill (share control ignored) |

Patterns: `frontier` &lt; `marches` &lt; `scattered` &lt; `dense` in footprint.

Rationale: Rarity 4–5 (Arch-Beast / Calamity) empty kingdoms and are “too fatal for humans” as the **default High Fantasy** mood. High Fantasy uses **frontier ecology + local beasts**, not continental disasters.

---

## 2. High Fantasy threat profile (normative numbers)

Spawn counts are rolled per map (`rand(min, max)`). Powers are influence radii for danger propagation (cells).

| Rarity | Role | Count (min–max) | Power (default) | Notes |
| ---: | :--- | ---: | ---: | :--- |
| 5 | Calamity | **0** | — | Not used in High Fantasy |
| 4 | Arch-Beast | **0** | — | Not used in High Fantasy |
| 3 | Greater Monster | **0–2** | 12–16 (milder than DF 20) | Occasional regional problem; not map-wide |
| 2 | Dire Beast / lesser monster | **12–24** | 7–9 | Moderate scatter; main wilderness texture |
| 1 | Beast | **25–45** | 4–6 | Background hunting pressure |

Danger aggregation: prefer **`max`** or **`nonlinear`** for High Fantasy so piles of beasts do not outshine a single r3. Dark Fantasy may keep user `threatCalculation` (default additive).

Markers / notes: keep rarity ≥ 3 only (unchanged).

---

## 3. Spatial model (phases)

### Phase 0 — Design freeze (this doc) ✅

### Phase 1 — Threat profiles + fantasy frontier defaults (implement now)

- [x] `threatProfiles` keyed by culture set  
- [x] Threats.generate for `highFantasy` and `darkFantasy`  
- [x] highFantasy: no r4/r5; r1–r2 heavy; r3 rare  
- [x] Selecting highFantasy / darkFantasy applies `initialSettlementPattern = marches` + ~45% oikoumene land share (rewrites sticky locks)  
- [x] Foundation expands through habitable hinterland (not only river/coast candidates) so Marches footprint is visible on the map  
- [x] `assignInitialPolities` paints full foundation hinterland around capitals (not only route corridors)  
- [x] Capital count follows Polity density slider (not node/2), so larger oikoumene does not spawn micro-states  
- [ ] Options UI labels for “Fantasy threat profile” (optional follow-up)

### Phase 2 — Expand respects danger ✅

- [x] `dangerExpandPolicy.ts`: ban at danger ≥ **80**; cost `danger × 30` below ban  
- [x] `States.expandStates` (standard flood-fill) skips banned cells and pays danger cost  
- [x] `assignInitialPolities` does not paint banned cells (routes / regions / pocket fill)  
- [x] Frontier outpost eligibility max danger aligned to ban − 1 (was 120)

### Phase 3 — Wild land tags ✅

- [x] `pack.cells.wildLand` codes: `0 none` | `1 claimable_frontier` | `2 wild_margin` | `3 monster_domain`  
- [x] `assignWildLandTags()` after state generation; re-run after frontier incorporation  
- [x] Thresholds: margin when danger ≥ 25; monster_domain when danger ≥ 80 (same as expand ban)  
- [x] Frontier outposts **only** on `claimable_frontier` (margin/monster = keep distance)  
- [x] Incorporation skips monster_domain corridor cells  
- [x] Danger pick tooltip shows wild land label when present

### Phase 4 — Cullable threats + rewilding ✅

- [x] `wildernessEcology.ts`: annual hunt/cull projects near state borders reduce monster `power`  
- [x] Danger field rebuilt from living monsters (`dangerField.rebuildDangerFromMonsters`) after cull/rewild  
- [x] Claiming land remains separate — cull never writes `cells.state`  
- [x] Unhunted monsters recover toward `basePower` (rewild pressure)  
- [x] Ambient danger creep on unclaimed threat-gradient cells; `assignWildLandTags` after each annual pass  
- [x] `simulation.wilderness` cull project state + archive normalize; Tools panel shows active hunts  
- [x] Registered as `wilderness-ecology.tick` (politics phase, self-gates to Jan 1)

### Phase 5 — Biome predators (non-monster) ✅

- [x] `biomePredators.ts`: forest / mountain (catalog tags) contribute low local danger  
- [x] Soft 1-hop edge bleed; hard cap well below expand ban (no predator-only monster_domain)  
- [x] Layered after monsters via `rebuildDangerField` (Threats.generate + annual wilderness ecology)  
- [x] No Monster markers / notes for predators  
- [x] darkFantasy intensity scale 1.25 vs highFantasy 1.0; governed land half pressure after states exist  

---

## 4. Pipeline order (target)

```
terrain / biomes
  → Threats.generate (fantasy sets)     // danger field early
  → rankCells / settlement foundation // low-danger cores preferred
  → population / burgs
  → states.expand (danger cost)       // Phase 2
  → routes / military
```

Today Threats already run before settlement pattern in `main.ts` — keep that order.

---

## 5. Invariants

1. `standard` culture sets do not spawn threats (backward compatible).  
2. highFantasy never spawns rarity ≥ 4 under the default profile.  
3. `cells.state = 0` remains unclaimed land; wilderness is not a diplomatic actor.  
4. danger attenuates suitability (`rankCells`); it does not by itself assign state ownership.  
5. Cull/claim separation (Phase 4): lowering danger ≠ automatic annexation.

---

## 6. Acceptance checks

| Check | High Fantasy | Dark Fantasy |
| :--- | :--- | :--- |
| Unclaimed livable land remains | Yes (frontier pattern) | Yes (frontier) |
| Rarity 4–5 count | 0 | ≥ 0 (profile/options) |
| Rarity 1–2 present | Yes, moderate–high | Yes |
| Rarity 3 | Rare (0–2) | Commoner (options) |
| Danger reduces settlement suitability | Yes | Yes |

Unit tests: profile resolution for highFantasy zeros r4/r5 and allows r1–r3 ranges.

---

## 7. Non-goals (this design slice)

- Full hunt UI / party combat.  
- Rewriting military 1:1 troop model.  
- Making Dark Fantasy as mild as High Fantasy (it stays harsher).  
- Auto-genocide of high-fertility races (ecology + frontier is the pressure valve).
