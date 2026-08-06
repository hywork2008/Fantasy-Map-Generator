# 船

火薬・大砲の出てくる前の時代を想定している。
船の種類も最初は大型船を作る技術力が無い。
最初は軍も交易船もキャラックのうち小型のものを使う。

## 1. 港

船のサイズによっては上限何隻まで停泊出来るかという属性を持たせる。
Shipyardsで生産された船は経て港へ停泊する。

## 2. 種類

本プロジェクトは火薬・大砲以前の時代設定（弓矢・白兵戦が基本）なので、大砲を積む前提の
実在ゲームの艦種一覧はそのまま使わない。実装済みの技術ツリー（`src/extensions/shipbuilding/generators/shipClasses.ts`）
は、意図的に大砲を持たず、船体規模・積載量・乗員数・航洋性を軸にした3ティア構成になっている。
`getShipSizeTier()`（同ファイル）が各ティアを港湾収容力（4章）の小型/中型/大型の区分にそのまま写像する。

### 2.1 小型: スループ (Sloop)

- `tier: 0`, `techPointsRequired: 0`, `buildPointsRequired: 10`
- 唯一、研究なしで最初から建造できる船級（`getHighestUnlockedShipClass(0)` が返す既定値）。
- 想定用途: 沿岸の哨戒・小口輸送・伝令。乗員が少なく、どんな小さな造船適性都市（`ShipyardCandidate`）
  でも1隻分の係留スペース（港湾収容力4章の「下限1隻」）が確保される前提の最小単位。
- 平時は国家所有・商会所有を問わず民間の交易船と見分けがつかない運用に出る
  （4.5節「航海訓練・偽装通商・諜報」）。港に長く留まるのは戦時の動員時のみ。

### 2.2 中型: キャラベル (Caravel)

- `tier: 1`, `techPointsRequired: 50`, `buildPointsRequired: 25`
- 国家の造船技術ポイントが50に達して初めて建造キューの目標クラスになる
  （`shipyardQueue.ts` の `getHighestUnlockedShipClass`）。技術ポイントは造船適性都市の数に比例して
  国家単位で蓄積するため、造船拠点を複数持つ大国ほど早く到達する。
- 想定用途: 中距離の遠洋交易・兵員輸送。小型より積載量・乗員規模が大きく、港湾収容力の「中型」枠
  （`total >= 3` でのみ解放）を消費する。

### 2.3 大型: ガレオン (Galleon)

- `tier: 2`, `techPointsRequired: 150`, `buildPointsRequired: 60`
- 技術ツリーの最上位。建造ポイント要求も最大で、造船に最も時間がかかる。
- 想定用途: 大量の兵員・貨物を運べる遠征艦隊の中核、国家の威信を示す旗艦。港湾収容力の「大型」枠
  （`total >= 8` かつ十分に開けた港湾 `harborFactor >= 0.5` でのみ解放）を消費するため、小さな漁村や
  閉じた入り江には係留できない、という希少性が設計上組み込まれている。

### 2.4 将来の拡張候補

上記3隻は現状 `id`/`name`/`tier`/`techPointsRequired`/`buildPointsRequired` のみを持ち、積載量
（cargo）・乗員（crew）・耐久（durability）・速度（speed）といった数値フィールドは`ShipClass`に
まだ存在しない（`shipVoyages.ts` は暫定的に `buildPointsRequired` を「船が大きいほど稼ぐ」の代理指標
として流用している——4.5節の既知の限界を参照）。今後こうした数値を追加する場合は、実在ゲームの
数値をそのまま転記するのではなく、上記3隻それぞれの役割（小型=哨戒/沿岸輸送、中型=遠洋交易、
大型=遠征/威信）に沿った、本プロジェクト独自の値を設定すること。

## 3. 所有者による違い

国が持つ船か、民間の船か。

## 4. 港湾収容力（暫定案）

> Elevation（陸側標高）・Coastal Habitat（陸側基質）・Depth（水深、大型ティアの喫水条件を含む）に
> よる追加の立地・容量条件は[harbor-siting.md](harbor-siting.md)で実装済み。本節の式へ
> `elevationFactor`（Marginal帯での容量縮小）・`coastalHabitatFactor`（`sandyBeach`/`coastalDune`/
> `tidalFlat`基質での容量縮小）・水深ティア別の`large`減算が重ねてある（`computeBurgPortCapacity()`）。
> 旧`allowsFormalHarbor()`による`sandyBeach`のハード除外は廃止済み — 基質はいずれも候補地から除外
> されず、容量側でのみ縮小する（harbor-siting.md §4.3）。Economy側の経常維持費コスト・干拓による
> 基質の恒久転換はまだ未実装（harbor-siting.md §6）。

前提: 現状のコード（`src/extensions/shipbuilding/generators/shipyardCandidates.ts`,
`shipyardQueue.ts`）には「港が何隻まで停泊できるか」という上限は存在しない。完成した船体は
`_completedHulls`（`shipyardQueue.ts:23`）という単なるカウンタで、造船キューが完了するたびに
青天井で増え続ける。以下は、既存の人口・港湾データだけから収容力を導出する暫定案。新しい無関係な
定数を持ち込まず、既にコードベースにある値・パターンの再利用に留める。

### 4.1 使う既存データ

- **実人口**: `burg.population`（抽象値）と `worldContext.populationRate`/`urbanization` から
  `realPopulation = burg.population * populationRate * urbanization` を求める（`docs/analytics/population.md`、
  `burgs-generator.ts:686/747/808` と同じ式。デフォルト設定は `populationRate: 1000`, `urbanization: 1`,
  `urbanDensity: 10` — `worldContext.ts:63-65`）。
- **港の質**: `pack.cells.harbor[burg.cell]`（隣接する水域セル数、`features.ts:241,300`）を
  「自然の港の広さ」の代理指標として使う。既に `burgs-generator.ts` の港セル選定
  （`collectPortCandidates`/`selectPorts`、60-140行目）で「良い港」の判定に使われている値の再利用であり、
  Shipbuilding側で新しい地形指標を作らない。
- **首都・城塞ボーナス**: `burg.capital` / `burg.citadel`。`burgs-generator.ts:433` の首都人口ボーナス
  （×1.5）、および `shipyardQueue.ts` の `determineOwner()`（国家アーセナルか商港かの判定に
  `capital || citadel` を使っている）と同じ属性をそのまま流用する。

### 4.2 収容力の計算式（暫定）

1. **人口 → 都市の物理規模**に変換する。`burgs-generator.ts:684` の
   `sizeRaw = 2.13 * (population/urbanDensity)^0.385`（Watabouタウン生成用のワード数算出）と同じ
   「べき乗による逓減」パターンを踏襲するが、桟橋数はワード数ほど急増させる必要がないため、係数を
   弱めた式にする:

   ```text
   basePortScore = 0.3 * realPopulation ^ 0.35
   ```

2. **港湾の質による物理上限**を掛け合わせる（`harbor` は概ね1〜6の範囲）:

   ```text
   harborFactor = clamp(cells.harbor[burg.cell], 1, 6) / 6
   total = basePortScore * (0.5 + 0.5 * harborFactor)
   ```

   どんなに小さな入り江でも下限0.5倍は保証し、広く開けた湾なら最大1.0倍まで伸びる。
3. **首都・城塞ボーナス**（`determineOwner()` の「国家 = capital/citadel」という区分と揃える）:

   ```text
   total *= burg.capital ? 1.5 : 1
   total *= burg.citadel ? 1.25 : 1
   ```

4. **サイズ別に配分**（大型ほど希少にする）:
   - 小型: `floor(total)`（下限1隻 — `ShipyardCandidate` の条件を満たす港は最低でも小舟1隻分の
     係留スペースを確保する）
   - 中型: `total >= 3` の場合のみ `floor(total * 0.35)`
   - 大型: `total >= 8` かつ `harborFactor >= 0.5`（十分に開けた湾）の場合のみ `floor(total * 0.12)`

### 4.3 試算表（`populationRate=1000`, `urbanization=1` のデフォルト設定）

| burg.population | 実人口 | harbor | 首都/城塞 | 小型 | 中型 | 大型 |
| -: | -: | -: | :-: | -: | -: | -: |
| 1 | 1,000 | 2 | - | 2 | 0 | 0 |
| 5 | 5,000 | 3 | - | 4 | 1 | 0 |
| 15 | 15,000 | 4 | - | 7 | 2 | 0 |
| 30 | 30,000 | 5 | - | 10 | 3 | 1 |
| 30 | 30,000 | 5 | 首都 | 15 | 5 | 1 |
| 30 | 30,000 | 6 | 首都+城塞 | 20 | 7 | 2 |

小さな漁村は小型船を数隻停められるだけ、首都級の大港湾でようやく大型船が2〜3隻という、直感に
沿った分布になる。係数（`0.3`, `0.35`(指数), `1.5`, `1.25`, 配分比`0.35`/`0.12`, しきい値`3`/`8`）は
すべて仮値であり、`shipyardCandidates.ts` の `MIN_FOREST_RATIO` と同じ調整用定数として実装する
（後でバランス調整しやすいよう名前付きexportにする）。

### 4.4 実装時の置き場所（実装済み）

- `computeShipyardCandidates()`（`shipyardCandidates.ts`）と同じ「純粋な導出データ、coreを書き換えない」
  パターンに揃え、`generators/portCapacity.ts` に
  `computePortCapacity(candidates): Map<burgId, { small: number; medium: number; large: number }>` を実装した。
  Shipbuilding拡張内のモジュールローカル変数（`index.ts` の `_portCapacity`）にキャッシュし、
  `computeShipyardCandidates()` と同じタイミング（`recomputeAndMaybeDraw()`、`fmg:generate-post-core` と
  レイヤー再有効化時）で再計算する。`pack.burgs` へは書き込まない。

- `getShipSizeTier(shipClass)`（`shipClasses.ts`）が既存の技術ツリー3ティアを小型/中型/大型へ写像する:
  `sloop`(tier0) = 小型, `caravel`(tier1) = 中型, `galleon`(tier2) = 大型（2章参照）。技術ツリーの
  ティア数を増やす（船の種類を増やす）ことは、この収容力設計とは独立した別課題であり、別途検討する。

### 4.5 航海訓練・偽装通商・諜報（実装済み）

上記の「収容力の上限に達した後どうするか」という未解決事項は、以下のメカニクスによって
解消した。ユーザーからのフィードバック: 完成した船は港を埋めるだけの存在ではなく、戦争で
必要とされていない海軍艦は民間人・商人になりすまして航海訓練を兼ねた交易に出ることで、港を
埋めずに稼ぎながら訓練し、外国の情報まで収集する。商会が出資・建造した商船はそのまま普段から
商売に使われる。

- **データモデル**（`shipyardQueue.ts`）: `_completedHulls`（集計カウンタ、既存のまま維持）に加えて
  `ShipHull { id, shipClassId, owner, ownerId, homeBurgId, status: "docked" | "voyage" }` の
  個体レジストリ（`_hulls`）を新設した。`ownerId` は`state`所有なら国家ID、`market`所有なら建造元burg
  ID（`_completedHulls` の既存キー体系と同じ）。`homeBurgId` は常に建造元burg（本モデルでは他港へ
  移動しない）。
- **ライフサイクル遷移**（`shipVoyages.ts` の `runVoyageTick()`、`registerTimeTickHook` から毎tick実行）:
  - 完成時（`shipyardQueue.ts` の `completeHull()`）: その時点で所属国家が戦争中
    （`isStateAtWar()` — `diplomacy` 配列に `"Enemy"` を含むか、Economy拡張の同名チェックと同じ判定式を
    複製）なら `"docked"`（動員済み）で進水、それ以外（平時の海軍艦、および商会所有艦は常に）は
    `"voyage"` で進水する。
  - 毎tick: 国家所有艦は「戦争中なら `docked` へ召還（`voyage`→`docked`）」「非戦争中なら出航
    （`docked`→`voyage`）」を繰り返す。商会所有艦には召還条件がなく、一度出航したら戦争の有無に
    関係なく常に `voyage` のまま。
  - 港湾収容力は「動員中に港へ留まっている艦数」の上限としてのみ働く（表示専用、`ShipyardsOverviewDialog`
    の「Port (docked/capacity)」列）。平時はほぼ全艦が`voyage`のため事実上ほとんど埋まらない —
    「満杯時の挙動」問題は、そもそも艦がほとんど港に留まらない設計にすることで解消した。
- **金銭収入**（`fmg:shipbuilding-voyage-income` イベント、`{ stateId, owner, amount, deltaYears }`）:
  `voyage` 状態の艦は毎tick `shipClass.buildPointsRequired * GOLD_PER_BUILD_POINT_PER_YEAR(4) * deltaYears`
  を稼ぐ（暫定値、船が大きい＝積載量が大きいほど稼ぐという代理指標）。Economy拡張
  （`taxes-generator.ts`）が購読し、`_voyageIncomeByState` バッファへ加算する。`collectTaxes()` は
  毎回 `treasury` をゼロから再計算する既存仕様（`deals[]`/poll taxと同じ「前回集計以降の増分」方式）
  のため、直接 `state.treasury += amount` はできない —
  代わりに `deals`/poll taxと同列の第三の収入源として `collectTaxes()` 内で加算し、加算後にバッファを
  クリアする。
- **諜報**（`fmg:shipbuilding-voyage-intel` イベント、`{ observerStateId, targetStateId, amount, deltaYears }`）:
  国家所有艦のみ（商船は諜報を行わない）。`diplomacy` 配列から最も警戒すべき相手
  （`"Enemy" > "Rival" > "Suspicion"` の優先順）を選び、毎tick `INTEL_GAIN_PER_YEAR(3) * deltaYears` を
  送る。Nobility拡張（`espionage-generator.ts`）が購読し、`observerStateId:targetStateId` キーの
  累積ボーナス（上限 `MAX_VOYAGE_INTEL_BONUS=20`、自然減衰なし）として保持する。`Espionage.generate()`
  は毎tick完全再計算する既存仕様のため、`simulationContext.intelligence` を直接上書きするのではなく、
  `diff = observerIntrigue - targetIntrigue` の判定式にこのボーナスを足し込む形で介入する
  （観察側の諜報部員の実効「頭の良さ」が、貿易船経由の接触によって特定の相手にだけ上がる、という
  解釈）。
- **新マップ生成時のリセット**: Shipbuilding・Economy・Nobilityそれぞれの `fmg:generate-post-core`
  ハンドラで `_hulls`/`_voyageIncomeByState`/`_voyageIntelBonus` をクリアする（国家・burg IDが0から
  再利用されるため）。
- **既知の限界（暫定スコープ外）**: 無所属（stateless/自由都市）の商船は国庫が存在しないため、
  金銭収入イベント自体を送出しない（`stateId` が偽値になるためスキップ）。船体ごとの積載量・航洋性
  といった実データが `ShipClass` に無いため、`buildPointsRequired` を稼ぎの代理指標として流用
  している——2.4節で触れた積載量フィールドを`ShipClass`に追加する際は、そちらに差し替えるのが自然。

### 4.6 テスト

| ファイル | 内容 |
| :--- | :--- |
| `src/extensions/shipbuilding/generators/portCapacity.test.ts` | 収容力の式（人口・港湾品質・首都/城塞ボーナス・大型/中型のしきい値・下限1隻・removed burgの除外）を検証。 |
| `src/extensions/shipbuilding/generators/shipVoyages.test.ts` | 戦時は動員維持、平時は出航、出航時の金銭収入額、諜報対象の優先順位、商船は諜報しないこと、無所属船は収入・諜報ともスキップされることを検証。 |
| `src/extensions/shipbuilding/generators/shipyardQueue.test.ts` | 平時完成艦は即座に`voyage`、戦時完成艦は`docked`で進水すること、`isStateAtWar()`の判定を検証。 |
| `src/extensions/economy/generators/taxes-generator.test.ts` | `registerVoyageIncome()`の`collectTaxes()`への合算と、合算後にバッファが消費されクリアされることを検証。 |
| `src/extensions/nobility/generators/espionage-generator.test.ts` | 累積ボーナスが情報格差を埋めて`accuracyLevel`を反転させること、上限でキャップされること、`clearVoyageIntel()`でリセットされることを検証。 |
