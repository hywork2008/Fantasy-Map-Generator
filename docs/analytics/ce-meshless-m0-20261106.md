# メッシュなしCE M0：機能・依存・固定入力・幾何計測

記録日: 2026-11-06  
状態: M0完了。M1以降の製品機能は未実装。次は文書型・曲線・codec・履歴・方式分岐のM1。

対象設計: [CEメッシュなし都市生成・編集](../plan/ce-meshless-city-editor.md)。旧CEの生成・編集・橋APIには本作業で変更を加えていない。

## 1. 成果物と再実行

| 成果物 | 用途 |
| --- | --- |
| [機能一覧JSON](../plan/data/ce-meshless-m0-inventory.json) | 16機能群、52ソースファイルの参照、メッシュ依存、共有／置換方針、担当段階、受入条件 |
| [固定入力JSON](../plan/data/ce-meshless-m0-cases.json) | 設計書§15の11ケース。具体的な座標・寸法、解析的な期待値、後続段階の受入項目 |
| [M0計測スクリプト](../../scripts/city-editor/meshless/m0Baseline.ts) | 現行の幾何関数・空間索引・橋APIを実行する独立したlab。製品コードへ依存を追加しない |
| [計測結果JSON](ce-meshless-m0-baseline-20261106.json) | 精度・負荷・bundle、既知の不足、未実装項目、61入力ファイルのSHA-256 |

リポジトリルートから再実行する。既存記録の上書きを拒否するため、新しい出力先を指定する。

```sh
node --import tsx scripts/city-editor/meshless/m0Baseline.ts --out /tmp/ce-meshless-m0-new.json
```

固定入力は製品用`VectorCityDocument`ではなくM0用のテストデータである。将来のcodecを実装済みと誤認しないように、`format: "ce-meshless-m0-fixtures"`としている。

機能一覧のソース・シンボル・ケース参照の存在をスクリプトで検証した。これはソース参照の検査であり、すべてのUI操作を自動実行した証拠ではない。以下の経路はソースを読んで整理した。

## 2. 機能と呼出経路の棚卸し

パスは特記しない限り`src/city-editor/`以下。既存機能が新方式で未実装でも旧CEで継続利用できることと、新方式の同等機能が完成したことを区別する。

| 機能ID | 現在の入口・主な下流 | セル依存と決定 | 担当／受入 |
| --- | --- | --- | --- |
| `entry-and-settings` | `components/CityEditorPage.ts:mountCityEditor`、FMG共有の`services/io/shareRequest.ts:cityEditorSettings/cityEditorDocument` | 文書・グリッド生成と索引の初期化へ進む。新方式はその前に分岐する | M1〜M4。旧文書・Freeform・新文書の方式を保持 |
| `generation-and-stages` | `controllers/generation.ts`→`services/generationWorkerClient.ts`→`services/generationWorker.ts`→`generateCityOnDocument` | `skeleton/toPlan.ts`はK6で`buildConformingMesh`を呼ぶ。新方式は専用Worker・runを使う | M4〜M6。同一runの段階表示、キャンセル、古いjobの不採用 |
| `road-river-wall-drawing` | `controllers/tools/routes.ts:extendRouteStroke/closestMeshEdgeId`、Freeformの`wayTool.ts/ledgerTool.ts` | 既存の線描画は辺・頂点選択。Freeformの操作の意味は再利用し、曲線・接続コマンドは別実装 | M2〜M3。フリーハンド・ベジェ・幅・接続の保存 |
| `wall-presets-and-double-walls` | `skeleton/wallShapes.ts:unitWallShape`、`innerTownWall.ts:planInnerTown`、`assembly/skeleton.ts` | 形状数学は共有候補。門の`vertexId`、壁の辺列、内部セル一覧は置換 | M2〜M3。縦横比・実寸、独立した内外壁、狭い通路 |
| `bridges-and-gates` | `skeleton/crossings.ts`、`bridgeDeck.ts`、Freeformの`validateWay.ts:riverCrossing` | 現行の川・道はメッシュ参照。共通角度APIは維持し、§5の矛盾を別変更で解消する | M3。適法な直線橋、両岸の取付、共有門ノード |
| `districts-and-local-infill` | `tools/brushes.ts`→`fabricDistricts.ts`→`localInfill.ts:buildLocalFabric`→`organicBlocks.ts` | 地区塗り、隣接、共有辺の入口がセル依存。領域と接道区間へ置換し、内部のポリゴン分割を抽出 | M4〜M5。穴・分離領域・開いた道路・到達性 |
| `facilities-housing-and-population` | `populationFacilities.ts`→`allocateBVFacilities.ts`→`populationHousingFit.ts`、`residentialCapacity.ts` | 需要・実寸・容量の意味は共有。候補用地、隣接、内外区分、高さの`faceId`参照を置換 | M5。施設先行、実寸、短い入口、住宅容量の二重計上なし |
| `castle-moat-and-bastions` | `castleLayout.ts:layoutCastle`、`moats.ts:MoatReservation`、`bastionedTown/plan.ts` | セル所有と回路境界を独立領域・線へ変換。資産・防御寸法・時代条件は共有 | M8。城・堀・稜堡・入口の対応と変換時の欠落検出 |
| `harbor-ships-and-market` | `harborFabric.ts:planHarbor`、`marketPlacement.ts:placeMarketInArea`、`cityElementsSvg.ts` | 港の地区・河岸がセル依存。船・市場の資産と活動状態を共有し、用地・アクセスを置換 | M8。護岸、荷役、船、活動、保存、通路の維持 |
| `temple-cemetery-park-farm-forest` | `cemeteryLayout.ts`、`aerialLandmarks.ts`、`ruralFieldStage.ts`、`forestPlan.ts` | `ward`、`settlement`、`sourceFaceIds`、保護地を用途領域へ置換 | M8。水面・道・施設との排他、文化・景観設定の維持 |
| `terrain-and-freeform-placement` | `freeform/freeformCity.ts`、`freeform/commitPlacement.ts`、`terrainField/build.ts` | 高さ場・BV敷地・坂・階段は共有候補。文書投影とセル標高／水域fallbackを切り離す | M7〜M8。造成・勾配・向き・水面の再読込 |
| `two-and-three-dimensional-view` | `editorSvg.ts`→`townFabricSvg.ts`→`townFacts.ts`、3Dの`cityView.ts:mountCity3d` | 描画時の生成とセル属性読出しをなくす。完成形状と選択属性を入力にする | M7。2D・3D・出力・品質間で同じ採用配置 |
| `selection-and-measurement` | `mapDisplay.ts`、`tools/selection.ts`、`renderers/pickInfo.ts` | 面・辺・頂点の探索をentity／segment／anchor／regionへ置換。viewport・計測式は共有 | M2〜M7。選択IDと実寸の安定 |
| `history-and-transactions` | `controllers/history.ts`、`editing.ts`、`generationPlayback.ts`→`generators/history.ts` | mesh差分とセルhighlightは専用処理。UI契約を共有し履歴本体は別実装 | M1〜M6。一括Undo、接続参照、revision・jobの整合性 |
| `files-sharing-and-export` | `services/io/cityEditorFile.ts`→`documentCodec.ts`／Freeform、`incomingCity.ts`、`standaloneSvg.ts` | native文書・共有envelope・出力が`CityDocument`前提。方式入口で別codec・adapterへ渡す | M1〜M7。保存・共有・編集保持、明示的な複製変換 |
| `layers-locks-and-manual-edits` | `controllers/layers.ts`、`features.ts:smoothFeatureGroups`、`tools/dragCompletion.ts` | 固定・選択・移動がメッシュを共有。新方式ではoriginとeditPolicyを分離 | M2〜M6。固定入力・手動物を無断で移動・削除しない |

各項目の固定入力参照と具体的な受入文は機能一覧JSONにも保存した。M8の資産別詳細ケースはその実装段階で追加する。ここで準備した変換・領域等のケースだけで、城や港等が対応済みとはしない。

## 3. M1へ渡す境界の決定

### 3.1 文書とUI

1. 新しい`types/vector/`に`VectorCityDocument`を置く。`format: "fmg-vector-city"`、`version: 1`を案として確定する。`mesh`を持たせない。
2. host境界に`EditorDocument = CityDocument | VectorCityDocument`を導入する。既存の`CityDocument.mesh`をoptional化しない。
3. 現在のFreeformは台帳ファイル`fmg-freeform-city`と、空meshを持つ`CityDocument.freeform`への投影を使う。M1でこの既存経路を変更せず、vectorは別分岐とする。
4. `mountCityEditor`で旧文書のグリッド・索引・セル用controllerを作る前に方式を判別する。新方式は共通UI部品を使う専用controller群へ進む。共通コンテキストへ型キャストして渡さない。
5. `DocumentsState`／`InteractionState`は旧文書・セル操作が多く、型だけunionへ広げても成立しない。新方式のsessionを別型にし、共通shellへ渡す操作を狭いinterfaceにする。
6. `types/selection.ts:RenderSelection`の必須`faceId/edgeId/vertexId`を新方式に流用しない。新方式は対象種別付きIDを保持し、共有描画のpick情報へadapterで変換する。
7. Gridの`None`として旧処理へ渡さない。方式選択でGrid設定を非適用とし、旧方式の値は旧文書用に保持する。

### 3.2 履歴

現行`DocumentHistory`は、checkpoint間隔をmesh要素数で決め、`diffDocument`と`applyPatch`が`mesh.vertices/edges/faces`を直接扱う。汎用のtop-level差分もあるが、履歴クラス自体はメッシュなしで使用できない。

M1では次の契約で進める。

- `DocumentHistory`をそのまま維持する。
- 公開履歴interfaceを型引数付きにする場合も、既定型を`CityDocument`として旧呼出側を維持する。新方式には別の`VectorDocumentHistory`を置く。
- 最初は小さい新文書のsnapshot履歴と明示的な`structuredClone`で正確性を優先する。計測してからmap差分・checkpointへ最適化する。
- 曲線変更と接続点・幅参照・施設移動を単一transactionにする。pointerプレビューは履歴外とし、ドラッグ確定を1件にまとめる。
- 生成runの履歴はステージ番号だけでなく、run ID・stage ID・入力revision・採用job IDを持つ。Undoでrevisionが以前の値へ戻っても旧jobを復活させない。

M0固定ケース`edit-undo-stale-job`では、旧jobと置換jobの入力revisionが同じ7でも、IDが異なる場合に旧jobを拒否する条件を明記した。現行Worker clientの`settled`とキャンセルによる遅延結果抑止は維持するが、専用vector runの同等性はまだ実装していない。

### 3.3 IO・Worker・描画

| 境界 | M1以降の変更箇所 | 維持するもの |
| --- | --- | --- |
| ファイル | `services/io/cityEditorFile.ts`でformat判別後にvector codecへdispatch。`ImportedCityMap.document`の境界を対応させる | 既存`parseDocument`とFreeform parser、旧共有形式 |
| FMG共有 | `incomingCity.ts`のshare envelopeから共通入力へ正規化し、方式別に文書を作る | native文書とshareの区別、元ID・固定交差・座標変換 |
| Worker | vector専用request/replyとWorkerを追加。job IDと入力revisionで採用判定 | 既存`types/worker.ts`とメッシュ生成Workerの意味 |
| 2D | 完成形状と用途・選択情報を入力にする。初期は専用rendererから共有SVG部品を利用 | 旧`renderTownFabric`の入力と出力 |
| 3D・出力 | 同じ採用形状から資産・建物・路面を渡すadapterを追加 | 資産の実寸・外観・地形・カメラ、旧export |

## 4. 固定入力と確認範囲

| ケース | 用意した具体的な入力・期待値 | M0で実行したこと／残る実装 |
| --- | --- | --- |
| `wall-presets` | 面積10000π、比率1・2・0.5、回転37度、壁厚2 m、門幅4 m | 1024点楕円の面積誤差を計測。プリセット編集と実寸固定はM2 |
| `curves-and-freehand` | 4制御点の三次ベジェ、7点の手描き線、自己交差する壁 | 位置・接線誤差、端点維持、既存簡略化、自己交差拒否。安定anchorはM1〜M2 |
| `double-wall-gap` | 壁中心間隔8 mと6 m、壁厚各2 m、道路幅4 m、離隔各0.5 m | 実際の残幅5 mは可、3 mは不可の解析値を確認。経路探索はM3 |
| `variable-river-width` | 川幅20→40 m、乾いた取付各2 m、固定建物 | 必要橋長24→44 mと建物衝突を確認。幅変更transactionはM6 |
| `bridge-policy` | 直角、各材質・時代の限界、限界＋0.00001度、45・89・90度等 | 共通APIを実行し、許容／拒否と明示値の矛盾を記録 |
| `riverside-tannery` | 川幅20 m、道路幅4 m、120㎡敷地 | 河岸〜道路端14 m、敷地〜河岸2 m、入口通路2 mを確認。実配置はM5 |
| `fmg-fixed-crossing` | 既存Gothengsfeld共有fixture、調査済み交差1件 | ファイル、件数、固定payloadのハッシュを記録。vectorへの取込はM4 |
| `holes-and-open-roads` | 400㎡外周−100㎡穴、U字形、開いた道路、0.5㎡残地 | 4凸片／8三角形で残地300㎡、U字上側2成分・16㎡を確認。一般領域演算はM4 |
| `facility-stage-playback` | 人口1000、施設と住宅のID、各段階で可視となるID | 受入データを準備。新方式の生成・段階表示はM5 |
| `edit-undo-stale-job` | revision 7→8→Undo 7、旧／置換job、固定ID | 受入データを準備。専用履歴と更新はM1／M6 |
| `document-formats` | 旧native・Freeform・vector形式、共有fixture、変換不可対象 | fixture形式とshare envelopeを確認。vector codecはM1 |

固定入力を用意したことを、新しい製品機能の受入成功には数えない。計測JSONの`measured`、`known-gap`、`prepared-not-implemented`で区別している。円・ベジェの計算はlabの解析的基準であり、将来の製品用曲線実装を先行して導入したものではない。

## 5. 橋APIと規約の監査

### 5.1 一致している点

`src/utils/bridgeSkewPolicy.ts`の時代・材質表は、古代／中世の石15度・木20度、近世25度、斜めアーチ以降30度を返す。`bridgeSkewDegrees`は河川法線からのずれを測り、方向反転・単位長に依存しない。ゼロ長軸は90度を返す。

FMGの`generators/technologyProgress.ts:getStateBridgeSkewTier/getStateBridgeSkewLimit`はHistorical periodを下限とし、国家技術に応じて引き上げる。REの`core/gen/perpendicularBridges.ts`は共通の最大30度で明示値を制限している。`src/utils/fixedBurgCrossings.ts`も調査済み交差の軸と河川接線を最大30度で検証する。

### 5.2 M3受入前に解消すべき不一致

| ID | 再現・現状 | 必要な対応 |
| --- | --- | --- |
| B1 | `resolveBridgeSkewLimit("highMedieval", {maxBridgeSkewDegrees: 45})`は45、89は89、120は89を返す。絶対上限30度と矛盾 | 共通APIと入力検証を別変更で修正し、FMG・RE・CEの関連テストを明示して確認。新方式だけの局所上限表で回避しない |
| B2 | `bridgeDeck.ts:documentBridgeSkewLimit`、骨格の`inputs.ts`は材質引数を渡さず既定の石を使う。一方Freeformは路面から木／石を選ぶ | 道路種別・橋材質を明示的入力にする。木橋へ20度を許す意味と、保存済み明示値の扱いを共通契約でそろえる |
| B3 | 旧骨格の橋・門の取付距離には`inputs.cellSize`が使われる | vector側では道路幅、橋取付、曲率、実寸離隔から決める。セルサイズを隠れた道路パラメーターとして残さない |

B1は実行による既知の不足として計測JSONへ保存した。B2・B3は静的な呼出箇所の監査である。旧方式を変えないM0の範囲で規約全体を修正したとはしない。B1〜B3を未解決のまま新方式の橋をM3完了としない。

## 6. 幾何精度の基準

M1〜M3へ渡す初期の計算プロファイル:

| 項目 | 値・扱い |
| --- | --- |
| 位置近似誤差 | 0.005 m以内を初期目標 |
| 共有接続点の一致 | 0.000001 m以内。近い独立点を接続扱いにする半径ではない |
| 接線近似誤差 | 0.1度以内を初期目標。ただし橋の上限判定は解析的な接線と誤差評価を使い、0.1度の上限緩和を加えない |
| 面積誤差 | 既知の解析形状で相対0.00001以内を初期目標 |
| 表示の解像度 | 上記の判定から独立。zoom・品質変更で接続・敷地・容量を変えない |

三次ベジェの2049個の評価点と、その点を含む区間の弦を比較した実測:

| 等分割区間数 | 最大位置差 m | 最大接線角差 度 |
| --- | --- | --- |
| 16 | 0.2924682012 | 6.006408273 |
| 64 | 0.0183085319 | 1.494974543 |
| 256 | 0.0011444013 | 0.373200618 |
| 1024 | 0.0000715255 | 0.093266156 |

256区間で位置目標を満たしても接線目標は満たさないため、位置だけによる分割打切りは採用しない。1024区間を一律の製品設定にする判断でもない。M1〜M2では位置・接線の両方を見た適応分割と、極小曲率・ゼロ接線・接する曲線の検証を実装する。

本計測は有限点の誤差観測であり、任意曲線の数学的な最大誤差保証ではない。製品での保守的境界・適応分割の証明条件は後続実装の受入に残す。フリーハンドの固定入力は7点から3点となり、元点に対する最大距離0.003 m、両端の保持を確認した。

## 7. 領域演算・空間索引・bundleの比較

### 7.1 既存の候補を実行した結果

| 候補 | 固定ケースでの結果 | 判断 |
| --- | --- | --- |
| `parcelGeometry.ts:subtractConvex`の凸片分解 | 四角い穴の差分を4つの重ならない凸片・合計300㎡として保持 | 既存の単純幾何として再利用。一般の穴付き輪郭の正規化・union APIと同一視しない |
| `three.ShapeUtils.triangulateShape` | 同じ穴を8三角形・合計300㎡で保持 | 描画用として利用可能。これ自体は差分・union・offsetを解かないため都市領域の正本処理へ採用しない |
| `streetBlockGeometry.ts:clipStreetBlocks` | U字形の上側を2成分、合計16㎡として保持 | 非凸領域の分離を保つ既存部品として再利用候補 |
| `geom.ts:segmentSegmentHit` | 通常の交点は返すが、共線の重なりはnull | 新しい位相処理には交点・接触・重複区間の分類APIが必要 |
| `subtractConvex`の既定`minimumArea=1` | 0.5㎡残地が0㎡となる。明示的な0では0.5000000000000036㎡を保持 | 土地の幾何と建築可否の面積閾値を分離。旧関数の既定をM0で変えない |
| 既存bucket索引 | 400件の固定配置で候補16件、真の境界箱交差9件を漏らさない | 規則的で範囲の小さい既存用途へ維持 |
| `rbush` | 同じ400件の配置で境界箱交差9件を返す | 既存依存を再利用し、曲線区間・不均等領域の候補探索へ採用。最終形状判定は別途必要 |

### 7.2 単独browser entryのbundle

esbuild、ES2022、ESM、minify、未書出しの単独entryをgzipで比較した。実アプリの追加chunk量ではなく、既存3D chunkとの共有を差し引いた値でもない。

| entry | minify bytes | gzip bytes |
| --- | --- | --- |
| 既存の凸交差・差分 | 1125 | 582 |
| 既存bucket索引 | 470 | 272 |
| `rbush` | 5744 | 2213 |
| `three`のShapeUtils・Vector2 | 248672 | 57806 |

**M0の依存採用決定**: 新しいnpm依存は追加しない。M1の曲線・基礎幾何は既存の小さな関数と新契約で実装し、空間索引は既存`rbush`を使う。3Dのための`three`を一般領域演算の代わりに生成coreへ導入しない。

一般の多成分・穴・重複境界・曲線offsetを扱う製品用領域カーネルは未実装である。M4では凸片と境界の再構成を明示的な領域契約で実装・検証する。今回の比較から「任意のboolean演算に既存関数で十分」とは結論しない。新規ライブラリが必要と判明した場合は、M0の採用決定を更新し、同じ固定ケースの精度・負荷・bundleを比較してから追加する。

## 8. 負荷の基準と限界

環境: Apple M4、darwin arm64、Node v22.23.1。ウォームアップ5回、21標本、各標本20回の平均を使った。Nodeは実行環境の版であり、`package.json`の要求`>=24`を満たさないため、正式な対応環境での性能受入値とはしない。

| 計算 | 中央値 ms／回 | p95 ms／回 |
| --- | --- | --- |
| ベジェ1024区間の等分割（lab） | 0.108396 | 0.119317 |
| 既存の手描き線簡略化 | 0.001235 | 0.001983 |
| 四角い穴の凸差分 | 0.004212 | 0.009535 |
| threeの穴付き三角形化 | 0.005985 | 0.008213 |
| U字形の半平面切取り | 0.007565 | 0.012146 |
| rbushの400件構築＋問合せ | 0.032796 | 0.041419 |
| bucketの400件構築＋問合せ | 0.035577 | 0.062183 |

これらは小さい固定ケースのCPU基準であり、都市全体生成、ブラウザーの操作フレーム、GPU、2D DOMの性能を測った値ではない。新方式は未実装なので、旧方式より高速になったとは評価しない。固定ケースを超える全都市・多数seedの生成は行っていない。

M1〜M2の初期予算は、これらの固定入力について「局所曲線の評価・接続候補計算の合計p95 4 ms以内」「単一の小領域計算p95 1 ms以内」を目安とする。これは今後の実装予算であり、製品全体の達成済み保証ではない。正式な対応Node環境とブラウザーで同じ入力を測り、M7／M9の描画・操作予算を別途決める。

## 9. 検証と追跡

- M0スクリプトの幾何・入力・ソース参照のassertionが成功した。
- 既知の不足は`bridge-policy-absolute-override`、`small-residual-default-area`、`collinear-overlap-classification`の3件として残した。不足を成功へ読み替えていない。
- vectorのcodec、曲線編集、接続、経路探索、施設生成、Undo／job等の製品機能は`prepared-not-implemented`として後続段階へ割り当てた。
- 関連既存テストは橋規約、メッシュ履歴、Freeform保存、Workerのキャンセルを対象に実行し、4ファイル・33件が成功した。jsdomのCanvas未実装メッセージは出たが失敗はなかった。
- 固定入力と計測JSONはいずれも2 MB未満。全量観測の外部raw出力は作っていない。

SHA-256:

| ファイル | SHA-256 |
| --- | --- |
| `docs/plan/data/ce-meshless-m0-cases.json` | `8fbdb710e862dd9856a8a3ab6034ac0a8313433cfbe55e846ab624698f5c9377` |
| `docs/plan/data/ce-meshless-m0-inventory.json` | `f15175f0f1b50fb8f609023732531068ae62bd551265d9a337d00e03892cb8f5` |
| `docs/analytics/ce-meshless-m0-baseline-20261106.json` | `ca02388534b9f316e1359d5b22b4f27b19186b93cc88ae055cfbb258d6b42e4e` |

実行スクリプト、既存の参照ソース、FMG固定入力、lockfileを含む61ファイルのサイズとハッシュは計測JSONの`inputs`に記録した。アルゴリズム、source、依存を変えた比較は同じ結果と見なさず、新しい出力として保存する。

実行した関連テスト:

```sh
npx vitest run src/utils/bridgeSkewPolicy.test.ts src/city-editor/generators/history.test.ts src/city-editor/generators/freeform/freeformCity.test.ts src/city-editor/services/generationWorkerClient.test.ts
```

## 10. M0受入と次の作業

| 設計上のM0条件 | 記録 |
| --- | --- |
| §12の各機能に担当経路・受入項目がある | §2と機能一覧JSONの16機能群で対応。52ソース参照の存在も検証 |
| §15の固定入力がある | 11ケースの座標・解析値・期待動作と実装段階を保存 |
| 幾何精度・負荷・依存候補の基準がある | §6〜§8と計測JSON。有限点評価・小ケース・Node版の限界を明記 |
| 橋規約の監査と不足を記録した | §5のB1〜B3。解消をM3受入条件へ設定 |
| 文書unionと履歴の変更範囲を確定した | §3。旧メッシュ文書をoptional化せず、方式境界と専用履歴へ分離 |

次はM1。`VectorCityDocument`と曲線の保存契約、安定した区間ID・anchor、format dispatch、専用履歴を小さい手動文書で実装する。M1で都市自動生成全体や一般boolean演算まで広げない。B1の共通橋API修正はM3前に独立した変更として扱う。
