# Balance History — Population/Goods/Fauna CSV export

Requested 2026-08-08: a way to see current Population/Goods/Fauna right after map generation, and
again after every Advance Day/Month/Year action, so shortages/surpluses can be eyeballed over time
and tuned. Implemented as a new feature inside the Economy extension (`economy` must be enabled —
Goods and Fauna are Economy-owned data; Population is read from `WorldContext`, which the extension
already has read access to via `ExtensionAPI`).

## What it captures

One `BalanceSnapshot` (`src/extensions/economy/generators/balanceSnapshot.ts`) per row:

- **Population**: total / urban / rural (`economyTotals.ts`'s `getPopulationBreakdown()`, extracted
  from the Goods editor's existing total-population formula) + urbanization rate (new — not tracked
  anywhere else).
- **Goods**: total world-wide stock, plus one column per enabled Good (`economyTotals.ts`'s
  `getAllStockData()`, extracted from the Goods editor's stock aggregation).
- **Fauna**: wild (Game) and domesticated (liveAnimal-tagged) world totals, plus one column per
  species (`faunaPopulation.ts`'s new `getWorldFaunaHeadcountSummary()`), and a count of species
  whose world total has dropped below `FAUNA_AT_RISK_HEADCOUNT_THRESHOLD` (new).
- **Extras asked for explicitly** ("バランス調整で見るべきだが上記の中に含まれていない項目"): total
  State treasury (a plain `WorldContext` data read), and a Grain+Milk/Cheese nutrition kcal/protein
  coverage ratio — wiring the previously-unused `nutritionAudit.ts` (built 2026-08-07, never
  surfaced anywhere) into a live report for the first time.

## Capture points

Two, both in `src/extensions/economy/index.tsx`, orchestrated via
`src/extensions/economy/controllers/balance-history.ts`:

1. `recordInitialBalanceSnapshot()` — clears the previous map's history and records "Initial
   Generation". Called at the end of the `"economy.initialization"` map-ready task (fresh
   generation / regenerate map) and at the end of the `fmg:world-loaded` handler (loading a saved
   map) — both are the points where Goods/Markets/Fauna data is already known to be settled.
2. `recordAdvanceBalanceSnapshot()` — records one "Advance Time" row. Wired to a **new host event**,
   `fmg:time-advance-completed` (`src/generators/timeEngine.ts`), fired exactly once per completed
   top-level advance action (one Advance Day/Month/Year button click, or one
   `window.fmg.actions.advanceTime()` call) — not per calendar day. The existing `fmg:time-advanced`
   fires once per day (or per rAF frame's day-chunk during a UI batch), which would have produced
   dozens–hundreds of rows for a single "Advance Year" click; see that event's doc-comment and
   `docs/simulation/advance-time.md` §3 for the full contract. Not dispatched when the batch throws.

## Storage and UI

`src/extensions/economy/store/balanceHistoryState.ts` — a session-scoped (not persisted to the map
save) Zustand array of snapshots. `src/extensions/economy/ui/dialogs/BalanceHistoryDialog.tsx`
(Tools tab → Edit → "Balance History") shows the headline columns per row; "Download CSV"
(`downloadBalanceHistoryCsv()`) exports the full history with one column per Good/species seen in
*any* row (union across history, 0-filled for rows predating that column) via the existing
`downloadFile()` utility, matching the Goods editor's own `downloadGoodsData()` pattern.

## Verified live

2026-08-08, dev server + Playwright: generated a map with Economy enabled → one "Initial
Generation" row appeared with sane figures (population ~4.38M, Goods stock, Fauna wild/domesticated
totals). Advance Day → exactly one new row. Advance Month → exactly one new row (not ~30). CSV
download produced a 3-row, ~150-column file (fixed columns + one per enabled Good + one per Fauna
species) with a filename correctly prefixed by the map name.

**Pre-existing bug found incidentally, not fixed here**: an Advance Year run threw
`TransactionWriter: topic 'map.annotations' is not in the system's declared writes` from
`frontier-expansion.tick` (`src/generators/frontierExpansion.ts` via `src/generators/timeEngine.ts`)
partway through the year and aborted the batch (no Balance History row recorded for that failed
run, which is the intended behavior — see "Not dispatched when the batch throws" above). Unrelated
to this feature; `frontier-expansion.tick`'s declared `writes` doesn't include `map.annotations`,
which only `dungeon-ecology.tick` declares. Matches the pre-existing (confirmed via
`git stash`-and-rerun) failures in `dungeons-generator.test.ts` / `dungeonEcology.test.ts` on
unmodified `master` — likely the same root cause, not investigated further here.
