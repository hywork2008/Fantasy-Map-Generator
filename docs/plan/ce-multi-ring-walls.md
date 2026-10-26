# CE 多重市壁（旧市壁＋新市壁＋城）設計

- 作成日: 2026-10-13
- 状態: P0〜P3 実装済み 2026-10-13。壁間の街区種別（§7）と auto（§6）は未実装。
- 対象: CE（`src/city-editor`）。CGは対象外。
- 後続設計・実装: [内側先行の二重市壁と比較検証](./ce-inner-first-walls.md)。本書の外側先行方式は従来方式として保持し、生成順を選べる。
- 関連: [街道別交易観測](./ce-roadside-growth-observation.md)（郊外の方向重みの入力源。本設計の前提ではない）、[橋の斜交規約](./bridge-skew-policy.md)

## 1. 目的と方針

大都市（例: Leigh 38k、壁内面積45%）では、現在 `splitUrbanCore` が市街地の外周を「壁外リング」として残し、住宅不足時に `fitImportedHousing` がリング全体を suburb 街区として開放する。その結果、壁外に一様な帯ができる。

これを次の「外から内へ」の手順に置き換え、二重市壁を作れる構造にする。

1. 外周リングを作らない。市街地の flood-fill 全体を**外側の市壁（新市壁）**で囲む。
2. 囲まれた市街地の中心部から、円形に整えたセル群を**内側の市壁（旧市壁）**の範囲として選ぶ。
3. 外門から中心へ延びる幹線が内側の境界を横切る点に**内門**を置き、内壁を作る。
4. 城は内側の範囲に置く。城壁ありなら三重になる。

壁と壁の間は、壁内と同じ街区・建物配置の処理で埋める。これにより壁間の建物が整列する。壁外に残るのは、既存の「道路沿い」制約（suburbでないoutskirts）だけになる。ケルン1180年の拡張のように、旧郊外を新市壁が取り込んだ状態を表す。

単一市壁は「リング数1」の特殊例として扱い、既存の文書と既定の生成結果を変えない。

## 2. 現行構造の前提と変更点

| 現行 | 問題 | 変更 |
| --- | --- | --- |
| `DefenseCircuit.scope: "town" \| "castle"`。town は1つ前提 | `defenseCircuits.find(c => c.scope === "town")` が `castles.ts`・`concealStreets.ts`・`circuladeFabric.ts` 等にある | `ring` 序数を追加し、参照をヘルパーへ置換（§3） |
| `FaceProperties.settlement: "core" \| "outskirts"` | 壁内/壁外の2値。約30ファイルが参照 | `"core"` は「最外の市壁の内側」と再定義し、値を増やさない。リングは別プロパティ `wallRing` |
| `CityGate` は所属する壁を持たない | 内門と外門を区別できない | `circuitId?` を追加 |
| `resolveWalledAreaShare` はフレーム幅で 100/45/20% | 全周の壁外リングの原因 | 二重モードでは**内壁の面積割合**の意味に変える |
| `fitImportedHousing` は core を埋めた後、outskirts を suburb 化 | 全周の帯 | 二重モードでは「内側→壁間→（最後の手段で）壁外」の順に埋め、壁外 suburb 化は診断付きの例外にする |

`settlement` の値を増やさない理由: 参照箇所（`suburbanLanduse`、`fitImportedHousing`、`roadsideFarms`、`approachBeyond`、`housingReport`、`citySpatialMetrics` 等）の大半が「壁の外か内か」だけを知りたい処理だからである。壁間を `"core"` に含めておけば、これらの処理は修正なしで新市壁を外壁として扱える。

## 3. データモデル

```ts
// types.ts
export interface DefenseCircuit {
  // 既存フィールドは変更なし
  scope: "town" | "castle";
  /** town のみ。0 = 最も内側（旧市壁）。省略は 0。最大値のものが外壁。 */
  ring?: number;
  /** 旧市壁を残すか、撤去して環状道路にしたか。省略は "standing"。 */
  state?: "standing" | "razed";
}

export interface CityGate {
  // 既存
  /** 所属する town/castle circuit。省略時は外壁（旧文書）。 */
  circuitId?: Id;
}

export interface FaceProperties {
  settlement?: "core" | "outskirts";   // core = 外壁の内側（意味を明文化）
  /** core のうち、何番目の town circuit の内側か。0 = 旧市街。省略は外壁と同じ扱い。 */
  wallRing?: number;
}
```

`fortifications.ts` に次のヘルパーを追加し、`scope === "town"` の直接検索をすべて置き換える。

```ts
export function townCircuits(doc): DefenseCircuit[]          // ring 昇順
export function outerTownCircuit(doc): DefenseCircuit | null  // 外部道路・門・壁外判定用
export function innerTownCircuit(doc): DefenseCircuit | null  // 城の integrated 判定・旧市街用
export function townGates(doc, circuitId?)                    // 既存 API を拡張
```

置換時の判断基準:

- 外部道路・外門・concealStreets・regionalRoadGates・壁外判定 → `outerTownCircuit`
- 城の integrated/detached 判定・城門の向き（`castles.ts#L136` 付近）→ 城を含む最も内側の circuit
- circulade 系 → 当面は単一リング限定（§8）

`validateFortifications` に追加する検証:

- town circuit の `areaFaceIds` が入れ子になっていること（内 ⊂ 外）
- 内外の壁が物理edgeを共有しないこと（既存の重複壁チェックで検出できる）
- 内側の各門に、外側へ抜ける道路があること

保存形式: 文書 version 2 のまま optional フィールドとして追加する。旧文書は ring 省略のため単一リングとして読む。往復保存テストを追加する。

## 4. 生成手順（`generate.ts` S3 の urban 分割以降）

設定:

```ts
interface GenerateSettings {
  /** "single" は現行。"double" は旧市壁＋新市壁。"auto" は §6 の条件で決める。既定 "single"。 */
  townWallRings?: "single" | "double" | "auto";
  /** double のとき内壁の面積割合（外壁内の市街地に対する比）。省略時は resolveWalledAreaShare。 */
  walledAreaShare?: number;
  innerWallState?: "standing" | "razed";
}
```

### 4.1 外壁

- `splitUrbanCore(..., share = 1)` として外周リングを作らない。`classification.urban` 全体が外壁の範囲になる。
- 既存の `insetWalledCore`（evolution の内側への剥ぎ取り）、`extendCoreToCoast`、外側河川処理、壁の経路計算、外門の配置は、現行の単一壁と同じ処理を外壁に適用する。
- `classification.outskirts`（市街地外の道路沿い）は従来どおり壁外として残る。

### 4.2 内壁の範囲選択（円形化）

入力: 外壁内の面集合 `U`、中心（burg セル。広場予定地）、目標面積 `A_in = area(U) × innerShare`。

1. 中心からの距離でセルを並べ、面積が `A_in` に最も近くなるまで取る。`splitUrbanCore` が使う flood-fill の順序は使わない。
2. 円形化: 内壁候補 `C` の境界について、外側セルの重心が半径 `r = sqrt(A_in/π)` の円内にあれば加え、内側セルの重心が `1.15r` を超えて突き出ていれば外す。収束するまで最大3回繰り返す。
3. 制約を満たすまで修正する:
   - `C` が連結で、穴がない（境界が単一の環）。
   - 壁間の距離: `C` の境界から外壁の境界まで、どの方向でも**2セル以上**。壁間にも街区と建物列を置くための条件で、満たさなければ `r` を縮める。
   - 河川・水域で切られる場合は、中心側の岸を優先する（既存 `retainBurg` と同様の考え方）。
   - 既存の evolution では中心の4セル程度が小さいので、円形化は**元のセルID単位**で行う。メッシュは分割しない。
4. `wallRing = 0` を `C` に、`wallRing = 1` を `U \ C` に付ける。

### 4.3 幹線と内門

内門は幹線（外門→広場の動脈）が内壁を横切る点に置く。順序は次のとおり。

1. 外門と広場を決める（現行どおり）。
2. 外門→広場の幹線を edge graph 上で経路計算する。内壁の境界を横切る経路を優先する。
3. 各幹線が内壁の境界を最初に横切る頂点に内門を置く。同じ頂点に複数の幹線が来たら1つの門にまとめる。内門数の上限は `maxWallGatesForExtent` の半分程度。
4. 横切る位置が河川上・橋の上・極端に短いedgeなら、隣の頂点へずらす。橋は `bridgeSkewPolicy` に従い、新設しない。
5. 内壁 circuit を `registerTownCircuit` で登録する。`ring = 0` とし、外壁を `ring = 1` に振り直す。

`innerWallState = "razed"` の場合は壁を作らず、内側の境界edgeを環状道路にする（パリのグラン・ブールヴァール、ウィーンのリングシュトラーセ型）。門は作らず、環状道路と幹線の交差点を広場にできる。

### 4.4 城（三重）

- 城の配置候補は内壁の範囲 `C` に限る（旧市街の端、内壁と一体 = integrated が基本）。`placeCastleRegion` に渡す `urban` を `C` に替える。
- `townBoundary`（`castles.ts#L542`）は内壁の境界を使う。
- 外壁と一体の城（新市壁の角に置かれた要塞）は「外壁の端への退避先」として§5で使う。

## 5. 城を置いても道が通る最小セル数の保証

過去に micro・tiny で城を置いたとき、道を通すセル辺がなくなって生成に失敗していた。二重市壁ではこの問題が内壁の内側で起きる。そこで、内壁の範囲について次を**生成前に**検査し、満たさなければ段階的に縮退する。

### 5.1 判定（`innerCapacityCheck`）

内壁範囲 `C`、城の予約面 `K`（castlePlacement の結果。未配置なら目標面積から推定セル数）について:

1. **セル数**: `|C \ K| ≥ N_free`。`N_free = 7`（中心セル＋その周囲1層。hex の半径1に相当）を初期値とする。
2. **面積**: `area(C \ K) ≥ castleTargetArea(size) × 3`。城が旧市街の大半を占めないようにするため。
3. **到達性**: 内壁の境界のうち城の壁に接していない頂点を通り、`C \ K` の edge graph で、各内門候補から広場まで経路がある。城壁の頂点と道路が共有する edge は使えない。これは `castleRoadEdgeAllowed` で判定する。
4. **門の数**: 3 で到達できる内門候補の頂点が2つ以上。

判定に使う数値は暫定値であり、§9 のバッチ計測で較正する。

### 5.2 失敗時の縮退順序（都市生成そのものは失敗させない）

1. 城の size を一段下げる（既存の `standard → small → tiny` 順）。
2. 内壁範囲を外側へ1層広げる。ただし壁間2セルの制約は守る。
3. 城を外壁の端へ移す（新市壁と一体の要塞。`outward` 制約を流用）。
4. 内壁を `razed` にする（環状道路だけ残す）。
5. 単一市壁に戻す。

どの段階で確定したかを `generationDiagnostics` に記録し、UIに表示する。`castle-no-site` で reject するのは、単一市壁でも配置できないときだけとする（現行どおり）。

### 5.3 二重市壁を許可するサイズ

micro（6セル幅）と tiny（12セル幅）では、内壁の内側に7セル以上を確保すると壁間2セルを満たせない。このため `"double"` を指定しても単一に落とし、理由を表示する。プリセット名では判定せず、§5.1 と壁間の制約を実際のセル数で判定する。small 以上の見込みは次のとおり。

| プリセット | 幅のセル数 | 半径のセル数 | 内壁45%時の内側半径 | 壁間 |
| --- | ---: | ---: | ---: | ---: |
| small | 24 | 約11 | 約7.4 | 約3.6 |
| medium | 48 | 約22 | 約15 | 約7 |
| large | 96 | 約44 | 約30 | 約14 |

（実際の値は都市半径・evolution のセル寸法で変わる。概算値。）

## 6. "auto" の決定と面積割合

`"auto"` は次をすべて満たすときに二重を選ぶ。

- `program.walls` が true
- 人口または `dwellings` が閾値以上（初期値: 人口15k。Leighは該当）
- §5 を満たす
- 時代が `classical` 以降（初期値。ローマ帝国期にも二重の都市壁は存在した）

内壁の割合 `innerShare` の既定値は、現行の `defaultWalledAreaShare` を流用する（Leighでは45%）。意味は「外壁に対する旧市街の面積比」に変わる。将来は FMG の人口履歴（歴史モード）から「壁を建てた年の人口 ÷ 現在人口」で決められるよう、`descriptor.fortification.innerShare` を optional で受け取れる口だけ用意する。

## 7. 住宅配分（`fitImportedHousing`）

- 二重モードの充足率の係数: `inner`（旧市街。高密度）、`between`（壁間）、`outskirts`（壁外の道路沿い）の3つにする。現行の `core`/`outskirts` の2係数を拡張する。
- 埋める順: inner を満杯 → between → outskirts の道路沿い（suburb 化しない）。
- それでも不足するときは、壁外を suburb 化する前に次の順で対処する。
  1. 外壁の範囲を1層広げて再生成する。
  2. 壁内の密度（階数・区画の細分化）を上げる。現行にない場合は不足として診断する。
- 壁外を suburb 化した場合は診断に記録する。壁外の不足分を全周に開放するのではなく、街道の重み（`trafficRank`、将来は roadside 観測）上位の門の前に限って開放する。
- 壁間の街区種別: 職人地区・修道院・菜園・小さな市場。旧来の放射道路沿いに古い郊外を残す。`wards.ts` の壁外用途割当を壁間へ移す。

## 8. 対象外・当面単一に限定するもの

- circulade（`circuladeFabric`、`polygonalCirculade*`）と Bram レイアウトは、専用の幾何を持つため単一リングに限る。
- `"compact"` urbanCoreMode は、既に円盤状の中心を作っている。二重化の実装時は、4.2 をこのコードと共通化できるか確認する。
- 三重以上の市壁（城を除く）は、型（`ring` 序数）では表現できるが、生成は二重までとする。
- 手動編集UI: 内壁の追加・削除・razed 切替は P3。

## 9. 実装順

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| P0 | 型（`ring`・`state`・`circuitId`・`wallRing`）、`townCircuits` 系ヘルパー、全 `scope === "town"` 参照の置換、検証、保存往復 | 既存の全テストが無変更で通る（単一リングの挙動が同一） |
| P1 | 4.1 外周リング廃止＋4.2 内壁範囲選択＋4.3 内門・内壁登録（城なし）。設定 `townWallRings` | Leighで外壁1本・内壁1本・内門が生成され、壁外の建物が道路沿いだけになる |
| P2 | §5 の判定と縮退、城を内壁内に配置（三重）。micro/tiny の自動単一化 | small〜large × 城サイズ × hex/voronoi/evolution のバッチで、城による生成失敗が単一市壁より増えない |
| P3 | §7 住宅3係数、壁間の街区種別、`razed` 環状道路、UI（Document パネルの選択肢・診断表示） | Leigh の壁外住宅が全体の25%未満（暫定）。壁外 suburb 化した場合に理由が出る |

検証: 既存の `housingBatch` / `cityGenerationAudit` の CLI に「市壁リング数」「内側の空きセル数」「縮退した段階」の列を加えて、プリセットとシードのバッチで集計する。

## 10. 事前計測ツール（wall-ring lab）

実装前に§5・§6の数値を較正するため、幾何だけの試験ツールを用意した。

- 本体: `src/city-editor/core/wallRingLab.ts`（P1/P2の範囲選択・内門・城検査の原型）、テスト `wallRingLab.test.ts`
- CLI: `npm run ce:wall-lab -- --out temp/wall-lab --grid hex,voronoi,evolution --size small,medium,large --rings "1;0.45,1;0.2,0.5,1" --castle none,small,standard --seeds 5`
  - `--population 38255 --size auto` で FMG と同じ `occupancyRadiusMeters` から半径を決める
  - 出力: `cases.csv`（1ケース1行）、`summary.csv`（組合せごとの成功率・失敗理由集計）、`svg/`、`manifest.json`
- 近似: 実際の CE 初期メッシュ（`createGridDocument`）を使うが、市街地は水域なしの円盤、城はセル単位の予約（CEは面を切るので保守的）。門のスポークは面を横切る chord とし、`gateCuts` で数える。

### 10.1 Grid evolution の調整オプション（2026-10-13 追加）

- `PatchParams.rimGrowthPercent`（外周セルの拡大率、0〜100、既定100＝従来の配置）と `PatchParams.maxPatches`（nPatches 上限、48〜1200、既定48）を追加。上限はブラウザの設定として保存され、FMG からの取込み時の自動 nPatches にも適用される。
- 実測（Leigh 38k、城 standard、3シード）: 拡大率50%・上限400で medium は二重・三重とも全シード合格、large は二重・三重とも2/3 合格。拡大率100%のままでは上限を上げても中心だけが細かくなり、壁間が確保できない。
- 上限を上げると中心セルが小さくなり、`clipPatchCells` の固定面積の sliver 判定で実セルが削除されてメッシュに穴が開いていた。sliver 判定を窓端のセルに限定して修正した（既定範囲では内部セルの削除は0件だったため、既存メッシュは不変）。上限1200・拡大率100%では中心セルが数m になり、まだ穴が残る。

## 11. P0 実装記録（2026-10-13）

- 型: `DefenseCircuit.ring` / `state`、`CityGate.circuitId`、`FaceProperties.wallRing`（すべて optional。旧文書は単一リングとして読む）。
- `fortifications.ts`: `townCircuits` / `outerTownCircuit` / `innerTownCircuit` / `townCircuitForFace`（城は町域から切り出されるため隣接面も見る）/ `gateTownCircuit`、`townGates(doc, circuitId?)`。
- `registerTownCircuit(..., ring?)`: ring 省略時は従来どおり `gc:defense-town`、指定時は `gc:defense-town-<ring>`。
- 参照置換: 外壁 = `concealStreets.outerWallRing`・circulade・aerialLandmarks の町域、門ごと = バルビカンの堀・`gateHasMoat`、城を含む最内リング = `castles.ts` の城アクセス・手動設置、全町壁 = 城撤去時の壁保持・城壁厚。UI の堀設定と `renderMoats` は全 town circuit に適用されるので変更なし。
- 検証: リング番号の重複、内側リングの入れ子、`gate.circuitId` の参照先、`face.wallRing` の参照先。
- テスト: `multiRingWalls.test.ts`（5件、保存往復を含む）。既存テストは無変更で全件通過。

## 12. P1 実装記録（2026-10-13）

- 設定 `GenerationSettings.townWallRings: "single" | "double"`（既定 single）。UI は生成パネルの「市壁」選択。circulade・Bram は単一のまま。
- double では外壁の面積割合を1にする（`outerWalledAreaShare`）。旧市街の割合は `innerWalledAreaShare`（未指定で既定が100%となる Small 以下は45%）。
- 旧市壁は `gen/innerTownWall.ts` の `addInnerTownWall` で、`applyPlan` 直後（平滑化・門の直交化の前）に追加する。外壁の門・通路・直交化の後処理はすべての町門に適用されるので、内門にも同じ処理がかかる。
- 手順: 中心からの距離で面を選んで円形に整える → 壁間2セルを満たす半径まで縮める → **街路が円を横切る各辺に頂点を入れ、両側の面を円に沿う弦で分割**（次数3のメッシュでは、面を切らないと街路が頂点で壁を横切れないため。ラボの chord と同じ）→ 分割後のメッシュで選び直す → 壁線上に残った街路辺は、外側面を加えるか内側面を外すかで目標円に近い方を選んで退ける → 街路が内外に抜ける壁上の頂点を内門にする。
- 河川: 旧市壁は水門を作らず、河川に触れる辺で壁を切って開口にする（交差検証で「壁と川が交差なしに接する」と棄却されたため）。
- 失敗時は単一市壁のまま生成を続ける。診断 `inner-wall`（ok, failureCode, faces, areaShare, gapCells, gates, riverOpenings, streetOpenings, cuts）。
- 実測:
  - Voronoi small / Hex medium: 旧市街が面積の28〜45%、壁間2セル、内門4〜12。建物は壁と交差しない。
  - Leigh（evolution、取込み既定の nPatches）: 町全体が33面しかなく失敗（`gap`）、単一市壁に戻る。ただし外壁が全体を囲むため壁外の建物は3,954→4に減る。
  - Leigh（拡大率50%・nPatches 400）: 旧市街45%（328面）、内門17、建物 旧市街3,755／壁間4,906／壁外0。
- 残課題: 平行な街路が多いと内門が多すぎる（Leigh で17）。主要街路以外の横断を閉じる処理は P3。壁線の一部が街路回避でぎざぎざになることがある。

## 13. P2 実装記録（2026-10-13）

- 計画段階（`runPlan`、城の配置前）で旧市街を決める: `planInnerTown`（P1 と同じ円形選択・壁間判定、中心は広場の anchor）。壁間2セルを満たせなければ `innerWall.planned=false` とし、単一市壁で生成する（§5.3。micro・tiny はここで単一になる）。
- 城はまず計画した旧市街の面に対して配置する。配置後に `innerTownCapacity`（城以外の面7以上、空き面積が城の3倍以上）を満たすときだけ採用し、満たさなければ従来どおり町全体（外壁側）に配置し直す（§5.2 の段階3）。サイズを下げる段階1は `placeCastleRegion` の auto サイズ段階をそのまま使う。
- 旧市壁の生成（`addInnerTownWall`）:
  - 城の面は町域でも外でもない扱い（壁間の計測で通過も外部判定もしない）。
  - 城が旧市街に計画された場合、城に隣接する面を旧市街に取り込み、離れていれば最短経路の面で接続する（`hugCastle`）。街路回避の後に再度接続する。
  - 城と接する壁線は城の城壁が兼ねるので、旧市壁には描かない（外壁の integrated 城と同じ）。
  - 旧市街に接する城が §5.1 を満たさなくなったら `castle-crowds` で単一市壁に戻す。
- 診断 `inner-wall` に `planned`・`castleInOldTown`・`castleTouchesOldTown` を追加。
- 実測（城あり、二重指定、14都市）: 生成の成否は全組で単一市壁と同じ。旧市壁ができたのは small/medium 12都市中10（失敗は `gap`・`no-gate` で単一に戻る）。そのうち城が旧市街に接したのは8。残り2は城が外壁から約1セルの位置に置かれ、旧市街を城まで延ばすと壁間2セルを満たせないため、城は壁間に残る。

## 14. P3 実装記録（2026-10-13）

- 内門の間引き: 各外門から広場への最短街路経路が旧市壁を最初に横切る点だけを門として残す（2未満なら角度が最も離れた横断を追加）。他の横断は、壁間側の街路辺を外して壁で行き止まりにする（道路グループは連続区間ごとに分割）。診断に `closedCrossings`。
- razed: `GenerationSettings.innerWallState: "razed"`。旧市壁の線を最も広い道路と同じ幅の環状道路にし、門は作らない。circuit は残り `state: "razed"`、壁グループなし（境界は opening）。
- 住宅配分: `fitImportedHousing` の区域を `core`（旧市街、wallRing 0。単一市壁では町全体）・`between`（壁間）・`outskirts` の3つにし、この順で全区画を埋めてから次へ進む。単一市壁の文書には `between` が無いので、従来と同じ挙動。`HousingFitStats` に `betweenFactor`・`finalZones`。住宅の配分調整（fit）は fabric を持つ grid evolution の取込みでのみ動く（従来どおり）。
- UI: 生成パネル「市壁」を 単一／二重／二重（旧市壁を撤去し環状道路）の3択に。建物数の表示を、二重のとき「旧市街／市壁間／壁外」に分ける（svg の `data-old-town-buildings`）。二重を指定して単一に戻ったときは通知を出す。
- 実測 Leigh（拡大率50%・nPatches 400、城あり）: 内門 17→3（10横断を閉鎖）、城は旧市街に接する、建物 旧市街5,070／壁間3,690／壁外0、合計8,760（dwellings 8,502、±10%内）。壁外住宅25%未満の受入条件を満たす。
- 未実装: 壁間の街区種別（職人地区・修道院・菜園、`wards.ts`）、`townWallRings: "auto"`（§6）、手動編集 UI（内壁の追加・削除・razed 切替）、城が外壁近くに置かれた場合に旧市街へ接しない件（§13）。

## 15. 旧市壁を街路より先に作る順序への変更（2026-10-13）

街路網を引いた後に旧市壁を被せると、密な街路を避けるための壁線のぎざぎざ、門の間引き（横断の閉鎖）、川との接触の失敗が生じた。順序を次のように変えた。

1. 門から中央への道（計画線）
2. 旧市壁: `applyPlan` 内で、外壁・門の確定後、街路の経路探索の前に `addInnerTownWall(..., { arteries })` を実行。面の分割は川の横断だけ（橋の頂点は避ける）。
3. 旧市壁の門: 各「門→中央」計画線が壁と交わる位置の、使える壁頂点（区間の端・川・城の側を除く）。門どうしは門間隔未満なら統合。外壁の門と同じ `openBarrierPassage` で4方向の通路を開く。
4. 街路: 既存の経路探索。壁の辺は禁止されており、さらに門以外の旧市壁頂点から旧市街の内側へ伸びる辺も禁止（`oldTownNonGateEntries`）。そのため、街路は内門でしか旧市壁を越えない。
5. 経路探索の後、道が通らなかった内門は外す（`unconnected-gates` 判定の前）。
6. 橋の道グループは「門の無い壁頂点で終わる道の切り詰め」から除外。

ステージは 10 門から中央への道 → 11 内側の市壁 → 12 内側の門と道 → 13 市内の街路。12 は完全生成と同じ都市から町の街路グループ（`gc:road-<index>` のうち門の道より後）を隠したもの（段階ごとに別の都市にならない）。

実測（城あり、small 8都市）: 生成の成否は単一市壁と全組同じ。旧市壁ができたのは6都市（Hex small の2都市は単一に戻る）。そのうち城が旧市街に接したのは5都市。閉じた横断は0。Leigh（拡大率50%・nPatches 400）: 内門3、城は旧市街に接する、建物 旧市街4,839／壁間3,905／壁外0。
