# 疫病：上下水道インフラとコレラ (Epidemic — Water/Sewage Infrastructure and Cholera)

## 状態

**実装済み（2026-08-21）。** [disaster-mode.md](./disaster-mode.md) 優先度4「疫病」の実装前チェックで確認した、
既存のキャラクター単位疾病モデル（`characterHealth.ts`）と都市水道システム（`urbanWaterSystem.ts`）を、
「上下水道インフラの質」という専用シグナルで接続する。

## 1. 目的と非目的

### 目的

- 既存の`burg.sanitation`（衛生・汚物処理・洪水・臭気などを混ぜた単一の合成値）とは別に、**飲用水質そのもの**
  を表す`burg.waterSecurity`を新設し、上下水道インフラの状態を専用シグナルとして取り出す。
- キャラクター疾病カタログに`cholera`を追加し、既存疾病（一般衛生駆動）とは異なり**水質特化**でゲートする。
- 上下水道の悪化が名家キャラクターの健康だけでなく、**都市人口そのもの**にも被害を与えるようにする——
  `demography-simulator.ts`に水質駆動の人口損耗を追加し、`populationLossTracker`に`disease`死因を新設する。

### 非目的

- 気候異常・EU4型の「予兆→進行→発災→復旧」という離散的な災害サイクル（disaster-mode.md優先度0「災害共通
  基盤」待ち。river-levee-and-flood-damage.md §1と同じ理由で見送る）。
- 隔離・検疫という新規のプレイヤー操作可能なアクション（恒久投資は既存の上下水道・病院投資がそのまま担う。
  緊急対応の追加操作は範囲外）。
- 農村セル（`pack.cells`）への疫病死。史実的にもコレラは密集した都市の共有水源汚染が主因で、農村の分散した
  井戸・小川はリスクが大幅に低い。`urbanWaterSystem`はburg単位のインフラで、農村セルには水質データが無い。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| キャラクター疾病モデル | `AFFLICTION_CATALOG`に5種（fever/flux/pox/plague/wasting）。各`sanitationWeight`で`burg.sanitation`（単一合成値）に対する感受性を持つ。`requiresSanitationBelow`が発症ゲート。 | [characterHealth.ts:100-121](../../src/extensions/characters/characterHealth.ts#L100) |
| `burg.sanitation`の内訳 | `sanitationScoreFromSystem()`が`drinkingWaterSecurity*34 + (1-sanitationBurden)*24 + (1-waterContamination)*18 + (1-floodExposure)*7 + (1-odor)*5 + (1-healthPressure)*12`で合成——水質関連（`drinkingWaterSecurity`+`waterContamination`）だけで52%を占めるが、個別シグナルとしては公開されていない。 | [urbanWaterSystem.ts:894-903](../../src/extensions/economy/generators/urbanWaterSystem.ts#L894) |
| Burg→Province→State civic score のロールアップ先例 | `rollupProvinceAndStateSanitation()`がburgの値を人口非加重の単純平均でProvince/Stateへ積み上げる。`medicalCare`も同型（`hospitalInstallations.ts`）。 | [urbanWaterSystem.ts:1615-1659](../../src/extensions/economy/generators/urbanWaterSystem.ts#L1615) |
| Characters拡張はEconomy非依存 | `characterHealth.ts`は「Reads only plain pack fields — no Economy import」という明記された制約を持つ。`resolveCharacterSanitation()`はburg→state→定数のプレーンフィールド解決のみ。 | [characterHealth.ts:132-153](../../src/extensions/characters/characterHealth.ts#L132) |
| 人口レベルの死因追跡 | `DeathCause = "combat" \| "famine" \| "natural" \| "other"`で固定。`famine`は`demography-simulator.ts`の飢餓（`roomForGrowth<0`）からのみ生じ、疫病由来の人口死は存在しない。 | [populationLossTracker.ts:24](../../src/generators/populationLossTracker.ts#L24)、[demography-simulator.ts:246-252](../../src/generators/demography-simulator.ts#L246) |
| 既存のcivic scoreの生成時シード | `burgs-generator.ts`が新規burgに`security=50`/`sanitation=50`を播種——Economy未有効でも中立値からスタートする。 | [burgs-generator.ts:827-831](../../src/generators/burgs-generator.ts#L827) |

## 3. 設計

### 3.1 `burg.waterSecurity`: 水質特化の新規civic score

`sanitation`と同じ0–100（高いほど良い）のプレーンpackフィールドとして、`Burg`/`Province`/`State`の3型に追加する
（`types/models.ts`、`sanitation`/`medicalCare`と同じ並び）。

```ts
export function waterSecurityScoreFromSystem(system: UrbanWaterSystem): number {
  const score = system.drinkingWaterSecurity * 60 + (1 - system.waterContamination) * 40;
  return Math.max(0, Math.min(100, rn(score, 1)));
}
```

`sanitationScoreFromSystem()`が既に計算している2つのサブシグナル（`drinkingWaterSecurity`/`waterContamination`）
を、それらの相対比率（34:18 ≈ 60:40 に正規化）を保ったまま抽出するだけ——新しい生データは不要。

`buildSystems()`内、`burg.sanitation = sanitationScoreFromSystem(system)`のすぐ隣で`burg.waterSecurity`も
書き込む。ロールアップは`rollupProvinceAndStateSanitation()`を`rollupProvinceAndStateCivicScores()`に改名し、
同じburgループ内で`sanitation`と`waterSecurity`の両方を集計する（2回目のburgループを増やさない）。

`burgs-generator.ts`のcivic score播種ブロックに`burg.waterSecurity = 50;`を追加——Economy未有効時は常に
中立値（後述のしきい値ちょうど、圧力ゼロ）。

### 3.2 キャラクター疾病: `cholera`

`characterHealth.ts`の`AfflictionDef`に、既存疾病を壊さない後方互換な形で水質チャンネルを追加する。

```ts
interface AfflictionDef {
  // ...
  readonly waterWeight?: number; // 未指定 = 0（既存5疾病は無変更）
  readonly requiresWaterSecurityBelow?: number; // requiresSanitationBelowと並ぶ独立ゲート
}
```

```ts
function diseasePressure(def, sanitation, waterSecurity, isElder) {
  const sanitationPressure = normalize(SANITATION_SAFE_THRESHOLD - sanitation, 0, SANITATION_SAFE_THRESHOLD);
  const waterPressure = normalize(WATER_SECURITY_SAFE_THRESHOLD - waterSecurity, 0, WATER_SECURITY_SAFE_THRESHOLD);
  const ambientPressure = def.id === "wasting" && isElder ? 0.5 : 0.05;
  const waterWeight = def.waterWeight ?? 0;
  const ambientWeight = Math.max(0, 1 - def.sanitationWeight - waterWeight);
  return def.sanitationWeight * sanitationPressure + waterWeight * waterPressure + ambientWeight * ambientPressure;
}
```

`waterWeight`未指定（既存5疾病）なら`ambientWeight = 1 - sanitationWeight`となり、旧式の2項ブレンドと完全に
一致する——既存の`characterHealth.test.ts`の数値アサーションは無変更で通る。

```ts
cholera: {
  id: "cholera",
  label: "Cholera",
  sanitationWeight: 0.3,
  waterWeight: 0.7,
  pickWeight: 2,
  deathRiskMultiplier: 1.6, // calibration TBD — fluxとplagueの間、水系急性疾患として重め
  requiresWaterSecurityBelow: 55 // requiresSanitationBelowは意図的に付けない（後述3.3決定事項1）
}
```

`eligibleAfflictions()`は`requiresWaterSecurityBelow`もゲートに加える。`resolveCharacterWaterSecurity()`は
`resolveCharacterSanitation()`と全く同じburg→state→`WATER_SECURITY_DEFAULT(50)`の解決順を持つ新規関数。

### 3.3 人口レベルの疫病死: `demography-simulator.ts`

都市burgの人口ループに、既存の飢餓（`roomForGrowth<0`のときだけ発動）とは独立した水質駆動の損耗を追加する
——豊作で成長中の都市でも、水道が壊滅していれば人が死ぬ、という史実のコレラ流行の性質を反映する。

```ts
const waterSecurity = typeof burg.waterSecurity === "number" ? burg.waterSecurity : EPIDEMIC_WATER_SAFE_THRESHOLD;
if (waterSecurity < EPIDEMIC_WATER_SAFE_THRESHOLD) {
  const pressure = (EPIDEMIC_WATER_SAFE_THRESHOLD - waterSecurity) / EPIDEMIC_WATER_SAFE_THRESHOLD;
  const epidemicRate = Math.min(0.99, pressure * pressure * deltaYears * EPIDEMIC_RATE_SCALE);
  // starvationRateと同じ「4コホートへ一律乗算 + addLossで積算」パターン
}
```

`EPIDEMIC_WATER_SAFE_THRESHOLD = 50`は`burgs-generator.ts`の播種値と一致させる——Economy未有効時は
`waterSecurity`が常にちょうど50のままなので、圧力は常にゼロ。二乗しているのは、`starvationRate`の線形
（`Math.abs(roomForGrowth)*deltaYears*0.02`）とは違い、「中程度の水質はほぼ無害、崩壊した水道だけが
本当に危険」という疫学的な非線形性を出すため。

累積は既存の`naturalPts`/`faminePts`と同じパターンで新設する`epidemicPts`マップに積算し、ループ後に
`recordDeaths(stateId, pts * populationRate, "disease")`で計上する。

### 3.4 死因トラッキング: `disease`を第5のDeathCauseに昇格

`"other"`に埋めず、`"famine"`と同格の第1級カテゴリとして追加する——飢饉と疫病はプレイヤーの対応策
（灌漑・穀倉 vs 上下水道・病院）が全く異なるため、Population Overviewダイアログで区別できる価値がある。

- `populationLossTracker.ts`: `DeathCause`に`"disease"`追加、`emptyTotals()`/`getDeathsByState()`更新。
- `context/simulationContext.ts`: `PopulationLossDeathTotals`に`disease: number`追加。
- `services/simulationTelemetry.ts`: `DeathEvent.cause`のunionに追加。
- `ui/dialogs/PopulationOverviewDialog.tsx`: サマリー行・テーブルヘッダー・テーブル行に`famine`と対になる
  列を追加。
- `i18n/locales/{en,ja}.json`: `dialogs.population.disease`と`characters.afflictionKind.cholera`を追加
  （後者は`CharacterDetailsDialog.tsx`が`AFFLICTION_CATALOG.label`ではなくi18nキー経由で表示するため必須）。

## 4. 決定事項

1. **`cholera`は`requiresSanitationBelow`を持たない、`requiresWaterSecurityBelow`のみでゲートする。**
   一般衛生（廃棄物処理・悪臭など）がそこそこでも、飲用水系統だけが汚染されていれば発症しうる、という
   「水系伝染病はsanitation全般ではなく上下水道特有」というユーザーの要求を最も直接に表現する。
2. **`waterWeight`はオプトインで、未指定時は完全に旧式2項ブレンドへ縮退する。** 既存5疾病もテストも無変更。
3. **人口レベルの疫病死は都市burgのみ。農村セルは対象外。** `urbanWaterSystem`がburgスコープのインフラで
   あることに加え、史実的にも都市の共有水源汚染がコレラの主要経路。
4. **連続的な背景損耗として実装し、離散的な「発災イベント」は作らない。** river-levee-and-flood-damage.md
   §1の決定と同じ理由——disaster-mode.md優先度0の共通基盤が離散サイクルを設計する前提であり、先取りすると
   手戻りになる。将来、共通基盤が同じ`burg.waterSecurity`を読んで離散的な流行イベントを追加する形で
   自然に積み増せる。
5. **`disease`をDeathCauseの第5カテゴリとして正式追加する（`"other"`へ埋め込まない）。** 波及先は
   4ファイル+i18n2言語と把握済みの範囲で、`famine`と対になる可視性の価値がコストに見合う。
6. **`burgs-generator.ts`のみ播種し、State/Province/BurgEditor UIへの明示的な初期値設定は行わない。**
   `resolveCharacterWaterSecurity()`・`demography-simulator.ts`とも「値が無ければ中立値」のフォールバック
   を持つため機能的には不要——`sanitation`自身のJSDocが「古いセーブで欠落＝中立値」を正式な状態として
   認めているのと同じ扱い。BurgEditorDialog手動編集UIはフォローアップ候補（§6）。

## 5. テスト計画

- `urbanWaterSystem.test.ts`: `waterSecurityScoreFromSystem()`の計算、`rollupProvinceAndStateCivicScores()`
  がsanitationと同じ形でwaterSecurityも集計すること。
- `characterHealth.test.ts`: `resolveCharacterWaterSecurity()`のburg→state→既定値解決、choleraが
  `waterSecurity`のみで発症しsanitationが高くてもゲートされないこと（およびその逆で無効化されること）、
  既存5疾病の数値アサーションが無変更で通ること（回帰確認）。
- 新規`demography-epidemic.test.ts`: `burg.waterSecurity`が閾値未満の都市でのみ人口が減ること、閾値以上
  または未設定（Economy未有効）では無効果であること、`recordDeaths`に`"disease"`原因で計上されること。
- `populationLossTracker.test.ts`: `"disease"`原因の集計・ウィンドウ集計・telemetry転送。

## 6. フォローアップ候補（本書の範囲外）

- disaster-mode.md優先度0「災害共通基盤」実装後、離散的な「疫病発生」イベント（警告→流行→終息）を
  `burg.waterSecurity`/`sanitation`から駆動し、本書の背景損耗に上乗せする。
- 隔離・検疫という新規プレイヤーアクション、および緊急医療支出。
- `BurgEditorDialog.tsx`での`waterSecurity`手動編集（`sanitation`/`medicalCare`と同型のUI追加）。
- Population Overviewダイアログでの`disease`列の色分け・アイコン化。
