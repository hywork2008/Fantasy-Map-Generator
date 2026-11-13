#!/bin/sh
# economystart.mts (raids off) at 0,12,36,60 months: before (HEAD worktree) / after.
job() { mkdir -p $1/docs/analytics/economy-start-20261102; cp /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/economystart-raidsoff.mts $1/docs/analytics/economy-start-20261102/economystart-raidsoff.mts; (cd $1 && FMG_CONFLICT_AUTONOMY=peace NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/economy-start-20261102/economystart-raidsoff.mts /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps/world-$3.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-ale-20261104/$2/obs-$3.json 0,12,36,60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-ale-20261104/$2/obs-$3.log 2>&1; rm -f $1/docs/analytics/economy-start-20261102/economystart-raidsoff.mts); }
job /Users/h-yamaguchi/Projects/fmg-2 after 2101 &
job /Users/h-yamaguchi/Projects/fmg-2 after 2103 &
job /Users/h-yamaguchi/Projects/fmg-2 after 2104 &
job /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/base before 2101 &
wait
job /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/base before 2103 &
job /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/base before 2104 &
wait
