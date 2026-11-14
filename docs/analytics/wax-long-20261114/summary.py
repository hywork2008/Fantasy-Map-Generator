"""Yearly beeswax and money of the 72-month runs (docs/analytics/wax-long-20261114.md).
   python3 summary.py <raw dir>"""
import json, sys
R = sys.argv[1]
for m in ("2102", "2103"):
    s = json.load(open(f"{R}/long-{m}.json"))["snapshots"]
    print(f"== {m}")
    for y in range(1, len(s) // 12 + 1):
        part = s[(y - 1) * 12: y * 12]; last = part[-1]
        f = lambda k: sum(x["flows"].get(k, 0) for x in part)
        w = last["stock"].get("Beeswax", [0, 0, 0])
        rows = last["waxMarkets"]
        print(f" y{y}: wax {w[0]:.0f} ({w[1]}/{w[2]}) harvest {f('Beeswax|source|ruralHarvest'):.0f} candles {f('Beeswax|sink|recipeInput>Candles'):.0f}"
              f" export {f('Beeswax|sink|stapleExport'):.0f} tithe {f('Beeswax|sink|waxTithe'):.0f} import {f('Beeswax|source|importArrival'):.0f} max-market {max((r[1] for r in rows), default=0):.0f}")
        print("     money", {k: round(v / 1000, 1) for k, v in last["money"].items()})
