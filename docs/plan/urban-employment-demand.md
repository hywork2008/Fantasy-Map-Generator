# 都市雇用モデル: `employmentDemand` による実雇用駆動の都市吸引力

最終確認: 2026-07-30

## 0. 決定記録

**2026-07-30 決定（§5の回答を反映）**: §5の未決定事項に対し、次の方針で確定した(詳細は§5.1)。

1. 鉱業・製錬雇用は§3.2案どおりBurgアンカー型で実装する。`LaborMarket`のMarket圏cohortには統一しない。
2. Burg単位の産業労働力上限（鉱業・製錬・造船戦略労働・港湾交易が共有する成人比率の上限）は設けない。食料供給（`effectiveCapacity`）が支える限り、人口増加に伴って住宅建設等の雇用も増えてよいという想定。
3. `serviceMultiplier`の初期値は史料的正確性を求めすぎず、調整前提の「それらしい」値を先に入れる。
4. `employmentDemand`から`urbanLaborIntake`への接続は総量駆動（§3.6前者案）とする。
5. 行政雇用はまず州の人口とBurg数に比例させる。治安維持のための衛兵人員も行政雇用に含める想定。
6. 港湾・交易雇用の初期需要指標はCaravan到着量のみとする（`BurgMarketLedger`・`searoute`本数は後続）。積荷の積み替えに人足が必要という前提を式に反映する。

**2026-07-30 設計確定（§6不変条件の補足）**: `MineOperation.workers`/`SmelterOperation.workers`は、Burgの総人口を実際に増減させる実体ではなく、**Burgの既存成人人口のうち何人がその仕事に従事しているかという内訳（サブセット）**として扱う。既存の`LaborMarket`（`strategicLaborMarkets.ts`、§2.3）が「Burg人口を物理的に減らさない、内部比率のみ」という設計であるのと同じ会計原則に揃え、二重計上・人口消失のリスクを避ける。したがって`workers`の増減はBurgの`population`/`demographics`を書き換えない。`employmentDemand`の総量が`urbanLaborIntake`を実際に動かす（Burg人口を増やす）のはPhase 4で`employmentDemand`と`urbanLaborIntake`を接続したときが最初になる。§6の該当文はこの解釈に修正する。

**2026-07-30 実装状況**: Phase 1（鉱業・製錬雇用のBurg接続）を実装した。`MineOperation.workers`/`SmelterOperation.workers`は、その施設が立地するBurgの現有成人人口（`getBurgDemographics`で読み取り）から按分される内訳として、新しい年次リコンサイル`reconcileAnnualIndustrialWorkers()`（`basicEmployment.ts`）により毎年緩やかに目標値へ追随する。同一Burgに複数の鉱山・製錬所がある場合は共有の成人プールを奪い合う（上限は設けない＝決定2）。`workerFactor`（`produceMonth()`の抽出・製錬効率）は、この`workers`と「フル稼働に必要な労働力」（鉱山は既存の`4 + richness * 6`、製錬所は新設の`4 + annualCapacityTons * 0.05`）の比で決まるため、Burgの成人人口が不足しているBurgでは初めて意味のある値になる。Phase 2以降（港湾・交易雇用、行政・首都雇用、サービス業雇用、`employmentDemand`集計とurbanLaborIntakeへの接続）は未着手。

## 1. 目的

[megacity-food-import-economy.md](megacity-food-import-economy.md)は、食料輸入と農業労働力の分離により、農村から都市へ人と食料を送る土台（`releaseRuralLaborSurplus`、`UrbanLaborIntake`、`FrontierExpansion`のプール連携、野盗ライフサイクル）を実装した。しかし、その土台がまだ答えていない問いが残っている。**都市へ送られた人は、着いた先で何をして生きるのか。**

大都市が大都市であるためには、農村から人を受け入れるだけでなく、その人たちが従事できる**実際の仕事**が要る。現状のBurgは、鉱山・製錬所という一次・二次産業の施設を持ちながら、それらが都市の雇用先として機能していない。都市人口が増えても、飲食店・宿・工房のような三次産業（サービス業）が自然に生まれる下地がない。これは経済学の基盤産業（basic industry：外部から資金を稼ぐ輸出産業）と非基盤産業（non-basic industry：域内の労働者・住民に対してサービスを提供する産業）の関係そのものであり、非基盤産業（飲食・宿・小売）は基盤産業（鉱業・製錬・交易・行政）の雇用が生む所得を追いかける形で成長する。基盤産業なしに都市だけを人口で膨らませても、その人口を支える所得の裏付けがない。

本書は、鉱業・製錬・港湾交易・行政という基盤産業の実雇用を`employmentDemand`として計算し、現在Burg人口の年率2%固定式でしかない`calculateAnnualUrbanLaborIntake`（[urbanLaborIntake.ts:299](../../src/extensions/economy/generators/urbanLaborIntake.ts#L299)）を、この実雇用に基づく受け入れ枠へ置き換える計画を立てる。

## 2. 現状と問題

### 2.1 都市受け入れ枠は人口自己参照の暫定式

```ts
// calculateAnnualUrbanLaborIntake — urbanLaborIntake.ts:299
const remainingCapacity = Math.max(0, capacity - population);
return Math.min(
  remainingCapacity,
  population * intakeRate /* 0.02 */ * businessCycle /* 0.5〜1.5 */ * localVariation /* 0.85〜1.15 */
);
```

入力は「今のBurg人口」「State単位の景気サイクル（乱数）」「Burgごとの地域差（乱数）」「食料が支える`effectiveCapacity`の残余」だけである。鉱山があるか、港が交易路に繋がっているか、首都かどうかは一切関係しない。megacity-food-import-economy.mdは当初からこれを承知の暫定式として明記していた。

> **決定**（megacity-food-import-economy.md §4.1）: 現段階の`settlementDevelopmentPotential`は移住先の順位付けだけに使い、年次`urbanLaborIntake`の総量を増やさない。受入枠は当面、Burg人口の年率2%に景気変動・空き容量を掛ける暫定式を維持する。資源・首都・港・水運・交易が何人を雇用するかは、静的立地とは別の`employmentDemand`として後続フェーズで導入する。

> **後続の課題**（同 §8）: 都市吸引力は、まず明示的な`employmentDemand`（資源採掘、港湾、水運、交易、行政、首都機能）の合計で`urbanLaborIntake`を置換する。賃金、地代、階層、Characterの選好はその後に追加する。

### 2.2 鉱業・製錬は物資フローのみで、人口と結び付いていない

`MineOperation.workers`（[mineOperations.ts:167](../../src/extensions/economy/generators/mineOperations.ts#L167)）は`4 + deposit.richness * 6`という、鉱床の豊かさから決まる固定値であり、生成後に一切変化しない。`produceMonth()`（同 L105）はこれを`workerFactor = min(1, operation.workers / (4 + richness * 6))`として使うが、分母と分子が定義上ほぼ同じ値のため、`workerFactor`は実質的に常に`1`である。Burgの人口・成人バケットを読み書きする箇所は`findNearestBurgId`（同 L136、`burgId`を割り当てるためだけ）しかない。`SmelterOperation`（[smelterOperations.ts](../../src/extensions/economy/generators/smelterOperations.ts)）も同様に`burgId`は持つが、労働者数の概念自体を持たない。

つまり、`MineOperation`/`SmelterOperation`は「鉱床がある」「製錬所がある」という物理的存在と物資フローだけをモデル化しており、それが**誰かの仕事**であるという側面を一切表現していない。

### 2.3 人口を消費する職業cohortパターンは既に存在するが、造船専用

[strategicLaborMarkets.ts](../../src/extensions/economy/generators/strategicLaborMarkets.ts)の`LaborMarket`は、Market圏Burg人口の30%（`WORKFORCE_SHARE`）を「戦略労働力」とし、`forestry`/`sailmaking`/`ropeMaking`/`tarBurning`の4職種（`STRATEGIC_OCCUPATIONS`）へ、未充足の戦略調達注文の需要に応じて再配分する。1周期あたり最大5%（`MAX_TRANSFER_SHARE_PER_CYCLE`）しか職種間移動せず、需要のある職種は技能・設備capacityが緩やかに向上し、生産性倍率（`getStrategicLaborProductivity`）として既存recipeの出力へ反映される。

この設計は[shipbuilding-industrial-policy.md §4.5](shipbuilding-industrial-policy.md#45-集約型の雇用産業能力後半-phase)で先に決定・実装されたもので、同節はコメントで`"shipbuilding" | "trade"`を将来の追加職種として明示している（鉱業・製錬は挙がっていない）。重要な性質として、`LaborMarket`はBurg人口を**物理的に減らさない**。あくまで「その人口のうち何%がどの職に向いているか」という内部比率であり、生産性倍率の計算にのみ使う。都市の受け入れ枠（`urbanLaborIntake`）とは接続されていない。

### 2.4 `settlementDevelopmentPotential`は雇用量ではなく立地の点数

[developmentPotential.ts:136](../../src/extensions/economy/generators/developmentPotential.ts#L136)の`calculateSettlementDevelopmentPotential`は、河川・港・交易結節の数、未枯渇鉱床の豊かさ、首都・港・広場ボーナスを単純加算した**静的なスコア**である。鉱床が実際に採掘されているか、港が実際に交易路へ繋がっているかは問わない。移住先・新Burg昇格候補の順位付けにのみ使われ（Phase 4の未実装項目）、雇用量の計算には使われていない。これは意図的な分離であり（§2.1引用の決定）、本書が作る`employmentDemand`は`settlementDevelopmentPotential`を置き換えるのではなく、「実際に稼働している」経済活動から別途算出する。

### 2.5 まとめ: 何が欠けているか

| 産業 | 現状 | 欠けているもの |
| --- | --- | --- |
| 鉱業 | `MineOperation`は物資フローのみ、`workers`は固定値で人口と無関係 | 実人口を消費する採掘労働力、鉱山閉山・新規開山時の雇用増減 |
| 製錬・加工（鍛冶相当） | `SmelterOperation`に労働力概念なし。一般`Production`（recipe変換）も労働力を消費しない | 原料→製品の加工に伴う雇用 |
| 港湾・交易 | Caravan・searoute・`BurgMarketLedger`は交易量を追跡するが、雇用への変換なし | 港湾労働者・商人の雇用 |
| 行政・首都機能 | `burg.capital`フラグのみ。`settlementDevelopmentPotential`に加点はあるが雇用ではない | 行政職の雇用 |
| サービス業（飲食・宿など） | 存在しない | 基盤産業雇用に追随して生まれる非基盤雇用 |
| 都市受け入れ枠 | 人口の年率2%固定 | 上記`employmentDemand`の合計、またはその**増分**で駆動 |

## 3. 目標モデル

### 3.1 状態の責務

| 状態 | 所有者 | 単位 | 意味 |
| --- | --- | --- | --- |
| `MineOperation.workers` | economy（既存フィールドの意味変更） | 人口ポイント | その鉱山で実際に働く成人数。鉱床の豊かさは採掘可能な**上限**を決めるだけで、実際の雇用は需要・労働力供給から決まる。 |
| `SmelterOperation.workers` | economy（新規フィールド） | 人口ポイント | その製錬所で実際に働く成人数。 |
| `portTradeEmployment[burgId]` | economy simulation | 人口ポイント | 港湾荷役・商人としての雇用。交易量から導出。 |
| `administrationEmployment[burgId]` | economy simulation | 人口ポイント | 首都・州都としての行政雇用。 |
| `basicEmploymentDemand[burgId]` | economy simulation | 人口ポイント | 鉱業・製錬・港湾交易・行政の合計（基盤雇用）。 |
| `serviceEmploymentDemand[burgId]` | economy simulation | 人口ポイント | 基盤雇用に追随して生まれる非基盤雇用（飲食・小売・宿など）。 |
| `employmentDemand[burgId]` | economy simulation | 人口ポイント | `basicEmploymentDemand + serviceEmploymentDemand`。`annualUrbanLaborIntake`の入力になる。 |

### 3.2 鉱業・製錬雇用 — Burgアンカー型で実装する（`LaborMarket`は流用しない）

**推奨（要確認）**: 鉱業・製錬の雇用は、`LaborMarket`のMarket単位cohortパターンには乗せず、`MineOperation`/`SmelterOperation`が既に持つ`burgId`アンカーをそのまま使う。理由は次の通り。

- `MineOperation`/`SmelterOperation`は生成時点で既に「最も近いBurg」（`findNearestBurgId`）に紐付いている。Market圏全体で按分し直す`LaborMarket`の抽象化は、この既存の1対1関係を壊してBurg単位の`employmentDemand`へ再集約する余分な変換を要求する。
- `LaborMarket`の戦略職（forestry等）はMarket圏に**複数存在しうる同種資源**（森林）を対象にした設計であり、Marketレベルの按分が自然だった。鉱山・製錬所は個々の施設が既に離散的・Burgアンカー型であり、同じ抽象化を必要としない。
- ただし、**将来`"trade"`職種を`LaborMarket`へ追加する**という[shipbuilding-industrial-policy.md §4.5](shipbuilding-industrial-policy.md#45-集約型の雇用産業能力後半-phase)の既存コメントとは矛盾しない。港湾・交易雇用（§3.3）はMarket圏に対して按分する性質が強いため、そちらは`LaborMarket`の`"trade"`職種として実装するのが整合的である。

初期式（要確認・数値は暫定）:

```text
desiredWorkers = min(
  extractionCapacityWorkers,  // yieldInfo.annualCapacityTons から逆算する採掘可能上限
  availableBurgAdults × MAX_INDUSTRIAL_WORKFORCE_SHARE  // Burg成人のうち鉱業へ割ける上限比率
)
workers += clamp(desiredWorkers - workers, -maxAnnualChange, +maxAnnualChange)  // 年次で緩やかに追随
workerFactor = min(1, workers / requiredWorkersForFullExtraction)
```

`requiredWorkersForFullExtraction`は現行の`4 + deposit.richness * 6`を「フル稼働に必要な労働力」として転用できる（現状は自己参照で無意味だが、意味を持たせ直せる）。`availableBurgAdults`は`burg.demographics.maleAdults + femaleAdults`から、農業労働力と同様に安全余力を残す（[population-food-supply.md](../simulation/population-food-supply.md)の`FARM_LABOUR_SAFETY_MARGIN`に相当する概念を都市労働にも導入するか要検討）。

`MAX_INDUSTRIAL_WORKFORCE_SHARE`のような「Burg成人のうち工業へ割ける上限比率」は、`strategicLaborMarkets.ts`の`WORKFORCE_SHARE = 0.3`と役割が重なる。単一のBurgが鉱業・製錬・造船戦略労働・港湾交易のすべてで人口を奪い合う可能性があるため、**Burg単位の産業労働力上限（例: 成人の50〜70%）を先に決め、鉱業・製錬・造船戦略労働がその枠を分け合う**設計にすべきか、次セッションの決定事項とする。

### 3.3 港湾・交易雇用 — `LaborMarket`へ`"trade"`職種を追加する

[shipbuilding-industrial-policy.md](shipbuilding-industrial-policy.md)が既に`"trade"`をコメントで予告している通り、`LaborMarket`へ`trade`（または`portLabor`）職種を追加し、Market圏の交易量（`Caravans`の到着量、`BurgMarketLedger`の取引実績、`searoute`接続の有無）から需要を計算する。既存の`getDesiredWorkers`/`moveWorkersTowardDemand`の仕組みをそのまま再利用できる。

初期の優先順位は既存の§5.2（megacity-food-import-economy.md）と揃える。

1. 稼働中の資源事業（鉱業・製錬、本書§3.2）
2. 河川水運
3. 海路へ実際に接続した港（`port && searoute`）
4. 道路・市場による陸上交易

### 3.4 行政・首都雇用

`burg.capital`（州都・首都）を持つBurgに、Stateの人口・領域規模に応じた行政雇用を加える。既存の`getBurgLocationBonus`（[developmentPotential.ts:164](../../src/extensions/economy/generators/developmentPotential.ts#L164)）が`capital`に静的加点しているのと役割を分けること — あちらは移住先の魅力度、こちらは実際の雇用者数。初期式は最も単純に「Stateの総人口 × 小さな定数比率」から始めることを推奨する（詳細は次セッションで決定）。

### 3.5 サービス業雇用（非基盤雇用）— ユーザーの洞察をそのまま式にする

基盤雇用（鉱業・製錬・港湾交易・行政の合計）に対して、一定の乗数でサービス業雇用を派生させる。経済地理学の「経済基盤乗数（economic base multiplier）」の考え方をそのまま流用する。

```text
serviceEmploymentDemand[burgId] = basicEmploymentDemand[burgId] × serviceMultiplier
employmentDemand[burgId] = basicEmploymentDemand[burgId] + serviceEmploymentDemand[burgId]
```

`serviceMultiplier`の値は要確認。前近代都市では非基盤（サービス・小売・职人）人口が基盤人口と同程度かそれ以上になることが多いが、飲食店という業態そのものが近世以降に一般化した点には注意する（中世都市の「サービス業」は宿・酒場・市場仲買・職人が中心）。初期値として1.0〜2.0の範囲を検討し、史料的裏付けは次セッションの調査課題とする。

### 3.6 `employmentDemand`から`urbanLaborIntake`への接続

**決定が必要**: 受け入れ枠を`employmentDemand`の**総量**で置き換えるか、**増分**（前年比の増加分）で駆動するかを決める。

- 総量で置き換える案: `annualUrbanLaborIntake = min(effectiveCapacity - population, max(0, employmentDemand - currentEmployedPopulation))`。雇用に対して人口が既に過剰なら受け入れを止める。
- 増分で駆動する案: `annualUrbanLaborIntake = min(effectiveCapacity - population, max(0, employmentDemand_thisYear - employmentDemand_lastYear))`。新規雇用創出だけが移民を呼ぶ。

前者は「未充足の雇用がある限り都市は成長を続ける」という当初のmegacity構想に近く、後者は「新しい産業が興きた時だけ都市が伸びる」というより保守的な成長モデルになる。既存の暫定式（`population × 2%`）は前者に近い性質（既存人口起点の緩やかな自己成長）を持つため、**後方互換的には前者寄りの式を推奨する**が、無制限の都市肥大化を防ぐ安全弁（`effectiveCapacity`は既にあるが、雇用側にも上限が必要か）は次セッションで検討する。

## 4. 実装フェーズ（暫定・次セッションで確定）

進捗はコードとテストで確認できる状態だけを`[x]`とする。

### Phase 1 — 鉱業・製錬雇用をBurgへ接続する

- [x] `MineOperation.workers`を「フル稼働に必要な労働力」に対する実雇用（Burg成人人口の内訳、§0参照）として再定義し、Burgの成人バケットから年次で緩やかに増減させる。既存の`4 + deposit.richness * 6`を必要労働力の基準値として転用する（`getMineRequiredWorkers`）。
- [x] `SmelterOperation`に`workers`フィールドを追加し、同様の年次雇用調整を行う（必要労働力は`4 + annualCapacityTons * 0.05`、要校正）。
- [x] 一Burgが複数の産業（鉱業・製錬）で人口を奪い合う際の割当順序を実装する。決定2により上限は設けず、同一Burg内では鉱山を製錬所より先に割り当てる（`basicEmployment.ts`）。造船戦略労働・港湾交易との共有はPhase 2以降で対応する。
- [ ] `farmLaborRequired`/`migratableAdults`との整合性を確認する。都市に移住した成人が鉱業・製錬労働力の供給源になるため、農村側の安全余力とは別に「都市成人のうち何割が実際に雇用されているか」を追跡する。

### Phase 2 — 港湾・交易雇用

- [ ] `LaborMarket`（`strategicLaborMarkets.ts`）へ`trade`（または`portLabor`）職種を追加する。
- [ ] Market圏の交易量（Caravan到着量、`BurgMarketLedger`実績、`searoute`接続）から需要を算出する。
- [ ] 既存の優先順位（河川水運 > 海路接続港 > 陸上交易）を需要重みへ反映する。

### Phase 3 — 行政・首都雇用とサービス業雇用

- [ ] 首都・州都Burgの行政雇用を実装する。
- [ ] `serviceEmploymentDemand`（基盤雇用への乗数）を実装する。乗数の初期値を史料・既存前近代都市の職業構成データから校正する。

### Phase 4 — `employmentDemand`を`urbanLaborIntake`へ接続する

- [ ] `basicEmploymentDemand` + `serviceEmploymentDemand` = `employmentDemand`を集計する。
- [ ] §3.6の「総量駆動」か「増分駆動」かを決定し、`calculateAnnualUrbanLaborIntake`を置き換える。既存の`businessCycle`/`localVariation`は雇用創出速度の揺らぎとして残すか、雇用側の乱数（需要変動）と重複しないか確認する。
- [ ] `ruralUrbanMigration`オプション（[optionsState.ts](../../src/store/optionsState.ts)の`"independent" | "megacity"`）がoffの間は本モデルを一切評価しないことを確認する回帰テストを追加する。

### Phase 5 — UI・可視化・バランス

- [ ] Burg詳細に基盤雇用・サービス業雇用の内訳を表示する。
- [ ] 既存のFrontier Status panel・Tools panelと同様の透明性で、`employmentDemand`の内訳をデバッグ表示できるようにする。
- [ ] seed固定シナリオで、鉱山を持つ都市と持たない都市の成長曲線を比較し、乗数・上限値を調整する。

## 5. 未決定事項（次セッション冒頭で確認する）

1. 鉱業・製錬雇用をBurgアンカー型（§3.2案）にするか、`LaborMarket`のMarket圏cohortに統一するか。
2. Burg単位の産業労働力上限（鉱業・製錬・造船戦略労働・港湾交易が共有する成人比率の上限）をいくつにするか、そもそも共有上限を設けるか。
3. `serviceMultiplier`の初期値と、前近代都市の職業構成に関する史料的根拠。
4. `employmentDemand`を総量駆動にするか増分駆動にするか（§3.6）。
5. 行政雇用の具体的な算出式（Stateの何に比例させるか: 人口、Burg数、Provinces数など）。
6. 港湾・交易雇用の需要をどの既存データ（Caravan到着量、`BurgMarketLedger`、`searoute`本数）から導出するか。

### 5.1 意思決定

1. Burgアンカー型
2. (食料供給がある限り)上限を儲けない。人口が増える間は住宅建設等の仕事も増えて良い。
3. serviceMultiplierの値は調査してからそれっぽく見える値を入れておいて、調整前提で正しさは求めすぎなくて良い。
4. 総量駆動
5. まずは人口とBurg数。治安維持の為の衛兵も必要と思われる。
6. Caravan到着量のみでスタート。積荷を載せ替える人足が必要。

## 6. 不変条件（暫定）

- economy無効時、または`ruralUrbanMigration`が`"independent"`の間は、本モデルは一切評価されず、既存の人口自己参照式のみが使われる。
- `MineOperation`/`SmelterOperation`の`workers`は、Burgの`population`/`demographics`を書き換えない内訳（サブセット）である（§0の設計確定）。`getBurgDemographics`（`demographicTransfer.ts`）は読み取り専用で使い、Burg人口の複製・消滅を起こさない。Burg人口そのものを動かすのはPhase 4で`employmentDemand`を`urbanLaborIntake`に接続した後。
- `employmentDemand`は決定的に再計算し、保存データとしては経済拡張スライス（`simulation.extensions.economy`）に留める。core `pack`スキーマは増やさない。
