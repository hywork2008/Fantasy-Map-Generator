#!/bin/sh
# Dairy supply and use (docs/analytics/dairy-supply-use-20261116.md): 36 months of 2103 with the new default
# (cellCheeseSale demandGap, ruralDairyUse eat) and the old rules, recorded by household-basket-20261116/basket.mts.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/dairy-supply-use-20261116
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
FMG_SETTINGS='{}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/new-2103.json 36 > $R/new-2103.log 2>&1 &
FMG_SETTINGS='{"cellCheeseSale":"fixedShare","ruralDairyUse":"reserveOnly"}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/old-2103.json 36 > $R/old-2103.log 2>&1 &
wait
echo done
# Second pass (§7): new rules with Milk cheese-making labour from cheeseMakingDaysPerMilkLot (default 10).
#   FMG_SETTINGS='{}' ... basket.mts world-2103.fmg $R/labour-2103.json 36
