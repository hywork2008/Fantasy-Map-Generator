# World help: races, beauty, and pairing

Audience: players / writers / designers who need the **in-world social rule**, not just the data schema.  
Implementation: `src/extensions/characters/appearance.ts`, `src/data/races.ts`, `docs/plan/characters/appearance-and-reproduction.md`.

---

## Short version

1. **Same race** — people judge looks with a shared sense of beauty. High **Appearance** means striking or comely *among their own people*.
2. **Other races (default)** — you do not really “see beauty” the same way. The usual reaction is *odd*, *hard to read*, or *I don’t know what I’m looking at*. If body size and build are similar, you might notice that someone looks sturdy or slight in a way that maps onto your own kind — still not courtly beauty.
3. **Readable pairs (asymmetric)** — some folk can partially apply their *own* beauty ideal to another race. The classic case: **humans find elves beautiful** (fair-folk trope). Average elves stay ~50 among elves, but score well above 50 on the human scale. Reverse directions are weaker; many pairs stay unreadable. Implementation: `crossRaceAestheticReadability` in `appearance.ts`.
4. **Cross-race pairing** (romantic or marital) is widely treated as **deviant / perverse**, not as a normal alliance tool — **even when looks read as beautiful**. Rare private obsession exists; polite society does not celebrate it.
5. **Politics is different from marriage:** multi-folk realms and trade are normal. Pure mono-racial crusader states are the dangerous fringe — see [multi-race-geopolitics.md](./multi-race-geopolitics.md).

---

## What “Appearance” means

**Appearance** on a character is **not** a universal hotness ranking.

It is a cache of how that person scores under **their race’s beauty ideal** applied to their own **looks** (phenotype axes: stature, build, symmetry, refinement, vitality, ornament).

| Situation | How people talk about it |
| :--- | :--- |
| Same race, high Appearance | “Handsome among us”, “a true beauty of our folk” |
| Same race, low Appearance | “Plain”, “ill-favored”, “scarred past our taste” |
| Readable other race (e.g. human→elf), high pull | “Otherworldly beauty”, “almost too fine”, “strangely fair” — **not** “handsome among us” |
| Unreadable other race | “Strange”, “I can’t tell”, “uncanny” — not “ugly” in the home sense |
| Unreadable + similar physique | “Odd, but I can tell they are broad / slight like a strong one of ours” |

So: **同種族は Appearance で判断する。異種族は基本「読めない」が、一部の非対称ペアだけ観察者の美意識で部分採点する（人間→エルフが定番）。**

---

## Looks vs beauty

- **Looks** = measurable traits (tall/short, heavy/light, fine/coarse, marked/plain…). Objective enough to describe on a character sheet.
- **Beauty** = judgment. Requires a shared ideal. Ideals differ by race (elves prize refinement; orcs prize build and marks; dwarves prize solid build; and so on).

A human courtier does not score an **orc** on human court beauty. They mostly fail to apply that scale.

A human *can* partially judge an **elf** on human court beauty — and because elf baselines sit high on symmetry/refinement, the fair folk’s *median* looks beautiful to mortal eyes. That is intentional genre mischief, not a universal ranking.

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

### Civic stance (who lives with whom)

See [multi-race-geopolitics.md](./multi-race-geopolitics.md) and `src/data/raceCivicStance.ts`.

| Stance | Races | Courts |
| :--- | :--- | :--- |
| **Diplomatic** | Human, Elf, Dwarf | Mostly mono; rare mixed (only these three as staff) |
| **Distant** | Dark Elf, Giant, Draconic, Amazones | Always mono; full civil offices; keep distance |
| **Enemy colony** | Goblin, Orc, Arachnid | Always mono; **ruler + martial only**; no merchants/guilds |
| **Bound** | Wyrmkin | No free polity; only under **Draconic** (markets/craft thralls) |

### Named-character skills (species tilt)

Role and office still dominate, but race shifts medians (`raceSkillBias.ts`):

- Long-lived folk: lower median **Martial**; **wider skill σ** so rare masters appear more often.
- **Elf**: Learning/Prowess elevated (memory & personal guardianship); Martial low; slight Diplomacy. Personality: lower **boldness / greed / vengefulness**, higher rationality (slow politics, costly-war memory).
- **Dwarf / Human**: diplomatic core (engineering / baseline).
- **Orc** (enemy colony): Prowess high; Martial ≈ human; Diplomacy very low; hotter boldness/vengefulness.
- **Goblin / Arachnid** (enemy colony): warband / nest hunters; Diplomacy crushed.
- **Giant** (distant god-line): Prowess = Draconic; Engineering = Dwarf; Artistry mid-high; Martial low; Learning −3; Intrigue +4 (managed distance, not court poison). Personality: low sociability/compassion, guile & confidence up, greed down, unhurried.
- **Draconic** (distant): apex Prowess; weak Martial/Diplomacy/Engineering pride. **Merchants are Wyrmkin**, not dragons.
- **Wyrmkin** (bound): stewardship/diplomacy up; prowess down; thrall origins; face of dragon trade.
- **Dark Elf / Amazones** (distant): underdark intrigue or warrior matriarchy — not cosmopolitan.

---

## For writers

When writing NPC reactions:

- Same folk: free use of beautiful / plain / handsome.
- Human (or similar) looking at elves: *otherworldly*, *too fine*, *fair as a song* — still *not one of us*; desire is gossip fuel, not a wedding plan.
- Most other folk: prefer *unreadable*, *strange proportions*, *impressive bulk I don’t know how to rank*, *like a carved idol, not a person*.
- A scandal plot about a mixed pair should feel **transgressive** in the setting, not casually progressive unless you are deliberately writing a counter-cultural sect. Beauty does not license marriage.
