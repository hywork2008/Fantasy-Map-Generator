# World help: races, beauty, and pairing

Audience: players / writers / designers who need the **in-world social rule**, not just the data schema.  
Implementation: `src/extensions/characters/appearance.ts`, `src/data/races.ts`, `docs/plan/characters/appearance-and-reproduction.md`.

---

## Short version

1. **Same race** — people judge looks with a shared sense of beauty. High **Appearance** means striking or comely *among their own people*.
2. **Other races** — you do not really “see beauty” the same way. The usual reaction is *odd*, *hard to read*, or *I don’t know what I’m looking at*. If body size and build are similar, you might notice that someone looks sturdy or slight in a way that maps onto your own kind — still not courtly beauty.
3. **Cross-race pairing** (romantic or marital) is widely treated as **deviant / perverse**, not as a normal alliance tool. Rare private obsession exists; polite society does not celebrate it.
4. **Politics is different from marriage:** multi-folk realms and trade are normal. Pure mono-racial crusader states are the dangerous fringe — see [multi-race-geopolitics.md](./multi-race-geopolitics.md).

---

## What “Appearance” means

**Appearance** on a character is **not** a universal hotness ranking.

It is a cache of how that person scores under **their race’s beauty ideal** applied to their own **looks** (phenotype axes: stature, build, symmetry, refinement, vitality, ornament).

| Situation | How people talk about it |
| :--- | :--- |
| Same race, high Appearance | “Handsome among us”, “a true beauty of our folk” |
| Same race, low Appearance | “Plain”, “ill-favored”, “scarred past our taste” |
| Other race, any looks | “Strange”, “I can’t tell”, “uncanny” — not “ugly” in the home sense |
| Other race + similar physique | “Odd, but I can tell they are broad / slight like a strong one of ours” |

So: **同種族は Appearance で判断する。異種族は美醜というより理解不能が主。**

---

## Looks vs beauty

- **Looks** = measurable traits (tall/short, heavy/light, fine/coarse, marked/plain…). Objective enough to describe on a character sheet.
- **Beauty** = judgment. Requires a shared ideal. Ideals differ by race (elves prize refinement; orcs prize build and marks; dwarves prize solid build; and so on).

A human courtier does not score an orc on human court beauty. They mostly fail to apply that scale.

---

## Why cross-race romance is rare in play

Mechanically:

- Romantic **favor** almost never seeds across races; when it does, scores stay low (private deviant curiosity).
- Dynastic / political **marriage** evaluation treats cross-race matches as `cross_race_deviant` and refuses them by default.

Socially (in fiction):

- Kinship, inheritance, and cultic purity stories assume same-folk households.
- Mixed pairing is gossiped as vice, witchcraft, captivity-bonding, or frontier madness — not as fashionable court fashion.
- Merchants and envoys may work with other races daily without finding them *beautiful*.

---

## Amazones and other edge cases

- **Amazones** are a race with female-only character generation for their polities. Their beauty ideal favors vitality and build (warrior ideal).
- Their fertility is human-scale; heirs of Amazon mothers use Amazon maternal biology even if stories involve foreign sires (sire race does not rewrite court gender policy).

---

## Reproduction (related)

Household child counts use **race fertility** (maturity age, interbirth spacing, litter size), not a single human “one child every four years” rule. Elves have sparse, late generations; goblins and arachnid folk breed faster and in larger clutches. See the race catalog and the design doc for numbers.

**Long-lived pairing is episodic**, not lifelong continuous marriage: co-parenting bonds matter while raising young; most of a multi-century life is unpaired. Children may exist without a current spouse, and need not all share the same co-parent. Short-lived folk keep a more familiar continuous-household snapshot. **Dwarves** are the exception among long-lived races: continuous monogamy (clan household culture).

### Named-character skills (species tilt)

Role and office still dominate, but race shifts medians (`raceSkillBias.ts`):

- Long-lived folk: lower median **Martial** (few mass-army command opportunities); **wider skill σ** so rare masters appear more often.
- **Elf**: Martial low, Learning/Artistry up, Prowess modestly up.
- **Dwarf**: Engineering high; milder Martial penalty.
- **Orc**: Prowess high; Martial ≈ human (war + fertility → field experience).
- **Draconic**: highest Prowess, lowest Martial; pride depresses Diplomacy and Engineering.
- **Goblin**: **enemy-dedicated** — mono warband courts (ruler / martial only); never mixed-court staff or peaceful merchants/guild masters.
- **Arachnid**: **enemy-dedicated** nest/brood predators (same roster rules as goblins). Web-and-prey ecology: other folk are food or threats, not neighbors. Ambush (Intrigue / Prowess) over mass Martial; Diplomacy near-zero. Not a multi-folk city race.

### Enemy-dedicated folk (goblin, arachnid)

These species do **not** participate in mixed polities’ peaceful life:

| | Goblin | Arachnid |
| :--- | :--- | :--- |
| Ecology | Raiding swarms, short-lived boom | Nest hunters; trap, wrap, consume |
| Map presence | Mono cultures / frontier threat | Mono lair cultures / wild threat |
| Named characters | Ruler + martial only | Same |
| Mixed court | Never | Never |
| Merchants / guilds | No | No |

They can still form **mono** threat polities on fantasy maps (Kobold / Arago / Rakhnid cultures), but those courts are warbands or brood nests, not cosmopolitan states.

---

## For writers

When writing NPC reactions:

- Same folk: free use of beautiful / plain / handsome.
- Other folk: prefer *unreadable*, *strange proportions*, *impressive bulk I don’t know how to rank*, *like a carved idol, not a person*.
- A scandal plot about a mixed pair should feel **transgressive** in the setting, not casually progressive unless you are deliberately writing a counter-cultural sect.
