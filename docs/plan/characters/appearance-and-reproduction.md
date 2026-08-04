# Appearance axes & reproductive biology

Status: **design** (not implemented)  
Related: `personFactory.ts` (`appearance`, `generateFamily`), `backstoryProfile.ts` (favor / lust), `data/races.ts` (lifespan), `docs/plan/characters/marriage.md`

---

## 0. Problem

### Appearance today

- Single scalar `Character.appearance: 1–100` (gaussian μ=50).
- UI and romance treat **high = beautiful, low = ugly**.
- Age only *reduces* the scalar (`DECLINE_AGE_THRESHOLD`, `APPEARANCE_DECLINE_PER_YEAR`).
- Favor seeding and dynastic marriage gates use the same universal beauty axis.

This breaks as soon as races, cultures, or individual tastes differ:

- An orc warband may prize scars and bulk; an elven court may prize delicacy.
- Cross-race attraction is not “same number, same beauty.”
- Prestige / first impressions need *observer-relative* appeal, not a global hotness rank.

### Reproduction / family today

- `generateFamily()` derives child *counts* from years married × spouses, with monogamy / harem heuristics by **state form**, not race.
- No interbirth interval, no litter size, no race fertility window, no gestation.
- Population demography (`demographicBirthRate`) is separate and does not share character biology.

With Amazones, long-lived elves, short-lived goblins, etc., child spacing and clutch size must be **species data**, not human medieval defaults.

---

## 1. Goals

1. **Describe looks** independently of **how attractive** they are.
2. **Evaluate beauty relative to an observer** (race ideals, culture fashion, personal tastes).
3. **Attach reproductive parameters to Race** (interval, litter, fertility ages), with light culture/form modifiers later.
4. Keep Phase-1 surface area small: no full genetics sim, no 3D body model.
5. Preserve a **legacy `appearance` scalar** as a cached *human-court default attractiveness* (or deprecate after migration) so existing hooks do not break overnight.

Non-goals (for now):

- Full Mendelian inheritance of every trait.
- Real-time pregnancy simulation for every NPC every tick.
- Visual avatar generation from trait vectors.

---

## 2. Appearance: two layers

```
Phenotype (objective traits)          Preference (subjective weights)
─────────────────────────────         ──────────────────────────────
Character.looks / phenotype     ×     Observer ideals + personal bias
        │                                      │
        └──────────► attractiveness(observer, subject) ──► favor / marriage / UI label
```

### 2.1 Phenotype (what they look like)

Stored on the character. Axes are **1–100 intensity / placement**, not “beauty.”

| Axis id | Meaning (neutral wording) | Notes |
| :--- | :--- | :--- |
| `stature` | Short ↔ tall / imposing | Relative to *own race* norm at generation |
| `build` | Slight ↔ heavy / muscular | |
| `symmetry` | Asymmetric / rough ↔ balanced features | Universal soft quality; still not “beauty alone” |
| `refinement` | Coarse / rugged ↔ fine / delicate | Elf ideals high; orc/dwarf ideals may invert |
| `vitality` | Frail / pale ↔ hale / vivid | Youth and health cue; declines with age |
| `ornament` | Plain ↔ scarred / tattooed / adorned | Scars, ritual marks, jewelry presence |
| `exoticism` | Typical of local race ↔ foreign-looking | Relative to map’s common races; optional Phase 2 |

**Generation:**

- Roll each axis with race **baseline means** + individual noise (σ ≈ 12–15).
- Age shifts: primarily `vitality` ↓ after race-relative midlife; `refinement`/`symmetry` may soften slightly.
- Do **not** collapse to one number at roll time except for a derived cache (below).

**Race baselines (examples — design priors, not ethnography):**

| Race | stature | build | refinement | vitality | ornament |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Human | 50 | 50 | 50 | 55 | 45 |
| Elf | 55 | 35 | 75 | 60 | 40 |
| Dark Elf | 50 | 40 | 70 | 50 | 55 |
| Dwarf | 30 | 70 | 45 | 60 | 50 |
| Goblin | 25 | 40 | 30 | 50 | 55 |
| Orc | 65 | 75 | 30 | 65 | 60 |
| Giant | 90 | 80 | 35 | 55 | 40 |
| Draconic | 70 | 65 | 50 | 70 | 55 |
| Amazones | 55 | 60 | 50 | 65 | 50 |
| Arachnid / Serpent | race-flavoured outliers | | | | |

### 2.2 Beauty ideals (what counts as beautiful)

Not a character field. Ideals live on:

| Source | Role |
| :--- | :--- |
| **Race** | Species-default weights over phenotype axes + optional preferred *other-race* modifiers |
| **Culture** (optional later) | Fashion overlay (courtly refinement vs warrior ornament) |
| **Individual** (optional later) | Small personal bias from tastes / lust / backstory |

**Race beauty ideal** (example shape):

```ts
interface RaceBeautyIdeal {
  /** Weight per phenotype axis, sum need not be 1; signed: + prefers high axis, − prefers low. */
  weights: Partial<Record<AppearanceAxisId, number>>;
  /** Soft penalty when subject race ≠ observer race (0 = xenophile, 1 = strong in-group). */
  outgroupPenalty?: number; // 0..1
}
```

Examples:

- **Elf:** high `refinement`, mid-high `symmetry`, low `build` bulk, moderate outgroup penalty.
- **Orc:** high `build`, high `stature`, high `ornament` (scars), low weight on `refinement`.
- **Human (default court):** high `symmetry`, mid `refinement`, mid `vitality`.
- **Amazones:** high `vitality` + `build`, mid `stature` (warrior ideal), low outgroup penalty within matriarchal peers.

### 2.3 Attractiveness function

```ts
attractiveness(observer, subject): number // 1–100
```

Sketch:

1. For each axis: `score_a = 100 - |subject.looks[a] - idealTarget(a)|`  
   or use weight sign: prefer high if weight > 0, low if weight < 0.
2. Weighted average → raw.
3. Apply `outgroupPenalty` if races differ.
4. Optional: observer `tastes` include `lust` → slight boost; age gap heuristics later.
5. Clamp 1–100.

**Legacy `Character.appearance`:**

- Phase A: keep as **cached attractiveness under Human court ideal** (or subject’s own race ideal — pick one and document). Update on age decline of phenotype.
- Phase B: all call sites use `attractiveness(observer, subject)`; scalar becomes optional display only.

### 2.4 UI

- Character details: show **Looks** (axis bars or short prose), not only one number.
- Optional line: “To a typical [Race] observer: 72” using player / default race.
- Romance / marriage tools should show **observer-relative** scores when both parties known.

### 2.5 Implementation phases (Appearance)

| Phase | Deliverable |
| :--- | :--- |
| A1 | `AppearanceAxes` type + roll in `createPerson`; race baselines in `data/races.ts` |
| A2 | Race beauty ideals + `attractiveness()`; rewire favor seed & marriage appearance checks |
| A3 | Age declines axis-aware; UI shows axes |
| A4 | Culture fashion overlay; personal taste bias from backstory |

---

## 3. Reproduction: race biology + family generation

### 3.1 Where data lives

**Race** owns biological defaults (species).  
**Culture / form** may later adjust *social* marriage patterns (polygyny, age of first marriage) — already partially in `generateFamily` / form packs — but not litter size.

```ts
interface RaceFertility {
  /** Age of reproductive maturity (years). */
  fertilityStart: number;
  /** Soft end of female fertile window (years); males may extend later. */
  fertilityEnd: number;
  /** Typical years between successful births for a continuously paired couple. */
  interbirthYears: number;
  /** Mean live births per pregnancy / clutch (1 = singleton norm). */
  litterMean: number;
  /** Cap on live births per pregnancy. */
  litterMax: number;
  /** Optional: P(twins) style extra mass on litter > 1 — or encode via litterMean only. */
}
```

### 3.2 Calibration goal: **population simulation first**

Genre flavor (Tolkien / D&D maturity ages) still sets *when* a race can breed.  
**Spacing and window length** are chosen so multi-race maps do not explode or go extinct under long-lived low-mortality folk.

Primary metric:

```
R_max = (fertilityEnd − fertilityStart) / interbirthYears × litterMean
```

= expected live births for one birthing parent **continuously monogamous through the entire fertile window**.

| Band | Target R_max | Role |
| :--- | ---: | :--- |
| Near-immortal / very long-lived (elf, draconic) | **2.0–3.5** | Near replacement; adult death is rare outside war |
| Long-lived (dwarf, giant, dark elf) | **3.0–5.0** | Slow recovery; scarce heirs still feel true |
| Human-scale (human, amazones) | **7–10** | Pre-modern completed fertility; macro mortality trims growth |
| Boom species (orc, goblin, arachnid) | **≫ 10** | Fast rebound / clutch lore; later juvenile loss can cap them |

**Why not “elf every 20 years”?**  
A 400-year fertile window at 20-year spacing yields R_max ≈ **20** — higher than human completed fertility and catastrophic if adult mortality is low. English-fantasy sibling gaps of decades–centuries are a *side effect* of this balance, not the primary goal.

**Generation length** also matters: long `interbirthYears` and late `fertilityStart` keep intrinsic growth rate \(r \approx \ln(R_0)/T\) small even when R_max is slightly above 2.

### 3.3 Catalog defaults (population-sim calibrated)

| Race | fertilityStart | fertilityEnd | interbirthYears | litterMean | litterMax | R_max ≈ | Rationale |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Human / Unknown | 16 | 45 | 3.5 | 1.05 | 3 | 8.7 | Pre-modern continuous pairing TFR |
| Amazones | 16 | 42 | 3.0 | 1.1 | 3 | 9.5 | Human-like + warrior attrition |
| Elf | 100 | 400 | **120** | 1.0 | 2 | **2.5** | Near-replacement; century-scale sibling gaps |
| Dark Elf | 80 | 380 | **100** | 1.0 | 2 | **3.0** | Slightly faster / more war loss than high elves |
| Dwarf | 40 | 160 | **30** | 1.05 | 2 | **4.2** | Slow clans; not human spacing × long life |
| Goblin | 10 | 35 | 1.5 | 2.0 | 5 | 33 | Boom / bust |
| Orc | 12 | 40 | 2.5 | 1.3 | 4 | 14.6 | Fast, below goblin |
| Giant | 30 | 120 | **30** | 1.0 | 2 | **3.0** | Rare births |
| Draconic | 100 | 500 | **160** | 1.0 | 3 | **2.5** | Scarce clutches |
| Arachnid | 8 | 30 | 1.2 | 3.0 | 8 | 55 | Egg-sac boom (lore: few reach adulthood) |

Implemented in `src/data/races.ts`. Helper: `lifetimeExpectedBirths()` in `src/extensions/characters/fertility.ts`.

Fertile windows for long-lived races are **front-loaded** (end well before typical `lifespan`) so ancient individuals stop adding births — same stability trick as “one childbearing season” tropes, expressed as numbers.

### 3.4 Using fertility in `generateFamily`

Two household models (see `raceUsesEpisodicPairing`, lifespan ≥ 150):

**A. Continuous marriage (short-lived / human-scale)**

```
if unmarried roll → spouses=0, children=0
else:
  fertileYears = clamp(age, fertilityStart, fertilityEnd) after firstMarriageAge
  expected ≈ fertileYears / interbirthYears × spouses × litterMean
  children ≈ noise(expected)
```

**B. Episodic pairing (long-lived: elf, dwarf, giant, draconic, …)**

Long-lived folk are **not** married for centuries by default.

```
never-parent roll → children=0 (independent of current bond)
else:
  firstParentAge = social first co-parenting age (≥ fertilityStart)
  expected ≈ fertileYearsElapsed / interbirthYears × litterMean × availability(0.65)
  children ≈ noise(expected)   // past partners may differ; no spouse multiplier

current spouses = roll(currentlyPairedChance)   // independent of children
  // higher while co-parenting / for dynastic roles; low otherwise
```

- **Children and current spouses are decoupled** — a parent may be unpaired at snapshot time.
- **Availability** models “not always together at conception timing” (travel, separate courts).
- **Polygyny / harem:** still only when currently paired and form allows; does not multiply lifetime episodic births.
- **Cross-race couples (later):** use mother’s race for gestation/litter; optional hybrid penalties.

### 3.5 Tick-time births (future)

When live succession births exist:

1. Track `yearsSinceLastBirth` on mothers (or household).
2. Eligible if age in `[fertilityStart, fertilityEnd]` and interval ≥ `interbirthYears` (with noise).
3. Spawn `sampleLitter()` child characters with race inheritance rules (mother / father / culture of court).
4. Soft-stop when lifetime births for that parent approach R_max (same formula as §3.2), so tick noise cannot create 10-child elves.

### 3.6 Demography link (macro ↔ micro)

| Layer | Owner | Today | Target |
| :--- | :--- | :--- | :--- |
| **Macro** cells / burgs | `demographicBirthRate`, cohorts | Abstract human-scale growth | Multi-race: weight by race mix × race-specific effective birth rates derived from R_max / generation length |
| **Micro** named characters | `RaceFertility` | Households via `generateFamily` | Tick births use same R_max / interval |

**Rule:** do **not** silently rewrite global `demographicBirthRate` from character fertility until a dedicated multi-race population model exists. When that model lands, **micro numbers are the source of truth** for species rates; macro applies carrying capacity (`roomForGrowth`), sex structure, and juvenile mortality.

**Bridge formula (sketch for later demography work):**

```
generationYears_r ≈ fertilityStart_r + 0.5 × (fertilityEnd_r − fertilityStart_r)
// or mean age at childbearing once marriage age is known
effectiveDaughters_r ≈ 0.5 × R_max_r × juvenileSurvival_r
r_intrinsic_r ≈ ln(max(ε, effectiveDaughters_r)) / generationYears_r
// then scale by roomForGrowth as today
```

Short-lived boom races need **high juvenile mortality** (or strong K pressure) so R_max ≫ 2 does not flood the map. Long-lived races rely on **low R_max**, not high juvenile death.

**World consequence (High Fantasy):** if military power stays ~1:1 per combatant, continuous race war wipes slow-fertility folk. Setting assumption: the present age is a **settled multi-race balance**; mono-racial purity states are fringe radicals. See `docs/world/help/multi-race-geopolitics.md`.

### 3.7 Implementation phases (Reproduction)

| Phase | Deliverable |
| :--- | :--- |
| R1 | `RaceFertility` on catalog + `pack.races`; load migration |
| R2 | `generateFamily` uses mother/character race fertility |
| R2b | **Population-sim recalibration** of catalog R_max (this revision) |
| R3 | UI: race editor or culture editor tooltip shows fertility summary + R_max |
| R4 | Tick births for nobility succession using interval + litter + lifetime soft-cap |
| R5 | Multi-race macro demography bridge (§3.6) |

---

## 4. Schema sketch (target)

```ts
// characterTypes.ts
export type AppearanceAxisId =
  | "stature" | "build" | "symmetry" | "refinement" | "vitality" | "ornament";

export type AppearanceAxes = Record<AppearanceAxisId, number>; // 1–100

export interface Character {
  // ...
  /** Objective looks. Preferred over legacy scalar for new logic. */
  looks?: AppearanceAxes;
  /**
   * @deprecated Cached attractiveness under a default ideal (human court or own-race).
   * Prefer attractiveness(observer, subject).
   */
  appearance: number;
}

// models.ts Race
export interface Race {
  // ... existing fields ...
  looksBaseline?: Partial<AppearanceAxes>;
  beautyIdeal?: RaceBeautyIdeal;
  fertility?: RaceFertility;
}
```

---

## 5. Call-site migration map

| Call site | Today | After |
| :--- | :--- | :--- |
| `personFactory` create | roll `appearance` | roll `looks` + derive cache |
| `advanceAge` | decline scalar | decline `vitality` (+ mild others) |
| `backstoryProfile` favor seed | `to.appearance` | `attractiveness(from, to)` |
| `characterSimulationHooks` marriage | appearance threshold | observer-relative threshold |
| Character details UI | one number | axes + “to me / to typical X” |
| `generateFamily` | 4-year human rule | race fertility |

---

## 6. Locked decisions (2026-08)

1. **Legacy `appearance` cache:** **subject’s own race ideal** (“handsome among my people”). Favor uses real observer via `attractiveness(observer, subject)`.
2. **Same race:** full Appearance judgment (phenotype × race beauty ideal).
3. **Cross race:** not beautiful/ugly on home scale — primarily *odd / hard to read*; stature+build similarity allows limited “sturdy/slight like ours” partial reading (score capped ~50). Lore: `docs/world/help/races-beauty-and-pairing.md`.
4. **Cross-race pairing:** socially **deviant**; dynastic marriage refuses (`cross_race_deviant`); romantic favor almost never seeds and stays low.
5. **Amazones reproduction:** external sire stories allowed; **Amazon mother fertility** for brood math; court characters remain female-only via race policy.
6. **Axis count:** six (stature, build, symmetry, refinement, vitality, ornament).
7. **Litter sampling:** `gauss(litterMean, …)` clamped to `[1, litterMax]`.
8. **Fertility priority:** **population simulation balance** over narrative “human-like spacing.” Long-lived R_max stays near replacement (§3.2–3.3). Sibling age gaps of ~100 years for elves are an accepted consequence.

---

## 7. Suggested first PR (minimal vertical slice)

1. Add fertility fields to race catalog (numbers from §3.3).  
2. Switch `generateFamily` to race fertility when race is known; keep form-based spouse rules.  
3. Add `looks` axes + race baselines; keep `appearance` as derived own-race attractiveness.  
4. Point favor seeding at `attractiveness(observer, subject)` with race ideals.  
5. Tests: elf households fewer kids than goblin; long-lived R_max band; orc observer ranks high-`build` higher than elf observer.

No demography engine change until R5. R1–R2 (+ R2b recalibration) are in tree.

---

## 8. Open questions

- Should Culture get a `beautyFashion` overlay in Phase A or wait for A4?
- Display language for axes (English UI): “Stature / Build / …” vs flavor prose only?
- Hybrid children: race id inheritance (mother / father / coin flip) when both parents exist as characters?
- Juvenile survival rates per race for the §3.6 demography bridge (especially goblin / arachnid)?

---

## 9. Summary

| Concern | Old model | New model |
| :--- | :--- | :--- |
| Looks | 1 number = beauty | Multi-axis **phenotype** |
| Beauty | Universal high=good | **Observer ideals** (race ± culture ± personal) |
| Kids count | Human 4-year rule × spouses | Race **interbirth + litter** × social marriage |
| Long-lived spacing | (was) ~20y elves → R_max≈20 | **R_max≈2.5–4** (pop-sim; ~100y elf gaps) |
| Data owner | Implicit human | **Race** biology + social form packs |
