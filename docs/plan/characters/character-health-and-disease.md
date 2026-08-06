# キャラクター健康・疾病システム設計

**Status**: 未実装（設計）。
**Related**: `docs/plan/urban-water-and-sanitation-system.md`, `docs/plan/characters/backstory-profile.md`, `src/extensions/characters/characterTypes.ts`, `src/extensions/characters/advanceAge.ts`, `src/extensions/nobility/index.tsx`, `src/extensions/economy/generators/urbanWaterSystem.ts`
**Goal**: `Character` に `health`（体調）を持たせ、居住する Burg の `sanitation`（衛生スコア）が低いと病気にかかりやすく、体調を崩し、死亡率が上がるようにする。あわせて、他に流用できる既存データ（年齢・種族寿命・富・容姿 vitality 軸など）を洗い出し、単発のスカラー減衰ではなく罹患イベントとして設計する。

---

## 0. 背景・問題意識

現状の `Character`（`src/extensions/characters/characterTypes.ts`）は年齢・容姿・スキル・性格・家族構成を持つが、**体調・病気の概念が存在しない**。死亡は `advanceCharacterAging()`（`src/extensions/characters/advanceAge.ts`）内の年齢ベースの単一ロールのみで決まる。

一方、Burg 側にはすでに公衆衛生スコアが存在する。

- `Burg.sanitation?: number`（0=不衛生〜100=衛生的、`burgs-generator.ts` で **50 に初期シード**。Economy 拡張が有効なら `urbanWaterSystem.ts` の `sanitationScoreFromSystem()` が年次更新する）
- `Province.sanitation?: number` / `State.sanitation?: number`（Burg 値のロールアップ。Economy 有効時のみ更新）
- `UrbanWaterSystem.healthPressure`（0–1、Economy 内部の中間値。汚染水・し尿負荷・上流輸入汚染などから算出済みだが、**現状は Burg Editor の表示にしか使われておらず、人口や個人には一切効いていない**）

つまり「不衛生な都市に住むと健康を害する」というデータ的な土台（`burg.sanitation`）はすでにあるのに、それを消費するシミュレーションが存在しない。`security` スコアも同じ状況（コメントに "no simulation effects yet" と明記）で、衛生・治安ともに「表示だけのダミー値」になっている。本設計は `sanitation` 側の消費者を作る。

重要な設計上の制約: Characters 拡張は Economy 拡張に依存できない（`AGENTS.md` §7.1、Economy は characters/nobility にとって optional）。`burg.sanitation` は Economy が無効でも `burgs-generator.ts` が 50 を必ずシードするため、**Economy の有無にかかわらず動く指標**として使える。Economy を有効にすると、その 50 が都市ごとに動的に変化し、健康システムの説得力が増す、という関係になる。

---

## 1. 使える既存データの棚卸し

ユーザー指示「他にも使えるデータが無いか確認」に対応する調査結果。

| データ | 出典 | 健康システムでの使い道 |
| :--- | :--- | :--- |
| `burg.sanitation` (0–100) | `Burg`（host） | **主要な罹患圧の入力**。低いほど感染確率が上がる。 |
| `province.sanitation` / `state.sanitation` | ロールアップ | `character.location` が burg を持たない場合のフォールバック。 |
| `character.age` / 種族成熟年齢 | `raceAge.ts` | 子供・高齢者は感染・重症化しやすい（現実の疫学と同じ非対称カーブ）。`advanceAge.ts` が既に `DECLINE_AGE_THRESHOLD` / `youngAdultCap` で年齢帯を扱っており流用できる。 |
| `race.lifespan` | `data/races.ts` | `advanceAge.ts` の `raceIgnoresAgeDecline()` / `LONG_LIVED_LIFESPAN_MIN` と同じ閾値で、長命種族（エルフ・ドワーフ等）は疾病耐性も高くする（人間基準の疫病に強い、という同じロジックの再利用）。 |
| `character.looks.vitality` | `AppearanceAxes` | 既存の「体力・頑健さ」軸。加齢で既に減衰している値をそのまま体質の初期値として使い、二重管理を避ける。 |
| `character.wealth` | `Character` | 富裕層は栄養・私医で罹患率・重症化率が下がる（`characterSimulationHooks.ts` の贈収賄/結婚判定と同様、既存の富データを行動に反映するパターンを踏襲）。 |
| `character.personality.energy` | `CharacterPersonality` | 小さな回復速度ボーナス（気力のある人は寝込む期間が短い）。任意・優先度低。 |
| `character.location` (burg id) | `Character` | 罹患圧を引く対象 Burg。`characterLifecycle.ts` で officer/lord は既に `state.capital` や `province.burg` を location にセットしているため、称号持ちのほぼ全員が有効な burg を持つ。 |
| `security` スコア（Burg/Province/State） | host | 本設計のスコープ外だが、`sanitation` と全く同じ「未消費フィールド」。将来、疫病発生時の治安悪化などで接続できる余地がある（後述「スコープ外」）。 |

このうち **v1 で実装するのは `sanitation` / `age` / `race.lifespan` / `looks.vitality` / `wealth`**。`energy` と `security` は任意拡張として v2 以降に回す（後述）。

---

## 2. データモデル

### 2.1 `Character` への追加フィールド（`characterTypes.ts`）

```ts
/** Disease/affliction severity band — mirrors the coarse bands used elsewhere (SolidarityBand 等)。 */
export type AfflictionSeverity = "mild" | "moderate" | "severe" | "critical";

/** Catalog id — see AFFLICTION_CATALOG in characterHealth.ts. */
export type AfflictionKind = "fever" | "flux" | "pox" | "plague" | "wasting";

export interface CharacterAffliction {
  kind: AfflictionKind;
  severity: AfflictionSeverity;
  /** Year the affliction was first contracted (for flavor text / duration checks). */
  sinceYear: number;
  /** True once past the acute phase and only convalescing (lower death risk, still not cleared). */
  recovering?: boolean;
}
```

```ts
export interface Character {
  // ...既存フィールド...

  /**
   * 0–100 physical condition. 100 = full health. Declines from poor local sanitation
   * exposure, age, and active afflictions; drifts back toward a sanitation-capped
   * baseline when unafflicted. Distinct from `looks.vitality` (cosmetic decline) —
   * this is the functional, mortality-relevant stat. Missing on old saves/fixtures
   * means "never simulated yet"; treat as 100 via getCharacterHealth().
   */
  health?: number;
  /** Active sickness, if any. Absence = healthy (not necessarily health === 100). */
  affliction?: CharacterAffliction;
  /** Illnesses survived — optional flavor/prestige signal ("weathered the pox twice"). */
  timesIllness?: number;
}
```

`health` / `affliction` / `timesIllness` はすべて **optional**。理由:

- 既存の `makeCharacter` テストヘルパーが `src/extensions/{economy,nobility,characters}` 配下に 10+ 箇所あり、必須フィールド化すると全フィクスチャの改修が要る（`AGENTS.md` §5.1 が警告する「フィクスチャに新フィールドが無くて静かに壊れる」パターンそのもの）。
- `prestige`/`wealth` 等の既存必須フィールドも呼び出し側は `character.wealth ?? 0` のように防御的に読んでおり、同じ慣習に合わせる。

`personFactory.ts` の生成時 (`buildCharacter` 相当の箇所、L531 付近) では `health: 100` を明示的にシードする（新規キャラは満健康で生まれる）。

### 2.2 疾病カタログ（`characterHealth.ts` 内、新規）

`abilityPresets.ts` / `data/races.ts` と同様、静的テーブルとして定義する。

```ts
interface AfflictionDef {
  id: AfflictionKind;
  label: string;
  /** How strongly poor sanitation drives this affliction (0 = age/random only, 1 = fully sanitation-driven). */
  sanitationWeight: number;
  /** Relative pick weight among afflictions that pass their sanitation/age gate this roll. */
  pickWeight: number;
  /** Extra death-risk multiplier at "critical" severity, folded into advanceCharacterAging(). */
  criticalDeathRiskMultiplier: number;
  /** Only rollable when local sanitation is at/below this (0–100); undefined = no gate. */
  requiresSanitationBelow?: number;
}
```

初期エントリ（v1、数値は後述バランス定数を参照する調整可能な出発点）:

| id | label | 特徴 |
| :--- | :--- | :--- |
| `fever` | 熱病 | 汎用の街の熱病。sanitation 依存中程度、どの都市でも一定確率で発生。 |
| `flux` | 水腹（赤痢様） | sanitation 依存が最も強い（`sanitationWeight` 最大）。低衛生都市でのみ実質的に発生。 |
| `pox` | 発疹病 | 中程度の sanitation 依存、致死率は低いがフレーバー用（あばた等、将来 looks 連動も可）。 |
| `plague` | 疫病 | `requiresSanitationBelow` を持ち、極端に不衛生な都市でのみ稀に発生。重症化時の死亡リスクが最大。 |
| `wasting` | 消耗病 | sanitation 依存が低く、代わりに高齢に強く連動（結核様の慢性疾患）。 |

---

## 3. シミュレーションロジック

### 3.1 新規モジュール `src/extensions/characters/characterHealth.ts`

`advanceAge.ts` と同じ構造（`getCharacters()` を1回イテレートし in-place mutate、`getWorldContext()` で pack を読む）で実装する。

```ts
export function advanceCharacterHealth(deltaYears: number): void
```

処理順（1 キャラクターあたり）:

1. **死んでいたら skip**（`character.dead` チェック、`advanceAge.ts` と同じ）。
2. **ローカル衛生スコアを解決** — `resolveCharacterSanitation(character, pack)`:
   - `character.location` が有効な burg id なら `pack.burgs[location].sanitation ?? 50`。
   - 無効/未設定なら `pack.states[character.nationalityStateId ?? character.state]?.sanitation ?? 50`。
   - それも無ければ `50`（中立値、host のデフォルトシードに合わせる）。
3. **疾病耐性・脆弱性の乗数を計算** — `vulnerabilityMultiplier(character)`:
   - 年齢: `raceAge.ts` の成熟年齢未満（子供）、または人間換算 50 歳相当以上（高齢）で上昇。`advanceAge.ts` の `youngAdultCap` / `DECLINE_AGE_THRESHOLD` 相当の閾値をそのまま再利用（新しい年齢区分を作らない）。
   - 種族: `raceIgnoresAgeDecline(lifespan)` が true の長命種族は耐性側に大きく倍率を下げる（既存の「長命種族は人間基準の中年劣化を受けない」ロジックの流用）。
   - vitality: `character.looks?.vitality` が低いほど脆弱（既存軸をそのまま体質として再利用、新規ステータスを増やさない）。
   - 富: `character.wealth` が高いほど乗数を下げる（栄養・私医、上限あり）。
4. **既存の `affliction` があれば進行を解決**:
   - severity の悪化/軽快をロール（sanitation が改善すれば軽快しやすく、悪ければ悪化しやすい）。
   - `health` を severity に応じて追加で減算。
   - 回復ロール（vitality・wealth・sanitation が高いほど成功しやすい）→ 成功したら `affliction` を消し、`timesIllness++`。
5. **`affliction` が無ければ新規感染ロール**:
   - `infectionPressure = clamp01((SANITATION_SAFE_THRESHOLD - sanitation) / SANITATION_SAFE_THRESHOLD)` を基準に、`vulnerabilityMultiplier` を掛けた年間確率を `P()` でロール（`deltaYears` 分をスケール、`advanceAge.ts` の `survivalProb ** deltaYears` と同じ「複数年ぶん一括処理」の考え方に合わせる）。
   - 発症したら `AFFLICTION_CATALOG` から `sanitationWeight` と `requiresSanitationBelow` ゲートを満たすものだけを対象に重み付き抽選し、`severity: "mild"`（低確率で `"moderate"` スタート）を設定。
6. **`health` の目標値へのドリフト**:
   - 非罹患時: `targetHealth = 100 - chronicSanitationDrag(sanitation)`（`SANITATION_SAFE_THRESHOLD` 以上なら drag 0、それ未満で最大 `CHRONIC_HEALTH_DRAG_MAX` まで線形）に向けてゆっくり回復。「不衛生な街に住み続けるとイベントが起きなくても本調子には戻らない」という慢性的な体感を出す。
   - 罹患時: severity に応じた速度で減算（`critical` で最も速い）。

`advanceCharacterHealth()` は `Math.random()` ではなく `P()` / `rand()`（`../hostUtils` 経由）を使う。既存モジュールでも感染確率ロール相当の「フレーバー分岐」は `P()`、`advanceAge.ts` の生存ロール自体だけは生の `Math.random()` という使い分けがあるため、健康システムの感染/回復/悪化ロールは全て `P()` に統一し、`advanceAge.ts` 側の死亡ロールだけ次節の通り既存の `Math.random()` 実装に薄く連携する。

### 3.2 呼び出し位置

`advanceCharacterHealth()` は `advanceCharacterAging()` の**直前**に呼ぶ。両方とも `nobility/index.tsx` の `nobility.tick`（`src/extensions/nobility/index.tsx:315` 付近）から駆動されている、Characters 単体では誰も age/tick を進めない既存の構造（Nobility が Characters のライフサイクルの唯一の駆動源）に合わせる。

```ts
// src/extensions/nobility/index.tsx
advanceCharacterHealth(effectiveDeltaYears);   // ← 追加。health/affliction を先に確定させる
advanceCharacterAging(effectiveDeltaYears);     // 同一 tick 内で health を読んで死亡率に反映
```

`registerSimulationSystem` の `reads`/`writes` は変更不要（`map.settlements` は既に reads に含まれており、`burg.sanitation` はそこに属する。`extension.characters` は既に reads/writes 両方に含まれている）。

---

## 4. 死亡率への統合

死亡ロール・称号のクリーンアップ（`pastTitles` 移動、`deathYear` セット等）は `advanceAge.ts` に集約されたまま維持する（同ファイルの既存コメントが明言する設計意図: 「политичный consequences は Nobility 側、この関数自体は年齢・称号テーブル知識を持たない汎用エイジングパス」であり、死亡そのものの単一ロールという構造は崩さない）。

`advanceAge.ts` の該当箇所を最小差分で拡張する:

```ts
// 既存
const mortalityRisk = skipAgePenalty ? 0.002 : 0.01 + (newAge > 50 ? 1.15 ** (newAge - 50) / 100 : 0);

// 追加後
const diseaseRisk = diseaseDeathRiskFor(character); // characterHealth.ts からインポート、affliction 無しなら 0
const mortalityRisk = Math.min(0.99, baseMortalityRisk + diseaseRisk);
```

`diseaseDeathRiskFor()`:

- `affliction` が無ければ `0`。
- あれば `severity` × `AFFLICTION_CATALOG[kind].criticalDeathRiskMultiplier` × `vulnerabilityMultiplier` から算出（`mild` はごく小さく、`critical` は既存の高齢死亡リスクと同オーダーになるよう調整）。
- `health` が既に非常に低い（例: 20 未満）場合、affliction が無くても小さな底上げ項を足す（「慢性的に弱っている」ことそのものの寄与）。

死因フレーバーも既存の分岐パターン（`Assassinated` / `Slain in battle`）に合わせて拡張する:

```ts
if (character.affliction) {
  baseReason = `Died of ${AFFLICTION_CATALOG[character.affliction.kind].label}`;
}
```

---

## 5. UI

v1 は最小限、`CharacterDetailsDialog.tsx` の既存ステータス表（Prestige/Wealth 行が並んでいる箇所、L784–791 付近）に 1 行追加する:

- `Health` 行: `78/100` のような表示。
- `affliction` があれば、隣にステータスチップ（例: 「Sick — Flux (moderate)」）を出す。
- `character.dead` の死亡理由表示（既存の `statusText`、L398–400 付近）は `deathYear` と併せて `baseReason` をそのまま表示しているため、疾病死のフレーバー文（「Died of the pox」等）は追加コード無しでそのまま出る。

v2 以降（本 PR のスコープ外、後述）:

- `CharactersOverviewDialog` / `CharactersTable` に Health 列。
- `BurgEditorCharactersTab` に「住民のうち N 人が罹患中」の集計表示。
- `BurgEditorWaterTab` / `burgEconomySummary` の sanitation 表示に「住民の健康への影響」の脚注。

---

## 6. 拡張非依存性の確認

- `characterHealth.ts` は `getWorldContext()`（= `charactersContext.ts` 経由の `ExtensionAPI.worldContext`）以外の import を host モジュールから行わない。`src/extensions/economy/*` への直接 import は無し。
- 読むのは `pack.burgs[].sanitation` という **host が生成する素の pack フィールド**（`burgs-generator.ts` が Economy 無効時でも 50 をシードする）であり、Economy 拡張の内部モジュール（`UrbanWaterSystem` 型や `sanitationScoreFromSystem()`）には触れない。
- したがって Economy が無効な場合、全 Burg の sanitation は常に 50 固定 → 罹患圧は「都市差の無い、ゆるいベースライン疾病」になる。Economy を有効にすると Burg ごとに sanitation が動的に変わり、都市の衛生投資が実際に住民の健康に跳ね返るようになる。これは `AGENTS.md` の built-in extension 表にある「economy は optional」という制約を満たしたまま、Economy 有効時の価値を積み増す設計になっている。

---

## 7. バランス定数（出発点、要チューニング）

`characterHealth.ts` からエクスポートする、`advanceAge.ts` の `DECLINE_AGE_THRESHOLD` 等と同じ「調整可能な named export」スタイル:

| 定数 | 初期値 | 意味 |
| :--- | :--- | :--- |
| `SANITATION_SAFE_THRESHOLD` | 60 | これ以上なら罹患圧ほぼ 0。 |
| `CHRONIC_HEALTH_DRAG_MAX` | 20 | 最悪の衛生状態で health の回復上限がここまで下がる。 |
| `BASE_ANNUAL_INFECTION_RATE` | 0.12 | sanitation=0 のときの年間感染確率の目安。 |
| `VULNERABLE_AGE_MULTIPLIER` | 1.6 | 子供・高齢者の罹患圧倍率。 |
| `LONG_LIVED_RESISTANCE_MULTIPLIER` | 0.4 | `LONG_LIVED_LIFESPAN_MIN` 超種族の罹患圧倍率。 |
| `WEALTH_CARE_MITIGATION_CAP` | 0.35 | 富裕層による罹患圧の最大軽減率。 |

これらは実際の年代記シミュレーション（複数世代プレイ）で「都市部貴族が早死にしすぎる/しなさすぎる」を見ながら調整する前提の初期値であり、実装 PR 内で確定させる。

---

## 8. テスト方針

- 新規 `src/extensions/characters/characterHealth.test.ts`（`advanceAge.test.ts` と同じ構成: `Math.random` をモックして決定的にする）。
  - 低 sanitation は高 sanitation より感染確率が高い。
  - 長命種族は同条件で罹患圧が下がる。
  - 富裕キャラは同条件で罹患圧が下がる。
  - `affliction` の重症化/軽快/回復が境界値で正しく遷移する。
  - `health` が無い（`undefined`）キャラでも例外を投げず 100 扱いで動く。
- `advanceAge.test.ts` の既存ケース: `affliction` 無しキャラでは `diseaseRisk` が 0 になり、**既存の期待値を変えない**ことを回帰確認する（`AGENTS.md` §5.1 の「共有ロジックを触ったら既存フィクスチャを監査する」に対応)。
- `nobility` 側の tick 統合テストがあれば、`advanceCharacterHealth` が `advanceCharacterAging` より前に呼ばれる順序をアサートする。

---

## 9. 実装フェーズとスコープ外

**v1（本設計が対象）**: §2〜§8 のみ。`health` / `affliction` フィールド、`characterHealth.ts`、`advanceAge.ts` への死亡率フック、`CharacterDetailsDialog` の 1 行追加。

**明示的にスコープ外**（"具体的な次タスクが無い限り作らない" 方針に従い、着手しない):

- Overview テーブルの Health 列・Burg 単位の罹患集計 UI。
- `security` スコアとの相互作用（疫病時の治安悪化など）。
- 遠征中の兵士に対する「本国の sanitation ではなく戦場衛生」の別ルート。
- 疾病の伝染（キャラクター間 or Burg 間で "うつる" モデル）— 現状は各キャラクター独立ロールのみ。
- `timesIllness` を backstory の taste/hook に反映するフレーバー生成。

これらは必要になった時点で別設計として起こす。

---

## 10. 未確定事項（実装前に決めること）

1. `AfflictionKind` のラベル文言（英語 UI コピー、`AGENTS.md` §3 に従い英語で確定させる）。
2. §7 のバランス定数の初期値の妥当性（プレイテストで調整前提の仮値であることの合意）。
3. `health` を `CharacterDetailsDialog` にどう見せるか（プログレスバー風 vs 数値のみ）— 既存の Prestige/Wealth 行の表現に合わせるだけなら数値のみで十分。
