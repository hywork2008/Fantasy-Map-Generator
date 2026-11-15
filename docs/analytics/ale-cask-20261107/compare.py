"""Year summaries of sellprobe.mts runs for the ale and cask repricing (ale-cask-repricing.md §4).

    python3 -I docs/analytics/ale-cask-20261107/compare.py <sell-*.json>...
Per year: ale drunk over ale demand, Beer and Barrels the towns put to market (units a month) and
the mean price they were offered at, the share bought for cash, and at the year's last month the
town treasuries, the town purses and the urban people.
"""
import json
import sys

for path in sys.argv[1:]:
    data = json.load(open(path))
    print(f"\n## {path}")
    print("year | drunk/ale | beer offered/mo | beer price | beer cash share | barrels offered/mo | barrel price | town T | town purse | urban people")
    prev = {}
    years = {}
    for snap in data["snapshots"]:
        year = (snap["month"] - 1) // 12 + 1
        row = years.setdefault(year, {"dem": 0, "drunk": 0, "n": 0, "last": None, "g": {}})
        row["n"] += 1
        for m in snap["markets"]:
            row["dem"] += m["aleDemand"]
            row["drunk"] += m["beerDrunkTotal"] - prev.get(m["i"], 0)
            prev[m["i"]] = m["beerDrunkTotal"]
            for name in ("Beer", "Barrels"):
                g = m["goods"][name]
                acc = row["g"].setdefault(name, [0.0, 0.0, 0.0])
                acc[0] += g["offered"]
                acc[1] += g["sold"]
                acc[2] += g["offeredValue"]
        row["last"] = snap["markets"]
    for year, row in years.items():
        last = row["last"]
        total = lambda key: sum(m[key] for m in last)
        beer, barrels = row["g"]["Beer"], row["g"]["Barrels"]
        print(
            f"{year} | {row['drunk'] / max(1, row['dem']):.2f} | {beer[0] / row['n']:.0f} | {beer[2] / max(1e-9, beer[0]):.2f} | "
            f"{beer[1] / max(1e-9, beer[0]):.2f} | {barrels[0] / row['n']:.0f} | {barrels[2] / max(1e-9, barrels[0]):.3f} | "
            f"{total('burgTreasury'):.0f} | {total('urbanHouseholdWealth'):.0f} | {total('urbanPeople')}"
        )
