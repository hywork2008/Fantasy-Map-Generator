# 蒸気機関の知識・技術蓄積プロセス設計

## 状態

**設計案（未実装）**。対象は [技術発展・発見ロードマップ](./technology-development-roadmap.md) の Phase 4「前工業化と蒸気機関」であり、[鉱物資源・鉱山・貨幣供給システム設計](./mineral-resource-system.md) の Phase 2・4 実装済みデータを入力として使う。

この設計は、蒸気機関を年数で自動解禁するものではない。大航海時代に火器が鉱山産の Iron / Lead / Saltpeter / Sulfur を実際に消費することで、深部鉱山の排水問題と資本投資が生じる。その反復的な失敗・記録・工作を、蒸気機関に到達するための知識蓄積として扱う。鉱床の恒常的な地下水圧（年間降水量と河川から生成）は、[鉱物資源・鉱山・貨幣供給システム設計](./mineral-resource-system.md#81-地下水圧と排水必要量) が所有する。

関連設計:

- [技術発展・発見ロードマップ](./technology-development-roadmap.md) §7–8, §12–14
- [鉱物資源・鉱山・貨幣供給システム設計](./mineral-resource-system.md) §5, §8–10
- [知識・技術蓄積システム](./knowledge-guild-system.md) §2–5
- [個人熟練・才能・技法システム](./individual-skill-mastery-system.md) §3–6

---

## 1. 結論

蒸気機関の最初の実用化は、**深部鉱山専用の大気圧排水機関**とする。繊維工場、回転動力、蒸気輸送、鉄道は別ノードであり、この段階では解禁しない。

```text
火器・貨幣・都市の金属需要
  → Iron / Lead / Coal 鉱山の増産・深部化
  → 坑内水、巻上げ、燃料費という持続的な損失
  → 排水機械の反復運用と、砲・ポンプ・計測器の工作経験
  → 実験自然哲学・標準記録・精密中ぐりの知識が結合
  → 鉱山での蒸気ポンプ試作
  → 燃料・保守費を上回る排水効果の実証
  → 限定鉱山への採用
```

火器は重要な**需要加速器**であって、蒸気機関の必須の科学前提にはしない。したがって火薬が世界設定で無効でも、銀・鉄・石炭の深部鉱山、都市燃料、民生需要から同じ経路に入れる。一方で、火器を採用し大量の Iron / Lead を消費する国家は、鉱山排水へ先に投資する強い理由を持つ。

## 2. 設計目標と非目標

### 2.1 目標

- 発明者一人や単発の乱数でなく、鉱山運用、工房、学術、資本、燃料を通じて進める。
- 鉱山の `depth`、`drainage`、`fuelAccess`、市場在庫、`MilitaryResourceLedger` を、蒸気機関の前提と効果の両方に接続する。
- `known` / `demonstrated` / `adopted` / `diffused` を、実験・試作・設備運転・設置拡大として明確に分ける。
- 石炭輸入が可能な鉱山でも採用できるようにし、炭田の自給を強制しない。
- 初期機関が資源を無限に増やさず、Coal、Iron、Tools、保守人員を継続して消費するようにする。
- 鉱業国家が海洋国家とは別経路で前工業化へ進めるようにする。

### 2.2 非目標

- ワット型機関、回転動力、Coke 高炉、近代製鋼、鉄道を同じ変更で実装しない。
- ボイラー圧、シリンダー径、熱効率を連続的な物理シミュレーションにはしない。
- 火器の需要不足を、研究値だけを増やして補わない。市場と鉱山の供給不足は実在する必要がある。
- `Coal` と `Charcoal` を混同しない。初期蒸気ポンプの運転燃料は採掘資源の `Coal`、中世の精錬・火薬の還元材は既存どおり `Charcoal` である。

## 3. 発明を生む圧力

### 3.1 鉱山排水圧力 (`mineDrainagePressure`)

年次技術評価では、State ごとに次の 0..1 の派生シグナルを計算する。これは新たな所有データではなく、Economy が所有する鉱山・市場・軍需 Ledger から作る読み取り専用の集計値である。

```text
deepMineShare          = active deep MineOperation / active MineOperation
groundwaterNeed        = groundwaterPressure × depthPenalty
drainageDeficit        = Σ (1 + groundwaterNeed) ×
                         max(0, targetDrainage(depth) - drainage) × mineCapacityWeight
mineralShortfall       = Iron / Lead / Coal の市場需要未充足率
militaryMineralStress  = 火器軍需の Iron / Lead 未充足率

mineDrainagePressure = clamp01(
  0.45 × drainageDeficit
  + 0.30 × deepMineShare
  + 0.15 × mineralShortfall
  + 0.10 × militaryMineralStress
)
```

- `groundwaterPressure` は鉱床生成時の年間降水量と河川の有無から得る恒常値であり、月ごとの天候では更新しない。降水量が多い河川沿いの深部鉱山ほど `groundwaterNeed` が高い。
- `targetDrainage(depth)` は `surface < shallow < deep` の離散的な必要排水水準である。地形上の水量を新設しない。実際の採掘係数は既に `groundwaterPressure × depthPenalty` で低下するため、技術シグナルはその不足を二重に資源量へ加算せず、投資の優先度だけを上げる。
- `mineralShortfall` は市場に在庫がゼロであることではなく、需要に対する実際の供給不足を用いる。備蓄を使い切るまで技術が無反応になることを避ける。
- `militaryMineralStress` は `MilitaryResourceLedger` が存在し、火器部隊または砲兵が需要を出したときだけ寄与する。Gunpowder の材料を二重消費しない。
- 一つの深部鉱山だけでも `known` への入口になり得るが、`adopted` は高い排水圧力を複数年維持するか、大きな一鉱山で十分な年産・埋蔵量を持つことを要する。

このシグナルは「資源が枯渇しているほど発明が速い」ことを意味しない。深部に残る回収可能資源、需要、資本がそろって初めて、排水投資を合理的にする。

### 3.2 火器からの因果関係

```text
gunpowderEraEnabled
  + State ごとの massFirearms / cannonFoundry 採用
  → MilitaryResourceLedger が Iron / Lead / Gunpowder を要求
  → 鉱山と市場の供給不足・価格上昇
  → deep MineOperation の開発・排水圧力
  → 排水研究・蒸気ポンプの事業候補
```

`massFirearms` は蒸気ノードの prerequisite にしない。代わりに `militaryMineralStress` を強くし、火器国家が早く有望な事業を作れるようにする。これにより「銃を持つだけで蒸気が発明される」短絡を避け、軍縮・平和期でも蓄積済みの鉱山技術が残る。

## 4. 蓄積する四種類の知識

蒸気機関は一つの `research` 値に集約しない。既存の知識所有境界を保ち、以下を別々に要求する。

| 知識・能力 | 所有者 / スコープ | 既存の土台 | 蒸気機関での役割 |
| --- | --- | --- | --- |
| 鉱山・排水の実務知 | Burg ギルド + MineOperation | `improvedMining`、`mechanicalWorkshops`、`MineOperation.drainage` | 坑内水の計測、ポンプ・巻上げの運転、失敗の蓄積 |
| 冶金・精密加工 | Burg ギルド | `GuildKnowledgeStock(metallurgy)`、高温炉、砲鋳造 | 均一な鉄、弁、ピストン、気密シリンダー |
| 計測・実験知 | Burg Academy | `recordReplication`、数学・天文、`instruments` | 圧力・温度・出力の比較、実験記録の再現 |
| 投資・標準化 | State と市場 / ギルド | `commercialFinance`、`administration`、Treasury | 研究の継続、試験損失の負担、部品規格と保守網 |

### 4.1 新設する最小のストックと記録

既存の `GuildKnowledgeStock` と `AcademyKnowledgeStock` を置換しない。Phase 4 では以下の最小追加に留める。

1. `naturalPhilosophy` を `AcademyKnowledgeStock` の scholarly domain として追加する。研究者頭数は、後述の `ExperimentalWorkshop` の雇用記録から得る。単なる人口や Treasury から直接 0..1 を作らない。
2. `instruments` は既存の craft domain を使い、`ExperimentalWorkshop` で Glass / Copper / Tools を消費した年だけ実践者・生産を記録する。現行の休眠 domain を実働化するための最小の消費者となる。
3. `precisionMachining` は第九の GuildKnowledge domain にせず、`MachineWorks` の年次運転記録から導く 0..1 の**派生能力**とする。これは冶金、instruments、砲中ぐり／ポンプ試作の反復回数を組み合わせる。二つの 0..1 ストックを無目的に増やさないためである。
4. 個人熟練を使える場合、親方・研究者の `engineering` / `mathematics` / `blacksmithing` は、試作速度と故障率への小さな補正にだけ使う。個人が死亡しても、記録済みの実験と Guild / Academy stock は消えない。未記録の試作技法のみ一部失われる。

### 4.2 `ExperimentalWorkshop` と `MachineWorks`

両者は新しい常時建物ではなく、Burg に年次で存在し得るプロジェクト記録である。採算の取れない研究都市を無条件に量産しないため、実際に予算と物資を消費する。

```ts
interface ExperimentalWorkshop {
  burgId: number;
  sponsorStateId: number;
  active: boolean;
  researchers: number;
  annualBudget: number;
  experimentRecord: number; // 0..1; documented and reproducible trials
  lastFundedYear: number;
}

interface MachineWorks {
  burgId: number;
  sponsorStateId: number;
  active: boolean;
  machinists: number;
  boringExperience: number; // 0..1; cylinders, pumps, cannon boring
  measurementQuality: number; // 0..1
  lastProductiveYear: number;
}
```

- `ExperimentalWorkshop` は Books / Paper / Ink / Glass / Tools と予算を消費し、`naturalPhilosophy` と `experimentRecord` を増やす。
- `MachineWorks` は Iron Ingot / Tools / Charcoal と予算を消費し、`boringExperience` を増やす。砲の製造・修理、鉱山ポンプ、計測器のいずれでも経験を得られる。
- 必要な Good の一部がない年は、ストックを即時ゼロにせず、研究・工作の成長を止め、緩やかに減衰させる。
- 初期実装では State が首都または候補鉱山のある Burg を一つ選ぶ。複数都市の研究機関、企業、特許は後続の拡張とする。

## 5. 技術グラフと段階遷移

### 5.1 ノードの全体像

```text
recordReplication ─┐
mathAstronomyGeography ─┼─ experimentalNaturalPhilosophy ─┐
distillation ──────┘                                      │
                                                               ├─ atmosphericSteamPumping
improvedMining ─ mineSurveyAndDrainage ───────────────────────┤
mechanicalWorkshops ──────────────────────────────────────────┤
highTempFurnace ─ precisionBoringAndMeasurement ──────────────┤
metallurgy + instruments + cannonFoundry (加速器) ────────────┘
coalFuelSupply ────────────────────────────────────────────────┘

atmosphericSteamPumping → condensateEfficiency → rotarySteamPower
```

`cannonFoundry` は `precisionBoringAndMeasurement` の経験を増やす**加速器**であり、必須前提ではない。火器を持たない鉱山国家でも、ポンプ・計測器・工具を反復すれば到達できる。

### 5.2 ノード定義

| ノード | 主な前提 | `known` | `demonstrated` | `adopted` |
| --- | --- | --- | --- | --- |
| `experimentalNaturalPhilosophy` | 記録複製、数学・天文、蒸留 | 支援された ExperimentalWorkshop、`naturalPhilosophy` の初期値 | 複数年の実験記録、計測器・紙・ガラスの継続消費 | 標準実験帳と研究者の継続雇用。後続の熱・圧力実験を再現可能 |
| `mineSurveyAndDrainage` | 改良鉱山、機械工房 | 深部または排水不足の鉱山一つ | 水力／機械ポンプを持つ候補鉱山で排水水準を維持 | 複数年の排水・巻上げ実績。深部鉱山の運転を制度化 |
| `precisionBoringAndMeasurement` | 高温炉、記録複製 | 冶金と instruments の実務、MachineWorks | `boringExperience` と `measurementQuality` が閾値、筒体・ポンプの試験成功 | 同規格部品を連年生産可能。砲中ぐりは有力な経験源 |
| `coalFuelSupply` | 改良鉱山、商業金融 | Coal を採るか輸入する市場 | 候補鉱山の市場に、年間運転量を満たす Coal を二年以上供給 | 炭鉱・輸送・保守の契約があり、蒸気ポンプの燃料を他需要から恒常的に奪わない |
| `atmosphericSteamPumping` | 上記四ノード | 排水圧力、候補鉱山、試作予算 | 一台の SteamPumpTrial が排水・燃料・故障の記録を連続二年満たす | 二箇所以上、または一鉱区の複数坑で採算運転。`SteamInstallation` を建設可能 |

各ノードは `scope: "state"` のまま既存 `TechnologyProgress` に保存する。ただし `atmosphericSteamPumping` の実証・採用は、後述の Burg / Mine 単位の物的証拠がなければ段階を上げない。State が知っていることと、どの鉱山で稼働するかを混同しない。

### 5.3 段階の意味と最短期間

| 段階 | 蒸気機関での意味 | 最低継続期間 |
| --- | --- | ---: |
| `locked` | 前提知識または鉱山圧力がない | — |
| `known` | 原理・部品・候補鉱山を把握し、試作契約を結べる | 2 年 |
| `demonstrated` | 候補鉱山で一台が連続して排水できる。燃料・修理を記録済み | 3 年 |
| `adopted` | 継続費用を払って複数設置し、鉱山運営の通常設備にした | 5 年 |
| `diffused` | 設置可能な State 内の適格深部鉱山へ、部品・整備者が段階的に広がる | 年次設置率で進行 |

既存の `advanceStage()` は条件が強いと同年に `locked → known → demonstrated → adopted` まで進める。このノード群には適用しない。各 `TechnologyDefinition` に `minimumYearsAtPreviousStage` または同等の project-evidence 条件を加え、上表の年数を跨いでから昇格させる。これが「知識の蓄積」を年次閾値の一回通過にしないための必須変更である。

## 6. 試作、失敗、採算

### 6.1 `SteamPumpTrial`

`atmosphericSteamPumping` が `known` になった State は、次を満たす深部鉱山に一件だけ試作を開始できる。

- 稼働中の `MineOperation` があり、`depth === "deep"`、未枯渇、十分な残存年数を持つ。
- `mineDrainagePressure` が最低値を超え、その坑の排水不足が観測されている。
- 同一市場または到達可能市場に Coal、Iron Ingot、Tools がある。
- `ExperimentalWorkshop` と `MachineWorks` のいずれかが同一 State 内で活動している。
- State Treasury またはスポンサー市場の予算が、建設費と一年分の保守費を払える。

```ts
interface SteamPumpTrial {
  mineOperationId: number;
  burgId: number;
  stateId: number;
  status: "building" | "running" | "failed" | "retired";
  buildProgress: number; // 0..1
  operatingYears: number;
  documentedRuns: number;
  failureCount: number;
  fuelConsumed: number;
  maintenanceConsumed: number;
  drainageDelivered: number;
}
```

失敗はランダムな「研究点の消失」ではない。材料不足、低い中ぐり精度、Coal 供給途絶、過大な排水負荷のいずれかを明示し、修理後に `experimentRecord` と `boringExperience` の一部を残す。同じ欠陥を繰り返さないため、失敗後の次回試作は僅かな改善を得る。ただし、未記録の親方技法は親方不在や工房解散で失われ得る。

### 6.2 採算判定

初期ポンプを「鉱石が増えたから成功」とは判定しない。毎年、次を比較する。

```text
benefit = 排水によって追加で回収できた鉱物の市場価値
          + 坑の停止を回避した価値
cost    = Coal + Iron / Tools 部品 + 保守労働 + 建設費の年割

trialViable = drainageDelivered ≥ 必要排水の下限
              and benefit ≥ cost × 採算閾値
              and 重大故障なし
```

`demonstrated` は一つの `trialViable` を連続二年、`adopted` は二つの採算運転または同一大鉱区の複数坑での連続運転を要求する。戦争での価格高騰だけに依存することを避けるため、複数年の平均値を使う。Coal が不足した年はポンプを停止し、排水・年産増加も得られない。

## 7. 実用化後の物的効果

### 7.1 設置単位

State の `adopted` は万能な生産倍率ではない。`SteamInstallation` は MineOperation ごとに保存する。

```ts
interface SteamInstallation {
  mineOperationId: number;
  technologyId: "atmosphericSteamPumping";
  installedYear: number;
  condition: number; // 0..1
  ratedDrainage: number;
  annualCoalNeed: number;
  annualMaintenanceNeed: number;
}
```

稼働条件は `Coal`、Iron Ingot / Tools、整備人員、`condition` である。月次 Economy cycle で必要物資を実際に市場から消費し、満たせない場合は `ratedDrainage` と鉱山年産ボーナスを比例して下げる。

### 7.2 効果の順序

```text
前年末の技術・設置状態
  → 当年の Coal / 部品 / 保守の確保
  → SteamInstallation の稼働率
  → MineOperation.drainage と採掘可能能力の上限を改善
  → 採掘量・埋蔵量・市場在庫を更新
  → 翌年の技術シグナルを評価
```

したがって、その年に `demonstrated` になったポンプが同年の採掘を増やすことはない。排水機関は `MineOperation.technology` を直接上書きせず、現行の排水・燃料・年産上限計算に独立した加算または乗数として渡す。Renderer はいずれの値も変更しない。

### 7.3 拡散

`diffused` は State 全鉱山への瞬時配布ではない。State が `adopted` 後、適格な深部鉱山を年ごとに候補化し、部品市場・Coal・整備人員・資本があるものだけが `SteamInstallation` を得る。初期値は「年 1 設置、または適格鉱山の 10% の小さい方」を上限とし、`precisionMachining` と整備者数が増えれば上限を上げる。征服された Burg の工房・研究記録は既存の Guild / Academy 征服撹乱を受ける。国家の技術段階だけを奪取して即時に全鉱山を機械化することはない。

## 8. 実装上の責務境界

| 項目 | 所有者 | 備考 |
| --- | --- | --- |
| Era 4 技術定義・年次段階評価 | host (`technologyDefinitions` / `technologyProgress`) | Economy を import せず、extension slice を plain data として読む |
| 鉱山圧力、試作、設置、Coal・部品消費 | Economy extension Generator | `MineOperation` / 市場 / 鉱床を唯一の正として更新する |
| Guild / Academy / workshop のストック | Economy extension Generator | 既存 EWMA と年次 tick の順序を保つ |
| 試作開始・停止・スポンサー選択 | Economy Controller / Extension action | UI 操作で変える場合のみ Controller が mutation する |
| 鉱山・機関の描画 | Economy Renderer | `Readonly<WorldContext>` から描画するだけ |
| 外部拡張への公開 | `ExtensionAPI` の登録 / 読み取り契約 | 動的 ZIP extension が host / Economy モジュールを直接 import しない |

`TechnologyEraBand` は `0 | 1 | 2 | 3` から少なくとも `| 4` へ拡張する。`TechnologySignals` には `mineDrainagePressure`、`deepMineCount`、`coalSupplyCoverage`、`naturalPhilosophy`、`instruments`、`precisionMachining`、`experimentRecord` を追加する。これらのうち鉱山・市場に由来する値は `simulation.extensions.economy` から集計するだけで、host が Economy の内部を所有しない。

## 9. 導入順序

### Phase 4A: 前提を観測可能にする

1. `TechnologyEraBand` と Technology signal を Era 4 用に拡張する。
2. `mineDrainagePressure` と Iron / Lead / Coal の不足内訳を、技術画面または鉱山 tooltip に表示する。
3. `ExperimentalWorkshop`、`MachineWorks`、`naturalPhilosophy` の最小年次更新を追加する。
4. `experimentalNaturalPhilosophy`、`mineSurveyAndDrainage`、`precisionBoringAndMeasurement`、`coalFuelSupply` を実装する。ここでは採掘ボーナスを与えない。

### Phase 4B: 一鉱山の垂直スライス

1. `SteamPumpTrial` を追加し、深部鉱山一件だけで建設・故障・保守・Coal 消費を検証する。
2. `atmosphericSteamPumping` の `known → demonstrated` を trial evidence に結び付ける。
3. 稼働時だけ排水不足を軽減し、鉱山年産を改善する。枯渇・燃料不足・市場経由の物資消費も同じ変更で実装する。

### Phase 4C: 採用と拡散

1. `SteamInstallation` と複数鉱山への段階的展開を追加する。
2. `adopted → diffused` を設置数と部品・整備能力へ結び付ける。
3. UI に技術段階、候補鉱山、燃料・部品不足、試作履歴を表示する。

### 後続 Phase

`condensateEfficiency`、`rotarySteamPower`、機械紡績、蒸気輸送、鉄道は、初期ポンプの採用効果と Coal / Iron の供給増を観測してから別々に設計する。高圧ボイラーは `highPressureMetallurgy` と安全・検査制度を要求し、初期大気圧機関の単純な数値上位版にはしない。

## 10. 受け入れ条件とテスト

- 火器の Iron / Lead 需要が鉱山・市場の不足を作ると、該当 State の `mineDrainagePressure` が上がる。
- 火器が無効でも、深部鉱山、Coal、実務・学術・資本があれば蒸気ポンプへ到達できる。
- 鉱山圧力だけ、または研究 stock だけでは `atmosphericSteamPumping` を `demonstrated` にできない。
- `known` から `adopted` まで同一年に飛ばず、必要年数と trial evidence を跨ぐ。
- Coal、Iron Ingot / Tools、保守費のいずれかが不足すると、ポンプは年産増加を与えない。
- `adopted` が State 全体の鉱物生産にグローバル倍率を与えず、設置済み MineOperation だけへ効く。
- 鉱山の埋蔵量はポンプによって回復しない。採掘量が増えれば枯渇も速くなる。
- 同じ seed、同じ経済状態、同じ試作履歴では、年次遷移と試作結果が決定的に再現される。
- Economy extension が無効な場合、Era 4 signal はゼロとなり、host の技術 tick は例外なく停滞する。
- 既存セーブは新しい workshop / trial / installation 配列を空として正規化し、既存の火薬・大航海ノードに影響しない。

## 11. 決定事項

1. 蒸気機関の入口は、深部鉱山の大気圧排水機関である。
2. 火器資源需要は蒸気機関を早める需要シグナルであり、必須 prerequisite ではない。
3. 科学、工作、鉱山実務、燃料・資本を別々の証拠として要求し、単一 research 値にはしない。
4. `demonstrated` と `adopted` は、Burg / Mine 単位の試作・設置記録を必要とする。
5. 初期機関は Coal、Iron、Tools、保守を継続消費し、設置した鉱山だけの排水・年産上限を改善する。
6. 既存 `GuildKnowledgeStock` / `AcademyKnowledgeStock` / `MineOperation` を正とし、蒸気システム専用の重複した資源・知識台帳は作らない。
