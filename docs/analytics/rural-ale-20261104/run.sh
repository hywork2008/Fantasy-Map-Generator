#!/bin/sh
# before = HEAD d0b50b57b (worktree), after = working tree with rural ale removed. Raids off, peace, 60 months.
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps
job() { (cd $1 && FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $M/world-$3.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-ale-20261104/$2/beer-$3.json 60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-ale-20261104/$2/beer-$3.log 2>&1); }
job /Users/h-yamaguchi/Projects/fmg-2 after 2101 &
job /Users/h-yamaguchi/Projects/fmg-2 after 2103 &
job /Users/h-yamaguchi/Projects/fmg-2 after 2104 &
job /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/base before 2101 &
wait
job /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/base before 2103 &
job /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/base before 2104 &
wait
