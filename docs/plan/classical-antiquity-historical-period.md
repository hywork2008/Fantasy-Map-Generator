# Historical period の古代拡張 — 古典古代・古代末期の追加設計

## 状態

**P0〜P3 完了（2026-10-16）、P4 は未実装。** 各フェーズの実装内容は §10 を参照。

関連文書:

- [technology-development-roadmap.md](./technology-development-roadmap.md) §16（前史ロードマップ。データ層は [technologyPrehistory.ts](../../src/generators/technologyPrehistory.ts) に実装済み・未接続）
- [culture-civilization-overhaul.md](./culture-civilization-overhaul.md)（`TRADITION_PERIODS` と CE 側の `classicalAntiquity`）
- [bridge-skew-policy.md](./bridge-skew-policy.md)（AGENTS.md の橋の原則）
- [military-era-progression.md](./military-era-progression.md)

---

## 1. 要約

1. **追加する値は2つ**: `classicalAntiquity`（古典古代・帝政ローマ最盛期, c. 前200–後250）と `lateAntiquity`（古代末期, c. 250–500）。既存の `earlyMedieval` と合わせ、前史グラフの3時代（`romanZenith` / `declineAndFragmentation` / `earlyMedievalRebuilding`）と1対1に対応させる。
2. **`classicalAntiquity` という id は CE と `TRADITION_PERIODS` に既に存在する。** FMG 側でも同じ id を使い、CE の古代表現（castra 型の城、西向きアプス、古代港湾など）がそのまま FMG の選択から届くようにする。新しく作るのは `lateAntiquity` だけ。
3. **古代は「中世より劣る」だけではない。** 都市上水・舗装道路・常備軍・広域貨幣・識字はローマ期の方が上で、農法・馬具・風車・騎士は中世の方が上。開始プロファイルは「中世の手前」ではなく、別の形をした技術の束として作る（§2.5）。
4. **既存 `earlyMedieval` にも時代錯誤がある。** 現在は中世3値すべてが era 0 の開始プロファイル（三圃式・水車風車・騎士戦術など）を `diffused` で受け取る。c. 500–1000 には三圃式も騎士も風車もまだ普及していない。古代を足すときに同じ仕組みで直せるので、§5.3 で扱う（直すかどうかは要決定）。
5. **橋の原則は変えない。** AGENTS.md の「古代・中世で石造15°・木造20°」がそのまま適用される。`bridgeSkewPolicy.ts` に2値を tier 0 として足すだけ。

---

## 2. 調査: 中世から古代へ遡る知識・技術の蓄積

年代は西欧・地中海世界を基準とする。数値は通説・代表的な推計で、地図生成の較正には目安として使う（ゲームの正確な歴史再現は目的ではない）。

### 2.1 初期中世（c. 500–1000）— 既存 `earlyMedieval` が本来表すべき姿

| 分野 | 状況 | 年代の目安 |
| --- | --- | --- |
| 農業 | 北方で重量有輪犂が広がり始める。三圃式はカロリング朝の荘園で導入が始まる段階で、普及はまだ。南欧は二圃式（休閑）と軽い犂（アード）が主 | 有輪犂 7世紀〜、三圃式 8–9世紀〜 |
| 動力 | 水車は古代末期から増え、荘園の製粉に広がる。**風車は存在しない**（欧州の垂直風車は1180年代） | Domesday Book（1086）で約5,600基の水車 |
| 馬具・騎兵 | 鐙は6世紀にアヴァール人経由、8世紀に西欧へ。釘打ち蹄鉄と首輪式繋駕は9–10世紀。重騎兵＝騎士制度は10世紀以降に形が整う | — |
| 築城 | 古代の市壁の再利用、土塁と木柵。モット・アンド・ベイリーは10世紀後半から | — |
| 文字 | 羊皮紙の写本、修道院中心。識字は聖職者にほぼ限られる。紙はまだ西欧にない | 紙のイベリア伝来 11–12世紀 |
| 貨幣・交易 | 金貨経済は崩れ、カロリング朝のデナリウス銀貨。交易は縮小するが北海・バルト（ヴァイキング）・地中海（ビザンツ・イスラーム）で続く | 755年頃の貨幣改革 |
| 都市 | 古代都市の多くは人口が激減し、司教座と城壁内の一部に縮む。ローマ市は数万人規模 | — |

既存コードとの照合: `millCapacity.ts` の `WINDMILL_PERIODS` は `earlyMedieval` を除外しており正しい。`castlePatterns.ts` の `earlyMedieval → motte-bailey` は時代の終わり寄り。`initialFleet.ts` は `earlyMedieval` で galleon をゼロにしており妥当。一方、技術の開始段階（`seedTechnologyStartProfile`）は中世3値すべてに成熟中世の8ノードを `diffused` で与えている（§5.3）。

### 2.2 古代末期（c. 250–500）— 新設 `lateAntiquity`

| 分野 | 状況 | 年代の目安 |
| --- | --- | --- |
| 政治・財政 | 3世紀の危機（235–284）で銀貨が崩壊（アントニニアヌス銀貨の銀含有率は数%まで低下）。ディオクレティアヌスの改革で属州を細分化し、現物税・世襲職業化。コンスタンティヌスのソリドゥス金貨（309）は東方で長く安定 | 西ローマ滅亡 476 |
| 築城 | 開放都市が城壁を持つようになる。アウレリアヌス城壁（271–）。地方都市は市域を縮めて壁で囲う。辺境は塔の多い小砦 | — |
| 軍事 | 軍団は小型化し、国境軍（limitanei）と機動軍（comitatenses）に分かれる。騎兵の比重が増す（東方のカタフラクト）。同盟部族（foederati）への依存。ねじり式投石機オナゲルは4世紀 | — |
| 動力 | 水車がむしろ増える。537年のローマ包囲では水道を断たれ、テヴェレ川に浮き水車を設けた | ヤニクルムの水車群 |
| 文字・知識 | 巻物から冊子本（コデックス）への移行が完了。キリスト教公認（313）、修道制の成立。古典の注釈・要約が中心。ユスティニアヌス法典（529–534）は東方での古代法の集大成 | — |
| 都市・人口 | ローマ市は最盛期の数分の1。水道・浴場は維持が途切れたものから止まる。ユスティニアヌスのペスト（541–）が人口をさらに削る | — |

前史グラフでは `collapseOfCentralMaintenance` / `dissolutionOfLegionsIntoRetinues` / `fragmentationOfUnifiedTrade` / `monasticPreservationOfKnowledge` / `earlyHeavyMoldboardPlow` / `stirrupAndImprovedHarness` がこの時代にあたる。

### 2.3 古典古代・帝政ローマ最盛期（c. 前200–後250）— `classicalAntiquity`

| 分野 | 到達点 | 根拠・年代の目安 |
| --- | --- | --- |
| 建築材料 | 水硬性モルタル・ポッツォラーナ火山灰コンクリート（opus caementicium）。水中硬化で港湾も造れる | 前2世紀〜。パンテオン c. 126。カエサレア・マリティマ港 c. 前20 |
| 上水 | 重力式の長距離水道。ローマ市は11本の水道。鉛管による配水、公共浴場・噴水・公衆便所、下水道（クロアカ・マクシマ） | アッピア水道 前312〜。最後の水道 226 |
| 道路 | 舗装軍道網は約8万km。里程標・駅逓（cursus publicus） | アッピア街道 前312〜 |
| 橋 | 半円アーチの石橋。単径間は30m前後（アルカンタラ橋）。締切堤で川中に橋脚を築く。橋は川にほぼ直角。長大橋は国家事業（トラヤヌス橋、ドナウ川、約1,100m、105年、石の橋脚に木造上部） | — |
| 都市 | ローマ市は推計50万〜100万人、アレクサンドリア数十万。集合住宅インスラは5–6層に達し、アウグストゥスが高さを約70ローマ尺（約21m）に制限。地方都市は碁盤目（castra 由来）・フォルム・劇場・円形闘技場 | — |
| 農業 | 南欧は二圃式の休閑、軽い犂、ラティフンディウム（大所領）。北方の重い土壌には弱い。穀物はエジプト・北アフリカから海上輸送 | 鉄製農具はあるが三圃式・有輪犂は無い |
| 動力・機械 | 水車は知られ、大型施設もある（バルブガルの16輪製粉所、2世紀）が一般的ではない。ヒエラポリスのクランク製材機（3世紀）。踏み車式クレーン。**風車は無い** | ウィトルウィウス『建築書』c. 前25 |
| 冶金 | 塊鉄炉（ブルーマリー）による鉄。高炉は無い（中国にはある）。ノリクム鋼。鉛・銀の大規模採掘（グリーンランド氷床に鉛汚染の記録）。真鍮（セメンテーション法）、硬貨の鋳造 | — |
| ガラス | 吹きガラスが前1世紀に普及し、日用品になる。窓ガラスも一部に | — |
| 航海 | 横帆の商船（数百トン級、穀物船はさらに大型）。舵は船尾の舵櫂で、船尾材舵は無い。冬季（11–3月）の航海は原則停止。灯台（ファロス）。軍船はガレー（三段櫂船・リブルナ船）。ラテン帆は古代末期から | — |
| 軍事 | 職業的常備軍。軍団は約5,000人、規格化された装備（グラディウス・ピルム・ロリカ）、標準設計の宿営地（castra）、ねじり式投射機（バリスタ・スコルピオ）。**鐙が無い**ため騎兵は補助軍。辺境の長城（ハドリアヌスの長城 122〜） | — |
| 文字・行政 | パピルスと蝋板、巻物。羅馬数字（ゼロ無し）とアバカス。都市部の識字は相対的に高いが、帝国全体では1–2割未満とする推計が有力（W. V. Harris『Ancient Literacy』）。成文法・属州行政・国勢調査・測量（グロマ、ケントゥリアティオ） | — |
| 科学・医学 | プトレマイオス『アルマゲスト』『地理学』（c. 150）、エラトステネス、アンティキティラ島の機械（c. 前100）。ガレノス・ケルスス、軍の病院（valetudinarium） | — |
| 貨幣・商業 | デナリウス銀貨とアウレウス金貨の統一貨幣圏。両替・貸付・海上貸付はあるが、為替手形や複式簿記は無い | — |

### 2.4 さらに前（参考、今回は追加しない）

古典期ギリシア・ヘレニズム（c. 前500–前30）は、科学・哲学では最盛期だが、ローマ型の舗装道路網・コンクリート・広域行政を欠く。その前の鉄器時代初期（c. 前1200–前500）まで遡ると、本作の経済モデルが前提とする「市場・貨幣・常設ギルド」が成り立たなくなる。そのため今回は帝政ローマを最古とし、`hellenisticAge` は将来追加する（§9 決定事項8）。

### 2.5 比較: 何が「上」で何が「下」か

| 分野 | 古典古代 | 古代末期 | 初期中世 | 成熟中世（era 0） |
| --- | --- | --- | --- | --- |
| 都市上水・浴場 | ◎ 水道網 | ○→△ 維持が途切れ始める | △ 井戸・小規模 | △ |
| 舗装道路 | ◎ | ○ 劣化 | △ 残骸を使う | ○ |
| 常備軍・兵站 | ◎ 軍団 | ○ 国境軍・同盟部族 | × 従士団 | × 封建軍役 |
| 広域貨幣・交易 | ◎ | △ 銀貨崩壊・金貨は残る | × 地域市場 | ○ 定期市・信用 |
| 識字・記録 | ○ | ○→△ | × 聖職者のみ | ○ |
| 農法（三圃式・有輪犂） | × | △ 萌芽 | △→○ | ◎ |
| 水車 | △ 少数の大施設 | ○ | ○ | ◎ |
| 風車 | × | × | × | ○ |
| 馬具・重騎兵 | × 鐙無し | △ カタフラクト | △→○ | ◎ 騎士 |
| 鉄の量 | ○ 塊鉄炉 | ○ | ○ | ○ |
| 建築工法 | ◎ コンクリート | ○ | △ 石と木 | ○ ロマネスク・ゴシック |

◎ 頂点 ○ 実用・普及 △ 限定・萌芽 × 無い

---

## 3. 既存コードの棚卸し（時代に依存する箇所）

`historicalPeriod` を参照する非テストのソースは約70ファイル。新しい値を足したときの扱いで分類する。

### 3.1 型に列挙があり、足さないとコンパイルが通らない／`Record` が不完全になる

| 箇所 | 内容 |
| --- | --- |
| [optionsState.ts:53](../../src/store/optionsState.ts#L53) / [WorldState.ts:153](../../src/types/WorldState.ts#L153) / [options.ts:1030](../../src/controllers/options.ts#L1030) / [GenerationSettingsTab.tsx:1024](../../src/ui/components/tabs/options/GenerationSettingsTab.tsx#L1024) | 型ユニオン（4か所に同じ列挙が重複）。共通型 `HistoricalPeriod` を1か所に定義して参照させる |
| [goods-generator.ts:153](../../src/extensions/economy/generators/goods-generator.ts#L153) `GUNPOWDER_ERA_PRICE_MULTIPLIER` | 火薬関連 Goods の価格倍率。古代は `earlyMedieval` 以上の倍率 |
| [literacyGeneration.ts:91](../../src/extensions/characters/literacyGeneration.ts#L91) `PERIOD_LITERACY` | 識字の上限。§6.4 |
| [initialFleetTables.ts:7](../../src/extensions/shipbuilding/generators/initialFleetTables.ts#L7) | 独自の4値型。§6.6 |
| [urbanWaterTech.ts:20](../../src/extensions/economy/generators/urbanWaterTech.ts#L20) | 独自の型と `waterTechCeilings`。§6.3 |

### 3.2 順序付きリストを持ち、古い方へ足す必要がある

| 箇所 | 内容 |
| --- | --- |
| [civilizationTraditions.ts:18](../../src/data/civilizationTraditions.ts#L18) `TRADITION_PERIODS` | 既に `classicalAntiquity` が先頭。`lateAntiquity` を2番目に足す |
| [cultures-generator.ts:1330](../../src/generators/cultures-generator.ts#L1330) `HISTORICAL_PERIOD_ORDER` | Industrial/Colonial の時代ゲート。先頭に2値 |
| [urbanMorphology.ts:15](../../src/utils/urbanMorphology.ts#L15) | 階数。§6.5 |
| [bridgeCrossingPolicy.ts:4](../../src/utils/bridgeCrossingPolicy.ts#L4) | 既に `classicalAntiquity: 300`。`lateAntiquity: 300` を足す |
| [bridgeSkewPolicy.ts](../../src/utils/bridgeSkewPolicy.ts) `TIER_BY_PERIOD` | 未知の値は tier 0 に落ちるので動作は正しいが、明示する |
| CE: [defenseClearance.ts:17](../../src/city-editor/generators/defenseClearance.ts#L17)・[guildFacilities.ts:12](../../src/city-editor/generators/guildFacilities.ts#L12)・[aerialLandmarks.ts:78](../../src/city-editor/generators/aerialLandmarks.ts#L78)・[wallShapes.ts:30](../../src/city-editor/generators/generation/skeleton/wallShapes.ts#L30)・[incomingCity.ts:521](../../src/city-editor/services/io/incomingCity.ts#L521)・[generationPanel.ts:195](../../src/city-editor/components/generationPanel.ts#L195)・[primitives.ts:37](../../src/city-editor/types/primitives.ts#L37) | CE は `classicalAntiquity` を既に扱う。`lateAntiquity` を足す |

### 3.3 集合・分岐で判定していて、未知の値が「後の時代」と同じ扱いになる危険がある

ここが最も見落としやすい。`switch` の `default` や「含まれていなければ近代扱い」の判定に古代が落ちると、古代に近代の設備が出る。

| 箇所 | 現在の判定 | 古代を足したときの危険 |
| --- | --- | --- |
| [millCapacity.ts:66](../../src/extensions/economy/generators/millCapacity.ts#L66) `WINDMILL_PERIODS` | 含まれる時代だけ風車可 | 安全（含めなければ風車無し）。正しい |
| [urbanWaterSystem.ts:436](../../src/extensions/economy/generators/urbanWaterSystem.ts#L436) `CIVIC_WATERWORKS_TECH_LEVEL` | 中世前期は意図的に不在 | 古代は**逆に水道網を持つ**ので、単に不在にすると史実と逆になる。§6.3 |
| [castlePatterns.ts:453](../../src/city-editor/renderers/castlePatterns.ts#L453) | `default → norman-keep` | `lateAntiquity` が norman-keep になる。古代末期の城壁都市型を割り当てる |
| [civicPlacement.ts:101](../../src/city-editor/generators/civicPlacement.ts#L101) | `classicalAntiquity`/`earlyMedieval` で西向きアプス | `lateAntiquity` も含める |
| [initialFleet.ts:384](../../src/extensions/shipbuilding/generators/initialFleet.ts#L384) `resolveHistoricalPeriod` | 4値以外は何かに丸める | 丸め先を確認し、古代用の分岐を足す |
| [relationshipCompatibility.ts:418](../../src/extensions/characters/relationshipCompatibility.ts#L418) | 不明時 `earlyMedieval` | 動作は保守的で可 |
| [goodsDisplaySelection.ts:39](../../src/extensions/economy/store/goodsDisplaySelection.ts#L39) | 中世前期は火薬 Goods を隠す | 古代も隠す側へ |
| [cultureTradition.ts:127](../../src/utils/cultureTradition.ts#L127) `worldTraditionPeriod` | Antique 文化セットなら `classicalAntiquity` に読み替え | FMG で古代を選べるようになるので、選んだ時代を優先し、Antique セット × 中世以降のときだけ読み替える形に整理 |

### 3.4 技術システム

- [technologyProgress.ts:382](../../src/generators/technologyProgress.ts#L382) `HISTORICAL_PERIOD_FRONTIER_ERA` は `ageOfExploration` 以降だけを持ち、中世3値は `def.startStage`（era 0 は `diffused`）に落ちる。
- [technologyDefinitions.ts:15](../../src/generators/technologyDefinitions.ts#L15) `START_PROFILE` の8ノード: `threeFieldAgriculture` / `ironToolsAndDraftAnimals` / `waterAndWindMills` / `basicMetallurgy` / `stoneBuildingAndRoads` / `coastalNavigation` / `knightlyWarfare` / `literacyAndMarkets`。すべて `startStage: "diffused"`、閾値なし。
- `TechnologyEraBand` は `0..8` の数値で、前史は [technologyPrehistory.ts](../../src/generators/technologyPrehistory.ts) の別型 `PrehistoryEra`。前史の18ノードは評価器に接続されていない。

---

## 4. 追加する Historical period

| id | 表示名（en / ja） | 年代 | 前史グラフの時代 | 一行の性格 |
| --- | --- | --- | --- | --- |
| `classicalAntiquity` | Classical Antiquity (c. 200 BC – AD 250) / 古典古代 | 帝政ローマ最盛期 | `romanZenith` | 水道・舗装道路・常備軍・統一貨幣の頂点。鐙・風車・三圃式は無い |
| `lateAntiquity` | Late Antiquity (c. 250 – 500) / 古代末期 | 3世紀の危機〜西ローマ滅亡 | `declineAndFragmentation` | インフラは残るが維持が途切れ始める。城壁都市化、騎兵化、修道院 |
| `earlyMedieval`（既存） | Early Medieval (c. 500 – 1000) | — | `earlyMedievalRebuilding` | §5.3 で開始プロファイルを見直すかは要決定 |

- 選択肢の並びは古い順で、新しい2値はドロップダウンの先頭に来る。
- 既定値は変えない（未指定セーブは従来どおり `highMedieval` 扱い、新規生成の既定は `ageOfExploration`）。
- `gunpowderEraEnabled` を手動で ON にした古代マップは、既存の「中世前期で ON にした場合」と同じく、ごく珍しい新発明として扱う（`GUNPOWDER_ERA2_START_STAGE_BY_PERIOD` に古代を足さない＝`locked`）。
- `forceIndustrialCultures` は従来どおり時代を無視する（デバッグ用の上書き）。
- 型の重複（§3.1）を解消するため、`HistoricalPeriod` 型と `HISTORICAL_PERIODS` 定数（古い順）を `src/types/historicalPeriod.ts` に一本化し、各所の局所的な列挙・順序リストをそこから導出する。`periodIndex` 相当の比較関数もここに置き、`TRADITION_PERIODS` は同じ配列を参照する。

---

## 5. 技術グラフの扱い

### 5.1 方針: 前史グラフを「開始段階の決定」にだけ使う（第1段）

前史18ノードを評価器に接続し、古代から中世へ実際に技術が進む・退行する世界にするのは大きい（ロードマップ §16.6 の「退行を適用する評価器」が未実装）。第1段では、**古代を選んだときの開始段階を正しくすること**に絞る。

- 既存の era 0 の8ノードに、時代ごとの開始段階表 `ANTIQUITY_START_STAGE`（下表）を設ける。`resolveStartStage` の中世3値のフォールスルーの前で参照する。
- era 1 以降のノードは古代でも `locked` のまま（既存の扱いと同じ）。ただし §5.2 の「ローマ期に既にあるもの」は例外とする。
- これで成熟中世の8ノードが「古代にはまだ無いもの」として `locked`/`known`/`demonstrated` から始まり、通常の年次評価で閾値を満たせば上がっていく。era 0 の8ノードは閾値が空なので、古代用の閾値（下表右端）を定義に追加する。

| era 0 ノード | classicalAntiquity | lateAntiquity | earlyMedieval（§5.3 案） | 上がる条件（追加する閾値の案） |
| --- | --- | --- | --- | --- |
| threeFieldAgriculture | locked | known | demonstrated | ironToolsAndDraftAnimals ≥ adopted、農村人口密度 |
| ironToolsAndDraftAnimals | adopted | adopted | adopted | （鉄器はある。有輪犂・首輪式繋駕の普及で diffused） |
| waterAndWindMills | demonstrated | adopted | adopted | 製粉需要。風車部分は `millCapacity` の時代ゲートが別に抑える |
| basicMetallurgy | diffused | diffused | diffused | — |
| stoneBuildingAndRoads | diffused | diffused | adopted | （ローマ期が頂点。§5.2 の維持で扱う） |
| coastalNavigation | diffused | diffused | diffused | — |
| knightlyWarfare | locked | known | demonstrated | 鐙（stirrupAndImprovedHarness）＋荘園制 |
| literacyAndMarkets | diffused | adopted | demonstrated | 古代は記録・市場とも成熟、初期中世で後退 |

`adopted` で始まるノードでも、効果関数（`getXxxEffect`）が段階で値を変えるものは古代向けに弱くなる。効果関数が `diffused` 前提で固定値を返しているものは、実装時に一覧化して確認する（第1段のテスト項目）。

### 5.2 ローマ期の「中世より上」を表す — 既存の後続ノードに前倒しで与える

ロードマップ §16.5 の対応表と決定事項16（前史ノードを再実装せず既存ノードに収束させる）に従い、ローマ期の到達点を**既存の後続ノードの開始段階**として表す。新しい技術ノードは作らない。

| ローマ期の到達点 | 対応する既存ノード／システム | classicalAntiquity での開始 | lateAntiquity |
| --- | --- | --- | --- |
| 水道・都市上水 | era 1 `urbanCoveredDrainage`、`urbanWaterTech` の上限、`urbanWaterSystem` の初期水道 | demonstrated（大都市で adopted 相当の設備を生成） | known（設備は残るが一部停止） |
| 常備軍・規格化兵站 | 軍事生成（§6.7） | 常備歩兵中心の編成 | 国境軍＋騎兵増 |
| 統一貨幣・広域交易 | era 1 `commercialFinance` | known（為替・複式簿記は無いので demonstrated にはしない） | locked |
| 属州行政・測量・天文地理 | era 1 `mathAstronomyGeography`、`recordReplication` | known | known |
| 医学（ガレノス、軍病院） | era 1 `surgicalAnatomy` / `hospitalMedicine` | known | known |
| 舗装道路 | Route の `pavedShare`（Public Works / L8） | 主要道を高い舗装率で生成 | 中程度 |

`mathAstronomyGeography` は橋の skew tier 1 のゲートでもある（[bridgeSkewPolicy.ts](../../src/utils/bridgeSkewPolicy.ts) `BRIDGE_SKEW_TECHNOLOGY_GATES`）。古代は `known` 開始で `adopted` 未満なので tier は 0 のまま。AGENTS.md の原則と矛盾しない。

### 5.3 既存 `earlyMedieval` の時代錯誤（要決定）

§2.1 のとおり、c. 500–1000 に三圃式・騎士戦術は普及していない。§5.1 の表の `earlyMedieval` 列を適用すれば直るが、既存マップを再生成すると技術の初期状態が変わる（セーブ済みマップは技術進行状態を保存しているので影響しない）。選択肢:

- **A（採用・2026-10-16 決定）**: 古代の追加と同時に `earlyMedieval` 列も適用する。期間の名前どおりの世界になり、古代→初期中世→盛期中世の段差が単調になる。
- **B**: `earlyMedieval` は現状維持。古代2値だけを新しい表で扱う。古代から初期中世に移ると三圃式・騎士が急に `diffused` になる不連続が残る。

### 5.4 第2段（将来）: 前史グラフの接続と退行

第1段の完了後、必要になれば次を行う。この設計書では範囲を定めるだけで、詳細は別文書とする。

- 前史18ノードを `TechnologyDefinition` として評価器に載せる（`TechnologyEraBand` を負の値まで広げるか、`PrehistoryEra` を era 0 の下位区分として扱う）。
- ロードマップ §16.1 の「維持投資が途切れると adopted/diffused → known へ戻る」退行を、`advanceStage()` とは別の関数で実装する（`advanceStage` が退行しないという既存の保証は壊さない）。
- 前史シグナル（`PrehistorySignals`）のうち、既存の経済・国庫・交易から計算できるもの（`centralTreasury` ← 国庫、`tradeRouteInsecurityPressure` ← 交易路の危険度など）を接続する。

---

## 6. システム別の対応

### 6.1 Generation Settings UI・i18n

- ドロップダウンに2値を先頭に追加。`en.json` / `ja.json` に表示名と tooltip を追加。
- tooltip には「技術・制度の背景を選ぶもの。文化セット（Antique など）とは独立」と書く（既存の説明と同じ方針）。
- `exportGenerationOptions.ts`・`load.ts` は値をそのまま通すので、未知値の保守的な扱いだけ確認する。

### 6.2 橋（AGENTS.md の原則）

| 項目 | classicalAntiquity | lateAntiquity | 根拠 |
| --- | --- | --- | --- |
| skew tier | 0（石造15°・木造20°） | 0 | AGENTS.md「古代・中世で石造15°・木造20°」。ローマの石橋は川に直角に架ける |
| 日常的な渡河長 | 300 m（既存値） | 300 m | トラヤヌス橋のような1 km 級は国家事業の例外で、日常の上限にしない |
| 構造 | 主要道 `roads` は石造 | 同左。新規架橋は木造が増えるが既存の石橋は残る | `bridgeStructureForRouteGroup` は変更不要 |

`TIER_BY_PERIOD` に2値を `0` で明示し、`BRIDGE_CROSSING_LIMIT_METERS` に `lateAntiquity: 300` を足すだけ。基準値と判定は `bridgeSkewPolicy.ts` から動かさない。

### 6.3 都市上水（最重要の逆転）

`urbanWaterSystem.ts` は「中世前期は市営水道を持たない」前提で書かれている。古代はローマ型の重力式水道がある。

- `waterTechCeilings`: `classicalAntiquity` は `{ waterLifting: 0.7, municipalSanitation: 0.75, sanitaryEngineering: 0.15 }` 程度（給水と公衆衛生は lateMedieval 級、ただし浄水・近代下水の工学は無い）。`lateAntiquity` は `{ 0.55, 0.55, 0.08 }`。数値は案で、§7 のライブ計測で較正する。
- `CIVIC_WATERWORKS_TECH_LEVEL` に古代用の段を足し、首都・大都市にだけ水道（取水点から市内への導水）を生成する。ポンプ揚水・浄水場・圧力配管など産業期の設備は出さない。
- `regionalWaterAuthority.ts` の近代判定 `isModernWaterEraAvailable` は古代で false のまま。

### 6.4 識字（`PERIOD_LITERACY`）

| 値 | nobleReading | nobleWriting | commonerReading | commonerWriting | 根拠 |
| --- | --- | --- | --- | --- | --- |
| classicalAntiquity | 60 | 50 | 18 | 10 | 元老院・騎士身分はほぼ読み書き可能。全体では1–2割未満（Harris）。都市部の方が高い |
| lateAntiquity | 50 | 35 | 14 | 7 | 都市の縮小で一般の識字が下がり、聖職者に移る |
| earlyMedieval（既存） | 40 | 22 | 12 | 6 | 変更なし |

`commonerLocalThreshold` は都市規模で伸びる閾値として、古代は 0.4（都市が大きいほど伸びやすい）とする。

### 6.5 都市形態（`urbanMorphology.ts`）

既存では `classicalAntiquity` は「標準2階・最大3階」で、中世前期と同じ。ローマ市のインスラは5–6層に達していたので、古代は時代全体の値と首都級の例外を分ける。

- `classicalAntiquity`: standard 2、maximum 5（人口が首都級の burg に限り最大値を許す。地方都市は2–3）
- `lateAntiquity`: standard 2、maximum 4

CE の Lot 占有率ガイドが FMG の町半径を決めるので、最大階数を上げた場合の半径の変化を計測する。

### 6.6 艦隊（`initialFleetTables.ts` / `initialFleet.ts`）

既存の船級は sloop / caravel / galleon の3種で、古代のガレーや横帆の穀物船に当たる級は無い。

- 第1段: 古代2値は `earlyMedieval` の表を流用し、galleon をゼロにする（既存の `earlyMedieval` 分岐と同じ）。caravel 相当を「大型商船（穀物船）」、sloop 相当を「沿岸船・リブルナ船」とみなす。
- 冬季の航海停止（mare clausum）は、季節の交易・海流システムに既にある月別の係数で表せるか、実装時に確認する（無ければ第2段）。
- ガレー船級を追加する（決定事項6）: 櫂走で風に依存せず、乗員が多く航続が短い。古代2値の軍船はガレー、商船は既存級の見立てとする。P3 で実装する。

### 6.7 軍事

- 第1段: 既存6ユニットの範囲で、時代による配分だけ変える。`classicalAntiquity` は歩兵比率を高く、騎兵を補助的に（鐙無し）。`lateAntiquity` は騎兵比率を上げる。`knightlyWarfare` が `locked` の間は「騎士」表記の重騎兵を出さない。
- 攻城兵器（バリスタ・オナゲル）は既存の machinery ではなく火砲扱いなので、`gunpowderEraEnabled` OFF の古代では出ない。投射機ユニットの追加は第2段。
- 将来、軍団のような常備軍の維持費は、既存の国庫・兵の給与（state treasury department budget）に載せられる。

### 6.8 文化・宗教・築城（`civilizationTraditions.ts` / CE）

- `TRADITION_PERIODS` に `lateAntiquity` を `classicalAntiquity` の次に追加。各伝統の `eras` は、`lateAntiquity` を明示しなければ直前（`classicalAntiquity`）の値が続く。ローマ・ギリシア系は `lateAntiquity` でキリスト教化（latinCatholic / orthodox、ただし「正教」「カトリック」の分離前なので表示名に注意）、城は城壁都市型とする。
- `castlePatterns.ts`: `lateAntiquity` → 新プロファイル `late-roman-walled-town`（塔の多い縮小市壁＋小砦）。用意できるまでは `ancient-castra` を当てる。`default → norman-keep` に落とさない。
- `religiousHousesFor`: 修道院は4世紀から。`lateAntiquity` で東方は `orthodoxMonastery`、西方は `abbey` を少数。
- 埋葬: 古典古代は火葬→土葬への移行期（2世紀頃から土葬が主流）。`FAITH_BURIAL` の `classicalPolytheism` を確認する。
- `worldTraditionPeriod`: Antique 文化セットの特別扱い（どの時代でも `classicalAntiquity` に読み替える）は**外す**（決定事項7）。伝統の時代は常に選んだ Historical period で決まる。Antique × 中世のマップでは、ローマ・ギリシア系の文化はその時代の信仰（キリスト教）と城の様式になる。
- **別の歴史を作れる余地を残す**（決定事項7）: 「キリスト教が普及しなかったローマ」のような設定は、時代の読み替えではなく、信仰・築城を個別に固定する仕組みで表す。
  - 解決関数 `traditionEra(tradition, period)` に、省略可能な上書き `overrides?: { faith?: FaithFamily; fortification?: FortificationFamily }` を受け取れる口を設ける。上書きがあればその値を使い、無ければ従来どおり時代表から引く。
  - 上書きの持ち主は Culture（`pack.cultures[i]` の省略可能フィールド `traditionOverride`）とする。文化単位なので、「ローマは多神教のまま、隣のゲルマン系はキリスト教化」といった混在も表せる。未設定の既存セーブは従来と同じ結果になる。
  - 埋葬（`faithBurialPresets`）・修道院（`religiousHousesFor`）・CE の城様式は、上書き後の信仰・築城から引くので、上書きは一貫して効く。技術・識字など Historical period に従う値は上書きしない（多神教のローマでも技術は中世の水準）。
  - 本書の範囲は「関数と型の口を用意し、未設定時に結果が変わらないことをテストで保証する」まで。上書きを設定する UI（Cultures エディタの欄、または生成オプション「古代の信仰を残す」）は別途とする。

### 6.9 文化タイプ生成（`cultures-generator.ts`）

`HISTORICAL_PERIOD_ORDER` の先頭に2値を足す。Industrial/Colonial は古代で出ない（既存の時代ゲートがそのまま効く）。古代に Nomadic・Naval・Highland などが出ることは問題ない。

### 6.10 経済・Goods

- 火薬 Goods の価格倍率: `classicalAntiquity: 2.6`、`lateAntiquity: 2.4`（`earlyMedieval` の 2.2 より高く。ON にしたときの珍しさ）。
- 紙は古代に無い（パピルス・羊皮紙）。Goods に Paper があり、時代で生産可否を切れるなら古代は生産不可にする。実装時に Goods 一覧を確認する。
- 吹きガラス・真鍮・コンクリート（石灰・火山灰）は古代でも生産可能のまま。
- 風車は `WINDMILL_PERIODS` に含めないので自動的に無い。

### 6.11 CE（City Editor）

CE は既に `classicalAntiquity` を扱えるので、FMG から descriptor で古代が届けば、castra 型の城・西向きアプス・古代港湾が描かれる。`lateAntiquity` は §3.2 の CE 側リストに足し、既定の振る舞いは `classicalAntiquity` に近く、城壁を縮小・強化する方向にする。

---

## 7. 検証

過去の較正の失敗例に倣い、数値（§6.3–6.5, 6.10）は推定のまま確定しない。

1. **型・テスト**: `npm run build` が通ること。新しい値を各 `Record` に足したことを、`HISTORICAL_PERIODS` を総なめにするテスト1本で保証する（値ごとに主要関数が例外を出さず、未知値扱いにならない）。
2. **単体**: `resolveStartStage` が古代2値で §5.1 表の段階を返すこと。`bridgeSkewTierForPeriod` が 0、`bridgeCrossingLimitForPeriod` が 300 を返すこと。`WINDMILL_PERIODS` に含まれないこと。`castlePatterns` が norman-keep を返さないこと。
3. **ライブ（Playwright）**: 古代2値でマップを生成し、`fmg:map-ready-tasks-completed` を待ってから
   - 首都に水道があり、地方の小都市に無いこと
   - 橋の skew が石造15°・木造20°以内、渡河長300 m 以内（`burgRoadAuditReference` の監査）
   - 識字・人口・国庫の初期値が `earlyMedieval` と比べて §2.5 の向きになっていること
   - 1年・10年の Advance Time で例外が出ず、era 0 ノードが閾値に従って上がること
4. **CE**: 古代マップの首都を右クリックで CE を開き、castra 型の城と古代港湾が描かれること。
5. 文化セットは Antique と標準セットの両方で確認する（Dark/High Fantasy × Marches の組み合わせは人口が玩具規模に偏るので避ける）。

---

## 8. 実装フェーズ

| フェーズ | 内容 | 規模の目安 |
| --- | --- | --- |
| P0 | `src/types/historicalPeriod.ts` に型と古い順の定数を一本化し、既存の重複列挙を置き換える（値は変えない、出力同一） | 小〜中。純粋なリファクタ |
| P1 | 2値を追加。UI・i18n・§3.1/3.2 の表と集合・橋の2ポリシー・CE 側リスト。開始段階は暫定で `earlyMedieval` と同じ | 中。この時点で選択可能になる |
| P2 | §5.1/5.2 の古代開始段階表と era 0 ノードの閾値。§5.3 の決定を反映 | 中 |
| P3 | ガレー船級の追加、都市上水・識字・都市形態・艦隊・軍事配分・文化伝統（§6.3–6.9）。ライブ計測で数値を較正 | 中〜大 |
| P4（将来） | `hellenisticAge` の追加（決定事項8）、前史グラフの接続と退行の評価器（§5.4）、投射機ユニット、`late-roman-walled-town` 城プロファイル | 大。別文書 |

---

## 9. 決定事項と未決事項

決定（本書の前提）:

1. 最古は帝政ローマ最盛期。ヘレニズム・鉄器時代は追加しない。
2. 追加は `classicalAntiquity`（既存 id を流用）と `lateAntiquity` の2値。
3. 第1段は開始段階の決定に限り、前史グラフの評価器接続と退行は第2段。
4. 橋の基準は `bridgeSkewPolicy.ts` に一本化したまま tier 0 を適用する。

5. §5.3 既存 `earlyMedieval` の開始プロファイルも直す（案 A、2026-10-16 決定）。P2 で古代2値と同時に適用する。
6. §6.6 ガレー船級を追加する（2026-10-16 決定）。P3 に繰り上げ、§6.6 の仕様を詳細化してから実装する。

7. §6.8 Antique 文化セットの時代読み替えは外す（2026-10-16 決定）。代わりに Culture 単位の信仰・築城の上書き口を用意し、「キリスト教が普及しなかったローマ」のような別の歴史を後から設定できる余地を残す。P3 で口と型だけ実装し、設定 UI は別途。

8. `hellenisticAge`（c. 前330–前30）は将来追加する（2026-10-16 決定）。本書の P0–P3 の範囲外で、P4 以降に別文書で設計する。`HISTORICAL_PERIODS` の先頭（`classicalAntiquity` より前）に入る前提で、P0 の型の一本化では順序リストが先頭への追加に耐える形にしておく。

未決: なし。

---

## 10. 実装ログ

### P0（2026-10-16）
`src/types/historicalPeriod.ts`（`HISTORICAL_PERIODS`・`HistoricalPeriod`・`isHistoricalPeriod`・`historicalPeriodIndex`）を作り、各所の重複列挙を置き換えた（出力同一）。艦隊表の4値型は意図的に残した。

### P1（2026-10-16）
`classicalAntiquity`・`lateAntiquity` を `HISTORICAL_PERIODS` の先頭に追加し、Generation Settings と CE で選べるようにした。橋は tier 0・300 m。CE の城は両時代とも `ancient-castra`。

### P2（2026-10-16）
`technologyProgress.ts` に `EARLY_PERIOD_START_STAGE`（§5.1/5.2/5.3 の表、`earlyMedieval` 列を含む）。era 0 の4ノードに閾値と最低滞在年数。年次評価の「開始プロファイルは再評価しない」を「プロファイル段階に達していないものだけ評価する」に改めた。`hospitalMedicine` は known で試験病院を建てる副作用があるため前倒しから外した。

### P3（2026-10-16）
- 識字（§6.4）・上水上限（§6.3）は表の値どおり。都市形態（§6.5）は古典古代 2/5 階・古代末期 2/4 階。最大値は人口圧があるときだけ使われるので、首都級に限る条件は付けていない。
- 都市上水の初期段階: `urbanWaterSystem.ts` の `ancientCivicWaterworksFloor`。古典古代は首都・1.5万人以上で tier 3（被覆暗渠）、4千人以上で tier 2。古代末期は首都級で tier 2。近代浄水の種まきが読む `CIVIC_WATERWORKS_TECH_LEVEL` には古代を入れていない。実測（seed antiq1）では首都22のうち19が tier 3。
- 舗装道路: `routes-generator.ts` の `domesticRoadHubPolicy`。首都と結ぶ舗装道路の拠点数の上限が中世の3に対し、古典古代8・古代末期5。実測で舗装道路のセル数が 286→495。
- 橋の単径間: `riverCrossing.ts` で古代は 30 m、可動部（跳ね橋）なし。
- 軍事: `military-generator.ts` の `periodUnitTypeModifier`。古典古代は歩兵 ×1.3・騎兵 ×0.5、古代末期は騎兵 ×0.8。投射機ユニットは未追加（§6.7 のとおり P4）。
- 文化・宗教（§6.8・決定事項7）: Antique 文化セットの時代読み替えを削除。ローマ・ギリシア系に `lateAntiquity` の時代（キリスト教・古典的城壁）を追加。修道院は古代末期から。`Culture.traditionOverride`（信仰・築城の上書き）と `traditionEra(..., override)` を追加し、文化の信仰・築城・宗教判定のすべてに通した。設定 UI は未作成。
- ガレー船（§6.6・決定事項6）: `SHIP_CLASS_DEFINITIONS` に `galley`（tier 1・積載 30・乗員 200・`role: "warship"`）。warship は造船所の次の段階（`getHighestUnlockedShipClass`）にも貨物輸送（`tradeCargo.ts` は `MERCHANT_SHIP_CLASS_DEFINITIONS` を使う）にも選ばれない。古代の初期艦隊は国有分がガレー（`galleysForStateHulls`）、民間は帆船のまま。古代の国営造船所はガレーを建造する。実測で国有41隻がすべてガレー、民間108隻はスループ。
- 火薬 Goods の価格倍率は P1 で §6.10 の値を設定済み。紙（Paper）は葦から作る Good で、古代のパピルスに当たるものとして生産可能のままにした（止めると書籍・教育の需要連鎖が切れる）。
- 未実施: 長期の Advance Time による技術上昇速度と水道の維持の較正、`late-roman-walled-town` 城プロファイル（P4）。
