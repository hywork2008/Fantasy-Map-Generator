# World help: multi-race geopolitics (High Fantasy / Dark Fantasy)

Audience: players, writers, and designers.  
Related: race fertility & lifespan (`src/data/races.ts`), beauty & pairing ([races-beauty-and-pairing.md](./races-beauty-and-pairing.md)), demography vs character biology (`docs/plan/characters/appearance-and-reproduction.md`).

---

## Short version

1. **If one soldier ≈ one soldier**, races that breed slowly and live long (elves, draconic lines, etc.) **cannot survive** a world of continuous total war against fast breeders.
2. Therefore the default fantasy map is **not** endless ethnic crusade. It is a **settled balance**: borders and spheres mostly known, wars episodic and limited, most people living **apart or mixed in workable coexistence**.
3. **Mono-racial ethnostates** (“this realm is for one folk only, purify the rest”) are widely seen as **dangerous fanatics** — the kind of polity everyone else treats carefully, not as the civilized norm.
4. **Mixed polities**, vassal mosaics, trade leagues, and “live over there, trade here” arrangements are the **boring normal** that let short- and long-lived peoples both exist on the same map.

---

## Why the math breaks endless war

Rough genre priors (not historical demography):

| Folk type | Lifespan | Generations / century | Military attrition tolerance |
| :--- | :--- | :--- | :--- |
| Goblin / orc-ish | short | many | Can replace dead soldiers quickly |
| Human / Amazones | medium | several | Medieval-ish recovery |
| Dwarf | long | few | Slow recovery; values every veteran |
| Elf / dark elf | very long | very few | A lost field army is a **civilizational wound** |
| Draconic | extreme | rare | Cannot “fill ranks” after a generation of war |

If combat power is treated as roughly **1:1 per adult combatant** (current abstract military model), then:

- A polity that fights every decade like a human kingdom will **erase** slow-fertility races in a few human generations of map history.
- Fast breeders “win” by replacement, not by better culture or tactics alone.

So a High Fantasy setting that keeps elves *and* goblins *and* humans on the board for “now” (map start) **implies** that the recent past was **not** continuous race war at full intensity. Something already sorted the map into a livable equilibrium.

---

## Default world mood: post-settlement, not forever war

Think of the present age as **after** the messy migrations, god-wars, or empire collapses that sorted who lives where.

| What people assume is normal | What people call abnormal |
| :--- | :--- |
| Known frontiers, customs of tribute and truce | Open-ended “extermination” campaigns |
| Trade, hostages, seasonal raids that stop | Total war every generation |
| Multi-folk cities / marches / leagues | “One blood under one crown” purity states |
| War as tool of last resort or succession crisis | War as the permanent identity of the realm |

**“War is mostly a thing of the past”** does **not** mean zero conflict. It means:

- Great powers prefer **limited wars**, border adjustments, and internal coups over annihilating neighbors.
- Standing armies and marches exist, but **existential race wars** are rare, feared, and remembered as catastrophes.
- The simulation’s starting diplomacy should *feel* like a balance of power, not day-one free-for-all genocide.

Writers and AI personality flavor should bias toward **caution, memory of old disasters, and prestige for peacekeeping** among long-lived courts — and **opportunism within limits** among short-lived ones (they still need trade partners and fear coalitions).

---

## How peoples live: apart, mixed, or layered

All three are “normal,” depending on region:

1. **Apart** — forest realms, mountain holds, deep underdark, steppe belts: clear majority folk, minorities as guests or enclaves.
2. **Mixed** — ports, river capitals, caravan cities: several races under one law; neighborhoods by craft and kin more than by pure ethnostate ideology.
3. **Layered** — overlord of one folk, subjects of another (imperial pattern). Fragile if the overlord treats subjects as disposable; stable if tax and custom are predictable.

Cross-race **romance** remains deviant in polite society (see beauty/pairing help). Cross-race **politics and commerce** do not: envoys, merc companies, and guilds work across folk lines every day without “finding each other beautiful.”

**Exceptions — not neighbors:** **Goblins** (raid ecology) and **Arachnids** (nest predators that trap and eat other sapients) are **enemy-dedicated**. They do not staff mixed courts, markets, or guilds. On the map they appear as mono threat cultures / lairs; coexistence means *containment and frontiers*, not shared cities. See [races-beauty-and-pairing.md](./races-beauty-and-pairing.md).

---

## Mono-racial ethnostates = “dangerous madmen”

In this world’s common sense:

- A realm that **expels or kills** all other folk to keep a single race pure is coded as **extremist**, not patriotic default.
- Neighbors assume such states are **unpredictable warmongers** or theocratic purists: useful as temporary allies against a worse threat, never trusted as long-term peacemakers.
- Long-lived peoples especially treat “pure realm” rhetoric as a **prelude to suicidal wars** (they remember losing half a generation of adults).
- Short-lived peoples may *found* such states in a fever of conquest, then collapse or mellow when trade and multi-folk labor prove necessary.

**In-game flavor cues (when writing tooltips / chronicles):**

- “Isolationist purity cult,” “blood-law kingdom,” “the closed marches”
- Diplomatic modifiers conceptually: high fear, low trust, coalitions form against them if they expand
- Not every single-culture *map blob* is an ethnostate: a forest elven kingdom with human traders in the capital is still “normal.” The red flag is **doctrine of purity + expansion**, not “one culture is majority on the map.”

---

## Implementation status (foundation)

| Piece | Status |
| :--- | :--- |
| `Culture.monoRacial` | Non-human cultures default **mono**; human/unknown **mixed** |
| `State.racialComposition` | Set at character generation (`mono` \| `mixed`) |
| Court size | Scaled by race lifespan density — long-lived **mono** courts are thin |
| Mixed courts | Officers/lords sample races with scarcity weights; majority culture race boosted |
| Frontier lords | Spawn probability also thinned by density |
| Diplomacy AI / war balance | **Not yet** — this foundation comes first |

## Simulation design guidelines

| Area | Guideline |
| :--- | :--- |
| Map start | Prefer settled spheres; avoid forcing day-one total war as the only interesting path |
| Military model | Pure 1:1 troop math is an abstraction; if race war becomes frequent, either slow fertility races die or the model needs race-aware recovery / force quality / war exhaustion |
| Diplomacy AI | Long-lived courts: lower appetite for high-casualty wars; higher memory of grievances; prefer status quo |
| Ethnostate AI | Mono-racial states are the purity fringe; higher aggression / intolerance later |
| Characters | Scarcer long-lived named cast; mixed polities multi-race rosters |
| Player expectation | High Fantasy is a **coexistence sandbox with dangerous fringe polities**, not a race-elimination auto-battler |

If later code ties manpower recovery to race fertility, **this document is the reason** peace and mixed polities must remain viable strategies.

---

## Tension with “cross-race pairing is deviant”

These rules coexist deliberately:

- **Public kinship and marriage** stay same-folk (purity of house and blood myths).
- **Public politics and markets** stay multi-folk (survival of the balance).
- Ethnostates try to make *politics* as closed as *marriage* — that overreach is what makes them mad in the eyes of the wider world.

---

## One-line pitch

> *The map is what you get after the age of endless slaughter failed everyone: peoples live side by side or next door under imperfect truces; pure-blood crusader kingdoms are the ones everyone watches like a lit fuse.*
