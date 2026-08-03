# Character wealth diagnosis

Diagnoses personal `Character.wealth` distributions by paid role, with flags for historically inverted cases (e.g. child guild apprentices holding multi-gold purses while field commanders sit on copper/silver).

Related code (all stipend rates are still placeholders):

| Pool | File | Rate |
| :--- | :--- | :--- |
| Guild master | `src/extensions/economy/generators/characterStipends.ts` | 5% of guild treasury / cycle |
| Guild apprentice | same | **Fixed age-band pocket money only** when both-way solidarity ≥ 20: 0.03 / 0.05 / 0.08 SP per cycle (12–14 / 15–17 / 18+) × bond quality. Treasury is a funding ceiling only — never a multiplier |
| Field commander | `src/extensions/economy/generators/treasuryAllocation.ts` | `max(upkeep × 15%, floor 0.5 SP)` / cycle |
| Soldier upkeep base | `src/extensions/economy/generators/militaryLogistics.ts` | `BASE_UPKEEP_PER_HEAD = 0.12` |
| Market manager / rival | `characterStipends.ts` | 8% / 3% of market treasury |
| Seed back-pay | `seedMissingCharacterWealth()` | 6–18 cycles × rate (apprentice: 2–6 of pocket only if already bonded) |

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
