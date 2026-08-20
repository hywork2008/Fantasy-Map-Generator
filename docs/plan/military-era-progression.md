# 軍隊編成の時代対応拡張計画 — 技術ロードマップとのギャップ解消

## 状態

**Phase 1〜4 すべて実装済み（2026-08-21）。** [technology-development-roadmap.md](./technology-development-roadmap.md) の Phase 1–8（中世農業〜ロケット・宇宙開発）が実装済みになった一方、`Military.generate()` が生成する部隊編成（`src/generators/military-generator.ts`）は火薬時代（Era 2）で止まっており、Era 3〜8（大航海〜ロケット）に対応するユニットが一つも存在しない、というギャップに対応する。本書はこのギャップを閉じるための設計と実装フェーズをまとめる。Phase 1（ゲーティング機構＋Era 5-6 ユニット）・Phase 2（armored/aviation の投入）・Phase 3（Economy 拡張との装備連携）・Phase 4（rocketArtillery）の実装内容は §5 の実装ログを参照。ブラウザでの手動確認（§8）のみ未実施。

---

## 1. 問題提起（As-Is の裏付け）

### 1.1 部隊編成はまだ大航海時代以前で止まっている

`Military.getDefaultOptions()`（[military-generator.ts:935-1017](../../src/generators/military-generator.ts)）が返すユニットは6種類のみ:

| ユニット | type | 解禁条件 |
| --- | --- | --- |
| infantry | melee | 常時 |
| archers | ranged | 常時 |
| musketeers | ranged | `options.gunpowderEraEnabled`（世界単位のON/OFFのみ） |
| cavalry | mounted | 常時 |
| artillery | machinery | `options.gunpowderEraEnabled`（世界単位のON/OFFのみ） |
| fleet | naval | 常時（`getNavalTechBonus()` で連続的に強化される） |

`isGunpowderEraMilitaryUnit()`（[gunpowderEra.ts](../../src/utils/gunpowderEra.ts)）はユニット名の正規表現マッチによる**世界全体一括**のON/OFFであり、technologyProgress.ts が持つ State ごとの `locked → known → demonstrated → adopted → diffused` という段階的な採用モデルには一切接続されていない。つまり `historicalPeriod` を `rocketryEra`（ロケット時代開始）に設定してマップを生成しても、全 State は騎士＋マスケット銃兵＋大砲のままである。

### 1.2 技術ロードマップ側は「軍事への効果」を意図的に未接続のまま残している

`technologyProgress.ts` には、まさに本書が扱うべき接続点が **「意図的に未消費（deliberately unconsumed）」** として3つ既に存在する:

- `getInternalCombustionEngineEffect()`（[technologyProgress.ts:217-223](../../src/generators/technologyProgress.ts)）— 「no vehicle/vessel/power system yet reads it」
- `getMilitarySignalRocketsEffect()`（[technologyProgress.ts:232-238](../../src/generators/technologyProgress.ts)）— 「roadmap §11 explicitly defers strategic-weapon effects to a separate diplomacy/military design」
- `getStagingAndOrbitalInsertionEffect()`（[technologyProgress.ts:247-253](../../src/generators/technologyProgress.ts)）— 「no communication/observation/mapping/prestige system yet reads it」

このうち前者2つは、今回の設計がまさに「別途の軍事設計」として引き受けるべき対象である（§4.4 参照）。3つ目（軌道投入）は本書でも意図的に対象外とする（§6 非目標）。

### 1.3 戦闘・地形補正の基盤は armored / aviation を最初から見込んで作られている

以下はすべて **`type: "armored" | "aviation" | "magical"` を最初から前提に実装済み** だが、対応するデフォルトユニットが一つも存在しないため一度も実戦で使われたことがない:

- `stateModifier` / `cellTypeModifier` / `burgTypeModifier`（[military-generator.ts:152-283](../../src/generators/military-generator.ts)）— armored/aviation/magical 用の地形・国家形態補正値が既にチューニングされている。
- `MilitaryOptionsDialog.tsx` の `unitTypes` 配列（[MilitaryOptionsDialog.tsx:29](../../src/ui/dialogs/MilitaryOptionsDialog.tsx)）— `"armored", "aviation", "magical"` を選択肢として持つ。
- **戦闘解決エンジン全体**（[battle-screen.ts](../../src/controllers/battle-screen.ts)）:
  - `defineType()` はユニット type がすべて `aviation` なら戦闘種別を `"air"` と判定する（L106-125）。
  - `calculateStrength()` の `scheme` テーブル（L241-418）は `skirmish / melee / pursue / shelling / boarding / storming / defense / landing / dogfight / maneuvering` など**全フェーズ**について `armored` と `aviation` の係数を定義済み（例: `melee.armored = 2`、`dogfight.aviation = 2`、`maneuvering.aviation = 1`）。
  - `selectPhase()` は `getAirBattlePhase()` を実装済みで、`"maneuvering"`（哨戒）と `"dogfight"`（空中戦）を実際に選択する（L562-568）。

つまり **戦闘計算・地形補正の受け皿は完成しているが、そこに流し込むユニット定義が存在しない** という状態である。本書のスコープはこの「ロースター（部隊編成データ）とゲーティング」の設計に絞られ、戦闘エンジン自体の変更はほぼ不要と見込める。

### 1.4 火薬の「世界ゲート＋State別採用ゲート」の二層構造は片方しか実装されていない

ロードマップ §5.2 は「① 世界設定ゲート（技術が存在し得る世界か）／② State ごとの採用ゲート（前提を満たした State だけが採用できる）」の二層を提案していたが、実装されたのは①（`gunpowderEraEnabled`）だけであり、②は未実装のまま `musketeers`/`artillery` も全 State で同時に有効になる。本書はこの②を一般化し、Era 3 以降の全ユニットに適用する。

---

## 2. 設計原則

1. **世界ゲート＋ State別技術ゲートの二層を、全ユニットに一般化する。** `gunpowderEraEnabled` のような世界単位トグルは「その技術体系がこの世界に存在し得るか」だけを決め、実際にどの State がいつからそのユニットを編成できるかは `technologyProgress.ts` の per-State `TechnologyStage` で決める。
2. **新ユニットは既存ユニットを置き換えるのではなく、緩やかに置き換わる（obsolescence）。** 州の連隊に "diffused の瞬間に一斉更新" のような不自然な変化を起こさない。旧式ユニット（例: musketeers）は新式ユニット（例: riflemen）が採用されるにつれて募兵シェアを失っていくが、募兵源そのものは消さない — 既存の在役連隊も即座に置き換えない（自然減耗・補充サイクルで徐々に入れ替わる）。
3. **core はどのモジュールでも core（`src/generators/*`）を直接読める。core は extension を直接 import しない。** `military-generator.ts` が `technologyProgress.ts` を読むのは core 内部の依存であり問題ない（`technologyProgress.ts` 自体も `utils/gunpowderEra.ts` を読んでいる前例と同型）。一方、Steel・Kerosene・Aluminum のような Goods 在庫は Economy 拡張の所有物なので、Military は直接 import せず、`militaryAssetCapacity.ts` の `requestMountedCapacity()`/`requestFleetCapacity()` と同じ **CustomEvent request/response パターン**、および `MilitaryRegiment.plannedU`（装備待ちの休眠編成）という**既存の仕組みをそのまま再利用**する（[navalTechBonus.ts:1-14](../../src/generators/navalTechBonus.ts) が同じ理由を明文化している）。
4. **新しい Good を発明しない。** Steel・Crude Oil・Kerosene・Lubricating Oil・Aluminum・Coal はすべて `goods-generator.ts` に実装済み。新ユニットの装備・燃料はこれらを再利用する。
5. **新しい technologyDefinitions ノードは極力追加しない。** ロードマップ自体が Era 7-8 で「既存ノードの信号を使い回す（no new Good/plant）」方針を明言しており（[technologyDefinitions.ts:961-965](../../src/generators/technologyDefinitions.ts)）、本書もこれに倣う。新ユニットのゲートは既存ノードの組み合わせ（AND 条件）で表現し、原則として新規ノードを増やさない。
6. **海軍は対象外（すでに解決済み）。** `fleet` ユニットの実効戦力は `getNavalTechBonus()`（Shipbuilding 拡張が完成させた State 保有船体ごとに連続加算、[navalTechBonus.ts](../../src/generators/navalTechBonus.ts)）と `getMaxShipClassTierForState()`（[technologyProgress.ts:155-166](../../src/generators/technologyProgress.ts)、`oceanGoingHulls`/`oceanNavigation`/`coastalSteamNavigation` で船級が連続的に上がる）によって、Era 3〜5 相当のスケールで既に State ごとに連続的にスケールしている。本書は陸上・航空ユニットのギャップにのみ対応する。
7. **name 正規表現ではなく `unit.type` を判定に使う。** `isFirearmMilitaryUnitName()` のような名前パターンマッチは Era 2 の後付けであり脆い。`isMountedUnit()`（[militaryLogistics.ts:37-40](../../src/extensions/economy/generators/militaryLogistics.ts)）がすでに `unit.type === "mounted"` で判定している通り、新ユニット（armored/aviation/機関銃/近代砲）は `unit.type` で判定する設計にする。

---

## 3. ゲーティング機構の設計

### 3.1 `MilitaryUnit` への最小限のスキーマ追加

```ts
// src/types/models.ts — MilitaryUnit に追加
interface MilitaryUnit {
  // ...既存フィールド...
  /** このユニットを募兵可能にする per-State 技術ゲート。省略時は常時解禁（既存ユニットと同じ挙動）。 */
  requiresTechnology?: { id: string; minimum: TechnologyStage };
  /** このユニットの採用が進むにつれ、指定した旧ユニットの募兵シェアを緩やかに奪う（§3.3）。旧ユニット自体は削除しない。 */
  obsoletes?: string;
}
```

既存セーブ・既存ユニット定義は両フィールドとも省略可能なので後方互換。`enabled?: boolean` と同じ「省略 = 現状維持」の設計に揃える。

### 3.2 State 単位のゲート判定 — 実装は `passUnitLimits()` ではなく `s.temp[unit.name]` に統合（設計からの変更点）

当初案は `passUnitLimits(unit, biome, state, culture, religion)`（セル/burg単位で呼ばれる）に技術ゲートを1行追加する形を想定していたが、実装時に見直した。技術段階は cell 単位ではなく **State 単位** の値であり、`military-generator.ts` にはまさに「State 単位のユニット別倍率」を1回だけ計算してキャッシュする既存の仕組みがある — rural/urban 募兵ループの手前で回る `valid.forEach(s => { for (const unit of military) { ...; s.temp[unit.name] = modifier * s.alert; } })`（旧 [military-generator.ts:326-352](../../src/generators/military-generator.ts)）。しかも rural/urban 両ループは既に `!stateObj.temp![unit.name]` を「このユニットはこの State では募兵しない」の early-continue として使っている。したがって技術ゲートは **この `s.temp[unit.name]` に乗算するだけで済み**、rural/urban ループ側は一切変更不要だった:

```ts
// valid.forEach(s => { ... }) 内、既存の「apply overall state modifiers」ループの末尾に追加
s.temp[unit.name] = modifier * s.alert;
if (unit.type === "naval") s.temp[unit.name] *= getNavalTechBonus(s.i);
if (unit.requiresTechnology) {
  s.temp[unit.name] *= getTechnologyAdoptionShare(unit.requiresTechnology, s.i);
}
```

ゲートを満たさない State では `getTechnologyAdoptionShare()` が `0` を返すため `s.temp[unit.name]` が `0` になり、rural/urban ループの既存 early-continue がそのままそのユニットを skip する。`passUnitLimits()` は変更していない（biome/states/cultures/religions という「セル単位で変わりうる静的な許可リスト」のままで、technology という「State 単位の動的な値」を混在させない方が既存の関数の責務に忠実、という判断）。

`isTechnologyAtLeast()`/`getTechnologyAdoptionShare()` は `technologyProgress.ts` から import している（同一 core 内、循環依存なし — `technologyProgress.ts` は `military-generator.ts` を import していない。実装時に `grep` で確認済み）。

`getTechnologyState()` は `pack.states.length > 1` であれば初回アクセス時に自動で `seedTechnologyStartProfile()` を遅延実行する（[technologyProgress.ts:90-98](../../src/generators/technologyProgress.ts)）。`Military.generate()` は生成パイプラインの Stage 18（`generators/index.ts` の `runMilitaryGenerate`）で、State 生成より確実に後に走るため、初回マップ生成時でも技術状態が未初期化のまま読まれる心配はない（実装時に generators/index.ts のステージ順を確認済み）。

### 3.3 緩やかな置き換え（obsolescence）— 募兵率のシェア配分

技術効果の「段階→係数」変換は `technologyProgress.ts` 全体で `diffused=1 / adopted=0.75 / demonstrated=0.35` という形に統一されている（`getFourCourseRotationEffect()` 等、§9〜11 の全 `get*Effect()` が同型）。新設した `getTechnologyAdoptionShare()` もこの慣用形をそのまま踏襲する:

```ts
// technologyProgress.ts に実装済み。既存の get*Effect() 群と同じ形。
export function getTechnologyAdoptionShare(
  gate: { id: string; minimum: TechnologyStage },
  stateId: number
): number {
  const stage = getTechnologyStage(gate.id, stateId);
  if (!isTechnologyStageAtLeast(stage, gate.minimum)) return 0;
  if (stage === "diffused") return 1;
  if (stage === "adopted") return 0.75;
  if (stage === "demonstrated") return 0.35;
  return 0.1; // gate.minimum が "known" のときだけ到達しうる、ちょうど minimum を満たした直後の少数採用
}
```

`gate.minimum` が `"adopted"`（riflemen・fieldArtillery が実際に使っている値）の場合、`isTechnologyStageAtLeast(stage, "adopted")` が真になる時点で `stage` は必ず `"adopted"` か `"diffused"` のどちらかなので、上の `0.1` 分岐には実質到達しない — つまりゲートが開く瞬間は `0 → 0.75` の非連続なジャンプになる（「未解禁」から「解禁」への遷移はそもそも閾値到達というイベントなので、これは意図通り）。ゲート到達後の `0.75 → 1.0` の伸びだけが緩やかに効く。

`obsoletes` によるシェアの奪い合いは、rural/urban 募兵ループより前 — `s.temp[unit.name]` を計算する `valid.forEach(s => {...})` の中に、上記の技術ゲート適用ループの**直後・別ループとして**実装した（全ユニットの `s.temp` を先に確定させてから、2周目で `obsoletes` 元ユニットを減衰させる必要があるため）:

```ts
// 同じ valid.forEach(s => {...}) 内、上記ループの直後
for (const unit of military) {
  if (s.temp[unit.name] === undefined) continue;
  const obsoletedBy = military.filter(u => obsoletesUnit(u, unit.name) && u.requiresTechnology);
  if (!obsoletedBy.length) continue;
  const supersededShare = obsoletedBy.reduce(
    (total, u) => total + getTechnologyAdoptionShare(u.requiresTechnology!, s.i),
    0
  );
  s.temp[unit.name] *= Math.max(0, 1 - Math.min(1, supersededShare));
}
```

これにより、例えば `riflemen`（`obsoletes: "musketeers"`）が `adopted`（share=0.75）に達した State では、その State の `musketeers` の `s.temp` 値（＝実効募兵倍率）が 25% に減る。**既存の在役連隊からユニットが消えるわけではない** — 新規募兵・自然減耗のサイクルで自然に入れ替わる（既存の `updateDynamic()` の補充ロジックと `manpower.ts` の徴兵サイクルにそのまま乗る）。

**追記（2026-08-21、ユーザーフィードバック対応）**: `obsoletes` は単一ユニット名だけでなく配列も受け付けるよう `string | string[]` に拡張した（`types/models.ts`、`obsoletesUnit()` ヘルパーで判定）。きっかけは「`rocketryEra` 開始で riflemen が大量にいるのに archers（弓兵）が全く減らない」という指摘。`archers` は基本ゲーム（Phase 1 以前）からの独立したユニットで、`musketeers` とは別系統のまま一度も `obsoletes` の対象になったことがなかった — マスケット銃兵自体が per-State の `requiresTechnology` ゲートを持たない（世界単位の `gunpowderEraEnabled` トグルのみ、§1.4 参照）ため、`musketeers` に `obsoletes: "archers"` を後付けすると `musketeers` 自身の解禁挙動まで変えてしまいリグレッションが大きい。代わりに `riflemen`（既に安全な `requiresTechnology` ゲート持ち）を `obsoletes: ["musketeers", "archers"]` に拡張し、精密ライフリングが普及した State でだけ弓兵も一緒に廃れるようにした。初期のマスケット銃兵と弓兵が混成編成のまま共存する期間（史実の pike-and-shot 期にも実際にあった）は残る、という設計判断は意図的なもの。詳細は §4.2 参照。

---

## 4. 新ユニット・ロースター案（Era 3〜8）

### 4.1 Era 3（大航海）・Era 4（前工業化）— 追加ユニットなし（対応済み／該当なし）

- **Era 3（大航海）**: §2 原則6の通り、`fleet` の実効戦力は `getNavalTechBonus()` と `getMaxShipClassTierForState()` によって既に連続的にスケールする。陸上ユニットに大航海時代特有の新型を作る歴史的必然性もない。**対応不要。**
- **Era 4（前工業化）**: `factoryOrganization` や `coalFuelSupply` は産業基盤の蓄積であり、単体で新しい戦闘ユニットを生む段階ではない（史実でも Pike-and-shot〜マスケット戦列歩兵のまま）。**新ユニットなし** — オーバーエンジニアリングを避ける。

### 4.2 Era 5（蒸気・機械化）— ライフル銃兵

| フィールド | 値 |
| --- | --- |
| name | `riflemen` |
| icon | 🎯 |
| type | `ranged` |
| obsoletes | `["musketeers", "archers"]`（2026-08-21追記 — 元は `musketeers` のみ。§3.3 追記を参照） |
| requiresTechnology | `{ id: "standardMachineWorks", minimum: "adopted" }` |
| rural / urban | `0.1` / `0.08`（musketeers と同水準） |
| crew / power | `1` / `1.6`（Uncalibrated — 要調整） |

`standardMachineWorks`（精密工作機械、Era 5）は roadmap 自身が「mechanics、precisionMachining」の代表ノードとして internalCombustionEngine 等で再利用している既存ノード（[technologyDefinitions.ts:943-947](../../src/generators/technologyDefinitions.ts) のコメント参照）。ライフリング（施条）加工と均質弾薬にも同じ精密加工基盤が必要という解釈で流用し、新規ノードは追加しない。

`railEngineering`/`railwayOperations`（Era 5）は「輸送」であって「編成」ではないため本書のロースターには含めない。連隊の行軍速度への反映は [military-movement.md](./military-movement.md) 側の課題として切り離す（§6 非目標）。

### 4.3 Era 6（電化・近代化学）— 近代砲・機関銃

| フィールド | fieldArtillery | machineGunners |
| --- | --- | --- |
| icon | 🎯💣（仮） | 🔫🔫（仮） |
| type | `machinery` | `machinery` |
| obsoletes | `artillery` | （なし・純追加） |
| requiresTechnology | `{ id: "modernSteelmaking", minimum: "adopted" }` | `{ id: "modernSteelmaking", minimum: "demonstrated" }` |
| rural / urban | `0` / `0.03`（artillery と同水準） | `0` / `0.015` |
| crew / power | `8` / `20`（artillery比 約1.7倍） | `4` / `10` |

`modernSteelmaking`（近代製鋼、Era 6）採用は史実の鋳鉄砲→鋼鉄製砲身（クルップ式）転換とほぼ同時期にマキシム機関銃級の量産火器も現れる、という解釈でひとつのノードに両方を掛ける。`machineGunners` は type `machinery` とすることで、既存の `cellTypeModifier.machinery`（highland 3倍など、[military-generator.ts:219-250](../../src/generators/military-generator.ts)）と `scheme.shelling.machinery = 2` 等の戦闘フェーズ補正を無改造で流用できる。

`syntheticAmmonia`（合成アンモニア、Era 6）は roadmap §9.2 が明記する通り火薬原料の供給源にもなる。ここでは新ユニットは作らず、`getGunpowderDemandTechMultiplier()`（[technologyProgress.ts:132-144](../../src/generators/technologyProgress.ts)）と同型の「近代火薬供給効率」乗数を Phase 3（§5）で Economy 側に追加することを推奨する（Military のロースターには影響しない）。

### 4.4 Era 7（石油・内燃機関）— 装甲車・航空機（新 type の実戦投入）✅ Phase 2 実装済み

ここで初めて `armored` と `aviation` という**既存だが未使用の type** を実際のユニットとして投入する。

| フィールド | armored | aviation |
| --- | --- | --- |
| icon | 🛡️ | ✈️ |
| type | `armored`（新規投入） | `aviation`（新規投入） |
| obsoletes | （なし。cavalry の一部役割を機能的に代替するが、募兵シェアの直接収奪はしない — §6 非目標） | （なし） |
| requiresTechnology | `{ id: "internalCombustionEngine", minimum: "adopted" }` | なし（複合条件は `unit.type === "aviation"` のコード側特例で判定、下記） |
| rural / urban | `0` / `0.008`（希少・高コスト） | `0` / `0.005`（さらに希少） |
| crew / power | `4` / `40`（Uncalibrated） | `2` / `25`（Uncalibrated） |
| separate | `0`（他兵科と混成編成可） | `1`（fleet と同様、航空隊は独立編成） |

- **armored** は `internalCombustionEngine`（Era 7 の内燃機関ノード）の `adopted` を直接ゲートにする。これは `getInternalCombustionEngineEffect()` に初めて実消費者を与えることになる（[technologyProgress.ts:210-223](../../src/generators/technologyProgress.ts) のコメントにある「deliberately unconsumed」を解消）。Phase 1 で作った `requiresTechnology` の単純ゲート機構をそのまま使うだけで済み、追加コードは不要だった。
- **aviation** は単一ノードでは表現できない（roadmap 本文 §7 の結果欄に「航空」という語は出るが、専用の technologyDefinitions ノードは存在しない）。原則5（新規ノードを増やさない）に従い、`internalCombustionEngine`（動力）と `electrolyticIndustry`（Era 6、Aluminum＝軽量構造材、roadmap §9.4 が「後続の航空」の材料選択肢として明記）の**複合条件**として表現する。実装は §3.2 で確立した `s.temp[unit.name]` ループへの type 別特例（`passUnitLimits()` ではない — Phase 1 での方針転換を踏襲）:
  ```ts
  // s.temp[unit.name] を計算するループ内、requiresTechnology の乗算の直後に追加
  if (unit.type === "aviation") {
    const engineShare = getTechnologyAdoptionShare({ id: "internalCombustionEngine", minimum: "adopted" }, s.i);
    const airframeShare = getTechnologyAdoptionShare(
      { id: "electrolyticIndustry", minimum: "demonstrated" },
      s.i
    );
    s.temp[unit.name] *= Math.min(engineShare, airframeShare);
  }
  ```
  `unit.name === "aviation"` ではなく `unit.type === "aviation"` で判定しているため、将来 Military Options でユーザーが独自に追加する `aviation` type のカスタムユニットにも同じ現実的な下限が自動的にかかる。両ゲートのうち弱い方の share を採用する（`Math.min`）— どちらか片方が未解禁なら 0（ユニット不在）、両方解禁済みならその時点で成熟度が低い方に律速される。これも `electrolyticIndustry` の唯一の軍事的消費者になる。

`armored`/`aviation` は combat エンジン側の変更が不要という §1.3 の見立ては、[src/controllers/battle-screen.test.ts](../../src/controllers/battle-screen.test.ts) を新規に書いて実証済み — `Battle.prototype` のメソッドを `Object.create(Battle.prototype)` で作った最小限の `this` に対して直接呼び、`defineType()` が全機 aviation の対戦を `"air"` と判定すること、`selectPhase()` が `"maneuvering"`/`"dogfight"` を実際に選ぶこと、`calculateStrength()` の `scheme` テーブルの `armored`/`aviation` 列が実際に読まれていること（`dogfight` は `maneuvering` のちょうど2倍、`melee` の armored 補正、`shelling` で armored の出力が 0 になることを確認）を検証した。手動でのブラウザ確認は行っていない（§8 参照）。

### 4.5 Era 8（ロケット・宇宙開発）— ロケット砲のみ、戦略兵器化はしない ✅ Phase 4 実装済み

| フィールド | 値 |
| --- | --- |
| name | `rocketArtillery` |
| type | `machinery`（新 type は作らない） |
| obsoletes | `fieldArtillery` |
| requiresTechnology | `{ id: "militarySignalRockets", minimum: "adopted" }` |
| rural / urban | `0` / `0.02` |
| crew / power | `6` / `35`（Uncalibrated） |

`militarySignalRockets`（Era 8 の軍用・信号用火薬ロケット）は roadmap 自身が「限定的な信号・軍事用途。宇宙開発の直接解禁にはしない」と明記しているノードであり、`getMilitarySignalRocketsEffect()` も「deliberately unconsumed」（[technologyProgress.ts:225-238](../../src/generators/technologyProgress.ts)）。本書はこれを**通常の砲兵ユニットの上位互換**として消費するに留め、外交・威信・戦略効果は一切付与しない（roadmap §11 の非目標をそのまま継承）。

**用語の訂正（Phase 4 実装時に気づいた不正確な記述）**: 上の一文、および Phase 2 の実装ログにあった「`getInternalCombustionEngineEffect()`/`getMilitarySignalRocketsEffect()` に初めて実消費者を与える」という表現は正確ではない。実際に呼んでいるのは `requiresTechnology` 経由の `getTechnologyAdoptionShare()` であり、`getInternalCombustionEngineEffect()`/`getMilitarySignalRocketsEffect()` という名前の関数そのものは Phase 1〜4 を通じて一度も呼ばれていない（`grep` で確認済み）。両者は同じ `TechnologyProgress` 状態を読む**並行した**別実装であり、後者は `getTechnologyAdoptionShare()` のような `minimum` カットオフを持たない（`demonstrated` の時点で既に 0.35 を返す）ため、「`adopted` 未満では存在しない」という本書のゲート設計とは形が異なり、単純な置き換えはできない。`getInternalCombustionEngineEffect()`/`getMilitarySignalRocketsEffect()` 自体は今後も未消費のままである — 呼びたい場合は army roster 側ではなく、両関数のコメントが元々想定していた「車両/船舶/動力システム」「別の軍事・外交設計」側で使うのが筋。

`stagingAndOrbitalInsertion`（多段化・軌道投入、Era 8 の終端ノード）には**対応するユニットを作らない**。人工衛星・軌道投入は編成可能な「部隊」ではなく、通信・観測・威信という別カテゴリの効果であり、`getStagingAndOrbitalInsertionEffect()` は引き続き未消費のままにする（roadmap 自身の非目標を継承 — §6 参照）。

### 4.6 ロースター一覧（まとめ）

| Era | 新ユニット | type | obsoletes | ゲート |
| --- | --- | --- | --- | --- |
| 3 | なし | — | — | Shipbuilding 側で対応済み |
| 4 | なし | — | — | 該当技術段階なし |
| 5 | `riflemen` | ranged | `musketeers` | `standardMachineWorks` adopted |
| 6 | `fieldArtillery` | machinery | `artillery` | `modernSteelmaking` adopted |
| 6 | `machineGunners` | machinery | （純追加） | `modernSteelmaking` demonstrated |
| 7 | `armored` | **armored（新規投入）** | （なし） | `internalCombustionEngine` adopted |
| 7 | `aviation` | **aviation（新規投入）** | （なし） | `internalCombustionEngine` adopted AND `electrolyticIndustry` demonstrated |
| 8 | `rocketArtillery` | machinery | `fieldArtillery` | `militarySignalRockets` adopted |

`magical` type は本書の対象外（現実史ベースの技術ロードマップと無関係。ファンタジー魔法拡張が別途扱うべき領域）。

---

## 5. 実装フェーズ

### Phase 1 — ゲーティング機構 + Era 5-6 ユニット（riflemen / fieldArtillery / machineGunners）✅ 実装済み（2026-08-21）

- `MilitaryUnit` に `requiresTechnology?` / `obsoletes?` を追加（[types/models.ts](../../src/types/models.ts)）。`TechnologyStage` を import せず `"known" | "demonstrated" | "adopted" | "diffused"` を直接インライン（types/ 層が generators/ 層に依存しないようにするため）。
- `technologyProgress.ts` に `getTechnologyAdoptionShare()` を追加(§3.3)。
- `military-generator.ts`: 技術ゲートと obsolescence 減衰を `passUnitLimits()` ではなく `s.temp[unit.name]` の計算ループに統合(§3.2〜3.3 — 設計時の想定から変更)。rural/urban 募兵ループ自体は無変更。
- `Military.getDefaultOptions()` に `riflemen`(§4.2)/`fieldArtillery`/`machineGunners`(§4.3)の3ユニットを追加。戻り値の型注釈 `MilitaryUnit[]` を明示(リテラル型 `"adopted"` 等が `string` へ widen されて型エラーになるのを防ぐため必要だった)。
- `gunpowderEra.ts` の `FIREARM_UNIT_NAME_PATTERN` に `rifle` を追加。`riflemen` は追加前の正規表現(`arquebus|musketeer|musket|firearm|handgun|gunner`)にマッチしなかったため、`gunpowderEraEnabled=false` でも除外されない不具合になるところだった。`fieldArtillery`(`"machinery"` 型 + 名前に `artillery` を含む)と `machineGunners`(`gunner` に既にマッチ)は既存パターンで自動的に正しく除外される。
- 既存ユニット・既存テストの回帰確認: `npx vitest run`(フルスイート、410 ファイル / 3236 テスト)と `npx tsc --noEmit` がいずれもクリーン。`historicalPeriod` 未設定(既存テストの前提)では新規3ユニットの技術段階は常に `"locked"` になり、既存ロースターと同じ挙動になることを確認済み。
- `military-generator.test.ts` にテスト追加(新 `describe` ブロック、5件): ロック時に3ユニットとも現れないこと、`standardMachineWorks` adopted で riflemen が現れ musketeers のシェアが半分未満に縮むこと、`modernSteelmaking` demonstrated で machineGunners のみ現れること、`modernSteelmaking` adopted で fieldArtillery が現れ artillery のシェアが縮むこと、`gunpowderEraEnabled=false` では技術が adopted でも5ユニットとも現れないこと。`beforeEach` で `resetTechnologyProgress()` を呼び、他テストとの技術状態の漏れを防止(`technologyProgress.test.ts` と同じ作法)。
- **追記（2026-08-21、Phase 1〜4 完了後のユーザーフィードバック対応）**: `riflemen` の `obsoletes` を `"musketeers"` 単体から `["musketeers", "archers"]` の配列へ拡張。詳細・理由は §3.3 の追記と §4.2 の表を参照。

### Phase 2 — Era 7 ユニット（armored / aviation） と 新 type の実戦投入 ✅ 実装済み（2026-08-21）

- `armored`/`aviation` ユニット定義を `Military.getDefaultOptions()` に追加(§4.4)。icon は 🛡️ / ✈️、`aviation` は `fleet` と同じ `separate: 1`(独立編成)とした。
- `aviation` の複合ゲート(§4.4)は単一の `requiresTechnology` では表現できないため、§3.2 で実装した `s.temp[unit.name]` 計算ループに `unit.type === "aviation"` の特例として実装した(`passUnitLimits()` ではなく State 単位の倍率計算に寄せる、Phase 1 の方針をそのまま踏襲)。ユニット名ではなく type で判定しているため、将来ユーザーが Military Options で追加する `aviation` type のカスタムユニットにも同じゲートが自動的にかかる。
- Battle Screen の手動検証の代わりに、[src/controllers/battle-screen.test.ts](../../src/controllers/battle-screen.test.ts) を新規作成し `Battle.prototype` のメソッドを直接呼ぶ自動テストで検証した(5件、全て green)。`new Battle(...)` はダイアログ表示等の実UI副作用を伴うため使わず、`Object.create(Battle.prototype)` で最小限の `this` を組み立てて `defineType()`/`selectPhase()`/`calculateStrength()` を直接叩く手法を採った。検証できたこと: (1) 両陣営とも全ユニットが aviation type のとき `defineType()` が `"air"` と判定する、(2) 地上ユニットが混ざると `"air"` にならない、(3) `selectPhase()` が `iteration` に応じて `"maneuvering"`→`"dogfight"` を実際に選ぶ(`P()` の `>=1`/`<=0` 決定的分岐を利用し非フレークにできた)、(4) `calculateStrength()` の `scheme` テーブルの `aviation` 列(`dogfight`が`maneuvering`のちょうど2倍)と `armored` 列(`melee`で正の出力、`shelling`で0)が実際に読まれている。§1.3 の「エンジン変更は原則不要」という見立てが実証された(変更ゼロ)。ブラウザでの実プレイ手動確認はまだ未実施(§8)。
- `MilitaryOptionsDialog.tsx` に軽量な UI ヒントを追加した: `requiresTechnology` を持つユニット名の隣に 🔬 バッジ(hover で技術ID・必要段階を表示)、`obsoletes` を持つユニットに ↩️ バッジ(hover でどのユニットの募兵シェアを緩やかに奪うかを表示)。テーブル列の追加はせず、既存の `title`/`data-tip` パターンを流用。

### Phase 3 — Economy 拡張との装備連携 ✅ 実装済み（2026-08-21）

- `armored`/`aviation`/`fieldArtillery`/`machineGunners` の装備・燃料需要を Economy 側（`src/extensions/economy/generators/militaryResources.ts`）に追加した。新しい Good ・新しい technologyDefinitions ノードは増やしていない（既存の Steel/Kerosene/Aluminum をそのまま消費先として使う、原則4）。
  - `MILITARY_RESOURCES`（`militaryResourcesTypes.ts`）に `steel`/`kerosene`/`aluminum` を追加。
  - `getAnnualDemand()` に4つの新カウンタを追加し、専用の per-head 定数（すべて "Uncalibrated" — 既存の `ARCHER_ARROWS_PER_HEAD` 等と同じ位置づけ）で需要を計算:
    - `armored`（`unit.type === "armored"`、`isArmoredUnit()`）: Steel（`STEEL_PER_ARMORED_HEAD = 0.15`）+ Kerosene（`KEROSENE_PER_ARMORED_HEAD = 0.06`）。
    - `aviation`（`unit.type === "aviation"`、`isAviationUnit()`）: Aluminum（`ALUMINUM_PER_AVIATION_HEAD = 0.2`）+ Kerosene（`KEROSENE_PER_AVIATION_HEAD = 0.08`）。
    - `fieldArtillery`/`machineGunners`（`unit.requiresTechnology?.id === "modernSteelmaking"`、`needsModernSteel()`）: 既存の Iron/Lead/Gunpowder 需要に加えて Steel（`MODERN_STEEL_PER_HEAD = 0.05`）を追加消費。
  - `isArmoredUnit()`/`isAviationUnit()`/`needsModernSteel()` はいずれも `unit.type`／`unit.requiresTechnology.id` という構造化データで判定しており、ユニット名の正規表現には依存しない（原則7）。将来ユーザーが Military Options で同じ `type`／`requiresTechnology` を持つカスタムユニットを追加しても自動的に同じ需要がかかる。
  - Steel/Kerosene/Aluminum の需要は `gunpowderEraEnabled` の早期 return より**前**で計算し、常に評価される（armored/aviation 自体が §4.4 でこのフラグと無関係と確定しているため）。fieldArtillery/machineGunners 由来の分は、火薬無効時はそれらのユニット自体が募兵されない（`gunpowderEra.ts`）ため自然に 0 になる。
  - `settleMonthly()` の対象リソース一覧も、`gunpowderEraEnabled` の値にかかわらず `steel`/`kerosene`/`aluminum` を常に含めるよう修正した。Good 名ルックアップは既存の `goodsByName.get(resource)`（lowercase 一致）にそのまま乗るため、"iron"/"lead" 用の `" ingot"` サフィックス分岐に手を加える必要はなかった。
  - 装備は Iron/Lead/Fodder と同じ**毎月の市場直接消費**（`Markets.consumeForMilitary()`）として扱い、Muskets/Arms のような Metallurg 工廠発注＋`plannedU` 休眠編成パターンは適用しなかった（次項参照、計画通り）。
- **重要な設計変更（実装中に発見）**: 当初は「`isArtillery()` を `=== "artillery"` から `.includes("artillery")` に一括で広げ、`fieldArtillery` も同じ判定に含める」という単純な変更を想定していたが、これは `unstockInitialFirearmForces()`（`initialFirearmsUnstocked` 時に部隊を `plannedU` の休眠枠へ振り替える処理）にも影響することが判明した。`metallurgWork.ts` は**別に定義された独自の** `isArtillery()`（`=== "artillery"` のまま、広げていない）で `plannedU` を再活性化する "Artillery" Good の生産計画を立てるため、`fieldArtillery` を `unstockInitialFirearmForces()` 側だけ広げると、`fieldArtillery` の休眠枠がどちらの生産計画にも一致せず**永久に再活性化されない**という実質的なリグレッションになるところだった（`initialFirearmsUnstocked` を有効にした場合のみ顕在化）。対処として `isArtillery()`（`unstockInitialFirearmForces()` 用、厳密一致のまま）と `isArtilleryLike()`（`getAnnualDemand()` の資材需要集計専用、`includes("artillery")` に広げた版）を分離した。テストでこの区別を固定化済み（下記）。
- `musketeers`/`artillery` が現在受けている `unstockInitialFirearmForces()`（`plannedU` による装備待ち休眠編成、[militaryResources.ts:97-132](../../src/extensions/economy/generators/militaryResources.ts)）と同じパターンを新ユニットにも適用するかどうかは、計画通り Phase 3 では見送った（上記の通り、うっかり見送りを破るところだったので、テストで固定化した）。

### Phase 4（バックログ・任意）— Era 8 ロケット砲 ✅ 実装済み（2026-08-21）

- `rocketArtillery` を `Military.getDefaultOptions()` に追加(§4.5)。`obsoletes: "fieldArtillery"`／`requiresTechnology: { id: "militarySignalRockets", minimum: "adopted" }` は Phase 1 で確立したフィールドをそのまま使い、新しいコード機構は不要だった(§3.2/3.3 の `s.temp[unit.name]` ゲート・obsolescence ループがそのまま効く)。`isGunpowderEraMilitaryUnit()` も名前(`rocketartillery`)+type(`machinery`)の既存パターンでそのまま正しく判定されるため無変更。
- **`militaryResources.ts`（Phase 3 のパターンを実際に拡張した点）**: `needsModernSteel()`(判定対象: `requiresTechnology.id === "modernSteelmaking"` のみ)を `needsAdvancedSteel()` に改名し、`"militarySignalRockets"` も対象に加えた(ロケットランチャーの架台も鋼材集約的という判断)。Phase 3 では「Phase 1〜3 で確立したパターンをそのまま適用するだけ」という Phase 4 の想定通り、新しい定数・新しい仕組みは増やさず、既存の `MODERN_STEEL_PER_HEAD` レートをそのまま流用した。`rocketArtillery` は名前に `"artillery"` を含む(`isArtilleryLike()`)ため、Iron/Lead/Gunpowder 需要も fieldArtillery と同様に自動で乗る — Kerosene/Aluminum は付与していない(エンジン・機体を持たないため)。
- `syntheticAmmonia` 由来の近代火薬供給効率乗数（§4.3）は Phase 4 の本文で「同時期に検討してよい」と書かれた**任意**項目であり、今回は実装していない（明示的に見送り。必要になれば別タスクとして着手する）。
- 3段階の obsolescence 連鎖（`artillery` → `fieldArtillery` → `rocketArtillery`）が正しく動くことをテストで確認: `rocketArtillery` が `adopted` のとき `fieldArtillery` のシェアが縮む一方、`legacy artillery` の縮小幅は `fieldArtillery` 自身の `modernSteelmaking` 採用状況だけで決まり、`rocketArtillery` の状態には直接左右されない（§3.3 の実装が「直接の obsoletes 元」しか見ない一段階ずつの計算のため）。これは既存の 2段階チェーン（`musketeers`→`riflemen`、`artillery`→`fieldArtillery`）と同じ挙動であり、Phase 4 で新たな不整合を持ち込んではいない。
- `military-generator.test.ts` に3テスト追加: locked時に不在／`militarySignalRockets` adopted で出現し `fieldArtillery` のシェアが縮む／`gunpowderEraEnabled=false` では `fieldArtillery` と同様に不在。`militaryResources.test.ts` に1テスト追加: `rocketArtillery` が `needsAdvancedSteel()` 経由で Steel を消費し、Kerosene/Aluminum は消費しないこと。

---

## 6. 非目標（本書で扱わないこと）

- **戦略兵器・核・ICBM・人工衛星の威信/外交効果。** `stagingAndOrbitalInsertion` に対応するユニットは作らない。roadmap §11 が「戦略兵器としての効果を導入する場合は、別途の外交・軍事・安全保障設計で扱い、本書の技術進行から自動的には与えない」と明記している方針をそのまま継承する。
- **`magical` type の設計。** ファンタジー要素の魔法戦闘は別ドキュメントの領域。
- **要塞・攻城兵器の時代対応。** `gunpowderFortification`（Era 2）以降の要塞進化（星形要塞→近代要塞）は [fort.md](./military/fort.md) 側の課題として切り離す。
- **鉄道による行軍速度の強化。** `railEngineering`/`railwayOperations` の効果は [military-movement.md](./military-movement.md) の管轄。本書は「どのユニットが編成されるか」のみを扱い、「どう移動するか」は扱わない。
- **戦闘解決エンジン（`battle-screen.ts`）自体の変更。** §1.3 の調査どおり `armored`/`aviation` 用のフェーズ・補正は実装済みのため、原則として変更不要（Phase 2 での実地検証で問題が出た場合のみ最小修正する）。
- **既存の在役連隊の即時入れ替え。** §2 原則2・§3.3 の通り、募兵シェアの変化のみを扱い、生成済み連隊を強制的に置換しない。
- **数値バランスの最終確定。** §4 の crew/power/rural/urban 値はすべて "Uncalibrated" — 既存コード（`militaryResources.ts` の `ARCHER_ARROWS_PER_HEAD` 等）と同じ位置づけで、実プレイでの調整を前提とした叩き台。

---

## 7. リスク・懸念点

- **State 間の戦力格差の拡大。** per-State 技術採用モデルはロードマップの意図通り「先進 State と後進 State が同じ Era でも全く違う軍を持つ」ことを許すが、`armored`/`aviation` の power 値（§4.4）が高すぎると、内燃機関を獲得した State が近隣を一方的に蹂躙し外交バランスを崩す可能性がある。Phase 2 で必ず複数 State 間の相対戦力比を確認する。
- **募兵シェアがゼロになる旧ユニットの UI 上の扱い。** `diffused` で `musketeers` の募兵枠がほぼゼロになると、Military Options の一覧から実質的に消えたように見える。プレイヤーが「ユニットが消えた」と誤解しないよう、Regiments Overview 等で在役中の旧式ユニットは引き続き表示され続けることを明示するか、最低floor（例: 5%）を残すかを Phase 1 実装時に決める。
- **`aviation` の複合ゲートは `requiresTechnology` 単一フィールドでは表現できない。** §4.4 の通り `passUnitLimits()` 内に type 別の特例が必要になり、スキーマの一貫性がやや崩れる。将来的に3つ目の複合ゲートユニットが必要になった場合は `requiresTechnology` を配列化する再設計を検討する。
- **`isArtillery()` と `isArtilleryLike()` の混同リスク（Phase 3 実装ログ参照）。** `militaryResources.ts` に名前の似た厳密版・広範版の2つの private メソッドが存在する。将来この2つを見分けずどちらか一方に統一しようとすると、§5 Phase 3 実装ログに書いた「`fieldArtillery` の `plannedU` 休眠枠が永久に再活性化されなくなる」バグを再導入しかねない。両メソッドの doc comment に相互参照を書き、テストでも固定化済みだが、次に触る人は必ず両方の doc comment を読むこと。
- **Steel/Kerosene/Aluminum の需要と供給のタイミングずれ。** `internalCombustionEngine`/`modernSteelmaking` が `adopted` に到達した直後の State は、まだ市場に十分な Steel/Kerosene/Aluminum 在庫が無い可能性がある（`unmetDemand` として記録されるだけで、Phase 3 では在庫不足時のフォールバックや優先配分は実装していない）。§4.4/§4.3 の技術ゲート自身がある程度供給インフラの先行成立を前提にしている（例: `internalCombustionEngine` の `adopted` 閾値は `refinedFuelAccess: 0.35` を要求する）ため致命的ではないはずだが、実プレイでの `unmetDemand.steel`/`unmetDemand.kerosene`/`unmetDemand.aluminum` の値は確認していない。

---

## 8. 検証計画

### 自動テスト

- `military-generator.test.ts`: **実装済み（Phase 1 + Phase 2 + Phase 4 + 追記）。** Phase 1 で5テスト、Phase 2 で5テスト、Phase 4 で3テスト、archers 追記で1テスト追加。Phase 1 分 — locked時に3ユニットとも不在／`standardMachineWorks` adopted で riflemen 出現・musketeers 減衰／`modernSteelmaking` demonstrated で machineGunners のみ出現／`modernSteelmaking` adopted で fieldArtillery 出現・artillery 減衰／`gunpowderEraEnabled=false` では5ユニットとも不在。Phase 2 分 — locked時に armored/aviation とも不在／`internalCombustionEngine` adopted のみで armored 出現・aviation は不在のまま／aviation は複合ゲートの片方だけでは出現しない／両方(adopted + demonstrated)揃うと armored・aviation とも出現／`gunpowderEraEnabled=false` でも armored/aviation は火薬系ユニットと違い不在にならない。Phase 4 分 — locked時に rocketArtillery が不在／`militarySignalRockets` adopted で rocketArtillery 出現・fieldArtillery 減衰／`gunpowderEraEnabled=false` では fieldArtillery と同様に不在。追記分 — `standardMachineWorks` diffused（rocketryEra 相当）で archers がほぼゼロになること。
- `src/controllers/battle-screen.test.ts`: **新規作成（Phase 2）。** `Battle.prototype` を直接叩く5テストで `defineType()`/`selectPhase()`/`calculateStrength()` の armored/aviation 対応を検証（詳細は §4.4 実装ログ）。
- `militaryResources.test.ts`: **実装済み（Phase 3 + Phase 4）。** `describe` ブロックに Phase 3 で4テスト、Phase 4 で1テスト追加。Phase 3 分 — fieldArtillery/machineGunners/armored/aviation の Steel/Kerosene/Aluminum 需要が期待通りの計算式で出ること・市場在庫が減ること／legacy "artillery" は Steel を消費しないこと／`gunpowderEraEnabled=false` でも armored/aviation の Steel/Kerosene/Aluminum 需要は残ること／**`initialFirearmsUnstocked` 時に fieldArtillery が legacy artillery と違って `plannedU` へ振り替えられないこと**（実装中に見つけた §5 Phase 3 実装ログの回帰ガード）。Phase 4 分 — rocketArtillery が `needsAdvancedSteel()` 経由で Steel を消費し、Kerosene/Aluminum は消費しないこと。既存6テストも無変更で green。
- `technologyProgress.test.ts` への `getTechnologyAdoptionShare()` 専用単体テストは **未追加**（military-generator.test.ts 側の統合テストでカバーしている。既存 `get*Effect()` 系と同型の純関数なので優先度は低い）。
- フルスイート 411ファイル/3255テスト、`tsc --noEmit`・`biome check` ともにクリーン（2026-08-21確認、Phase 1〜4 + archers 追記実装後）。

### 手動確認手順（未実施 — 次回セッションで確認）

1. `historicalPeriod` を `rocketryEra`（最終段階）に設定して新規マップを生成し、Military Options で State の技術段階に応じて `riflemen`/`fieldArtillery`/`machineGunners`/`armored`/`aviation`/`rocketArtillery` が有効になっていること、名前欄の 🔬/↩️ バッジが正しく表示されることを確認する。
2. `ageOfExploration` 以前の開始で、新ユニットが一切出現しない（従来どおり6ユニットのみ）ことを確認する。
3. Regiments Overview で新ユニットが実際に連隊に編成されていることを確認する。
4. Battle Screen で `armored`/`aviation` を含む連隊同士を実際に衝突させ、`"air"`/`"landing"` 戦闘種別と `dogfight`/`maneuvering` フェーズが選択されること、UI 上の表示が破綻しないことを確認する（battle-screen.test.ts はロジックのみの検証であり、ダイアログ描画・ユーザー操作フローは未確認）。
5. armored/aviation/fieldArtillery/machineGunners/rocketArtillery を編成した State で、Goods Editor または市場画面から Steel/Kerosene/Aluminum の在庫が実際に減っていくこと、`unmetDemand` が異常に張り付き続けないことを確認する（§7 のリスク参照）。
6. `artillery`→`fieldArtillery`→`rocketArtillery` の3段階すべてが揃う長寿命 State で、連隊編成が不自然に破綻しない（§5 Phase 4 実装ログの3段階チェーンの挙動どおりになる）ことを確認する。
7. `rocketryEra` 開始の State で `riflemen` が多数いる一方 `archers` がほぼゼロになっていること（今回のユーザーフィードバックそのもの）を Regiments Overview で目視確認する。
