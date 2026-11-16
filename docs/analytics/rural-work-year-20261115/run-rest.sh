#!/bin/sh
# Rural work year (docs/analytics/rural-work-year-20261115.md): 36 months of 2102 and 2103 with the default
# settings (ruralWorkYear offField, ruralRestDays byPeriod), recorded by workyear.mts. The comparison (legacy) is aftermath-<map>.json
# of hay-catchup-20261115.
#   sh run-36.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-work-year-20261115/restdays
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for map in 2103 2102; do
  (cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-$map.fmg $R/offfield-$map.json 36 > $R/offfield-$map.log 2>&1) &
done
wait
echo done
