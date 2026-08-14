# Historical ship fleets (medieval Europe)

Editorial reference data for distributing initial ships to port-owning states at map generation. Figures are **order-of-magnitude estimates** grounded in published secondary literature for western and northern Europe.

**Runtime implementation**: constants are copied into `src/extensions/shipbuilding/generators/initialFleetTables.ts` and applied by `initialFleet.ts`. When editing the CSVs, re-sync that TypeScript module by hand.

## Files

| File | Purpose |
| :--- | :--- |
| `period-ship-class-ratios.csv` | Share of seagoing hulls by game tier within each period |
| `period-ownership-mix.csv` | Typical owners of seagoing hulls by period |
| `polity-fleet-benchmarks.csv` | Attested or reconstructed fleet sizes for named polities |
| `starter-fleet-guidelines.csv` | Starter ship counts by period and maritime role (primary seed source) |
| `sources.csv` | Bibliography |

## Game ship-class mapping

`Sloop` / `Caravel` / `Galleon` are size tiers (see `src/types/shipClasses.ts`), not always historically contemporaneous names:

- `sloop` — small coastal freighter
- `caravel` — medium ocean-capable freighter
- `galleon` — large prestige / bulk / flagship hull

## Design notes for seeding

- Large ships do **not** scale purely with state area/population; outliers (small maritime powers with capital ships) are normal.
- Ownership collapses to game `"state" | "market"` (navy vs merchant).
- See `docs/plan/shipbuilding-initial-fleet.md`.
