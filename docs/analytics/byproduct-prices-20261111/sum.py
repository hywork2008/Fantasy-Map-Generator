"""By-product prices by market (docs/analytics/byproduct-prices-20261111.md).
   Run in docs/analytics/raw/byproduct-prices-20261111: python3 ../../byproduct-prices-20261111/sum.py"""
import json
S = json.load(open("markets-2102.json"))["snapshots"]
for g in S[0]["rows"]:
    print("==", g)
    for s in (S[0], S[5], S[11]):
        rows = s["rows"][g]; tot = sum(r[1] for r in rows)
        w = sum(r[1] * r[2] for r in rows) / tot if tot else 0
        held = [r for r in rows if r[1] > 1]
        mean = sum(r[2] for r in rows) / len(rows) if rows else 0
        ceil = sum(1 for r in rows if r[2] >= 2.99)
        print(f"  m{s['month']:2d} markets {len(rows)} with stock {len(held)} stock {tot:12,.0f} mean {mean:.2f} weighted {w:.2f} at ceiling {ceil}")
