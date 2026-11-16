#!/bin/sh
# Money sink (docs/analytics/money-sink-20261116.md): npm run sim on 2103, 60 months, money flows of every step each month.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/money-sink-20261116
env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npm run sim -- $M/world-2103.fmg --months 60 --sample-every-months 12 --samples $R/samples-2103.ndjson \
  --sample-detail wealth --money-flows $R/flows-2103.ndjson > $R/sim-2103.log 2>&1
echo done
