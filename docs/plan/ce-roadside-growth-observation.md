# FMGの街道別交易観測とCE郊外拡張への連携設計

- 作成日: 2026-10-13
- 状態: 設計案。本文の新規台帳・集計・CE入力は未実装。
- 対象: Economy拡張、FMGの時間進行・保存・descriptor、CE。廃止予定のCGは対象外。
- 関連: [既存の経済連携設計](./fmg-economy-to-city-editor.md)、[Advance Time早送り](./advance-time-fast-forward.md)、[歴史モード](./advance-time-history-mode.md)、[橋の斜交規約](./bridge-skew-policy.md)

## 1. 結論と調査の限界

**街道別の都市拡張用データは、通常の日次経済シミュレーションで、都市の出入口ごとに、貨物量・方向・継続性・用途を保存する。推奨の初回観測は「初期調整2年＋評価5年＝計7年」。不足する場合は計10年まで延長する。**

**収集を始める前に、日次進行と遅延された生産・交易決算の実行順序を固定する修正をP0として行う。** その後は1年ずつ進めて年ごとのセーブと診断を残す。記録機構と分割実行の検証後は、10年を一度に指定しても暦月・暦年ごとの記録が残るようにする。現行コードのまま年数だけを増やして、本設計と同等の観測ができるとはしない。

7年・10年は実験計画の初期値であり、Leighを7〜10年間実測して得た較正値ではない。本調査では現行ソースと `temp/001.debug/leigh.json` を確認した。JSONは都市連携用の投影であり、世界全体の在庫・価格・航行中輸送・乱数状態を含む `.fmg` セーブの代わりにはならない。最適期間と安定判定の閾値は、後述の計測を実装して実セーブで較正する。

「現在の経済がどの街道の成長を支えるか」と「都市が数世紀かけてどのように成長したか」は時間尺度が異なる。5年間の交通平均だけで、市壁の年代・歴代郊外・住宅人口の増加まで確定しない。

## 2. 現行実装から確定できること

### 2.1 10年一括と1年を10回

`src/generators/timeEngine.ts` の `advanceTime()` は、年・月の指定を `durationToCalendarDays()` で日数に展開し、通常は `stepDaySimulation()` を1日ずつ実行する。UIの `runTimeSimulation()` も同じ日次経路を使う。

したがって通常モードでは、10年一括が10年分の交易を1回の計算で済ませるわけではない。1年を10回に分けても、それだけで交易の時間解像度は上がらない。日数は暦で比較し、10×365日を10年とみなさない。閏日開始などで期間加算の終点が変わり得る比較は、最終日を明示する。

**ただし、日次ループと交易を発生させる決算の実行タイミングは別である。現行のまま「一括と分割は同等」とは判断できない。**

| 条件 | 影響と採用方針 |
| --- | --- |
| 通常、同一期間・設定・入力 | 同じ日次処理を通るが、生産決算はmicrotaskへ遅延。UIの実行chunkや同期APIの呼出単位で、交易発生と移動の間隔が変わり得る |
| `fmg:time-advance-completed` | Advance操作の終了ごとに発火。既存Balance Historyは10年一括なら基本1行、1年×10なら10行。街道台帳の集計時計に使わない |
| Fast-Forward | 人口等の近似、粗い更新ゲート、バッチ終了時の残日処理が入る。分割境界で結果や乱数消費が変わり得る。観測標準ではOFF |
| 歴史モード `chronicle` / `dynastyOnly` | 月単位ストライドと経済系統の停止がある。`economy.caravans` 等を止めるため交易実績収集には不適 |
| 途中で設定変更・再生成・ロード | 市場・道・乱数・キャッシュ等の条件が変わり得る。別実験／別観測区間として記録 |
| 乱数 | `Caravans.tick()` の盗賊判定には `Math.random()` がある。保存済みseedだけで実行比較が完全再現するとは限らない |

根拠: `src/generators/timeEngine.ts`、`src/store/fastAdvanceState.ts`、`src/generators/fastAdvance/historyModeProfiles.ts`、`src/extensions/economy/controllers/balance-history.ts`、`src/extensions/economy/generators/caravans.ts`。

実行前にFast-ForwardのOFFを明示的に確認する。設定はブラウザのpersist状態であり、同じ `.fmg` を開くことだけでは統一されない。経済・Characters・Shipbuilding等の有効拡張、紛争の自律設定、人口・移住設定、物流設定もmanifestへ記録する。港湾輸送の存在を理由にShipbuildingや海上交易を無効化すると、価格・在庫・需要まで変わるので観測標準にはしない。

### 2.2 生産・交易のmicrotask境界：収集前に修正が必要

`src/extensions/economy/index.tsx` の `scheduleProductionSettlement()` は、約30日ごとの決算債務を `productionSettlementsDue` に蓄積し、`queueMicrotask()` で `production.settle` を実行する。通常モードでは債務件数分繰り返すので決算回数は保とうとしているが、期日ごとの世界状態を保存しているわけではない。`Production.produce()` は `Markets.runGlobalTrade()` と `Caravans.spawnFromDeals()` も呼ぶ。

- UIの `runTimeSimulation()` は実時間予算ごとに日次loopをyieldする。microtaskはそのchunkの後で動くため、月境界の直後に交易が起きるとは限らず、端末速度によるchunk差にも影響され得る。
- 同期公開APIの `advanceTime(10)` は日次loopを抜けるまでmicrotaskへ制御を渡さない。決算債務の件数を保持しても、期間内に発生したはずのキャラバンが期間末にまとめて生成される構造上の懸念がある。これをUIから10年進めた結果と混同しない。
- `advanceTime(1)` を10回、同じJavaScriptタスク内の単純for文で呼んでも途中のmicrotaskは動かない。各呼出の間でyieldするケースとも分ける。
- `fmg:time-advance-completed` だけでは未処理の生産決算がないことを保証しない。保存・descriptor出力前に経済のsettled状態を確認する。

**P0の修正方針:** hostの「その日の全simulation systemが終了した後、次の日を始める前」に、拡張の同期finalization hookを設ける。Economyはそこで当日期日の決算を完了する。ネストしたsimulation commandを既存日次commandの途中でdispatchせず、当日のcommit直後の共通runner境界でdrainする案を第一候補にする。UI・同期API・headless runnerの全経路から同じhookを呼ぶ。

決算債務は `{dueDate, elapsedProductionDays, skipFoodConsumption, mode, epoch}` としてスライスに保存する。当日より先へ時計を進める前にdrainし、イベントをその発生日へ帰属させる。既存の30日生産サイクルは保ち、観測用の暦月集計と混同しない。描画や手動編集由来のdirty通知は別にcoalesceできるが、当日の経済計算が画面yieldを待たないこと。

drain後に観測の当日完了を確定し、その後に次の日へ進む。日次処理とdrainを同じrollback単位に含める。失敗・map切替・ロードで残ったmicrotaskはepoch照合で無効化する。既存のmodule変数にしかない決算債務を残すと、保存やrollbackで台帳と交易が食い違うので同時に整理する。

これはスケジューリングの不整合を直す変更であり、旧実行と結果が変わり得る。改修前の年次実績と改修後を同じ系列へ混ぜず、simulation code revisionで区別する。移動中Caravanの処理順序は現行どおり当日の既存便を先に進め、当日決算で新規出発した便は翌日の移動から処理する契約に固定する。

### 2.3 既存の交通値の意味と不足

| 現行データ | 記録内容 | 街道拡張用としての限界 |
| --- | --- | --- |
| `Route.traffic` | キャラバン出発時、予定経路に含まれる各陸路IDへ+1。年0.7で減衰 | 貨物量でなく出発回数。路線全体の値で、都市の東口・西口を区別せず、実際の通過／到着も保証しない |
| `roads[].trafficRank` | 正の交通値を持つ陸路全体での順位。海路は除外 | 街道内の相対指標は既にあるが、少量でも最上位になり得る。同じrouteIdを通る局所区間の差が分からない |
| `TradeCorridor` | 無方向の都市ペア。貨物枠、価値、経路ID、モード等。年0.7で減衰 | 入出荷方向・暦年・都市出入口が消える。モード別量は経路長比で配分している |
| `tradePartners[].annualSlots` | 上記の減衰貨物ストック | 名称と異なり実測年流量ではない。最上位8相手、代表routeIdは最多利用路線で、市門に対応する保証がない |
| `MarketShipment` | 市場内のBurg→Burg配送。出発／到着tick、量、所要日数 | 経路探索結果を所要日数にして捨てる。現行台帳は到着時に陸路100%、routeIdなしで記録する |
| `Market.caravanArrivalVolume` | 市場への到着量、約2か月で半減 | 季節と直近の到着に敏感。都市各門の恒常的成長指標には短すぎる |
| `nextBurg` / `nextBurgs` | 街道の近隣都市、国、外交、役割等 | 成長の背景条件として有用。ただし近隣都市は最終取引相手とは限らない |

`MarketShipment` の所要日数は `TradeRoutePlanner.findRoutePath()` の結果を使う場合があり、そのsegmentsが水運を含み得る。それにもかかわらず現行の `recordMarketShipment()` は陸路として記録する。このため「landの回廊量があるのにrouteIdがnull」を、特定の市門の陸上交通と読み替えない。

年0.7の保持率では古い観測の重みは約1.94年で半減する。定常的に年qが追加される単純模型の蓄積量は、減衰前の位相で `q*(1-0.7^n)/0.3`。初期値の影響は7年で約8.2%、10年で約2.8%になる。ただしこれは既存ストックの収束時間であり、実際の経済の安定を保証しない。値は年次決算の前後でも変わる。

### 2.4 CE側の現在の利用

`roadTraffic.ts` は交通順位上位半分を交易沿道の判定に使い、`traffic=24` を200mの沿道長の基準とし、60〜480mに制限する。上位約1/3の `roads` を門外の石畳・道幅に使う。これらは減衰出発回数の現行単位で較正された定数なので、新しい貨物枠/年へ値だけを差し替えない。

Leighでは市壁面積の自動割合45%と必要住宅数8,502への調整が壁外街区を大きくする。街道実績を追加するだけでは、この全周的な住宅配分は解消しない。後段で住宅配分と道路別の成長形状を接続する必要がある。

## 3. 観測期間とAdvance Timeの運用

### 3.1 初回の標準手順

1. 計測対応コードを入れた後、対象世界の `.fmg` を複製保存。開始日、コードrevision、世界ID、設定、既存人口・在庫・市場・道路を記録する。
2. 経済と必要な依存拡張を有効にし、Fast-Forward OFF・歴史モードOFF。途中で市場／道路／経済を再生成しない。
3. 最初の1か月で出発・配送・経路割当・月締め・保存再読込を点検する。各停止時に当日期日の決算債務が0であることも確認する。この1か月も初期調整期間に含める。
4. 開始から2年間を初期調整期間として進める。記録は捨てず `warmup` と印を付け、年1回セーブ・診断する。
5. 続く5年間を評価期間とする。月別季節性、年別量、最近3〜5年平均、門ごとの構成比を取得する。
6. 7年時点で§3.2を確認。不足する門だけを低信頼とし、必要なら計10年まで1年ずつ延長する。
7. 10年でも観測が乏しければ `insufficient` として出す。記録漏れ・輸送待ち・需要不足を点検し、単に長期間進めて解決したことにしない。

評価は原則として完全な暦月／暦年で行う。年途中開始では開始月の端数を保持し、2年間経過後に到来する次の年初から完全5暦年を評価する方法を標準とする。この場合、総経過時間は7年より最大約1年長い。開始から厳密7年のローリング窓を使う場合は年別集計と区別する。

市場・輸送資産が既に動いているセーブでは、初期調整は短縮できる。ただし台帳導入前の「記録がない期間」をゼロ交通と扱わない。大規模な市場再編・戦争・供給崩壊が起きたら、移行前後を別regimeとして保存する。安定していない状況自体も都市成長の停滞・縮退に有用な観測である。

### 3.2 十分性の判定（較正前の提案値）

- 有効な観測日が予定日数の95%以上。停止・OFF・省略された期間は欠測扱い。
- 比較する最近の完全3年で、主要門の陸上貨物構成比の年差が概ね10 percentage points以内。上位門の入替は僅差なら許容する。
- 総量についても急増減を確認する。順位だけが安定していて全体が崩壊しているケースを「安定成長」としない。
- 各門で商業キャラバンの独立した出発／通過が評価5年に20件以上なら初期的な参考線とする。配送商品行20行を20隊と数えない。20件で統計的精度を保証しない。
- キャラバン件数が少なくても、市場内配送が3年以上・複数季節で反復していれば、配送モデル由来の量として別評価できる。
- 未割当貨物が全体の10%超、または主要門の候補となる貨物が大量に未割当なら、年数延長より経路対応の修正を先に行う。
- 平均、中央値、年ごとの範囲、活動月率を併記。大量の単発軍需と小規模な継続商業を区別する。

これらは史実の都市形成を証明する閾値ではない。Leigh、非港湾市場都市、城塞都市、農村近隣都市の少なくとも4事例で調整する。

## 4. 収集単位：路線から都市の出入口へ

### 4.1 同一性

新しい主キーは `(worldId, topologyEpoch, burgId, approachId)` とする。

- `routeId` 単独にしない。同じ道路が都市の両側を通り、片側だけが繁忙な場合がある。
- `approachId` は都市外向きの有向接続を表す。最初の識別可能な道路half-edge、同一セル内ならpolyline上の局所区間IDを使う。描画順のindexや角度の丸め値だけではIDを作らない。
- 同じ橋・渡し場へ複数路線が合流するとき、物理的な共通出入口とその先の各branchを別階層で持つ。`sharedCrossingId`、`sharedRouteIds`、`sharedBranches`、`nextBurgs` と対応させる。
- `regionalContext.roads[].branchId` の列挙番号を、そのまま永続IDとみなさない。
- 道路の分割・統合・再生成ではepochを更新。旧IDを新道に無条件で引き継がない。形状と接続が同じ場合のみ明示的な対応表を作り、履歴は旧epochのまま残す。
- 方位、近隣都市、所属国、外交関係は時点付き属性として保存し、現在の関係で過去を書き換えない。

判定面は固定した観測開始時の都市周辺境界を基本とし、CEが生成した壁そのものを観測面にしない。人口増加で半径が変わってもID・通過件数が勝手に変わらないよう、境界変更はepoch更新とする。起終点都市には実際の接続edgeに基づく出入口を与え、遠方を迂回する道を「近い」というだけで市門通過としない。

実装は `collectRouteLegs()` と共有横断施設の接続判定を再利用できる形で抽出する。EconomyからCEやdescriptor全体の生成を呼ばず、host側の純粋な接続投影を拡張APIで供給する。CEを一度も開かなくても全対象都市の履歴が蓄積されること。

### 4.2 港湾交通との分離

経済シミュレーション自体の水運は継続し、集計時に次を分離する。

| 経路例 | 街道観測への扱い |
| --- | --- |
| 海／川から港へ到着し、同都市内で消費 | 港湾実績。架空の市門交通へ割り振らない |
| 港から都市外へ荷車で輸送 | 実際の陸送出入口へ加算し `portConnected` を付ける |
| 遠方の陸上出発→港→船→別の港→陸送 | 各陸上区間の実際の門通過量を記録。航路長比で貨物を減らさない |
| 都市を陸路で通過 | 入門・出門それぞれの負荷を記録し、都市単位のthrough journeyは1件として別集計 |
| 海主体の交易しかない都市 | 陸上量0を許容。陸上順位の正規化で大きな郊外を強制しない |

100 cargo slotsの混合輸送が短い陸上区間を通る場合、その区間の貨物通過量は100 slots。全旅程の陸路長が10%だから10 slotsとしない。距離を掛けた `cargoSlotKm` は輸送仕事量として別単位で保存する。全門・全モードの通過量を足して世界の出荷総量と比較しない。

## 5. 観測イベントと記録箇所

### 5.1 必須の第一段階：計画・出発・到着の記録

1. `caravans.ts` の `tryDepartLoadingCaravan()` と直接transitを作る出発経路に共通observerを置く。`recordRouteTraffic` / `recordCaravanCorridor` の近傍で、実際に出発が成立した時だけ呼ぶ。loadingや待機再試行では数えない。
2. 出発時の積荷、cargoSlotsPerUnit、目的、モード別legs、通過予定approaches、出発日をsnapshot化する。strategicProcurementとfood co-loadは行単位で分ける。軍需を通常商業と同じ重みで住宅成長へ入れない。
3. 到着・喪失・積載中取消・腐敗を、それぞれ別outcomeとして、terminal状態が配列から消える前に記録する。出発時貨物と到着貨物を別に持つ。
4. `retailInventory.ts` の `travelDays()` を `{travelDays, pathRef, routeQuality}` を返す処理に分け、すでに計算した経路を出発時に保存する。観測目的で同じODを再探索しない。
5. MarketShipmentは配送発行と到着を記録する。経路snapshotが無い旧配送／距離fallbackは `unknown`。現在の道路から過去の実経路を捏造しない。

この段階の予定門量は `plannedDepartedCargoSlots`、到着済み配送の経路量は `deliveredPathCargoSlots` と命名する。「物理通過実測」として表示しない。現状のMarketShipmentは独立輸送隊ではなく商品ごとの集約配送なので、キャラバン件数へ換算しない。

### 5.2 第二段階：移動進捗に基づく門通過

- Caravan出発時に、計画経路上の各観測境界について累積距離と方向を前計算する。
- `advanceCaravan()` の移動前後の `currentDistance` が境界距離をまたいだときだけ通過を記録する。1日に複数の門／モード切替をまたぐ場合も順序どおり処理する。
- 距離は `travelLegs[].endKm` と同じ基準でbakeする。現行コードはtravelLegs終端と幾何のtotalDistanceが少し異なり得るため、独立した距離換算を混ぜない。
- 通過時に残っている積荷量を使う。出発時積荷のまま腐敗後の門へ加算しない。
- 盗賊による喪失は現在、日次移動後の判定であり、正確な襲撃地点がない。通過は「日次移動モデル上の通過」とし、同日喪失を品質フラグへ残す。成功到着と同一視しない。
- MarketShipmentには連続した移動状態がない。到着で確認できる経路利用を評価の基本とし、途中都市の通過月を所要時間配分で推定する場合は `modelledPassage` と明示する。Caravan由来の通過と別集計する。
- 経路変更が将来導入された場合、旧経路の未通過チェックポイントを破棄し、新経路の残区間を作る。通過済み実績は移さない。

### 5.3 二重計上と欠測

`movementId` は `(worldId, sourceKind, generationEpoch, sourceId)`。Caravan IDと配送IDを混同しない。通過のidempotency keyはこれに `pathRevision, checkpointOrdinal, direction` を足す。通過後に別門から戻る移動は別checkpointとして正当に数える。

出発・通過・到着は違う指標であり、同じ「交通量」列に足し合わせない。港到着後に新しい市場内配送が発生した場合、商品が同じでも陸送区間の新しいmovementとして扱う。

導入時に進行中だったCaravanは未通過区間だけ観測し `leftCensored` を付ける。導入前の出発と通過を遡って加算しない。出発コホートの成功率は導入後出発分で計算し、観測終了時のtransitを失敗としない。

徒歩旅客、農民の未モデル化された日常移動、空車回送、軍隊、港湾内の未モデル化された荷役は、自動的に実績へ補わない。必要なら後段の推定値として別モデル・別列を追加する。

## 6. 永続データ契約

新規 `simulationContext.extensions.economy.roadsideObservation` に集約する。観測設定・開いている月・進行中チェックポイントも保存し、reload後に続きから集計する。画面専用Zustandやmodule変数だけには保存しない。

以下は実装時の型の骨格。`*Id` の参照整合性と非有限値を検証する。

```ts
type RoadsideObservation = {
  schemaVersion: 1;
  worldId: string;
  startedAt: CalendarDate;
  lastProcessedTick: number;
  configurationHash: string;
  configSegments: ObservationConfigSegment[];
  topologyEpochs: ApproachTopology[];
  coverage: ObservationCoverage[];
  openMonth: MonthlyApproachBucket[];
  monthly: MonthlyApproachBucket[];
  annual: AnnualApproachBucket[];
  activeMovements: MovementCheckpointState[];
};

type MonthlyApproachBucket = {
  period: string; // 暦のyear-month。tick % 30で区切らない
  burgId: number;
  topologyEpoch: number;
  approachId: string;
  source: 'caravan' | 'marketShipment';
  purpose: 'commercial' | 'strategic' | 'foodCoLoad' | 'unknown';
  evidence: 'movementModel' | 'deliveredPath' | 'modelledPassage' | 'planned';
  direction: 'inbound' | 'outbound';
  role: 'origin' | 'destination' | 'transit';
  portConnected: boolean;
  movementCount: number;
  cargoSlots: number;
  nominalCargoValue: number | null;
  byGoods: { goodId: number; units: number; cargoSlots: number }[];
  activeDays: number;
};
```

上記とは別に、都市／ODコホート別outcome表へ `departed, arrived, lost, cancelled, stillInTransit, spoilageSlots, travelDays` を持つ。門の通過件数とOD到着件数を同じ母集団として成功率を計算しない。価格未記録の市場内配送は `null` とし、価値0の取引と区別する。貨物価値は売上・利益・地元雇用そのものではない。

`coverage` は観測可能だった日数と除外理由（extensionOff、fastForward、historyMode、missingPath、missingSnapshot等）を保持する。観測有効でイベント0の日は0、無効な日は欠測。年の途中導入はpartialとし、短い季節の値を無条件に12か月へ外挿しない。

`configSegments` にコードrevision、拡張バージョン、有効システム、日次ストライド、経済・人口・外交設定、商品カタログ／貨物換算のrevision、観測対象都市を保存する。変更された月は混在フラグを付ける。

保存・月締めの要件:

- 月の最初のイベントで旧月を閉じるだけでは無交通月が消えるため、日次の観測時計で月境界を検出する。
- 当日経済処理の前に時計／区間を整え、すべての当日発行を同日のopenMonthへ加算。年次集計は締まった月の合算で作る。
- 操作終了通知はUI表示・export更新にだけ使う。月末に10年バッチが継続中でも確定する。
- スライス更新はsimulation mutation内で行い、日／バッチrollbackで経済状態と一緒に戻る。外部CSVへtick中に追記しない。
- typedな保存検証・migrationを追加する。旧セーブは未観測から開始。現在の台帳から過去10年を復元しない。
- 通常保持は直近60か月＋50暦年、累積値と開始／終了日は別保存。研究モードは120か月を保持し、10年間の季節比較に使う。
- 過去の全イベントを無期限に持たない。進行中movementのチェックポイントと、最大30日等の上限付き診断ログだけを残す。
- 商品別内訳は期間集計前にtop-kで切らない。CEへの投影時のみ上位商品＋otherへ圧縮する。

## 7. CEへ渡す投影

hostの `BurgSiteEconomy` にoptionalな `roadsideActivity` を追加し、その内部に独立した `schemaVersion: 1` を持たせる。既存economy v1とdescriptor v3の旧項目の意味は変更しない。hostとCEの型コピー・入力検証・往復保存を同時更新する。

各approachについて渡すもの:

- `approachId`, `topologyEpoch`, route/branch/shared crossingとの対応。
- `from`, `to`, `observedDays`, `completeYears`, `confidence`, `evidenceMix`。
- 最近5完全年の貨物枠/年、最近1年、中央値、活動月率、年ごとの推移。
- 入荷／出荷／通過、商業／軍需／食料便、港接続陸送の内訳。
- 都市内の陸上門間構成比 `localLandShare`、陸上絶対量、比較対象都市群での順位を別々に持つ。
- 主な商品群、実際の取引相手、隣接都市の役割・外交。取引相手とnextBurgを同じ欄にしない。
- 経路未割当量、観測開始前由来の便、日次通過と配送モデル推定の割合。

Economyは既存provider経由でhostに値を渡す。hostからEconomyを直接importしない。経済投影の読取りは観測台帳を変更せず、CEを開き直しても件数・期間・乱数が変わらないこと。

新規レコードが有効ならCEはそちらを優先し、欠測なら旧 `traffic` / `nextBurg` のフォールバックを使う。有効に観測した0交通を「欠測」として再び繁忙道路へ推定し直さない。現行 `trafficRank` を貨物順位へ黙って置換せず、新しい型とキャッシュキーで扱う。

共通橋へ複数路線が合流する場合、各branchの通過イベントの和を共通幹線へ集約する。route全体の同じストックを路線数分重ねない。門ごとの集計とbranchごとの集計を同時に全体合計へ加算しない。

## 8. 郊外拡張への利用方針

観測の第一用途は「住宅総数を増やすこと」ではなく、Burg人口に対応する市街地をどの街道へ配分し、どの土地利用を置くかの重みである。セルのrural人口14Kを都市38Kへ二重に足さない。

| 観測特性 | CEで優先する形状・用途（設計案） |
| --- | --- |
| 数年継続する商業交通、頻繁な隊の通過 | 門から街道に沿う宿・厩舎・修理・店舗、背後の住宅と庭 |
| 大量だが少数便の穀物・家畜 | 荷捌き・囲い・穀倉・市場。住宅の長い連続帯とは別に扱う |
| 木材・石材等の重量物 | 道路接続の置場・作業場。既存storage面積と重複させない |
| 港接続の陸送 | 港と陸の出口を結ぶ物流動線と、その沿道の倉庫・商業 |
| 少量だが継続する農村向け配送 | 小規模な門前集落、菜園、畑、疎な沿道住宅 |
| 単発軍需、敵国方面、喪失増加 | 成長の不確実性・防御上の空地。単発の量だけで商業住宅街を拡大しない |
| 昔は繁忙、最近は減少 | 建築済み市街地と現在の充足率を分け、翌年ただちに街区を消さない |

初期スコアは、貨物量の対数圧縮、活動月率、複数年の継続性、隊数、地元の就業者・施設の裏付けから作る。絶対量と相対比を併用し、唯一の門が年1便でも `localLandShare=1` だけで最大郊外にしない。係数はデータ収集後に較正し、本設計で根拠のない固定値を史実値として採用しない。

形状は「門沿いの密な正面→奥の庭・作業場→農地」「大きい拠点周辺の小街区」「繁忙街道間にも未建築の楔を残す」を基本候補とする。防御空地・地形・水域・既存施設を優先制約にする。市壁の更新段階は別入力とし、交易が増えたら全周の住宅帯が広がる実装にはしない。

`fitImportedHousing` が不足分を全壁外地区へ開放する処理と接続し、観測のある街道の配分枠・道路接続・建築可能面積を先に定める。それでも住宅が収まらないときは、壁内密度・市壁段階・市街地面積の不足として診断する。道路のない帯を埋めて成功扱いにしない。集合住宅や階数は人口収容力の別モデルであり、貨物枠から世帯数を直接算出しない。

橋の新設をこの観測機能は行わない。将来の成長描画で横断部を変更するときも `src/utils/bridgeSkewPolicy.ts` と既存の横断施設を尊重する。

## 9. 変更ファイルと実装順

| 優先 | 対象 | 変更内容 |
| --- | --- | --- |
| P0・最初 | `src/generators/timeEngine.ts` と共通日次runner、`src/extensions/economy/index.tsx` | §2.2の決算drain・settled完了契約・債務の保存を実装。同期API/UI/headlessの順序を統一 |
| P0 | 新規 `generators/roadsideObservationTypes.ts`, `roadsideObservation.ts`（Economy内） | 型、期間集計、欠測、出発／到着／喪失、単位・重複防止を実装 |
| P0 | `src/extensions/economy/context/trade.ts`, `economyContext.ts` | スライスのaccessor。新規スライスのdefault・検証・migration・保存を既存extension state機構に接続 |
| P0 | `src/services/burgSiteDescriptor.ts` と新規host接続投影サービス | 道路legs・共有横断・有向approach同一性の共通化。拡張への読取りAPIを用意 |
| P0 | `src/extensions/economy/generators/caravans.ts`, `marketTypes.ts` | 全出発経路のobserver、経路・積荷snapshot、terminalイベント、旧進行便の扱い |
| P0 | `retailInventory.ts`, `retailInventoryTypes.ts`（同ディレクトリ） | 経路を捨てず配送にpathRefを保存。配送件数と輸送隊数を分離 |
| P0 | `src/extensions/economy/index.tsx`, `tickSystemIds.ts` | 日次観測時計を正式登録。順序・topic契約・history maskを更新。操作完了イベントに依存しない |
| P0 | 新規 `scripts/collectRoadsideActivity.ts` | 実セーブを使う1年ごとの実行・checkpoint・manifest・CSV/JSON export。既存 `scripts/lib/advanceYearHarness` の起動部分を再利用 |
| P1 | `caravans.ts` と移動legのbake処理 | 距離チェックポイントと日次通過観測。P0のplanned値と区別 |
| P1 | `src/extensions/economy/generators/burgSiteEconomy.ts`, `src/services/burgSiteEconomy.ts` | optional投影を既存providerへ追加 |
| P1 | `src/city-editor/core/gen/site/burgSiteEconomy.ts`, `burgSiteDescriptor.ts`、入力parser | 新フィールドの検証・互換性・保存往復 |
| P2 | CE `roadTraffic.ts`, `suburbanLanduse.ts`, `fitImportedHousing.ts` 等 | 新単位の較正と街道別住宅配分・形状。P0/P1の計測完了後に着手 |

P0は決算順序の修正と計測追加を行い、既存 `Route.traffic` / `TradeCorridor` を置換しない。公共事業の舗装判断を変えると観測導入自体で経済が変化するため、旧台帳は併存させる。`annualSlots` の改名・市場内配送の旧回廊モード修正は互換性と下流消費者を確認した別変更として扱う。

新しい観測systemだけが歴史モードで動いて「交通ゼロ」を記録しないよう、観測開始／再開時にhostの有効設定と最終処理日を確認し、停止区間を欠測として補う。P0で計画値だけが得られたデータも保存可能だが、CEの成長較正に用いる際はevidenceを必ず限定する。

## 10. 検証と受入条件

### 10.1 正しさ

- A—B—Cの一本道でA→Bの便がCの門へ加算されない。
- 同じrouteIdの東西口を区別し、A→CのB通過は入出門それぞれ1回・Bのthrough journeyは1回。
- 複数路線が同じ橋へ合流しても共通門を重複加算しない。routeId=0も有効。
- 100 slotsの混合輸送は、通過した陸上区間へ100 slots。水運のみの輸送は陸の門へ0。
- 出発待ち、ロード直後、出発再試行、日次再通知で二重加算しない。
- MarketShipmentの水運経路・fallback・旧データを、根拠なく陸路実績へ変換しない。
- 喪失前の通過を残し、未到達門には加算しない。未到着を失敗率の分子にしない。
- 食料相乗りと本体payloadで同じ積荷枠を二重に数えない。商品ごとのunitsは異単位のまま足さない。
- 月／年境界、閏日、無交通月、年途中開始、拡張停止・復帰を正しく区別する。
- save/load、途中停止・再開、生成や市場再生成、map切替、route削除・ID再利用を検証。
- 強制例外で日／バッチがrollbackしたとき、集計・進行中cursor・月締めも同じ状態へ戻る。

### 10.2 10年一括と分割の比較

まず§2.2の月境界をまたぐ日次実行で、次の日の移動開始前に当日の交易生成まで完了することを検証する。UIのchunk予算と端末速度を変えても同じ経済順序になること、同期APIの連続for文でも決算が後回しにならないことを確認する。

次に同じ輸送イベント列を、10年一括・1年×10・不規則な日数分割で集計し、月年bucketの完全一致を検証する。これは台帳の分割独立性を保証するテストで、世界シミュレーションの完全再現性とは分ける。

次に同一 `.fmg`・同一終点・同一設定で3経路を実行し、総日数、出発件数、貨物、出入口集計、欠測、経済主要値を比較する。外部乱数を固定できるテスト環境を用意し、未統制の `Math.random()` や操作境界の副作用が残る限り、seedだけで完全一致を受入条件にしない。実行差がある場合は差の発生日とイベントを記録して追跡する。

決算順序を修正した同一バージョン上での観測ON/OFF比較では、観測処理が乱数を消費せず、価格・在庫・経路選択・公共事業の結果を変えないことを検証する。コードと設定が同じなら、CE descriptorの取得回数でも経済結果が変わらないこと。

### 10.3 性能・出力

- 毎日全道路×全都市×全貨物を走査しない。topologyをrevisionごとに索引化し、移動経路ごとのcheckpointを一度だけ作る。
- 経路snapshotはimmutableなpath tableへまとめ、配送行がpathRefを共有する。生存中・保持期間内の参照がなくなったpathのみ回収。
- 月年集計の更新は既知キーへの加算を基本とし、全台帳のdeep copyを毎便行わない。rollback・保存契約との両立を確認する。
- まず代表世界で1年の速度・保存サイズを観測ON/OFF比較。暫定目標は追加処理時間10%以内。超過したらイベント索引・集計粒度を見直す。
- 全世界集計が重い場合、対象都市と経路上の必要近隣を指定する観測scopeを実装し、scope外を0と見せない。
- 出力: `manifest.json`, `approaches.json`, `monthly.csv`, `annual.csv`, `outcomes.csv`, `coverage.csv`, `diagnostics.json` と年次 `.fmg` checkpoint。
- CSVにはworld/epoch/burg/approach、期間、evidence、source、purpose、方向、量と単位、coverageを必須列として入れる。

P0の完了条件は、対象都市の各街道について「量が少ない」のか「経路不明」のか「計測期間が短い」のかを判別でき、1年ずつ進めても10年一括でも月別履歴が失われないこと。P1完了後、実測可能な日次移動モデルと配送経路推定の内訳を明示して、7年／10年の較正を行う。

## 11. ソース確認箇所

以下は2026-10-13時点のソースに基づく。関連する既存設計書には実装前の説明も残っているため、現行コードを優先した。

- `src/generators/timeEngine.ts`: `advanceTime`, `enterDayBatch`, `exitDayBatch`, `notifyAdvanceCompleted`, `runTimeSimulation`。
- `src/generators/fastAdvance/historyModeProfiles.ts`: `CHRONICLE_DISABLED_ECONOMY`, `HISTORY_MODE_PROFILES`, `strideStepDays`。
- `src/store/fastAdvanceState.ts`: ブラウザに永続化される早送り・歴史設定。
- `src/extensions/economy/generators/publicWorks.ts`: `recordRouteTraffic`, `decayRouteTraffic`, `PublicWorksModule.settleAnnual`。
- `src/extensions/economy/generators/tradeCorridorLedger.ts`: `applyCorridorMovement`, `modeShareOf`, `recordCaravanCorridor`, `recordMarketShipment`, `tradePartnersForBurg`。
- `src/extensions/economy/generators/production-generator.ts`: `Production.produce` に含まれるglobalTradeとspawnCaravans。
- `src/extensions/economy/generators/caravans.ts`: `tryDepartLoadingCaravan`, `advanceCaravan`, `Caravans.tick`。
- `src/extensions/economy/generators/retailInventory.ts`: `travelDays`、配送の生成・到着処理。
- `src/extensions/economy/generators/marketTypes.ts`, `retailInventoryTypes.ts`: 経路・輸送の型。
- `src/extensions/economy/index.tsx`, `tickSystemIds.ts`: 日次処理順序とtopic契約。
- `src/extensions/economy/context/economyApi.ts`, `context/trade.ts`: extension sliceの読書き。
- `src/runtime/extensionStateSliceRegistry.ts`, `extensionStateSlices.ts`: 永続スライス・参照検証の基盤。
- `src/services/burgSiteDescriptor.ts`: `collectRoadEntries`, `landTrafficRanks`、共有横断とbranch。
- `src/services/burgSiteEconomy.ts`, `src/extensions/economy/generators/burgSiteEconomy.ts`: provider用データ契約と投影。
- `src/city-editor/core/gen/roadTraffic.ts`, `suburbanLanduse.ts`, `fitImportedHousing.ts`: 現行交通反映・郊外・必要住宅数調整。
