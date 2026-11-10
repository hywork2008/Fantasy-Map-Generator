# BV高品質モデル 第16群：修道院生活棟と陶工房（2026-11-01）

Medieval 32の未対応だったAbbey domestic rangeと34の陶工房にCodex GPT-6.1 SolのHighを追加した。[複合モデル設計](../plan/bv-composite-models.md)に従い、既存部品と接続条件を確認してから生成境界を定義した。旧Lowの生成関数は保持し、CE向けdefaultも従来の生成関数へ接続した。既存の大規模Abbey／Friary Highは変更していない。

## 作製内容とBV実測

| モデル | Highの構造・詳細 | Low三角形 | High三角形 | Highメッシュ |
| --- | --- | ---: | ---: | ---: |
| 修道院生活棟 | 5棟の生活・食堂・サービス・厨房・貯蔵棟、厚い壁と開いた出入口、窓、切り合いを処理した屋根、尖頭アーチ回廊、中庭と低い薬草、寝室階の床と内部階段・床開口、寝台、食卓・長椅子、厨房の開いた煙道と屋根の切り欠き | 4,738 | 31,630 | 10 |
| 陶工房 | 共通作業上屋、足で回すろくろの軸・下部円盤・上部円盤・支持枠・腰掛け、内側のある陶器、筋交い付き乾燥棚、粘土作業台・切り糸・道具、原料の台、独立した厚壁の窯と焚口・装入口・上部通気口、隙間のある焼成床・受け段・支柱 | 5,416 | 43,216 | 9 |

## 共通部品と生成境界

生活棟は`createHighFriaryBuilding`と`createHighFriaryCloister`へ生活棟用の配置計画を渡して再利用する。主教会を仮置きして形を切ることはせず、生活棟だけの計画を使う。教会を含む既存Abbeyとは別のBV表示項目である。

8部品は、、、、、、、。厨房は煙道と対応する屋根切り欠きを一緒に扱う。家具部品は上階床・その開口・内部階段・寝台等を含み、建築本体と合成した位置に置く。

陶工房は、、の3部品。上屋と作業台は`workshopDetailKit`を再利用した。窯の深いアーチ開口は`addMasonryArchPassage`へ切り出し、既存石灰窯の焚口もこの共通factoryを使う。石灰窯と陶器窯では炉・装入物・焼成床が異なるため、本体をそのまま交換しない。

各部品は独立factoryで、選択した部品だけを生成できる。合成時には作者・High品質・部品台帳・統合後の頂点範囲を保持する。

## 資料と設計判断

[English HeritageのSouthwick Priory解説](https://www.english-heritage.org.uk/visit/places/southwick-priory/history/)では、回廊周辺に寝室・食堂などの棟が置かれた構成が説明されている。今回の建築用途の参考であり、その修道院の復元ではない。5棟の寸法、部屋の配置、家具、厨房の煙道は模式モデルの設計判断で、特定の修道会・時代・地域の標準形式とは主張しない。

陶器窯の炉と陶器室を分ける構造、上昇する熱を通す床は、[Ashmolean Museumの陶器窯解説](https://potweb.ashmolean.org/PotFing5.html)と[Historic EnglandのRoman and Medieval Pottery and Tile Production](https://historicengland.org.uk/images-books/publications/iha-roman-medieval-pottery-tile-production/heag228-roman-medieval-pottery-tile-production/)を参考にした。ドーム形状・寸法・正面の上下開口は模式化であり、特定の中世窯の実測復元ではない。窯は未点火で装入口を開けた検査・装入状態として表示する。

## 検証

- `npx vitest run src/buildings/medieval/domesticAndPotteryDetails.test.ts src/buildings/medieval/kilnAndBleachingDetails.test.ts src/city3d/adoption.test.ts`を関連範囲として実行。新規の修正・回帰テスト追加後は専用ファイルを再実行し、最終的に専用10件、共通窯への影響9件、採用3件の計22件が成功した。
- 実寸上限、接地、有限の頂点・法線、上面・側面投影、独立した資源、一度だけの解放、従来Lowとdefault参照を確認。
- 全8＋3部品を単独生成して品質と台帳を確認。
- 生活棟の南側入口、回廊と棟の扉、内部階段の床開口と床への接続、厨房の開いた煙道を検証。厨房単体の生のgroupに対しても、煙道内に切り抜き前の屋根が残らないことを確認した。
- 陶器窯の上下開口、周囲の壁、上部通気口、焼成床、棚上の陶器の開いた口と棚への接触を検証。
- BV確認で焼成床の横材の端が円形外壁から出ていることを検出した。円内に収まる長さへ切り詰め、環状の受け段を追加。全床材の頂点が外壁内にあり、端部が受け段に載ることを回帰テストで確認した。
- `npx tsc --noEmit`、変更ソースのBiome、`git diff --check`：成功。
- 実BVで2種のLow／High、全11部品の単体表示、全景・低い視点を確認。巡回中のJavaScriptエラーは0件。

## 次の作業

Medieval 35の港湾クレーン2種と36の絞首台を進める。共通の木組み・巻上げ設備と通路の契約を先に確認する。

[監査一覧](bv-non-tree-high-quality-audit-20261031.md)は220レコードのまま、Codex High／Ultra対応が91件から93件、未対応が129件から127件となった。共通部品の再利用を独立した建築資産の増加とは数えない。
