"""Money sink and economy size from npm run sim --money-flows (docs/analytics/money-sink-20261116.md).
   python3 sink.py flows-2103.ndjson heads_millions"""
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
heads = float(sys.argv[2]) * 1e6
print("months", len(rows))
for i in range(0, len(rows), 12):
    t = rows[i]["totals"]; print(rows[i]["date"], {k: round(v / 1e3) for k, v in t.items() if abs(v) > 500}, "sum", round(sum(t.values()) / 1e3))
for y in range(len(rows) // 12):
    yr = rows[y * 12:(y + 1) * 12]
    net, gross, hh = {}, {}, 0.0
    for r in yr:
        for f in r["flows"]:
            s = f["step"]; net[s] = net.get(s, 0) + f["net"]
            moved = sum(abs(v) for k, v in f.items() if k not in ("step", "net")) / 2
            gross[s] = gross.get(s, 0) + moved
            hh += max(0, f.get("urbanHouseholds", 0)) + max(0, f.get("ruralHouseholds", 0))
    tot = sum(net.values()); g = sum(gross.values())
    print(f"\nyear {y+1}: net {tot/1e3:.1f}k, gross moved {g/1e3:.0f}k = {g/heads:.3f} SP/head, household inflows {hh/heads:.3f} SP/head")
    for k, v in sorted(net.items(), key=lambda x: x[1])[:8]:
        if abs(v) > 200: print("   sink %-45s %9.0f" % (k, v))
    for k, v in sorted(net.items(), key=lambda x: -x[1])[:4]:
        if v > 200: print("   source %-43s %9.0f" % (k, v))
    if y == 0:
        print("   largest gross steps:")
        for k, v in sorted(gross.items(), key=lambda x: -x[1])[:12]: print("     %-45s %9.0f" % (k, v))
