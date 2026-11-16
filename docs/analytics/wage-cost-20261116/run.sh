#!/bin/sh
# Wage multiple 1.5/4/8/14 (docs/plan/per-capita-income-scale.md §4): 36 months of 2103, peace, raids off, gdp.mts.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/wage-cost-20261116
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=2560"
for m in 1.5 4 8 14; do
  FMG_SETTINGS="{\"wageSubsistenceMultiple\":$m}" $E npx tsx docs/analytics/wage-cost-20261116/gdp.mts $M/world-2103.fmg $R/gdp-$m.json 36 > $R/gdp-$m.log 2>&1 &
done
wait
echo done
