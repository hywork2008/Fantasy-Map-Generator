# FMGバイオームのBV未登録樹木タスクリスト

作成日：2026-10-29

## 1. 対象と照合結果

FMGのバイオームで想定する樹木のうち、BVに専用モデルが登録されていないものを追加するためのタスクリスト。

処理済みの [CE森林LOD用・全バイオームのBV樹木モデル作製タスクリスト](ce-forest-biome-tree-lod-tasks.md) の20樹種・80品質枠は再計上しない。既存計画の「29バイオーム対応済み」は現在の代表樹種による対応であり、各バイオームの樹種を網羅した意味ではない。

照合した正本：

| 内容 | ファイル |
| --- | --- |
| 標準29バイオームと植生アイコン | `src/data/biomeCatalog.ts`、`src/types/biome.ts` |
| バイオームが想定する森林・樹種 | [バイオーム設計](biomes.md) の「追加対象」および直前の説明 |
| BVの樹種キー・生成factory | `src/buildings/landscape/trees.ts` の `TREE_SPECIES`、`TREE_DEFINITIONS` |
| BV表示名・学名・対応バイオーム | `src/buildings/medieval/43-landscape-treesModels.ts` の `TREES` |
| CEで実際に選択する樹種 | `src/city-editor/renderers/landscapeTreeSpecies.ts` |
| 処理済み範囲・別課題 | [既存計画](ce-forest-biome-tree-lod-tasks.md) §3・§4・§7 |

**棚卸し時点の未登録樹木は、ブナ類・ナラ類・シデ類・中欧のマツ類の4群。U01のヨーロッパブナ・U02のヨーロッパナラ・U03のヨーロッパシデは追加済みで、残りはU04の中欧のマツ類。** 設計書は具体的な種まで定義していないため、4群＝4つの確定学名ではない。マツ属にはカナリアマツが登録済みだが、中欧の森林を表す専用種は未登録である。

FMGカタログの `deciduous`、`conifer`、`acacia`、`palm`、`swamp` は植生アイコンの分類であり、種の一覧ではない。コードだけから世界のバイオームに属する未登録樹種の完全な一覧は作れない。この文書では、根拠のある未登録4群と、樹種選定から必要な拡張調査を分ける。棚卸し時点では学名を未確定とし、実施時の種選定と根拠は§7以降に記録する。

## 2. BV未登録の樹木：追加タスク

根拠は [バイオーム設計](biomes.md) の中欧の森林に関する説明。キーは制作時の仮案であり、登録前に具体的な種とともに確定する。

| ID | 完了 | 追加対象の樹木 | モデルキー（未着手は仮案） | 根拠のある対象バイオーム | 棚卸し時点のCE代用 | 次に行う作業 |
| --- | --- | --- | --- | --- | --- | --- |
| U01 | [x] | ヨーロッパブナ（Fagus sylvatica） | `european_beech` | `temperateDeciduousForest`、`centralEuropeanGreatForest` | シナノキ。寒冷時はトウヒ＋シラカバ | 4品質・BV登録・CE森林混交・関連検証を完了。詳細は§7 |
| U02 | [x] | ヨーロッパナラ（Quercus robur） | `pedunculate_oak` | `temperateDeciduousForest`、`centralEuropeanGreatForest` | シナノキ。寒冷時はトウヒ＋シラカバ | 太い分岐・粗い樹皮・切れ込む葉を持つ4品質、BV登録・CE接続・検証を完了。詳細は§8 |
| U03 | [x] | ヨーロッパシデ（Carpinus betulus） | `european_hornbeam` | `centralEuropeanGreatForest` | シナノキ。寒冷時はトウヒ＋シラカバ | 縦にうねる灰色の幹・歯のある葉の4品質、BV登録・中欧大森林への接続・検証を完了。詳細は§9 |
| U04 | [ ] | 中欧のマツ類 | `central_european_pine` | `centralEuropeanGreatForest` | シナノキ、トウヒ＋シラカバ。既存カナリアマツは火山系用途 | 中欧の混交林向けの種を選定し、トウヒ・モミ・カナリアマツとの差が出る4品質を作製する |

棚卸し時点の4群を1種ずつ追加する場合は4モデル系統・16品質枠。U01〜U03の12品質は完了し、残りは最低1モデル系統・4品質枠。ナラ類等を複数種に分ける場合は増える。属の名称だけで1つのモデルを全地域に共用することや、既存モデルの別名登録だけで完了とすることは避ける。

## 3. 樹種の選定が必要な拡張調査

以下は未登録の具体的な樹種名を確定できていない領域。U01〜U04の件数には含めず、調査で登録済みの樹種と異なる種が必要と確認できた時点で追加タスクを起こす。各項目の成果物は「具体的な種・参考資料・対象地域・対象バイオーム・既存モデルとの差・追加要否」とする。

| ID | 完了 | 調査対象バイオーム | 現在使う登録済み樹木 | 調査タスク |
| --- | --- | --- | --- | --- |
| R01 | [ ] | `tropicalSeasonalForest`、`tropicalDryForest` | アンブレラソーン＋ナツメヤシ | 既存計画B06・B25で別課題となった地域固有樹種を選定する。季節林と乾燥林の主構成木を同じ2種で表す範囲を見直す |
| R02 | [ ] | `cloudForest` | カポック | 既存計画B21で別課題となった雲霧林固有の樹種を選定する。対象地域・標高帯を定め、カポック共用で表せない樹形を整理する |
| R03 | [ ] | `tropicalRainforest`、`floodedForest` | カポック、冷涼な冠水林ではハンノキ | 雨林と冠水林の追加構成木の必要性を確認し、陸上・季節冠水の条件と地域を分けて選定する |
| R04 | [ ] | `mediterraneanWoodlandScrub` | オリーブ。用途によりイトスギを維持 | 設計書にある硬葉樹の自然林を表す追加種が必要か確認する。低木は立木とは別に扱う |
| R05 | [ ] | `temperateRainforest`、`temperateConiferousForest`、`montaneForest`、`taiga`、`borealPeatland` | ベイスギ、モミ、トウヒ、シラカバ | 地域ごとの構成木を確認し、U04との共用範囲と追加すべき種を整理する |
| R06 | [ ] | `wetland`、`mangrove`、`coldSteppe`、`grassland`、`savanna`、`hotDesert`、`coldDesert`、`xericShrubland`、`alpineTundra`、`heathMoorland`、`volcanicBarrens`、`volcanicSoil` | 既存計画§3の代表樹種 | 代表樹種以外の立木が必要な地域・用途があるかを確認する。開放地を森林化せず、オアシス・河畔・樹林限界・植生回復の自動判定は別課題として残す |

`marine`、`tundra`、`glacier`、`lavaField` の4バイオームは現行方針で無立木。未登録の自然立木モデルを追加する対象には数えない。これで標準29バイオームを、§2およびR01〜R06の25種と無立木4種として確認できる。カスタムバイオームは標準29種の件数に含めない。

草・低木・枯木・サボテン・ヒース・苔・季節表現は、この立木追加リストのモデル件数には含めない。

## 4. 登録済みとして除外した20樹種

以下は既存計画のT01〜T20に対応する。専用の未登録樹木として再計上しない。

| BV樹種キー | BVの対象種 |
| --- | --- |
| `garden_parkland` | シナノキ（Tilia cordata） |
| `sacred_yew` | イチイ（Taxus baccata） |
| `norway_spruce` | ヨーロッパトウヒ（Picea abies） |
| `silver_birch` | シラカバ（Betula pendula） |
| `date_palm` | ナツメヤシ（Phoenix dactylifera） |
| `umbrella_thorn` | アンブレラソーン（Vachellia tortilis） |
| `saxaul` | サクサウール（Haloxylon ammodendron） |
| `kapok` | カポック（Ceiba pentandra） |
| `western_red_cedar` | ベイスギ（Thuja plicata） |
| `black_alder` | ハンノキ（Alnus glutinosa） |
| `olive` | オリーブ（Olea europaea） |
| `silver_fir` | ヨーロッパモミ（Abies alba） |
| `red_mangrove` | オオバヒルギ（Rhizophora mangle） |
| `tamarisk` | ギョリュウ（Tamarix gallica） |
| `rowan` | ナナカマド（Sorbus aucuparia） |
| `canary_pine` | カナリアマツ（Pinus canariensis） |
| `mediterranean_cypress` | イトスギ（Cupressus sempervirens） |
| `oriental_evergreen` | コノテガシワ（Platycladus orientalis） |
| `sacred_bodhi_and_fig` | インドボダイジュ（Ficus religiosa） |
| `peaceful_willow` | シダレヤナギ（Salix babylonica） |

## 5. 各追加樹種の完了条件

以下はU項目および調査後に追加する樹種ごとに適用するテンプレート。全体進捗は§2の完了欄で管理する。

- [ ] 対象種の学名・表示名・参考資料・対象地域・バイオームを確定する。地域が異なる種を既存の同属モデルで対応済みにしない。
- [ ] `low / medium / high / ultra` を作製し、輪郭・幹・枝・葉の特徴、接地、品質切替時の寸法を確認する。制作基準は既存計画§5を引き継ぐ。
- [ ] `TREE_SPECIES`、`TREE_DEFINITIONS`、BVの `TREES` に登録し、表示名・学名・説明・対応バイオームを揃える。
- [ ] `TREE_VARIANTS` に品質・作者・派生元を登録する。競合版はCEの採用表で確定し、単独版の暗黙採用と区別する。
- [ ] CEの樹種選択へ接続し、地域・気候・混交条件を明示する。既存の用途別植栽や無立木方針を維持する。
- [ ] BVで4品質と採用表示、CEで単木・混交林・近中遠景・簡略LODとの整合を確認する。新樹種は原則 `bounded` とし、描画予算と資源解放を確認する。
- [ ] 変更した登録・選択・描画の関連テストを実行し、目視所見・計測値・再現手順を記録して完了欄を更新する。確認画像の永続保存は必須にしない。

## 6. 実施順序と次の作業

1. U01のヨーロッパブナを完了（§7）。
2. U02のヨーロッパナラを完了（§8）。
3. U03のヨーロッパシデを完了（§9）。
4. **次に着手：U04の中欧のマツ類について具体的な種・参考資料・キーを確定する。** 混交候補の仮配分を自然分布の校正済み比率として扱わない。
5. R01・R02で既存計画から明示的に持ち越した熱帯季節林・乾燥林・雲霧林の樹種を選定する。
6. R03〜R06を確認し、追加要否を記録する。必要な種だけを新たなU項目として追加する。

## 7. U01の実施記録（2026-10-29）

- 対象をヨーロッパブナ `Fagus sylvatica`、キーを `european_beech` に確定。滑らかな灰色の幹、楕円形の葉、広い樹冠は [Forestry England](https://www.forestryengland.uk/tree-species/beech) と [Forest Research](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/beech-be/) を参照。モデルの約20 mは描画用の例示寸法であり、成木の最大寸法ではない。
- `europeanBeech.ts` で4品質を新作。high／ultraは同じ枝骨格、mediumは同じ葉群から当てはめた房、lowは樹冠の空間分割から作る輪郭。lowの幅を調整し、highとの幅の比が各水平軸で0.85〜1.15に入ることを確認した。
- BVのTreesに学名・参考資料・バイオーム・4品質と作者 `Codex GPT-6.1 Sol` を登録。各品質1版のためCEは暗黙採用し、競合のない採用表エントリーは追加しない。BVのWikipedia参照も追加。
- 温帯落葉樹林・中欧大森林の明示キーを持つCE森林へ追加。気温不明または3℃超でシナノキと地点hashによる1:1の候補分岐を使う。この値は表示上の仮配分であり、自然分布の校正値ではない。3℃以下のトウヒ＋シラカバ、公園・墓地・カスタムバイオームの従来選択を維持する。2D／3Dは同じ森林用の選択を通す。候補座標の生成規則は変更していない。
- 三角形数はlow **256**、medium **1,290**、high **19,184**、ultra **71,408**。新種の予算方針は `bounded`、画面サイズによるLOD。既存シナノキの `quality-first` と分離する。
- 関連8ファイルの計134件が最終的に成功。ブナの幅調整後は該当3件のみ再実行した。単木3視点・実BVの4品質・CE森林の品質3段階×3視点をMetal GPUで確認し、切替3巡のgeometry数は16→16→16、破棄後は0、pageerror／WebGL errorは0件。
- 型チェックは今回未変更の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗。今回の変更ファイルに対するBiomeと差分チェックは成功。全件テストは実行していない。

詳細の所見・計測範囲・再現手順は [U01検証記録](../analytics/ce-tree-lod-beech-20261029.md)、数値は [計測JSON](../analytics/ce-tree-lod-beech-20261029.json)。確認画像は一時保存で目視確認後に削除し、Gitには収録しない。

登録済みは既存20種＋ブナの**21種・84品質枠**。§4は棚卸し時点で除外した20種の記録として維持する。次はU02のナラ類の種選定とモデル作製へ進む。


## 8. U02の実施記録（2026-10-29）

- 対象をヨーロッパナラ `Quercus robur`（Pedunculate oak）、キーを `pedunculate_oak` に確定。[Forest Research](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/131559-pedunculate-oak-pok-2/) の種と分布、[Forestry England](https://www.forestryengland.uk/tree-species/english-oak) の樹皮・葉の識別要素を参照。U02の代表1種として追加し、他のナラ類すべてを対応済みとする意味ではない。`Quercus petraea` 等は今回作製していない。
- `pedunculateOak.ts` で太い根元、溝と色の筋を持つ灰褐色の幹、不規則な曲がった分岐、広い樹冠、切れ込む葉を4品質で新作。high／ultraは同じ木部、mediumは同じ葉群を当てはめた房、lowは空間分割した樹冠輪郭。葉の輪郭と密度を調整し、lowの幅がhighより大きくなる差も縮めた。
- BVのTreesに4品質・植物資料・Wikipedia参照・作者 `Codex GPT-6.1 Sol` を登録。各品質1版の暗黙採用で、BVの「CE採用」表示を確認した。
- U01と同じ明示2バイオーム・気温不明または3℃超の森林に限定して追加。既存ブナのhash判定を維持し、残るシナノキ候補の半分を別hashでナラに置換する。候補分岐はブナ1/2・ナラ1/4・シナノキ1/4の表示用仮配分で、自然分布の校正値ではない。寒冷時、公園・墓地・カスタムバイオームの従来選択と、候補座標の生成規則は維持。
- 三角形数はlow **219**、medium **1,149**、high **21,304**、ultra **119,584**。F0の制作目安内。画面サイズLOD・`bounded` を使用し、既存シナノキの `quality-first` は維持した。
- 関連8ファイル・90件が最終的に成功。実BVの4品質、単木3視点とブナとの同尺度比較、Metal GPUで森林の品質3段階×3視点を確認。ナラとブナを合わせた詳細描画は有限予算内で、影も各品質の上限以内。geometry数は品質切替3巡で22→22→22、破棄後0、pageerror／WebGL errorは0件。
- 型チェックは引き続き今回未変更の `src/city-editor/renderers/fogControls.ts:45` の型エラーで失敗。今回の変更ファイルに対するBiomeと差分チェックは成功。全件テストは実行していない。

詳細の所見・計測値・再現手順は [U02検証記録](../analytics/ce-tree-lod-oak-20261029.md) と [計測JSON](../analytics/ce-tree-lod-oak-20261029.json)。確認画像は一時保存で目視確認後に削除し、Gitには収録しない。

登録済みは**22樹種・88品質枠**。U01・U02を完了し、次はU03のシデ類の種選定と4品質の作製へ進む。


## 9. U03の実施記録（2026-10-30）

- 対象をヨーロッパシデ `Carpinus betulus`、キーを `european_hornbeam` に確定。[Forest Research](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/hornbeam-hbm-2/) の種と混交林、[RHS](https://www.rhs.org.uk/plants/3136/carpinus-betulus/details) の縦にうねる幹・葉の起伏、[Keele University](https://www.keele.ac.uk/arboretum/ourtrees/speciesaccounts/hornbeam/) の葉縁と枝の特徴を参照。約16.5 mは描画用の例示寸法で、刈込・萌芽林・柱状の園芸品種のモデルではない。
- `europeanHornbeam.ts` で4品質を新作。灰色の幹の縦のうねり、長く上向きの枝、歯のある葉と中央脈に沿う折れ目を持つ。high／ultraは同じ木部・乱数列を共有し、highは葉数と1枚あたりの分割を減らす。mediumは同じ葉群の房、lowは空間分割した樹冠輪郭。ブナ・ナラとの同尺度比較で、幹・分岐・葉・樹冠の差を確認した。
- BVのTreesに4品質・植物資料・Wikipedia参照・作者 `Codex GPT-6.1 Sol` を登録。各品質1版の暗黙採用で、実BVの「CE採用」表示を確認した。
- 中欧大森林の明示キー `centralEuropeanGreatForest`・気温不明または3℃超の森林だけへ追加。ブナ・ナラのhash判定と候補を維持し、残るシナノキ候補の半分を別hashでシデへ置換する。中欧大森林の候補分岐はブナ1/2・ナラ1/4・シデ1/8・シナノキ1/8の表示用仮配分で、自然分布の校正値ではない。温帯落葉樹林の既存3種、寒冷時、公園・墓地・カスタム入力と候補座標の生成規則は維持。
- 三角形数はlow **237**、medium **1,175**、high **19,124**、ultra **117,380**。F0の制作目安内。画面サイズLOD・`bounded` を使用し、既存シナノキの `quality-first` は維持した。
- 関連8ファイル・91件が成功。中欧大森林を含む植栽・寒冷fallback確認を拡張し、外観調整後はシデの該当3件のみ再実行。実BV4品質、単木3視点、ブナ・ナラとの同尺度比較、Metal GPUの森林9条件を確認した。シデ・ブナ・ナラを合わせた詳細描画と影は有限予算内。geometry数は品質切替3巡で28→28→28、破棄後0、pageerror／WebGL errorは0件。
- 型チェックは今回未変更の `src/city-editor/renderers/fogControls.ts:45` の既存エラーで失敗。今回の変更ファイルに対するBiomeと差分チェックは成功。全件テストは実行していない。

詳細の所見・計測値・再現手順は [U03検証記録](../analytics/ce-tree-lod-hornbeam-20261030.md) と [計測JSON](../analytics/ce-tree-lod-hornbeam-20261030.json)。確認画像は一時保存で目視確認後に削除し、Gitには収録しない。

登録済みは**23樹種・92品質枠**。U01〜U03を完了し、次はU04の中欧のマツ類の種選定と4品質の作製へ進む。
