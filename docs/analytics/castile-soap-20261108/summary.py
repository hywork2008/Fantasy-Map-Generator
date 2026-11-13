# Castile Soap (docs/analytics/castile-soap-20261108.md): flows of Soap, Castile Soap, Barilla, Oil, Olives,
# Tallow, Potash and Glass by the markets' temperature band, summed over months 1-12 and 13-24, per run.
#   python3 summary.py > summary.txt  (base new)
import collections, json, sys
R = '/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/castile-soap-20261108'
runs = sys.argv[1:] or ['base', 'new']
GOODS = ('Soap', 'Castile Soap', 'Barilla', 'Oil', 'Olives', 'Tallow', 'Potash', 'Glass')
for seed in ['2102', '2103']:
    data = {run: json.load(open(f'{R}/{run}-{seed}.json')) for run in runs}
    last = data[runs[-1]]
    print(f"== seed {seed}  markets {last['marketsByBand']}  Barilla cells {last['depositCells'].get('Barilla')}")
    for label, lo, hi in [('months 1-12', 1, 12), ('months 13-24', 13, 24)]:
        totals = {}
        for run, d in data.items():
            t = collections.Counter()
            for snap in d['snapshots']:
                if lo <= snap['month'] <= hi:
                    for key, value in snap['flows'].items():
                        if key.split(':')[0] in GOODS or key.endswith('>Soap') or key.endswith('>Castile Soap'):
                            t[key] += value
            totals[run] = t
        print(f" -- {label}: " + ' '.join(f'{r:>9s}' for r in runs))
        for key in sorted(set().union(*totals.values())):
            row = [totals[r][key] for r in runs]
            if max(abs(v) for v in row) >= 0.5:
                print(f"   {key:58s} " + ' '.join(f'{v:9.1f}' for v in row))
    for good in ('Soap', 'Castile Soap', 'Oil', 'Barilla', 'Potash'):
        print(f' -- {good} price (stock value / stock) by band, months 1, 12, 24')
        for i in [0, 11, 23]:
            cells = []
            for band in ['<8', '8-14', '14-18', '>=18']:
                vals = []
                for r in runs:
                    st = data[r]['snapshots'][i]['stocks'].get(f'{good}:{band}')
                    vals.append(f"{st['value'] / st['stock']:.2f}" if st and st['stock'] > 0 else '-')
                cells.append(f"{band} " + '/'.join(vals))
            print(f'   month {i + 1:2d}  ' + '  '.join(cells))
    for good in ('Soap', 'Castile Soap', 'Oil', 'Barilla'):
        print(f' -- {good} stock at month 24: ' + '; '.join(
            f"{r} " + ', '.join(f"{k.split(':')[1]} {v['stock']:.1f}" for k, v in data[r]['snapshots'][-1]['stocks'].items()
                                if k.startswith(good + ':') and v['stock'] > 0) for r in runs))
