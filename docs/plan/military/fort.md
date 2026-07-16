# Fort

## Population Pyramid

`src/ui/components/PopulationPyramid.tsx`

- Adults use stored `maleAdults` / `femaleAdults`.
- Children keep a natural ~49:51 birth sex ratio for display.
- Elders inherit the settlement's adult sex ratio (so forts show a male-heavy older cohort).

## Group-based demographics

Urban **group** (not geographic `type`) drives age/sex shares.

Implemented in:

| File | Role |
| :--- | :--- |
| `src/generators/burgDemographics.ts` | Profiles + `buildBurgDemographics()` |
| `src/generators/burgs-generator.ts` | Applies after `defineGroup` / on `changeGroup` / population edit |
| `src/generators/demography-simulator.ts` | Suppresses natural births for `group === "fort"` |

### Profiles (rough estimates)

| Group | Children | Male adults | Female adults | Elders | Notes |
| :--- | ---: | ---: | ---: | ---: | :--- |
| **fort** | 0 | 0.72 | 0.18 | 0.10 | No minors; adults ~**8:2** M:F |
| monastery | 0.05 | 0.50 | 0.20 | 0.25 | Few novices; male-skewed monastics |
| caravanserai | 0.10 | 0.55 | 0.25 | 0.10 | Transient traders |
| trading_post | 0.20 | 0.40 | 0.30 | 0.10 | Commercial outpost |
| village | 0.42 | 0.22 | 0.23 | 0.13 | Family-heavy rural |
| hamlet | 0.45 | 0.21 | 0.22 | 0.12 | Even more children |
| capital / city | 0.38 | 0.23 | 0.24 | 0.15 | Slightly fewer children than town |
| town (default) | 0.40 | 0.2205 | 0.2295 | 0.15 | Legacy default pyramid |

Default groups are listed in `Burgs.getDefaultGroups()` in `src/generators/burgs-generator.ts`.

## Flow

1. `definePopulation` sets total population + capacity, then applies default demographics.
2. `defineGroup` assigns `burg.group` (e.g. `fort` when citadel + no walls/plaza/port, `max: 1`).
3. `applyDemographics` rebuilds age/sex buckets from the group profile.
4. Burg editor group / population edits re-run `applyDemographics` so the pyramid stays in sync.
