"""Compare waxSurplus keep and tithe (docs/analytics/wax-tithe-20261114.md).
   python3 compare.py <raw dir>"""
import json, sys
R = sys.argv[1]
def load(mode, m):
    p = f"{R}/../wax-pricing-20261114/stockAndDemand-{m}.json" if mode == "keep" else f"{R}/tithe-{m}.json"
    return json.load(open(p))["snapshots"]
def yr(snaps, key, year):
    return sum(s["flows"].get(key, 0) for s in snaps[(year - 1) * 12: year * 12])
for m in ("2102", "2103"):
    print(f"== {m}")
    for mode in ("keep", "tithe"):
        s = load(mode, m); last = s[-1]
        w = last["stock"].get("Beeswax", [0, 0, 0]); c = last["stock"].get("Candles", [0, 0, 0])
        keys = sorted({k for x in s for k in x["flows"] if k.startswith("Beeswax|") or k.startswith("Candles|source")})
        print(f" {mode}: wax stock {w[0]} mean {w[1]} weighted {w[2]} | candles {c[0]} mean {c[1]} | wax m12 {s[11]['stock'].get('Beeswax')} m24 {s[23]['stock'].get('Beeswax')}")
        for k in keys: print(f"   {k}: y1 {yr(s,k,1):.0f} y2 {yr(s,k,2):.0f} y3 {yr(s,k,3):.0f}")
        print("   money", last["money"])
        rows = last["waxMarkets"]; tot = sum(r[1] for r in rows) or 1
        rows.sort(key=lambda r: -r[1])
        port = sum(r[1] for r in rows if r[3]) / tot
        top = rows[:10]
        print(f"   markets {len(rows)}, stock in ports {port:.0%}, top10 share {sum(r[1] for r in top)/tot:.0%}")
        print("   top10 [market, stock, price, port, candles]:", top)
        hi = [r for r in rows if r[2] >= 2.9]; lo = [r for r in rows if r[2] <= 0.3]
        print(f"   at ceiling {len(hi)} (stock {sum(r[1] for r in hi):.0f}), at floor {len(lo)} (stock {sum(r[1] for r in lo):.0f})")
