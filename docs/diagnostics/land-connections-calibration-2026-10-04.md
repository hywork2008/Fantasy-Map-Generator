# 段階5の接続・新設負担・探索予算の比較

対象は、型付きの校正係数、近隣都市対の選定、少数共有施設群の評価、session採用、説明UIである。通常の全world河岸グラフ移行と全seed受入は対象外。

再実行:

```sh
npm run calibrate:land-connections -- \
  --archive 'temp/000.savdata/Buyteland 2026-10-04-06-38.fmg' \
  --archive 'temp/000.savdata/Ky Cuong 2026-10-03-14-57.fmg' \
  --archive 'temp/000.savdata/Bois 2026-10-03-18-35.fmg' \
  --output docs/diagnostics/land-connections-calibration-2026-10-04.json
```

[機械可読の設定・比較結果](land-connections-calibration-2026-10-04.json)に係数、入力seed、選定都市対、費用上限、探索実測、採用結果を記録した。保存地図は読取のみとし、復号した独立worldへ既存のsimulation cell互換adapterを適用して食料・地形capacityを参照する。人口を接続需要へ転用しない。

## 実worldの有限候補選択

| 保存地図 | seed | 都市数 | 近隣比較数 | 近隣候補数 | 評価対象の都市対数 |
| --- | --- | ---: | ---: | ---: | ---: |
| Buyteland | 639235608 | 593 | 9,350 | 1,019 | 32 |
| Ky Cuong | 382171639 | 324 | 5,064 | 552 | 32 |
| Bois | 569431067 | 683 | 13,708 | 1,230 | 32 |

距離150kmのbucketと各都市3近隣を使い、有限の重要度/距離で優先順位を決める。全都市対の列挙は行わない。選択数の打切りは`truncated`に残し、都市数/比較数の予算枯渇は未解決として返す。今回の選択処理は各profile約1.5〜5.4msだったが、単発のhost計測でありブラウザー全生成の停止時間を表す値ではない。

## 長大橋の新設負担

4m幅の物理橋床の費用probe。全体の最大新設上限はlenient/balancedが90,000、conservativeが45,000。実際の都市対上限は弱い側の基礎規模からさらに制限され、進入工事も追加される。この表は形状や架橋能力の証明ではない。

| 物理橋床長 | lenient | balanced | conservative |
| --- | ---: | ---: | ---: |
| 10m | 38 | 140 | 280 |
| 30m | 142 | 620 | 1,240 |
| 100m | 1,010 | 4,820 | 9,640 |
| 300m | 7,810 | 38,420 | 76,840（上限超過） |
| 1,000m | 82,010 | 408,020（上限超過） | 816,040（上限超過） |

balancedは短橋を一律排除せず1,000m級を費用上限で止める比較用の基準とした。conservativeは300m級も止める。lenientでは1,000m級を費用だけで止められない。この比較はゲーム係数の感度を見るものであり、全world校正済みの既定profileは選んでいない。水域・能力・直交条件による候補検証は全profile共通であり、係数によって緩めない。

## 共有橋と探索予算

正本曲線・物理水域・全幅支持を持つ固定fixtureで、三profileとも複数都市対の共有橋一式を評価し、session prepare/commitまで通過した。橋本体は一施設分、各接続の外側工事は一接続分として計上した。別の回帰fixtureでは、単独では工事上限を超える二河川・二橋の全経路を一つの共有施設束として評価し、二橋を一度ずつ計上した。

固定fixtureの初期探索peakはnetwork labels/expansionsが2/2、approachが1,943/1,563。2倍の余裕と明示下限でnetworkを16/16、approachを3,886/3,126に調整した。初期10,000/10,000の進入探索予算から削減しても、三profileの共有採用は成立した。3都市対・最大4共有群・往復比較とprepare/commitを含む上限を87比較に設定した。これは固定fixtureの予算であり、全seedの普遍的上限ではない。

比較予算、label/expansion上限、group列挙上限の枯渇は未解決とし、到達不能や工事費による不採用へ変換しない。優先採用にも別のselection/current-evaluation/related-retry上限を指定し、予算停止までに登録済みの一式を破壊しない。

## 全world採用を証明していない入力

橋用の既定geometry契約は幅0のsourceを引き続き拒否する。Buytelandの復元結果は7河川成立・202未解決、Ky Cuongは17成立・164未解決、Boisは11成立・273未解決だった。主因は`invalid-width`で、sampling-budget、folded-banks、invalid-curve、unstable-axisも含む。

これらの未解決河川を障害物集合から省いて橋を採用する処理は追加していない。保存地図3件で検証したのは実際の食料・気候による近隣都市対選択と新設負担の感度、現在の河川契約の診断であり、完全な湖海/河川・支持/通過条件による全world自動採用の実績ではない。段階2〜3の通常生成接続と段階6の全seed受入を区別する。
