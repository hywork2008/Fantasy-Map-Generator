# Arcane and supernatural durability

Status: **implemented** (2026-09-07; tempo retuned for Meteor Swarm / Rarity 5 hunts).  
Related: [long-lived-race-population-and-roster.md](../long-lived-race-population-and-roster.md), [danger-layer.md](../danger-layer.md)

## What this is

High Fantasy / Dark Fantasy only. Short-lived folk should hesitate to casually attack long-lived or apex folk. That is **not** a tenth `CharacterSkills` axis.

| Axis | Lives on | Scale |
| :--- | :--- | :--- |
| **Arcane** | `Character.arcane` (optional) | Cosmic 0–100. Human cap 10, Demon cap 100 |
| **Durability** | `Race.supernatural.durability` | 1 = human. Dragons ≫ giants > demons |

Martial 50 still means “competent commander.” Arcane 40 on a dragon is “near their ceiling,” not “below-average courtier.”

Dwarf **runes** are `engineering.runes`, not Arcane.

## Race table

| Race | Arcane cap | Median | Inclination | Durability |
| :--- | ---: | ---: | ---: | ---: |
| Demon | 100 | 55 | 0.70 | 2.5 |
| Elf | 95 | 50 | 0.55 | 1.15 |
| Giant | 90 | 45 | 0.35 | 3.5 |
| Dark Elf | 85 | 48 | 0.60 | 1.1 |
| Draconic | 40 | 18 | 0.08 | 8 |
| Amazones | 20 | 8 | 0.20 | 1.2 |
| Human | 10 | 3 | 0.12 | 1 |
| Dwarf | 10 | 2 | 0.05 | 1.35 |
| Wyrmkin | 12 | 5 | 0.15 | 1.1 |
| Goblin | 6 | 2 | 0.15 | 0.85 |
| Arachnid | 5 | 2 | 0.12 | 0.9 |
| Orc | 4 | 1 | 0.05 | 1.25 |
| Beastfolk | 3 | 1 | 0.08 | 1.15 |

Draconic barely *use* Arcane. Their deterrence is durability. Giants are less extreme but still dangerous in the flesh; their Arcane is primordial, not scholarship.

Typical elves sit near 50 (6th–7th analog). **Meteor Swarm (9th) is the 90–94 tail**, not the court median.

## Bands (potency / recovery / path)

| Arcane | Band | D&D analog | Casualties | Range | Recovery | Path |
| :--- | :--- | :--- | ---: | ---: | :--- | :--- |
| 1–19 | folk | 0–2nd | — | tens of m | hours–day | flavour |
| 20–49 | adept | 3rd–5th | 10–20 | ~100 m | ~1 week | daily skirmish |
| 50–69 | war | 6th–7th | 50 | hundreds of m | ~3 weeks | daily / campaign |
| 70–89 | highWar | 8th | 100–400 | ~800 m | ~2 months | daily / campaign |
| **90–94** | **meteor** | **9th Meteor Swarm** | **400–1200** | **~1.6 km** | **1 year** | campaign / hunt; **not daily** |
| **95–100** | calamity | beyond 9th | 3000 (cell event) | several km | **3–8 years** | hunt only |

- Lifetime cap applies **only to 95+** (3 at human-scale lifespan, 8 at elf 750).
- **One 90+ working per state per calendar year** (Fast-Forward safety).
- Daily skirmish still caps headcount at 120 and never spends 90+.

Rarity 5 army hunt (`power: 50`, `yearsToClear: 8`, ~7 power/year):

- 90–94 with the hunt: **+1 army-year** per working. With a meteor caster every year, a national hunt clears in about **4–8 years**.
- 95–100: **+3–8 army-years**, but **cannot spend the last power point** — the army finishes. A calamity working does not one-shot R5.

High Fantasy does not spawn R4–5; hunt assist is mainly Dark Fantasy.

## Combat hooks

- Incoming mundane casualties × `1/√durability`. Overwhelming annihilation (3×) still wipes.
- Daily skirmish: 20–89 only, present commander/burg, casualty cap 120.
- Siege/campaign: may spend 90–94 (full meteor casualties), yearly state gate, not 95+.
- Annual hunt: `applyArcaneHuntAssist` on the funded army project.
- Strategic planner multiplies required attack force by durability × ready-caster deterrence.

## Files

- `src/data/arcaneWorking.ts` — tables (host-safe)
- `src/data/raceSupernatural.ts` — race caps / durability
- `src/extensions/characters/arcane.ts` — roll, spend, deterrence
- `src/generators/arcaneHuntAssist.ts` — hunt extra power
- `personFactory.ts` — Fantasy-only generation
- `localSkirmish.ts` / `battle-resolution.ts` / `strategic-planner.ts` / `wildernessEcology.ts`
