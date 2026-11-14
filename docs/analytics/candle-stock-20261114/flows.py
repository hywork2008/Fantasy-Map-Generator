"""Yearly candle stock and flows of the 72-month runs of wax-long-20261114 (docs/analytics/candle-stock-20261114.md).
   python3 flows.py <docs/analytics/raw/wax-long-20261114>"""
import json, sys
R = sys.argv[1]
for m in ("2102", "2103"):
    s = json.load(open(f"{R}/long-{m}.json"))["snapshots"]
    keys = sorted({k for x in s for k in x["flows"] if k.startswith("Candles|")})
    print("==", m)
    for y in range(len(s) // 12):
        part = s[y * 12:(y + 1) * 12]
        flows = {k.split("|", 1)[1]: round(sum(x["flows"].get(k, 0) for x in part)) for k in keys}
        print(f" y{y + 1} stock {part[-1]['stock'].get('Candles')}", {k: v for k, v in flows.items() if v > 20})
