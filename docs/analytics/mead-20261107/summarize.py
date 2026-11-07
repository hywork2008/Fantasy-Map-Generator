"""Summarize meadflow.mts outputs (docs/analytics/mead-20261107.md).

  python3 docs/analytics/mead-20261107/summarize.py <flow.json>...
"""
import json
import sys

for path in sys.argv[1:]:
    data = json.load(open(path))
    snaps = data["snapshots"]
    print(f"== {path.split('/')[-1]} values {data['values']}")
    for name in ("Honey", "Mead"):
        print(f"-- {name}")
        keys = sorted({k for s in snaps for k in s["goods"][name]["flows"]})
        print("month " + " ".join(f"{k[:22]:>22}" for k in keys) + "    stock  price  mkts  house  unmet")
        for s in snaps:
            g = s["goods"][name]
            print(f"{s['month']:>5} " + " ".join(f"{g['flows'].get(k, 0):>22.1f}" for k in keys)
                  + f" {g['stock']:>8.0f} {g['price']:>6.2f} {g['marketsWithStock']:>3}/{s['markets']}"
                  + f" {g['householdThisMonth']:>6.1f} {g['unmetThisMonth']:>6.1f}")
