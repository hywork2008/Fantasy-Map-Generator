# Shipbuilding Phase 9 — 国内戦略調達と産業循環

| 項目 | 内容 |
| :--- | :--- |
| Status | In progress — M9.0〜M9.3 implemented; M9.4 planned |
| Parent | [shipbuilding.md](shipbuilding.md) Phase 9 |
| Prerequisite | Phase 8 の資材消費ゲート |
| Scope | 国家の造船需要を国内優先の調達・交易・生産・集約型雇用へ接続する |

## 1. 目的

Phase 8 により、造船所は所属市場に Wood / Sails / Ropes / Tar が同時に存在するときだけ進むようになった。
M9.2 では、state-owned 造船所が材料の年間需要を Economy に通知し、Economy が国家の戦略調達注文・国庫決済・
Caravan を管理するようになった。M9.3 では、未充足注文を既存の都市生産判断へ期待利益として渡す。職業 cohort・
賃金・設備能力を持つ M9.4 は未実装である。

Phase 9 は、為政者の「殖産興業」と平民・事業者の「利益のある仕事への移動」を、次の因果として実装する。

```text
造船計画と備蓄目標
  → 戦略調達注文（国庫が支払い、国内・近距離を優先）
  → 生産者の受注・期待利益、労働需要、輸送需要
  → 労働者・事業者の緩やかな職替えと設備拡張
  → 国内の Wood / Sails / Ropes / Tar 生産と流通の増加
  → 市場在庫・備蓄の回復、造船再開、税収・船隊能力の増加
```

国策は資材を直接出現させない。国庫の支出、買上価格、補助、輸送・保管への投資を通じて、民間の採算と
雇用を変える。そのため、国内供給力が低ければ建造は遅れ、資金がなければ政策も維持できない。

## 2. 現在の実装と問題

| 領域 | 現状 | 問題 |
| :--- | :--- | :--- |
| 造船 | `shipyardQueue.ts` が市場在庫を原子的に消費し、state-owned queue の年間材料需要を CustomEvent で Economy に通知する。 | market-owned queue は戦略調達の対象外。 |
| 生産 | `Production.produce()` は通常の人口需要、既存 recipe、未充足の戦略調達注文をもとに労働を配分する。 | 職業 cohort による中長期の capacity 拡張は未実装。 |
| 交易 | `Markets.runGlobalTrade()` は従来どおり民間の投機交易を扱う。`StrategicProcurement` は別経路で国内優先・Enemy 禁輸の候補を選ぶ。 | 敵対国禁輸は戦略調達にだけ適用する。 |
| 物流 | 戦略調達は `Deal.purpose = "strategicProcurement"` と order id 付き Caravan を起票する。出発時に輸出元 stock、到着時に輸入先 stock を更新する。 | Caravan の損失は注文を blocked にする。注文の明示的な取消 UI は未実装。 |
| 雇用 | 都市生産は各生産周期に人口を worker loop へ割り当てる。 | 職業別の人数、賃金、技能、転職の慣性を保持しない。 |

特に、造船の消費は `Production.produce()` 後に起きるため、単に市場の価格を上げるだけでは次回生産までの
因果が弱く、Sails / Ropes / Tar のような中間財が恒常的なボトルネックになりやすい。

## 3. 設計原則

1. **敵対国との戦略物資取引は禁止する。** `Enemy` 関係の国家間では、造船材料とその主要中間財を輸入・輸出しない。
2. **同一国家・近距離・低い着地価格をこの順で重視する。** 同一国家内では距離による恣意的な禁止を置かず、
   `商品価格 + 税 + 輸送費 + 必要なら補助額` の着地価格が低い供給地を選ぶ。
3. **国外取引は不足時のフォールバックだけにする。** 同盟国・中立国からの輸入は政策で許可できるが、国内の
   実行可能な供給を先に尽くす。輸入に頼るほど国庫支出と富の流出が増える。
4. **注文は物理的な在庫・Caravan を通す。** 注文の作成だけで市場 stock、完成船、雇用を増やさない。
5. **食料・生活必需品を戦略調達で枯渇させない。** 供給市場の通常の安全在庫を残した超過分だけを引き当てる。
6. **平民を個人単位で常時シミュレートしない。** 最初は市場・burg ごとの職業 cohort を用い、人口数・賃金・技能を
   集約して更新する。Character/Nobility は政策の意思決定者として後から接続する。
7. **Shipbuilding は Economy を直接 import しない。** Phase 8 と同様に、イベントまたは ExtensionAPI の
   汎用登録機構を境界にする。

## 4. ドメインモデル

### 4.1 戦略物資と交易方針

まず造船材料4種を戦略物資として扱う。後続で Cloth、Tools、Iron などを追加できるよう、Good 名のハードコードを
交易コアへ広げず、`StrategicGoodsPolicy` で対象を保持する。

```ts
type ForeignProcurementMode = "domesticOnly" | "alliesAndNeutral" | "unrestricted";

interface StrategicGoodsPolicy {
  stateId: number;
  goodIds: number[];
  foreignProcurement: ForeignProcurementMode;
  enemyTrade: "prohibited";
  targetReserveDays: number;
  domesticPurchasePremium: number;
  maxProcurementDays: number;
}
```

- `domesticOnly`: 同一国家の市場だけから調達する。不足は建造停止として残る。
- `alliesAndNeutral`: 国内を優先し、国内が不十分なときだけ非敵対国へ広げる。現実装では外交ラベルを Ally / Neutral に限定せず、`Enemy` 以外を許可する。
- `unrestricted`: 敵対国以外を着地価格順で選ぶ。初期値にはしない。
- `enemyTrade: "prohibited"` は初期 Phase 9 では固定とする。密輸・封鎖突破は将来の外交・諜報 Phase で扱う。

通常の民間交易にも敵対国禁輸を適用するかは明示的に選ぶ必要がある。最初の実装では、**戦略物資だけ**を禁輸し、
食料などすべての交易を一度に政治化しない。

現在の既定 policy は `foreignProcurement: "alliesAndNeutral"`、`targetReserveDays: 365`、
`maxProcurementDays: 90`、`domesticPurchasePremium: 0` である。policy は Economy の pack 拡張データとして
state ごとに保存される。`domesticPurchasePremium` の UI 設定および価格比較への個別反映は後続課題であり、
現時点の国内優先は tier 順そのもので実現している。

### 4.2 調達需要・注文・輸送

造船所は実際の消費結果ではなく、潜在建造速度から予測需要を出す。現在の `BUILD_POINTS_PER_YEAR = 2` では
Sloop基準の造船所1つあたりの年間需要は Wood/Sails/Ropes 各 0.4、Tar 0.2 である。

```ts
// Shipbuilding -> Economy のイベント契約。Good id の解決は Economy が所有する
// （Shipbuilding は Economy を直接 import しない）。
interface ShipbuildingStrategicProcurementDemand {
  stateId: number;
  destinationMarketId: number;
  source: "shipbuilding";
  annualMaterials: ShipbuildingMaterials; // Wood / Sails / Ropes / Tar の年間需要
}

interface ProcurementOrder {
  id: number;
  stateId: number;
  destinationMarketId: number;
  goodId: number;
  requestedUnits: number;
  fulfilledUnits: number;
  maxLandedUnitPrice: number;
  status: "open" | "assigned" | "inTransit" | "fulfilled" | "blocked" | "cancelled";
  sourceMarketId?: number;
  caravanId?: number;
  blockedReason?: "noDomesticSupply" | "foreignPolicy" | "noRoute" | "insufficientTreasury";
  priorityCycles?: number; // 未充足のまま受けた需要通知の回数
}
```

Economy は Good 名を Good id に解決して、材料ごとに `targetStock = annualDemand * targetReserveDays / 365` を
計算する。現在の既定備蓄は 365 日（造船所 1 つあたり Wood / Sails / Ropes 各 0.4、Tar 0.2）である。
初期在庫の warm-up や 730 日備蓄への較正は未実装であり、マップ規模と実測生産量に基づく調整が必要である。

注文は Economy が所有する。Shipbuilding は「どの state の、どの市場に、どの資材が、どれだけ必要か」だけを通知し、
Economy は在庫、供給地、経路、Caravan、国庫決済を一貫して更新する。

M9.3 では `priorityCycles` を同一の未充足注文へ加算する。これは Shipbuilding が日次 tick で送る需要通知を
注文数へ積み増さず、長く解消しない需要だけを生産判断で強くするための状態である。新規注文は 1 から始まり、
既存セーブデータで値がない場合も 1 として扱う。

### 4.3 供給地選択

到着市場の現在 stock は備蓄達成量として先に差し引く。残りの不足に対して、**別市場**の候補を次の tier で探索する。

1. 到着市場自身の現在 stock（備蓄達成量として扱い、Caravan は起票しない）
2. 同一 state の別市場
3. 非敵対 state の別市場（方針が許す場合のみ）

各 tier 内では、安全在庫として現在 stock の 20% を残した利用可能量を対象に、次の順で選ぶ。

1. 経路が存在し、`maxProcurementDays` 以下であること
2. 着地価格が低いこと
3. 到着日数が短いこと
4. 供給余力が大きいこと

敵対関係は、両市場の中心 burg の `state` と外交状態から判定する。外交表が片側だけ `Enemy` の不整合な
セーブデータでも禁輸となるよう、両方向を検査する。無所属市場（state 0）は中立として扱うが、将来は海賊・封鎖・
関税を別途導入する。

選定された注文は `Deal.purpose = "strategicProcurement"`、`payerStateId`、order id を付けて専用起票する。
Caravan が到着したときに注文を `fulfilled`、損失時には `blocked` へ進める。輸出元 stock は出発時、輸入先 stock は
到着時に変わるという物理モデルを維持する。

### 4.4 国庫と国内循環

国家は注文の着地価格を支払う。最低限、以下を明確にする。

- 輸出元市場・burg は売却収益を得る。
- 国内取引であれば sales tax と生産者の収益が同一国家内へ残る。
- 外国取引であれば、購入額は輸出国側の収益となり、輸入国の国庫から流出する。
- `domesticPurchasePremium` は、外国品がわずかに安くても国内品を選ぶために国家が許容する追加負担である。
  フィールドは保存されるが、現在の既定値は 0 であり、個別の価格補正は未実装である。
- 国庫不足なら注文は `insufficientTreasury` で停止し、在庫も造船進捗も増えない。

Phase 8 では資材消費を無償の物理消費とした。Phase 9 で資金決済を導入する場合、既存キューの消費時課金と
調達時課金を二重にしない。実装は**注文の起票時に国庫が着地価格を支払い、到着在庫を通常市場在庫として
造船所が消費する**方式である。供給市場の中心 burg には売却収益を記帳し、国庫が生産周期ごとに再計算される
既存仕様に合わせて、調達支出も次回の税収計算へ一度だけ繰り越す。
商船（`owner: "market"`）の調達財源は Phase 9 の初期範囲外とし、国家の戦略調達だけを対象にする。

### 4.5 集約型の雇用・産業能力（後半 Phase）

個人を全員追跡する代わりに、burg または market に職業 cohort を保持する。

```ts
type StrategicOccupation = "forestry" | "sailmaking" | "ropeMaking" | "tarBurning" | "shipbuilding" | "trade";

interface LaborMarket {
  marketId: number;
  workersByOccupation: Partial<Record<StrategicOccupation, number>>;
  wageByOccupation: Partial<Record<StrategicOccupation, number>>;
  skillByOccupation: Partial<Record<StrategicOccupation, number>>;
  capacityByOccupation: Partial<Record<StrategicOccupation, number>>;
}
```

毎月または既存の生産周期ごとに、以下の順で更新する。

1. 開放注文、通常需要、販売価格、原料費から職業別の期待利益と求人を計算する。
2. 労働者は期待賃金、失業、技能不一致、転職コストに従い、上限人数だけ別職種へ移る。
3. 同じ高採算が複数周期続くと、事業者は capacity を増やす。低採算が続くと縮小する。
4. 生産量は `workers * skill * capacity` を上限に、既存 recipe と市場在庫を使って決める。

為政者の政策は、買上価格・訓練速度・輸送費・保管可能量を変える。労働者や工場の出力を直接増やさない。

## 5. 実装マイルストーン

### M9.0 — 観測と較正（実装済み: warm-up を除く）

- Shipyards Overview または Economy の専用画面に、材料別の在庫、年間予測需要、目標備蓄、輸送中量、供給地 state を表示する。
- 新規生成時の材料在庫を観測し、必要なら「通常生産数周期に相当する初期在庫」または経済 warm-up を導入する。**未実装**。
- 造船所ごとの `BUILD_POINTS_PER_YEAR` と材料レシピから年需要を一箇所で算出する。

受け入れ: Shipyards Overview で、在庫不足・輸送中量・供給元 state・経路不通・政策禁止・国庫不足を読める。

### M9.1 — 敵対国禁輸と国内優先スコア（実装済み）

- 市場中心 burg の state と外交状態から取引関係を導出する純粋関数を追加する。
- 造船材料について、Enemy 関係の市場間取引を禁止する。
- 同一国家の候補を外国候補より優先する調達用スコアを実装する。通常の投機交易の挙動は変更しない。

受け入れ: 敵対国の安い Tar が存在しても、国家所有造船所向け注文は生成されない。同一国家内の複数候補では着地価格と距離で選ばれる。

### M9.2 — 国家の戦略調達注文（実装済み: 取消 UI を除く）

- `ShipbuildingStrategicProcurementDemand` を Shipbuilding から通知するイベントを設計する。
- Economy に `StrategicProcurement` を追加し、注文作成、供給地選定、Deal/Caravan 起票、到着、損失を所有させる。取消 UI は未実装。
- state treasury を支払元とし、国庫不足・経路なし・国内供給なしを明示的に記録する。
- state-owned queue のみを対象にする。market-owned queue の商会資金は後続 Phase に分離する。

受け入れ: 国内在庫があれば国内候補を外国候補より優先して Caravan が起票され、到着後にだけ造船所市場の在庫と進捗が回復する。国庫不足では在庫を生成しない。

### M9.3 — 造船材料の需要駆動生産（実装済み）

- `strategicProductionDemand.ts` が未充足注文を市場ごとの Good id → 残量・継続回数へ集約し、
  `Production.produce()` の各 burg の生産候補へ渡す。`open` / `assigned` / `blocked` は到着市場、
  `inTransit` は在庫を実際に輸出した供給市場の補充需要として扱う。`fulfilled` / `cancelled` は除外する。
- burg に最高優先の人口需要が残る間、戦略需要の倍率は 1 のままとする。既存の人口需要優先を下げず、
  その需要が満たされた余力でのみ戦略注文を候補の期待売上へ上乗せする。
- 上乗せ倍率は未充足量と `priorityCycles` に比例し、過大な単一注文が全労働者を固定しないよう上限を持つ。
- 生産計画・実行は既存の `planGoodAction()` と `executeManufacture()` を通る。最終財の recipe と原料在庫／
  市場購入が成立しなければ候補は不成立または製造失敗となり、戦略注文だけで資材を生成しない。

受け入れ: 継続的な国内発注により、Sails / Ropes / Tar の生産が既存 recipe を通じて増える。原料が不足すれば最終財を魔法のように増やさない。

### M9.4 — 集約型の職替え・設備投資

- `LaborMarket`、職業別賃金、技能、capacity を追加する。
- 転職速度、訓練、事業拡張を月次/生産周期で更新する。
- 政策として国内買上補助、職人育成、道路/港/倉庫投資、森林保全を追加する。

受け入れ: 高い造船材料需要は時間をかけて関連職の人数・賃金・生産能力を上げる。政策停止後は、収益性に応じて縮小または他産業へ転換する。

## 6. テスト計画

| 層 | 検証 |
| :--- | :--- |
| Pure unit | **実装済み**: 外交関係→取引可否、tier順の供給地選定、年間需要・365日目標備蓄、国庫不足。 |
| Economy integration | **実装済み**: 国内供給が敵国供給より優先されること、Enemy だけが供給可能なら注文が blocked になること、Caravan 到着まで在庫が増えないこと、重複需要で active order が増えないこと。 |
| Production integration | **実装済み**: 未充足注文の市場別集約、輸送済み供給地の補充需要、fulfilled/cancelled 除外、人口需要が未達のときの戦略倍率抑制、継続注文の優先度上昇。実際の recipe 実行は既存の生産計画・原料購入ゲートを再利用する。 |
| Simulation regression | 日次 Advance Time と一括 Advance Time で、資材や国庫が負にならず、同一注文が重複起票されないこと。 |
| E2E | UI で政策・注文・輸送中・停止理由を確認し、敵国材に依存せず国内補給で造船が再開すること。 |

## 7. 非目標と後続課題

- 市場所有の商船キューの資金・商会融資・配当
- 個々の平民の家計、居住地、家族、完全な職歴
- 密輸、封鎖、私掠、外交交渉による通商協定
- すべての Good への輸出入規制の適用
- 港湾収容力を建造停止条件にすること

これらは、国家所有の造船調達と集約雇用モデルが安定した後に扱う。特に密輸は「敵対国との取引禁止」が
実装されて初めて、例外として意味を持つ。

## 8. 実装状況と残る確認事項

1. **確認・実装済み**: state treasury は生産周期ごとに再計算される。注文時に引き落とし、支出を次回の税収計算へ一度だけ繰り越す。
2. **確認・実装済み**: `Enemy` は両方向検査で禁輸、state 0 は中立として扱う。Enemy 以外の外交ラベルを個別に区別する通商政策は未実装。
3. **確認・実装済み**: `Deal` と Caravan payload に `purpose`、支払 state、戦略注文 id を追加した。
4. **確認・実装済み**: 未充足注文は通常人口需要を抑えずに生産候補の期待利益へ反映する。輸送中注文は供給市場の補充需要、blocked/open/assigned 注文は到着市場の供給需要として扱う。
5. **未決定**: 新規マップ初期在庫を、生成時の過去シミュレーションと明示的な備蓄のどちらで作るか。
6. M9.4 の `LaborMarket` を Economy の永続 world data に置くか、Economy 拡張データとして保存・復元するかを決める。
