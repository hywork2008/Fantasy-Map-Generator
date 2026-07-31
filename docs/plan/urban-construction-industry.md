# 都市建築業設計: 石工・大工と建材システム (Urban Construction Industry)

## 状態

**2026-07-31 Phase 1-3 実装済み**: §7.1 の意思決定に従い、以下をすべて実装した。

- **Phase 1(採石場)**: `src/extensions/economy/generators/quarryOperations.ts`(`computeQuarryCandidates()`・`QuarryOperation`・`QuarryOperationsModule`)。既存の`Stone`/`Marble`のdistribution scatterとは併存させる方針(§7未決定事項1の決定)。`basicEmployment.ts`に石工採用前段の採石場ワーカー枠を追加。
- **Phase 2(建設職業・都市建築ストック)**: `src/extensions/economy/generators/constructionEmployment.ts`(`ConstructionOperation`・`getTargetBuildingStock()`・`getMasonShare()`・`getConstructionRequiredWorkers()`・`ConstructionOperationsModule`)。`buildingStock`のフィードバックは決定通り両方実装: (a) `getConstructionProductivityMultiplier()`を`production-generator.ts`の都市ボーナス生産式に接続(静的`shanty`フラグの動的代替)、(b) `constrainEffectiveCapacity()`で`burg.demographics.effectiveCapacity`に年次上限を課す(`foodImportNetwork.ts`の四半期処理とは独立した、別々に再適用される上限として層状に実装— 統合は今後の課題として本文に明記)。石工/大工比率は地形(採石場アクセスの有無)を最優先し、その範囲内で`culturesSet === "highFantasy"`が石工比率を押し上げる。木材需要は船大工との直接調整ではなく、市場在庫の奪い合いという間接的な形で実装(economy拡張はshipbuilding拡張に依存できないため)。
- **Phase 3(火山地質・ローマン・コンクリート)**: `mineralResources.ts`の`GeologicalProvinceKind`に`"volcanic"`(希少・高高度カーブアウト)を追加。`src/extensions/economy/generators/volcanicAshOperations.ts`で採石場と同型のBurgアンカー型サイトを実装。新規Good「Volcanic Ash」「Lime」(§7.1決定6により中間財として追加)「Roman Concrete」を`goods-generator.ts`に追加。Roman Concreteは§7.1決定3の通り、EWMA技術投資ストックではなくStoneの直接代替(効率2倍)として`constructionEmployment.ts`のマテリアル消費ロジックに実装。

テスト: `quarryOperations.test.ts`(8件)・`constructionEmployment.test.ts`(14件)・`volcanicAshOperations.test.ts`(5件)を新規追加。economy拡張全49ファイル276テスト、リポジトリ全体163ファイル1140テストが green。`tsc --noEmit`・`npm run lint`・`npm run build`はすべてクリーン。

**既知の逸脱・制約(実装時の判断)**:

- `npm run madge`の循環依存件数が27→30に増加した(採石場・建設・火山灰の3モジュールがそれぞれ+1)。これは既存の`mineOperations.ts`/`smelterOperations.ts`がすでに持っていた`economyContext.ts ⇄ production-generator.ts`間の循環と同型・同カテゴリであり、新しいアーキテクチャ上の問題ではない(economyContextのアクセサ注入パターンの構造的帰結)。AGENTS.md §8の「循環が増えたら解消する」という原則には反するため、次回セッションで対応方針を確認すること(§7未決定事項に追記)。
- decision 2b(`effectiveCapacity`の建設ストック連動キャップ)は年次ゲート(`reconcileAnnualBasicEmploymentWorkers()`直後)でのみ再適用され、`foodImportNetwork.ts`の四半期処理とは統合されていない。同一年内で食料輸入側が`effectiveCapacity`を引き上げ直す可能性があり、両者の統合は§7未決定事項として持ち越し。
- decision 4(船大工 vs 住宅大工のWood優先度)は、economy拡張がshipbuilding拡張に依存できない制約上、直接的な優先度切り替えではなく市場在庫の共有による間接調整として実装した。

## 0. 決定記録

| # | 決定 | 理由 |
| --- | --- | --- |
| D1 | 石工(Masonry)・大工(Carpentry)は `LaborMarket`/`STRATEGIC_OCCUPATIONS`(市場圏全体の職業cohortプール)ではなく、`MineOperation`/`SmelterOperation`と同型の **Burgアンカー型オペレーション**として実装する。 | [urban-employment-demand.md §2.3/§2.5](./urban-employment-demand.md) の決定記録が、鉱業・製錬のような「特定の場所に紐づく物理生産」はBurgアンカー型を選ぶべきとしている。建築は特定の都市そのものを対象にする行為であり、市場圏全体で均される`LaborMarket`の造船クラフトプールより、鉱山・製錬の側に性質が近い。 |
| D2 | 建築ストック(`buildingStock`)・建設技術ストック(`concreteTechStock`)は、ホスト型 `Burg`(`src/types/models.ts`)や `Market` interfaceに新規フィールドを追加せず、**economy拡張所有の配列**(`ConstructionOperation[]`、`burgId`でキー)として `economyContext.ts` に保持する。 | `MineOperation`/`SmelterOperation`が`burgId`で紐づく独立配列であり、host `Burg`型を汚染していない既存パターンをそのまま踏襲する(AGENTS.md §2 のcontext分離原則にも整合)。 |
| D3 | Phase 1(採石場)は、鉱物資源のような希少ベイン(vein)クラスタリングを持つ`MineralGeologicalProvince`エンジンを流用せず、`shipyardCandidates.ts`と同型の**候補地スコアリング関数**(`computeQuarryCandidates()`)を新設する。 | 建築石材は鉱石と異なり「近隣に十分な岩盤/丘陵地形があるか」という連続的な地形比率の問題であり、レア度でクラスタ化する必要がない。既存の`Stone`/`Marble`のdistribution式(`minHeight`ベース)がすでにこの直感と一致しており、それをそのまま複数セルにわたる「比率」に変換するだけで済む。地質学的プロヴィンス方式は火山灰(Phase 3、意図的に希少であるべき)にのみ採用する。 |
| D4 | Roman Concreteは新しいGoodの`demandCoverage`を引き上げる形ではなく、`AgTechInvestment`/`IndustrialTechInvestment`と同型の**EWMA技術投資ストック**(`concreteTechStock`)として実装し、建築ストックの獲得効率に乗数として効かせる。 | 直接`demandCoverage`を上げると`DEMAND_TARGET_FACTORS`のバランス全体に影響する。技術投資ストックとして切り離せば、既存の2つの技術投資モジュールと同じ年次決済ゲート・財源競合ルールに素直に乗り、影響範囲を建築サブシステム内に閉じ込められる。 |

---

## 1. 目的と非目的

### 目的

- 現状は生成時に一度だけ確定する静的コスメティックフラグ(`burg.walls`/`temple`/`citadel`/`plaza`/`shanty`)しか持たない都市の物理的インフラを、**労働力と資材を消費して漸進的に整備される動的ストック**(`buildingStock`)へと発展させる土台を作る。
- 石工(Masonry)・大工(Carpentry)という2つの新しい建設職業を都市に実装し、`Settlement pattern: frontier`や低い`Initial population`設定のように**人口が初期値から急激に増える状況で生まれる過剰労働力の受け皿**を作る。これは現状の`reconcileAnnualBasicEmploymentWorkers()`が行政・鉱業・製錬しか吸収しておらず、都市の物理的成長そのものに紐づく雇用が存在しないという欠落を埋める。
- 既存の `Stone`・`Marble` を、レガシーな`distribution`式スキャッター方式(鉱石がすでに卒業した仕組み — [goods-generator.ts:163-165](../../src/extensions/economy/generators/goods-generator.ts#L163-L165) 参照)から、都市に紐づく**採石場オペレーション**へ接続する。
- 火山灰を原料とする**ローマン・コンクリート(Pozzolana concrete)**を上級建材・技術として追加し、Tools投資EWMAパターンを再利用した「建設技術投資」システムを作る。

### 非目的

- 個々の建物(住宅1軒、寺院1棟など)単位のシミュレーション。都市の建築水準は`buildingStock`という集計スカラー値として扱う。
- 既存の城壁/寺院/広場/城塞/シャンティのSVGバーグアイコン描画ロジックの変更。Phase 1-3では`burg.walls`等の静的フラグは**そのまま残し**、`buildingStock`は並行するシミュレーション数値として扱う(アイコン描画への接続はPhase 4以降で検討・§7参照)。
- 攻城戦・戦争による建物破壊や`buildingStock`の減少モデリング。
- 既存のLaborMarket上の造船関連職種(`forestry`/`sailmaking`/`ropeMaking`/`tarBurning`/`trade`)の変更。大工(Carpentry)は新設のBurgアンカー型職種であり、造船の`forestry`とは別物として扱う(§6 不変条件・§7 参照)。
- 石灰岩(Limestone)・粘土(Clay)を含む既存の鉱物・炭酸塩プロヴィンス体系そのものの再設計。

---

## 2. 現状監査(コード参照)

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| `Stone`/`Marble` | `demandCoverage: {construction}`を満たす原材料Goodとして存在するが、**レガシーな`distribution`式スキャッター**(高度ベースの確率分布)で単セルに配置されるのみ。鉱石がすでに卒業した仕組みで、永続的な採取サイト実体(`MineralDeposit`/`MineOperation`相当)を持たない。 | [goods-generator.ts:131-156](../../src/extensions/economy/generators/goods-generator.ts#L131-L156)、鉱石側の卒業済みコメントは[goods-generator.ts:163-165](../../src/extensions/economy/generators/goods-generator.ts#L163-L165) |
| 建材の生産チェーン | `Stone`/`Marble`/`Clay`/`Wood`はいずれも`recipes`の入力として消費されず、`demandCoverage.construction`を直接満たすだけ。中間加工財(切石・煉瓦・モルタル・コンクリート)が一切存在しない。 | `GOODS_DATA`全体をgrep(`recipes:`ブロック)で確認済み |
| 建設需要カテゴリ | `DEMAND_PRIORITY`に`"construction"`は既に一級カテゴリとして存在し、`DEMAND_TARGET_FACTORS.construction = 0.1`、アイコン`"🧱"`も定義済み。**ただし人口比例の抽象需要としてのみ機能し、都市の物理的成長や職業とは無関係**。 | [goods-generator.ts:79-97](../../src/extensions/economy/generators/goods-generator.ts#L79-L97) |
| 鉱物資源の永続サイトモデル(参考実装) | `GeologicalProvinceKind = "orogen"\|"shield"\|"granite"\|"carbonate"\|"basin"\|"placer"`を`classifyProvince()`が高度+ハッシュで確定的に分類し、`MineralDeposit`→`MineOperation`(`burgId`/`marketId`アンカー、`toolsInvestmentStock`保持)という永続実体に落とす。 | [mineralResources.ts:40](../../src/extensions/economy/generators/mineralResources.ts#L40)、[mineralResources.ts:267-276](../../src/extensions/economy/generators/mineralResources.ts#L267-L276)、[mineOperations.ts](../../src/extensions/economy/generators/mineOperations.ts) |
| 候補地スコアリングの参考実装 | 造船拡張の`computeShipyardCandidates()`は「港湾Burg + 近隣セルの森林biome比率(`forestRatio`) ≥ 0.3」で造船候補地を判定する、地質学的プロヴィンスより軽量なパターン。採石場候補地の直接のテンプレートとなる。 | [shipyardCandidates.ts:6-40](../../src/extensions/shipbuilding/generators/shipyardCandidates.ts#L6-L40) |
| 職業(occupation)の型システム | 固定enumの「職業」概念は存在しない。2つの並立パターンがある: (A) Burgアンカー型`.workers`フィールド(行政・鉱山・製錬。`reconcileAnnualBasicEmploymentWorkers()`が年1回、25%/年キャップで成人人口から充足) (B) Market圏全体の`LaborMarket.workersByOccupation`(`STRATEGIC_OCCUPATIONS = ["forestry","sailmaking","ropeMaking","tarBurning","trade"]`、市場人口の30%が対象プール)。 | [basicEmployment.ts:1-60](../../src/extensions/economy/generators/basicEmployment.ts#L1-L60)、[strategicLaborMarkets.ts:11-35](../../src/extensions/economy/generators/strategicLaborMarkets.ts#L11-L35) |
| Burgの建物フラグ | `citadel`/`plaza`/`walls`/`shanty`/`temple`はいずれも生成時(`burgs-generator.ts`)に人口閾値+乱数で一度だけ決まる`0\|1`フラグ。**シミュレーション中に一切更新されない**。都市アイコンのSVG部品選択にのみ使われ、経済的効果はゼロ。 | [burgs-generator.ts:788-796](../../src/generators/burgs-generator.ts#L788-L796)、描画利用は[burgs-generator.ts:994-1062](../../src/generators/burgs-generator.ts#L994-L1062) |
| 技術投資EWMAパターン(参考実装) | `AgTechInvestment`/`IndustrialTechInvestment`が「`Tools`購入カバレッジ→0..1のEWMA `stock`→下流の乗数ボーナス」という型を確立済み。年次ゲートは`getXLastSettledYear()`/`setXLastSettledYear()`ペアで自己管理し、`economy.tick`内で`AgTechInvestment.settleAnnual()`→`IndustrialTechInvestment.settleAnnual()`→`DevelopmentPotential.updateAnnualAgriculture()`の順に固定コメント付きで呼ばれる。 | [rural-agtech-investment.md](./rural-agtech-investment.md)、呼び出し順序は[index.tsx:1362-1370](../../src/extensions/economy/index.tsx#L1362-L1370) |
| 基礎雇用の年次改定順序(参考実装) | `reconcileAnnualBasicEmploymentWorkers()`は同一Burg内で「行政→鉱山→製錬」の順にスロットを充足し(製錬は鉱石供給に依存するため後回し)、`MAX_ANNUAL_WORKER_CHANGE_SHARE = 0.25`で年間の急変を抑える。`urbanMobility`フラグでゲートされ、`economy.tick`の[index.tsx:1450](../../src/extensions/economy/index.tsx#L1450)から呼ばれる。 | [basicEmployment.ts:17-60](../../src/extensions/economy/generators/basicEmployment.ts#L17-L60) |
| Lime/Concrete/Mortar/Bricks | いずれも未実装。`goods-generator.ts`に該当Goodは存在しない。 | grep確認済み(該当ゼロ件) |
| 火山の地質学的痕跡 | ヒートマップ生成テンプレート`"Volcano"`([heightmap-templates.ts:22](../../src/data/heightmap-templates.ts#L22))はマップ全体の初期地形整形にのみ使われ、生成後にセル単位の「ここは火山性」フラグを残さない。`ReliefEditorDialog`の火山アイコンも装飾のみでシミュレーションデータではない。`GeologicalProvinceKind`に`"volcanic"`相当の分類は存在しない。 | [heightmap-templates.ts:22](../../src/data/heightmap-templates.ts#L22)、[ReliefEditorDialog.tsx:45-83](../../src/ui/dialogs/ReliefEditorDialog.tsx#L45-L83) |

---

## 3. 設計

### 3.1 全体像

```
[Phase 1] 採石場候補地(computeQuarryCandidates)
   burg + 近隣セルの「岩盤/丘陵biome比率」(shipyardCandidates.ts型)
        │
        ▼
   QuarryOperation { burgId, quarryWorkers, stoneOutput, marbleOutput }
        │  (Stone/Marbleの生産元をレガシーscatterから置換)
        ▼
[Phase 2] ConstructionOperation { burgId, masonWorkers, carpenterWorkers, buildingStock }
   targetBuildingStock = f(population)  ──> backlog = target - buildingStock
   requiredMasonWorkers/requiredCarpenterWorkers = f(backlog)
        │  Stone + Wood(+Tools) を消費して buildingStock を漸進的に押し上げる
        │  reconcileAnnualBasicEmploymentWorkers() に第4スロットとして統合
        ▼
   buildingStock ──> (フィードバック先は§7で未決定: urbanLaborIntake容量制約 or 生産性乗数)

[Phase 3] classifyProvince() 拡張: "volcanic" kind (希少・高高度)
        │
        ▼
   Volcanic Ash (新Good) ──recipe──> Roman Concrete (新Good)
        │
        ▼
   ConstructionTechInvestment.settleAnnual() (Tools投資と同型のEWMA)
        │
        ▼
   concreteTechStock ──> buildingStock獲得効率への乗数ボーナス
```

新設するのは「採石場サイト」「建設オペレーション」「建設技術投資」の3層のみで、既存の`Stone`/`Marble`のGood定義自体(名前・タグ・`demandCoverage`)は変更しない。既存の食料・鉱業パイプラインと同様、**下流を変えずに新しい入力層を足す**設計にする。

### 3.2 Phase 1: 採石場(Quarry)候補地とオペレーション

```ts
// src/extensions/economy/generators/quarryOperations.ts — 新規
export interface QuarryCandidate {
  burgId: number;
  /** 近隣セルのうち Stone の distribution 条件を満たす比率, 0..1 */
  stoneRatio: number;
  /** 近隣セルのうち Marble の distribution 条件を満たす比率, 0..1 */
  marbleRatio: number;
}

export interface QuarryOperation {
  burgId: number;
  marketId: number;
  quarryWorkers: number;
  requiredWorkers: number; // getQuarryRequiredWorkers(candidate) 相当
  toolsInvestmentStock?: number; // IndustrialTechInvestment が書き込む既存パターンを流用
}
```

- `computeQuarryCandidates()` は [shipyardCandidates.ts](../../src/extensions/shipbuilding/generators/shipyardCandidates.ts) と同型: 各Burgについて近隣セル集合を走査し、既存の`Stone`/`Marble`の`distribution`式(`minHeight(40) || (minHeight(20) && elevation())`等)を満たすセルの比率を計算する。**新しい地形分類ロジックを発明せず、既存のdistribution式をそのまま比率化するだけ**に留める(D3)。
- `requiredWorkers`は鉱山の`getMineRequiredWorkers(deposit) = 4 + richness*6`([mineOperations.ts:29-31](../../src/extensions/economy/generators/mineOperations.ts#L29-L31))に倣い、`stoneRatio`/`marbleRatio`を「richness」相当として使う。
- 採石場の産出は`Stone`/`Marble`の`Market`への供給源として`Production`に接続する。**既存のdistribution scatterは撤去せず併存させてよい**(急激な供給断絶を避けるため、鉱石移行時の`mineral-resource-circulation-fixes.md` Fix 3と同じ移行方針を踏襲するか、次セッションで確定 — §7)。

### 3.3 Phase 2: 建設職業(石工・大工)と都市建築ストック

```ts
// src/extensions/economy/generators/constructionTypes.ts — 新規
export interface ConstructionOperation {
  burgId: number;
  masonWorkers: number;
  carpenterWorkers: number;
  requiredMasonWorkers: number;
  requiredCarpenterWorkers: number;
  /** 0..1 飽和ストック。人口規模に対する都市インフラの整備度合いを表す EWMA 的な値。 */
  buildingStock: number;
}
```

- **人口ドリブンの目標値**: `targetBuildingStock = saturating(population / POPULATION_SCALE)` のような、人口増加に応じて上昇する目標関数を定義する。急成長中のBurg(`frontier`パターン・低`Initial population`設定)ほど`population`の伸び率が高く、`targetBuildingStock`と現在の`buildingStock`の乖離(`backlog`)が大きくなり、結果として`requiredMasonWorkers`/`requiredCarpenterWorkers`が増える —— これが「人口急増局面ほど石工・大工の雇用需要が跳ね上がる」というユーザーの直感をそのままモデル化する。
- **資材消費**: 石工は`Stone`(将来的に`Marble`で高級化)を、大工は`Wood`(将来的に`Tools`で効率化)を消費し、`buildingStock`を`backlog`に比例して押し上げる。消費量は`Markets.consumeForMarketInvestment()`(Tools投資と同じ関数)を再利用できるか確認する。
- **年次改定への統合**: `reconcileAnnualBasicEmploymentWorkers()`のスロット順序に「行政→鉱山→製錬→**建設(石工→大工)**」として第4のスロット種別を追加する。既存の`MAX_ANNUAL_WORKER_CHANGE_SHARE = 0.25`・成人人口プールからの充足という制約をそのまま共有し(D2に整合)、二重に人口を消費しない。
- **フィードバック接続は未決定(§7)**: `buildingStock`の下流効果 — 既存の静的`shanty`フラグに代わる動的な過密度ペナルティにするか、[urban-employment-demand.md](./urban-employment-demand.md) Phase 4で予定されている`employmentDemand → urbanLaborIntake`接続に「住居容量の上限」として割り込ませるか、あるいは両方か。

### 3.4 Phase 3: 火山地質とローマン・コンクリート技術投資

```ts
// mineralResources.ts の GeologicalProvinceKind に "volcanic" を追加
export type GeologicalProvinceKind =
  | "orogen" | "shield" | "granite" | "carbonate" | "basin" | "placer"
  | "volcanic"; // 新規: 非常に高い高度 + 低確率ハッシュで希少に判定(placerと同じ手法)
```

```ts
// goods-generator.ts に新規 Good を追加
{ name: "Volcanic Ash", tags: ["construction", "mineral"], /* volcanic province セルのみに分布 */ }
{ name: "Roman Concrete", tags: ["construction"], recipes: { "Volcanic Ash": 1, Stone: 0.5 } }
```

```ts
// src/extensions/economy/generators/constructionTechInvestment.ts — 新規
// AgTechInvestment.settleAnnual() / IndustrialTechInvestment.settleAnnual() と同型:
// 1. concreteTechStock は 0..1 の EWMA、Roman Concrete 購入カバレッジで更新
// 2. 予算上限は treasury.balance の一定割合(BUDGET_SHARE_OF_TREASURY 相当)
// 3. stock はコンシューマ側(constructionEmployment.ts)で乗数として読み、
//    buildingStock 獲得効率 = baseRate * (1 + CONCRETE_TECH_BONUS_MAX * concreteTechStock)
//    のように働かせる(import循環回避のため consuming file 側に置く既存慣習を踏襲、
//    industrialTechInvestment.ts:32-35 の注記と同じ理由)
```

- `economy.tick`の呼び出し順序に`ConstructionTechInvestment.settleAnnual()`を追加する。挿入位置は`IndustrialTechInvestment.settleAnnual()`の直後・`reconcileAnnualBasicEmploymentWorkers()`([index.tsx:1450](../../src/extensions/economy/index.tsx#L1450))の直前とし、当年の技術投資が当年の建設職業改定に反映されるようにする([index.tsx:1362-1370](../../src/extensions/economy/index.tsx#L1362-L1370)のコメント規約に倣い、なぜこの順序かを明示的にコメントする)。
- 火山性セルの希少性は、鉱石の`"placer"`プロヴィンスの確率ハッシュ手法([mineralResources.ts:267-276](../../src/extensions/economy/generators/mineralResources.ts#L267-L276))をそのまま流用する。

### 3.5 Phase 4(将来・スコープ外): UI可視化

- ~~Employment Overview([employment-overview.ts](../../src/extensions/economy/controllers/employment-overview.ts))に石工/大工の雇用列を追加する(既存のパターンに`ConstructionOperation`を読む行を1つ足すだけ)。~~ **2026-07-31実装済み**: [urban-employment-demand.md](urban-employment-demand.md)側の実機検証中に発見した欠落(`basicEmploymentDemand`は建設業を合算済みだがダイアログに列がなく不可視だった)として対応した。`getConstructionEmploymentByBurg()`(masonWorkers+carpenterWorkers+採石場quarryWorkers+Volcanic Ash ashWorkers)を追加し、「Construction」列として表示。「Basic」列のツールチップ数式も建設業を含む形に修正した。
- Market Overview Dialogに`concreteTechStock`表示を追加する(Ag Tech表示の既存パターンを踏襲)。
- `buildingStock`とバーグアイコンの城壁/寺院/城塞フラグとの接続(非目的§1で明示的にPhase 1-3のスコープ外としたもの)。

---

## 4. Phase分割

| Phase | 内容 | 主な新規ファイル | 依存 |
| --- | --- | --- | --- |
| 1 | 採石場候補地(`computeQuarryCandidates`)・`QuarryOperation`・Stone/Marbleの供給源接続 | `quarryOperations.ts` | なし(独立に着手可能) |
| 2 | `ConstructionOperation`・石工/大工の年次雇用改定・`buildingStock` | `constructionTypes.ts`, `constructionEmployment.ts` | Phase 1(Stone供給が必要) |
| 3 | `volcanic`プロヴィンス・Volcanic Ash・Roman Concrete・`ConstructionTechInvestment` | `constructionTechInvestment.ts` | Phase 2(`buildingStock`獲得効率への乗数として接続) |
| 4(将来) | UI可視化・バーグアイコン接続 | 既存ファイルへの追記 | Phase 1-3 |

---

## 5. テスト計画

- 各新規モジュールにユニットテストを追加する(precedent: `agTechInvestment.test.ts`, `industrialTechInvestment.test.ts`の構成を踏襲): `quarryOperations.test.ts`, `constructionEmployment.test.ts`, `constructionTechInvestment.test.ts`。
- `reconcileAnnualBasicEmploymentWorkers()`に建設スロットを追加した後、既存の`basicEmployment.test.ts`(存在すれば)が行政→鉱山→製錬の優先順位を壊していないことを回帰確認する。
- `npx tsc --noEmit`・`npm run build`・`npm run lint`・`npm run madge`(既存の循環依存件数から増減がないこと、新規ファイルがいずれの循環にも含まれないこと)をPhaseごとに確認する。

---

## 6. 不変条件

1. `masonWorkers`/`carpenterWorkers`/`quarryWorkers`は必ず該当Burgの現在の成人人口の部分集合であり、`burg.population`/`demographics`自体を書き換えない(既存の`administrationEmployment`/`mineOperations`と同じ制約)。
2. `buildingStock`/`concreteTechStock`/`ConstructionOperation`/`QuarryOperation`はいずれもeconomy拡張所有の状態としてのみ存在し、ホスト型`Burg`(`src/types/models.ts`)や`Market` interfaceに新規フィールドを追加しない。
3. 既存の`Stone`/`Marble`のdistribution scatterセルの空間分布(biome/height式)は変更しない — Phase 1は供給源を「置換」するのではなく「追加接続」する。
4. 建設職業の年次改定は既存の`reconcileAnnualBasicEmploymentWorkers()`と同じ`MAX_ANNUAL_WORKER_CHANGE_SHARE`・同じ年次ゲート(`urbanMobility`フラグ)を共有し、独自の別ゲートを作らない。
5. `ConstructionTechInvestment`は`AgTechInvestment`/`IndustrialTechInvestment`と同じtreasury予算枠を取り合うため、複数の技術投資が同一年に同一treasuryへ請求する場合の優先順位を明示的にコードコメントで残す(既存2モジュール間の優先順位コメントと同じ規約)。
6. 大工(Carpentry, Burgアンカー型)と造船の`forestry`(LaborMarket型)は別の職業として扱い、`Wood`需要の奪い合いが起きることを許容しつつ、両者のロジックやデータ構造を混同・共有しない(D1)。

---

## 7. 未決定事項(次セッション冒頭で確認する)

1. **採石場のサイトモデル**: D3で候補地スコアリング方式を推奨したが、既存のdistribution scatterセルとの整合(供給を完全移行するか、並存させるか)を確定する。鉱石が辿った移行(`mineral-resource-circulation-fixes.md` Fix 3)と同じ手順を踏むか、より軽量な接続で済ませるかを次セッション冒頭で判断する。
2. **`buildingStock`のフィードバック先**: (a) 既存`shanty`フラグに代わる動的な過密度/生産性ペナルティ、(b) `urban-employment-demand.md` Phase 4の`urbanLaborIntake`への受け入れ容量キャップ、のどちらか、または両方を実装するか。
3. **Roman Concreteの効果モデル**: `Stone`/`Wood`の直接代替(コスト削減)にするか、`buildingStock`獲得速度への乗数ボーナス(D4で暫定採用)のままにするか。
4. **`Wood`需要の資源競合**: `Wood`は既に`demandCoverage: {construction, utilities}`を持ち、造船拡張の`forestry`occupationとも競合する。大工の`Wood`消費を追加した場合の需給バランス調整方針(`Wood`のGood定義自体を調整するか、大工の消費量を控えめに較正するか)。
5. **石工/大工の必要人数比率**: `requiredMasonWorkers`と`requiredCarpenterWorkers`の相対比率(`Stone`系資材と`Wood`系資材のどちらが`buildingStock`獲得によりウェイトを持つか)の較正方針。
6. **`Lime`/モルタルの要否**: Roman Concreteのレシピを`{"Volcanic Ash": 1, Stone: 0.5}`のように既存Goodだけで組むか、新規`Lime`(石灰岩由来、既存`carbonate`プロヴィンスから調達)を中間財として追加するか。

### 7.1 意思決定

1. 併存させる。
2. 両方を実装する。
3. 直接代替。
4. 物流の関係で新しい船が大量に必要で無い時は住宅用を優先し、船大工は消費を控えめにする。それ以外では船を優先し、住宅建築の大工は消費量を控えめにする。
5. 文化(特にCultures setがHigh Fantasyの場合)か地形によって比率を決める。地形が建材を排出しないのであれば使えるものを使うしか無い。
6. 中間財として追加する。

### 7.2 実装で新たに判明した未決定事項(次セッション冒頭で確認する)

1. **madgeの循環依存増加(27→30)**: 採石場・建設・火山灰の3モジュールがそれぞれ`economyContext.ts ⇄ production-generator.ts`間の循環に1件ずつ加わった。既存の`mineOperations.ts`/`smelterOperations.ts`と同型・同カテゴリの構造的帰結(economyContextのアクセサ注入パターン)だが、AGENTS.md §8の「循環が増えたら解消する」原則には反する。解消するなら`ProductionRecord`型を`production-generator.ts`から依存フリーな型モジュールへ切り出す再設計が必要(経済拡張全体に影響するため本機能単体のスコープ外)。このまま許容するか、切り出しリファクタを別タスクとして起票するかを決定する。
2. **`effectiveCapacity`統合**: `ConstructionOperations.constrainEffectiveCapacity()`(年次)と`foodImportNetwork.ts`の`applyImportCapacity()`(四半期)は独立して`effectiveCapacity`を書き換えており、同一年内で食料輸入側が建設ストック側のキャップを上書きする可能性がある。四半期処理側でも建設キャップをMin適用するか、年次キャップの再適用頻度を上げるか、あるいは両者を1つの関数に統合するかを決定する。
3. **`Wood`優先度の実装乖離**: §7.1決定4は「船の需要量に応じた優先度切り替え」を意図していたが、economy拡張はshipbuilding拡張(別の任意拡張)に直接依存できないため、実装は「同一市場在庫を両者が奪い合う」間接調整に留めた。shipbuilding側から何らかのシグナルを`ExtensionAPI`経由で公開し、真の優先度切り替えを実現する価値があるかを判断する。
