# World help: multi-race geopolitics (High Fantasy / Dark Fantasy)

Audience: players, writers, and designers.  
Related: race fertility & lifespan (`src/data/races.ts`), civic stance (`src/data/raceCivicStance.ts`), beauty & pairing ([races-beauty-and-pairing.md](./races-beauty-and-pairing.md)).

---

## Short version

1. **Most realms are mono-racial.** Each folk keeps its own colonies, holds, forests, or nests. Multi-folk *states* are **rare** exceptions, not the map default.
2. **Human, elf, and dwarf** are the diplomatic core: they fight each other and also **form alliances**. Relative to everyone else, they are still “people you can talk to.”
3. **Dark elf, giant, draconic, Amazones, Beastfolk** keep **distance** — not open enemy, not open melting-pot. Strong cultures, closed doors. **Demons hold no states** and pass as Humans inside mortal society.
4. **Goblin, orc, arachnid** live in **enemy colonies** (raids, war-clans, predatory nests). They do not staff mixed courts or peaceful markets.
5. **Wyrmkin** are **bound servitors** of **draconic** realms only — no free kingdoms. They run markets, craft halls, and desk work dragons will not do themselves.
6. **Half Elves** are **bound slave-folk** of **elf** realms only — no free kingdoms. They appear as named ordinary folk at the same rarity as Human 「青い血」 (0.6%). Human–Elf children are sterile (liger-like).
7. Slow-fertility long-lived folk still cannot survive endless total war — limited wars and frontiers matter — but **coexistence is usually “next door,” not “same crown.”**

---

## Civic stances

| Stance | Races | Polity | Diplomacy flavor |
| :--- | :--- | :--- | :--- |
| **Diplomatic core** | Human, Elf, Dwarf | Mostly mono; **rare** mixed (~10–18%) | War *or* alliance; trade and treaties normal |
| **Distant** | Dark Elf, Giant, Draconic, Amazones, Beastfolk | Always mono | Formal distance; trade possible, mixed cities rare/absent |
| **Covert** | Demon | Never independent | Human guise; dispersed infiltration, usually acting alone |
| **Enemy colony** | Goblin, Orc, Arachnid | Always mono; war/nest courts only | Hostile ecology; containment, not co-citizenship |
| **Bound** | Wyrmkin, Half Elf | Never independent | Live only under a host race (draconic / elf); thrall or slave stock |

Implementation: `src/data/raceCivicStance.ts`. Enemy-colony characters: martial mono rosters only (`raceSkillBias` / `raceRoster`).

---

## Why multi-folk states are rare

- Ecology and culture: orc/goblin colonies and arachnid nests do not share law with prey/neighbors.
- Distant folk value purity of house and custom without being “genocide NPCs.”
- Even humans/elves/dwarves usually rule **their** lands; cosmopolitan ports and mixed courts are special places, not every capital.

**Mixed courts** (when they exist) only seat **human / elf / dwarf** officers. Distant and enemy-colony races never appear as random mixed-court staff.

---

## Enemy colonies (goblin, orc, arachnid)

| | Goblin | Orc | Arachnid |
| :--- | :--- | :--- | :--- |
| Life | Swarm raids, short boom | War-clans, martial colonies | Nest hunters; trap and consume |
| Map | Mono threat cultures | Mono war cultures | Mono lair cultures |
| Named cast | Ruler + martial only | Same | Same |
| Mixed city | Never | Never | Never |

Coexistence with them means **frontiers, fortresses, and seasonal war**, not shared guild halls.

---

## Distant folk

- **Dark elf**: intrigue and isolation; not open ally, not pure monster. Court plots and in-house power.
- **Giant** (god-line / Yotunn): cyclopean builders with draconic-level personal might and **deep-time longevity** (typical ~800 years, under high elves only slightly, well under dragons). They keep lesser folk out with **secrecy, intermediaries, and controlled access** (Intrigue for non-involvement — not dark-elf succession games). Little interest in mortal scholarship. Personality: low sociability/compassion, high guile and confidence, restrained greed. Sparse named courts and near-replacement births match millennial mono realms.
- **Draconic**: power and pride; keep lesser folk at arm’s length by apex presence more than scheming. **Named merchants and craft masters are almost never dragons** — those desks belong to **Wyrmkin**.
- **Amazones**: strong female-led warrior culture; other peoples find the social order hard to live under, so contact stays limited.
- **Demon**: no culture-state template and no infernal realm. Their number matches the number of living states; they pass as Humans across rulers, soldiers, influential professions, and commoners. Roughly 40% of states have none, while the remainder may hold several. Most act alone to provoke lethal human conflict; only about 15% currently cooperate in small pairs.
- **Beastfolk** (Veldan cultures): short-lived wild clans of mixed animal ancestry. Forest and grassland holds. Energetic and sociable among their own; thin book-learning; keep other folk at a neighbor’s distance.

The non-Demon distant folk get full (non-merchant-war-only) mono courts — civilizations, just not cosmopolitans.

### Bound servitors (Wyrmkin)

| | |
| :--- | :--- |
| Host | **Draconic** cultures only |
| Map | No independent culture/state templates |
| Named roles | `merchant` and `ordinary` (markets, guilds, desk/craft) resolve to Wyrmkin |
| Host keeps | Rulers, commanders, province lords, most central officers |
| Names | Host culture language sphere (Chinese mythic with draconic defaults) |
| Origins | Heavy **slave_born / freedman** stratum weights |

Implementation: `src/data/raceBoundServitors.ts`, applied in `createPerson` / `sampleRaceIdForState`.

### Bound slave-folk (Half Elf)

| | |
| :--- | :--- |
| Host | **Elf** cultures only |
| Map | No independent culture/state templates |
| Named roles | `ordinary`, `merchant`, `religious`, `central_officer` may resolve to Half Elf at **0.6%** (same rate as Human infernal atavism / 「青い血」) |
| Host keeps | Rulers, commanders, province lords |
| Origins | Heavy **slave_born / freedman** stratum weights |
| Biology | Sterile (Human–Elf liger). Looks and ability **medians** take the lower Human/Elf parent; **caps** take the higher. |

---

## Diplomatic core (human, elf, dwarf)

- Can be enemies of each other for centuries **and** still form leagues against a worse threat.
- Elves: sparse, long-lived; prefer limited wars.
- Dwarves: clan holds, craft, continuous monogamy.
- Humans: most flexible; slightly more likely to host the rare mixed polity.

---

## Demography still constrains total war

If one soldier ≈ one soldier, long-lived races cannot absorb endless attrition. The map still assumes **limited wars** more often than existential race crusades — especially among the diplomatic core. Enemy colonies are the constant frontier pressure; distant folk are careful neighbors.

---

## Implementation status

| Piece | Status |
| :--- | :--- |
| `raceCivicStance` | diplomatic / distant / enemy_colony / bound keys |
| `raceBoundServitors` | draconic → wyrmkin for merchant/ordinary |
| `Culture.monoRacial` | Default mono; rare mixed only for human/elf/dwarf |
| `State.racialComposition` | From culture at character gen |
| Mixed court sampling | Human/elf/dwarf only |
| Enemy-colony roster | Martial offices only; no merchants/guilds |
| Diplomacy AI modifiers by stance | **Not yet** |
| Sparse long-lived census + troop quality | **Not yet** — investigation: [long-lived-race-population-and-roster.md](../../plan/long-lived-race-population-and-roster.md) |
| Arcane + folk durability (fantasy only) | **Implemented** — [arcane.md](../../plan/characters/arcane.md). Not a 10th skill. Dwarf runes are Engineering. |

---

## One-line pitch

> *Peoples mostly keep to their own lands. Humans, elves, and dwarves still deal with each other as rivals and allies; giants, dragons, dark elves, and Amazones keep their distance; dragon markets are staffed by wyrmkin thralls, not by dragons; orcs, goblins, and spider-kin hold colonies and nests you do not invite to court.*
