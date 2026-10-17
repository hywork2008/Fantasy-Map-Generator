# CE 3D の水面（陸と非陸の境界）

2026-10-17 設計。レビュー合意済み。Author: placeholder。

正本はこのファイル。`docs/plan/ce-3d-building-massing.md` には足さない。M0–M3 の建物・構造物は保存せず導出する、という決着を変えない。`docs/plan/CHANGELOG.md` の `2026-10-17` の節に 1 行を足してある。実装の PR 1 は分類子だけを足し、このファイルを作り直さない。

M4（LOD）・M5（FMG への配置）・M6（RE）はやらない。FMG のセル標高で地面を起伏させない。`src/utils/bridgeSkewPolicy.ts` は変えない。

## 1. 目的

CE の 3D で、陸とそうでない面の境が分かること。町は陸の上にあり、海・湖・水路・川は水面として見える。境界の幾何は、2D が既に塗っているものと同じ文書フィールドから、描画の直前に一度だけ導く。第二の海岸線は作らない。

2D は足りている。足りないのは 3D の地面円盤だけである（§2）。

## 2. 現状

| 項目 | 正本 | 2D | 3D（`mountCity3d`） |
| --- | --- | --- | --- |
| セルの水 | `FaceProperties.water`: `"land" \| "sea" \| "lake" \| "openWater"`（`src/city-editor/types/primitives.ts`） | 町表示の `ce-face--sea` と `ce-face--openWater` は `#456d7f`、`ce-face--lake` は `#527f8b`（`index.html` 20–21 行、`standaloneSvg.ts` の `STANDALONE_SVG_STYLE`）。クラスは `properties.water` | 塗らない |
| 塩水の岸 | `CityDocument.coastalOceanFaceIds`。`applyTerrain` が `plan.ocean` だけを入れる。`plan.ocean` は `kind === "ocean"` のセル（`coast.ts`） | `oceanShoreSegments` と `renderCoastalShore`。浜・護岸・城岸は陸側の帯。港区（`ward === "harbor"`）は帯を描かない。リストが空なら浜は無い | 塗らない。3D の塗りはリストを見ない（§5） |
| メッシュの外の海 | `regionalWaterAreas`。描画は `regionalCoastalWaterPolygons`（メッシュ外形を引いた凸断片） | `ce-regional-coastal-water` を `ce-face--sea` で塗る | 塗らない |
| フレーム上の島・湖・地図外 | `regionalSurface`。2D は `regionalSurfaceLayers` | 水は `ce-face--sea`（`editorSvg.ts` の `data-regional-surface="water"`）。陸は町なら地面色、`unknown` は `#cfcdc6` | 塗らない。3D は `regionalSurfaceLayers` を呼ばない（§8.3） |
| 広い川 | `waterAreas: { kind: "river"; polygon }[]`。生成は `plan.channelPolygons` | `waterPolygons` 経由で `ce-face--sea`。対岸は陸のまま | 塗らない |
| 測量済み水面 | `importedFixedCrossings` → `fixedWaterPolygons` | 同じ `waterPolygons`。島は even/odd で陸 | 塗らない |
| 細い川 | `featureGroups` の `kind: "river"`。中心線は頂点列、全幅は `style.widthMeters` | ストローク `#527f8b`。橋は `drawableBridgeDecks` | 橋だけ。水面は無い |
| 地面 | CE ローカルは平坦 | セルの塗り | `ce-ground`: `CircleGeometry(max(20, frame.extentMeters), 64)`、`position.y = -0.2`、色 `0xd5cfbf`、X 軸に −90°。半径はフレーム半辺 `extentMeters / 2` の 2 倍。海も川も陸色で覆う |
| 建物の底 | `baseElevationMeters = 0` | — | 床は y = 0。円盤より 0.2 m 上 |
| 橋 | `bridgeDecks` のうち `withinBridgeSkewLimit` を満たすもの | 2D のデッキ | 底 y = 0.4、厚さ 0.55 m。上面は 0.95 m。欄干はそこから 0.9 m。M3 のまま |

生成の流れ（描画はこれを再実行しない）:

1. FMG は `collectWaterbody`（`pack.cells.haven` と描かれた岸。湖は `feature.type === "lake"`、それ以外は ocean）と `collectTerrain`（`pack.cells.h < 20` を `waterMask`）を descriptor に入れる。`collectRegionalSurface` は町自身の陸地と haven の水面を飛ばす。フレーム内の別の湖は `kind: "water"`。
2. スタンドアロンは `synthSite` が同じ `BurgSiteDescriptor` を作る。`SiteConfig.coast === "none"` なら `waterbody` は null。川は `rivers`。
3. `siteToGeography`（`src/city-editor/generators/site/siteInput.ts`）が廊下と `channels` にする。広い川・河川港・メッシュの外の測量川はストロークにしない。対岸は陸。測量済みの左右岸（`unresolved` でも `snappedToBank` でもない経路、`buildChannels` 547–590 行）は原点を検査せず環を返す。原点を含む環を捨てるのは、未解決またはスナップしたフォールバックだけ（同 616 行の `pointInPolygon([0, 0], polygon)`）。測量済みの環が原点を覆っていても、2D の `waterPolygons` はそれを塗る。
4. `planCoast` → `applyTerrain` が文書へ書く。`plan.sea` のセルはすべて `water: "sea"`、`elevation: 0`（`terrain.ts`）。`coastalOceanFaceIds` は `plan.ocean` のうち、実際に `"sea"` になった面だけ。湖の haven は面が `"sea"` で、塩水リストは `[]`。`planCoast` が地域水面へ閉じるとき飛ばすのは `kind === "river"` だけなので、湖の岸も `regionalWaterAreas` に入る。水路に完全に入ったセルも `"sea"` になるが、水面の正本は `waterAreas` のポリゴンである（部分セルは陸のまま。`cellInsideWater`）。

descriptor の `waterbody`、`terrain.heightfield`、`riverFlows`、銀行ポリラインは描画に使わない。`riverFlows` は落差の向きであり、川筋ではない。川筋は文書の `RiverGroup.vertices` である。古い合成川が反対側に乗っている問題は生成の不具合であり、この設計では直さない。文書にある筋を描く。

`documentWaterTest` / `polygonHitsDocumentWater` は不正な測量水面で `RangeError` を投げる。配置を止めるためのもので、描画から呼んではならない。

`src/city3d/` と `src/city-editor/renderers/cityView.ts` の `mountCity3d` はこのチェックアウトにある。円盤は `CircleGeometry(Math.max(20, frame.extentMeters), 64)`（初回のメッシュは半径 20）、`position.y = -0.2`、`rotation.x = -π/2`、色 `0xd5cfbf`。クリア色は `0xc5c5bf`。カメラは `maxPolarAngle = π/2 - 0.05`。`sync` は `viewport.hidden` または破棄済みで戻り、そうでなければ `buildBlockFabric` の参照が `built` と同じなら戻る。閉じるときはシーンを破棄しない。W2 はこの `sync` に §9 の順序を入れる。

## 3. 範囲

### ゴール

- 描画時の分類子を 1 つにする。入力は `CityDocument`。出力は水面パーツ。各パーツは、水面・岸の湿潤判定・陸の穴が共有する `polygon` を持つ。
- 3D に水面と、水面をくりぬいた陸を出す。水は陸より少し下。建物の `baseElevationMeters` は 0 のまま。
- 橋のデッキは水面より上。位置・幅・斜角判定は M3 のまま。

### やらないこと

- `CityDocument.version` を上げない。フィールドを足さない。メッシュを保存しない。massing も保存しない。
- 2D の塗り・浜・護岸・港・桟橋・船・堀を変えない。`dryRuns` の述語も差し替えない。分類子は 2D の入力を写す。
- 堀、広場、坂、星形要塞の斜面、埠頭、桟橋、船を 3D に足さない。堀は M3 と同じく対象外。`defenseCircuits[].moat` は `WaterKind` ではない。
- FMG 世界地図と RE の描画を変えない。`pack.cells.h` を描画時に読まない。
- 川を引き直さない。幅を変えない。橋の斜角上限を変えない。`structureGeometry.ts` の private を export しない。

## 4. 分類子

モジュール: `src/city-editor/generators/townWater.ts`。three.js も DOM も import しない。`city3d` も import しない。

```ts
export type TownWaterKind = "ocean" | "lake" | "channel" | "river";

export interface TownWaterPart {
  kind: TownWaterKind;
  /** 水面・岸・陸の穴が共有する閉環。CE メートル。残った凸断片を 1 部品とする。 */
  polygon: Point[];
  /** river のみ。文書の中心線。上流→下流。被覆判定には使わない。 */
  centerline?: Point[];
  /** river のみ。全幅（m）。`riverRibbons` の width。 */
  widthMeters?: number;
}

export interface TownWater {
  /** 描く水面。 */
  parts: TownWaterPart[];
  /** 描かないが、手順 3 以降から引く環。原点を覆う帯と、三角化が空の環。 */
  reserved: Point[][];
  /**
   * 予約で水面から消えた sea / lake / openWater 面の三角形。
   * `townGroundPolygons` が `LAND_Y` の陸に足す。文書の `water` は変えない。
   */
  landRefill: Point[][];
}

/** 描画用。文書を変えない。投げない。 */
export function classifyTownWater(document: CityDocument): TownWater;

/** 中心線と全幅から、水面・岸・陸の穴が共有するマイター環。失敗は null。 */
export function riverRibbonRing(centerline: Point[], widthMeters: number): Point[] | null;

/**
 * `waterGeometry.ts` の private `wetInterior` と同じ。
 * 環の厳密な内部、または分解された部品の継ぎ目（周囲 1e-5 の四方がどれも水）。
 */
export function strictWet(point: Point, polygons: readonly Point[][]): boolean;

/** 水面を変えるフィールドの連結。幾何は作らない。 */
export function townWaterStamp(document: CityDocument): string;
```

`Point` は CE の `[x, y]`。SVG の Y 反転は使わない。

`Face.site` は任意フィールドで、生成器が `polygonCentroid` を入れることが多い。凹んだ面では面の外に出る。被覆判定に `site` も `polygonCentroid` も使わない。面は `facePoints` のポリゴン引き算で残す。

### 色と種類（この 1 規則）

3D の色は 2D の町クラスを写す。`coastalOceanFaceIds` では塗りを分けない。

| 入力 | kind | 色 | 2D |
| --- | --- | --- | --- |
| `water === "lake"` | `lake` | `0x527f8b` | `ce-face--lake`。生成はほぼ書かない |
| `water === "sea"` または `"openWater"` | `ocean` | `0x456d7f` | `ce-face--sea` / `ce-face--openWater`。塩水リストが空でも同じ |
| `regionalCoastalWaterPolygons` の断片 | `ocean` | `0x456d7f` | `ce-face--sea` |
| `regionalSurface` の `kind === "water"` の、メッシュ外断片 | `ocean` | `0x456d7f` | `ce-face--sea`（`editorSvg.ts`）。`ce-face--lake` ではない |
| `waterAreas` と `fixedWaterPolygons` | `channel` | `0x456d7f` | 連続水面の `ce-face--sea` |
| `riverRibbons` | `river` | `0x527f8b` | 町の川ストローク。面クラスではない |

塩水リストは 2D の浜（`renderCoastalShore` / `oceanShoreSegments`）だけが読む。3D は浜を描かない。

湖の haven の期待値: 面は `water: "sea"`、`coastalOceanFaceIds` は `[]`、`regionalCoastalWaterPolygons` が海を返し、haven 以外の `regionalSurface` の water 環がある。出る部品はすべて kind `ocean`、色 `0x456d7f`。kind `lake` は無い。内陸（海・湖・`openWater` の面が無く、地域水面も surface の水も無い）は ocean 部品が無い。

### 被覆順

先に採用した部品が勝つ。後の層は、描く部品と予約の両方を `subtractConvex(subject, reserved, 0.001)` で引く。第 3 引数の既定 `1`（`parcelGeometry.ts`）は使わない。`0.001` は `outsideMesh` と同じ。

描くことと予約することは分ける。予約は `parts` に入れない。後の層からは引く。

- 原点を含む帯または測量断片は描かない。環はそのまま `reserved` に入れる。2D は塗る。3D は町の中心を水面にしない。
- `triangularInfillParts` が `[]` の環も描かない。同じ環を `reserved` に入れる。耳が取れないと `[]` を返し、投げない（`lotGeometry.ts`）。
- 予約が凸断片に割れるときは、その断片を `subtractConvex(..., 0.001)` で引く。割れない予約は、後の対象を先に三角形にし、3 頂点すべてが生の環の中にある三角形だけを水面から外す。
- `landRefill` は、手順 3 の sea / lake / openWater 面のうち、手順 1–2 の予約で消えた領域だけである。描いている帯や川と重なる部分は水面のまま残し、陸には足さない。文書の `water` は `"land"` に書かない。手順 4 で予約した川環は描かない。その環は sea 面を陸に書き戻さない。
- 頂点 3 未満、または非有限の環は描かず、予約にもしない。

`dryRuns` で中心線を切ってからオフセットしない。マイターと端のキャップが先の水面に被る。環を作ってから引く。

1. **帯。** `document.waterAreas` の各 `polygon`。原点を含む環と、三角化が `[]` の環は `reserved`。それ以外は、先の帯と先の予約を引いた残りが kind `channel`。測量済みの環は文書に残ることがある。
2. **測量水面。** `importedFixedCrossings` が無いなら空。あるなら `fixedWaterPolygons` の戻り（even/odd 済みの断片）を使う。生のリングは使わない。関数が投げたら測量分だけ空にする。`documentWaterTest` は呼ばない。原点を含む断片と、三角化が `[]` の断片は `reserved`。手順 1 の部品と予約を引いた残りが kind `channel`。
3. **メッシュの水面セル。** `water` が `"sea"`、`"lake"`、`"openWater"` の面。`polygon` は `facePoints`。頂点 3 未満か非有限なら捨てる。手順 1–2 の部品と、手順 1–2 の予約を引いた残りを出す。消えた領域のうち、その手順 1–2 の予約の内側は `landRefill`。手順 4 以降の予約はここに入らない。kind は上の表（面の `water` 文字列だけ）。重心では落とさない。塩水リストでは分けない。原点が面の中にあっても、その点を覆う手順 1–2 の予約が無ければ面は残す。その予約が面を全部覆うときだけ、その面は部品に出ない。
4. **川。** `riverRibbons(document)`。頂点 2 未満のグループはそこが既に落とす。`width` は `max(1, style.widthMeters)`。`riverRibbonRing(points, width)` が null ならその run だけ捨てる。環の三角化が `[]` なら `reserved`。そうでなければ手順 1–3 の部品と予約を引いた残りが kind `river`。`centerline` と `widthMeters` はメタデータとして残す。被覆と陸の穴は `polygon` だけを見る。
5. **メッシュ外の海。** `regionalCoastalWaterPolygons(document)` の戻り。生の `regionalWaterAreas` はメッシュを覆うのでメッシュへは渡さない。頂点が無いメッシュでは `[]`。原点を含む断片と、三角化が `[]` の断片は `reserved`。引くものは、手順 1–4 の部品と予約、および §8.3 の surface 陸断片と水断片である。陸断片は湖を抜く前の島全体（手順 6 の後で陸から水を引く）。kind `ocean`。
6. **メッシュ外の surface の水。** §8.3 の作り直しで得た water 断片。手順 1–4 の部品と予約だけを引く（手順 5 は既にこの足跡を空けてある）。原点を含む断片と、三角化が `[]` の断片は `reserved`。残りは kind `ocean`、色 `0x456d7f`。

同じ点を二枚が覆わない。W0 がそのサンプルを持つ（§11）。「帯と川を重ねない」はこのテストが通ることを指す。

呼ばないもの: `documentWaterTest`、`siteToGeography`、`classifyCoast`、`fabric.generation.settings.descriptor`、`riverFlows`、`terrain.heightfield.waterMask`、`regionalSurfaceLayers`、`dryRuns`。CE の中で FMG の海セルと面が食い違っていても、勝つのは文書である。descriptor は生成入力であり、保存された町にもスタンドアロンの町にも、描画時には無いことがある。

海ブラシ（`brushes.ts` の tool `"sea"`）は `water = "sea"` と `elevation = 0` にするだけで `coastalOceanFaceIds` を更新しない。その面は `"sea"` なので kind `ocean`。ブラシの分類は変えない。3D を開いたままの更新は §9。

### `riverRibbonRing`

`townWater.ts` に置く。水面の環の所有者はこれだけである。`structureGeometry.ts` は import しない。private の `offsetSide` と `segmentNormals` は export しない。式は `offsetSide`（`structureGeometry.ts`）と同じ退化を写す。`wallSvg.ts` のオフセットは町の中心で向きを決めるので使わない。

片側は `offsetSide` と同じ手順で、距離 `distance` の点列を返す。`null` になるのは頂点 2 未満、`Math.abs(distance) > 0` でない、非有限、または閉じた重複を外して 2 点未満のときだけである。

- 始点と終点の距離が `0.05` 未満で頂点が 4 以上なら閉じた線とする。閉じた線は末尾の重複を外す。
- 節の長さが `1e-6` 未満なら法線は `[0, 1]`。それ以外は `(-dy, dx) / hypot`。短い節でも run は捨てない。
- 頂点のマイターは両隣の法線の和。長さが `1e-6` 未満（180° の折り返し）なら、和を正規化せず隣の 1 法線を使う。run は捨てない。
- `denom` はマイターと次の法線の内積。`Math.abs(denom) < 0.25` ならスケールは `distance / 0.25`。そうでなければ `distance / denom`。結果は `±4 * Math.abs(distance)` に挟む。

`riverRibbonRing` は半幅 `half = widthMeters / 2` で左側（`+half`）と右側（`-half`）を作り、左側の順と右側の逆順をつないだ 1 つの閉環を返す。どちらかが `null`、または長さが違う、または 2 点未満なら環は `null`。

直線 `(0,0)–(10,0)`、全幅 4 の環は、幅 4 の長方形（許容 `1e-6`）。折り返す中心線も `null` にしない。

橋のデッキは M3 の `extrudeRibbon` のまま。水面の環とデッキを 1 つの private 関数にはまとめない。

### `strictWet`

`src/city-editor/generators/waterGeometry.ts` の private `wetInterior` を写す。`interior`（`pointInPolygon` かつ環まで `1e-6` より遠い）だけでは、分解の継ぎ目に乗った点が乾く。`wetInterior` はそれに加え、距離 `1e-6` 以内の環が 2 つ以上あり、`(±1e-5, 0)` と `(0, ±1e-5)` の四点がそれぞれどれかの環の中なら水とする。`strictWet` はその両方を持つ。`dryRuns` は private `wetInterior` のままにする。2D の水路分割は変えない。

## 5. 何を描くか

| ケース | 3D | 幾何 | 色 |
| --- | --- | --- | --- |
| 町の川ストローク | 入れる | `polygon` は `riverRibbonRing` から先の水面を引いた残り。中心線と幅はメタデータ | `0x527f8b` |
| 広い川の帯 | 入れる | 手順 1–2 で描く断片。原点を覆う環と三角化が空の環は描かず `reserved`。その下の sea / lake / openWater 面は `landRefill` | `0x456d7f` |
| 海セルと海岸 | 入れる | `"sea"` と `"openWater"` の面（塩水リストは見ない）と `regionalCoastalWaterPolygons`。海岸は面と陸の共有辺。浜の 34 m 帯は 2D の陸の装飾 | `0x456d7f` |
| 手編集の湖セル | 入れる | `water === "lake"` だけ | `0x527f8b`（`ce-face--lake`） |
| 生成された湖、surface の水 | 入れる | 湖の haven の `"sea"` 面、地域海、surface の water 断片 | `0x456d7f`（`ce-face--sea`） |
| 堀 | 出さない | `moatSvg` の壁オフセット。M3 と同じ | — |
| 港・埠頭・桟橋・船 | 出さない | 2D の `quaySvg`（`ce-pier`）と `shipSvg` のまま。港区の面は陸。隣の `"sea"` 面は手順 3 の水面 | — |

## 6. 情景

分類子は海岸の形を知らない。`synthSite` の `"cape"` も `"bay"` も、生成後は面と `regionalWaterAreas` だけが残る。

| 町 | 文書 | 3D |
| --- | --- | --- |
| 岬 | 水側の `"sea"` が `coastalOceanFaceIds` に入る。陸が水へ突き出す | 海面は塩水面とメッシュ外の海。岬のセルは陸。色は `0x456d7f` |
| 湾 | 同じ。海面が陸へ入り込む | 湾のセルが水面。生成は原点が濡れる岸を捨てるか反転する（`planCoast` の `wetsOrigin`）。原点を含む地域海の断片は手順 5 で捨てる |
| 河口 | 塩水面と、川または帯 | 帯と面が先。川の環はそれらを引いた残り。口は一続きで、サンプルは 1 枚だけに入る |
| 内陸 | `coastalOceanFaceIds` は `[]`（`generate.test.ts` の landlocked）。海面も地域水面も無い | ocean 部品は無い。陸がフレームを埋める |
| 湖の haven | 面は `"sea"`、塩水リストは `[]`、地域海があり、haven 以外の surface の水があり得る | メッシュの中も外も kind `ocean`、`0x456d7f`。kind `lake` は無い |
| 川が無い | `river` グループも `waterAreas` も無い | 川部品は無い |

いずれでも建物は y = 0 のまま、水面より上に残る。

## 7. 高さ

CE の地面は平らなまま。FMG の標高は使わない。

| 記号 | Y | 意味 |
| --- | --- | --- |
| `LAND_Y` | −0.2 | 今の `ce-ground.position.y`。建物の床（y = 0）との 0.2 m を崩さない |
| `WATER_Y` | −0.55 | 陸より 0.35 m 下。境は色で分かり、段差は寄ったときの岸 |
| 橋の底 | 0.4 | M3 のまま。水面からデッキ下面まで 0.95 m。上面は 0.95 m、欄干はその上 0.9 m |

`baseElevationMeters` は建物も橋も変えない。水面に厚みは無い。底面キャップは作らない。

定数は `src/city3d/core/waterGeometry.ts` に置く。three.js は import しない。PR 2 は、既存の `src/city3d/core/`（`structureGeometry.ts` がある）の隣にこのファイルを足す。

## 8. 幾何

座標: three の X = CE の x、Y = 高さ、Z = CE の y。

### 8.1 誰が環を持つか

| 関数 | 場所 | 役割 |
| --- | --- | --- |
| `riverRibbonRing` | `townWater.ts` | 川の環を 1 つ作る |
| `classifyTownWater` | `townWater.ts` | その環を引き算し、全部品の `polygon` に残す |
| `townWaterTriangles` | `townWater.ts` | 描く `parts` だけを `triangularInfillParts` で 3 点環にする。`[]` の環は `reserved` に残り、水面には出ない |
| `townGroundPolygons` | `townWater.ts` | 陸面の穴、surface の陸の残り、`landRefill` を返す |
| `strictWet` | `townWater.ts` | 岸と被覆テストの湿潤判定 |
| `waterSurfaceGeometry` | `src/city3d/core/waterGeometry.ts` | 渡された 3 点環を `WATER_Y` に置き、法線を上へ向ける。岸の四辺を出す |

`waterSurfaceGeometry` は `triangularInfillParts` を import しない。中心線から四辺形を作らない。未分割の環は受け取らない。引数は次の 3 つだけである。

- `triangles: Point[][]`。各環は長さ 3。
- `boundaries: Point[][]`。`parts` の `polygon`。スカートの辺はここ。三角分割の内部辺には岸を立てない。
- `isWet: (point: Point) => boolean`。呼び出し側が `strictWet` をこれらの `polygon` に束縛して渡す。`waterGeometry.ts` は `townWater.ts` を import しない（`city3d/core` の本番モジュールは city-editor の型を import し、生成器は import しない）。

法線は `(0, 1, 0)`。計算した ny が負なら頂点を入れ替えて上を向ける。CE の CCW 環を `(x, WATER_Y, z = y)` に置くと ny は負になる。入れ替えで直す。面積が `1e-4` 未満、または長さが `1e-8` 未満の三角形は捨てる。

材質は `FrontSide`。カメラは `maxPolarAngle = π/2 - 0.05` で上から見る。閉じた立体にはしない。

### 8.2 岸の段

スカートを立てる辺は `boundaries` の辺だけ。

- 辺の中点から他の出た環までの距離が `1e-6` 以下なら、共有辺なのでスカートは出さない。
- それ以外は、左法線 `(-dy, dx)` を `waterGeometry.ts` に書き、中点から ±`BANK_TEST_METERS = 0.25` を `isWet` で見る。`segmentNormals` は import しない。
- 一方が水でもう一方が乾いているときだけ、`WATER_Y` から `LAND_Y` までの四辺を出す。法線は水平で、乾いた側を向く。
- 分解の継ぎ目に落ちた 0.25 m のサンプルは、`strictWet` の継ぎ目節が水とみなす。継ぎ目でない穴は乾いたまま。
- 両方乾いている辺には出さない。
- 地域海と塩水面が辺を共有するなら共有辺規則でスカートは 1 枚も出ない。共有していない食い違いにスカートが残っても、メッシュは溶接しない。
- 見える境は色である。0.35 m の段は寄ったときに岸として見える。

スカートは `DoubleSide`。上面は `FrontSide` のまま。

### 8.3 陸

`townGroundPolygons(document, water): { land: Point[][]; unknown: Point[][] }`。戻りは 3 点の三角形。Y は付けない。

メッシュの陸（`water === "land"` の面）:

- 引くのは、描いた `parts` のうち kind が `channel` または `river` の `polygon` だけである。`water.reserved` は渡さない。海面と湖面は隣の面なので引かない。共有辺を削らない。
- 面を `triangularInfillParts` し、上の描いた環と重なる部分を `subtractConvex(..., 0.001)` で引く。バウンディングボックスが離れていればスキップする。
- 結果が空なら、その面は水の下なので陸に出さない。
- 引くポリゴンが無い面は `facePoints` を三角化する。`[]` ならその面を捨てる。
- `landRefill` の三角形を陸に足す。これは手順 3 の sea / lake / openWater 面のうち、手順 1–2 の予約で消えた領域だけである。手順 4 の川の予約は陸の穴にも `landRefill` にも入らない。隣の陸面から海を引いたものではない。文書の `water` は変えない。足さないと、その穴はクリア色 `0xc5c5bf` になり、陸色 `0xd5cfbf` にならない。

メッシュの外。メッシュが受け取るのは、既に外形を引いた凸断片である。生の `regionalSurface.features[].ring` と `unknown` は町を覆うので、メッシュへは渡さない。

`regionalSurfaceLayers` は文書オブジェクトの `WeakMap` に最初の結果を残し、インプレース編集を見ない（`regionalCoast.ts` 147–159 行）。`regionalCoastalWaterPolygons` は `sameCoast` で無効化する。3D は `regionalSurfaceLayers` を呼ばない。

surface の断片は、private `outsideMesh` と同じ手順を `townWater.ts` に写してその場で作る。`outsideMesh` は export しない。

頂点が 1 つも無い、または `boundaryRings` が `[]`（`fortifications.ts` は周回が切れると `[]` を返す）、または絶対面積最大の環が無いときは、外の陸・水・unknown は `[]` である。核が無いときに feature 環の三角化をそのまま返さない。

核があるとき:

1. その環を核にする。
2. 核を `convexInfillParts` する。
3. 各 feature の `ring` と各 `unknown` 環を `triangularInfillParts` する。
4. 各断片から各核を `subtractConvex(part, corePart, 0.001)` で引く。

この時点の land 断片は、島の上の湖をまだ抜いていない。手順 5 が地域海から引くのは、この抜く前の陸と、水断片である。海の穴は島全体になる。

手順 6 の水面を出したあと、その水断片を land 断片から `subtractConvex(..., 0.001)` で引き、残りだけを外の陸として出す。手順 5 より前に島から湖を抜かない。

unknown 断片は `0xcfcdc6`。`regionalSurface` が無い町は unknown が空。

フレーム正方形（`half = frame.extentMeters / 2`）を使うのは次の 2 つだけ。

- メッシュの外で、surface の断片が覆わない部分。核と、出た水面を引いた残りを町の陸色にする。
- 面が 1 つも無いとき。陸はフレーム正方形から出た水面を引いたもの。それも失敗したら陸は空。ビューアは円盤を残し、水面は出さない。

面がある通常の町で陸の三角形が 1 枚でもあれば円盤は出さない。陸が作れなければ円盤を残し、水は描かない。

建物の床とは Y が違うので、同一平面のちらつきは起きない。

## 9. ビューア

`src/city3d/three/waterMeshes.ts` が soup を `MeshLambertMaterial` にする。`mountCity3d` の `rebuild` から呼ぶ。WebGL は初回オープンまで作らない。

| メッシュ | 名前 | 拾うか |
| --- | --- | --- |
| 陸 | `ce-land` | 拾わない |
| 地図外 | `ce-unknown` | 拾わない |
| 水面の親 | `ce-water`。`Object3D`。分類のあと、`parts` が空でも必ずシーンに足す。子が 0 でも残す | 拾わない |
| 水面 | 親の子。`ce-water-ocean`、`ce-water-lake`、`ce-water-channel`、`ce-water-river`。空の種類は作らない | 拾わない |
| 岸 | `ce-bank` | 拾わない |

種類ごとの子の名前は `getObjectByName` が区別できる。用意ができたかどうかは親 `ce-water` があるかで見る。子が全部無いことは、まだ作っていないことと同じではない。

`Raycaster` の対象は massing と structures だけ。水メッシュは `pickables` に入れない。加えて `mesh.raycast = () => {}` とし、後からシーン全体を飛ばしても棟の読み上げにならない。ヒットが無ければ今どおり読み上げを消す。

陸が 1 三角形でもあれば `ce-ground` を外し、陸メッシュに替える。無ければ円盤を残し、水と岸は出さない。

作り直しは `tick` の中ではしない。パンやオービットでは `sync` を呼ばない。

`documentFabricFingerprint`（`blockInfill.ts`）は面の `water` と川の頂点数と `waterAreas` の本数を記録し、頂点座標、`coastalOceanFaceIds`、`waterAreas` の点、`regionalWaterAreas`、`regionalSurface`、`importedFixedCrossings` の環は記録しない。fabric 参照が同じままでも水面は変わる。

閉じるとき `setOpen(false)` は `viewport.hidden` を立て、フレームを止める。シーンも水面メッシュも破棄しない。水面は隠れたシーンに残る。

`sync` の順序:

1. ビューポートが隠れている、または破棄済みなら戻る。
2. 開いているあいだは、fabric 参照が同じでも `townWaterStamp(document)` を計算する。
3. 建物と構造は、fabric 参照が変わったときだけ作り直す。開くたびに `setOpen(true)` が `built = null` にしてから `sync` を呼ぶので、建物側はこの参照差で作り直す。水面を作る理由にはしない。
4. 水面・岸・陸は、スタンプが変わったとき、または親 `ce-water` がシーンに無いときに作り直す。親が無いときだけ、スタンプ文字列が前回と同じでも `stampChanged: true` とする。`ce-water-*` の子が 1 つも無いことは、この条件にしない。
5. 作り直しのあと、`parts` が空でも親 `ce-water` をシーンに足す。子は 0 でよい。これで内陸の町も、水が無くなった町も、次の `redrawMap` で用意済みになる。
6. fabric 参照が同じ、スタンプが同じ、親 `ce-water` がシーンにある、の 3 つが揃ったときだけ戻る。

`planCity3dRefresh({ fabricChanged, stampChanged, open })` を `waterMeshes.ts` に置く。`sync` はこれを見る。`open` が偽なら何も作らない。`buildings` は `fabricChanged`。`water` は `stampChanged`。`stampChanged` が真になるのは、スタンプ文字列が変わったときと、親 `ce-water` が無いときだけである。DOM も WebGL も無しでテストする。

スタンプは区切り文字で連結した文字列。座標は `0.01` m で丸める。総和や頂点数にはしない。

- `frame.extentMeters`
- 全フェイスの id、`properties.water`（`"sea"` / `"lake"` / `"openWater"` / `"land"`）、境界頂点の座標。陸面の頂点移動がパンチを変える。kind 文字列が変わるので、同じ文書オブジェクトの sea→lake でスタンプが変わる
- `waterAreas` と `regionalWaterAreas` の全座標
- `regionalSurface` の kind と環、および `unknown` の全座標。キャッシュではなく文書のフィールド
- 川グループの id、`style.widthMeters`、頂点座標
- `importedFixedCrossings` の `schemaVersion`、`revision`、各リングの全座標

`coastalOceanFaceIds` は入れない。3D の塗りはリストを見ない。浜は 2D のまま。

`patchFaceRender`（`mapDisplay.ts`）は 2D の 1 面を塗り替えるだけで `sync` を呼ばない。海ブラシは新しい `documentState` を書き、触った面を `patchFaceRender` し、`fixedCrossingApproaches !== undefined` のときだけ `scheduleRedraw` する（`brushes.ts`）。3D を開いたまま海を塗ると、交差が無い町では `redrawMap` が走らない。

W2 は、面を変えたブラシのストロークのあと `syncCity3d()` を 1 回呼ぶ。`CityEditorPage` がブラシ文脈へコールバックを渡す。`brushes.ts` はビューアを import しない。`patchFaceRender` は 2D のまま。3D が閉じているときは `sync` の手順 1 で戻る。

色は §5。頂点色は要らない。種類ごとに 1 マテリアル。

## 10. 失敗

| 入力 | 結果 |
| --- | --- |
| 海セルも地域水面も surface の水も無い | ocean 部品無し。陸だけ。親 `ce-water` は子 0 でシーンに残る。次の `redrawMap` では作り直さない。投げない |
| `coastalOceanFaceIds` が `[]` で `"sea"` 面がある | 浜は無い。面は kind `ocean`、色 `0x456d7f` |
| 川の頂点が 2 未満 | `riverRibbons` が落とす。部品無し |
| 測量済みで原点を覆う帯 | 文書に残る。2D は塗る。3D は描かず `reserved` に入れる。下の sea / lake / openWater 面は部品から外れ、`landRefill` が `LAND_Y` の陸になる。文書の `water` は `"sea"` のまま。再構成しない |
| 原点を含む海岸の面で、予約が覆っていない | 面は kind `ocean` のまま。原点を含むことだけでは捨てない |
| フォールバックが原点を覆う帯 | `buildChannels` が文書に入れない。3D も描かない |
| 原点を含む地域海の断片 | 描かず `reserved`。後の surface の水からは引く。建物は残る |
| 壊れた `importedFixedCrossings` | 測量分を空にする。`documentWaterTest` は呼ばないので投げない |
| `triangularInfillParts` が `[]` | 水面には出さない。環は `reserved`。`landRefill` になるのは、手順 1–2 のその予約が手順 3 の面から消した領域だけ。手順 4 で予約した川環は描かず、sea 面を陸に書き戻さない |
| 外形環が取れない、頂点が無い | 外の陸・水・unknown は `[]`。生の feature 環は出さない |
| 堀、壊された壁、新しい城 | 分類子は壁を見ない。`collectCityStructures` の結果は変えない |
| 面が 0 | §8.3。円盤の下に水を描かない |

水面は建物メッシュより下にある。建物を隠さない。

## 11. テスト

既存（2D と生成の固定。失敗させない）:

| ファイル | 見ているもの |
| --- | --- |
| `src/city-editor/renderers/svg.test.ts` の `"generated natural ocean shore"` | 浜、城岸、護岸、港区は帯なし、塩水リストが空なら浜なし、帯が浜に重ならない |
| `src/city-editor/generators/coastalSuitability.ts` の `oceanShoreSegments` | 塩水リストに入った `"sea"` と陸の共有辺 |
| `src/city-editor/generators/waterGeometry.test.ts` の `"continuous water geometry"` | 測量水面の島、岸、原点を覆わないこと |
| `src/city-editor/generators/regionalCoast.test.ts` の `"regional sea beyond the town mesh"` | メッシュ外の海。フィールドが無ければ海は無い |
| `src/city-editor/generators/bridgeDeck.test.ts` | 川リボンで道路を切ること。斜角超過のデッキは出さない |
| `src/city-editor/generators/generate.test.ts` | 塩水リストが湾で非空、内陸で `[]`。Shiqsh の帯が原点を含まない |
| `src/city-editor/generators/site/siteInput.test.ts` | `channels` が原点を含まない |
| `src/city-editor/renderers/structureMassing.test.ts` | 橋の `baseElevationMeters` が 0.4 |

追加は幾何と分類だけ。E2E も多シードも回さない。

`src/city-editor/generators/townWater.test.ts`（W0）:

- 湖の haven。面は `water: "sea"`、`coastalOceanFaceIds` は `[]`、地域海の断片、haven 以外の surface の water 環。出た部品はすべて kind `ocean`。kind `lake` は 0。色の対応は `0x456d7f`（テストは kind を見、色定数は §5 の表を 1 か所で参照する）。
- `water === "lake"` の面だけ kind `lake`。`openWater` は `ocean`。塩水リストの外の `"sea"` も `ocean`。
- 塩水リストに入った `"sea"` の `polygon` は、引き算が空でない限り `facePoints` から手順 1–2 を引いた残り。隣の陸面は部品に無い。
- 原点 `[0, 0]` を含む `waterAreas` の環は `parts` に無く、`reserved` にある。その環の下に `water: "sea"` の面があるとき、`[0, 0]` はどの水面部品にも入らず、`landRefill` の 3 点三角形に入る。`townGroundPolygons` の陸はその三角形をそのまま足す。文書の `water` は `"sea"` のまま。原点を含み、予約が覆わない別の海岸面は kind `ocean` の部品である。原点を含まない環は `channel`。これはフォールバック経路ではなく、文書に残った環へのテスト。
- 三角化が `[]` の帯も `reserved` に入り、その下の `[0, 0]` 相当の面内サンプルは水面部品に無く、`landRefill` にある。
- 他の水面に出会わない川は、`centerline` と `widthMeters` が `riverRibbons` と一致し、`polygon` が `riverRibbonRing` と一致する。頂点 1 つのグループは無い。直線の全幅 4 は幅 4 の長方形。長さ `1e-6` 未満の節、または 180° で折り返す中心線でも `riverRibbonRing` は `null` にしない。
- 他の水面に入る川は、先の層の `strictWet` が真のサンプルを自分の `polygon` に含まない。
- 被覆。次の 3 つで、0.5 m 格子のうち先の層の内部（境界から 0.002 m より内）にあるサンプルはちょうど 1 部品。2 部品に入るサンプルは 0。
  - 帯に重なり、帯の外まではみ出す測量断片。
  - 塩水面へ斜めに入る川。
  - 地域海の上にある沖の島。湖の点は水面部品にちょうど 1 つ入り、陸三角形には入らない。島の陸は手順 6 の水を `subtractConvex(..., 0.001)` で引いた残りである。
- `coastalOceanFaceIds` に入る面と陸の共有辺を、端点の非順序集合として `oceanShoreSegments` と比較する。配列の順序は比べない（メッシュの辺順と面の環順は違う）。リスト外の `"sea"` の辺はこの集合に入らない。その面はそれでも ocean 部品である。
- 有効な堀（`moat.enabled`）を付けても部品は増えない。
- 壊れた `importedFixedCrossings` でも投げず、面の部品は残る。
- 内陸（海面も帯も川も地域水面も無い）は `parts` が空。
- 同じ文書オブジェクトで `water` を `"sea"` から `"lake"` に変えると `townWaterStamp` が変わる。`waterAreas` の座標を変えても変わる。`coastalOceanFaceIds` だけを変えてもスタンプは変わらない。

`src/city3d/core/waterGeometry.test.ts`（W1）:

- 水面の全法線で `ny > 0.9`。下向きに入る環も上を向く。
- 1 点の川は三角形 0。`riverRibbonRing` が null の run も 0。
- 既知の陸点に対し、スカート法線の水平成分との内積が正。共有辺と継ぎ目にはスカートが無い。継ぎ目でない穴の縁にはスカートがある。
- 帯の中点は陸三角形に含まれない。帯の外の陸点は含まれる。穴に使う環は `riverRibbonRing` の、引き算後の `polygon`。
- 面積 `0.01` m² の残りは陸に残る（`minimumArea` を `0.001` で渡したとき）。既定の `1` では落ちるので、テストは `0.001` を明示した呼び出しを見る。
- 三角化に失敗する帯は水面三角形 0。その下の面は `landRefill` として陸に足し、描いた水面としては陸を削らない。
- 頂点が無いメッシュ、または `boundaryRings` が空の文書では、外の陸・水・unknown は 0 個。生の feature 環の三角形は出ない。
- 水面の Y は `WATER_Y` だけ。橋の数値は変えない（このテストは橋を作らない）。

`planCity3dRefresh` のテスト（W2、DOM なし）: `open` が偽なら何も作らない。fabric が同じでスタンプだけ変わったときは水面だけ。親 `ce-water` が無いときは、スタンプが一致していても呼び出し側が `stampChanged: true` を渡し、水面を作る。スタンプが同じ、親がある、水面部品が 0、のときは作り直さない。`ce-water-*` の子が無いことだけでは `stampChanged` を真にしない。`built` を消したこと自体は水面の入力にしない。

ブラウザ確認は実装者の受け入れであり、この設計では実行しない。生成した町を 4 つ、3D で開く。

- 海岸: 町が陸に乗り、海側が `0x456d7f`、円盤が無い。
- 内陸: 海が無い。川がある町では文書のストロークの位置に水面があり、デッキが水面より上。
- 湖だけの haven: メッシュの中も外も `0x456d7f`。`0x527f8b` の湖面は無い。
- 広い測量済みの水路: 文書のポリゴンに水面がある。原点を覆う環は水面に出ず、中心は陸色 `0xd5cfbf`（クリア色 `0xc5c5bf` の穴ではない）。そのセルの `water` は文書上 `"sea"` のまま。同一平面のちらつきは無い。

水をクリックしても棟の読み上げは出ない。

## 12. 性能

フレームは一辺数千メートルまで。水面は川の run の残りの断片、帯の断片、海は面とメッシュ外の断片である。町全体で三角形は面の数の数倍に収まる。種類ごとに 1 ドロー。

`sync` のスタンプは水と面の頂点に比例し、`redrawMap` と、面を変えたブラシの 1 回の `sync` だけで走る。パンや `requestAnimationFrame` では走らない。スタンプが同じで親 `ce-water` がシーンにあるなら、部品が 0 でもバッファを作り直さない。内陸の町と、水が無くなった町は、毎回の `redrawMap` では作り直さない。`regionalSurfaceLayers` は呼ばない。

## 13. 代替

| 案 | 決着 |
| --- | --- |
| 2D のクラスを写し、塩水リストの所属で湖を発明しない | 採る。生成された湖の町は `water: "sea"` かつ `coastalOceanFaceIds: []` で、2D は `ce-face--sea`。surface の水も同じクラス。Key Decision 5 |
| リストが非空で外れた `"sea"` を 3D だけ `0x527f8b` にする | 捨てる。リストが空の湖の町では海色になり、リストがある町の同じ面は湖色になる。surface の水を `ce-face--lake` と呼ぶのも捨てる |
| 海面だけ塗り、帯と川は塗らない | 捨てる。2D の `waterAreas` とストロークが消える。対岸の無い町になる |
| 岸のリボンだけ引き、円盤は残す | 捨てる。水側が陸色のまま。0.35 m の線は町の尺度で見えない |
| 川を `extrudeRibbon` で体積にする | 捨てる。2D は塗りである。橋の下に不要な側面が出る |
| `WaterMassing` を文書に保存し version を上げる | 捨てる。入力は既に文書にある。M3 と同じく導出で足りる |
| 描画時に FMG の `h < 20` を読み直す | 捨てる。スタンドアロンと保存済みの町に pack は無い |
| `dryRuns` のあと `offsetSide` で川を描く | 捨てる。キャップとマイターが先の水面に被る。環を作ってから引く |

採るのは、文書からの導出、2D と同じ色、先勝ちの引き算、川は `riverRibbonRing` の平らな環、陸はその穴、である。

## 14. 段階

M0–M3 と番号を混ぜない。

| 段階 | 内容 | 確認 |
| --- | --- | --- |
| W0 | `classifyTownWater`、`riverRibbonRing`、`strictWet`、`townWaterStamp`。three.js なし。ビューアは触らない | `townWater.test.ts` |
| W1 | `waterSurfaceGeometry` と `townGroundPolygons`。法線、スカート、陸の穴。`subtractConvex` の第 3 引数は `0.001`。three.js なし | `waterGeometry.test.ts`。W0 のテストは壊さない |
| W2 | `waterMeshes.ts` と `mountCity3d`。円盤を陸メッシュに替える。スタンプを fabric の早期 return より前に見る。ブラシから `syncCity3d()` を 1 回。拾わない | §11 の 4 町は受け入れで、実行しない。自動テストは `planCity3dRefresh` と `pickables` が空であること。DOM も WebGL も起動しない |
| W3 以降 | 作らない。桟橋、船、堀、地形、LOD、FMG、RE は対象外 | — |

## 15. セキュリティ、観測、出し方

新しいデータはブラウザの外へ出ない。水面はメモリ上の `CityDocument` から導く。

ログとメトリクスは足さない。見るのは単体テストと、今ある CE のステータス行だけである。

フラグは無い。3D の開閉は今のボタンのまま。2D は変えない。戻すときは W2 のメッシュ追加を外せば、円盤と M3 の建物に戻る。W0 と W1 は描画しないので、残っていても画面は変わらない。

## 16. リスク

| 重大度 | 内容 | 緩和 |
| --- | --- | --- |
| 中 | 大きい町で、陸面から帯と川を引くコスト | バウンディングボックスで間引き、スタンプが変わったときだけ |
| 低 | 自己交差で三角化が `[]` になる | 水面には出さない。環は予約し、覆われた面は `landRefill`。投げない。文書の `water` は変えない |
| 低 | 生成された湖が海と同じ `0x456d7f` | 2D の `ce-face--sea` と同じ。`water === "lake"` の手編集だけ湖色。浜は 2D |
| 低 | 地域海と塩水面の食い違いにスカートが残る | 共有辺はスカート無し。残りは溶接しない。見える境は色 |
| 低 | `regionalSurfaceLayers` の WeakMap が古い外環を返す | 3D は呼ばない。`outsideMesh` と同じ 4 行をその場で計算する |
| 低 | 円盤を陸メッシュへ替えると、フレーム外の余白が消える | 2D の窓と一致する。カメラは `cityRadiusMeters` のまま |

## 17. 参照

- `docs/plan/ce-3d-building-massing.md` §9.6、§10.4（地面、橋、堀を描かないこと）
- `src/city-editor/generators/blockInfill.ts` の `documentFabricFingerprint`
- `src/city-editor/renderers/editorSvg.ts` の連続水面、`regionalCoastalWaterPolygons`、surface の `ce-face--sea`
- `src/city-editor/renderers/coastalShoreSvg.ts` の `renderCoastalShore`
- `src/city-editor/generators/regionalCoast.ts` の `regionalCoastalWaterPolygons`、private `outsideMesh`、`regionalSurfaceLayers`
- `src/city-editor/generators/waterGeometry.ts` の private `interior` と `wetInterior`。`dryRuns` は変えない
- `src/city-editor/generators/parcelGeometry.ts` の `subtractConvex`（既定 `minimumArea = 1`）
- `src/city-editor/generators/generation/assembly/terrain.ts` の `applyTerrain`
- `src/city-editor/generators/generation/planning/coast.ts` の `plan.ocean` と地域水面
- `src/city-editor/generators/site/siteInput.ts` の `buildChannels`
- `src/city-editor/controllers/tools/brushes.ts` の海ブラシ
- `src/city-editor/controllers/mapDisplay.ts` の `patchFaceRender`
- `src/services/burgSiteDescriptor.ts` の `collectWaterbody` と `collectRegionalSurface`
- `src/city3d/core/structureGeometry.ts` の private `offsetSide`（export しない。退化だけを §4 に写す）
- `src/city-editor/renderers/cityView.ts` の `mountCity3d`
- `src/city-editor/generators/fortifications.ts` の `boundaryRings`
- `src/city-editor/generators/bridgeDeck.ts` の `riverRibbons`
- `src/city-editor/types/document.ts` の `Face.site`
- `src/city-editor/index.html` の町の水面色

`offsetSide` は export しない。`riverRibbonRing` がその退化（短い節は法線 `[0, 1]`、180° は 1 法線へ倒す）を `townWater.ts` に写す。

## Key Decisions

1. **分類子は `classifyTownWater(document)` だけ。** 2D が塗るフィールドを写し、描画時に導く。保存も version も上げない。descriptor と `h < 20` は再読しない。CE の中では文書が勝つ。色は Key Decision 5。
2. **2D は変えない。** 海・帯・川・地域海は既に色で分かれている。隙間は 3D の円盤だけである。浜の 34 m は水面ではない。`dryRuns` は変えない。
3. **海は面の集合と `regionalCoastalWaterPolygons` の戻り。** 岸だけの第二の折れ線は作らない。生の `regionalWaterAreas` はメッシュを覆うのでメッシュへは渡さない。
4. **被覆は 1 つの順。** 帯、測量（帯を引く）、水面セル（帯と測量を引く）、`riverRibbonRing` の環（そこまでを引く）、地域海、surface の水。原点を覆う環と三角化が `[]` の環は描かず `reserved` に残し、後の水面からは引く。`landRefill` は手順 1–2 の予約が手順 3 の面から消した領域だけである。手順 4 の川の予約は sea 面を陸に戻さない。文書の `water` は変えない。`subtractConvex` の第 3 引数は `0.001`。`dryRuns` で中心線を切ってからオフセットしない。
5. **色は 2D の町クラスを写す。** `water === "lake"` だけが kind `lake`、`0x527f8b`。`"sea"` と `"openWater"` は塩水リストに関係なく kind `ocean`、`0x456d7f`。地域海と surface の水も `ce-face--sea` なので `0x456d7f`。帯と測量は `0x456d7f`。川ストロークは `0x527f8b`。リスト所属で湖を発明しない。
6. **水は y = −0.55、陸は y = −0.2。** 建物の底は 0、橋の底は 0.4 のまま。地形起伏は入れない。
7. **メッシュの陸は `water === "land"` の面から、描いた `channel` と `river` の `polygon` だけを引いたものに、`landRefill` を足す。** `water.reserved` は陸の穴に渡さない。海面は隣の陸面から引かない。外の陸は、地域海を引いたあとで手順 6 の水を `subtractConvex(..., 0.001)` した残りである。湖は地域海を引く前に島から抜かない。核が無い、または頂点が無いときは外の断片は `[]`。フレーム正方形は、メッシュの外で surface が無い部分と、面が無いときの代替だけに使う。
8. **川の環の所有者は `riverRibbonRing`。** `offsetSide` の退化を写し、短い節と 180° の折り返しでは run を捨てない。`structureGeometry.ts` の private は export しない。`classifyTownWater` が描く部品の `polygon` に残す。水面、`strictWet`、陸の穴はそれを使う。`waterSurfaceGeometry` は 3 点環を `WATER_Y` に置くだけである。
9. **水は拾わない。** `pickables` に入れず `raycast` も空にする。
10. **堀・桟橋・船・埠頭は 3D に出さない。** 2D のまま。橋の斜角ポリシーは変えない。
11. **`sync` は開いているあいだ、fabric 参照が同じでも `townWaterStamp` を計算し、fabric の早期 return より前に比較する。** 分類のあと、`parts` が空でも親 `ce-water` をシーンに足す。戻る条件は、fabric が同じ、スタンプが同じ、その親がある、の 3 つである。`stampChanged` を真にする欠落は親が無いときだけで、`ce-water-*` の子が無いときではない。閉じてもシーンは残す。`built` を消すのは建物の作り直しであり、水面の理由にはしない。スタンプは面の `water` 文字列と、水面を変える座標を持つ。`coastalOceanFaceIds` は持たない。`tick` では作らない。
12. **正本のファイルは `docs/plan/ce-3d-water-boundary.md`。** massing の設計書には足さない。CHANGELOG の 1 行は設計合意のときに足してある。PR 1 は分類子だけを足す。

## Open Questions

塩水リストの所属で湖を発明するか、2D のクラスを写すかは Key Decision 5 で閉じた。写す。被覆と予約は Key Decision 4、島の陸の抜き方は Key Decision 7、川の環の所有者は Key Decision 8、隠れたシーンの水面は Key Decision 11 で閉じた。未決の分岐は無い。

## PR Plan

### PR 1: W0 `classifyTownWater`

- Title: `Add classifyTownWater for CE land and water`
- Files: `src/city-editor/generators/townWater.ts`, `src/city-editor/generators/townWater.test.ts`
- Depends on: なし
- Changes: §4 の `classifyTownWater`、`riverRibbonRing`、`strictWet`、`townWaterStamp` と W0 のテスト。ビューアも three.js も触らない。文書の型は変えない。`structureGeometry.ts` と `dryRuns` は変えない。正本と CHANGELOG は設計合意のときに置いてある。PR 1 はそれらを作り直さない。

### PR 2: W1 water and ground triangles

- Title: `Triangulate CE water surfaces and punched ground`
- Files: `src/city3d/core/waterGeometry.ts`, `src/city3d/core/waterGeometry.test.ts`, `src/city-editor/generators/townWater.ts`（`townGroundPolygons` と `townWaterTriangles`）, `src/city-editor/generators/townWater.test.ts`（陸の穴を 1 本。穴の環は `riverRibbonRing` の引き算後の `polygon`）
- Depends on: PR 1
- Changes: §7 と §8。既存の `src/city3d/core/` に `waterGeometry.ts` を足す。`waterSurfaceGeometry` は 3 点環だけを `WATER_Y` に置く。陸の穴は、描いた `channel` と `river` だけを `subtractConvex(..., 0.001)` で引く。`water.reserved` は渡さない。島の陸は手順 6 の水を引いた残り。核が無いときは外の断片を出さない。`offsetSide` は export しない。`structureGeometry.ts` と `bridgeSkewPolicy.ts` は変えない。

### PR 3: W2 replace the ground disc

- Title: `Replace the CE 3D ground disc with land and water meshes`
- Files: `src/city3d/three/waterMeshes.ts`（`planCity3dRefresh` を含む）, 既存の `src/city-editor/renderers/cityView.ts` の `mountCity3d`（`sync` がスタンプを fabric の早期 return より前に見る。親 `ce-water` は `parts` が空でも足す。親が無いときだけスタンプが同じでも水面を作る。閉じてもシーンは残す）, `src/city-editor/controllers/tools/brushes.ts` と `src/city-editor/components/CityEditorPage.ts`（面を変えたストロークのあと `syncCity3d()` を 1 回。ブラシはビューアを import しない）, DOM も WebGL も起動しない小さなテスト（`planCity3dRefresh` と、`pickables` が空であること）
- Depends on: PR 2
- Changes: §9。陸の三角形が 1 枚でもあれば `ce-ground` を外す。建物・橋・`baseElevationMeters`・2D の SVG は変えない。ブラウザ確認は §11 の 4 町（海岸、内陸、湖だけの haven、広い測量済み水路）。この設計では実行しない。
