# 部門予算の支出効果と赤字解消レバー 設計（multi-ledger PR-17）

## 状態

**設計案。未実装。** [multi-ledger-fiscal-architecture.md](./multi-ledger-fiscal-architecture.md) PR-1〜PR-15完了後に残った§9のリスク「部門に金が溜まりゲームが緩む（将来の部門支出・年度リセット・L2への還流）」と、[state-treasury-department-budget.md](./state-treasury-department-budget.md) §8「未着手」項目4（軍事以外の部門支出の俸給以外のゲーム内効果）に対応する後続PR。本文書はその2箇所からリンクされる。

## 背景・目的

`docs/simulation/economy-market-accounting-audit.md`が扱う市場会計の整備、州人口比例の初期資金付与（2f65972b）に続き、`StateFiscalReportTab`（[StateFiscalReportTab.tsx](../../src/extensions/economy/ui/components/StateFiscalReportTab.tsx)）で四半期ごとの国家収支を可視化できるようになった。それでもなお赤字が解消しない州が残るため、赤字解消のプレイ上の選択肢がどれだけあるかを調査した。

現状プレイヤーが操作できる赤字対策レバーは実質的に次の2つのみである。

- 増税（`salesTax`/`pollTax`、[StatesEditorTreasuryTab.tsx](../../src/extensions/economy/ui/components/StatesEditorTreasuryTab.tsx)で編集可能）
- 軍の縮小（regiment数を減らし`getStateMilitaryUpkeep`を下げる）

これは民を敵に回す（増税）か軍を敵に回す（軍縮）かの二択に閉じており、「一律の維持費を細かく実装して、何を生かし何を殺すかの選択肢を増やしたい」という目的を満たさない。

### 調査で判明した構造的原因

[allocateTreasury()](../../src/extensions/economy/generators/treasuryAllocation.ts#L580)は`state.form`ごとの固定比率（`BASELINE_ALLOCATION_BY_FORM`、[treasuryAllocation.ts:27-47](../../src/extensions/economy/generators/treasuryAllocation.ts#L27-L47)）で、その周期の`domesticIncome`（pollTax×population + voyage収入）の**合計100%**を6部門へ配分する（例: Monarchy = marshalcy35 + household25 + chancery15 + stewardship12 + spymastery5 + ecclesiastica8）。つまり`state.treasury`にpollTax収入がそのまま残ることは設計上ない。税率をどう上げても、天引き後にtreasuryへ戻る額は変わらない——treasuryの純増分は実質`salesTax`（取引税）と公債収入だけであり、交易網が薄い国はここが必然的に細り赤字化する。

さらに、Marshalcy以外の4部門（Chancery/Stewardship/Spymastery/Ecclesiastica）は[payCentralOfficeStipends()](../../src/extensions/economy/generators/treasuryAllocation.ts#L376-L400)による官職者個人給（部門予算の`CENTRAL_OFFICE_PERSONAL_SHARE`=12%、floor/cap付き）以外に一切の出口を持たない。残り約9割は`state.departmentBalances[key]`に**恒久的に死蔵**される（[treasuryAllocation.ts:343-369](../../src/extensions/economy/generators/treasuryAllocation.ts#L343-L369)）。ゲーム上の効果も、削減する手段も、削って何を失うかの表示もない。

対照的にMarshalcyだけは「必要額（`getStateMilitaryUpkeep`）÷配分額」の`militaryFundingRatio` → `militaryDiscontent`蓄積 → 閾値イベントというフィードバックが実装済みである（[treasuryAllocation.ts:157-192](../../src/extensions/economy/generators/treasuryAllocation.ts#L157-L192)）。本設計はこの3点セット（客観的な参照値 → 充足率 → 逼迫時の帰結）を他4部門へ、部門の性質に合わせて翻訳しながら複製する。

## 関連文書

| 文書 | 関係 |
| :--- | :--- |
| [state-treasury-department-budget.md](./state-treasury-department-budget.md) | 6部門配分テーブル・Marshalcy充足率の元設計。本文書はその§8項目4を実施する |
| [multi-ledger-fiscal-architecture.md](./multi-ledger-fiscal-architecture.md) | L0-L3aの4層会計、PR-1〜PR-15。本文書はPR-17として続く |
| [docs/simulation/economy-market-accounting-audit.md](../simulation/economy-market-accounting-audit.md) | Market側の会計境界。State側の会計境界は本文書とtreasuryAllocation.tsが正 |
| [character-wealth-balance.md](../analytics/character-wealth-balance.md) | 個人俸給梯子。官職者個人給（L3a→L0）は変更しない |

---

## 1. 設計方針

各部門に「必要額に代わる参照指標」「配分額との比較（充足率）」「逼迫時に蓄積するスコア」を定義し、そのスコアがゲーム内の別系統へ波及する。既存のMarshalcyパターンとの対応は次の通り。

| 要素 | Marshalcy（既存） | 他4部門（本設計） |
| :--- | :--- | :--- |
| 参照指標 | `getStateMilitaryUpkeep(state)`（実在兵力から算出） | 部門ごとに定義（§3参照。多くは「参照指標なし＝配分額そのものが効果量」でよい） |
| 充足率 | `militaryFundingRatio` | `state.departmentServiceLevel[key]`（新規、0〜1、後述） |
| 逼迫時スコア | `militaryDiscontent` | 部門ごとに個別スコア（既存の類似パターンへ極力接続し、新規スコアの乱立を避ける） |
| 閾値イベント | `fmg:military-discontent-threshold` | 部門ごとに`fmg:<department>-shortfall-threshold`（要否は§3で判定） |

新規データモデル（`models.ts`のState拡張、既存の`departmentBalances`と対になる形で追加）:

```typescript
interface State {
  // 既存: departmentBalances（L3a残高）
  /** 非marshalcy 4部門の充足率スナップショット（0〜1）。allocateTreasury()内で毎サイクル更新。 */
  departmentServiceLevel?: Partial<Record<"chancery" | "stewardship" | "spymastery" | "ecclesiastica", number>>;
  /** プレイヤーが設定した部門予算の倍率（0.5〜1.5想定）。未設定=1.0（baseline通り）。§4参照。 */
  departmentBudgetMultiplier?: Partial<Record<DepartmentBalanceKey, number>>;
}
```

`DepartmentBalanceKey`は既存の[treasuryAllocation.ts:293-296](../../src/extensions/economy/generators/treasuryAllocation.ts#L293-L296)の型をそのまま再利用する。4部門×固有フィールドを`State`直下に生やすとMarshalcyの3フィールド×4=12個の新規スカラーになり肥大化するため、`departmentServiceLevel`のような部門キー付きオブジェクトに集約する（`departmentBalances`が既にこの形を採用しているのでモデル上の一貫性もある）。

---

## 2. 部門ごとの接続設計

### 2.1 家宰府 Stewardship → 徴税効率・行政維持（最優先）

- **接続先**: [administrativeUpkeep](../../src/extensions/economy/generators/taxes-generator.ts#L152)（domesticIncomeの固定割合を天引きする既存コスト）と`getAcademyBonus(state.capital, "administration")`（既存の徴税効率ボーナス、[taxes-generator.ts:137](../../src/extensions/economy/generators/taxes-generator.ts#L137)）。
- **効果**: `departmentServiceLevel.stewardship`が低い状態が続くと、次サイクル以降`stateAdministrativeUpkeepShare`の実効値が上がる、または`administrationBonus`に乗る減衰係数が生まれる。
- **なぜこれが「増税では埋まらない穴」になるか**: 増税は当期のpollTax収入を増やすが、Stewardship逼迫による行政コスト増/徴税効率低下は**次期以降**に効くため、目先の増税だけでは相殺できない。プレイヤーは「今節約するか、将来の税収を守るか」という時間軸のトレードオフを持つことになる。
- **実装コスト**: 低。既存の`administrativeUpkeep`計算のすぐ隣に係数を足すだけで、新規のゲームシステムを起こさない。

### 2.2 諜報府 Spymastery → nobility拡張の諜報活動資金源

- **接続先**: nobility拡張の[espionage-generator.ts](../../src/extensions/nobility/generators/espionage-generator.ts) / strategic-planner.ts。grep確認済みで、現状これらにコスト・予算の概念が一切ない（諜報アクションは無償・無制限）。
- **効果**: `departmentServiceLevel.spymastery`（またはL3a `departmentBalances.spymastery`の残高そのもの）を諜報アクションの実行ゲート・成功率補正として消費する。枯渇すると諜報の実行頻度/成功率が落ち、敵国の動員・侵攻の予兆を見逃す、内部の謀反系イベント（既存のdebtCoup.ts等）を検知しにくくなる。
- **なぜ税・軍事と独立した第三軸になるか**: 金は減らないが「見えなくなる」という、増税にも軍縮にも代替できない情報コストを支払う設計になる。
- **実装コスト**: 中。nobility拡張とeconomy拡張は別バンドルだが、`treasuryAllocation.ts`が既に`nobility/data/titleTable`と`nobility/nobilityContext`をimportしている前例があり（AGENTS.md §7.3のsub-module context patternに従う）、参照経路は確立済み。

### 2.3 尚書院 Chancery → 外交同盟の信頼性

- **接続先**: 既存の議会・派閥システム（councilSupport/councilVotes/councilBudget）と、`foreignDebtDiplomacy.ts`が持つ外交降格の前例（Ally→…→Enemyのランク低下ロジック）。
- **効果**: 新規`state.diplomaticReliability`（0〜100、`militaryDiscontent`と同型の蓄積/減衰パターン）を導入し、Chancery逼迫で低下、それが同盟破棄率上昇・外債交渉や援軍要請の成功roll低下に波及する。
- **なぜ形態差がそのまま出るか**: Union/Republicは元々chancery配分比率が高い（§3の設計根拠通り、連合内調整・合議制官僚機構が生命線）。この2形態にとってChancery予算削減は史実通りの急所になり、Monarchy/Anarchyには相対的に影響が薄い。
- **実装コスト**: 中〜高。他国AIの外交判断ロジックとの整合性検証が必要なため、4部門の中では後回しにする。

### 2.4 教会庁 Ecclesiastica → 宗教的正統性・カルト圧力

- **接続先**: なし（新規）。host側`religions-generator.ts`を確認したが、動的な宗教不満/カルト伸長シミュレーションは現状存在しない（生成時の静的配置ロジックのみ）。
- **効果**: 新規`state.religiousUnrest`（0〜100）を導入し、Ecclesiastica逼迫で蓄積。閾値超過でカルト系宗教の伸長速度に補正をかける、または統治コストに緩やかな追加ペナルティを与える。
- **形態差**: Theocracyは配分比率48%と突出しているため最も痛みが分かりやすく、Anarchyは配分比率0%のためこの部門自体が最初から機能しておらず無関係——形態ごとの個性がそのまま出る。
- **実装コスト**: 高。新規シミュレーション軸を1つ起こす必要があるため、4部門の中で最後に着手する。

---

## 3. 配分削減レバーの新設

現状、非軍事4部門の配分比率は`state.form`固定でプレイヤーが直接下げられない。War Footingは「軍事へ全振りする」全体トグルであり、個別部門を絞る手段ではない（[warFooting.ts](../../src/extensions/economy/generators/warFooting.ts)）。

[allocateTreasury()](../../src/extensions/economy/generators/treasuryAllocation.ts#L580)のbaseline取得直後（`applyWarFootingToBaseline`の後）に、`state.departmentBudgetMultiplier`を1段噛ませて再正規化する関数を追加する。既存のpersonality補正／war footing補正と同じ合成チェーンに乗せられるため、実装は関数1つの追加で完結する。

```typescript
// 合成順: form baseline → personality → war footing → 【新規】player override → 正規化
function applyDepartmentBudgetOverride(
  baseline: DepartmentBaselineAllocation,
  state: Pick<State, "departmentBudgetMultiplier">
): DepartmentBaselineAllocation
```

UIは[StatesEditorTreasuryTab.tsx](../../src/extensions/economy/ui/components/StatesEditorTreasuryTab.tsx)またはTreasury Overview Dialogに部門ごとのスライダー（0.5〜1.5想定、War Footingトグルと同じ操作感）を追加する。**§2の各部門効果が実装された後に導入する**——効果が無い段階でスライダーだけ出すと「下げても何も起きない/上げても何も良くならない」レバーになり、削る動機自体が生まれない。

---

## 4. 議会承認ラインへの接続（任意・推奨）

[councilBudget.ts](../../src/extensions/economy/generators/councilBudget.ts) / councilVotes.tsは既に「歳出ラインを4派閥（court/merchants/military/clergy）が承認・拒否する」仕組みを持つ（`COUNCIL_LINE_THRESHOLDS`、`debtIssue`/`warFooting`/`extraordinaryTax`/`militaryExpansion`の4ライン）。§3の部門予算削減も、この承認ラインの5本目・6本目として追加することを推奨する。

- clergy派閥はecclesiastica削減に抵抗
- military派閥はmarshalcy削減に抵抗（既存の`militaryDiscontent`とは別軸の政治抵抗）
- merchants派閥はchancery/stewardship削減に抵抗（通商・行政の合議制官僚機構への依存）

これにより「削減したいのに議会が通さない」という第4のジレンマが既存資産だけで再現でき、単純な「スライダーを下げれば即節約」にならずに済む。実装コストは低い（既存の`CouncilBudgetLine`型に列挙子を足すだけ）が、§2〜§3が先に無いと判定対象が無いため、実装順としては最後に回す。

---

## 5. 調査UIの拡張

- [StateFiscalReportTab.tsx](../../src/extensions/economy/ui/components/StateFiscalReportTab.tsx)の`EXPENSE_LABELS`に、`departmentTransfer`の内訳（5部門別）を展開表示する。
- Treasury Overview Dialogに部門別`departmentServiceLevel`列を追加。`getTreasuryAllocationSnapshots()`が既にMarshalcyのfunding ratioをスナップショット保持しているため（[treasuryAllocation.ts:560-568](../../src/extensions/economy/generators/treasuryAllocation.ts#L560-L568)）、同じスナップショットに4部門分のservice levelを足すだけで実装できる。

これにより「どの国がどの部門で詰んでいるか」が一覧できるようになり、赤字解消プレイの前提となる可視化が揃う。

---

## 6. Stage 0: 死蔵キャップと還流（先行して着手可能）

§2〜§4の効果実装を待たずに、まず`departmentBalances`の非marshalcyキーに上限を設け、超過分は`state.treasury`へ還流させる。効果実装前でも「詰まった金がいつか意味を持つ」形にしておくことで、後続ステップで「今まで意味なく消えていた金が突然重要になる」という遡及的な違和感を避けられる。既存セーブへの影響も小さい（キャップと還流のみで新規フィールド追加を伴わない）。

---

## 7. 実装計画（PR分割）

| PR | 内容 | 前提 |
| :--- | :--- | :--- |
| PR-17a | Stage 0: departmentBalances死蔵キャップ・treasury還流 | なし |
| PR-17b | 家宰府→徴税効率（`administrativeUpkeep`/`administrationBonus`接続、`departmentServiceLevel.stewardship`新設） | PR-17a |
| PR-17c | 部門予算プレイヤーレバー（`departmentBudgetMultiplier`、`applyDepartmentBudgetOverride`、UIスライダー） | PR-17b（効果が無いと削る意味がない） |
| PR-17d | 諜報府→espionage資金源（nobility拡張への課金ゲート追加） | PR-17c |
| PR-17e | 調査UI拡張（Fiscal Report内訳展開、Treasury Overview部門列） | PR-17b以降、随時 |
| PR-17f | 議会承認ラインへの部門削減接続（councilBudget/councilVotes拡張） | PR-17c |
| PR-17g | 尚書院→外交信頼性（`diplomaticReliability`新設、外交AI整合性検証） | PR-17c |
| PR-17h | 教会庁→宗教的正統性・カルト圧力（`religiousUnrest`新設、religions-generator.tsとの接続方式は別途調査） | PR-17c |

---

## 8. 非目的

- 教会庁の宗教シミュレーション（カルト伸長速度の具体的な数式化）そのものの詳細設計——PR-17hの前に別途調査が必要
- 部門予算削減の政治的帰結（議会否決後に何が起きるか）の詳細——`state-treasury-department-budget.md`§8が既に「不満蓄積閾値超過後の具体的な政治的帰結はフェーズ2」としてクーデター機構と合わせて保留しており、本文書もそれを踏襲する
- Burg単位（市政府）の予算配分効果——本設計はState単位の`departmentBalances`のみ
- `departmentBudgetMultiplier`の具体的な可動域（0.5〜1.5は仮値）・各部門の逼迫閾値の数値調整——実プレイでのバランス確認が必要

---

## 9. テスト計画

| 領域 | ケース |
| :--- | :--- |
| Stage 0 | departmentBalancesが上限を超えない、超過分がtreasuryへ正しく還流する |
| Stewardship | serviceLevel低下時にadministrativeUpkeepが増える／administrationBonusが減る、税率変更と独立して効く |
| player override | multiplier適用後も6部門の合計が1に正規化される、既存のpersonality/war footing補正と両立する |
| 議会ライン | clergy比率が低い派閥構成でecclesiastica削減が否決される、既存4ラインの承認結果に影響しない |
| 互換性 | 旧セーブに`departmentServiceLevel`/`departmentBudgetMultiplier`が無くても既定値（1.0/undefined）で安全に動作する |
