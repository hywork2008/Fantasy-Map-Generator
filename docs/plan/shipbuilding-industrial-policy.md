# Shipbuilding Phase 9 — 国内戦略調達と産業循環

| 項目 | 内容 |
| :--- | :--- |
| Status | Draft — implementation plan |
| Parent | [shipbuilding.md](shipbuilding.md) Phase 9 |
| Prerequisite | Phase 8 の資材消費ゲート |
| Scope | 国家の造船需要を国内優先の調達・交易・生産・集約型雇用へ接続する |

## 1. 目的

Phase 8 により、造船所は所属市場に Wood / Sails / Ropes / Tar が同時に存在するときだけ進むようになった。
しかし現在の Economy は、造船材料の不足を将来需要として生産者・商人に通知しない。その結果、造船所は
在庫を待つだけで、通常の時間経過だけでは必要な産業と流通が育ちにくい。

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
| 造船 | `shipyardQueue.ts` が市場在庫を原子的に消費する。 | 不足しても次期需要を Economy に表せない。 |
| 生産 | `Production.produce()` は通常の人口需要と既存 recipe をもとに労働を配分する。 | 造船材料の戦略的な不足は、生産判断へ入らない。 |
| 交易 | `Markets.runGlobalTrade()` は在庫・価格差・輸送費・日数・商会到達範囲で取引を選ぶ。 | 同一国家優先・敵対国禁輸の判断がない。 |
| 物流 | Caravan は出発時に輸出元 stock を減らし、到着時に輸入先 stock を増やす。 | 戦略調達として予約・追跡・国庫決済する経路がない。 |
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
- `alliesAndNeutral`: 国内を優先し、国内が不十分なときだけ非敵対国へ広げる。
- `unrestricted`: 敵対国以外を着地価格順で選ぶ。初期値にはしない。
- `enemyTrade: "prohibited"` は初期 Phase 9 では固定とする。密輸・封鎖突破は将来の外交・諜報 Phase で扱う。

通常の民間交易にも敵対国禁輸を適用するかは明示的に選ぶ必要がある。最初の実装では、**戦略物資だけ**を禁輸し、
食料などすべての交易を一度に政治化しない。

### 4.2 調達需要・注文・輸送

造船所は実際の消費結果ではなく、潜在建造速度から予測需要を出す。現在の `BUILD_POINTS_PER_YEAR = 2` では
Sloop基準の造船所1つあたりの年間需要は Wood/Sails/Ropes 各 0.4、Tar 0.2 である。

```ts
interface StrategicProcurementDemand {
  stateId: number;
  destinationMarketId: number;
  source: "shipbuilding";
  goodId: number;
  annualDemand: number;
  targetStock: number;
  priority: number;
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
}
```

`targetStock` は `annualDemand * targetReserveDays / 365` を基本とし、短期の品切れを防ぐ。初期値は 365〜730日を
候補とするが、マップ規模と実測生産量に基づく調整が必要である。

注文は Economy が所有する。Shipbuilding は「どの state の、どの市場に、どの資材が、どれだけ必要か」だけを通知し、
Economy は在庫、供給地、経路、Caravan、国庫決済を一貫して更新する。

### 4.3 供給地選択

候補市場を次の tier で探索する。

1. 到着市場自身の利用可能在庫
2. 同一 state の市場
3. 同盟・中立 state の市場（方針が許す場合のみ）

各 tier 内では、通常市場の安全在庫を差し引いた利用可能量を対象に、次の順で選ぶ。

1. 経路が存在し、`maxProcurementDays` 以下であること
2. 着地価格が低いこと
3. 到着日数が短いこと
4. 供給余力が大きいこと

敵対関係は、両市場の中心 burg の `state` と外交状態から判定する。無所属市場（state 0）は中立として扱うが、
将来は海賊・封鎖・関税を別途導入する。

選定された注文は既存の `Deal` / Caravan 経路を再利用できるなら再利用する。通常の投機交易と区別が必要なら
`Deal` に `purpose: "strategicProcurement"` と `payerStateId` を追加し、Caravan が到着したときに注文を完了へ進める。
輸出元 stock は出発時、輸入先 stock は到着時に変わるという現在の物理モデルを壊さない。

### 4.4 国庫と国内循環

国家は注文の着地価格を支払う。最低限、以下を明確にする。

- 輸出元市場・burg は売却収益を得る。
- 国内取引であれば sales tax と生産者の収益が同一国家内へ残る。
- 外国取引であれば、購入額は輸出国側の収益となり、輸入国の国庫から流出する。
- `domesticPurchasePremium` は、外国品がわずかに安くても国内品を選ぶために国家が許容する追加負担である。
- 国庫不足なら注文は `insufficientTreasury` で停止し、在庫も造船進捗も増えない。

Phase 8 では資材消費を無償の物理消費とした。Phase 9 で資金決済を導入する場合、既存キューの消費時課金と
調達時課金を二重にしない。**注文時に国庫が支払い、到着在庫は通常市場在庫として造船所が消費する**方式を採用する。
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

### M9.0 — 観測と較正

- Shipyards Overview または Economy の専用画面に、材料別の在庫、年間予測需要、目標備蓄、輸送中量、供給地 state を表示する。
- 新規生成時の材料在庫を観測し、必要なら「通常生産数周期に相当する初期在庫」または経済 warm-up を導入する。
- 造船所ごとの `BUILD_POINTS_PER_YEAR` と材料レシピから年需要を一箇所で算出する。

受け入れ: 「なぜ止まっているか」を、在庫不足・輸送中・経路不通・政策禁止・国庫不足に分けて読める。

### M9.1 — 敵対国禁輸と国内優先スコア

- 市場中心 burg の state と外交状態から取引関係を導出する純粋関数を追加する。
- 造船材料について、Enemy 関係の市場間取引を禁止する。
- 同一国家の候補を外国候補より優先する調達用スコアを実装する。通常の投機交易の挙動は変更しない。

受け入れ: 敵対国の安い Tar が存在しても、国家所有造船所向け注文は生成されない。同一国家内の複数候補では着地価格と距離で選ばれる。

### M9.2 — 国家の戦略調達注文

- `StrategicProcurementDemand` を Shipbuilding から通知するイベントまたは汎用登録 API を設計する。
- Economy に `StrategicProcurement` を追加し、注文作成、供給地選定、Deal/Caravan 起票、到着、取消を所有させる。
- state treasury を支払元とし、国庫不足・経路なし・国内供給なしを明示的に記録する。
- state-owned queue のみを対象にする。market-owned queue の商会資金は後続 Phase に分離する。

受け入れ: 国内在庫があれば近い国内市場から Caravan が起票され、到着後にだけ造船所市場の在庫と進捗が回復する。国庫不足では在庫を生成しない。

### M9.3 — 造船材料の需要駆動生産

- 生産判断に、未充足の戦略調達注文を需要として加える。
- 通常の人口需要を下回らない安全制約を持つ。
- 注文が続く材料ほど、生産の期待利益・優先度が上がる。

受け入れ: 継続的な国内発注により、Sails / Ropes / Tar の生産が既存 recipe を通じて増える。原料が不足すれば最終財を魔法のように増やさない。

### M9.4 — 集約型の職替え・設備投資

- `LaborMarket`、職業別賃金、技能、capacity を追加する。
- 転職速度、訓練、事業拡張を月次/生産周期で更新する。
- 政策として国内買上補助、職人育成、道路/港/倉庫投資、森林保全を追加する。

受け入れ: 高い造船材料需要は時間をかけて関連職の人数・賃金・生産能力を上げる。政策停止後は、収益性に応じて縮小または他産業へ転換する。

## 6. テスト計画

| 層 | 検証 |
| :--- | :--- |
| Pure unit | 外交関係→取引可否、tier順の供給地選定、着地価格、国庫不足、目標備蓄計算。 |
| Economy integration | 国内供給が敵国供給より優先されること、Enemy だけが供給可能なら注文が blocked になること、Caravan 到着まで在庫が増えないこと。 |
| Production integration | 継続注文が材料生産の優先度を上げ、原料不足では生産を増やせないこと。 |
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

## 8. 実装前に確認する事項

1. state treasury の正本・更新周期を確認し、注文時支払いに耐えるかを決める。
2. `Enemy` 以外の外交状態（同盟・中立）の表現と、無所属市場の扱いを確認する。
3. 既存 Deal / Caravan に目的・支払者を拡張するか、戦略調達専用レコードを併設するかを決める。
4. 新規マップ初期在庫を、生成時の過去シミュレーションと明示的な備蓄のどちらで作るかを決める。
5. M9.4 の `LaborMarket` を Economy の永続 world data に置くか、Economy 拡張データとして保存・復元するかを決める。
