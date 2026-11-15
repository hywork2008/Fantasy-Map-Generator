"""Year summaries of sellprobe.mts runs (market-goods-settlement.md S2).

    python3 -I docs/analytics/cooper-funds-20261106/compare.py <sell-*.json>...
Per year: ale drunk over ale demand, value of town output offered and bought for cash, and at the
year's last month the market treasuries, town treasuries, town and farm purses, consigned worth,
what the markets owe the towns, and the urban people.
"""
import json
import sys

for path in sys.argv[1:]:
    data = json.load(open(path))
    print(f"\n## {path}")
    print("year | drunk/ale | bought/offered | market T | town T | town purse | farm purse | consigned | owed | urban people")
    prev = {}
    years = {}
    for snap in data["snapshots"]:
        year = (snap["month"] - 1) // 12 + 1
        row = years.setdefault(year, {"dem": 0, "drunk": 0, "off": 0, "bought": 0, "last": None})
        for m in snap["markets"]:
            row["dem"] += m["aleDemand"]
            row["drunk"] += m["beerDrunkTotal"] - prev.get(m["i"], 0)
            prev[m["i"]] = m["beerDrunkTotal"]
            row["off"] += m["allOfferedValue"]
            row["bought"] += m["allBoughtValue"]
        row["last"] = snap["markets"]
    for year, row in years.items():
        last = row["last"]
        total = lambda key: sum(m[key] for m in last)
        print(
            f"{year} | {row['drunk'] / max(1, row['dem']):.2f} | {row['bought'] / max(1, row['off']):.2f} | "
            f"{total('treasury'):.0f} | {total('burgTreasury'):.0f} | {total('urbanHouseholdWealth'):.0f} | "
            f"{total('ruralHouseholdWealth'):.0f} | {total('consignedWorth'):.0f} | {total('payable'):.0f} | {total('urbanPeople')}"
        )
