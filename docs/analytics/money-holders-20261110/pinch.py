# Run in docs/analytics/raw/money-holders-20261110 (docs/analytics/money-holders-20261110.md).
import json
for m in ['2102','2103']:
  S=json.load(open('holders-%s.json'%m))['snapshots']; H=lambda i,k:S[i]['holders'][k]
  print('==',m)
  tot=lambda i: sum(sum(v.values()) for k,v in S[i]['holders'].items() if k not in('marketFarmgateOwed','townCraftCreditOwed'))+S[i]['aggregate']['personalAccounts']
  print(' total money', [round(tot(i)/1000) for i in range(0,25,3)])
  print(' rural share %', [round(100*sum(H(i,'ruralHouseholds').values())/tot(i)) for i in range(0,25,3)])
  # markets: cash < owed, cash< 10% start
  ids=list(H(0,'marketCash'))
  for i in range(12,25):
    c=H(i,'marketCash'); o=H(i,'marketFarmgateOwed'); s0=H(0,'marketCash')
    low=sum(1 for k in ids if c[k]<0.1*max(1,s0[k])); owe=sum(1 for k in ids if o[k]>c[k])
    print('  m%2d cal%2d markets cash<10%%start %2d/%d  owed>cash %2d  cash %6.0fk owed %6.0fk rural %6.0fk town %5.0fk merch %4.0fk'%(i,S[i]['calendarMonth'],low,len(ids),owe,sum(c.values())/1e3,sum(o.values())/1e3,sum(H(i,'ruralHouseholds').values())/1e3,sum(H(i,'townTreasury').values())/1e3+sum(H(i,'townHouseholds').values())/1e3,sum(H(i,'merchantCapital').values())/1e3))
  # town treasuries + households low relative to start
  for k in ['townTreasury','townHouseholds']:
    s0=H(0,k); row=[]
    for i in range(0,25,3):
      v=H(i,k); row.append(round(100*sum(1 for t in v if v[t]<0.25*max(1e-9,s0.get(t,0)))/len(v)))
    print(' %s <25%% of start'%k,row)
  g=H(0,'guilds'); act=[k for k in H(24,'guilds') if any(H(i,'guilds').get(k,0)>1 for i in range(25))]
  print(' guilds ever >1:',len(act),'of',len(H(24,'guilds')),' zero at m24 among them', sum(1 for k in act if H(24,'guilds')[k]<=1))
  st=H(0,'stateTreasury'); e=H(24,'stateTreasury'); print(' states down >50%:',sum(1 for k in st if e[k]<0.5*st[k]),'/',len(st))
