"""Honey flows before and after the harvest, price and household change (docs/analytics/honey-biome-20261107.md §4).

    python3 -I docs/analytics/honey-biome-20261107/flowsummary.py <raw dir> <seed>...

flow-<seed>.json is the old code, flow-new-<seed>.json the new one; months 1-12, barrels a month.
"""
import json
import sys
from collections import defaultdict

raw, seeds = sys.argv[1], sys.argv[2:]
for seed in seeds:
    for tag in ("flow", "flow-new"):
        d = json.load(open(f"{raw}/{tag}-{seed}.json"))
        snaps = d["snapshots"]
        tot = defaultdict(float)
        for s in snaps:
            for k, v in s["flows"].items():
                tot[k] += v
        n = len(snaps)
        print(f"## {seed} {tag} (value {d['honeyValue']}, {n} months)")
        for k in sorted(tot, key=lambda k: -tot[k]):
            print(f"  {k}: {tot[k]/n:.1f}/mo")
        for s in snaps:
            if s["month"] in (1, 3, 6, 9, 12):
                print(f"  month {s['month']}: stock {s['stock']:.0f}, price {s['price']:.2f}, markets with stock {s['marketsWithStock']}/{s['markets']}")
