# City Editor 都市ランダム生成の処理対応

調査日: 2026-10-02。対象: `c47ed0e33`（同日の `feature/moat` マージ後）。現行実装の呼び出し順を確認し、2026-09-29 版を更新した。失敗理由と固定シード試行は [generation-failure-cases.md](generation-failure-cases.md)。

Generate パネルの工程名（`GENERATION_STAGES`、`src/city-editor/core/generate.ts`）と、実際に呼ばれる関数の対応。格子そのものの作成は Document パネルの `createGridDocument` であり、この生成は既存メッシュの上に海岸・河川・城壁・街路・地区を書き、一般住居・路地は描画時に導出する。城郭の内部配置、墓地、船は別途文書に保存する。

関連: 操作の概要は [random-generation.md](random-generation.md)。地区キャッシュと農地は [generation-phase3.md](generation-phase3.md)。

## 生成の入口

| 操作 | UI | 実行 |
| --- | --- | --- |
| 🏘 都市を一括生成、🎲 新しい都市、共有リンクの復元 | `runCompleteGeneration` | `startCityGeneration` → worker `generationWorker.ts` → `generateCityOnDocument`。Worker が無い環境は同じ関数を同期実行 |
| 工程スライダ ①〜⑩ | `runGenerationStage` | 同じシードの完成結果が既にあるときはそれを複製する。無いときは `generateStageOnDocument` |
| ◀ / ▶ | `runStep` → `STEP_FNS` | ①〜⑥だけループを1反復ずつ見せる。⑦〜⑩は完成処理を1回呼ぶ |

一括生成が成功すると `appearance: "town"` の文書になり、スライダ表示は ⑨ に合わせる。一般住居のポリゴンは文書に保存しない。城の必須棟は `castles[].parts`、墓地は `cemeteries`、船は `elements` に保持する。`appearance === "town"` のとき `renderEditorSvg` が導出する。

この生成器の feature / 門 / 要素のidは `gc:` で始まる。墓地は別の `cemetery:*` IDを使う。再実行はロックされていない `gc:*` の feature / 門 / 要素と、ロックされていない面の地形・地区タグを消してから書き直す。手描きでロックしたものは残る。新しい城郭経路では、ロックされた城と手動の城、その所有城壁・城門・予約面も保護する。未ロックの生成城と防衛回路は作り直す。

シードは Generate パネルの値。一括生成は交差や外縁道路が足りない配置を、同じ設定・元の格子から最大 `COMPLETE_CITY_ATTEMPTS`（8）回試す。0 回目は要求シード、以降は `` `${seed}:junction-retry:${n}` ``。採用したシードは `generationSeed` に残る。

## 工程とデータの関係

①〜⑥は元の入力格子から `runPlan` をその段まで実行し、`applyPlan(..., complete=false)` で診断用の文書にする。平滑化・街区整流・町表示はしない。

⑦〜⑩はどれも `generateCityAttempt`（失敗時は `generateCityOnDocument` の再試行）で**完成都市まで計算してから**、残すフィールドと画面フラグだけを変える。⑦で計算を止めて⑧⑨を足す、という段差ではない。完成結果のキャッシュが無ければ、まず要求シードで `generateCityAttempt` を1回実行し、失敗したときに同じ要求シードから最大8案の一括生成を呼ぶ。したがってコアAPIの⑦〜⑩は最大9回の試行になり、最初の案を重複して評価する。

| 工程 | id | 文書に残るもの | 画面だけ変えるもの |
| --- | --- | --- | --- |
| ① 海岸線と海 | `coast` | 海面（`water: "sea"`） | — |
| ② 河川 | `river` | ① + `gc:river-*` | — |
| ③ 市街地コア | `urban` | ② + `buildable` / evolution の `settlement` | 市街地の色付け（`urbanCoreHighlight`） |
| ④ 城壁・門・城郭 | `walls` | ③ + `gc:wall-*`、門、広場・城・寺院・港の要素。`castles` / `defenseCircuits`（新経路）も保存。城の予約面と門の開口でメッシュが変わる | — |
| ⑤ 街路 | `streets` | ④ + `gc:road-*` / `gc:bridge-*` | — |
| ⑥ 地区割り当て | `wards` | ⑤ + `face.ward`。寺院位置・墓地を確定。道路沿い農地と港の船も追加 | — |
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
- 水域側のセルが `sea`。`classifyCoast` は `keepBorderConnectedSea` で地図枠につながる成分だけを残し、孤立した内陸の海を除く。
- `ocean` を別に保持し、文書の `coastalOceanFaceIds` に保存する。塩水海岸の農地・建物セットバックに使う。

`applyPlan` は該当面を `water: "sea"`、`elevation: 0`、`buildable: false` にし、未指定の水深を `depth: 3` m にする。◀▶ は `generateCoastWalkStep`。歩行の途中では海面を塗らず、点列を重ね描きする。

### ② 河川 — `walkRiver` → `classifyRiver`

各河川について `gen/riverPath.ts` の `walkRiver`（シード `` `${seed}:river:${i}` ``）。端点を地図枠または実際の海セルの頂点へ解決し、海に最初に接した位置で止める。海セルが0なら海岸ポリゴンを河口に使わず、枠から枠へ通す。自己折り返しを短絡し、先行する川の逆向き辺も禁止する。`fallback` の帯は採用せず、その川を省略する。

`riverPlacement` が `outside` / `outsideNear`、川が1本、都市城壁ありの3条件を満たすときは、**②で先に③相当の市街地と城壁予定線を計算**する。evolution の城壁インセットも先に反映し、予定線から `outside` は約2セル（許容1〜3）、`outsideNear` は約1.5セル（許容1〜2）離れた陸側コリドーを最大4方向試す。各方向は必要に応じて禁止帯を緩め最大8回取り直す。③ではこの市街地を再利用し、二重インセットはしない。複数河川・城壁なしなら通常の経路になる。距離は選択基準であり、満たさなければ必ず都市全体を落とす条件ではない。

続けて `classifyRiver` が左右の岸を付け、通常の③の洪水充填が川をまたがないために使う。`applyPlan` は生の `edgePoints` ではなく端点解決済みの `resolvedEdgePoints` を最寄り頂点へスナップし、`gc:river-*`（kind `river`）として載せる。川は頂点列が真実源。描画幅は平均の物理幅（最低6 m）で、完成表示のための倍率は掛けない。◀▶ は `generateRiverWalkStep`。

### ③ 市街地コア — `classifyUrban` → `splitUrbanCore`

`gen/classifyUrban.ts` の `classifyUrban`。海セルを除き、都市半径（城壁があるときは `urbanDiskRadiusMeters` で少し内側）までの面積で洪水充填する。道路方位の方向へ弱く引っ張る。`settings.urbanNPatches` があるときだけセル数で打ち切る。

`gen/settlementExtent.ts` の `splitUrbanCore` が、その充填を城壁内（`urban`）と城外居住帯（`residentialOutskirts`）に分ける。城壁が無いときは全域がコア。シェア未指定時の目安は Tiny / Small が 100%、Medium 45%、Large 20%。診断用③は `captureStages=true` で充填順を残す。

このあと、まだ工程 3 以上で川があるとき:

1. 仮文書に川とコアを書き、`resolveRiverBoundaryOverlaps`（`gen/resolveRiverOverlaps.ts`）。城壁が川辺と重なる箇所で対岸セルを割り、コア境界を陸側へずらす。面が増えたときだけメッシュを差し替える。
2. `evolutionWallInsetRings` が 1 以上なら `insetWalledCore`。Grid evolution の Tiny は城壁を 1 セル、Small は 1 または 2 セル内側へ寄せ、剥がしたセルは城外居住のまま残す。Bram はスポークが門に届かなくなるためインセットしない。Micro、Hex、Voronoi、Medium / Large、城壁シェアを 100% 未満で明示したときも端のまま。

`applyPlan` は都市と郊外を `buildable` にし、evolution では `settlement: "core" | "outskirts"` を付ける。◀▶ は `generateUrbanPatchStep`（川の面分割はせず、充填 1 セルずつ）。

### ④ 城壁・門・城郭

城郭の専用生成は実装済み。設計背景は [城郭生成と都市城壁の設計](castles-and-fortifications.md) を参照。`legacyCastles: true` のときだけ旧来の citadel 区画を使う。

計画側:

1. `componentBorderLoops` で都市成分の外周をメッシュ辺のまま辿る。
2. `placePrecincts`（`gen/interior.ts`）。広場を予約する。旧城郭経路では城もここで予約する。
3. 形態が circulade なら `planCirculadeLayout`、bram なら `planPolygonalCirculadeLayout`。既定の広場と寺院をその核に差し替える。
4. 新城郭経路は `placeCastleRegion`（`gen/castlePlacement.ts`）。水域・川・広場・ロック面を避け、位置（外縁 / 中央）、都市壁との関係（組込み / 独立）、形、面積を満たす城の予約面を作る。必要なら面を結合・分割し、セル番号と市街地・地区予約を再対応する。組込み城はコアへ追加して都市外周も再計算する。配置できなければ `castle-no-site`。保持する手動 / ロック城の予約面があるときは新しい城を追加しない。
5. `placeGates` → `markWaterGate`。城の予約面内とその境界10 m以内を避ける。門の上限は `maxWallGatesForExtent`。海を避ける設定では `markSeaSurroundedGates`。
6. circulade / bram は推奨方位に一番近い外周頂点へ門をスナップし、2 つ以上置ければそちらを採用する。

`applyPlan`（`program.walls` のとき壁を書く）:

1. `wall.coast` が `seaWall` と `opening` 以外で海を避けるときは、海に接する辺を城壁から外す（`splitDryWallRuns`）。`opening` は海側の壁を残し、`seaOpeningEdgeIds` で港側に約 16 m の開口を 1 つ空ける。
2. 残った連続辺を `gc:wall-*` にする。
3. `joinWallRiverCrossings` のあと `openWallRiverMouths`（`gateApproaches.ts`）。壁と川が同じ辺を共有している箇所を、中央付近の 1 頂点に寄せて十字交差にする。
4. 枠へつながる城外の陸面を探索し、計画上の門を、川・城の予約面の頂点を除く近い壁頂点から試す。`openBarrierPassage(..., "wall")` で 4 方向の開口を作り、`gc:gate-*` を追加する。城内と到達可能な城外の両方に腕が伸びる候補だけを採用し、門同士を `minGateSpacingMeters` 離す。開口中は城の頂点を一時固定する。外縁の 30% 以上が海のときは門予算を `round(計画数 × (1 − 海の割合))`、最低 1 にする。
5. 広場・城・寺院・港を `gc:plaza` などの要素にする。港要素は海セルに隣接する面を持つものだけ。寸法は `plazaFootprintMeters` / `templeFootprintMeters`（`gen/housing.ts`）。
6. `registerTownCircuit` で都市壁の内側の面を `defenseCircuits` に登録する。予定面のIDを保ち、新しく分割した面は位置で追加する。`installCastle` で城壁・所有城門・庭・必須棟を設置する。成立しなければ `castle-layout-too-small`。城門は `ownerCastleId` を持ち、都市門（`townGates`）と区別する。
7. `settings.moats` を未ロックの回路へ反映する。既定の幅は都市壁12 m、城8 m。未指定なら堀は追加しない。`MoatReservation` は回路の予約面の外側だけに堀を取り、共有壁では都市回路を優先する。

◀▶ は `generateGateStep`。壁・広場・城は最初から描き、門だけ増やす。

### ⑤ 街路

計画側 `buildStreets`（`gen/streets.ts`）がセルグラフ上で門ごとのアプローチを作る。海を避けて陸の門の過半数が道に乗らない、または外縁道路が `minExternalRoadsForExtent` に届かないときは、descriptor が無い場合に限り方位を引き直して最大 3 回やり直す（`synthSite` + `buildStreets`）。その後 `clipPolylinesToLand` と `remakeUnreachableLandGates`（`gen/plausibility.ts`）。

メッシュに載せるポリラインは、このあと門の数だけ `farNodeFor` → 門 に組み直す。診断用の工程 6 未満では城内道路は空のまま。工程 6 の診断では `plazaApproachPoint` による門→広場を足す。

完成生成は `generateCityAttempt` がこのポリラインをさらに差し替える（次節）。

`applyPlan`（工程 5 以上）:

1. 橋を許す川について、市街地に接する頂点で `openBarrierPassage(..., "river")` → `addBridge`。`gc:bridge-*` を置く。完成生成のevolutionで川幅がブロック寸法より大きいときは `addWideRiverBridge` と両岸アプローチを使う。両岸が陸で、壁辺を橋にしない。
2. 各門で再度 `openBarrierPassage(..., "wall")`。
3. 予備経路が門に届かないときは `connectDryCellInteriors`。
4. `completeRoadRouter` が開口後のメッシュで A*（`aStar`）し直す。川辺・壁辺・広場の内部辺・寺院の身廊に触れる辺、城の予約領域、門の橋以外で堀へ入る辺を禁じる。Bram は核の半径内の辺も禁じる（`bramRoadBanRadiusMeters`）。
5. 成功した辺列を `gc:road-*` にする。
6. 完成生成でdescriptorの道路が幅広い川を渡るときは、橋アプローチを経由する `gc:riverRoad-*` も試す。その後 `straightenBridges`。診断生成は `openGeneratedPassages` のあと、川を渡れなかった端を `longestUnbannedRun` で切り詰める。

`shortcutExteriorRoads` で城外道路を短絡する。枠への出口が使えないときは別の陸の枠頂点、広場の目標頂点が使えないときは同じ広場の別頂点を探索する。この後の検証では、城がある工程⑤以降に `finalizeCastles(..., true)` で城門から市街への支線と内部配置を確定し、失敗すると `castle-no-access`。

城外道路の短絡後、採用済みの生成都市門が壁の開口を持たない、または完成生成か工程6で道路との十字交差が無いときは、この文書は不採用（`unconnected-gates`）。完成生成では壁上の門以外に終わる道路端を切り、道路・門・隣接面の経路から届かない城外の住居地区をemptyへ戻す。evolutionは路地で到達できる郊外も保持する。最後に寺院移動 → 城の支線・内部確定 → `validate` → 墓地同期を行う。◀▶ は `generateRoadStep`。

### ⑥ 地区割り当て — `assignWards`

`gen/wards.ts` の `assignWards`。決定順は次のとおり。

1. 城 → `castle`、広場 → `market`
2. 港（`placeHarbor`）→ `harbor`
3. 既存の寺院、または `placeTemple` → `cathedral`
4. `placeCemetery` → `cemetery`。前近代は教会近傍を優先し、`preIndustrialEra` 以降の対象時代は城外を優先する。候補が無ければ省略
5. 門に触れる城内セルを確率で `gate`
6. 残りの城内を `fillInner`（混ぜて `rateLocation`）
7. 門に触れる城外セルを高い確率で `gate`
8. 郊外。城外居住帯は merchant / craftsmen。それ以外はコンパクトなら `farm`、そうでなければ `empty`
9. `pickShanty` で城外の仮設 `shanty`

`applyPlan` は `editorWard` で編集用の地区名にする。`market` / `castle` / `merchant` / `craftsmen` / `patriciate` / `harbor` / `park` / `farm` / `empty` はそのまま（`farm` は現在、格子種別でemptyへ変換しない）。`slum` と `gate` は `empty`、`cemetery` はそのまま。地区は開口による面分割の前に書き、子面に引き継ぐ。海に隣接しない `harbor` は `merchant` に戻す。`park` / `cemetery` と城の予約面は `buildable: false`。続けて `settleTempleOnDocument` が道路・川・壁・海岸・公園・墓地を避けて寺院を移す。置けなければ寺院要素を削除し、都市全体は不採用にしない。`syncDocumentCemeteries` で墓地を文書へ同期する。

完成生成は `applyPlan` の前に、`slum` / `gate` / `shanty` / `military` を `craftsmen` へ、`patriciate` / `administration` を `merchant` へ寄せる。診断用⑥はこの寄せをしない。`buildingPattern: "medieval"` は完成検証後に該当 merchant 面を `patriciate` へ戻す。

◀▶ は `generateWardStep`。同じ入力ではメッシュを再分割せず、決定順に `ward` を見せる。

## 完成都市 `generateCityOnDocument`

`generateCityAttempt` が 1 案。不採用ならシードを変えて最大 8 案。成功時、evolution で `fabric` がある場合は `fabric.generation` にアルゴリズム名 `castle-city-v1`（`legacyCastles` の旧経路は `evolution-city-v3`）、採用シード、設定、生成前の入力文書を入れる。次の一括生成はこの入力格子からやり直し、平滑化の繰り返しで町が縮むのを避ける。

1 案の順:

1. `prepareRun`
2. `runPlan(..., stageStep=6, complete=true)`
3. 城の配置に失敗していれば `castle-no-site` で不採用。その後、充填全体（`builtUp`。城壁内ではない）の面積が `πR² × MIN_SETTLEMENT_AREA_SHARE` 未満なら不採用（`urban-area-too-small`）
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
14. evolution のみ `connectUrbanRiverDistricts`（`gen/urbanBridges.ts`）。主要道から孤立した城内地区へ、橋を許す川に追加橋を試す。城の予約面は対象外。その後 `straightenGateCrossings(straightenBridges(...))`
15. `settleTempleOnDocument`
16. `finalizeCastles(..., false)` で仕上げ後の城の内部配置とメッシュを検証。失敗すると `castle-layout-too-small`。
17. 有効な堀があれば、全 road グループの各辺を道路半幅 + 1 mの余裕付き `MoatReservation` で検査。門の橋以外で重なれば `roads-in-moat`。
18. `explainGeneratedCrossingFailures`。不正な門・橋、外縁道路不足、evolution の自己交差面があれば不採用
19. layout・建物パターン・時代を保存。evolution のみ `createFabricPlan`（`gen/fabricDistricts.ts`）。地区の対応とパラメータを `fabric` に保存する。一般住居と路地の座標はここには入らない
20. `tagExternalGateRoads` → `cultivateRoadside` → `syncDocumentCemeteries` → `refreshCemeteryLayouts` → `spawnHarborShips`。城外道路の行き先、沿道農地、仕上げ後の墓地、港の船を確定する。

完成文書へ保存する時代の優先順は設定 → descriptor → 入力文書 → `ageOfExploration`。墓地の場所選びは `runPlan` でこの入力の時代を参照する。一方、`applyPlan` は入力文書の時代を引き継いだまま寺院・墓地を処理し、設定の時代を完成文書へ保存するのは交差検証後。その後に墓地を再同期・更新し、船を配置する。建物・港設備などの導出描画は完成文書の時代を使う。工程①〜⑥では設定の時代を文書へ保存する処理は無い。

### ⑦ 幾何平滑化で動く関数

`finishCityGeometry`（`gen/finishCityGeometry.ts`）は共有頂点を動かし、近傍の面に変位を伝える。辺の最短長、面の向きと面積、自己交差を見ながら進める。ロックされた頂点・辺・面、手描き経路、地図枠上の頂点は固定する。門と川が既に間隔を持っている壁辺では、その間隔を縮めない。道路と壁・川・墓地境界のクリアランスも維持する。最終的な十字交差は別途検証する。

この前後の整流:

| 関数 | いつ | 役割 |
| --- | --- | --- |
| `shortcutMajorRoads` | evolution、平滑化の前 | 主要道の短絡 |
| `rectifyHexBlocks` | 六角、平滑化の前 | 六角街区を整える |
| `finishCityGeometry` | `foldSmoothing` | 壁と街路の角を丸める |
| `straightenBridges` | 平滑化の直後、および追加橋の接続後・門の直角化の直前 | 橋の両隣頂点を川の法線へ寄せ、渡河を短い直交にする |
| `rectifyVoronoiBlocks` | Voronoi 系（六角でも evolution でもない） | 主要道を固定したまま内部の共有辺を整える |
| `straightenGateCrossings` | 最後の橋の直角化のあと | 門の腕を壁の法線へ寄せる。川の交差から出ている道路頂点は動かさず、反対側の腕を回す |

⑦の画面は、この結果から `appearance` と `fabric` を外したもの。メッシュと `gc:*` の壁・川・道路は見える。町の地色・住居・導出路地は出ない。

## ⑨ 住居・完成都市で描かれるもの

住居と街区の路地は `renderEditorSvg`（`render/svg.ts`）が、Select ツールかつ `appearance === "town"` で、メッシュ・格子・選択ラベルのオーバーレイを表示しないときに作る。編集用メッシュの辺には追加しない。

振り分け:

| 条件 | 関数 |
| --- | --- |
| `buildingPattern === "medieval"`、`fabric.version === 5`、`gridKind === "evolution"`、または layout が circulade / bram / classic | `buildBlockFabric`（`gen/blockInfill.ts`） |
| それ以外（典型は Voronoi の organic） | `buildCityBuildings`（`gen/buildingLots.ts`）→ 面ごとの `buildFaceLots` |

`buildCityBuildings` は medieval / fabric v5 / evolution / circulade / bram / classic では自分では置かず、`buildBlockFabric` に委譲する。

### `buildBlockFabric`

| layout | 呼ばれるもの |
| --- | --- |
| bram | `planPolygonalCirculadeLayout` → `buildPolygonalCirculadeFabric` が核。核の外は `buildLocalFabric(..., layout: "organic")`。核に入る建物と路地は捨てる |
| circulade | `buildCirculadeTownFabric` が核。`settlement === "outskirts"` は `buildLocalFabric` |
| organic / classic で `fabric` が無い | `buildLocalFabric`（シード `fabric-seed`） |
| organic / classic で `fabric` がある | `upgradeFabricPlan` → `resolveDistricts` → `districtDocument` で地区を描画用に結合し、`buildLocalFabric`。農地は `openFieldPlots`（畝はメッシュにしない） |

`buildingPattern` が medieval（または未指定で fabric v5）なら、旧経路の街区網に `buildMedievalFabric` で敷地・裏庭・パトリシアン住居・港設備などを重ねる。

旧経路の各枝は `finishFabric` で城予約・海岸農地を処理し、`relieveGatePlazaBuildings`（`gen/gatePlazaBuildings.ts`）を呼ぶ。門前の広場に被さる建物を退ける。路地が寺院の庭に触れるものは `laneHitsCivicLandmark` で落とす。さらに共通の `finishCoastalBuildings` で史跡の予約領域に合わせて住居を調整し、堀内の建物・農地・空地・水車小屋を除外、路地・敷地アクセスを堀の岸で切る。海岸では一般住居20 m、農地60 mのセットバックを使う（港などは例外）。水車は `buildWatermillPlan` で導出し、重なる通常住居を除く。

### `buildLocalFabric`（`gen/localInfill.ts`）

主要道の間口を起点に隣接面への路地入口を伝播し、城内の孤立した区画にも追加の入口を試す。壁とロック境界を越える入口は作らない。新しい城の予約面は通常の住居充填から除く。その後、面ごとにキャッシュ（最大256）を見て、ミスした面だけ埋める。

- 城内の organic は `buildPerimeterBlocks` → `buildOrganicBlocks` → `frontageBuildings`
- classic は `buildPerimeterBlocks` がボロノイ近傍の街区を自分で切り、同じく `frontageBuildings`
- 郊外と旧経路の `castle` は `fillPolygon` → `convexInfillParts` → `insetConvexKernel` → `infillOutskirts` または `infillCore`（`gen/streetGrowth.ts`）→ `frontageBuildings`
- 広場の面は、classic / circulade 以外で `buildPerimeterBlocks`

`frontageBuildings`（`gen/frontageBuildings.ts`）が道路に面した矩形の住居を置く。目標敷地面積は `dwellingLotArea`、街区の見開きは `intramuralBlockSpan`（`gen/housing.ts`）。

### ⑧と⑩の描画差

文書は⑨と同じで、フラグだけ違う。

- ⑧ `hideBuildings`: 住居の path を出さない。路地は細線の trail としても描く。
- ⑩ `hideStreetLines`: `outerWallRing` と `clipPolylineToExterior`（`concealStreets.ts`）で、外城壁の内側に入る道路を落とす。`ce-infill-lanes` も出さない。`gc:bridge-*` のメッシュ区間は町表示では描かず、`bridgeDecks`（`bridgeDeck.ts`）の橋面に置き換える。この橋面は⑩でも残る。川の中の道路は `roadRunsOutsideRivers` で岸までに切る。

城の専用棟、墓地の墓碑・アクセス、公園、農地の小屋、寺院のSVG、桟橋・貨物・船もそれぞれの描画経路で出す。史跡は既存の `landmarks` を尊重するが、一括生成が新しく史跡を選ぶ処理はない。`quality` が light / minimal のときは表示を簡略化するため、詳細の不足と生成案の不採用を区別する。

## 診断用 ◀ / ▶ と完成処理の差

| | ①〜⑥の工程ボタン | 一括生成・⑦〜⑩ |
| --- | --- | --- |
| 入口 | `generateStageOnDocument` → `runPlan` + `applyPlan(complete=false)` | `generateCityAttempt` |
| 再試行 | しない。失敗はその工程で終了（道路・川の内部再試行はある） | 一括生成は最大8案。キャッシュなしの⑦〜⑩は先行1案 + 最大8案 |
| 平滑化・整流 | しない | `finishCityGeometry` ほか上の表 |
| 橋 | `openGeneratedPassages`。渡れない端は切り詰める | `addBridge` のあと `straightenBridges` |
| 地区名 | `editorWard` のまま | 完成前に craftsmen / merchant へ寄せる |
| `appearance` / `fabric` | 付けない | 付ける。⑦の表示だけ外す |
| 住居 | 描かない | ⑨⑩で導出描画。⑧は路地のみ |

## 不採用になる条件

`generateCityAttempt` / `applyPlan` が `null` を返す主な理由。

| 理由 | 箇所 |
| --- | --- |
| 面が3未満 | `too-few-faces`（`prepare`） |
| 城の配置場所が無い | `castle-no-site`（`castle`） |
| 城の門・庭・必須棟、または仕上げ後の形状が成立しない | `castle-layout-too-small`（`castle`） |
| 城門から市街への支線・城内部の確定に失敗 | `castle-no-access`（`castle`） |
| 仕上げ後の道路が門の橋以外で堀に入る | `roads-in-moat`（`street-plan`） |
| 市街地面積が下限未満 | `urban-area-too-small` |
| 仕上げ前または仕上げ後の外縁道路が不足 | `too-few-external-roads` |
| 門が壁を貫通していない、または道路と十字になっていない | `unconnected-gates` |
| メッシュ検証エラー | `invalid-mesh`（`validate`） |
| 門・橋の交差が不正 | `invalid-crossings` |
| evolution の面が自己交差 | `self-intersecting-faces` |
| 8 案とも不採用 | `all-attempts-rejected` |

進捗ラベルは `generationPhaseLabel`（`generationDiagnostics.ts`）。準備、地形、市街地、城壁・門、街道・橋、都市の構成、形状の仕上げ、交差の検証、メッシュ検証、にまとめて表示する。

多角形で定義する広場（`faceIds` が空）への城内道路は、最寄り頂点への経路が遮断された場合、広場の別の角に近い頂点も接続先として探索する。寺院などの通行禁止制約や門の十字交差条件は維持する。

城外道路は、予定方位の地図端に接続できなければ他の地図端頂点も探索する。それでも接続できず、町の城壁が閉じた回路である場合は、現在のメッシュで城壁を越えずに地図枠から到達できる面を城外として再探索する。開口・壁形状の変更前の都市セル分類が残り、実際は城外にある辺を禁止してしまう場合の救済である。既に成功した経路、城内道路、開いた海岸城壁の扱いは保持し、川・壁・海・城・堀などの通行制約も維持する。

Bramの門から城内への道路は、中心部の外側で止める。最寄り頂点への接続が失敗した場合は、予定接続先から1区画サイズ以内の、中心部の道路禁止半径外にある頂点を代替接続先として探索する。最寄り頂点へのスナップが禁止領域へ入ることで経路を失う問題を避け、各辺の通行制約は変更しない。

## 失敗プレビュー（デバッグオプション）

Generateパネルの「デバッグ：生成失敗の途中図を表示」は既定でOFF。有効時は要求シードの最初の案だけを試し、最初の失敗時点で再試行を止める。その時点のメッシュ・海・川・壁・道路・施設を編集可能な文書として採用して表示する。工程スライダーからの生成失敗にも適用する。最初の案が成功したときは通常の完成都市を表示する。工程⑦〜⑩の失敗後の一括生成へのフォールバックも行わない。OFF時は従来どおり最大8案を試す。

`generateCityOnDocument` / `generateCityAttempt` / `generateStageOnDocument` の任意の `onRejected` コールバックを渡すとデバッグモードとなり、再試行せず、`GenerationDebugPreview` を受け取る。`applyPlan` 内の失敗はその場の途中文書、幾何仕上げ後の失敗は仕上げた文書を複製する。城配置・市街地面積など、書込み前の失敗では、すでに得た計画から地形・市街地・予定城壁・施設の途中図を作り、生成をやり直さない。

失敗プレビューの表示中は、ツールバーの「Export city map as SVG」から失敗時点の途中図をSVGへ書き出せる。強調表示を含む全体図を出力し、画面の移動・拡大には依存しない。手動編集後は現在の文書の形状を書き出す（診断メタデータは失敗時点の記録）。ファイル名は `ce-generation-failure-日時.svg`。工程・理由・Seed・検証詳細もSVG内のメタデータに記録する。完成都市を採用できなくても、道路適用中の都市形態を途中文書へ記録し、SVGの `data-layout` に残す。Bramでは格子上の道路探索対象外となる中心部を淡色・破線の円で表示する（専用の中心部道路とは別）。

Workerはリクエストの `debugFailure` が有効なときだけスナップショットを採取し、最初の不採用時の `complete` 応答へ `failurePreview` を付ける。成功・キャンセル時には途中図を採用しない。同期実行も同じコールバックで扱う。

`generationDebug.ts` は検証の詳細に記録された門・頂点・辺・面・featureを強調対象へ変換する。赤は検証対象の具体的な位置、橙は位置を特定できない場合の関連領域。工程・reason・メッセージ・実行シードも表示する。`generationDebugSvg.ts` は不正メッシュでも描ける専用描画で、不正メッシュでは住居充填を避け、編集用の頂点・辺・面を表示する。整合性のあるメッシュは通常の編集描画に診断の強調を重ねる。途中文書は「生成失敗の途中図」としてUndo履歴へ追加し、保存文書として扱う。

ドラッグとホイールで移動・拡大できる。「失敗箇所の強調を閉じる」、Escape、オプションOFFは診断の強調だけを閉じ、都市は保持する。頂点の選択・Inspector表示・移動や道路・壁などの通常編集を続けられる。強調は失敗時点の診断で、自動的に再検証した結果ではない。Undoで編集を戻し、さらに「生成失敗の途中図」の前へ戻ると生成前の文書を復元する。位置が特定できない原因では、橙の領域を原因箇所と断定しない。Workerの例外や起動エラーなど、生成器が不採用スナップショットを返していないエラーはこのプレビューの対象外。

## ファイル対応

| ファイル | 役割 |
| --- | --- |
| `src/city-editor/ui/CityEditorPage.ts` | 一括生成、工程スライダ、⑧⑩の表示フラグ |
| `src/city-editor/core/generate.ts` | `GENERATION_STAGES`、`runPlan`、`applyPlan`、完成生成 |
| `src/city-editor/core/generationDebug.ts`、`render/generationDebugSvg.ts` | 不採用時点のスナップショット、検証対象の強調、編集可能な途中図 |
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
| `src/city-editor/core/castles.ts`、`fortifications.ts`、`gen/castlePlacement.ts`、`gen/castleLayout.ts` | ④の城予約、都市 / 城の防衛回路、城門・支線・内部配置 |
| `src/city-editor/core/moats.ts`、`render/svg.ts` | 外堀の予約と描画、門の橋 |
| `src/city-editor/core/gen/urbanBridges.ts` | 仕上げ後の城内孤立地区への追加橋 |
| `src/city-editor/core/gen/cemeteryLayout.ts`、`harborShips.ts`、`roadsideFarms.ts` | 墓地、船、沿道農地の保存 |
| `src/city-editor/core/gen/medievalFabric.ts`、`suburbanLanduse.ts`、`harborFabric.ts`、`parkFabric.ts`、`farmSheds.ts`、`watermillFabric.ts`、`landmarkIntegration.ts` | 建物パターン・時代別の導出物と史跡への調整 |
| `src/city-editor/core/gen/fabricDistricts.ts` | 完成時に保存する地区計画 |
| `src/city-editor/core/gen/blockInfill.ts`、`localInfill.ts`、`organicBlocks.ts`、`perimeterBlocks.ts`、`frontageBuildings.ts`、`streetGrowth.ts`、`buildingLots.ts`、`openField.ts` | ⑧⑨⑩の路地・住居・農地（描画時） |
| `src/city-editor/render/svg.ts`、`concealStreets.ts`、`bridgeDeck.ts` | 町表示、⑩の道路隠し、橋面 |

門の未接続エラーには、対応する城外道路・城内道路の探索記録を `failure.routing` として付ける。予定座標、スナップした経由頂点、採用経路の頂点・辺、失敗した各A*の始点・終点、到達頂点数、終点に最も近い到達可能頂点までの経路、到達領域の境界で禁止された辺と理由を保存する。別の地図端・広場頂点・スポーク端への再探索と、現在の城壁を基準にした再探索も別記録として残す。コンソールの構造化エラー、コピー用の生成失敗ログ、失敗SVGのメタデータへ出力する。探索成功後に門の交差が不正だった場合にも、成功した経路と検査時点の門に接する道路辺を出力する。

### 工程スライダーと履歴の再現性

①〜⑩は同じ生成元文書・Seed・設定から表示する。生成元はクローンで保持し、各工程と細分ステップもクローンを渡して再計算する。失敗図を表示しても、失敗途中で分割されたメッシュへ生成元を差し替えない。次の一括生成も、未編集の失敗図なら元の格子から再実行する。

生成に関係する履歴状態には、生成元、完成結果、Seed、設定、工程番号、細分ステップ、ハイライト、小道・建物の表示状態を対応付ける。Undo / Redo / Historyの移動時はそれらを一緒に復元する。途中工程には城郭がまだ存在しない場合があるため、堀設定を途中図の有無だけで上書きしない。履歴の分岐・編集・クリアには新しい状態キーを割り当て、別の履歴状態の生成元を使わない。完成結果の再利用は同じ設定の場合に限る。
