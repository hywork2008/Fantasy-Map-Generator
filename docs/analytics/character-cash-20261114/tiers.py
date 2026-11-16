"""Character wealth by lifestyle tier at months 1, 12, 24, 36 (docs/analytics/character-cash-20261114.md).
   python3 tiers.py <raw dir>"""
import json, sys
R = sys.argv[1]
for m in ("2102", "2103"):
    s = json.load(open(f"{R}/cash-{m}.json"))["snapshots"]
    print(f"== {m}  dead {s[-1]['cash']['dead']} deadWealth {s[-1]['cash']['deadWealth']}")
    tiers = sorted(s[-1]["cash"]["tiers"])
    for t in tiers:
        cells = []
        for i in (0, 11, 23, 35):
            r = s[i]["cash"]["tiers"].get(t)
            cells.append(f"{r['people']}p {r['wealth']/1000:.1f}k/{r['reserve']/1000:.0f}k over {r['overReserve']/1000:.1f}k" if r else "-")
        print(f" {t:18s} " + " | ".join(cells))
    for i in (0, 11, 23, 35):
        T = s[i]["cash"]["tiers"].values()
        print(f"  m{i+1}: wealth {sum(r['wealth'] for r in T)/1000:.1f}k reserve {sum(r['reserve'] for r in T)/1000:.0f}k over {sum(r['overReserve'] for r in T)/1000:.1f}k money.characters {s[i]['money']['characters']/1000:.1f}k")
