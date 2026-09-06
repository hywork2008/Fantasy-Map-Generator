# 歴史の奥行き(前史・在職履歴・国境変遷)設計

## 状態

**設計のみ。未実装。** 2026-09-06 起票。`docs/plan/fictional-map-feature-gaps.md` の
**項目2「歴史の奥行き(前史・国境変遷)」** を個別設計に落としたもの。

起票のきっかけは2つある。

1. `docs/plan/advance-time-fast-forward.md` の Phase 1〜3 が実装完了し、**年単位で時間を進めるコストが
   実用域に入った**こと。「前史を実際にシミュレートして走らせる」という、以前は非現実的だった選択肢が
   設計の俎上に載った(§5)。
2. ユーザー指摘:**「キャラクターが役職に就くのがゲーム開始時点になっている」**。老齢の為政者が
   「今年即位した」ことになっている状態を解消したい(§3)。

本書は上記2点を、**独立して着手できる3レイヤ**に整理する。Layer A(在職履歴)は他レイヤに依存せず
単独で完結し、投資対効果が最も高い。Layer B/C は段階的に積み増す。

## 関連ドキュメント

| Doc / Code | 関係 |
| :--- | :--- |
| `docs/plan/fictional-map-feature-gaps.md` §2 | 本書の親。「掘り下げる際の論点」4点に §4/§5/§6/§7 で回答する |
| `docs/plan/advance-time-fast-forward.md` | Layer C の実行基盤。FF が何を実計算のまま残すかの一覧が §5.2 の根拠 |
| `docs/plan/advance-time-history-mode.md` | **Layer C の実装基盤(2026-09-06 追加)**。系統マスク・月ストライド・スタブ歳入。§0 の加齢バグは Layer C の前提 |
| `docs/plan/technology-prehistory-rome-medieval.md`(roadmap §16) | `technologyPrehistory.ts` の18ノード。Layer C の技術側入力候補(§5.5) |
| `docs/plan/characters/backstory-profile.md` | `CharacterOrigin` / `socialStratum` / `lineageId`。Layer A2 の前職生成が接続する先 |
| `docs/plan/diplomacy-history.md` | 既存の戦争年代記。Layer B の取り込み元 |
| `src/extensions/nobility/generators/characterLifecycle.ts` | 現行の `startYear` 付与地点(唯一バックデートしている箇所を含む) |
| `src/extensions/characters/raceAge.ts` | `careerStartAge()` / `scaleHumanAgeToRace()`。Layer A の年齢換算基盤 |
| `src/generators/states-generator.ts` | `generateCampaign()` / `generateDiplomacy()`。既存の前史資産と、Layer B が回収すべき TODO |
| `src/generators/markers-generator.ts` | `battlefields` は既に campaign と因果接続済み。`ruins` は未接続 |
| `src/store/optionsState.ts` | `year`(既定 100)/ `era`。§3.7 の世界暦下限問題の当事者 |

---

## 1. 現状の正確な把握

### 1.1 「世界は今日始まった」問題の分布

年号を持ち得るエンティティを全部洗い出すと、実装状態は3つに割れる。

| エンティティ | 年号フィールド | 現状 | 評価 |
| :--- | :--- | :--- | :--- |
| 国家の戦役 | `State.campaigns[].start/end` | `gauss(year-100, 150, 1, year-6)` で**過去100年程度に散る**([states-generator.ts:412](src/generators/states-generator.ts#L412)) | ✅ 唯一まともに歴史がある |
| 外交年代記 | `states[0].diplomacy` に間借り | `yearsAgo` 1〜100年で生成([states-generator.ts:655-664](src/generators/states-generator.ts#L655-L664)) | ⚠️ データはあるが置き場所が hack(§4.2) |
| 国家元首の在位 | `TitleHolding.startYear` | `currentYear - rand(0, age - careerStartAge)` で**バックデート済み**([characterLifecycle.ts:154](src/extensions/nobility/generators/characterLifecycle.ts#L154)) | ⚠️ 分布が非現実的(§3.2) |
| 中央官職 | 同上 | 同上([characterLifecycle.ts:199](src/extensions/nobility/generators/characterLifecycle.ts#L199)) | ⚠️ 同上 |
| 属州領主 | 同上 | **`startYear: getCurrentYear()`**([characterLifecycle.ts:382](src/extensions/nobility/generators/characterLifecycle.ts#L382)) | ❌ 全員が今年着任 |
| 将官 / 提督 | 同上 | **`startYear: getCurrentYear()`**([characterLifecycle.ts:338](src/extensions/nobility/generators/characterLifecycle.ts#L338)) | ❌ 全員が今年着任 |
| ギルドマスター / 徒弟 | `CharacterRole.startYear` | **フィールドを設定していない**([guildSuccession.ts:88](src/extensions/economy/generators/guildSuccession.ts#L88), [:99](src/extensions/economy/generators/guildSuccession.ts#L99)) | ❌ `undefined`(UI は空欄) |
| 市場管理者 / 競合商人 | 同上 | **未設定**([marketManagers.ts:30](src/extensions/economy/generators/marketManagers.ts#L30), [:40](src/extensions/economy/generators/marketManagers.ts#L40)) | ❌ |
| 商会役職 | 同上 | **未設定**([merchantOrganizations.ts:385](src/extensions/economy/generators/merchantOrganizations.ts#L385)) | ❌ |
| 国家銀行家 | 同上 | **未設定**([moneylenders.ts:269](src/extensions/economy/generators/moneylenders.ts#L269)) | ❌ |
| バーグ市場商人 | 同上 | **未設定**([burgMarketLedgers.ts:24](src/extensions/economy/generators/burgMarketLedgers.ts#L24)) | ❌ |
| 家門(Dynasty) | — | **年号フィールドそのものが無い**([characterTypes.ts:271-282](src/extensions/characters/characterTypes.ts#L271-L282)) | ❌ 創設年不明 |
| バーグ | `Burg.foundedYear` | `= options.year`([burgs-generator.ts:919](src/generators/burgs-generator.ts#L919)) | ❌ 全都市が今年建設 |
| 遺跡マーカー | — | 完全ランダム配置、因果なし | ❌ |
| 戦場マーカー | (legend 文字列) | `campaign` から日付を引いている([markers-generator.ts:985-990](src/generators/markers-generator.ts#L985-L990)) | ✅ 唯一の因果接続 |
| 版図(国境) | — | 履歴なし | ❌ |

つまり **「歴史がある」のは国家間戦争だけで、人・組織・都市は全員が世界の初日に生まれている**。

### 1.2 既に存在する「歴史の器」(新規に作る必要がないもの)

設計上重要なのは、**器はほとんど揃っている**という点である。

- `TitleHolding` は `startYear` / `endYear` / `reason` を持つ([characterTypes.ts:24-26](src/extensions/characters/characterTypes.ts#L24-L26))。
  `CharacterRole` も同様([characterTypes.ts:38-40](src/extensions/characters/characterTypes.ts#L38-L40))。
- `Character.pastTitles: TitleHolding[]` が存在し([characterTypes.ts:426](src/extensions/characters/characterTypes.ts#L426))、
  実行時の死亡・継承・簒奪はすべてここに正しく積む
  ([advanceAge.ts:177](src/extensions/characters/advanceAge.ts#L177), [debtCoup.ts:54](src/extensions/economy/generators/debtCoup.ts#L54),
  [legitimacyWar.ts:77](src/extensions/economy/generators/legitimacyWar.ts#L77))。
- `CharacterDetailsDialog` は現職の "since {year}" も過去職の年代範囲も**既に描画している**
  ([CharacterDetailsDialog.tsx:595](src/extensions/characters/ui/dialogs/CharacterDetailsDialog.tsx#L595), [:628](src/extensions/characters/ui/dialogs/CharacterDetailsDialog.tsx#L628))。

**生成時点で `pastTitles` が空で `startYear` が今年なだけ**であり、実行時のパイプラインは完成している。
Layer A は「実行時なら正しく積まれるはずの履歴を、生成時に遡って捏造する」だけの作業になる。

### 1.3 `startYear` の書き込み側/読み出し側(改変の影響半径)

`TitleHolding.startYear` を読むのは以下だけである(テストを除く)。

| 読み手 | 用途 | バックデートの影響 |
| :--- | :--- | :--- |
| `CharacterDetailsDialog.tsx:595/628/729/745` | 表示・コピー用テキスト | 意図した効果そのもの |
| `debtCoup.ts:51/68/77` | 簒奪時に旧職を `endYear: startYear` で閉じる | 影響なし(相対処理) |
| `legitimacyWar.ts:76/91` | 同上 | 影響なし |
| `characterLifecycle.ts:716` | 継承時に現職の `startYear` を現在年へ更新 | 影響なし |

**シミュレーションの数値ロジックは一切 `startYear` を読んでいない。**
`technologyProgress.ts` の `heldLongEnough()`([:1554](src/generators/technologyProgress.ts#L1554))は
名前が紛らわしいが、読むのは `TechnologyProgress.discoveredYear` / `demonstratedYear` であって在職年ではない。

→ **Layer A は経済・技術・軍事の均衡に対して非破壊である。** これが Layer A を最初に置く根拠。

---

## 2. 設計方針:3レイヤ

| Layer | 内容 | 何が本物になるか | コスト | 依存 |
| :--- | :--- | :--- | :--- | :--- |
| **A. 在職履歴のバックデート** | 生成時に就任年と前職を統計的に捏造する | 人物の経歴(因果はない) | 小 | なし |
| **B. 年表の一級市民化** | 既存 campaign / 外交年代記 / 遺跡を1本の `pack.chronicle` に統合し、マーカーを因果接続する | 出来事どうしの因果 | 中 | A(人物を年表に載せるなら) |
| **C. 前史シミュレーション** | 生成年を N 年巻き戻し、Fast-Forward で現在まで走らせる | 全部(継承・戦争・都市・国境が実際に起きた結果になる) | 大 | A, B |

**Layer A と B は Layer C 導入後も無駄にならない。** Layer C は「世界の初日」を過去にずらすだけで、
その初日時点の人物は依然として履歴ゼロで生まれるため、Layer A は Layer C の初期化処理として
そのまま再利用される。B の `pack.chronicle` は Layer C の出力先になる。

以下 §3 で Layer A(ユーザー要望の本体)を実装可能な粒度まで、§4/§5 で B/C を方針レベルまで設計する。

---

## 3. Layer A:在職履歴のバックデート

### 3.1 現行バックデートの何が問題か

国家元首と中央官職だけは既にバックデートされている。式は:

```ts
startYear: currentYear - rand(0, Math.max(0, ruler.age - careerStartAge(rulerIds.raceId)))
```

`careerStartAge()` は人間20歳相当を種族暦に換算した値([raceAge.ts:235](src/extensions/characters/raceAge.ts#L235))。
この式には4つの問題がある。

#### 問題1:一様分布は在職年数の分布として誤っている

`rand(0, age - 20)` は「成人後のどの時点で就任したか」を一様に置く。65歳の王なら在位0年と在位45年が
等確率になる。だが定常的に交代する役職を任意の時点でスナップショットしたときの**経過在職年数**は、
交代がポアソン的なら**指数分布**に従う(検査のパラドクス:平均在職T年の役職を覗くと経過年数の
期待値もT年、ただし短い方に密度が寄る)。一様分布は「在位40年超の老王」を過剰生産する。

#### 問題2:世襲位と任命職を同じ式で扱っている

王位は「先代の死」という外生イベントで移る。就任年齢の分布(16〜45歳あたりに山)が先にあり、
在位年数はその差として**従属的に決まる**。一方、宰相や将軍は任期・罷免・栄転で回るので、
在職年数の分布が先にあって就任年齢は従属する。同じ式で両方は表現できない。

#### 問題3:長命種族で暦年が負になる

`options.year` の既定値は **100** である([optionsState.ts:478](src/store/optionsState.ts#L478))。
エルフ(`lifespan: 750`, `fertilityStart: 100` — [races.ts:97](src/data/races.ts#L97), [:105](src/data/races.ts#L105))で
統治者年齢をロールすると:

- `careerStartAge` = `scaleHumanAgeToRace(20)` = 100 + (4/59)×650 ≈ **144**
- 統治者年齢上限 = `scaleHumanAgeToRace(65)`(`HUMAN_RULER_MAX`) = 100 + (49/59)×650 ≈ **640**
- → `rand(0, 496)` ⇒ `startYear` は最低 **100 − 496 = −396**

**現時点で既に負の暦年が生成され得る。** UI はそれをそのまま "since -396" と描画する。
§3.7 で暦の下限を明示的に設計する。

#### 問題4:`startYear === 0` が表示から消える

`CharacterDetailsDialog.tsx:595` は `{titleHolding.startYear ? ... : ""}` と truthy 判定している。
バックデート幅が広がると 0 年が到達可能になり、**その人物だけ就任年が空欄になる**。
`!== undefined` 判定へ直す(小さいが Layer A で必ず踏むバグ)。

#### 問題5:前職が空

在位30年の王も、`pastTitles` は空配列である。「30年前に何をしていたのか」がどこにもない。

### 3.2 新モジュール `appointmentHistory.ts`

配置: `src/extensions/characters/appointmentHistory.ts`(`raceAge.ts` と同階層。
`characters` 拡張が種族年齢換算を所有しているため、nobility/economy 双方から import できる位置に置く)。

nobility と economy の**両方**から呼ばれるので、`characters` 側に置いて `hostCore` 経由で公開する
(既存の `careerStartAge` と同じ経路)。

```ts
/** 役職の性格。世襲位か、回転する任命職か。 */
export type AppointmentKind = "hereditary" | "appointed" | "vocational";

export interface AppointmentProfile {
  kind: AppointmentKind;
  /** hereditary/vocational: 就任年齢の人間換算バンド */
  accessionAgeBand?: [number, number];
  /** appointed: 平均在職年数(人間換算) */
  meanTenureYears?: number;
  /** 在職年数の人間換算上限(定年・任期の上限) */
  maxTenureYears?: number;
}

export interface RollAppointmentYearOptions {
  currentYear: number;
  age: number;
  raceId: number | undefined;
  profile: AppointmentProfile;
  /** 暦の下限。これより前には遡らない(§3.7)。 */
  epochFloorYear: number;
  rng?: () => number;
}

/** 就任年(暦年)を返す。必ず epochFloorYear <= 戻り値 <= currentYear。 */
export function rollAppointmentYear(options: RollAppointmentYearOptions): number;

/** roleClass / 役職種別から AppointmentProfile を引く。 */
export function resolveAppointmentProfile(
  roleClass: CharacterRoleClass | string,
  hints?: { landed?: boolean; formName?: string; kind?: string }
): AppointmentProfile;
```

#### アルゴリズム

```
tenureHuman :=
  kind === "hereditary" | "vocational":
      accessionHuman ← 一様(band[0], band[1]) を人間年で引く
      accessionRace  ← scaleHumanAgeToRace(accessionHuman, profile)
      tenureRace     ← max(0, age − accessionRace)
  kind === "appointed":
      T        ← scaleHumanDurationToRace(meanTenureYears, profile)
      ceiling  ← min(age − careerStartAge(raceId), scaleHumanDurationToRace(maxTenureYears, profile))
      tenureRace ← 切断指数分布: −T · ln(1 − u·(1 − e^(−ceiling/T)))     u ~ U(0,1)

tenureRace ← min(tenureRace, age − careerStartAge(raceId))       // 成人前には就任しない
tenureRace ← max(0, tenureRace)
startYear  ← clamp(currentYear − round(tenureRace), epochFloorYear, currentYear)
```

切断指数分布は逆関数法で1回の `rng()` 消費に収まる(RNG 決定性契約 §3.8)。

#### プロファイル表(人間年基準、`scaleHumanAgeToRace` で種族換算)

| 役職 | kind | 就任年齢バンド / 平均在職 | 在職上限 | 根拠 |
| :--- | :--- | :--- | :--- | :--- |
| 国家元首(世襲・`landed: true`) | hereditary | 就任 16–45 | — | 先代の死で継承。`HUMAN_RULER_MIN/MAX` 28–65 と整合(在位0〜49年) |
| 国家元首(選挙制・神権制) | appointed | 平均 12 年 | 35 年 | `HUMAN_ELECTED_MIN/MAX` 35–75 の年齢帯と両立させる |
| 属州領主(`province_lord`) | hereditary | 就任 18–45 | — | 元首と同じ世襲構造 |
| 中央官職(`central_officer`) | appointed | 平均 10 年 | 30 年 | 宰相・大蔵卿。栄転/罷免で回る |
| 中央官職(宗教職 `religious`) | appointed | 平均 18 年 | 45 年 | 終身職に近い |
| 将官 / 提督(`commander`) | appointed | 平均 8 年 | 25 年 | 戦死・転属が多い |
| ギルドマスター | vocational | 就任 30–50 | — | 徒弟→職人→親方の年功。`guildSuccession.ts` の継承と整合 |
| ギルド徒弟 | vocational | 就任 12–17 | — | `HUMAN_APPRENTICE_MIN/MAX` と一致 |
| 市場管理者 / 商会役職 | appointed | 平均 9 年 | 30 年 | — |
| 国家銀行家 | appointed | 平均 11 年 | 35 年 | — |
| バーグ市場商人 | vocational | 就任 22–40 | — | 生業。転職しない |

**「バンドが年齢を超える」ケースの扱い**:`accessionRace > age` になったら `tenureRace = 0`
(=「今年就任した若い当主」)。これは正しい挙動で、若い王が新任なのは自然。

### 3.3 適用箇所(呼び出しサイト一覧)

| ファイル:行 | 現状 | 変更後 |
| :--- | :--- | :--- |
| `characterLifecycle.ts:154`(元首) | 一様 rand | `rollAppointmentYear({kind: hereditary or elected})` |
| `characterLifecycle.ts:199`(中央官職) | 一様 rand | `rollAppointmentYear({kind: appointed, religious 判定込み})` |
| `characterLifecycle.ts:338`(将官/提督) | `getCurrentYear()` | `rollAppointmentYear({commander})` |
| `characterLifecycle.ts:382`(属州領主) | `getCurrentYear()` | `rollAppointmentYear({province_lord})` |
| `guildSuccession.ts:88/99` | 未設定 | `startYear` を追加 |
| `marketManagers.ts:30/40` | 未設定 | 同上 |
| `merchantOrganizations.ts:385` | 未設定 | 同上 |
| `moneylenders.ts:269` | 未設定 | 同上 |
| `burgMarketLedgers.ts:24` | 未設定 | 同上 |

**変更してはならない箇所**(実行時の実イベントであり、現在年が正しい):

- `characterLifecycle.ts:639/716/766` — 継承・後任任命
- `humanCapitalAllocation.ts:90/163` — 実行時の人材再配置
- `characterPopulation.ts:103/152` — バーグ住民生成/プレイヤーキャラ作成は
  `BurgEditorCharactersTab.tsx:45` からのユーザー操作であり、実際に「今」作られた人物

#### 生成時と実行時の切り分け方

economy 側の役職ファクトリ(`createMasterRole()` 等)は**世界生成時にも実行時にも**呼ばれる。
`startYear` をファクトリ内で決め打ちすると実行時の新任者まで遡ってしまう。

→ ファクトリのシグネチャに `startYear: number` を必須引数として足し、
**呼び出し側が「これは世界生成のシードか、実行時の任命か」を判断する**。
判断基準は既存の world-gen フラグを使う(economy 拡張の初期シード関数群と、
`simulationSystem` の tick から来る経路は既に分かれている)。実装時に各ファクトリの
呼び出し元を1つずつ確認すること。曖昧な経路は**実行時扱い(= `getCurrentYear()`)を既定**とし、
遡らせない方に倒す(誤って歴史を捏造するより、履歴が無い方が害が小さい)。

### 3.4 Layer A2:前職の生成(cursus honorum)

`startYear` を遡らせると「では就任前は何をしていたのか」が空白になる。A2 はそこを埋める。
**A1(§3.2–3.3)とは独立に後付けできる**ため、フェーズを分ける。

生成規則(`generateCursusHonorum(character, currentTitle, profile)`):

- **在職年数が短い(< 人間換算5年相当)場合は何もしない。** 前職を捏造する必然性がない。
- `kind === "hereditary"`(元首・属州領主):就任前は成人〜就任までの空白。
  `backstory.origin.socialStratum` が `royal` / `high_noble` なら
  「先代の下での宮廷職1つ」を確率 0.5 で `pastTitles` に足す。それ以外は空のまま。
- `kind === "appointed"`(中央官職・将官):成人から現職就任までの年数を、
  同じ `AppointmentProfile` から引いた在職年数で**後ろから埋める**(最大2職、最小在職3年)。
  下位の官職から順に(将軍 ← 部隊長、宰相 ← 州財務官)。役職名は
  既存の `CENTRAL_OFFICES` テーブルと将官タイトルから、**現職より格下のものだけ**を引く。
- `kind === "vocational"`(ギルド):親方の前職は必ず「同じ domain の徒弟」。
  徒弟期間は `HUMAN_APPRENTICE_MIN..MAX` と `guildSuccession.ts` の昇進条件に整合させる。

生成された `TitleHolding` には `endYear`(= 次職の `startYear`)と
`reason`(i18n キー: `characters.tenureEnd.promoted` / `.dismissed` / `.retired`)を必ず入れる。
`CharacterDetailsDialog.tsx:628` が `({startYear} - {endYear})` で描画するため、`endYear` 欠落は "?" になる。

**家門(Dynasty)への波及**:`Dynasty` に `foundedYear?: number` を追加し
([characterTypes.ts:271](src/extensions/characters/characterTypes.ts#L271))、
`dynastyGenerator.ts` で創設者の最古の `startYear`(pastTitles を含む)を入れる。
これだけで家門一覧に「〜年創設」が出せる。

### 3.5 世界暦の下限問題(`epochFloorYear`)

§3.1 問題3 の通り、既定 `options.year = 100` に対してバックデート幅は最大数百年になり得る。
選択肢は3つ。

| 案 | 内容 | 評価 |
| :--- | :--- | :--- |
| 案1 | `startYear` を 1 以上にクランプ | 実装最小。ただし長命種族の元首が全員「1年即位」に団子になる。**却下** |
| 案2 | `options.year` の既定を 100 → 1000 に上げる | `getCurrentYear()` のフォールバックが既に `|| 1000` なので思想的には整合([charactersContext.ts:65](src/extensions/characters/charactersContext.ts#L65))。ただし**既存セーブ・既存シードの再現性を壊す**(`options.year` は `campaigns` 生成にも入る)。既定変更は破壊的 |
| 案3(**推奨**) | 負の暦年を正式に許容し、`options.year` 以前を「建国前(Before Founding)」として表示する | `startYear` は表示専用(§1.3)なので計算上は無害。UI 側のフォーマッタ1本で済む |

**推奨は案3 + 明示的な下限。**

```ts
/** 世界暦の下限。これより前の出来事は「太古」に丸める。 */
export function getWorldEpochFloorYear(): number {
  // 生成年から、その世界の最長命種族の統治者が遡り得る最大年数だけ引く。
  // 種族カタログに依存させることで、人間だけの世界では floor が options.year - 100 程度に収まる。
}
```

表示は `formatWorldYear(year)`(新規、`utils/` 配下):

- `year >= 1` → `"{year}"`
- `year <= 0` → `t("world.beforeFounding", { years: 1 - year })` → 日本語「建国前 397 年」/ 英語 "397 BF"

`CharacterDetailsDialog` の4箇所と、Layer B で年表を出す箇所はすべてこのフォーマッタを通す。
併せて §3.1 問題4 の `startYear ? ... : ""` → `startYear !== undefined ? ... : ""` を修正する。

### 3.6 RNG 決定性

`generateCharacters()` は先頭で `Math.random = Alea(seed)` を差し替える
([characterLifecycle.ts:113](src/extensions/nobility/generators/characterLifecycle.ts#L113))ため、
Layer A の追加ロールは**そのシード列に乗る**。

契約(`docs/simulation/advance-time.md` §7 に準じる):

- `rollAppointmentYear()` は **1回の呼び出しで消費する乱数を固定**する(hereditary=1回、appointed=1回)。
  分岐で消費数が変わるとシード互換性の議論が複雑になる。
- `generateCursusHonorum()`(A2)は既存ロールの**後ろ**で呼ぶ。前に挿すと既存キャラの
  外見・性格ロールがすべてずれ、既存シードの見た目が変わる。
- 既存シードの人物の名前・年齢・外見は**変わらない**ことをテストで固定する(§3.7)。
  在職年だけが変わる。

### 3.7 テスト方針

新規 `appointmentHistory.test.ts`:

1. `startYear <= currentYear` かつ `>= epochFloorYear` が常に成り立つ(全 roleClass × 全種族カタログの網羅)。
2. 就任年齢が `careerStartAge` を下回らない(= `age - tenure >= careerStartAge`)。
3. `age < careerStartAge` の異常入力で `startYear === currentYear`(例外を投げない)。
4. 切断指数分布:1万サンプルの平均在職年数が `meanTenureYears`(切断込みの理論値)の ±10% に入る。
5. **一様分布からの改善**を明示する回帰テスト:人間の統治者1万人で
   「在位30年以上」の比率が現行実装より有意に下がること。
6. 長命種族(エルフ)で `startYear` が `epochFloorYear` を下回らないこと(§3.1 問題3 の回帰)。

既存テストへの影響:`characterLifecycle.test.ts` に `startYear` を直値で期待している箇所が
あれば範囲アサーションに緩める。

`formatWorldYear()` のユニットテスト(正/0/負)と、i18n キー一致テスト(en/ja)を追加。

E2E:世界生成 → 適当な国の元首を開き、"since" が現在年と異なる個体が全体の過半を占めること。

---

## 4. Layer B:年表の一級市民化

親ドキュメントの論点3(「年代スライダーは関係史から逆算か、スナップショット保存か」)への回答は
**「まず年表を1本にまとめる。スナップショットは Layer C まで持ち込まない」**。

### 4.1 既存年代記の置き場所が hack である

`generateDiplomacy()` は戦争年代記を **`states[0].diplomacy` に押し込んでいる**
([states-generator.ts:434](src/generators/states-generator.ts#L434), [:864](src/generators/states-generator.ts#L864))。
コードにも `// TODO: record war in chronicle to keep state interface clean`
([:862](src/generators/states-generator.ts#L862))と明記されている。型は `any[]` の混成配列で、
先頭が戦争名の文字列、以降がイベントオブジェクトという不定形である。

### 4.2 `pack.chronicle` の導入

**訂正(2026-09-06、`advance-time-history-mode.md` 執筆時の再調査)**: 本節の初稿は
`ChronicleEvent` 型を新設する前提で書いていたが、**同名の型は既に
[`types/models.ts:749`](src/types/models.ts#L749) に存在する**。しかも実行時のイベント群
(小競り合い `localSkirmish.ts:47`、行軍捕獲 `marchCapture.ts:43`、戦闘解決
`battle-resolution.ts:260`、本拠奪還 `homeRecapture.ts:49`、海外関係
`overseasRelations.ts:380`、方針変更 `conflictDirector.ts:187`)が**既にこの型で年代記に
追記している**。したがって Layer B は新設ではなく**既存型の拡張と移設**である。

既存の形は最小限で、以下の弱点がある。

```ts
// 現行 — types/models.ts:749
export interface ChronicleEvent {
  id: string;
  yearsAgo: number;   // ← 絶対年ではなく相対年
  from: number;       // ← 国家 id 固定。バーグ/人物を指せない
  to: number;
  fromBurg?: number;
  toBurg?: number;
  action: string;     // ← 自由文字列。種別の型がない
  rawText: string;    // ← 英語決め打ち。i18n 不可
}
```

- **`yearsAgo` が相対年**なので、年が進むたびに
  [`timeEngine.ts:817-832`](src/generators/timeEngine.ts#L817-L832) が**全イベントを走査して
  加算している**。O(イベント数 × 年数) であり、長期走行でボトルネックになる
  (`advance-time-history-mode.md` §9.4)。
- **`rawText` が英語固定**で i18n されていない。
- **格納先が `states[0].diplomacy`** という間借り([:864](src/generators/states-generator.ts#L864))。

Layer B のやることは、この3点の解消である。

```ts
export type ChronicleEventKind =
  | "war.declared" | "war.joined" | "war.ended"
  | "state.founded" | "state.annexed"
  | "burg.founded" | "burg.sacked" | "burg.abandoned"
  | "ruler.acceded" | "ruler.died" | "ruler.usurped"
  | "house.founded"
  | "disaster";

/** 既存 ChronicleEvent の拡張。yearsAgo/from/to/action/rawText は移行期間中そのまま残す。 */
export interface ChronicleEvent {
  id: string;
  /** 新規:絶対暦年(負可、§3.5)。yearsAgo は year から導出する派生値に降格させる。 */
  year: number;
  /** 新規:型付きの種別。既存の自由文字列 `action` を置き換える。 */
  kind: ChronicleEventKind;
  /** 関与主体。存在する id のみ入れる(削除済みエンティティは name を残して id を落とす)。 */
  stateIds?: number[];
  burgIds?: number[];
  characterIds?: number[];
  provinceIds?: number[];
  /** 名前のスナップショット。エンティティが消えても年表が読めるようにする。 */
  labels: string[];
  /** i18n キー + パラメータ。rawText は英語互換のためのフォールバック。 */
  messageKey: string;
  messageParams?: Record<string, string | number>;
  rawText?: string;
}
```

`pack.chronicle: ChronicleEvent[]`(年昇順)。

移行手順:

1. `ChronicleEvent` に `year` / `kind` / i18n フィールドを**追加**する(既存フィールドは残す)。
   イベントを作る既存6箇所(§4.2 冒頭の訂正で列挙)に `year` と `kind` を埋めさせ、
   `yearsAgo` は `currentYear - year` の導出に切り替える。これで
   [`timeEngine.ts:817-832`](src/generators/timeEngine.ts#L817-L832) の全件走査加算が**丸ごと削除できる**。
2. 格納先を `states[0].diplomacy` から `pack.chronicle` に移す。
   `states[0].diplomacy` への push は**互換のため当面残す**(`DiplomacyHistoryDialog` の読み出しを
   `pack.chronicle` に切り替えた次のリリースで削除)。
3. `State.campaigns` は**残す**。`frontierAnalysis.ts:97`、`zones-generator.ts:74`、
   `demography-simulator.ts:574`、`military-generator.ts:1310`、`markers-generator.ts:985` が
   依存しており、置換は本レイヤのスコープ外。`campaigns` は `chronicle` へ**射影**する
   (chronicle が上位ビュー、campaigns が既存の下位インデックス)。
4. Layer A2 が生成した `pastTitles` から `ruler.acceded` / `ruler.died` イベントを射影する。
5. `io/save.ts` / `io/load.ts` にフィールドを追加。`auto-update.ts` に「chronicle 欠落時は
   campaigns から再構築」のマイグレーションを1本足す(`v1.3 added campaigns` と同じ形
   — [auto-update.ts:339](src/io/auto-update.ts#L339))。

**ストレージコスト**(親ドキュメントの論点3):1イベント ≈ 200 バイト、
国家30・1国あたり戦争5・人物イベント100とすると数百イベント = **数十 KB**。
国境ポリゴンのスナップショット(セル数ぶんの配列 × 年代数)とは2桁違う。
年表だけなら保存コストは問題にならない。

### 4.3 遺跡・廃道の因果接続(親ドキュメント論点2)

**完全置換ではなく2階建て**を採る。理由:`markers-generator.ts` の遺跡は密度パラメータ
(`min: 80, each: 1200`)でマップ全体に散らす役割があり、前史イベント由来のものだけでは
地図が寂しくなる。

- `addRuins()` を改修し、**配置候補セルが `chronicle` の `burg.sacked` / `state.annexed` の
  現場に近い場合はそのイベントを引用した legend を書く**。近くに該当イベントがなければ
  現行のランダム legend にフォールバックする。`addBattlefield()` が既に campaign で
  やっていること([markers-generator.ts:985-990](src/generators/markers-generator.ts#L985-L990))を
  遺跡へ横展開するだけで、新しい配置ロジックは要らない。
- 廃道は `routes-generator.ts` の街道グラフに `abandoned` フラグを足す案があるが、
  描画(破線スタイル)まで含めて Layer B のスコープ外とする。

### 4.4 UI

`DiplomacyHistoryDialog` を `pack.chronicle` 読み出しに切り替え、フィルタ(種別・国家・年代範囲)を
足せば「世界年代記」ダイアログになる。新規ダイアログを作るより既存導線を昇格させる方が安い
(`ToolsTab.tsx:66` の `diplomacyHistory` エントリをリネーム)。

---

## 5. Layer C:前史シミュレーション(Fast-Forward の逆用)

親ドキュメントの論点1(「1〜2代逆算 vs 軽量因果シミュレーション」)への回答:
**Fast-Forward が実装された今、第3の選択肢「本物のシミュレーションを短時間走らせる」が最も安い。**

### 5.1 方式

> **前提(2026-09-06 追記)**: 本節が想定する「N年走らせれば代替わりが起きる」は、
> `docs/plan/advance-time-history-mode.md` §0 の**加齢バグが直っていることが条件**である。
> 現行の Advance Time では `character.age` が1日刻みの丸めで一度も増えないため、
> 何年進めても老衰による襲位は発生しない。同書 Phase H0 が Layer C の必須前提となる。
> 走行の具体機構(系統マスク・月ストライド・スタブ歳入)は同書に委ね、本節は方式のみを述べる。


```
1. 通常どおり世界を生成する。ただし options.year = Y_target − N を設定する。
2. Layer A で、その時点の人物に在職履歴をシードする。
3. Fast-Forward を強制 ON にして N 年を進める(進捗ダイアログ付き)。
4. 到達した年 Y_target を「ゲーム開始年」としてユーザーに提示する。
   走行中に発生した全イベントは pack.chronicle(Layer B)に記録済み。
```

新規の逆算ロジックもミニ歴史エンジンも要らない。**既存の Advance Year をそのまま前史に使う。**

### 5.2 何が本物になり、何が偽物のままか

Fast-Forward は人口と経済決済をモック注入に置き換えるが、それ以外は実計算のままである。
特に重要なのは、**キャラクターの加齢・死亡・継承は Fast-Forward 中も実計算で走る**点である
(`advanceCharacterAging()` は nobility 拡張の tick から無条件に呼ばれる
— [nobility/index.tsx:323](src/extensions/nobility/index.tsx#L323))。
これは前史シミュレーションにとって決定的に好都合で、**N 年走らせれば王朝の代替わりが実際に起き、
`pastTitles` が実イベントで埋まる**。

| サブシステム | FF 中の扱い | 前史としての質 |
| :--- | :--- | :--- |
| キャラクター加齢・死亡・継承 | **実計算**([nobility/index.tsx:323](src/extensions/nobility/index.tsx#L323)) | ◎ 本物の王朝史が出る |
| 技術進行 | 実計算 | ◎ |
| 人口 | プリセット成長率で注入([timeEngine.ts:860](src/generators/timeEngine.ts#L860)) | △ 総量は動くが分布の因果は無い |
| 経済決済 | プリセット注入([economy/index.tsx:3492](src/extensions/economy/index.tsx#L3492)) | △ 前史としては許容(中間年を誰も検分しない) |
| 国庫 | 系統的支出をスキップ(FF Phase 3) | △ |
| 軍事解決 | `isBulkAdvance` で間引き済み | △ 戦争の勝敗が粗くなる |
| 国境変化 | 実計算(境界変動があれば起きる) | ◎ |

**「経済の中間年が偽物」は前史では実害が小さい**——ユーザーが見るのは Y_target の状態だけで、
中間の価格推移を検分しないため。逆に**キャラクター史と技術史は本物**になるので、
歴史の奥行きとして最も欲しい部分が正確に得られる。

### 5.3 コスト見積もり

`docs/analytics/fast-advance-calibration.json` の実測に基づく想定。1年あたりの FF コストを
実測値から取り、N=100 年で世界生成時間にどれだけ乗るかを **Phase C0 で必ず実測する**。

見積もりが「生成時間 +30秒」を超えるなら、N を短く(50年)するか、
前史を**オプトインのオプション**(生成設定に「前史を N 年シミュレートする」チェックボックス)に留める。
既定 OFF が妥当。

### 5.4 前史専用の抑制が要るもの

N 年走らせると副作用が出る系統。Phase C1 で個別に判断する。

- **技術進行**:100年進めると開始時点の技術水準が `era` 設定より進んでしまう。
  前史走行中は `technologyDevelopmentSpeed` を下げるか、走行後に `era` へ再スナップする。
- **人口**:プリセット成長率 +0.5%/年 × 100年 = ×1.65。生成時の目標人口を逆算して下げる必要がある。
- **`technologyPrehistory.ts`**(18ノード、現在未接続):前史走行の**開始時点の技術状態**として
  使うのが最も自然な接続先。roadmap §16 の「alt-start シナリオ」がここで意味を持つ。

### 5.5 国境変遷スライダー(論点3への最終回答)

Layer C を入れて初めて「国境が実際に動いた履歴」が存在する。それを見せるには
セル→国家の割当を年代ごとに保存する必要があり、コストは §4.2 の年表とは桁が違う。

推奨:**差分保存**。`chronicle` に `state.annexed` イベントを記録する際、
`changedCells: Int32Array`(移動したセル id のみ)を添える。全セルのスナップショットではなく
差分なので、現在の版図から逆再生できる。年代スライダーは「現在の `cells.state` を複製し、
選択年まで差分を逆適用する」だけで実装できる。

これは Layer C の完了後に着手する独立フェーズ(Layer D)とし、本書ではデータ形式の方針提示に留める。

---

## 6. 実装フェーズ

| Phase | 内容 | 依存 | 規模 |
| :--- | :--- | :--- | :--- |
| **A0** | `formatWorldYear()` + `getWorldEpochFloorYear()` + `startYear === 0` 表示バグ修正 + i18n | — | 小 |
| **A1** | `appointmentHistory.ts` 新設、§3.3 の9箇所を差し替え。**ユーザー要望の本体** | A0 | 中 |
| **A2** | `generateCursusHonorum()` で `pastTitles` を生成、`Dynasty.foundedYear` | A1 | 中 |
| **B1** | `pack.chronicle` 型定義 + `generateDiplomacy()` の出力先変更 + save/load + マイグレーション | — | 中 |
| **B2** | `pastTitles` → chronicle 射影、`addRuins()` の因果接続、`DiplomacyHistoryDialog` の年代記化 | A2, B1 | 中 |
| **C0** | 前史 N 年走行のコスト実測(既存 `scripts/lib/advanceYearHarness.ts` を流用) | B1 | 小 |
| **C1** | 前史走行の生成パイプライン組み込み + §5.4 の抑制 + 生成設定のオプトイン UI | C0, `advance-time-history-mode.md` H0–H5 | 大 |
| **D** | 国境差分の記録と年代スライダー | C1 | 大 |

**A0 → A1 だけで、ユーザーが指摘した「老齢の為政者が今年即位している」問題は解決する。**
A2 以降は歴史の厚みを増す追加投資であり、いつ止めても中途半端にならない。

## 7. リスク・非目標

### リスク

- **既存シードの互換性**:Layer A は `generateCharacters()` の RNG 消費数を変える。
  §3.6 の「既存ロールの後ろに挿す」を守っても、`rollAppointmentYear` が既存の `rand()` を
  置き換える以上、同一シードで**在職年は変わる**(名前・年齢・外見は不変)。
  これは受容する。リリースノートに明記する。
- **Layer C の技術/人口の二重進行**(§5.4)。実測なしに N を決めない。
- **`campaigns` と `chronicle` の二重管理**(§4.2 手順2)。射影の一方向性
  (campaigns → chronicle、逆は無し)を守らないと不整合が出る。

### 非目標

- 前史の**地図描画**(古地図モード、失われた国の版図の重ね描き)は本書のスコープ外。
  親ドキュメント項目5 の領域。
- 言語層の重なり(親ドキュメント項目7)。Layer C が動けば副産物として得られるが、
  地名の上書き機構そのものは項目1・7 の設計に譲る。
- ダンジョン内部・遺跡の内部構造(親ドキュメント項目5 の縮尺連続性)。

## 8. 未決定事項

1. §3.5 の暦下限:案3(負の年 + "建国前" 表示)で合意が取れるか。
   日本語表記を「建国前」とするか「太古」「開闢前」等にするか。
2. §3.3 の economy 役職ファクトリで、世界生成シードと実行時任命を区別する具体的な判定方法
   (呼び出し元の実地確認が必要)。
3. §5.3 の N(前史年数)。C0 の実測待ち。
4. Layer C を既定 ON にするか、オプトインに留めるか。生成時間への影響次第。
