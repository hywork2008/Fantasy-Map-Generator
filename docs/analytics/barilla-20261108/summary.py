# Barilla (docs/analytics/barilla-20261108.md): flows of Barilla, Glass, Potash and White sand by the
# markets' temperature band, summed over months 1-12 and 13-24, base against each new run.
#   python3 summary.py base new new2 > summary.txt
import collections, json, sys
R = '/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108'
runs = sys.argv[1:] or ['base', 'new']
for seed in ['2102', '2103']:
    data = {run: json.load(open(f'{R}/{run}-{seed}.json')) for run in runs}
    last = data[runs[-1]]
    print(f"== seed {seed}  markets {last['marketsByBand']}  barillaSeed {last.get('barillaSeed')}  Barilla cells {last['depositCells'].get('Barilla')}")
    for label, lo, hi in [('months 1-12', 1, 12), ('months 13-24', 13, 24)]:
        totals = {}
        for run, d in data.items():
            t = collections.Counter()
            for snap in d['snapshots']:
                if lo <= snap['month'] <= hi:
                    for key, value in snap['flows'].items():
                        t[key] += value
            totals[run] = t
        print(f" -- {label}: " + ' '.join(f'{r:>9s}' for r in runs))
        for key in sorted(set().union(*totals.values())):
            row = [totals[r][key] for r in runs]
            if max(abs(v) for v in row) >= 0.5:
                print(f"   {key:52s} " + ' '.join(f'{v:9.1f}' for v in row))
    print(' -- glass price (stock value / stock) by band, months 1, 12, 24')
    for i in [0, 11, 23]:
        cells = []
        for band in ['<8', '8-14', '14-18', '>=18']:
            vals = []
            for r in runs:
                st = data[r]['snapshots'][i]['stocks'].get(f'Glass:{band}')
                vals.append(f"{st['value'] / st['stock']:.2f}" if st and st['stock'] > 0 else '-')
            cells.append(f"{band} " + '/'.join(vals))
        print(f'   month {i + 1:2d}  ' + '  '.join(cells))
    print(' -- Barilla stock at month 24: ' + ', '.join(
        f"{k.split(':')[1]} {v['stock']:.1f}" for k, v in last['snapshots'][-1]['stocks'].items() if k.startswith('Barilla:') and v['stock'] > 0))
