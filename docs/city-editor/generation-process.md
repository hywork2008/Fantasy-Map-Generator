# City Editor 都市ランダム生成の処理対応

Generate パネルの工程名（`GENERATION_STAGES`、`src/city-editor/core/generate.ts`）と、実際に呼ばれる関数の対応。格子そのものの作成は Document パネルの `createGridDocument` であり、この生成は既存メッシュの上に海岸・河川・城壁・街路・地区を書き、住居は描画時に導出する。

関連: 操作の概要は [random-generation.md](random-generation.md)。地区キャッシュと農地は [generation-phase3.md](generation-phase3.md)。

## 二つの入口

| 操作 | UI | 実行 |
| --- | --- | --- |
| 🏘 都市を一括生成、🎲 新しい都市、共有リンクの復元 | `runCompleteGeneration` | `startCityGeneration` → worker `generationWorker.ts` → `generateCityOnDocument`。Worker が無い環境は同じ関数を同期実行 |
| 工程スライダ ①〜⑩ | `runGenerationStage` | 同じシードの完成結果が既にあるときはそれを複製する。無いときは `generateStageOnDocument` |
| ◀ / ▶ | `runStep` → `STEP_FNS` | ①〜⑥だけループを1反復ずつ見せる。⑦〜⑩は完成処理を1回呼ぶ |

一括生成が成功すると `appearance: "town"` の文書になり、スライダ表示は ⑨ に合わせる。建物ポリゴンは文書に保存しない。`appearance === "town"` のとき `renderEditorSvg` が導出する。

生成物の id は `gc:` で始まる。再実行はロックされていない `gc:*` の feature / 門 / 要素と、ロックされていない面の地形・地区タグを消してから書き直す。手描きでロックしたものは残る。

シードは Generate パネルの値。一括生成は交差や外縁道路が足りない配置を、同じ設定・元の格子から最大 `COMPLETE_CITY_ATTEMPTS`（8）回試す。0 回目は要求シード、以降は `` `${seed}:junction-retry:${n}` ``。採用したシードは `generationSeed` に残る。

## 工程とデータの関係

①〜⑥は `runPlan` をその段まで実行し、`applyPlan(..., complete=false)` で診断用の文書にする。平滑化・街区整流・町表示はしない。

⑦〜⑩はどれも `generateCityAttempt`（失敗時は `generateCityOnDocument` の再試行）で**完成都市まで計算してから**、残すフィールドと画面フラグだけを変える。⑦で計算を止めて⑧⑨を足す、という段差ではない。

| 工程 | id | 文書に残るもの | 画面だけ変えるもの |
| --- | --- | --- | --- |
| ① 海岸線と海 | `coast` | 海面（`water: "sea"`） | — |
| ② 河川 | `river` | ① + `gc:river-*` | — |
| ③ 市街地コア | `urban` | ② + `buildable` / evolution の `settlement` | 市街地の色付け（`urbanCoreHighlight`） |
| ④ 城壁・門・城郭 | `walls` | ③ + `gc:wall-*`、門、広場・城・寺院・港の要素。門の開口でメッシュが局所的に変わる | — |
| ⑤ 街路 | `streets` | ④ + `gc:road-*` / `gc:bridge-*` | — |
| ⑥ 地区割り当て | `wards` | ⑤ + `face.ward`。寺院の位置を `settleTempleOnDocument` で確定 | — |
| ⑦ 幾何平滑化 | `geometry` | 完成計算のメッシュと `gc:*`。`appearance` と `fabric` は削除 | 町表示にしない。住居・路地は描かない |
| ⑧ 街区・小道 | `blocks` | 完成都市（`appearance: "town"`、evolution は `fabric` も保持） | `hideBuildings`。住居面は描かず、路地は細線（trail）にする |
| ⑨ 住居・完成都市 | `buildings` | ⑧と同じ完成都市 | 住居・路地・城外道路をすべて描く。一括生成の既定表示 |
| ⑩ 道路・小道を隠す | `conceal` | ⑨と同じ文書 | `hideStreetLines`。外城壁の内側の道路と、街区を分ける路地を描かない。河川の橋は残す |

スライダで同じシードの完成結果が既にあるとき、⑧⑨⑩はその複製、⑦はその複製から `appearance` と `fabric` を除いたものになる。再計算はしない。

## 共通の前処理

`prepareRun`（`generate.ts`）

1. `settings.descriptor` が無いとき `synthSite`（`gen/site/synthSite.ts`）。地図の一辺と都市半径は文書の frame を使い、人口は名目の `largeTown`。
2. `siteToGeography` / `siteToProgram` / `resolveWallPlan`（`gen/site/siteInput.ts`）。城壁・海岸の開き方・港・広場・城・寺院は SiteConfig からプログラムへ入る。
3. `cellsFromMesh`。既存メッシュの面を生成器の `Cell` にする。格子の再構築はしない。

`resolveEffectiveLayout` は `classic` / `circulade` / `bram` / `organic` をそのまま採用する。`auto` で地図の一辺が 700 m 以下のときだけ、シード `` `${seed}:effective-layout` `` で circulade / bram / organic を選ぶ。それより大きい `auto` は organic。

## 計画 `runPlan`

`buildEdgeGraph` でセル辺グラフを作ったあと、要求された工程で打ち切る。完成生成は工程 6 まで、`complete=true` で呼ぶ。

### ① 海岸線と海 — `classifyCoast`

`gen/classifySea.ts` の `classifyCoast`。入力は descriptor の水域、無ければ海岸コリドー。シードは `` `${seed}:water:${i}` ``。

- グラフ上の海岸歩行が `coastPath`。
- 歩行を閉じて `waterPolygon`。
- 水域側のセルが `sea`。

`applyPlan` は該当面を `water: "sea"`、`elevation: 0`、`buildable: false` にする。◀▶ は `generateCoastWalkStep`。歩行の途中では海面を塗らず、点列を重ね描きする。

### ② 河川 — `walkRiver` → `classifyRiver`

各河川について `gen/riverPath.ts` の `walkRiver`（シード `` `${seed}:river:${i}` ``）。`fallback` でなく頂点が 2 点以上の帯だけ残す。続けて `gen/classifyRiver.ts` の `classifyRiver` が左右の岸を付ける。岸は③の洪水充填が川をまたがないために使う。

`applyPlan` は帯を最寄り頂点へスナップし、`gc:river-*`（kind `river`）として載せる。川は頂点列が真実源で、辺の共有は後の交差処理が解く。◀▶ は `generateRiverWalkStep`。

### ③ 市街地コア — `classifyUrban` → `splitUrbanCore`

`gen/classifyUrban.ts` の `classifyUrban`。海セルを除き、都市半径（城壁があるときは `urbanDiskRadiusMeters` で少し内側）までの面積で洪水充填する。道路方位の方向へ弱く引っ張る。`settings.urbanNPatches` があるときだけセル数で打ち切る。

`gen/settlementExtent.ts` の `splitUrbanCore` が、その充填を城壁内（`urban`）と城外居住帯（`residentialOutskirts`）に分ける。城壁が無いときは全域がコア。シェア未指定時の目安は Tiny / Small が 100%、Medium 45%、Large 20%。診断用③は `captureStages=true` で充填順を残す。

このあと、まだ工程 3 以上で川があるとき:

1. 仮文書に川とコアを書き、`resolveRiverBoundaryOverlaps`（`gen/resolveRiverOverlaps.ts`）。城壁が川辺と重なる箇所で対岸セルを割り、コア境界を陸側へずらす。面が増えたときだけメッシュを差し替える。
2. `evolutionWallInsetRings` が 1 以上なら `insetWalledCore`。Grid evolution の Tiny は城壁を 1 セル、Small は 1 または 2 セル内側へ寄せ、剥がしたセルは城外居住のまま残す。Bram はスポークが門に届かなくなるためインセットしない。Micro、Hex、Voronoi、Medium / Large、城壁シェアを 100% 未満で明示したときも端のまま。

`applyPlan` は都市と郊外を `buildable` にし、evolution では `settlement: "core" | "outskirts"` を付ける。◀▶ は `generateUrbanPatchStep`（川の面分割はせず、充填 1 セルずつ）。

### ④ 城壁・門・城郭

以下は現行処理。城郭の専用生成と都市壁との接続を置き換える設計案は、[城郭生成と都市城壁の設計](castles-and-fortifications.md) を参照。

計画側:

1. `componentBorderLoops` で都市成分の外周をメッシュ辺のまま辿る。
2. `placePrecincts`（`gen/interior.ts`）。広場と城。
3. 形態が circulade なら `planCirculadeLayout`、bram なら `planPolygonalCirculadeLayout`。既定の広場と寺院をその核に差し替える。
4. `placeGates` → `markWaterGate`。門の上限は `maxWallGatesForExtent`。海を避ける設定では `markSeaSurroundedGates`。
5. circulade / bram は推奨方位に一番近い外周頂点へ門をスナップし、2 つ以上置ければそちらを採用する。

`applyPlan`（`program.walls` のとき壁を書く）:

1. `wall.coast` が `seaWall` と `opening` 以外で海を避けるときは、海に接する辺を城壁から外す（`splitDryWallRuns`）。`opening` は海側の壁を残し、`seaOpeningEdgeIds` で港側に約 16 m の開口を 1 つ空ける。
2. 残った連続辺を `gc:wall-*` にする。
3. `joinWallRiverCrossings` のあと `openWallRiverMouths`（`gateApproaches.ts`）。壁と川が同じ辺を共有している箇所を、中央付近の 1 頂点に寄せて十字交差にする。
4. 計画上の門を、川頂点を除く最寄り壁頂点へ置く。`openBarrierPassage(..., "wall")` で 4 方向の開口を作り、`gc:gate-*` を追加する。広場が重ならないよう `minGateSpacingMeters` 離す。外縁の 30% 以上が海のときは門予算を `round(計画数 × (1 − 海の割合))`、最低 1 にする。
5. 広場・城・寺院・港を `gc:plaza` などの要素にする。寸法は `plazaFootprintMeters` / `templeFootprintMeters`（`gen/housing.ts`）。

◀▶ は `generateGateStep`。壁・広場・城は最初から描き、門だけ増やす。

### ⑤ 街路

計画側 `buildStreets`（`gen/streets.ts`）がセルグラフ上で門ごとのアプローチを作る。海を避けて陸の門の過半数が道に乗らない、または外縁道路が `minExternalRoadsForExtent` に届かないときは、descriptor が無い場合に限り方位を引き直して最大 3 回やり直す（`synthSite` + `buildStreets`）。その後 `clipPolylinesToLand` と `remakeUnreachableLandGates`（`gen/plausibility.ts`）。

メッシュに載せるポリラインは、このあと門の数だけ `farNodeFor` → 門 に組み直す。診断用の工程 6 未満では城内道路は空のまま。工程 6 の診断では `plazaApproachPoint` による門→広場を足す。

完成生成は `generateCityAttempt` がこのポリラインをさらに差し替える（次節）。

`applyPlan`（工程 5 以上）:

1. 橋を許す川について、市街地に接する頂点で `openBarrierPassage(..., "river")` → `addBridge`。`gc:bridge-*` を置く。両岸が陸で、壁辺を橋にしない。
2. 各門で再度 `openBarrierPassage(..., "wall")`。
3. 予備経路が門に届かないときは `connectDryCellInteriors`。
4. `completeRoadRouter` が開口後のメッシュで A*（`aStar`）し直す。川辺・壁辺・広場の内部辺・寺院の身廊に触れる辺は禁じる。Bram は核の半径内の辺も禁じる（`bramRoadBanRadiusMeters`）。
5. 成功した辺列を `gc:road-*` にする。
6. 完成生成は `straightenBridges`。診断生成は `openGeneratedPassages` のあと、川を渡れなかった端を `longestUnbannedRun` で切り詰める。

門が壁の開口を持たない、または完成生成か工程 6 で道路との十字交差が無いときは、この文書は不採用（`unconnected-gates`）。◀▶ は `generateRoadStep`。

### ⑥ 地区割り当て — `assignWards`

`gen/wards.ts` の `assignWards`。決定順は次のとおり。

1. 城 → `castle`、広場 → `market`
2. 港（`placeHarbor`）→ `harbor`
3. 既存の寺院、または `placeTemple` → `cathedral`
4. 門に触れる城内セルを確率で `gate`
5. 残りの城内を `fillInner`（混ぜて `rateLocation`）
6. 門に触れる城外セルを高い確率で `gate`
7. 郊外。城外居住帯は merchant / craftsmen。それ以外はコンパクトなら `farm`、そうでなければ `empty`
8. `pickShanty` で城外の仮設 `shanty`

`applyPlan` は `editorWard` で編集用の地区名にする。`market` / `castle` / `merchant` / `craftsmen` / `harbor` / `park` / `empty` はそのまま。`farm` は evolution のときだけ `farm`、それ以外は `empty`。`slum` と `gate` は `empty`。続けて `settleTempleOnDocument` が寺院矩形を障害に当たらない位置へ置く。

完成生成は `applyPlan` の前に、`slum` / `gate` / `shanty` / `military` を `craftsmen` へ、`patriciate` / `administration` を `merchant` へ寄せる。診断用⑥はこの寄せをしない。

◀▶ は `generateWardStep`。同じ入力ではメッシュを再分割せず、決定順に `ward` を見せる。

## 完成都市 `generateCityOnDocument`

`generateCityAttempt` が 1 案。不採用ならシードを変えて最大 8 案。成功時、evolution で `fabric` がある場合は `fabric.generation` にアルゴリズム名 `evolution-city-v3`、採用シード、設定、生成前の入力文書を入れる。次の一括生成はこの入力格子からやり直し、平滑化の繰り返しで町が縮むのを避ける。

1 案の順:

1. `prepareRun`
2. `runPlan(..., stageStep=6, complete=true)`
3. 充填全体（`builtUp`。城壁内ではない）の面積が `πR² × MIN_SETTLEMENT_AREA_SHARE` 未満なら不採用（`urban-area-too-small`）
4. 地区名の寄せ（上の⑥）
5. メッシュに載せる街路を組み直す
   - 城壁がある町: 各門から広場（Bram は `bramSpokeRadiusMeters` のスポーク端）への星形
   - circulade / bram 以外は、門→広場と重複しない `plan.streets` を追加
   - 城壁の無い Bram は城内道路を空にする
   - 城外は改めて `farNodeFor` → 門
6. `applyPlan(..., 6, complete=true)`。上の④⑤⑥の書き込みと、橋の直角化 `straightenBridges`
7. 外縁道路が `minExternalRoadsForExtent` 未満なら不採用。FMG の descriptor 付きは 0 本でもよい
8. `appearance = "town"`
9. evolution のみ `shortcutMajorRoads`（`gen/majorRoadShortcuts.ts`）。主要道に有用な対角を足す。路地は対象外
10. evolution でなく六角格子なら `rectifyHexBlocks`
11. `streets.foldSmoothing`（既定 true）なら `finishCityGeometry`
12. `straightenBridges`
13. 六角でも evolution でもないとき `rectifyVoronoiBlocks`。引数の 3 つ目は整流前の文書
14. `straightenGateCrossings(straightenBridges(...))`
15. `settleTempleOnDocument`
16. `explainGeneratedCrossingFailures`。不正な門・橋、外縁道路不足、evolution の自己交差面があれば不採用
17. evolution のみ `createFabricPlan`（`gen/fabricDistricts.ts`）。地区の対応とパラメータを `fabric` に保存する。路地と建物の座標はここには入らない

### ⑦ 幾何平滑化で動く関数

`finishCityGeometry`（`gen/finishCityGeometry.ts`）は共有頂点を動かし、近傍の面に変位を伝える。辺の最短長、面の向きと面積、自己交差を見ながら進める。ロックされた頂点・辺・面、手描き経路、地図枠上の頂点は固定する。門と川が既に間隔を持っている壁辺では、その間隔を縮めない。

この前後の整流:

| 関数 | いつ | 役割 |
| --- | --- | --- |
| `shortcutMajorRoads` | evolution、平滑化の前 | 主要道の短絡 |
| `rectifyHexBlocks` | 六角、平滑化の前 | 六角街区を整える |
| `finishCityGeometry` | `foldSmoothing` | 壁と街路の角を丸める |
| `straightenBridges` | 平滑化の直後、および門の直角化のあと | 橋の両隣頂点を川の法線へ寄せ、渡河を短い直交にする |
| `rectifyVoronoiBlocks` | Voronoi 系（六角でも evolution でもない） | 主要道を固定したまま内部の共有辺を整える |
| `straightenGateCrossings` | 最後の橋の直角化のあと | 門の腕を壁の法線へ寄せる。川の交差から出ている道路頂点は動かさず、反対側の腕を回す |

⑦の画面は、この結果から `appearance` と `fabric` を外したもの。メッシュと `gc:*` の壁・川・道路は見える。町の地色・住居・導出路地は出ない。

## ⑨ 住居・完成都市で描かれるもの

住居と街区の路地は `renderEditorSvg`（`render/svg.ts`）が、Select ツールかつ `appearance === "town"` のときに作る。編集用メッシュの辺には追加しない。

振り分け:

| 条件 | 関数 |
| --- | --- |
| `gridKind === "evolution"`、または layout が circulade / bram / classic | `buildBlockFabric`（`gen/blockInfill.ts`） |
| それ以外（典型は Voronoi の organic） | `buildCityBuildings`（`gen/buildingLots.ts`）→ 面ごとの `buildFaceLots` |

`buildCityBuildings` は evolution / circulade / bram / classic では自分では置かず、`buildBlockFabric` に委譲する。

### `buildBlockFabric`

| layout | 呼ばれるもの |
| --- | --- |
| bram | `planPolygonalCirculadeLayout` → `buildPolygonalCirculadeFabric` が核。核の外は `buildLocalFabric(..., layout: "organic")`。核に入る建物と路地は捨てる |
| circulade | `buildCirculadeTownFabric` が核。`settlement === "outskirts"` は `buildLocalFabric` |
| organic / classic で `fabric` が無い | `buildLocalFabric`（シード `fabric-seed`） |
| organic / classic で `fabric` がある | `upgradeFabricPlan` → `resolveDistricts` → `districtDocument` で地区を描画用に結合し、`buildLocalFabric`。農地は `openFieldPlots`（畝はメッシュにしない） |

どの枝も最後に `relieveGatePlazaBuildings`（`gen/gatePlazaBuildings.ts`）。門前の広場に被さる建物を退ける。路地が寺院の庭に触れるものは `laneHitsCivicLandmark` で落とす。

### `buildLocalFabric`（`gen/localInfill.ts`）

面ごとにキャッシュ（最大 256）を見て、ミスした面だけ埋める。

- 城内の organic は `buildPerimeterBlocks` → `buildOrganicBlocks` → `frontageBuildings`
- classic は `buildPerimeterBlocks` がボロノイ近傍の街区を自分で切り、同じく `frontageBuildings`
- 郊外と `castle` は `fillPolygon` → `convexInfillParts` → `insetConvexKernel` → `infillOutskirts` または `infillCore`（`gen/streetGrowth.ts`）→ `frontageBuildings`
- 広場の面は、classic / circulade 以外で `buildPerimeterBlocks`

`frontageBuildings`（`gen/frontageBuildings.ts`）が道路に面した矩形の住居を置く。目標敷地面積は `dwellingLotArea`、街区の見開きは `intramuralBlockSpan`（`gen/housing.ts`）。

### ⑧と⑩の描画差

文書は⑨と同じで、フラグだけ違う。

- ⑧ `hideBuildings`: 住居の path を出さない。路地は細線の trail としても描く。
- ⑩ `hideStreetLines`: `outerWallRing` と `clipPolylineToExterior`（`concealStreets.ts`）で、外城壁の内側に入る道路を落とす。`ce-infill-lanes` も出さない。`gc:bridge-*` のメッシュ区間は町表示では描かず、`bridgeDecks`（`bridgeDeck.ts`）の橋面に置き換える。この橋面は⑩でも残る。川の中の道路は `roadRunsOutsideRivers` で岸までに切る。

## 診断用 ◀ / ▶ と完成処理の差

| | ①〜⑥の工程ボタン | 一括生成・⑦〜⑩ |
| --- | --- | --- |
| 入口 | `generateStageOnDocument` → `runPlan` + `applyPlan(complete=false)` | `generateCityAttempt` |
| 再試行 | しない。失敗はその工程で終了 | 最大 8 案 |
| 平滑化・整流 | しない | `finishCityGeometry` ほか上の表 |
| 橋 | `openGeneratedPassages`。渡れない端は切り詰める | `addBridge` のあと `straightenBridges` |
| 地区名 | `editorWard` のまま | 完成前に craftsmen / merchant へ寄せる |
| `appearance` / `fabric` | 付けない | 付ける。⑦の表示だけ外す |
| 住居 | 描かない | ⑨⑩で導出描画。⑧は路地のみ |

## 不採用になる条件

`generateCityAttempt` / `applyPlan` が `null` を返す主な理由。

| 理由 | 箇所 |
| --- | --- |
| 面が 3 未満 | `prepare` |
| 市街地面積が下限未満 | `urban-area-too-small` |
| 仕上げ前または仕上げ後の外縁道路が不足 | `too-few-external-roads` |
| 門が壁を貫通していない、または道路と十字になっていない | `unconnected-gates` |
| メッシュ検証エラー | `invalid-mesh`（`validate`） |
| 門・橋の交差が不正 | `invalid-crossings` |
| evolution の面が自己交差 | `self-intersecting-faces` |
| 8 案とも不採用 | `all-attempts-rejected` |

進捗ラベルは `generationPhaseLabel`（`generationDiagnostics.ts`）。準備、地形、市街地、城壁・門、街道・橋、都市の構成、形状の仕上げ、交差の検証、メッシュ検証、にまとめて表示する。

## ファイル対応

| ファイル | 役割 |
| --- | --- |
| `src/city-editor/ui/CityEditorPage.ts` | 一括生成、工程スライダ、⑧⑩の表示フラグ |
| `src/city-editor/core/generate.ts` | `GENERATION_STAGES`、`runPlan`、`applyPlan`、完成生成 |
| `src/city-editor/core/generationWorker.ts` | 一括生成の worker。中身は `generateCityOnDocument` |
| `src/city-editor/core/gen/site/synthSite.ts` | パネル設定から立地を作る |
| `src/city-editor/core/gen/classifySea.ts` | ① |
| `src/city-editor/core/gen/riverPath.ts`、`classifyRiver.ts` | ② |
| `src/city-editor/core/gen/classifyUrban.ts`、`settlementExtent.ts`、`resolveRiverOverlaps.ts` | ③ |
| `src/city-editor/core/gen/interior.ts`、`circuladeLayout.ts`、`polygonalCirculadeLayout.ts` | ④の計画 |
| `src/city-editor/core/passages.ts`、`gateApproaches.ts` | 門・橋の開口、直角化、交差の検証 |
| `src/city-editor/core/gen/streets.ts`、`plausibility.ts` | ⑤の計画と海避け |
| `src/city-editor/core/gen/wards.ts`、`civicPlacement.ts` | ⑥と寺院の位置 |
| `src/city-editor/core/gen/finishCityGeometry.ts`、`rectifyHexBlocks.ts`、`rectifyVoronoiBlocks.ts`、`majorRoadShortcuts.ts` | ⑦の幾何 |
| `src/city-editor/core/gen/fabricDistricts.ts` | 完成時に保存する地区計画 |
| `src/city-editor/core/gen/blockInfill.ts`、`localInfill.ts`、`organicBlocks.ts`、`perimeterBlocks.ts`、`frontageBuildings.ts`、`streetGrowth.ts`、`buildingLots.ts`、`openField.ts` | ⑧⑨⑩の路地・住居・農地（描画時） |
| `src/city-editor/render/svg.ts`、`concealStreets.ts`、`bridgeDeck.ts` | 町表示、⑩の道路隠し、橋面 |
