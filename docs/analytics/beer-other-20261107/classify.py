"""Beer shortfall (ale demand - Beer made) per market-month by the guard that held the brewers back,
from beerprobe.mts output (docs/analytics/beer-other-20261107.md).

    python3 -I docs/analytics/beer-other-20261107/classify.py <beer-*.json>... [--months]

grain    - exportable staple under half a month of ale demand (food ledger) or brewable grain rows the same;
casks    - Barrels stock under 5% of the month's cask need;
profit   - most Beer planning rows failed on profitability;
recipe   - most failed on materials / recipeUnavailable / labor (no brewer can take it up);
headroom - brewers chose Beer but stopped at the output target or lost the ranking;
made     - no shortfall.
"""
import json
import sys
from collections import defaultdict

BARRELS_PER_TUN = 0.4
args = [a for a in sys.argv[1:] if not a.startswith("--")]
per_month = "--months" in sys.argv


def guard(m):
    dem = m["aleDemand"]
    brewable = sum((g or {}).get("stock", 0) for g in m["grains"].values())
    exportable = (m.get("food") or {}).get("exportable", 0)
    if min(brewable, exportable) < 0.5 * dem:
        return "grain"
    if m["barrels"]["stock"] < 0.05 * dem * BARRELS_PER_TUN:
        return "casks"
    d = m["diagnostics"].get("Beer", {})
    counts = defaultdict(int)
    for k, v in d.items():
        if k.endswith("outputLots"):
            continue
        stage, cons = k.split(":", 1)
        if stage != "planning":
            continue
        if "profitability" in cons:
            counts["profit"] += v
        elif cons in ("ranking", "chosen"):
            counts["headroom"] += v
        else:
            counts["recipe"] += v
    return max(counts, key=counts.get) if counts else "recipe"


for path in args:
    data = json.load(open(path))
    print(f"\n## {path}")
    years = defaultdict(lambda: defaultdict(float))
    for snap in data["snapshots"]:
        month = snap["month"]
        row = defaultdict(float)
        for m in snap["markets"]:
            dem = m["aleDemand"]
            made = m["made"].get("Beer", 0)
            row["demand"] += dem
            row["made"] += made
            short = max(0, dem - made)
            if short > 0:
                row[guard(m)] += short
        for k, v in row.items():
            years[(month - 1) // 12 + 1][k] += v
        if per_month:
            d = row["demand"]
            print(f"month {month}: made {row['made'] / d:.2f} " + " ".join(f"{k} {row[k] / d:.2f}" for k in ("grain", "casks", "profit", "recipe", "headroom")))
    for y, row in years.items():
        d = row["demand"]
        print(f"year {y}: made {row['made'] / d:.2f} " + " ".join(f"{k} {row[k] / d:.2f}" for k in ("grain", "casks", "profit", "recipe", "headroom")))
