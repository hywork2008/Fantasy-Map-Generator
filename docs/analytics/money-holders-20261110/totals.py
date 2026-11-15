# Run in docs/analytics/raw/money-holders-20261110 (docs/analytics/money-holders-20261110.md).
import json,sys
for m in ['2102','2103']:
  d=json.load(open('holders-%s.json'%m)); S=d['snapshots']
  print('==',m, 'months',len(S))
  cls=[k for k in S[0]['holders']]
  print('totals (k) by month 0,3,6,9,12,15,18,21,24 (cal month)',[S[i]['calendarMonth'] for i in range(0,25,3)])
  for k in cls+['personalAccounts']:
    if k=='personalAccounts': row=[S[i]['aggregate'][k]/1000 for i in range(0,25,3)]
    else: row=[sum(S[i]['holders'][k].values())/1000 for i in range(0,25,3)]
    print(' %-20s'%k,' '.join('%7.1f'%x for x in row))
  print('share of holders at <=1 (zero) by month 0..24 step 3')
  for k in ['stateTreasury','townTreasury','townHouseholds','guilds','marketCash','merchantCapital','ruralHouseholds']:
    row=[]
    for i in range(0,25,3):
      v=list(S[i]['holders'][k].values()); row.append(100*sum(1 for x in v if x<=1)/max(1,len(v)))
    print(' %-20s'%k,' '.join('%5.0f%%'%x for x in row), 'n=',len(S[24]['holders'][k]))
