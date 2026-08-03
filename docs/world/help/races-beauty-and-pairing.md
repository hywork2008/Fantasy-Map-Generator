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

---

## For writers

When writing NPC reactions:

- Same folk: free use of beautiful / plain / handsome.
- Other folk: prefer *unreadable*, *strange proportions*, *impressive bulk I don’t know how to rank*, *like a carved idol, not a person*.
- A scandal plot about a mixed pair should feel **transgressive** in the setting, not casually progressive unless you are deliberately writing a counter-cultural sect.
