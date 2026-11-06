"""Town household cash by source against the price of ale (household-income-20261106.md).

    python3 -I docs/analytics/household-income-20261106/summarize.py <income-*.json> [first=13] [last=24]
Per urban person a year over the months first..last: credits and debits by calling function, the
ale demand at the market price and at the catalogue value (2.4 a tun), and the staple bill.
"""
import json
import sys

path = sys.argv[1]
first = int(sys.argv[2]) if len(sys.argv) > 2 else 13
last = int(sys.argv[3]) if len(sys.argv) > 3 else 24
data = json.load(open(path))
snaps = [s for s in data["snapshots"] if first <= s["month"] <= last]
months = len(snaps)
people = sum(sum(m["urbanPeople"] for m in s["markets"]) for s in snaps) / months
per = lambda total: total / months * 12 / people
credit, debit = {}, {}
ale_market = ale_value = ale_people = 0.0
prev = {m["i"]: m["beerDrunkTotal"] for m in data["snapshots"][first - 2]["markets"]} if first > 1 else {}
drunk = drunk_cost = 0.0
for s in snaps:
    for m in s["markets"]:
        for key, (c, d) in m["sources"].items():
            credit[key] = credit.get(key, 0) + c
            debit[key] = debit.get(key, 0) + d
        ale_market += m["aleDemand"] * m["beerPrice"]
        ale_value += m["aleDemand"] * 2.4
        d_units = m["beerDrunkTotal"] - prev.get(m["i"], 0)
        prev[m["i"]] = m["beerDrunkTotal"]
        drunk += d_units
        drunk_cost += d_units * m["beerPrice"]
print(f"{path}: months {first}-{last}, urban people {people:,.0f}")
print(f"income {per(sum(credit.values())):.3f}  spending {per(sum(debit.values())):.3f}  (a person a year)")
print("credits:")
for key, v in sorted(credit.items(), key=lambda x: -x[1])[:14]:
    if v > 0:
        print(f"  {per(v):.3f}  {key}")
print("debits:")
for key, v in sorted(debit.items(), key=lambda x: -x[1])[:10]:
    if v > 0:
        print(f"  {per(v):.3f}  {key}")
print(f"ale demand at market price {per(ale_market):.3f}, at value 2.4 {per(ale_value):.3f}; drunk at market price {per(drunk_cost):.3f}")
