"""Sum the money flows of town-money-drain-20261114: totals by holder, net by step, and the urban households' flows by step."""
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
print("months", len(rows))
for i in (0, 12, 24, len(rows) - 1):
    t = rows[i]["totals"]; print(rows[i]["date"], {k: round(v / 1e3) for k, v in t.items()}, "sum", round(sum(t.values()) / 1e3))
lo = int(sys.argv[2]) if len(sys.argv) > 2 else 12
net, urban = {}, {}
for r in rows[lo:]:
    for f in r["flows"]:
        net[f["step"]] = net.get(f["step"], 0) + f["net"]
        urban[f["step"]] = urban.get(f["step"], 0) + f.get("urbanHouseholds", 0)
yrs = (len(rows) - lo) / 12
print("net by step (per year, from month %d)" % (lo + 1))
for k, v in sorted(net.items(), key=lambda x: x[1])[:12]: print("  %-45s %10.0f" % (k, v / yrs))
print("  total %.0f / year" % (sum(net.values()) / yrs))
print("urban households by step (per year)")
for k, v in sorted(urban.items(), key=lambda x: -abs(x[1]))[:16]: print("  %-45s %10.0f" % (k, v / yrs))
print("  total %.0f / year" % (sum(urban.values()) / yrs))
