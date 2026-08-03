# Character wealth diagnosis

Diagnoses personal `Character.wealth` distributions by paid role, with flags for historically inverted cases (e.g. child guild apprentices holding multi-gold purses while field commanders sit on copper/silver).

Related code (all stipend rates are still placeholders):

Full ladder: [character-wealth-balance.md](./character-wealth-balance.md).

| Role | File | Personal pay / cycle |
| :--- | :--- | :--- |
| Guild apprentice | `characterStipends.ts` | Fixed 0.03/0.05/0.08 × bond; solidarity ≥ 20 both ways |
| Guild master | same | Fixed 0.35 |
| Market rival / manager | same | Fixed 0.30 / 0.70 |
| Province lord | same | Fixed 1.00 |
| Field commander | `treasuryAllocation.ts` | `clamp(upkeep×15%, 0.5, 1.5)` |
| Central office | same | `clamp(dept×12%, 0.8, 3.0)` |
| Ruler | same | `clamp(income×formRate, 1.0, 5.0)` |
| Seed | `seedMissingCharacterWealth()` | 4–10 × same formulas (apprentice 2–6 pocket if bonded) |

See also [cost-of-living.md](./cost-of-living.md) (flavor only; not wired into stipend math) and [state-treasury-department-budget.md](../plan/state-treasury-department-budget.md) §7.

## Run from a save / dump

```bash
# Preferred npm entry
npm run diagnose:wealth -- path/to/file

# Direct
npx tsx scripts/diagnoseCharacterWealth.ts path/to/file

# Machine-readable outputs
npm run diagnose:wealth -- path/to/file --json /tmp/wealth.json --csv /tmp/wealth.csv
```

Accepted inputs:

- Legacy `.map` (characters JSON at slot index 45 — see `src/io/save.ts`)
- `temp/debug/map/45_characters.json` (array)
- `{ pack: { characters: [...] } }` or `{ characters: [...] }`
- Plain `Character[]` or id-keyed object map

## Run on a live map (browser)

```bash
npm run diagnose:wealth -- --browser
```

Copy the printed IIFE into the browser console on a running FMG tab (`npm run dev`). It reads `window.fmg.world.pack.characters`, prints `console.table` by primary paid bucket, and returns a summary object.

### Export live characters for offline re-run

```js
// browser console
copy(JSON.stringify(window.fmg.world.pack.characters));
// paste into e.g. temp/debug/live-characters.json, then:
// npm run diagnose:wealth -- temp/debug/live-characters.json
```

## Self-test

```bash
npx tsx scripts/diagnoseCharacterWealth.ts --self-test
```

Synthetic fixture: apprentice age 13 with 96 SP (8 gold), commander with 0.4 SP — expects inversion flags.

## How to read the report

- **Primary bucket** — multi-role characters count once, under the highest-priority paid role (ruler → offices → commander → province lord → guild → market → other).
- **Median coins** — internal silver pieces formatted with default 1G=12S, 1S=12C.
- **Flags**
  - `apprentice-vs-commander-median` — apprentice median > 2× commander median
  - `child-apprentice-gold` — under-18 apprentices with median ≥ 1 gold
  - `apprentice-near-master` — apprentices near master wealth
  - `no-wealth-field` — dump predates `Character.wealth` or stipends never ran (all zeros)
  - `commander-sub-silver` — commanders under 1 silver median

Older dumps without `wealth` will report zeros and the `no-wealth-field` flag; re-export from a current build after Generate / Advance Time.

## Expected historical order (rough)

```text
apprentice cash ≪ soldier / craftsman ≪ master / merchant ≪ field commander ≪ central office / lord ≪ ruler
```

If the table shows the reverse for guild apprentices vs field commanders, treat it as a balance bug, not flavor.
