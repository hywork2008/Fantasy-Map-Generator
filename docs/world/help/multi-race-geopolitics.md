# World help: multi-race geopolitics (High Fantasy / Dark Fantasy)

Audience: players, writers, and designers.  
Related: race fertility & lifespan (`src/data/races.ts`), civic stance (`src/data/raceCivicStance.ts`), beauty & pairing ([races-beauty-and-pairing.md](./races-beauty-and-pairing.md)).

---

## Short version

1. **Most realms are mono-racial.** Each folk keeps its own colonies, holds, forests, or nests. Multi-folk *states* are **rare** exceptions, not the map default.
2. **Human, elf, and dwarf** are the diplomatic core: they fight each other and also **form alliances**. Relative to everyone else, they are still “people you can talk to.”
3. **Dark elf, giant, draconic, Amazones** keep **distance** — not open enemy, not open melting-pot. Strong cultures, closed doors.
4. **Goblin, orc, arachnid** live in **enemy colonies** (raids, war-clans, predatory nests). They do not staff mixed courts or peaceful markets.
5. **Wyrmkin** are **bound servitors** of **draconic** realms only — no free kingdoms. They run markets, craft halls, and desk work dragons will not do themselves.
6. Slow-fertility long-lived folk still cannot survive endless total war — limited wars and frontiers matter — but **coexistence is usually “next door,” not “same crown.”**

---

## Civic stances

| Stance | Races | Polity | Diplomacy flavor |
| :--- | :--- | :--- | :--- |
| **Diplomatic core** | Human, Elf, Dwarf | Mostly mono; **rare** mixed (~10–18%) | War *or* alliance; trade and treaties normal |
| **Distant** | Dark Elf, Giant, Draconic, Amazones | Always mono | Formal distance; trade possible, mixed cities rare/absent |
| **Enemy colony** | Goblin, Orc, Arachnid | Always mono; war/nest courts only | Hostile ecology; containment, not co-citizenship |
| **Bound** | Wyrmkin | Never independent | Live only under a host race (draconic); thrall stock for trade/craft |

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
- **Giant** (god-line / Yotunn): cyclopean builders with draconic-level personal might. They keep lesser folk out with **secrecy, intermediaries, and controlled access** (Intrigue for non-involvement — not dark-elf succession games). Little interest in mortal scholarship. Personality: low sociability/compassion, high guile and confidence, restrained greed.
- **Draconic**: power and pride; keep lesser folk at arm’s length by apex presence more than scheming. **Named merchants and craft masters are almost never dragons** — those desks belong to **Wyrmkin**.
- **Amazones**: strong female-led warrior culture; other peoples find the social order hard to live under, so contact stays limited.

They get full (non-merchant-war-only) mono courts — civilizations, just not cosmopolitans.

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

---

## One-line pitch

> *Peoples mostly keep to their own lands. Humans, elves, and dwarves still deal with each other as rivals and allies; giants, dragons, dark elves, and Amazones keep their distance; dragon markets are staffed by wyrmkin thralls, not by dragons; orcs, goblins, and spider-kin hold colonies and nests you do not invite to court.*
