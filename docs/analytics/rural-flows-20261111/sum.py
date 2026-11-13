"""Rural household cash flows by caller (docs/analytics/rural-flows-20261111.md).
   python3 sum.py flows-2102.json [first_month last_month]"""
import json, sys
from collections import defaultdict
data = json.load(open(sys.argv[1]))
lo, hi = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (13, 24)
snaps = [s for s in data["snapshots"] if lo <= s["month"] <= hi]
total = defaultdict(float)
for s in snaps:
    for key, value in s["flows"].items():
        total[key] += value
    total["residual"] += s["residual"]
start, end = snaps[0]["before"], snaps[-1]["after"]
print(f"months {lo}-{hi}: wallets {start:,.0f} -> {end:,.0f}")
for sign in ("in", "out", "residual"):
    rows = sorted(((k, v) for k, v in total.items() if k.startswith(sign)), key=lambda kv: -abs(kv[1]))
    print(f"-- {sign}: {sum(v for _, v in rows):,.0f}")
    for key, value in rows[:25]:
        print(f"{value:14,.0f}  {key}")
