# Character wealth / stipend balance

Target ladder for **personal** `Character.wealth` pay per production cycle (~30 days; ~12 cycles/year). Institutional pools (state/burg/guild/market treasuries) fund pay but **must not multiply** personal income without a hard cap.

Reference: common soldier wage `BASE_UPKEEP_PER_HEAD = 0.12` SP/cycle (`militaryLogistics.ts`) — not stored as Character.wealth.

## Ladder (SP / cycle)

| Role | Pay | Funding source | Shape |
| :--- | ---: | :--- | :--- |
| Guild apprentice | 0.03 / 0.05 / 0.08 | Guild treasury | Fixed age band × bond quality; only if both-way solidarity ≥ 20 |
| Market rival | 0.30 | Market treasury | Fixed |
| Guild master | 0.35 | Guild treasury | Fixed |
| Market manager | 0.70 | Market treasury | Fixed |
| Field commander | 0.50–1.50 | State treasury (via upkeep share) | `clamp(upkeep × 15%, 0.5, 1.5)` |
| Province lord | 1.00 | Seated burg treasury | Fixed |
| Central office | 0.80–3.00 | State treasury | `clamp(deptBudget × 12%, 0.8, 3.0)` |
| Ruler household | 1.00–5.00 | State treasury | `clamp(income × formRate, 1.0, 5.0)` |

Pools only act as **ceilings** (cannot pay more than available). Surplus department/household budget intent stays in `state.treasury` rather than flooding personal purses.

## Generation seed

`seedMissingCharacterWealth()` multiplies the **same per-cycle formula** by 4–10 random cycles (apprentices: 2–6 of pocket money only if already bonded). Shorter than the old 6–18 window to avoid multi-year piles at map start.

## Diagnosis

```bash
npm run diagnose:wealth -- path/to/characters.json
npm run diagnose:wealth -- --browser
```

See [character-wealth-diagnosis.md](./character-wealth-diagnosis.md).

## Code

| Concern | File |
| :--- | :--- |
| Ruler, offices, field commanders | `src/extensions/economy/generators/treasuryAllocation.ts` |
| Province / guild / market + seed | `src/extensions/economy/generators/characterStipends.ts` |
| Soldier upkeep reference | `src/extensions/economy/generators/militaryLogistics.ts` |

## Historical intent (soft)

```text
apprentice cash ≪ craftsman/merchant day-scale ≪ master ≪ field commander
  ≪ province lord / market head ≪ central office ≪ ruler
```

Held wealth after a few years of accumulation without personal spending sinks will still be several× annual pay; living-cost drains are a separate future task.
