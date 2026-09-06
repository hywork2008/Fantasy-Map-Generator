# Advance Time「歴史モード」— Fast-Forward の履歴生成向け拡張 設計

## 状態

**実装完了(H0〜H6)。2026-09-06。** 設計時の起票と同日に全フェーズを実装・検証した。
実装で判明した設計との差分・実測値は §13 にまとめている。**特に §6 のスタブ歳入の既定値は
設計時の見積もりが約22倍外れており、ライブ計測で較正し直した(§13.3)。**

2026-09-06 起票。ユーザー要望:
「時間送りの Fast-Forward の設計を生かして、技術・経済(とそのサブ機能)を個別に無効化したり、
人物・国家の盛衰と戦争の履歴のみを生み出すことに特化した、スタブ的な資金援助オプションを追加する」。

`docs/plan/advance-time-fast-forward.md`(Phase 0〜3 実装済み)の**機能拡張**として設計する。
歴史生成機能そのものではなく、**Advance Time を「数十年を一気に走らせて年代記を作るための道具」に
仕立てる Fast-Forward のプロファイル追加**である。`docs/plan/world-history-depth.md` の Layer C は
本書の機構を利用する側であり、本書は利用される側の基盤にあたる。

**本書の最重要事項は §0 である。** 設計調査の過程で、**現行の Advance Time ではキャラクターが
1歳も年を取らない**ことが判明した。これが直っていない限り、何年進めても代替わりは起きず、
歴史モードは目的を達成できない。§0 を Phase H0 として最優先で扱う。

## 関連ドキュメント

| Doc / Code | 関係 |
| :--- | :--- |
| `docs/plan/advance-time-fast-forward.md` | 本書が拡張する対象。プリセット/ガード/注入の既存設計 |
| `docs/plan/advance-time-loop-reduction.md` | `isBulkAdvance` の初出。Phase 1b の戦闘スキップが §2.2 の当事者 |
| `docs/plan/world-history-depth.md` | 本書の利用者(Layer C = 前史シミュレーション) |
| `docs/simulation/advance-time.md` | RNG 決定性契約(§9) |
| `src/generators/timeEngine.ts` | 日ループ(`advanceTime`/`stepDayMutation`)、`delta` 生成、chronicle の `yearsAgo` 加算 |
| `src/extensions/economy/tickSystemIds.ts` | `ECONOMY_TICK_SYSTEM_IDS`(12系統)。軸B のマスク対象そのもの |
| `src/extensions/nobility/index.tsx` | `nobility.tick`。一枚岩なので §5.3 で内部分割が要る |
| `src/extensions/characters/advanceAge.ts` | §0 のバグ本体 |
| `src/generators/fastAdvance/fastAdvancePresets.ts` | `FastAdvanceRates`。軸C が追加フィールドを足す先 |
| `src/extensions/economy/generators/fastAdvanceEconomy.ts` | 乗算のみの treasury 更新。§6.1 の当事者 |
| `src/extensions/economy/generators/fastAdvanceEconomyGuard.ts` | tick 単位フラグの既存パターン。軸B/C が踏襲する |

---

## 0. 前提バグ:キャラクターが加齢していない(Phase H0)

### 0.1 事実

[`advanceAge.ts:105-127`](src/extensions/characters/advanceAge.ts#L105-L127):

```ts
export function advanceCharacterAging(deltaYears: number): void {
  ...
  const oldAge = character.age;
  const newAge = Math.round(oldAge + deltaYears);
  ...
  character.age = newAge;
```

呼び出し側([`nobility/index.tsx:323`](src/extensions/nobility/index.tsx#L323)):

```ts
const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
advanceCharacterAging(effectiveDeltaYears);
```

そして時間送りは**必ず1日ずつ**進む。`advanceTime()` は複数日を
`for (let i = 0; i < totalDays; i++) stepDaySimulation()` で回し
([timeEngine.ts:549-554](src/generators/timeEngine.ts#L549-L554))、
`stepDayMutation()` は `advanceTimeMutation(0, 0, 1)` を呼ぶ
([timeEngine.ts:728](src/generators/timeEngine.ts#L728))。
`delta` は常に `{years: 0, months: 0, days: 1}`([timeEngine.ts:886](src/generators/timeEngine.ts#L886))。

したがって毎回 `effectiveDeltaYears ≈ 0.0027379`、`character.age` は整数(`createPerson` の
`rand()` 由来)なので:

```
Math.round(45 + 0.0027379) === 45
```

**Advance Year を何回押しても `character.age` は生成時の値から動かない。**

### 0.2 波及

- 死亡ロールは `survivalProb = (1 - risk) ** deltaYears` で**正しく複利化されている**ため、
  キャラクターは死ぬ。しかし死亡リスク曲線(`newAge > 50` の 1.15^(age-50) スパイク)は
  **生成時の年齢で凍結**する。30歳で生成された人物は100年経っても30歳の死亡率のままで、
  老衰しない。
- 成人化の閾値処理(`advanceAge.ts` 末尾の若年キャラの成長)も発火しない。
- `raceAge.ts` の種族別寿命モデルが**実行時にはまったく効いていない**。エルフと人間の
  寿命差は生成時の年齢分布にしか現れない。
- **歴史モードにとっては致命的**:代替わりの主因(老衰)が存在しないので、
  50年進めても王朝史がほとんど生まれない。

`advanceAge.test.ts` のアサーションはすべて `advanceCharacterAging(1|3|5|10)` と**整数年**で
呼んでおり、実運用の 1/365 は一度もテストされていない。これがバグが残った理由である。

### 0.3 修正案

**採用案:`Character.ageFraction?: number` を追加し、端数を持ち越す。**

```ts
const accumulated = (character.ageFraction ?? 0) + deltaYears;
const wholeYears = Math.floor(accumulated);
character.ageFraction = accumulated - wholeYears;
const newAge = oldAge + wholeYears;
```

- `Math.round` を `Math.floor` + 端数繰越に変えるだけで、日次でも年次でも同じ経過年数になる。
- `ageFraction` は optional なので既存セーブと互換(未定義 = 0)。
- 整数年で呼ぶ既存テストは `ageFraction` が常に 0 のまま `oldAge + deltaYears` と一致し、
  **全テストが無改修で通る**。

**却下案**:`nobility.tick` を年1回ゲート(`currentDay===1 && currentMonth===1`)にして
`advanceCharacterAging(1)` を呼ぶ。日付をまたぐ Advance Day の挙動が変わり、
年の途中で止めた場合に加齢が飛ぶ。

**併せて必要な確認**:同じ `effectiveDeltaYears` を受ける
`advanceCharacterHealth()` / `processResignationsAndSuccessions()` /
`processCharacterCorruption()` が、1/365 刻みで正しく積算されるか(確率を
`P(rate * deltaYears)` の形で使っていれば正しい。`Math.round` 系の丸めが他にないか要確認)。

### 0.4 テスト

1. `advanceCharacterAging(1/365.2425)` を 365 回呼ぶと age が **ちょうど +1** になる回帰テスト。
2. 同じく 3652 回で +10。
3. 整数年呼び出しの既存挙動が不変であること(既存テストの緑維持で足りる)。
4. 統合:Advance Year ×50 のあと、生成時に高齢だった統治者が死亡し `pastTitles` に
   在位記録が残ること(歴史モードの受け入れ条件そのもの)。

---

## 1. 目的と非目的

### 目的

- 数十年〜数百年を**実用的な時間で**走らせ、**人物の生死・襲位、国家の版図変動、戦争**の
  履歴を実際に発生させる。
- そのために**経済・技術・インフラなど「歴史の語り」に寄与しない系統を個別に停止**できるようにする。
- 経済を止めたことで軍事・統治が資金枯渇で停止しないよう、**スタブ的な資金供給**を用意する。

### 非目的

- 経済シミュレーションの**精度**を上げること。歴史モードは経済を意図的に捨てる。
- 年代記の**データモデル**設計(`ChronicleEvent` の拡張は `world-history-depth.md` Layer B の担当)。
- 通常の Advance Day/Month/Year の挙動変更。歴史モードは**明示的なオプトイン**であり、
  既定では現行と完全に同一に振る舞う(§9.2)。

---

## 2. 現行 Fast-Forward が歴史生成に足りない4点

### 2.1 tick の「数」が減っていない

Fast-Forward は **1日あたりのコスト**を下げる設計で、**日数そのもの**は減らさない。
50年 = **18,262 回**の `stepDaySimulation()` が回り、その各回で
core 系 + economy 12系統 + `nobility.tick` + `shipbuilding.tick` の
システム・ディスパッチ、`TransactionWriter` の生成、トピック集計が発生する。
注入に置き換えた分の「中身」は軽くなっても、**ディスパッチの定数コスト × 18,262** が残る。

→ 軸A(§4)で **tick の刻みを粗くする**。

### 2.2 戦争が抑制される方向に働く

[`conflictDirector.ts:57-59`](src/extensions/nobility/conflictDirector.ts#L57-L59):

```ts
export function shouldSuppressConflictAdvance(isBulkAdvance: boolean): boolean {
  return isBulkAdvance && !mayAdvanceAutonomousConflict();
}
```

`conflictAutonomy === "playerDirected"` のマップでは、**まさに Fast-Forward 中に**
作戦立案・攻囲・小競り合い・軍団移動がまるごとスキップされる
([nobility/index.tsx:358-359](src/extensions/nobility/index.tsx#L358-L359))。
Phase 1b の意図(「プレイヤーが今戦争を解決していない」)としては正しいが、
**歴史生成の目的とは正反対**である。

→ 歴史モードは `conflictAutonomy` を一時的に `autonomous` として扱う(§5.4)。

### 2.3 経済は偽物なのに、経済ゲートは本物

これが**ユーザーが「スタブ的な資金援助」と呼んだ問題の核心**である。

`applyFastForwardEconomySettlement()` の treasury 更新は**純粋な乗算**である
([fastAdvanceEconomy.ts:68-77](src/extensions/economy/generators/fastAdvanceEconomy.ts#L68-L77)):

```ts
const treasuryFactor = (1 + rates.treasuryGrowthPctPerYear / 100) ** yearsElapsed;
state.treasury = Math.max(0, rn((state.treasury ?? 0) * treasuryFactor, 2));
```

唯一実測較正されている "steady" プリセットの `treasuryGrowthPctPerYear` は **−13** である。

| 経過年 | 乗数(0.87^n) |
| ---: | ---: |
| 10 | 0.248 |
| 25 | 0.031 |
| **50** | **0.00095** |
| 100 | 0.0000009 |

**50年で国庫は約1/1000になる。** さらに乗算のみなので **0 は吸収状態**で、一度枯れた国庫は
どのプリセットでも二度と回復しない("growth" は 0%/年 = 凍結、増えるのは "boom" のみ)。

枯れた国庫は歴史そのものを止める。実例:
[`frontierGovernance.ts:138`](src/generators/frontierGovernance.ts#L138) は
`(state?.treasury ?? 0) >= 30` で拡張姿勢か均衡姿勢かを決め、
[`:58`](src/generators/frontierGovernance.ts#L58) は国境投資に `>= INVESTMENT_COST + 12` を要求する。
**全国家が破産すれば全国家が「均衡姿勢」に固まり、版図は動かなくなる。**

→ 軸C(§6)で**加算的なスタブ歳入**を入れる。

### 2.4 サブシステムを個別に切れない

現行 Fast-Forward のスイッチは `enabled`(全体)と `preset`(数値ベクトル)だけで、
「技術は止めたいが軍事は動かしたい」といった選択ができない。一方で**切るための足場は既にある**:

- `ECONOMY_TICK_SYSTEM_IDS` — 経済 tick は12個の独立した登録済みシステムに分割済み
  ([tickSystemIds.ts](src/extensions/economy/tickSystemIds.ts))。
- `SimulationSystemRegistry` — 全システムが `id` を持ち、`run()` が
  `SimulationStepContext` を受ける([simulationSystem.ts:78-88](src/generators/simulationSystem.ts#L78-L88))。
- `fastAdvanceEconomyGuard.ts` — 「tick 単位のフラグを立て、個々の処理が自分で見る」という
  既存パターン。

→ 軸B(§5)は**新機構をほぼ作らず、既存の id にマスクを掛けるだけ**で成立する。

---

## 3. 設計:HistoryMode を Fast-Forward の上位プロファイルに

Fast-Forward を置き換えず、**その上に乗る3つの直交する軸**を足す。

| 軸 | 何を変えるか | 主な効果 |
| :--- | :--- | :--- |
| **A. tick ストライド** | 1日刻み → 1ヶ月刻み | 速度 ×約30 |
| **B. サブシステム・マスク** | 登録IDごとの実行 ON/OFF | 速度 + ノイズ除去 |
| **C. スタブ資金** | 乗算 treasury → 加算歳入 + 下限 | 歴史のロックアップ防止 |

3軸はそれぞれ単独で意味があり、**個別にフェーズを切れる**。

### 3.1 状態モデル

`src/store/fastAdvanceState.ts` を拡張する(新規ストアは作らない — 同じ⚙導線に同居させる)。

```ts
export type HistoryModeProfileId = "off" | "chronicle" | "dynastyOnly" | "custom";

export interface HistoryModeConfig {
  profile: HistoryModeProfileId;
  /** 軸A: 1ティックあたりの刻み。"day" は現行と同一。 */
  stride: "day" | "week" | "month";
  /** 軸B: 明示的に停止する simulation system id の集合(custom 時のみ編集可)。 */
  disabledSystemIds: string[];
  /** 軸C: スタブ歳入。§6 参照。 */
  stubFunding: StubFundingConfig;
  /** §5.4: 歴史生成中は戦争抑制を外す。 */
  forceAutonomousConflict: boolean;
}
```

既存の `enabled` / `preset` / `customRates` はそのまま残す。
`profile === "off"` のとき、**全挙動が現行と完全一致**すること(§9.2 のテストで固定)。

### 3.2 プロファイル

| Profile | ねらい | stride | 停止する系統 | stubFunding |
| :--- | :--- | :--- | :--- | :--- |
| `off` | 現行どおり | day | なし | 無効 |
| `chronicle`(**既定の歴史モード**) | 人物・国家・戦争の履歴を作る | month | 経済12系統のうち9個 + shipbuilding + 技術年次 | 有効 |
| `dynastyOnly` | 王朝史だけ最速で作る | month | 経済**全部** + 軍事移動 + shipbuilding | 有効(簡易) |
| `custom` | 手動 | 任意 | 任意 | 任意 |

---

## 4. 軸A:粗いティック・ストライド

### 4.1 なぜ「月初固定」なのか

素朴に「N日まとめて1回 `stepDaySimulation()`」とすると、年次処理のゲートを踏み越えて壊す。
現行の年次/月次処理は**カレンダー位置**で判定している:

```ts
if (api.simulationContext.currentDay === 1 && api.simulationContext.currentMonth === 1) { ... }
```
([nobility/index.tsx:326](src/extensions/nobility/index.tsx#L326), [:365](src/extensions/nobility/index.tsx#L365) ほか多数)

**解決策:ストライドを「常に月初(day === 1)に着地する」ように取る。**

- `stride: "month"` は「次の月の1日」まで一気に進める。1年 = **12 tick**。
- `currentDay === 1` は毎 tick 真、`currentDay === 1 && currentMonth === 1` は
  **年に必ず1回だけ**真。**既存の年次/月次ゲートが1行も変わらずに正しく発火する。**
- 日ループが 365 → 12 になり、ディスパッチ定数コストが **約30分の1**。

`stride: "week"` は月初着地を保てない(年次ゲートを踏み越える)ため、
**実装するなら `day` と `month` の2値に絞る**。中間が欲しければ「半月刻み(1日と16日)」なら
月初着地を保てるが、v1 では不要と判断する。

### 4.2 `delta` の扱い

`advanceTimeMutation(0, 0, N)` を1回呼ぶ形になり、`context.delta.days === N`(28〜31)になる。
`effectiveDeltaYears ≈ N/365.2425` として各システムに渡る。

**delta に対して正しい系統(そのまま動く):**

| 系統 | 根拠 |
| :--- | :--- |
| `advanceCharacterAging` | §0.3 修正後は `deltaYears` で正しく積算 |
| 死亡ロール | `(1 - risk) ** deltaYears` |
| `advanceCharacterHealth` / `processResignationsAndSuccessions` / `processCharacterCorruption` | すべて `effectiveDeltaYears` を引数に取る |
| `applyFastForwardPopulation` | `sqrt(deltaYears)` のジッター補正済み(FF §9.2 の教訓)。**一括呼び出しでも分割呼び出しでも同じ分散**になるよう既に設計されている |
| `applyFastForwardEconomySettlement` | 指数の結合律で月数分をまとめて適用済み |

**delta を無視して「1回 = 1日」を前提にしている恐れがある系統(要監査):**

- `economy.caravans`(キャラバン移動)、`economy.dailyHiring`(日次求人板)、
  `advanceAllRegimentMovement`(軍団の行軍距離)、`tickPlayerTravel(deltaDays)`。
- **これらは軸B で歴史モード中は停止対象**なので、v1 では監査を「停止しない系統」に絞れる。
  `dynastyOnly` プロファイルは軍団移動も止めるため監査対象がさらに減る。

**Phase H2 の受け入れ条件**:`stride: "month"` で有効化する系統すべてについて、
「`deltaDays = 30` を1回」と「`deltaDays = 1` を30回」が**同等の結果分布**になることを
テストで示す(RNG 消費数は一致しない — §9.1)。

### 4.3 実装

`advanceTime()` の日ループを、ストライド解決関数で刻む:

```ts
// timeEngine.ts
function nextStrideDays(remainingDays: number): number {
  const stride = resolveHistoryStride();           // "day" | "month"
  if (stride === "day") return 1;
  return Math.min(remainingDays, daysUntilNextMonthStart(simulationContext));
}
```

`enterDayBatch(totalDays)` のスナップショット機構、`isBulkTimeAdvance()`、
`notifyAfterDayStep()` の通知契約はそのまま(通知は実際の刻み日数を渡す形に拡張)。

---

## 5. 軸B:サブシステム・マスク

### 5.1 掛ける場所

`OrderedSimulationSystemRegistry.run()` の実行直前1箇所で判定する。
各システムの `run()` に手を入れない(拡張が動的登録するシステムにも自動で効く)。

```ts
// simulationSystem.ts の run() ループ内
if (isSystemSuppressedForHistoryMode(system.id, context)) continue;
```

**重要な設計判断:スキップしたシステムは RNG を消費しない。**
`fastAdvanceEconomyGuard` は「RNG は消費したまま treasury 書き込みだけ飛ばす」方針だったが、
軸B は系統ごと止めるので同じ理屈は使えない。歴史モードは**別の乱数系列を持つ別モード**として
扱い、通常 Advance との seed 互換は最初から放棄する(§9.1)。

### 5.2 経済側のマスク既定表

`ECONOMY_TICK_SYSTEM_IDS` の12系統に対する既定。

| 系統 | `chronicle` | `dynastyOnly` | 停止理由 / 残す理由 |
| :--- | :---: | :---: | :--- |
| `economy.marketTerritorySync` | 停止 | 停止 | 市場territory は年代記に出ない |
| `economy.annualAgTech` | 停止 | 停止 | 農業投資・気候災害。人口は軸Aの注入で代替 |
| `economy.caravans` | 停止 | 停止 | 日次前提(§4.2)かつ最も重い系統の一つ |
| `economy.warIntensity` | **実行** | 停止 | 戦争強度は国家の盛衰に直結する |
| `economy.dailyHiring` | 停止 | 停止 | 日次前提 |
| `economy.annualUrbanLabor` | 停止 | 停止 | 都市労働需給 |
| `economy.annualPlants` | 停止 | 停止 | 化学/医療プラント。FF Phase 3 の treasury ドレイン元 |
| `economy.annualInfrastructure` | 停止 | 停止 | 上下水・鉄道 |
| `economy.annualKnowledge` | **実行** | 停止 | 技術史は年代記の主要素材。`chronicle` では残す |
| `economy.annualBurgGroups` | 停止 | 停止 | バーグ分類 |
| `economy.forestProspect` | 停止 | 停止 | 森林・探鉱 |
| `economy.foodCalendar` | 停止 | 停止 | 食料暦。生産決済のスケジューリング元 |

`economy.foodCalendar` を止めると `applyFastForwardEconomySettlement()` の起動元も止まるため、
**軸C のスタブ歳入が treasury の唯一の書き手になる**(§6.3)。これは意図した設計である。

### 5.3 `nobility.tick` は一枚岩なので内部分割が要る

`nobility.tick` は単一システムに、健康・加齢・剪定・襲位・汚職・将官任命・領主任命・
人材配置・辺境統治・作戦立案・徴兵・諜報・攻囲・小競り合い・軍事更新・軍団移動・
行軍捕獲を**すべて詰め込んでいる**([nobility/index.tsx:313-400+](src/extensions/nobility/index.tsx#L313))。
これでは「加齢と襲位だけ動かして軍団移動は止める」ができない。

**対応:`ECONOMY_TICK_SYSTEM_IDS` と同じ手法で `nobility.tick` を分割する。**
新規 `src/extensions/nobility/tickSystemIds.ts`:

```ts
export const NOBILITY_TICK_SYSTEM_IDS = [
  "nobility.characterLifecycle",  // health, aging, pruning, successions, corruption
  "nobility.appointments",        // assignOfficers, assignProvinceLords, humanCapital
  "nobility.playerTravel",        // tickPlayerTravel
  "nobility.frontierGovernance",  // advanceFrontierGovernance, mobilization
  "nobility.strategy",            // StrategicPlanner, Espionage
  "nobility.combat",              // advanceTension, LocalSkirmish, battle resolution
  "nobility.regimentMovement"     // advanceAllRegimentMovement, march capture
] as const;
```

これは歴史モードのためだけの作業ではなく、`economy-coupling-audit.md` T1 が経済側に施した
分割の nobility 版であり、**単独でも価値のあるリファクタ**である(Phase H1 を独立フェーズに
切っている理由)。

| 系統 | `chronicle` | `dynastyOnly` |
| :--- | :---: | :---: |
| `nobility.characterLifecycle` | **実行** | **実行** |
| `nobility.appointments` | **実行** | **実行** |
| `nobility.playerTravel` | 停止 | 停止 |
| `nobility.frontierGovernance` | **実行** | 停止 |
| `nobility.strategy` | **実行** | 停止 |
| `nobility.combat` | **実行** | 停止 |
| `nobility.regimentMovement` | **実行** | 停止 |

`dynastyOnly` は「人物の生死と襲位だけ」を最速で回すプロファイルで、
`world-history-depth.md` Layer A2(在職履歴の実発生)を作る用途を想定している。

### 5.4 戦争抑制の反転

`chronicle` プロファイルは §2.2 の抑制を外す必要がある。

```ts
export function shouldSuppressConflictAdvance(isBulkAdvance: boolean): boolean {
  if (isHistoryModeActive()) return false;      // 歴史モードは常に戦争を解決する
  return isBulkAdvance && !mayAdvanceAutonomousConflict();
}
```

`mayAdvanceAnyConflict()` も同様に、歴史モード中は `conflictAutonomy` を `autonomous` と
みなす。**プレイヤーの設定値は書き換えない**(モード判定で上書きするだけ)。
歴史モード終了時に自動的に元の方針へ戻る。

UI に明記する:「歴史モードでは AI 国家が自律的に開戦します(プレイヤー主導設定は一時的に無視されます)」。

### 5.5 技術の扱い

`technologyProgress` は `heldLongEnough()` で年数条件を見るので、50年進めれば
技術が大きく進む。`world-history-depth.md` §5.4 で挙げた「開始時点の技術水準が `era` 設定を
追い越す」問題そのものである。

軸Bでの選択肢:

- `chronicle`: `economy.annualKnowledge` を**実行**したまま、
  `technologyDevelopmentSpeed` を歴史モード中だけ係数で下げる(既存オプション値を一時上書き)。
  → 技術史が年代記に載る。推奨。
- `dynastyOnly`: `economy.annualKnowledge` ごと**停止**。技術は生成時のまま凍結。

いずれを既定にするかは実測(Phase H4)で決める。

---

## 6. 軸C:スタブ資金援助

### 6.1 なぜ乗算では駄目か

§2.3 の通り、乗算モデルは (a) 50年で1/1000に潰れ、(b) 0 が吸収状態で、
(c) 国庫の**相対的な差**(大国は豊かで小国は貧しい)を保存しない。
歴史モードは経済系統を止めるので、放置すれば全国家が数十年で破産して版図が凍結する。

### 6.2 3つの案

| 案 | 内容 | 評価 |
| :--- | :--- | :--- |
| 案1 下限クランプ | 毎 tick `treasury = max(treasury, floor)` | 実装最小。だが「破産して滅ぶ国」が作れず、盛衰の"衰"が消える。**安全網としては採用** |
| 案2 スタブ歳入(**推奨**) | 毎年 `treasury += revenueProxy(state) − upkeepProxy(state)` を加算 | 国力に比例した戦費調達力が生まれ、大国と小国の差が歴史に反映される |
| 案3 支出ゲート無効化 | 歴史モード中は資金チェックを全通しにする | 小国が大国と同じだけ戦える。因果が壊れる。**却下** |

### 6.3 案2 の設計

```ts
export interface StubFundingConfig {
  enabled: boolean;
  /** 人口1人あたりの年間名目歳入(SP)。既定はマップ生成時の実測歳入から自動推定。 */
  revenuePerCapitaPerYear: number;
  /** 歳入に対する恒常支出の比。1.0 で収支均衡、>1 で構造的赤字。 */
  upkeepRatio: number;
  /** 戦争中の国家に掛かる追加支出倍率。 */
  warUpkeepMultiplier: number;
  /** 安全網(案1)。国力に対するこの比率を下回らせない。0 で無効。 */
  floorRatio: number;
}
```

```
revenue_i = revenuePerCapitaPerYear × population(state_i) × yearsElapsed
upkeep_i  = revenue_i × upkeepRatio × (atWar(state_i) ? warUpkeepMultiplier : 1)
treasury_i += revenue_i − upkeep_i
treasury_i  = max(treasury_i, floorRatio × revenue_i)     // floorRatio > 0 のとき
```

設計上の要点:

- **加算なので 0 から回復できる。** 吸収状態が消える。
- **人口比例なので国力差が保存される。** 版図が広がった国は歳入も増え、
  `frontierGovernance` の拡張姿勢を維持できる → 「勝った国がさらに拡張する」正のループが働き、
  **盛衰が生まれる**。
- **`upkeepRatio > 1` かつ `warUpkeepMultiplier > 1` にすると、長期戦争が国庫を食い潰す。**
  これが「衰」の主因になる。歴史モードで最も重要なチューニング・ノブ。
- `floorRatio = 0`(既定)なら破産と滅亡が起こり得る。滅亡を避けたいユーザーは上げる。

`revenuePerCapitaPerYear` の既定値は **Phase H4 で実測較正する**。
既存の `scripts/calibrateFastAdvance.ts` / `scripts/lib/advanceYearHarness.ts` に
「実 Advance Year 1年ぶんの `state.treasury` 増減と人口」を記録する測定を足せば、
`npm run calibrate:fast-advance` の枠内で求まる(FF Phase 0 と同じ手順)。

### 6.4 既存 FF 経路との関係

- 歴史モードが有効なら、`applyFastForwardEconomySettlement()` の **treasury 部分だけ**
  スタブ歳入に置き換える(Good の stock/price はプリセット通りに継続 — 価格が固まっていると
  歴史モード解除後の経済が不自然になるため)。
- `fastAdvanceEconomyGuard` の `isFastForwardTickActive()` は**そのまま活きる**:
  歴史モード中も実行され続ける少数の系統(`economy.annualKnowledge` など)の
  treasury 書き込みは引き続き抑止される。スタブ歳入が treasury の唯一の書き手であるという
  §5.2 の性質が、これで保たれる。

---

## 7. 「寿命ベースで最低数十年進める」

ユーザー提案:「人物の寿命をベースに最低でも数十年進めてしまうのも良いかもしれません」。

固定年数のボタンではなく、**そのマップの実際の種族構成から必要年数を算出する**。

```ts
/** 現在の統治者が概ね1回入れ替わるのに要する年数。 */
export function yearsPerRulerGeneration(): number {
  const rulers = /* 各国の landed ruler */;
  // 各統治者の「残り寿命の中央値」を取る。種族混成マップでも自然に効く。
  const remaining = rulers.map(r => Math.max(1, raceLifespan(r) - r.age));
  return median(remaining);
}
```

- 人間中心のマップ:概ね **25〜40年 / 世代**。
- エルフ/ドラゴン混成:**300年超 / 世代**にもなる。
  これは「長命種族の世界では歴史の1単位が長い」という**望ましい**帰結である。
  ただし §2.3 の国庫問題と Phase H4 の実測コストが効いてくるため、
  UI で必ず**推定所要時間を併記**する。

UI は「N年進める」の代わりに **「1世代 / 2世代 / 3世代 進める」** ボタンを歴史モード時に出し、
括弧で実年数と推定所要時間を表示する:

```
[ 1世代 進める (約 32 年 / 推定 8 秒) ]
[ 2世代 進める (約 64 年 / 推定 16 秒) ]
[ 3世代 進める (約 96 年 / 推定 24 秒) ]
```

`world-history-depth.md` §3.5 の `epochFloorYear` と整合させること
(前史生成に使う場合、遡る年数がこの世代長で決まる)。

---

## 8. UI

既存の `FastAdvanceSettingsDialog`(⚙)にセクションを1つ足す。新規ダイアログは作らない。

```
┌─ Fast-Forward 設定 ─────────────────────────────┐
│ プリセット  ( )崩壊 ( )衰退 ( )停滞 (•)標準 ( )成長 ( )好況 ( )カスタム │
│ ▸ 詳細(成長率スライダー5本)                              │
│                                                          │
│ ── 歴史モード ────────────────────────────────  │
│ プロファイル (•)オフ ( )年代記 ( )王朝のみ ( )カスタム       │
│   ⓘ 年代記: 人物・国家・戦争の履歴を作ることに特化します。      │
│      経済/インフラ/技術の大半を停止し、月単位で進めます。       │
│      AI国家が自律的に開戦します。                           │
│                                                          │
│ 刻み        ( )1日  (•)1ヶ月                              │
│ [x] スタブ歳入を使う                                       │
│     1人あたり年間歳入 [====|====] 0.12 SP                  │
│     恒常支出比        [======|==] 0.95                     │
│     戦時支出倍率      [===|=====] 1.6                      │
│     国庫下限比        [|========] 0.0                      │
│                                                          │
│ ▸ 停止する系統(カスタム時のみ)                            │
│   [x] economy.marketTerritorySync                        │
│   [x] economy.annualAgTech                               │
│   [ ] economy.warIntensity                               │
│   ...(登録済みシステムを一覧・個別チェック)                  │
└──────────────────────────────────────────────┘
```

- 「停止する系統」は**レジストリから動的に列挙**する(`registry.list()`)。
  ハードコードした一覧を持たないので、系統が増えても UI が自動追従する。
- プロファイル選択時は既定マスクを表示だけして編集不可(プリセットと同じ挙動)。
- i18n: `dialogs.advanceTime.historyMode.*` を en/ja に追加。系統 id 自体は翻訳せず、
  説明文(`tickSystemIds.ts` の JSDoc 相当)を i18n キーで持つ。

---

## 9. 決定性・セーブ・互換

### 9.1 RNG 決定性

- 歴史モードは**通常 Advance とのシード互換を持たない**。系統をスキップすれば RNG 消費が変わり、
  ストライドを変えれば消費回数が変わるため、両立は不可能。
- 保証するのは「**同じ seed + 同じ HistoryModeConfig + 同じ年数 ⇒ 同じ結果**」のみ。
  これは `docs/simulation/advance-time.md` §7 の契約を歴史モード向けに緩めるもので、
  同ドキュメントに追記が要る。
- システムごとの RNG ストリームは `simulationSystem` が
  「master seed + system id + tick + calendar」から導出しているため、
  **他系統をスキップしても残った系統のストリームは汚染されない**。この性質を明示的に
  テストで固定する(歴史モードの再現性の土台)。

### 9.2 「オフなら現行と完全一致」

最重要の回帰保証。`profile === "off"` のとき:

- ストライド解決は `1` を返す(日ループが1日刻みのまま)。
- マスク判定は常に `false`。
- スタブ歳入は呼ばれず、`applyFastForwardEconomySettlement()` の treasury 経路が従来どおり。

テスト:同一 seed で `off` の Advance Year ×3 が、本機能実装前のスナップショットと
**バイト一致**すること(既存の FF 統合テストのスナップショットを流用)。

### 9.3 保存

`HistoryModeConfig` は `fastAdvanceState` と同じく **`.fmg` アーカイブに含めない**
(UI 設定として `persist` する)。FF §7 の判断を踏襲する。
歴史モードで進めた**結果**(人物・年代記・版図)は通常どおり保存される。

### 9.4 `yearsAgo` のスケーリング問題

`ChronicleEvent` は絶対年ではなく **`yearsAgo`(相対年)** を持ち
([models.ts:749-758](src/types/models.ts#L749-L758))、
`advanceTimeMutation()` は年が進むたびに**全イベントを走査して `yearsAgo` を加算する**
([timeEngine.ts:817-832](src/generators/timeEngine.ts#L817-L832))。

歴史モードは (a) イベント数を数千規模に増やし、(b) 年進行の回数も増やすため、
この O(イベント数 × 年数) がボトルネックになり得る。
**軸Aの月ストライドで年境界を跨ぐ回数自体は減る**(年12回の tick のうち1回だけ)ので
即座に破綻はしないが、Phase H4 の実測で監視する。

根本解決(`yearsAgo` → 絶対年 `year` への移行)は
`world-history-depth.md` Layer B の担当とし、本書ではスコープ外。

---

## 10. 実装フェーズ

| Phase | 内容 | 状態 | 主な成果物 |
| :--- | :--- | :--- | :--- |
| **H0** | §0 加齢バグ修正(`ageFraction` 繰越)+ 回帰テスト | ✅ 完了 | `characterTypes.ts`(`ageFraction`)、`advanceAge.ts`、回帰テスト7件 |
| **H1** | `nobility.tick` の分割(挙動不変のリファクタ) | ✅ 完了 | `nobility/tickSystemIds.ts`(**8**系統、§13.1)、`tickSystemOrder.test.ts` |
| **H2** | 軸A:月ストライド | ✅ 完了 | `historyModeProfiles.strideStepDays()`、`StepDayCommand.payload.days`、`DayBatchController.strideDays` |
| **H3** | 軸B:レジストリ側マスク + 交戦抑制の反転 | ✅ 完了 | `SimulationSystemRegistry.setFilter()`、`historyModeRun.ts`、`conflictDirector.mayAdvanceAutonomousConflict()` |
| **H4** | 軸C:スタブ歳入 + 実測較正 | ✅ 完了 | `historyStubFunding.ts`、`history.stubFunding` システム、**較正値は §13.3** |
| **H5** | UI + i18n | ✅ 完了 | `FastAdvanceSettingsDialog` 拡張、`AdvanceTimeDialog` 世代ボタン、`rulerGeneration.ts`、en/ja |
| **H6** | ライブ検証(Playwright) | ✅ 完了 | §13.4 の実測結果。全受け入れ条件を満たす |

ユニットテスト 3817件 green(新規 41件)、`tsc`/`biome`/`madge`/`lint:legacy`/`lint:architecture`/`build` すべて green。

**H0 は他の全フェーズから独立しており、単独で先に入れるべきである。**
現状「キャラクターが年を取らない」のは歴史モードの有無にかかわらずバグである。

**H1 も単独価値がある**(`economy-coupling-audit.md` T1 と同じリファクタの nobility 版)。
歴史モードを見送る判断になっても H0/H1 は残す価値がある。

### 受け入れ条件(H6)

1. 人間中心のマップで `chronicle` プロファイル・50年走行が **60秒以内**に完了する。
2. 走行後、生成時の統治者の過半が死亡し、`pastTitles` に在位記録が残っている。
3. 走行後、少なくとも1つの国家で版図が変化している(併合または喪失)。
4. 走行後、全国家の `state.treasury` が 0 ではない(スタブ歳入が効いている)、
   あるいは 0 の国家が「破産して縮小した国」として説明できる。
5. `profile: "off"` の Advance Year が実装前とバイト一致する。

---

## 11. リスク

| リスク | 対応 |
| :--- | :--- |
| §4.2 の日次前提システムが月ストライドで壊れる | 歴史モードで実行する系統だけを監査対象にする。監査未了の系統は既定で**停止側**に倒す |
| `nobility.tick` 分割(H1)が既存挙動を変える | 分割は純粋な機械的リファクタとし、`after: [previous]` で順序を固定。同一 seed での結果不変をテストで固定 |
| スタブ歳入の較正が外れて全国家が肥大/破産する | H4 で実測較正。加えて `floorRatio` と、上限側の安全網(既存 `stockCapMultiplier` と同じ思想)を持たせる |
| 50年走行で人物数が爆発しメモリを食う | `pruneDeadCharactersAnnual()` が既に年次で走る([nobility/index.tsx:326-328](src/extensions/nobility/index.tsx#L326-L328))。歴史モードでは剪定を必ず有効に保つ(マスクで切らせない) |
| 歴史モードの結果が「戦争ばかりで単調」になる | H6 のライブ検証で年代記を目視。`upkeepRatio` / `warUpkeepMultiplier` が主要な調整ノブ(§6.3) |

## 12. 未決定事項

1. §5.5 の技術進行:`chronicle` で `economy.annualKnowledge` を残すか止めるか。H4 の実測待ち。
2. §6.3 の `upkeepRatio` 既定値。1.0(均衡)か、やや赤字(1.05)にして「衰」を起きやすくするか。
3. §7 の世代ボタンを既定 UI にするか、年数入力と併記に留めるか。
4. `dynastyOnly` プロファイルを v1 に含めるか、`chronicle` だけで出すか。
5. 歴史モード走行中の描画:毎 tick 再描画すると重い。走行中は描画を止めて
   進捗バーだけ出すか(既存 `AdvanceTimeDialog` の `simulating` 表示を流用)。

---

## 13. 実装で判明した設計との差分・実測値(2026-09-06)

### 13.1 `nobility.tick` は7系統ではなく8系統に分割した

§5.3 の設計では7系統としていたが、実装時に **`nobility.finalize` を8つ目として追加**した。
分割前の `run()` 末尾には、どのステップが実行されたかに関わらず毎tick走る処理

```ts
refreshCharactersOverviewIfOpen(...); refreshPlayerCharacterSelection();
writer.markChanged("extension.characters", "extension.nobility");
```

があり、これを他の系統に相乗りさせると**その系統をマスクで止めた瞬間にUI更新とトピック通知が消える**。
歴史モードがマスクできない専用ステップとして切り出すのが正しい。

トピック通知の等価性は分解して保った:元の
`settlementsChanged → map.politics/map.settlements`、`militaryChanged → simulation.military` を
`nobility.combat` と `nobility.regimentMovement` がそれぞれ自分の結果で `markChanged` する形にした
(トピックは集合なので二重マークは無害、和集合は元と一致)。

### 13.2 ストライドの配線先は `advanceTime` の日ループではなく `enterDayBatch`

§4.3 では `advanceTime()` のループを書き換える想定だったが、多日進行の入口は
**`advanceTime` / UIのrAFループ / ヘッドレス `runDaily`** の3つある。3箇所それぞれで
`beginHistoryModeRun`/`endHistoryModeRun` を対にすると、非同期ループの途中終了・例外・
入れ子呼び出しで漏れる。

3つとも必ず通る唯一の絞り点が `enterDayBatch()` / `exitDayBatch()` だったため、
**歴史モードのブラケットをそこに移した**。`totalDays > 1` のときだけプロファイルを解決するので、
単発の Advance Day が歴史モードに入らないという §3.1 の性質も同じ場所で保証される。

`runDaily`(`src/runtime/simulationRunner.ts`)は timeEngine を import できない(循環)ため、
既存の `DayBatchController` に `strideDays?(remainingDays)` を足して注入する形にした。

### 13.3 スタブ歳入の既定値は設計時の見積もりが約22倍外れていた(要点)

**設計時の推定値(revenue 0.12 / upkeep 0.95)で50年走らせたところ、
30国すべてが `frontierGovernance` の `treasury >= 30` を下回り、拡張姿勢を取れる国がゼロになった。**
これは §2.3 で「スタブ歳入がないと起きる」と予測した失敗そのものであり、
スタブ歳入を入れてもなお起きていた。

原因は `upkeepRatio` の意味の取り違えである。**実計算のまま残る系統(辺境統治・戦争)は
スタブ歳入とは別に treasury を使い続ける**ため、`upkeepRatio` はその実支出の代用ではない。
国が手元に残す純収入は:

```
純収入 = revenuePerCapitaPerYear × (1 − upkeepRatio) − 実支出
```

**実支出をライブ計測した**(歳入・支出をともに0にしてスタブ歳入を無効化したまま10年走行):

| 計測項目 | 実測値 |
| :--- | ---: |
| 生存国の総人口(ポイント) | 1,729 |
| 国庫の年間流出 | 224.8 / 年 |
| **人口1ポイントあたりの実支出** | **0.13 / 年** |

設計値の純収入は `0.12 × 0.05 = 0.006`。実支出 0.13 に対して**約22分の1**しかなかった。

較正後の既定値:

| 項目 | 設計時 | 較正後 | 根拠 |
| :--- | ---: | ---: | :--- |
| `revenuePerCapitaPerYear` | 0.12 | **0.30** | 実支出0.13を上回る純収入を確保 |
| `upkeepRatio` | 0.95 | **0.35** | 平時純収入 0.30×0.65−0.13 = **+0.065**/ポイント/年 |
| `warUpkeepMultiplier` | 1.6 | **1.8** | 戦時純収入 0.30×(1−0.63)−0.13 = **−0.019** → 長期戦争が国を傾ける |
| `floorRatio` | 0 | 0(据置) | 破産と滅亡を許す既定のまま |

較正後に50年再走行した結果:**30国中25国が拡張可能(閾値30以上)、破産0国、
国庫の分布は 25〜1,175(開始時は一律90)**。大国が優位を複利で拡大する
=「盛衰」が実際に起きる分布になった。

**教訓**: §6 が導入した「加算的歳入」という機構自体は正しかったが、
**実計算のまま残る系統の支出を計測せずに `upkeepRatio` を置いたため、機構があっても
設計が防ごうとした失敗がそのまま起きた**。数値は必ずライブ計測で決めること
(`advance-time-fast-forward.md` §9.2 と同じ教訓)。

### 13.4 H6 ライブ検証の結果

`chronicle` プロファイル、Playwright、実UI操作(⚡チェック → ⚙ → プロファイル選択 → 世代ボタン)。

| §10 受け入れ条件 | 結果 |
| :--- | :--- |
| ① 50年走行が60秒以内 | ✅ **6.8〜6.9秒**(30国/161バーグ、600 tick = 12/年) |
| ② 生成時の統治者の過半が死亡し `pastTitles` に記録が残る | ✅ 78年走行で**元の統治者13人全員が死亡**、`pastTitles` +22件。別シードの50年走行では45人死亡・101件 |
| ③ 少なくとも1国で版図が変化 | ✅ `cells.state` のフィンガープリントが変化 |
| ④ 全国家の国庫が0でない | ✅ **破産0国**、中央値607 |
| ⑤ `profile: "off"` が実装前と一致 | ✅ 歴史モードOFFで**1年=365 tick**(1日1tick)、加齢は年+1 |

補足の実測:

- **世代ボタン**は §7 の設計どおり地図ごとに変わる。人間中心の地図で
  「1世代 = 39年」、別の地図で「26年」。エルフ等の長命種族が混ざっても
  **中央値**を採るため人間中心の地図が数百年に化けることはない(§7 の意図どおり)。
- **非同期(rAFループ)経路でも正しく動く**:世代ボタンは `runTimeSimulation` を通り、
  78年/936 tick を12秒で完走した。

### 13.5 H0 の追加修正:閏日丸めによる境界の1年ずれ

ライブ検証中に、`ageFraction` 繰越だけでは**カレンダー上5年経過した瞬間にキャラクターが4歳しか
年を取っていない**ケースが出た。経過年は他の全システムと同じく平均グレゴリオ年
(`days / 365.2425`)で測るのに対し、カレンダーは整数日で進むため、閏日が平均(0.2425/年)より
少ない期間は**わずかに足りない側に落ちる**(50年走行後の実測残差 0.9991)。

累積ドリフトではない(50年 → 加齢ちょうど50年)が、境界で1年ずれて見えるのは実害があるため、
**半日ぶんの許容(`AGE_YEAR_EPSILON = 0.5 / 365.2425`)**を入れて吸収した。
最小の実ステップが1日(0.0027年)なので、余分な1年を誤って与えることはない。
回帰テスト2件(1826日 → +5歳、18262日 → +50歳)で固定した。

### 13.6 その他の実装上の判断

- **マスクされた系統は RNG を消費しない**(§5.1 の設計どおり)。
  歴史モードは通常 Advance とのシード互換を最初から放棄しているため、これで問題ない。
- **`shouldSuppressConflictAdvance` は変更不要だった**。同関数は
  `mayAdvanceAutonomousConflict()` に委譲しているので、そちらに歴史モードの上書きを1箇所
  入れるだけで §5.4 の反転が両方に効く。
- **Fast-Forward の乗算 treasury は歴史モード中だけ早期 return** させた
  (`fastAdvanceEconomy.ts`)。Goods の在庫・価格はプリセットのまま動かす——凍結すると
  歴史モードを抜けた直後の経済が不自然になるため(§6.4 の設計どおり)。
- **UIの系統一覧はレジストリから動的に列挙**した(`listRegisteredSimulationSystemIds()`)。
  系統が増えてもダイアログの更新漏れが起きない。
