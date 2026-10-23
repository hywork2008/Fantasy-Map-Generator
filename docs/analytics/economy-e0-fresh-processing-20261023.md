# E0 生鮮加工の欠測補完と完了条件の照合（2026-10-23）

[前回監査](economy-e0-food-boundaries-20261023.md)で特定したFish・Game・Shellfishの加工記録を補完した。加工する量・生産する量・消費する量・支払・配分順は変えず、実際に投入した原料を既存の累計カウンターへ記録する。E0全体の完了判定は下表の通り**未完了**とする。今回、完了条件を変更していない。

## 修正した境界

`recordFoodProcessingConsumption`は、従来は小売用の`foodProcessingLedger`対象品でないと、セル内保存の原料投入まで記録しなかった。小売対象品には従来どおり加工台帳と累計へ各1回、生鮮食料には小売台帳の有無にかかわらず累計へ1回記録するようにした。対象判定には既存の`isFreshFoodGood`を使い、旧保存の名前による互換判定も維持する。

Fish・Game・Shellfishを新しい小売需要へ加えない。鉄等の非食料や未知の商品を食料加工へ数えない。0・負数・非有限値は記録しない。記録は取得済み原料の通知で、在庫引出し・価格決定・財布の更新は行わない。既存カウンターの参照先はGoods Editor等の観測であり、この値から追加生産を決定しない。

旧保存の欠けた履歴を推定で埋めたり、累計全体を再計算したりしない。今回も同じ固定入力を使い、開始後の12か月の差だけを比較した。schemaVersion 5の`processingCounterPolicy`に記録範囲と非遡及を明記した。過去のschemaVersion 4の加工0は当時の欠測として保持する。

## 同じ12か月での比較

[比較JSON](economy-e0-fresh-processing-comparison-20261023.json)、[Province](economy-e0-fresh-processing-province-101-20261023.json)、[World](economy-e0-fresh-processing-world-102-20261023.json)。1300-01-01〜1301-01-01、Standard、populationRate1000、urbanization1、遠距離交易ON・隊商襲撃OFF。追加の在庫・現金・人口を与えず、準備期間も設けていない。

| 原料加工の12か月差 lot | Province・修正前→後 | World・修正前→後 |
| --- | ---: | ---: |
| Fish | 0 → 0.000000 | 0 → 0.000000 |
| Game | 0 → 129.341970 | 0 → 375.602021 |
| Shellfish | 0 → 8.652506 | 0 → 75.474764 |
| Milk（既存経路の対照） | 21.682661 → 同値 | 646.221647 → 同値 |

単位は各商品の現行lot。原料投入lotとPreserved food等の製品lotを1対1で足したり、総食料kgとしたりしない。加工しなかった原料を消費したことにもしていない。ProvinceのFishの0は補完後にも0であり、記録を増やすために加工を発生させていない。

両世界の全12区間で、修正前のschemaVersion 4とwealth、家畜頭数、自家食料備蓄、Wool在庫、全商品フロー、衣服・毛布の納品、食料対象人口、市場側の食料加工台帳が一致した。変更は従来欠けていた原料加工の累計で、小売・家計・製造の挙動は変わっていない。Milk等の既存の加工記録も増やしていない。両実行の実装ハッシュは一致し、実行時ソースも照合した。

## E0の完了条件との照合

| 完了条件 | 判定 | 根拠と残り |
| --- | --- | --- |
| §4.0の全項目が出典付きの範囲または基準なし | 達成 | 既存の基準表と採否を維持。基準なしをモデル係数の正しさとしない |
| 食料・一次生産・衣服/寝具の現状と基準の判定表 | 達成した範囲を明示 | §7.8〜§7.10の表と今回の加工差。家畜肉kgは未定義のためnull、所得層別は共有財布から分離できない。史実の均衡達成の判定ではない |
| 市場ごとの原料余剰・製品不足・未使用労働・低残高の理由を追跡 | 一部未達 | 実際の材料・予算・採算・技術・分野枠・手順上限は取得済み。一方、計画不採用のunknownと、家内作業の労働/材料/予算制約の主因への接続が残る |

この2世界ではWoolの市場在庫が大量に増え続ける状況は再現していない。再現しない現象に対して用途や需要を足さない。一方、低い製品更新充足と未使用作業枠、家計予算の制約は確認しており、これらが同時に存在する理由の未判定分は残す。

既存の計画診断には、Province 9回（Instruments 5、Wine 4）、World 3,239回の`unknown`が残る。WorldではInstruments 769、Spinning Wheel 440、Wine 412、Arrows 354等で、Wool Blanketsにも69回ある。これは候補評価の回数で、商品数・職場数・労働者数ではない。これらを材料不足や設備不足へ推定で置き換えてE0を閉じない。

所得層別の不足も、都市/農村の共有財布や人物の資産分布から家計内配分を推定しない。技能・設備の検査自体が存在しない箇所は「未モデル化」、量はあるが原因を取得していない箇所は「観測不足」と区別して、E0完了前に一覧化する。

## 検証と次の作業

関連62テスト成功（`foodProcessingLedger.test.ts`・`cellFoodRescue.test.ts`・`foodObservation.test.ts`・`production-generator.test.ts`）、型チェック成功。追加した回帰確認は生鮮3品の各1回の計上、在庫・現金・需要の非変更、既存Milkの非重複、非食料・未知品・不正数量の除外。固定2世界の12か月比較も実施した。全件/E2Eテストは実行していない。

**次はE0の残る計画診断`unknown`の実際の停止箇所を記録し、家内作業の制約と結ぶ。** 家畜肉の新しい歩留り、所得階層の新しい配分モデル、供給係数、衣服/毛布の配分変更はここへ混ぜない。新市場17の初回食料決済スキップは前回の再現記録を維持してE1へ引き継ぐ。

```sh
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg docs/analytics/economy-e0-fresh-processing-province-101-20261023.json
node --import tsx scripts/auditWoolSupply.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/economy-e0-fresh-processing-world-102-20261023.json
node --import tsx scripts/summarizeEconomyBaseline.mts docs/analytics/economy-e0-fresh-processing-comparison-20261023.json docs/analytics/economy-e0-fresh-processing-province-101-20261023.json docs/analytics/economy-e0-fresh-processing-world-102-20261023.json
```
