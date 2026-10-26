# E0 一次食料の観測境界と食料台帳対象人口（2026-10-23）

[E0診断](economy-e0-diagnostics-20261023.md)に続き、市場搬入とは異なるセル内食料の実収穫・加工カウンターを観測へ接続し、食料台帳対象外人口の所属と発生時点を監査した。供給・係数・需要・口座・市場の初期化は変更していない。

## 観測の接続と単位

`foodObservation.ts`は与えられた世界・市場・人口列・備蓄列・累計食料カウンターから読取専用の値を返す。既存の観測ビューに`food()`を追加し、`auditWoolSupply.mts`のschemaVersion 4で各月の終了時と実食料決済直後に採取する。開始/終了の累計差と、決済時の対象人口を別に集計した。

- `cumulativeCellFoodFlows.harvested`はセル内の計画が実際に生産した生鮮原料。`goodsBalanceLedger`の市場搬入へ加算しない。食べた量・原料加工・保存製品を全部足して生産にしない。
- `processed`は記録された原料投入の累計、`privateReserveOutput`は私有備蓄へ入った保存製品の累計。両者は原料と製品で単位が異なる。Milkは1 lot=1,000 L、Cheeseは1 lot=1,000 kg。
- 収穫カウンターは`markets-generator.ts`のセル内救済計画で記録される。計画が扱わなかった潜在収量は実収穫にしない。冷蔵輸出で追加される生鮮量は別の市場搬入経路なので、全時代共通の完全な収穫計とは扱わない。今回のHigh Medieval入力に冷蔵分を補う架空の量は追加しない。
- `foodProcessingLedger`の消費・加工・搬入・損耗・未充足は累計値。開始/終了差を使い、月次端点を足さない。`localHouseholdConsumptionThisCycle`は同サイクル内の二重消費防止値で、決済後に0へ戻るため年間摂取量へ使わない。家計消費には私有備蓄の取崩しが入る場合もあり、常にその月の生鮮収穫から引けるわけではない。
- 不在のカウンター/台帳/備蓄列は`null`、存在する列の実際の0は0として区別する。累計が減った場合や値がない場合、派生差分は`null`とし、負の生産や補正値にしない。
- と畜の`slaughter.ts`は生体頭数からTallow・Leather等を作るが、家畜由来の肉kgを定義していない。`livestockMeatKilograms=null`を保存する。Game（狩猟）と家畜由来肉、頭数とkgを同一視しない。E0で新しいと畜歩留りを追加していない。

**追加で判明した欠測**: `recordFoodProcessingConsumption`は`foodProcessingLedger`の追跡対象品だけを受け付ける。Fish・Game・Shellfishは対象外で、セル内保存へ原料を使っても同関数から累計の加工カウンターに届かない。これらの`processed=0`は「加工なし」の証明にならない。Preserved foodの私有備蓄製品があることと両立する。今回、観測した0を最終消費0や加工0の採用値へ読み替えず、観測経路の欠測として残した。

## 同じ12か月の結果

[比較JSON](raw/economy-e0-food-boundaries-comparison-20261023.json)、[Province](raw/economy-e0-food-boundaries-province-101-20261023.json)、[World](raw/economy-e0-food-boundaries-world-102-20261023.json)。従来の固定.fmgから1300-01-01〜1301-01-01、Standard、populationRate1000、urbanization1、遠距離交易ON、隊商襲撃OFF。初回過渡を含み、準備期間なし。

両世界の全12区間で、前回のschemaVersion 3とwealth・家畜頭数・食料備蓄・Wool在庫・全商品フロー・衣服/毛布の納品が一致した。シミュレーション実装と実行スクリプトのハッシュも照合した。累計差・人口範囲を追加した集計スクリプトには、終了後の拡張を含む別の`summarizerSha256`を記録している。

| 12か月の実カウンター差 | Province | World | 境界 |
| --- | ---: | ---: | --- |
| Milk実収穫 L | 22,823.854 | 681,790.062 | 市場搬入前のセル内生産 |
| Milkの記録された加工投入 L | 21,682.661 | 646,221.647 | 同じMilkを再生産として数えない |
| Milk家計消費の台帳差 L | 1,141.193 | 35,568.416 | 期首備蓄の取崩しを含み得る |
| Milk市場搬入 lot | 0 | 0 | 搬入0でも乳生産0ではない |
| Cheese私有備蓄への産出 kg | 1,038.597 | 49,030.174 | 家計への納品・実摂取とは別 |
| Cheese市場搬入 kg | 1,129.669 | 15,771.991 | 私有備蓄と別の産出先 |
| 家畜由来肉 kg | 未計測 | 未計測 | 歩留りが未定義 |

これにより、前回「乳が市場フローにない」とした点を、生産不在と取り違えずに解消した。食料の全栄養充足、歴史的な適正生産、乳の需要目標達成を意味しない。

## 対象人口の所属と時点

台帳が存在する人口を`covered`、市場未割当を`noMarketAssignment`、市場IDに対応する市場がない場合を`missingMarket`、市場はあるが食料台帳がない場合を`missingFoodLedger`へ分ける。都市はburg側の市場所属、農村はセル側の市場所属を使い、populationRate・urbanizationを各々一度適用する。coveredは台帳の対象という意味で、実際に十分食べたという意味ではない。

Provinceは開始時、全12回の決済、期末のすべてで対象外0人。Worldも**全12回の実決済時点では都市・農村とも対象外0人**だった。最後の決済は1300-12-27。1301-01-01の終了スナップショットで初めて次の状態を観測した。

| World期末 | 人数・件数 |
| --- | ---: |
| 農村の対象外人口 | 134,951.750人、146セル |
| 都市の対象外人口 | 3,161.612人、3都市 |
| 市場所属 | 全て市場17 |
| 判定理由 | 全てmissingFoodLedger |
| 市場未割当/市場参照切れ | ともに0人 |

新市場17への農村人口の移動元（1300-12-01の所属との比較）は、市場3から37,781.346人、市場7から47,208.000人、市場11から22,473.873人、市場15から27,488.531人。期末の国家別内訳は国家12が108,499.978人、国家23が11,461.203人、国家27が14,990.570人。都市はburg408・409・412。セル1150は市場3から17へ移り、期末に国家12・省130、人口637.030人、自家備蓄0.11食料単位を持つ。

従って、前回の期末約13.5万人を「年間を通じて必要量から脱落した人口」へ外挿してはならない。一方、翌月の決済でこの新市場が処理されるかは別の問題である。

`Markets.addMarket`の新市場には食料台帳がなく、昇格イベントの処理は市場領域を拡張するが、その場で食料台帳を作らない。`settleMonthlyFoodConsumption`は台帳なしの市場をスキップし、時間進行の食料処理は消費→`generateMonthlyLedger`の順。新市場の初回決済が台帳生成より先になる経路をコード上で確認した。下記の継続観測で実際の順序を確認する。

## 年境界後の初回決済の再現

[継続観測JSON](raw/economy-e0-food-transition-world-102-20261023.json)を保存した。追加の1か月は新市場の初回決済だけを確認するためで、基準の12か月へ混ぜない。`auditFoodLedgerTransition.mts`が同じ入力を月ごとに12回進め、1301-01-01の食料観測が基準JSONと完全一致することを確認してから、そのまま1か月進めた。途中の保存再読込やbootstrapを行っていない。

| 時点 | 新市場17の食料台帳 | 対象外の農村/都市人口 |
| --- | --- | ---: |
| 1301-01-01、基準期間終了 | なし | 134,951.750 / 3,161.612人 |
| 1301-01-26、food:consumption終了 | なし | 134,964.137 / 3,155.053人 |
| 同日、直後のfood:production終了 | 空の台帳が生成 | 0 / 0人 |
| 1301-02-01、追加期間終了 | 存在するがmonthlyConsumptionなし | 0 / 0人 |

消費処理が台帳なしの市場をスキップし、その後で台帳が生成されることを実際に確認した。この1回は実食料決済に必要量・引出し・支払・不足が記録されない。後で対象外0へ戻ったことは、スキップされた消費が遡って処理されたことを意味しない。

新台帳のfoodProducedと在庫は0、importNeedは678.34食料単位だった。初回の消費記録を作るために無料在庫や追加資金を投入していない。後続のE1では、新市場の空台帳の作成を初回消費より先へ移すことと、市場領域の移動時の既存の備蓄・口座の扱いを分けて検討する。欠測量を単純な全人口×200 kgへ換算して不足と断定しない（農村の食性・自家備蓄・購入余力が別にある）。

## 後続の欠測補完

[生鮮加工記録の補完と完了条件の照合](economy-e0-fresh-processing-20261023.md)で、Fish/Game/Shellfish等の加工投入を小売台帳の対象範囲とは独立に記録するよう修正した。新観測はschemaVersion 5で、既存の供給・消費・支払は同値。本記録のschemaVersion 4の欠測値は書き換えていない。

## 検証と引継ぎ（本監査時点。後続進捗は上記補完を参照）

- `foodObservation.test.ts` 2件、`foodLedgerConsumption.test.ts`・`cellFoodRescue.test.ts`・`foodProcessingLedger.test.ts`の関連40件、計42件成功。観測対象の読取専用性、人口尺度、対象外理由の区別、nullと0の分離を確認。型チェック成功。
- 固定2入力の12か月観測で、従来の経済結果の不変性と実装ハッシュを確認。全件/E2Eテストは実行していない。
- 一次食料の量と市場搬入の観測境界、期末人口範囲の原因を特定した。E0全体は未完了。次はFish・Game・Shellfishの加工記録の欠測を観測として補完し、技能/設備・所得層等の未観測範囲を含む完了判定を整理する。新市場の台帳初期化はE1の修正対象で、既存人口・現金・在庫を増やすbootstrapで埋めない。

再実行:

```sh
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/raw/economy-e0-food-boundaries-province-101-20261023.json
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/raw/economy-e0-food-boundaries-world-102-20261023.json
node --import tsx scripts/summarizeEconomyBaseline.mts docs/analytics/raw/economy-e0-food-boundaries-comparison-20261023.json docs/analytics/raw/economy-e0-food-boundaries-province-101-20261023.json docs/analytics/raw/economy-e0-food-boundaries-world-102-20261023.json
node --import tsx scripts/auditFoodLedgerTransition.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/raw/economy-e0-food-boundaries-world-102-20261023.json docs/analytics/raw/economy-e0-food-transition-world-102-20261023.json
```
