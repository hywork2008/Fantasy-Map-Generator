# 兵力・男女比・都市人口の統合エコシステム設計

**Status**: design only（本ドキュメントは設計・計画。実装には進まない）  
**Date**: 2026-07-13  
**Related**:

| Doc / Code | Relation |
| :--- | :--- |
| `docs/simulation/population-dynamics.md` | 年齢コホート・収容力 K・出生の基礎設計（実装の骨格あり） |
| `docs/plan/military/fort.md` | burg group 別人口構成（砦は未成年0・成人8:2） |
| `docs/plan/military-organization-and-vassalage.md` | 連隊編成・近衛・野戦軍の形（兵「数」の源ではない） |
| `docs/reviews/0709-strategic-march-and-mobilization.md` | Nobility 年次徴兵 `Mobilization.conscript`（人口%目標） |
| `docs/analytics/population.md` | 既存 FMG 兵力算出の説明 |
| `src/generators/military-generator.ts` | 生成時兵力・`updateDynamic` 回復 |
| `src/generators/demography-simulator.ts` | 加齢・出生・`applyDemographicCasualties`・戦傷 |
| `src/extensions/nobility/generators/mobilization.ts` | 年次 `r.t` 引き上げ |

---

## 0. 目的

プレイヤーが地図上で見る次のものが、**同じ「成人男性」資源の別の見え方**になるようにする。

1. **都市・農村の人口**（総人口・人口ピラミッド）
2. **男女比**（特に成人・戦後の未亡人効果）
3. **Military レイヤーの兵数**（連隊 `r.a` / 上限 `r.t`）
4. **戦争**（動員の加速・戦闘死・戦後回復・徴兵限界）

現状はそれぞれが独立した式で動いており、数字が「きれいに連動」しない。本設計は **Manpower（兵役可能人口）を単一の台帳** に置き、そこから徴兵・戦死・回復・除隊を双方向で記帳するエコシステムを定義する。

---

## 1. 現状の断絶（As-Is）

### 1.1 データの流れ（現状）

```
[生成]
  cells.pop / burg.population
       ├─► demographics バケツ分割（children / maleAdults / femaleAdults / elders）
       │         ※ fort 等は group プロファイルで比率変更済み
       │
       └─► Military.generate()
                 総人口 × unit.rural|urban × alert × populationRate
                 ※ maleAdults を参照しない
                 ※ 兵は「人口の写し」であり、人口から差し引かれない

[Advance Time]
  simulateDemographics()     … 加齢・出生・移住（軍隊と無関係）
  Mobilization.conscript()   … 総人口の1% or 3% まで r.t を上げる（maleAdults 非参照）
  Military.updateDynamic()   … r.a を r.t へ年20%で回復（maleAdults から引かない）

[戦闘]
  regiment.a 減少
  applyDemographicCasualties(stateId, deadTroops)
       … deadTroops / populationRate を maleAdults から削る
       … 都市 10× 重み（徴兵元と無関係な便宜配分）
       … どのセル/都市から徴兵されたかの履歴なし
```

### 1.2 問題の整理

| # | 断絶 | 症状 |
| :--- | :--- | :--- |
| A | **二重計上** | 兵は地図上にいるが、同じ男が都市の `maleAdults` にも残る |
| B | **徴兵源が総人口** | 女性・子供・老人からも「徴兵できる」式になっている |
| C | **戦死と兵力の非対称** | 戦死は `maleAdults` を削るが、徴兵・補充は削らない／上限は総人口% |
| D | **回復が無限** | `r.t` を上げ続ければ、残存男性を超えて `r.a` が戻る余地がある |
| E | **生成時の戦傷が軍隊と独立** | `applyHistoricalWarScars` は male を3–5%削るが、連隊規模は総人口ベースのまま |
| F | **動員が Nobility 依存** | core の advanceTime では `updateDynamic` のみ；徴兵は拡張 ON 時だけ |
| G | **配分の恣意性** | 戦死の都市 10× は「農業保護」意図だが、中世徴兵の現実（農村主体）と逆で、しかも「どの部隊がどこ出身か」と無関係 |
| H | **単位の混乱** | 人口ポイント・`populationRate`・`urbanization`・表示人数・`state.rural/urban * 1000` が複数系統 |

### 1.3 守るべき既存の良い性質

- 年齢4バケツ（子供 / 成人男 / 成人女 / 老人）は UI とシミュレーションの骨格として妥当
- 出生が **femaleAdults** 依存 → 戦後ベビーブームが自然に出る
- 連隊は `a`（現員）と `t`（定員/上限）を分離 → 消耗と補充の時間差を表現できる
- 編成（近衛・野戦軍・艦隊）は人口台帳と分離したまま維持可能
- fort group の特殊ピラミッドは「駐屯地人口」として台帳の特例にできる

---

## 2. 設計原則

1. **単一の真実: Manpower Ledger**  
   兵役可能者は「民間の maleAdults」と「在営（under arms）」の **排他的分割** で表す。合計が人口ピラミッドの成人男性総数。

2. **軍隊は写しではなく引き出し**  
   `Military.generate` / 徴兵 / 補充は、台帳から `underArms` へ **転送**する。総人口に掛けるだけにしない。

3. **戦死は在営から先に落ち、民間に跳ね返る**  
   連隊の死者 = 在営 male の減少。残存家族側（民間）に「未帰還」が反映され、ピラミッドが男性凹みになる。

4. **天井は常に male プール**  
   国家の総兵力上限 `Σ r.t` は「動員可能 male × 政策動員率」を超えない。総人口%は **政策ターゲット** に過ぎず、**物理上限**ではない。

5. **Core 完結、拡張は補正**  
   台帳・徴兵・戦死・除隊は core generator に置く。Nobility の `Mobilization` は「目標動員率を上げる」政治層に縮退させる。Economy は給養コスト（将来）のみ。

6. **中世ヒューリスティックは粗くてよい**  
   厳密な徴兵区・世帯台帳は作らない。州/セル重み付き按分で十分。

7. **Military.generate の全再生成と共存**  
   位置・編成の再構築は今どおり可能にするが、**人数は台帳の underArms を再分配**する。勝手に総人口から盛り直さない。

---

## 3. 概念モデル

### 3.1 人口の見え方（同一リソースの投影）

```
                    ┌─────────────────────────────────────┐
                    │  成人男性ストック M_total            │
                    │  (= civilianMaleAdults + underArms) │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                                         ▼
   civilianMaleAdults                          underArms (在営)
   (cells / burgs の                          (全連隊 r.a の合計
    demographics.maleAdults)                   ※ crew 倍率は後述)
              │                                         │
              │ 人口ピラミッド表示                        │ Military レイヤー
              │ 出生は female のみ                       │ 戦闘・行軍
              ▼                                         ▼
         総人口 pop                                  r.a / r.t
```

**総人口**（表示・収容力比較）:

```
pop = children + civilianMaleAdults + femaleAdults + elders + underArms
```

または実装便宜上:

```
// demographics.maleAdults は「民間のみ」と定義し直す
// underArms は state または別配列に持ち、表示時だけ合算
displayPop = sum(buckets) + underArmsAttributedToSettlement
```

本設計では **推奨A（民間 male と在営を分離）** を採る。理由: ピラミッドで「村に残っている男」と「戦場に出ている男」を区別でき、戦後の未亡人効果が一目で分かる。

### 3.2 兵士の性別・年齢

| 項目 | 方針 |
| :--- | :--- |
| 性別 | 兵士は **原則 100% 成人男性**（初期・中世ファンタジー既定） |
| 女性兵士 | 将来オプション（`femaleLevyShare`、default 0）。ON 時のみ femaleAdults からも徴兵 |
| 少年兵 | 扱わない（子供バケツからは引かない） |
| 老人 | 兵役対象外（戦傷で elders を削る `applyHistoricalWarScars` の elders 減衰は廃止 or ごく小さく） |

### 3.3 単位系（必ず固定）

すべて **人口ポイント**（内部単位）で計算し、表示時だけ `populationRate` / `urbanization` を掛ける。

| 量 | 内部単位 | 表示 |
| :--- | :--- | :--- |
| `cells.pop`, `burg.population`, demographics 各バケツ | 人口ポイント | × `populationRate`（都市はさらに × `urbanization` の既存慣習に従う） |
| `regiment.a`, `regiment.t` | **実人数**（現状どおり `populationRate` 込みの人数） | そのまま |
| 台帳の underArms | **人口ポイント** = `troopHeadcount / populationRate` | — |

変換:

```
manpowerPointsFromTroops(troops) = troops / populationRate
troopsFromManpowerPoints(pts)    = pts * populationRate
```

`crew > 1` のユニット（騎兵 crew=2 等）は「1 スロットあたり複数人」なので、徴兵コストは `troops * crew` ではなく **現状の `r.a` が既に人数合計** である前提を維持する（`Military.getTotal` / 表示と一致）。unit.crew は戦闘力計算用とみなし、台帳は `sum(r.u values)` = headcount のみ使う。

---

## 4. Manpower Ledger（データモデル）

### 4.1 国家レベルの集計（必須・軽量）

`State` にキャッシュ（毎 tick または dirty 時に再集計）:

```ts
interface StateManpower {
  /** 民間 adult male 合計（人口ポイント） */
  civilianMaleAdults: number;
  /** 在営合計（人口ポイント）= Σ landRegiment.a / populationRate */
  underArms: number;
  /** 政策目標: 総人口に対する在営比率のターゲット（0.01 peacetime, up to 0.03+ wartime） */
  targetMobilizationRate: number;
  /** 物理上限に使う: 徴兵可能 male の最大比率（平時0.2〜戦時0.4 など） */
  maxLevyRate: number;
  /** 直近の徴兵/除隊/戦死のログ要約（UI・デバッグ用、任意） */
  lastYearDrafted?: number;
  lastYearKilled?: number;
  lastYearDemobilized?: number;
}
```

### 4.2 徴兵区（Recruitment Pool）— 中粒度

セル単位の完全追跡は重いので、**州（province）** を徴兵区の基本単位にする。province 0 の国は state 全体を1区。

```ts
interface LevyDistrict {
  stateId: number;
  provinceId: number; // 0 = statewide bucket
  /** この区の民間 maleAdults 合計（rural cells + burgs in province） */
  civilianMaleAdults: number;
  /** この区から出ている在営（ポイント） */
  underArms: number;
  /** この区の総人口（徴兵率の分母表示用） */
  population: number;
}
```

連隊には既存の `cell` / `province` に加え、任意で:

```ts
// MilitaryRegiment 拡張（任意フィールド）
homeProvince?: number; // 主たる徴兵元（生成時に設定、以後なるべく維持）
```

再生成時は `homeProvince` をキーに underArms を区へ戻してから再配分する。

### 4.3 都市グループ特例

| Group | 台帳上の扱い |
| :--- | :--- |
| **fort** | 人口の大半が既に「駐屯」性質。`underArms` と二重にしない。fort の `maleAdults` は **駐屯兵の民間側表示を兼ねない** — 代わりに「砦の常備」は state 連隊の一部が cell にいるだけ、とみなす **または** fort 人口 = そのセルに駐留する underArms の投影（§8） |
| monastery / caravanserai 等 | 通常の民間人口。徴兵ウェイトは低め（任意） |
| capital / city / town / village | 標準。都市は徴兵ウェイト中〜高（護衛・常備）、農村は bulk levy |

**fort の推奨**: 砦人口は「軍隊の影」ではなく **従軍家族・従僕・職人を含む基地人口** として残し、成人男性 8:2 はその基地人口の話。在営本体はあくまで `state.military`。戦死者は在営から落ち、基地人口の male は「補充で減る」経路でのみ連動（§6.3）。

---

## 5. 政策パラメータ（叩き台）

中世ヨーロッパ〜汎ファンタジー向けの粗い推定。調整は Options または定数テーブル1か所に集約。

| 定数 | 提案値 | 意味 |
| :--- | ---: | :--- |
| `PEACE_TARGET_MOBILIZATION` | **0.01** | 総人口の約1%を在営目標（現行 Mobilization / docs と一致） |
| `WAR_TARGET_MOBILIZATION` | **0.03** | 存亡戦時の目標（現行 EXISTENTIAL と一致） |
| `MAX_LEVY_OF_MALE_ADULTS` | **0.25** | 成人男性の最大25%まで在営可（物理上限）。残りは農業・治安に必須 |
| `WAR_MAX_LEVY_OF_MALE_ADULTS` | **0.40** | 総力戦時の上限（飢饉・生産崩壊のリスクを将来 Economy が読む） |
| `ANNUAL_DRAFT_SHARE` | **0.5** | 目標との差の半分を年1回埋める（現行 ANNUAL_GROWTH_SHARE） |
| `ANNUAL_RECOVERY_OF_A` | **0.2** | `a→t` の年次充足率（現行 updateDynamic）— **ただし male 残り分まで** |
| `ANNUAL_NATURAL_WASTAGE` | **0.02** | 平時の病死・脱走・事故（在営から civilian または死亡へ） |
| `DEMOBILIZATION_SHARE_PEACE` | **0.3** | 平和時、余剰在営を年30%民間へ戻す |
| `COMBAT_DEATH_TO_MISSING` | **1.0** | 戦死者は全員 underArms から永久削除（民間に戻さない） |
| `WOUNDED_RETURN_RATE` | **0.0**（初期） | 傷病兵の民間復帰。将来 0.1 等 |
| `RURAL_LEVY_WEIGHT` | **1.0** | 戦死・徴兵の地理配分ウェイト |
| `URBAN_LEVY_WEIGHT` | **1.5** | 都市は常備寄りでやや重め（現行10×は廃止） |
| `FORT_LEVY_WEIGHT` | **0.2** | 砦人口自体からの追加徴兵は薄い（既に軍事拠点） |

**目標兵力（人数）**:

```
totalPopPeople = statePopulationPeople(...)  // 既存の rural+urban 換算を整理
targetTroops = totalPopPeople * targetMobilizationRate
```

**物理上限（人数）**:

```
malePeople = civilianMaleAdults_pts * populationRate + underArms_pts * populationRate
// または M_total * populationRate
maxTroops = malePeople * maxLevyRate
effectiveTarget = min(targetTroops, maxTroops)
```

これにより「総人口1%」でも、戦争で male が枯渇すると **実効目標が下がる**。

---

## 6. ライフサイクル（To-Be フロー）

### 6.1 マップ生成時

```
1. rankCells / definePopulation / group profiles
   → children, maleAdults, femaleAdults, elders, capacity
2. applyHistoricalWarScars（改訂版）
   → 直近戦争がある state は maleAdults を減らす
   → 減らした量の一部を「既に戦死した在営」として歴史化し、初期 underArms を減らす
3. Military.generate（改訂版）
   a. 各 LevyDistrict の civilianMaleAdults を集計
   b. alert / 外交 / 文化宗教ペナルティで unit 構成比を決める（現行ロジック流用）
   c. effectiveTarget = min(pop*alert調整後ターゲット, male*maxLevy)
   d. 各地区から draftPoints を転送:
        civilianMaleAdults -= d
        underArms += d
   e. underArms を platoon → 連隊に編成（現行の近衛・野戦軍ロジック）
   f. r.a = r.t = 配分人数
4. 人口表示: maleAdults は民間のみ。総人口表示は民間合計 + 在営（在営は所属 state に計上）
```

**Historical war scars と軍隊の整合**:

- 現状: 人口だけ削って軍隊は満額 → 矛盾
- 改訂: `scarRate` で male を削った分、初期 `effectiveTarget` も同じ割合で圧縮  
  例: 戦傷 4% → 初期兵力も peacetime 目標の 96% からスタート、または戦傷分を「未回復定員」として `a < t`

### 6.2 年次徴兵（Advance Time / 元日）

Core に `conscriptFromManpower(pack)` を置く（Nobility の `Mobilization.conscript` はこれを呼ぶか、薄ラッパにする）。

```
for each state:
  target = min(pop * targetRate, maleTotal * maxLevyRate)
  capacityTroops = Σ r.t (land)
  if capacityTroops < target:
    gap = (target - capacityTroops) * ANNUAL_DRAFT_SHARE
    draft = min(gap, availableCivilianMale * populationRate * MAX_FRACTION_PER_YEAR)
    // 各地区の civilianMale 比例で draft を割り当て
    for each district:
      transfer civilian → raise r.t (and optionally seed r.a partially)
    // r.a の実増は updateDynamic が draft 可能分だけ埋める
  else if capacityTroops > target * 1.05 and atPeace:
    demobilize surplus: lower r.t, move underArms → civilianMale on home districts
```

**重要**: `r.t` を上げるだけでは不十分。同じ tick 群で:

1. `raiseCeiling(r.t)` — 定員
2. `fillFromManpower(r.a)` — 民間 male を実際に吸い上げて `a` を増やす  
   または現状どおり `updateDynamic` が埋めるが、**埋めた人数分だけ civilian から引く**

### 6.3 補充（updateDynamic 改訂）

```
if r.a < r.t:
  want = r.t * RECOVERY_RATE * deltaYears
  available = homeDistrict.civilianMaleAdults * populationRate * localDraftCap
  got = min(want, available, r.t - r.a)
  r.a += got
  homeDistrict.civilianMaleAdults -= got / populationRate
  // burg/cell demographics に按分反映
```

male が空なら **補充停止**（現在の「人口を無視して年20%回復」を廃止）。

### 6.4 戦闘死

```
on regiment casualties (deadTroops):
  1. r.a / r.u を減らす（現行）
  2. underArms_pts -= deadTroops / populationRate
  3. 民間 male は既に在営へ移済みなので、民間から二重に削らない
  4. 代わりに「死亡」として M_total から永久削除
  5. 人口ピラミッド効果:
       - 在営が減る → 国家の成人男性総数が減る
       - 表示上、home 集落の「出征中」が減り、未亡人（female はそのまま）比率が上がる
  6. r.t も任意で撃滅に応じて下げる（壊滅連隊は t も 0 へ）
```

**現行 `applyDemographicCasualties` の問題**は、民間 male からさらに削る点（二重計上前提の修正パッチ）。  
To-Be では **「戦死 = underArms の消滅」** のみ。民間は徴兵時に既に減っている。

**地理的な未亡人効果**の見せ方:

- 出征時: home 集落の `civilianMaleAdults` が減る → ピラミッドが即女性寄り
- 戦死: 在営が減るだけで、home の民間はさらに減らない（既に減っている）
- 除隊: 生還者が home の `civilianMaleAdults` に戻る → ピラミッドが戻る

これで「徴兵で村から男が消え、戦死で戻らず、除隊で一部戻る」が一貫する。

### 6.5 小競り合い・自動戦闘（Nobility localSkirmish 等）

すべての連隊損耗経路が **同じ `registerTroopLosses(regiment, dead)`** を通る。  
経路漏れが断絶の再発源になるので、API を1本化する。

### 6.6 国境変更・都市陥落

- 徴兵区の stateId が変わる → underArms は **連隊の所属 state** に残る（占領軍）
- 陥落 burg の民間人口は現行どおり所有変更
- 占領後の徴兵は新所有者の `maxLevyRate` と忠誠ペナルティ（文化・宗教）で抑制（現行 military の culture/religion ペナルティを draft 段階へ移植）

---

## 7. Military.generate との役割分担

| 責務 | 担当 |
| :--- | :--- |
| 兵役資源の残高 | Manpower Ledger |
| 何人まで取るか | targetRate × maxLevy × alert 補正 |
| どの兵科か | 現行 unit.rural/urban × biome/state type（比率のみ） |
| どう編制・命名・配置するか | 現行 consolidate（近衛・野戦・艦隊） |
| 時間経過で位置を動かすか | regimentMovement（人数に触れない） |
| 時間経過で人数を動かすか | draft / fill / demobilize / losses API |

`Military.generate` 全再生成時:

1. 現在の `Σ underArms`（または `Σ r.a`）を state ごとに保存
2. 連隊構造を破棄して再構築
3. **保存した underArms を再分配**（人口から再計算して盛らない）  
   例外: ユーザーが Military Overview で「Recalculate from population」を押したときだけフル再徴兵

`bordersChanged` で generate が走る場合も同様（兵がテレポートして人数だけ水増しされるバグを防ぐ）。

---

## 8. 都市人口・グループとの接続

### 8.1 表示人口

Burg Editor の Population:

```
displayUrbanPeople = (children + civilianMale + female + elders) * populationRate * urbanization
```

オプションで「出征中の出身者」を注記:

```
away = underArms attributed to this burg's province * share
```

### 8.2 グループプロファイル（fort 等）との関係

- **初期分割**（`burgDemographics`）: 平時・民間ベースの形を決める
- **徴兵後**: fort 以外は `maleAdults` が減り、プロファイル比率は崩れてよい（戦争の傷跡）
- **再適用禁止**: `applyDemographics(group)` をシミュレーション後に走らせると戦傷が消える。  
  許可するのは「人口総数の変更」「明示的な group 変更（エディタ）」のみ（現行 changeGroup 方針を維持）

### 8.3 中世都市の男女比との整合

後期中世都市は **民間で女性やや多め** が史料的に自然（奉公移住）。  
初期プロファイル:

| 集落 | 民間成人 M:F 目安 |
| :--- | :--- |
| village / hamlet | ~50:50 |
| town / city / capital | ~47:53 〜 45:55（現行 49:51 を都市は少し女性寄りに寄せてもよい） |
| fort | 基地人口 8:2（軍事） |
| 戦時徴兵後 | 民間はさらに女性寄り（男が出征） |

徴兵エコシステムが入れば、**都市の女性過多は「プロファイル」と「出征」の合算**で説明できる。

---

## 9. 戦争状態マシンとの接続

```
Peace
  targetRate = 0.01
  maxLevyRate = 0.25
  demobilization ON

Enemy diplomacy / high alert / active campaign
  targetRate → 0.03（段階的）
  maxLevyRate → 0.40
  demobilization OFF

Post-war (years)
  targetRate を 0.01 へ戻す
  surplus underArms を数年かけて demobilize
  female 多数の民間 + 出生維持 → ベビーブーム（既存 birth 式）
```

`state.alert`（現行）は targetRate の乗数に再利用:

```
targetRate = basePeaceOrWar * f(alert)  // 例: clamp(alert, 0.5, 2.0) で微調整
```

Economy の `warIntensity`（`docs/plan/economy-war.md`）は **価格** に使い、兵力台帳とは独立。将来「戦時税・兵器不足で draft 効率低下」を掛ける拡張ポイントにする。

---

## 10. API 表面（実装時のモジュール境界）

新規（案）: `src/generators/manpower.ts`（core）

| 関数 | 役割 |
| :--- | :--- |
| `recomputeStateManpower(stateId)` | 集計キャッシュ更新 |
| `draftTroops(stateId, troopDelta)` | 民間→在営、r.t/r.a 増 |
| `demobilizeTroops(stateId, troopDelta)` | 在営→民間 |
| `registerTroopLosses(regiment, dead)` | 在営消滅、r.a 減、統計 |
| `fillRegimentFromManpower(regiment, deltaYears)` | updateDynamic の中身 |
| `allocateInitialLevy(stateId)` | generate 用初期徴兵 |
| `assertManpowerInvariant(stateId)` | dev: M = civilian + underArms |

改訂:

| 既存 | 変更要点 |
| :--- | :--- |
| `Military.generate` | 初期人数は `allocateInitialLevy` 経由 |
| `Military.updateDynamic` | `fillRegimentFromManpower` を呼ぶ |
| `applyDemographicCasualties` | **廃止 or `registerTroopLosses` の薄いラッパ**（民間二重削りを削除） |
| `applyHistoricalWarScars` | male 減少と初期 levy 圧縮をセットで |
| `Mobilization.conscript` | 目標率の決定 + `draftTroops` 呼び出し（core へ依存） |
| battle-screen / localSkirmish | 必ず `registerTroopLosses` |

---

## 11. 不変条件（Invariants）

開発時 assert / デバッグパネル用。

1. `civilianMaleAdults + underArms ≈ maleAdultStock`（許容誤差 1e-3 ポイント）
2. `Σ regiment.a (land) / populationRate ≈ underArms`
3. `underArms <= maleAdultStock * WAR_MAX_LEVY_OF_MALE_ADULTS + ε`
4. いずれの demographics バケツも負にならない
5. `pop`（民間合計）+ 按分 underArms = 従来の総人口意味と矛盾しないよう UI 定義を文書化

---

## 12. UI / プレイヤーへの見せ方

| 場所 | 表示 |
| :--- | :--- |
| Burg 人口ピラミッド | 民間のみ。戦時は male バーが短い（出征済み） |
| State / Military Overview | 「民間成人男 / 在営 / 動員率 / 上限まで残り」 |
| Regiment tip | `a/t` に加え「補充不能（人手不足）」フラグ |
| 戦後 | 未亡人寄りのピラミッド + 数年後の子供増加 |

数値の「きれいさ」は、プレイヤーが **同じ男を二度数えられない** ことを体感できれば達成とする。

---

## 13. フェーズ計画（実装は別タスク）

### Phase 0 — 計測と不変条件（低リスク）

- 現状の `Σ r.a` と `Σ maleAdults * populationRate` の比をデバッグ出力
- 戦闘前後で人口・兵数がどうズレるかシナリオ記録
- 単位系ドキュメントを `docs/simulation/population-dynamics.md` に追記リンク

### Phase 1 — 台帳の導入（コア）

- `manpower.ts` + State 集計
- 徴兵時に civilian male を減らす（generate + conscript + fill）
- `applyDemographicCasualties` を二重計上しない形に置換
- 不変条件テスト

### Phase 2 — 目標と上限の統合

- `targetRate` vs `maxLevyRate` の min
- 平和時 demobilize
- Historical war scars と初期兵力の連動
- Nobility Mobilization を薄ラッパ化（core 必須化）

### Phase 3 — 地理配分の改善

- province 徴兵区
- rural/urban weight 見直し（10×廃止）
- `homeProvince` による補充元

### Phase 4 — 拡張接続

- Economy: 戦時給養不足 → draft 効率・maxLevy 低下
- fort 表示と駐留連隊の視覚的対応
- 女性徴兵オプション、傷病兵帰還
- 新兵質（訓練不足 power ペナルティ）— strategy.md の将来項目

### 非目標（明示的にやらない）

- 個人兵士・名前付き徴兵リスト
- リアルタイムな世帯シミュレーション
- 兵力の完全な会計監査 UI（Phase 1–2 は内部台帳と概要表示まで）
- Military.generate の兵科バイオーム式の全面やり直し（比率ロジックは流用）

---

## 14. 数値例（健全性チェック）

仮定: `populationRate = 1000`、ある国の表示総人口 1,000,000 人  
→ 内部総人口ポイント ≈ 1000（rural+urban の持ち方は実装に合わせる；ここでは「表示人口 / populationRate」= 1000 ポイントと単純化）

| バケツ | ポイント | 表示人数 |
| :--- | ---: | ---: |
| children | 400 | 400,000 |
| maleAdults (初期全民間) | 220 | 220,000 |
| femaleAdults | 230 | 230,000 |
| elders | 150 | 150,000 |

平時 target 1%:

```
targetTroops = 1,000,000 * 0.01 = 10,000
maxByMale   = 220,000 * 0.25 = 55,000
effective   = 10,000
draftPoints = 10,000 / 1000 = 10
```

徴兵後:

| | ポイント | 表示 |
| :--- | ---: | ---: |
| civilian male | 210 | 210,000 |
| underArms | 10 | 10,000 兵 |
| 民間ピラミッドの成人男女 | 210 : 230 ≈ **47.7 : 52.3** | すでに女性寄り |

戦闘で 4,000 戦死:

```
underArms → 6 ポイント（6,000 兵）
civilian male は 210 のまま
成人男性総数 216 → 表示上「出征中」が減り国全体の男が減る
帰還なし → 民間は戦前より男が少ないまま（徴兵で出て戦死）
```

戦後除隊で 6,000 全帰還:

```
civilian male 210+6=216（戦死4,000人分は戻らない）
female 230 のまま → 永続的な女性余剰 = 未亡人効果
出生は female ベース → 次世代で回復
```

この一連が、都市人口・ピラミッド・Military レイヤーで同じ物語になることが「きれいに整う」状態の定義である。

---

## 15. リスクと意思決定メモ

| リスク | 緩和 |
| :--- | :--- |
| 既存セーブで underArms が未記録 | ロード時: `underArms = Σ r.a/popRate` とみなし、civilian は現状 male のまま（一時的に二重）。次の draft/demobilize で徐々に収束、またはロード時1回 `reconcileManpower()` |
| generate 再実行で人数が飛ぶ | §7 の「underArms 再分配」必須 |
| 徴兵で都市人口が急減して Economy 生産が壊れる | 年次キャップ + urban weight を抑えめに + 生産が female+残 male 依存であることを確認 |
| Nobility OFF で徴兵が死ぬ | Phase 2 で core 年次 draft を timeEngine に直結 |
| fort 8:2 と出征の二重軍事感 | §4.3 / §8.2 の定義を実装コメントに残す |

---

## 16. 成功基準

1. 任意の state で `civilianMale + underArms` が出征前後・戦闘後も説明可能
2. 大規模戦闘後、Burg ピラミッドが男性凹みになり、兵数が同じ男の損失として減る
3. male 枯渇国家は `r.t` を上げても `r.a` が戻らない
4. 平和が続くと除隊で民間 male が戻り、出生で総人口が回復する
5. Military Overview の「人口比1%」が、台帳上の underArms / 総人口と一致する
6. fort の特殊人口が、徴兵台帳の不変条件を壊さない

---

## 17. 次のアクション（実装着手時）

1. Phase 0 で現状比の計測スクリプトまたは dev assert を追加  
2. `manpower.ts` スケルトンと不変条件テスト  
3. `registerTroopLosses` に battle / skirmish を集約  
4. generate / conscript / updateDynamic の順で draft 転送を有効化  
5. 本ドキュメントの数値例をフィクスチャ化した回帰テスト

**このファイル自体は設計 freeze のたたき台であり、実装 PR では本ドキュメントの Phase 境界に沿って分割すること。**
