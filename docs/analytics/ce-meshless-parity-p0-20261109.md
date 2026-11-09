# メッシュなしCE 機能同等化 P0（2026-11-09）

設計元: [機能同等化のロードマップ](../plan/ce-meshless-feature-parity.md)。P0では、対応表と、旧CEとメッシュなしを同じ入力で生成して比べる仕組みを作った。

## 成果物

| 成果物 | 内容 |
| --- | --- |
| [対応表](../plan/data/ce-meshless-parity.json) | 127行。生成設定、生成要素、3Dの部品、操作の4分類で、メッシュなしの状態・根拠・担当段階を記録 |
| [固定ケース](../plan/data/ce-meshless-parity-cases.json) | 8件。設定と要素の組を網羅するように選んだ。多数seedの探索はしない |
| 要素の集計 | `src/city-editor/services/vector/parity/census.ts`。両方式の文書から、要素の種類ごとの数を数える |
| 比較の試験 | `parity/parityObservation.test.ts`。明示実行のときだけ動く |
| 実行スクリプト | `scripts/city-editor/meshless/p0Parity.ts --out <新しいJSON>`。出力先が既にあれば上書きしない |
| [比較結果](ce-meshless-parity-p0-20261109.json) | 8件の両方式の集計と差 |

## 対応表の集計

| 分類 | 同等 | 部分的 | 手置きのみ | 変換のみ | 未対応 | 対象外（セル固有） | 計 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 生成設定 | 2 | 9 | 4 | 1 | 33 | 3 | 52 |
| 生成要素 | 4 | 7 | 4 | 3 | 13 | 0 | 31 |
| 3Dの部品 | 4 | 0 | 0 | 0 | 22 | 0 | 26 |
| 操作 | 5 | 7 | 0 | 0 | 5 | 1 | 18 |
| 計 | 15 | 23 | 8 | 4 | 73 | 4 | 127 |

### 区分の定義

- **同等**: 旧CEと同じ効果で生成できる、または使える。
- **部分的**: 機能はあるが、旧CEより狭い。
- **手置きのみ**: 利用者が置けば使えるが、ランダム生成では作られない。
- **変換のみ**: 旧CEの文書を複製・変換した場合だけ存在する。
- **未対応**: 存在しない。
- **対象外**: セル固有の機能。ロードマップ§3.4により、置き換えるか、やめる。

### 確認の範囲

- `checked: false`の8行は、メッシュなし側のコードを今回確かめていない。対象は操作の分類で、配置の部品・生態系・外観・施設パネル・城の様式・船・描画品質・FMGからの起動である。各段階に着手するときに確かめる。
- 生成設定の行は、`GenerationSettings`と`SiteConfig`の項目をすべて挙げた。
- 生成要素の行は、旧CEの`generators/`の生成器を機能ごとにまとめた。
- 3Dの行は`city3d/three/`の部品ごとに作った。

### 3Dの「同等」4行

- メッシュなしの3D（`renderers/vector/scene3d.ts`）が使う`city3d`の部品は、BVの試作品（配置）・クレーンと荷役・船の3つである。
- 残る1行は、M9のローカル原点と論理IDの選択である。
- 市壁・道路・橋・水面・地形・街路街区の住宅は、色付きの多角形を押し出して描く。

## 比較の結果

条件:

- 旧CEは`createGridDocument({ size: "small", grid: "voronoi" })`に`generateCityOnDocument`で生成した。
- メッシュなしは、生成パネルと同じ手順で生成した。手順は`vectorInputFromEditor`、続いて市壁を楕円かなしとする骨格、最後に`medieval`の施設住宅である。建築率は100%とした。
- メッシュなしの枠には、エディターと同じく旧CEの現在の文書の枠を使った。生成した都市があれば、その枠である。

| ケース | 旧CE | メッシュなし | 旧CEにあってメッシュなしにない要素 | 旧CEより少ない構造 |
| --- | --- | --- | --- | --- |
| inland-walled（3,000人） | 成功 4.2秒 | **失敗** `civic-site-space` | — | — |
| citadel-shanty（3,000人） | 成功 7.6秒 | **失敗** `civic-site-space` | — | — |
| coastal-port（3,000人） | 成功 7.4秒 | **失敗** `site-input` | — | — |
| open-village（600人） | 成功 0.3秒 | **失敗** `civic-site-space` | — | — |
| double-wall（5,000人） | 成功 9.0秒 | 成功 1.5秒 | 市場・公園・農地 | 市壁の回路 2→1、橋 2→1 |
| bastioned（5,000人） | 成功 6.2秒 | 成功 1.8秒 | 稜堡式の町・市場・公園・農地 | — |
| circulade（3,000人） | 成功 4.3秒 | 成功 1.9秒 | 市場・公園・農地 | 町割り（circulade→骨格） |
| relief-polygon（3,000人） | 成功 6.7秒 | **失敗** `width-fold` | — | — |

- 旧CEの人口に基づく生成は、町割り`organic`と`mesh-first`でしか使えない。そのため、bastioned・circulade・relief-polygonの3件は、旧CEを人口の設定なしの規模の既定で生成した。メッシュなしには、同じ目標人口を与えた。
  - この3件は、旧CEの住宅数が記録されない（`housingCapacity`がない）。メッシュなしの住宅が「旧CEにない要素」に出るのはそのためで、差ではない。
- 旧CEの自動の森林は、5件とも0だった。既定の森林の設定によるもので、旧CEの森林の生成は対応表の行として扱う。

## 見つかった生成の失敗（P1の前に直す）

8件中5件で、メッシュなしのランダム生成が失敗した。いずれも、エディターの生成パネルで同じ設定を選んだ場合に起きる。

1. `civic-site-space`（3件）: 広場と寺院の大きさは、枠の広さ（旧CEの枠は1,200 m）から決める（`seedVectorCivicCentre`）。一方、敷地は人口と建築率から決める。そのため、3,000人では敷地の半径が約121 mで、広場と寺院の予約が敷地からはみ出す。5,000人の3件は収まって成功した。
2. `site-input`（coastal-port）: 海岸のある設定では、合成の都市情報（`synthSite`）を経る入力になる。その入力が文書の検証を通らない。
3. `width-fold`（relief-polygon）: 起伏と川のある設定で、骨格の生成中に幅の折り返しで失敗する。原因は未調査。

## 次の作業

1. 上の3件の生成の失敗を直し、比較を再実行する。8件のすべてで、両方式の集計が取れる状態にする。
2. P1（設定の受け渡し）に進む。メッシュなしが`GenerationSettings`のすべての項目を受け取り、未対応の項目を対応表の行と理由とともに画面に示す。

## テスト

- 比較の試験は明示実行のみで、通常のVitestではskipする。
- 型検査とbiomeはエラーなしである。

## P0b 生成の失敗の修正（2026-11-09）

比較結果: [P0bのJSON](ce-meshless-parity-p0b-20261109.json)。固定8件のうち6件で、メッシュなしの生成が成功するようになった。6件とも未収容は0である。

### 広場と寺院を人口に合わせる

広場と寺院の大きさを、枠の広さではなく目標人口から決める。共通の関数`civicSizeForPopulation`（`generators/housing.ts`）を追加し、旧CEも後から使えるようにした。旧CEの呼び出しは変えていない（旧CEはまだ人口に合わせていない）。値は暫定で、史料による検証はまだ行っていない。

| 人口 | 広場の一辺 | 寺院 | 墓地の奥行 |
| --- | --- | --- | --- |
| 1,000未満 | 18 m | 礼拝堂 14×8 m、高さ10 m | 20 m |
| 1,000〜3,000 | 30 m | 礼拝堂 22×10 m、高さ12 m | 30 m |
| 3,000〜8,000 | 48 m | バシリカ（BV資産の寸法） | 40 m |
| 8,000〜25,000 | 64 m | 同上 | 40 m |
| 25,000以上 | 88 m | 同上 | 40 m |

- 礼拝堂にはBV資産がない。そのため、3Dは配置の量塊（`ce-civic-chapel`）で描く。旧CEの3Dの部品で描くのはP2である。
- 敷地の大きさの決め方（`vectorInputFromEditor`）を変えた。
  - 変更前: 1回目の組み立てで広場と寺院を置いていた。住宅だけの広さの敷地では、そこで失敗していた。
  - 変更後: 1回目は広場と寺院を置かずに組み立てる。
  - 広場と寺院の配置は`vectorCivicLayout`へ分け、人口だけから求める。
  - 敷地の半径は、次の2つの大きい方とする。
    - 住宅の広さに、広場・寺院の面積の1.5倍を加えた広さ。1.5倍は、広場・寺院の後退距離と、それに面する街路の分である。
    - 広場・寺院の最も遠い角までの距離に、外周の余白12 mを加えた長さ。
  - 教会の建物の面積は、境内とは別に数える。従来の計算でも二重に数えていたので、その分の住宅の土地を保つ。
- 半径150 m未満の敷地の大きさを、実測の表で補正した（`urbanSizing.ts`）。
  - 従来の式は、半径150〜600 mの実測に合わせたものである。小さい敷地では、外周と街区の配置が想定より多くの土地を取る。
  - 600人では、容量が必要の75%しかなかった。
  - 半径45〜125 mで、2つの種・すべての区画を建てた条件の住戸数を測り、表から補間する。
  - 150 m以上は従来の式のままである。同じ値になることを式で確かめた。

### 海岸の閉じ方

- 合成の海岸線が枠の外まで延びると、枠に沿って閉じる経路が海岸線と交差し、海の多角形が自己交差していた。
- 旧CEの骨格（`generation/skeleton/inputs.ts`）と同じく、枠と海岸線の最大座標の大きい方に1 mを加えた正方形で閉じるようにした（`vectorInputFromDescriptor`）。

### 川の端の折り返し

- 合成の川筋は、枠の外へ1点出てから枠の縁で終わる。そのため、端で169°折り返し、幅を付けた川面が折れていた。
- 始点側・終点側にある、枠の外または縁の上の点を除き、川筋が枠の縁と交わる点で置き換えるようにした（`trimToWindow`）。

### 残る2件

いずれも、合成の都市情報（`synthSite`）を経る入力でだけ起きる。海岸・起伏のある設定は、この経路になる。

| ケース | 失敗 | 原因 | 扱う段階 |
| --- | --- | --- | --- |
| coastal-port | `gate-access` | 骨格の市壁の門のうち2つが、道路につながっていない。詳しい原因は未調査 | P5（水辺） |
| relief-polygon | `unbridged-road` | 合成の都市情報の道路が、橋なしで川を渡る。メッシュなしの骨格が橋を作るのは、川ごとに中心に近い1か所だけである。FMGの固定交差を持たない入力の道路には、橋がない | P5（水辺）、P8（地形） |

### 再生成と共有への影響

- recipe共有は入力文書そのものを保存する。そのため、入力の作り方を変えても、既存のrecipeの再現結果は変わらない。施設住宅の生成版は上げていない。
- エディターで新しく生成する都市は変わる。
  - 対象: 広場・寺院の大きさ、小さい都市の敷地の大きさ、合成の海岸・川を含む入力。
  - 5,000人のdouble-wallでは、住宅が949棟から936棟になった。

### テスト

- `generation/civic.test.ts`に1件を加えた。600人では礼拝堂、3,000人ではバシリカが敷地に収まり、未収容が0であること。
- 関連テストは63ファイル中53成功・10 skip（計測用）だった。対象は`generators/vector`、`services`、`components/vector`、`renderers/vector`、`housing`、`civicPlacement`である。
- 型検査・biome・アーキテクチャの検査はエラーなしである。

## P1 設定の受け渡し（2026-11-09）

P0bの残り2件（海岸の`gate-access`、起伏の`unbridged-road`）は、P5（水辺）とP8（地形）で扱うことにした（2026-11-09合意）。

### 設定を文書に残す

- メッシュなしの文書の`context`に、任意の`requestedSettings`を加えた（native v8のみ）。
  - 中身: 旧CEの`GenerationSettings`から、FMGの都市情報（`descriptor`）を除いたもの。都市情報は敷地（`site.descriptor`）が持つ。
  - 未対応の設定も、そのまま保存する。
- 書き込むのは`vectorInputFromEditor`である。つまり、旧CEから開いたエディターの生成パネルで作った都市が対象になる。
  - 合成入力・FMG連携だけで開いた場合は、設定がないので保存しない。
- 検証は次のとおり。
  - 平らなJSONの値だけを受け付け、数値は有限値に限る。
  - 予算は4,000項目、深さは6段まで。
  - `descriptor`と、プロトタイプを汚染するキーは拒否する。
  - 必ず`config`を持つこと。
- 文書の版は上げていない。任意の項目で、v7・v8の既存文書はそのまま読める。

### 未対応の設定を示す

- `generation/settingSupport.ts`に、対応表の生成設定52行と同じ状態・段階の表（`MESHLESS_SETTING_SUPPORT`）を置いた。
  - 表と`docs/plan/data/ce-meshless-parity.json`の一致は、テストで保つ。
- `meshlessSettingGaps`は、次の設定を表の順に返す。
  - 都市の要素（`config.features.*`）は、オンにしたもの。
  - その他の設定は、指定されていて、エディターの既定値と異なるもの。
  - 同等とセル固有の行は返さない。
- 生成パネルに「メッシュありと同じには生成されない設定」の一覧を加えた。
  - 各行は「設定のID: 状態（対応予定の段階）」の形である。
  - 文書の`requestedSettings`がなければ、エディターの入力の設定を使う。
  - 該当がなければ隠す。
- 設定はIDのまま示す。旧CEの画面の項目名との対応はまだない。

### 既存の文言の不具合

- vectorの節の5つの文言（計測の長さ・面積、住宅のインスペクターの面積・入口・線幅）が、`{value0}`のように波括弧1つで書かれていた。
- i18nextは`{{value0}}`しか置き換えないので、画面に「{value0}」がそのまま出ていた。英語・日本語とも`{{value0}}`へ直した。

### テスト

- 次の2ファイルに、テストを追加した。
  - `generation/settingSupport.test.ts`（2件）: 対応表との一致。設定が文書に残ること。城塞・貧民街・二重市壁が一覧に出て、同等の設定とオフの要素は出ないこと。
  - `components/vector/VectorGenerationPanel.test.ts`（1件）: 旧CEの設定で開いた生成パネルに一覧が出て、文言に置換漏れがないこと。既定の都市では一覧を隠すこと。
- 関連テストは65ファイル中55成功・10 skip（計測用）だった。対象は`generators/vector`、`services`、`components/vector`、`renderers/vector`、`i18n`である。
- 型検査・biome・アーキテクチャの検査はエラーなしである。

## P2a 市壁・門・橋を旧CEの構造物の量塊で描く（2026-11-09）

P2（3D表示の共有）の最初の区切りとして、市壁・塔・門・橋を、旧CEと同じ構造物の量塊（`StructureMassing`、`createStructureMassing`）で描くようにした。門のバービカンは設けない。後でオプションとして作り込む予定である（2026-11-09指示）。

### 旧CEの計算をセルから切り離す

`renderers/structureMassing.ts`の次の処理を、セルのない入力で使える関数として公開した。旧CEの関数は、これらを呼ぶだけになった。

| 関数 | 内容 |
| --- | --- |
| `wallBodyHeight` | 材料と壁上通路の有無からの壁の高さ（石造8 m・5 m、木造4.5 m・3.2 m） |
| `curtainTowersAlong` | 壁の中心線に沿った円形の塔。間隔の半分から始め、川と門の近くは除く |
| `gateMassesAt` | 門の両側の塔（壁厚×1.6の正方形、壁より2.5 m高い）と、開口の上の楣 |
| `wallRunsWithOpenings` | 門の開口で切った壁の帯。壁上通路の外側に胸壁を付ける |

- 旧CEの出力は変わっていない。3,000人の旧CEの都市2つ（一重・二重市壁、城塞あり）で、変更前後の`collectCityStructures`の結果のSHA-256が一致した。

### メッシュなしの構造物

`renderers/vector/structureMassing.ts`の`vectorStructures`を追加した。

- 壁:
  - 壁の道の中心線を標本化する。
  - 門ごとに、その中心を頂点として加えて開口を切る。
  - 壁厚は道の幅、材料は壁の地物の文化（timberなら木造）から決める。
  - 塔の間隔は、旧CEの既定（街路セル50 m×1.4 = 70 m）とした。
- 門: 通行用の門（`passage`）に、両側の塔と楣を置く。
  - 町の内側の向きは、敷地の中心が壁の内側にあればその中心、なければ壁の重心から決める。
  - 水門は開口だけにする。
- 橋: 橋の両端（`bridgeGeometry`）を中心線にし、道路の幅、旧CEと同じ厚さ・欄干にした。
- 起伏のある都市では、壁の帯は頂点ごとに、塔・門は中心で、地面の高さに置く。
- 稜堡式の防御が持つ壁と、非表示の道は対象外とする。

描画データ（`vectorRenderData`）に`structures`を加えた。中身は、その段階で描く壁・橋の所有者だけである。

- 3D（`scene3d.ts`）は、所有者ごとに量塊のグループを作る。
  - 壁の道・橋のIDで選択できるようにし、論理IDによる選択（M9）を保つ。
  - 同じ所有者の押し出しの多角形は描かない。
- 2D・SVGの出力は従来どおりである。

### 未対応のまま

- 旧CEの高品質時のBVの壁の部品（`createTownWalls`）とBVの橋（`createTownBridges`）は、旧CEの文書を読む。入力を切り離すまで、メッシュなしは量塊のままである。
- 寺院・目印となる建物の構造物化、道路・住宅・水面・地形・樹木は、P2の次の区切り以降で扱う。
- ブラウザーでの目視は、Chromeが使えないため行っていない。

### テスト

- `renderers/vector/structureMassing.test.ts`（2件）を追加した。
  - 壁の帯の数が門の数と等しいこと。
  - 塔があり、通行用の門ごとに両側の塔2つと楣1つがあり、バービカンがないこと。
  - 橋の数が一致すること。
  - 3Dで壁の押し出しの多角形が消え、量塊が壁の道のIDで選択でき、高さが4 mを超えること。
- 関連テストは134ファイル中121成功・10 skip・3失敗だった。対象は`generators/vector`、`services`、`components/vector`、`renderers`、`city3d`である。
  - 失敗の3件（`renderers/svg.test.ts`の寺院の大きさ、`city3d/core/waterGeometry.test.ts`、`city3d/three/obernHouseModels.test.ts`）は、HEADの別のworktreeでも同じく失敗した。今回の変更とは関係しない。
- 型検査・biome・アーキテクチャの検査はエラーなしである。

## P2b 道路を旧CEの路面の部品で描く（2026-11-09）

### 道路

`renderers/vector/roadRibbons.ts`の`vectorRoadRibbons`を追加した。

- メッシュなしの道路を、旧CEの路面の帯（`RoadRibbon`）にする。
  - 対象: 主要道路、記録の地区の街路、記録の街路街区の小路、施設モードの小路。
- 路面の種類は、旧CEと同じ`classifyRoadSurface`で決める。
  - 主要道路: 外周の市壁の外は街道（`highway`）、内は幹線（`arterial`）。市壁がなければ幹線とする。
  - 街路・小路: 通り（`street`）。
  - 時代・文化圏（`roadSphere`）・財力（`roadMeans`）・湿地・山地・乾燥地は、敷地のFMGの都市情報と目標人口から決める。
- 水面の上の区間は除く（`dryRuns`）。橋の上は橋の量塊が描く。
- 描画データ（`vectorRenderData`）に`roads`を加えた。その段階で描く道路の所有者だけを含める。

3D（`scene3d.ts`）では、次のように描く。

- 道路は、旧CEの`createTownRoads`で描く。
- 旧CEの地面は`LAND_Y`（-0.2 m）にあり、路面はその5 cm上にある。メッシュなしの地面は基準高なので、道路のグループを0.2 m持ち上げた。
- 従来の道路の輪郭は、隠したまま残す（`visible = false`）。
  - 描画とGLBの出力には含まれない。
  - 選択の光線は当たるので、道路・記録の線のIDによる選択（M9、S2.1d）は保たれる。

### 住宅はP3へ回した

旧CEの住宅の部品（遠景の簡略化`createTownRegionalHouseLod`、建物の細部`createTownBuildingDetails`）は、量塊と外観を付けた区画を受け取る。量塊と外観は、旧CEの文書から文化・時代・セルの区分を読んで決まる（`assignBuildingMassing`、`assignBuildingAppearances`）。これはロードマップのP3（住宅の外観と高さ）そのものなので、住宅の描画はP3で合わせて行う。

### テスト

- `renderers/vector/structureMassing.test.ts`に1件を加えた。
  - 道路の帯ができること。
  - 帯の区間の中点が水面にないこと。
  - 3Dで道路の輪郭が隠れ、旧CEの路面の部品が見え、地面より上にあること。
- 関連テストは134ファイル中121成功・10 skip・3失敗だった。失敗の3件は、P2aと同じく以前からのものである。
- 型検査・biome・アーキテクチャの検査はエラーなしである。

## P2c-1 水面を旧CEの水面・岸の部品で描く（2026-11-09）

P2cは水面・地形・樹木である。今回は平坦な敷地の水面を扱った。樹木と地形は次に回す（後述）。

### 水面

`city3d/three/waterMeshes.ts`に`createTownWaterParts`を追加した。

- 旧CEの`createTownWater`の平坦な場合と同じ部品で描く。
  - 水面: `waterSurfaceGeometry`の上面。内水は`WATER_Y`（地面の1 m下）、海は地面の`seaDropMeters`（既定1 m）下。
  - 色: `TOWN_WATER_COLOR`。
  - 岸: `bankMesh`の岸の側面（地面の色）。
- 入力は分類済みの`TownWaterPart`だけで、旧CEのセルの文書を読まない。`createTownWater`の動作は変えていない。

メッシュなしの描画データ（`vectorRenderData`）に`water`を加えた。

- その段階で描く`river`の面から作る。種類は、川の道・川に結び付いた水面が`river`、`fmg-coast:`が`ocean`、それ以外が`lake`である。
- 起伏のある敷地と港のある敷地では作らない。起伏の川（`riverHydraulicMesh`・岸壁）はP8、港の水面はP5で扱う。

3D（`scene3d.ts`）では、次のように描く。

- 地面に水面の穴を開け、その下に旧CEの水面と岸を置く。旧CEの地面は`LAND_Y`にあるので、道路と同じく0.2 m持ち上げた。
- 島を含む水面は、三角形に分けて部品へ渡す（`TownWaterPart`の輪郭は穴を持たないため）。三角形どうしの辺は両側が水なので岸が立たない。
- 従来の水面の平面は、隠したまま選択の対象として残す。

### 次に回したもの

- 樹木（`openSpaceTreeLod`・`forestMeshes`・季節）: 旧CEの樹木はカメラに応じて詳細度を切り替える（`update(camera, viewportHeight)`）。メッシュなしの3Dビューにこの更新の呼び出しと月の状態を加える必要があるので、別の区切りとする。
- 地形（`terrainFieldMesh`・`groundSurfaceGeometry`）: 旧CEの地形の部品はセルの文書と`CityTerrain`を読む。メッシュなしの起伏は独自の`vectorTerrain`なので、P8で扱う。

### テスト

- `renderers/vector/structureMassing.test.ts`に1件を加えた。川が`river`として渡ること、水面が地面の1 m下にあること、岸があること、水面の平面が隠れて選択できること、地面に穴があること。
- `renderers/vector/renderData.test.ts`の「地面より下に何もない」の確認を、水面の深さまでに改めた。
- 関連テスト（`renderers/vector`、`city3d/three/waterMeshes`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`）はすべて成功した。
- ブラウザでの目視は、この環境にPlaywrightのChromeがなく行っていない。

## P2c-2の移動（2026-11-09）

樹木の詳細度の切り替えと季節（P2c-2）は、P6（墓地・公園の樹木、`openSpaceMeshes`）とP7（森林、`forestMeshes`・`treeSeason`）へ移した。メッシュなしのランダム生成は樹木を作らないため、P2の時点では確かめる対象がない（2026-11-09指示）。

## P3a 住宅を旧CEの量塊の規則と部品で描く（2026-11-09）

P3（住宅の外観と高さ）を2つに分けた。P3aは、住宅の階数はそのままに、壁・屋根・色を旧CEの規則と部品で描く。高さの変化・高さの上限・建物パターン・外観の型（`buildingAppearance`）はP3bで扱う。これらは住戸の容量を変えるので、生成の側の変更が要る。

### 旧CEの規則をセルから切り離す

| 関数 | 内容 |
| --- | --- |
| `massingContext`（`buildingMassing.ts`） | 時代・生態域・文明（信仰・築城）・seedから、気候（乾燥・森林）と伝統（地中海・東アジア）を決める |
| `lotMassing`（同） | 壁の材料、屋根の材料・形・勾配・棟の向き、張り出し、軒高、色の揺らぎ |
| `lotFloorSpecs`（`buildingFloors.ts`） | 用途ごとの階高（地上階3.2 m、上階2.9 mなど）。高さの変化は含まない |

旧CEの`assignBuildingMassing`と`buildingFloorSpecs`は、これらを呼ぶだけになった。処理の移動のみで、旧CEの関連テスト（`buildingMassing`・`buildingHeightLimits`・`buildingHeightPolicy`・`cityMeshes`・`regionalHouseLod`）は変更なしで成功した。

### メッシュなしの住宅

- 描画データの住宅（`houses`）に、住宅ごとの`massing`を加えた。
  - 時代は文書の`context.historicalPeriod`、生態域と文明は敷地のFMGの都市情報（`site.descriptor`）から読む。
  - 住宅は用途`main`の住居とし、階数は記録の階数のまま。
  - 色の揺らぎの鍵は住宅のID。
- 3Dは、全住宅を旧CEの`createCityMassing`で描く（壁1つ・屋根1つのメッシュ）。
  - 住宅ごとの三角形は連続しているので、頂点の`buildingIndex`から従来と同じ住宅の表（`fabricHouses`）を作り、選択と選択枠に使う。
  - 従来の角柱の住宅は、`massing`のある住宅では作らない。
- 軒高は旧CEの階高に合わせて、従来の1階3.2 m一律から、地上階3.2 m・上階2.9 mになった。屋根の分だけ全体は高くなる。

### 時間

5万人・8,930戸の都市（後期中世、楕円の市壁）で、3Dのシーンの構築は1,991 msから3,701 msになった。増えた分は旧CEの壁と屋根の組み立て（`buildingSurfaces`）で、旧CEでも同じだけかかる。描画データの作成は465 msから478 msだった。壁・屋根の組は、木骨・草葺きの切妻6,195、寄棟2,349、陸屋根386だった。

### テスト

- `components/vector/fabricHouseSelection.test.ts`を、壁と屋根のメッシュから全住宅が選択できることに改め、量塊の階高と勾配屋根の割合の確認を加えた。
- 関連テスト（`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、旧CEの量塊・高さ・`cityMeshes`・`regionalHouseLod`、アーキテクチャ）は96件中94成功・2 skipだった。
- ブラウザでの目視は、Chromeがなく行っていない。

## P2a〜P3aのブラウザーでの目視（2026-11-09）

M4 Mac miniのPlaywright Chromium（Vite開発サーバー）で、単独起動のメッシュなし（Generation method: Meshless）を5,000人で生成し、3Dで確かめた。

- P2a: 市壁の帯・円形の塔・門の両側の塔と楣・橋の欄干が、旧CEの量塊で描かれた。水門の開口も切れている。
- P2b: 街道・幹線・通りの路面の帯が地面の上に描かれ、橋の上には描かれない。
- P2c-1: 川の水面が地面より下にあり、岸の側面が立つ。
- P3a: 住宅が壁・屋根（切妻・寄棟）の量塊で描かれた。
- コンソールのエラーは、開発サーバーにない`favicon.ico`の404だけだった。
- 寺院（`catalogue:basilica-temple`）は従来どおり外形の押し出しである（構造物化はP6）。

## P3b 住宅の高さの変化・高さの上限・建物パターン・外観の型（2026-11-09）

生成アルゴリズムを`vector-urban-v10`に上げた。保存済みの文書は保存形状のまま表示する。

### 旧CEの規則をセルから切り離す

| 関数 | 内容 |
| --- | --- |
| `sampleStoreysFromWeights`（`buildingHeightPolicy.ts`） | 時代の階数の重みから階数を引く。街区で1回引き、15%の住宅は単独で引く |
| `heightSeed`（同） | 高さの乱数の系列（`<seed>:height-v1`） |
| `varyFloorHeights`（`buildingFloors.ts`） | 住宅ごとの階高の揺らぎ（全体±5%、階ごと±3 cm） |
| `storeysWithinLimit`（`buildingHeightLimits.ts`） | 階数・高さの上限に収まる最大の階数 |
| `automaticHousingProfile`（`standaloneHousingAppearance.ts`） | 外観の型を選ばない都市の自動の型（FMGの都市は伝統、なければ気候。単独起動はseed） |

旧CEの関数はこれらを呼ぶだけになった。旧CEの関連テスト（高さの方針・上限・量塊・外観・`townFacts`）は変更なしで成功した。

### メッシュなしの住宅

`generators/vector/generation/housingHeights.ts`を追加した。設定は文書の`context.requestedSettings`から読む。

- 高さの変化: `buildingHeightPolicy`があり、時代と伝統が対応する場合（中世3期と大航海時代）に有効。
  - 旧CEの面（セル）の代わりに街路街区のIDで1回引く。住宅の鍵は街路街区IDと区画の抽選値。
  - 市壁の外の街路街区は旧CEの郊外（`outside`、1〜2階）の重み、内は通常（`ordinary`）の重み。
  - 商業・富裕の重みは、地区の用途を作るP6で扱う。
- 高さの上限: `buildingHeightLimit`の階数・高さで、揺らぎを含む階高から階数を絞る。住宅は最低1階とする。
- 住戸容量: 住宅ごとの階数から計算し、必要量に達するまで区画を採用する（従来どおり）。敷地の大きさは平均の階数で見積もる（`expectedVectorHouseStoreys`）。
- 旧CEの人口圧による階数の引き上げ（`fitMorphologyHeightDistribution`）は移していない。FMGの都市成長の情報を要し、メッシュなしは敷地の大きさで容量を合わせるため。
- 3Dの階高は、保存した階数と同じ鍵の揺らぎで描く。
- 外観の型: 旧CEの高品質時の自動の型と同じ規則で、地域の屋根材（`regionalRoofMaterial`）と壁・屋根の色（`resolveBuildingAppearance`）を決め、街路街区ごとに屋根の色数を8に絞る。型・気候・壁の仕上げを選ぶ操作は、操作の行（`building-appearance-controls`）として残る。
- 建物パターン: 旧CEの「人口に応じた施設」（`facilityLayout: population`）は施設モード、medievalは外周の区画とした。legacy（旧CEのセルの街区の埋め方）に当たるものはなく、外周の区画を作り、未対応の設定として表示する。

### その他

- 生成設定に`undefined`の項目（高さを一律にした場合など）があると、`requestedSettings`の検査で文書が不正になっていた。JSONとして保存し、`undefined`の項目は省くようにした。

### ブラウザーでの目視

既定の設定（高さの変化あり）で5,000人を生成し、3Dで階数の違う住宅が街区ごとに並び、自動の外観の型の色で描かれることを確かめた。住戸容量は1,112／1,112で、未配置の人口は0だった。

### テスト

- `generators/vector/generation/housingHeights.test.ts`（2件）を追加した。
  - 後期中世で1〜4階が現れ、時代の上限を超えない。住戸容量の合計が報告と一致し、全員が住む。
  - 3Dの階高が揺らぎ、全住宅に旧CEの外観（legacy以外）がある。
  - 方針がなければ標準の階数のまま。階数の上限2、高さの上限7 mで2階までになる。
- 関連テスト（`generators/vector`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、旧CEの高さ・量塊・外観・`townFacts`、`city3d`、アーキテクチャ）は56ファイル中49成功・7 skip（計測用）だった。
- 型検査（CE・`buildings`・`city3d`の範囲。他の拡張にはTypeScript 7移行による既存のエラーがある）・biome・アーキテクチャの検査はエラーなしである。

## P4a 市壁の形状・辺数・材質（2026-11-09、`vector-urban-v11`）

P4（市壁・防御の生成）を次の区切りに分けた。P4a 形状・辺数・材質、P4b 二重・取り壊し・内側先行、P4c 稜堡式の町と堀、P4d 町割り4種、P4e 城・城塞と堀。

### 旧CEの規則の再利用

旧CEのskeleton-first生成の市壁の形（`generation/skeleton/wallShapes.ts`の`unitWallShape`・`resolveWallShape`・`bastionEra`）はセルに依存しないので、そのまま呼ぶ。材質は`resolveWallMaterial`と同じ規則（指定がなければ1,500人以上で石造）とした。

`generators/vector/generation/wallShape.ts`を追加した。

- `vectorWallChoice`: 旧CEの設定（市壁の有無・`wallShape`・`wallSides`・`config.wall.material`・人口）から、形状・辺数・材質を決める。`auto`はseedで引き、稜堡形は大航海時代以降だけ。
- `vectorUnitWallRing`: 単位の外形。最も遠い頂点を半径1にそろえ、敷地の外接矩形に合わせて置く（従来の楕円と同じ範囲）。
- 骨格の設定（`VectorGenerationSettings`）に`wallSides`・`wallMaterial`を加え、`wall`に6種を加えた。保存・共有の検査も受け付ける。

### 生成

- 敷地の大きさ: 形の面積が円より小さい分（方形で約0.64）、敷地の半径を面積比の平方根の逆数だけ広げ、壁の内側の面積を従来の円に合わせた。
- 壁の厚さ: 石造4.5 m、木造2.4 m（旧CEの`edgeGroupStyle`）。3Dの壁の量塊も材質で変わる。
- 河川・道路との交差: 旧CEは川の所で壁を直角に付け替える（`squareRiverCrossings`、セルの上の処理）。メッシュなしでは外形を16段階回し、道路・川・入口の道路の延長がいずれも20°以上で壁と交わる向きを選ぶ。
- 入口の道路: 方形の辺は中心から半径の0.71倍の所を通るので、外部道路の端が壁の外や門の中に残る。その道路は、中心へ向けて壁のすぐ内側まで延ばす（`auto-approach:*`、川を横切る延長は作らない）。門は従来どおり交差から作る。
- 住宅の区画: 門の開口と道路の接続点の円盤には、検証と同じ厳密な重なり判定で区画を置かない。壁の形が川の水門や道路の端に住宅を近づけるため、検証で`gate-access`・`junction-site`になる場合があった。
- 経路探索: 壁の形と敷地の縁の間にできる、単純化すると3点未満になる細片の土地は経路の対象から外す（従来は`offset-split`で生成が失敗した）。
- 生成パネルの市壁の欄に6種を加えた。旧CEの設定から開いた場合はその設定で決め、パネルで市壁を選び直した場合はそちらを使う（敷地の大きさは旧CEの設定のまま）。

### 確認

- 既定の設定（5,000人、`auto`）でseed 40件、1,000人・20,000人で各20件、6種×11件の生成（骨格と住宅）がすべて成功した。比較として、同じ40件を従来の楕円で生成してもすべて成功した。
- ブラウザー（Playwright Chromium）で`auto`（円形）、方形、稜堡形の5,000人を生成し、3Dで壁・塔・門が形に沿い、未配置の人口が0であることを確かめた。修正の前は、`auto`のseed `10usg4n`が`offset-split`で失敗していた。

### テスト

- `generators/vector/generation/wallShape.test.ts`（3件）を追加した。
  - 形状・辺数・材質の決め方（市壁なし、木造、高中世に稜堡形を引かないこと）。
  - 6種すべてで、閉じた石造の壁ができ、壁の内側の面積が敷地の55%を超え、通行用の門があり、3,000人が全員住む。
  - 木造の壁の厚さと3Dの材質。
- 関連テスト（`generators/vector`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、アーキテクチャ、`i18n`）は55ファイル中48成功・7 skip（計測用）。
- 型検査（CE・`i18n`の範囲）・biome・アーキテクチャの検査はエラーなし。

## P4b 二重市壁・取り壊し・内側先行（2026-11-09、`vector-urban-v12`）

### 設定の受け渡し

`vectorWallChoice`が旧CEの`townWallRings: double`・`walledAreaShare`・`innerWallState`・`townWallBuildOrder`を読み、骨格の設定`innerWall`（`share`・`state`・`order`）にする。旧市街の面積比は旧CEの`innerWalledAreaShare`と同じく既定45%。

### 生成

旧市街の壁は、外側の市壁と同じ外形を中心から面積比の平方根で縮めたもの（`auto-inner-wall`）で、外側の回路の子の回路とする。

- 外側先行（既定。旧CEの歴史的な順序）: 街路を敷いた後に旧市街の壁を置き、街路が横切る所に門を作る。
  - 線は、面積比を最大で数十%太らせ・細らせて、次をすべて満たすものを選ぶ。
    - 交差の角度が20°以上。
    - 門が角から離れている。
    - 門どうしが重ならない。
    - 門が施設・予約地に掛からない。
  - 施設に掛からない線を優先する。広場・寺院の区域が旧市街に収まらない場合は、壁が区域を通る線も認める（門は掛けない）。
  - 候補ごとに実際に門を作って文書を検証し、通らなければ次の候補を試す。
  - どの線も通らなければ旧市街の壁を作らず、診断`inner-wall-unplaced`を出す。旧CEが単一の市壁へ戻すのに当たる。
- 内側先行: 街路より先に旧市街の壁を置き、入口の道路を壁の内側まで延ばして門を作る。街路はその門だけを通って旧市街に入る。
  - 川が壁の間の環を切ると、入口の道路の届かない土地が残ることがある（`fixed-port-unreachable`）。その場合は外側先行でやり直し、診断`inner-first-fallback`を出す。
- 取り壊し（`razed`）: 旧市街の線を、幹線と同じ幅の環状の道路（`auto-boulevard:*`）にする。水面とその離隔に掛かる所で切る。街路は自由に横切る。
- 外側の市壁: 回転を48段階に細かくした。幾何の条件を満たす回転を先に試し、実際に門を作って検証が通らなければ次の回転に移る。P4aでは稜堡形の一部のseedで門が角に掛かり、`gate-width`で失敗していた。
- 経路探索の後に旧市街の壁を置くため、市壁の作成は広場・寺院への接続の後に移した。

### 確認

既定の設定（5,000人、形状`auto`）の二重市壁でseed 20件ずつ生成した。

| 設定 | 成功 | 旧市街の壁あり |
| --- | --- | --- |
| 外側先行 | 20/20 | 16 |
| 内側先行 | 20/20 | 18（外側先行への戻りを含む） |
| 取り壊し | 20/20 | 環状の道路 2〜3本 |

- 旧市街の壁を置けなかったのは、主に稜堡形の外形で、角に門が掛かる場合である。
- 単一の市壁でも、同じseedの60件がすべて成功した。
- ブラウザー（Playwright Chromium）で多角形の二重市壁の5,000人を生成し、3Dで二重の壁・塔・門を確かめた。未配置の人口は0だった。

### テスト

- `generators/vector/generation/doubleWalls.test.ts`（3件）を追加した。
  - 外側先行で、子の回路・面積比・旧市街の門・全員の居住を確かめる。
  - 内側先行の壁と、取り壊しの環状道路を確かめる。
  - 置けない場合に壁を作らず診断を出すことを確かめる。
- P1の試験で「未対応の設定」の例に使っていた二重市壁を、堀（`moats`）に替えた。
- 関連テスト（`generators/vector`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、アーキテクチャ、`i18n`）は56ファイル中49成功・7 skip（計測用）。
- 型検査（CE・`i18n`）・biome・アーキテクチャの検査はエラーなし。

## P4c 稜堡式の町（2026-11-09）

### 旧CEの計画器の再利用

旧CEの稜堡式の町の計画（`bastionedTown/plan.ts`）は、骨格の入力（`SkeletonInputs`）だけを読み、セルを使わない。そこで`planBastionedTown`を分け、入力から計画する`planBastionedTownFromInputs`を公開した。旧CEは従来どおり`prepareSkeletonRun`で入力を作ってこれを呼ぶ。

### メッシュなしへの採用

`generators/vector/generation/fortress.ts`の`fortifyVectorInput`を追加した。旧CEの防御を変換して採用する方式（M9）と同じく、入力の形状として採用する。

1. メッシュなしの敷地から骨格の入力を作る。
   - 中心・半径は敷地から取る。
   - 道路は外部道路で、中心側を先頭にする。
   - 川・湖、時代の橋の角度の上限、稜堡の時代を入れる。
   - 枠は旧CEの`fortressFrameExtent`で広げる。
2. 計画器で、外形・門・経路・工事を得る。
3. 文書を組み立てる。
   - 外形は固定の市壁（`fortress-wall`）とし、経路が通る門を作る。
   - 外部道路は計画の経路で置き換える。
   - 門の経路は、町の中では敷地半径の0.85倍で止め、中心までは骨格の経路探索に任せる。合成の敷地の外部道路と同じ扱いで、中心の広場・寺院を避けるため。
   - 環状の街路は残す。organicの町割りの弦は、稜堡を切るものと町の中に入るものを作らない。
   - 工事は固定の防御プラン（`environment.defenses`）とする。対象は稜堡・幕壁・外堡・堀・掩護道・斜堤・通路で、稜堡と幕壁の壁区間は外形の線分のアンカーで持つ。
   - 市民の通路は、予約地として中心の街路の集まりを塞がないよう、門の手前の陸の点だけを残す。
4. 文書を検証する。通らなければ旧CEの失敗理由（`fortress-*`）で生成を止める。生成パネルは旧CEの失敗の文言を示す。

`vectorWallChoice`は稜堡式の町では骨格の市壁を作らない（`wall: none`。既存の壁を保つ）。敷地の大きさの見積もりからは、防御の予約地を除く（工事は町の円の外にある）。

### 対応する範囲

| 設定 | 対応 |
| --- | --- |
| 外堡 none／ravelins | 対応 |
| 堀 dry／wet | 対応（水堀は閉じた水盤） |
| 町割り radial／organic | 対応。organicの町の中の弦は骨格の経路に任せる |
| 川・海岸が工事を横切る | 未対応。水門（`sluices`）の採用はP5。`fortress-water-conflict`で止める |
| FMGの都市 | 未対応。外部道路が固定で経路に置き換えられない |

旧CEの既定の敷地には川が1本あるため、稜堡式の町は川を0本にした場合だけ生成できる。

### その他

- 多角形の演算（polygon-clipping）が、ほぼ重なる辺で`TypeError`を出すことがあった。従来の再試行（座標を微小な格子に丸めてやり直す）の対象に加えた。

### 確認

- 外堡2種×堀2種×町割り2種×seed 5件の計40件で、入力・骨格・住宅・描画データがすべて成功し、全員が住んだ。
- 川のある敷地では`fortress-water-conflict`で止まった。
- ブラウザー（Playwright Chromium）で、川0本・稜堡式（ravelins・乾堀・radial）の5,000人を生成した。3Dで次を確かめた。
  - 稜堡・幕壁・外堡・堀・橋と、内側の町。
  - 未配置の人口は0。
  - 旧CEの砲兵規格の離隔（`urbanSetback`）により、町と工事の間に広い空き地が残る。

### テスト

- `generators/vector/generation/fortress.test.ts`（2件）を追加した。
  - 外形・門・経路・工事の採用、市民の通路の門と道路の参照、骨格と住宅の生成、描画データ。
  - 水堀、organicの町割り、川のある敷地での失敗。
- 関連テスト（`generators/vector`、`generators/bastionedTown`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、アーキテクチャ、`i18n`）は60ファイル中53成功・7 skip（計測用）。
- 型検査（CE・`i18n`）・biome・アーキテクチャの検査はエラーなし。

## P4c-2 通常の市壁の堀（2026-11-09）

旧CEの`moats.town`を読み、骨格の設定`townMoat`にする。

### 生成

外側の市壁の外に水堀（`auto-moat`）を置く。

- 形と寸法:
  - 幅は旧CEの町の堀と同じ12 m。
  - 壁の足元から6 mの犬走りを空けた、閉じた水路とする。
  - 外形は壁の線を外へずらしたものである。
- 橋: 道路が堀を横切る所ごとに、まっすぐな橋（`auto-moat-bridge:*`）を架ける。材質は壁の材質に合わせる。
- 河川と橋の規約: 橋の角度は文書の検証（共通の`bridgeSkewPolicy`）で判定する。上限を超える橋を作らないよう、市壁の回転の試行に堀と橋を含め、通らなければ次の回転を試す。
- 置けない場合: どの回転でもすべての道路が堀を正しく渡れなければ、堀のない市壁とし、診断`town-moat-unplaced`を出す。
- 他の処理との関係:
  - 堀には骨格の川の橋（中心に最も近い1か所）を架けない。
  - 住宅は他の水面と同じく堀に置かない。
  - 城の堀はP4eで扱う。

### 確認

- 既定の設定（5,000人、形状`auto`、川1本）に`moats.town`を加え、seed 30件で生成した。
  - 30件中29件で堀と3〜4本の橋ができた。うち3件は二重市壁。
  - 1件（稜堡形の外形）は、突角が道路と斜めに交わり、堀なしの診断になった。
  - 全件で生成・住宅・描画データが成功し、未配置の人口は0だった。
- ブラウザー（Playwright Chromium）で、旧CEの「Town wall outer moat」をオンにして5,000人を生成した。3Dで、壁を囲む水堀と各道路の橋を確かめた。

### テスト

- `generators/vector/generation/townMoat.test.ts`（2件）を追加した。
  - 堀の幅・橋・壁との非重複・全員の居住。
  - 置けない場合の診断。
- 関連テストは61ファイル中54成功・7 skip（計測用）。型検査・biome・アーキテクチャの検査はエラーなし。

## P4d 町割り circulade・bram（2026-11-09）

### 旧CEの計画器の再利用

旧CEのcirculade（`planCirculadeLayout`）とbram（`planPolygonalCirculadeLayout`）の計画器は、中心と半径とseedから、次を返す。セルは使わない。

- 環状の街路
- 放射状の路地
- 中心を通る街路
- 小さな広場と寺院

### 生成

- 設定: `vectorWallChoice`が旧CEの`layout`（`config.layout`）を旧CEの`resolveEffectiveLayout`で解決し、骨格の設定`layout`にする。
  - `auto`は700 m以下の地図でだけcirculade・bram・organicから引く。
  - circulade・bramでは、旧CEと同じく二重市壁にしない。
- 骨格: 経路探索の前に、敷地の中心を中心として、建物の円（旧CEの`urbanDiskRadiusMeters`）に合わせた計画を敷く。
  - 環と放射は副道の幅、中心を通る街路は幹線の幅とする。
  - 水面・広場と寺院の区域・壁・敷地の縁に掛かる所で切る（`layRoadRuns`。P4bの取り壊しの環状道路と共通にした）。
  - 経路探索の街路は、交差する所で環と放射に接続する。
- 広場と寺院: メッシュなしは人口に合わせた自前の中心（P0b）を保つ。計画器の小さな広場と寺院は使わず、環は中心の区域の所で途切れる。中心の施設の規則はP6で扱う。
- classic（旧CEの街区の中を格子状に埋める方式）は、住宅の区画の生成器の側の作業なので、P4eの後に回す。

### その他

- 共有の検査（`share.ts`）が、P4c-2で加えた骨格の設定`townMoat`を受け付けていなかった。堀のある都市のrecipeの共有が拒否されていたので直し、`layout`と合わせて受け付けるようにした。

### 確認

- circulade・bram各15件（5,000人、一部1,500人、形状`auto`、川1本）で、生成・住宅・描画データがすべて成功し、未配置の人口は0だった。
  - 環は4〜8本、放射は3〜5本の区間に分かれた。川・中心の区域で切れるため。
- ブラウザー（Playwright Chromium）で、旧CEの町割りにcirculadeとbramを選び、5,000人を生成した。2Dで同心の環と放射を確かめた。

### テスト

- `generators/vector/generation/concentricLayout.test.ts`（3件）を追加した。
  - `auto`の解決と、二重市壁にしないこと。
  - circulade・bramそれぞれで、環・放射・中心の街路が敷地の中にあり、全員が住むこと。
- 関連テスト（`generators/vector`、`generators/bastionedTown`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、アーキテクチャ、`i18n`）は62ファイル中55成功・7 skip（計測用）。型検査・biome・アーキテクチャの検査はエラーなし。

## P4e 城・城塞と堀（2026-11-09）

### 旧CEの規則の再利用

- 城の様式の部品（`castleLayoutBuilder.ts`）を、セルの文書を読まない`buildFortressPlanOnRing`として公開した。
  - 入力は幕壁の輪と門の点と様式。
  - 返すのは、様式ごとの天守・館・塔・門・中庭。
  - 旧CEの`buildFortressPlan`はこれを使う形に分けた（海に張り出す稜堡の除外は旧CEのセルを読むので旧CE側だけに残る）。
- 様式の決め方（`resolveCastleStyle`）は、時代・文化・埋葬の型だけを読む型にした。

### 生成

`generators/vector/generation/castle.ts`・`castleChoice.ts`を追加した。

- 設定:
  - 旧CEのcitadel（FMGの都市ではburg.citadel）を読む。
  - `castle`の位置・大きさ・様式を読む。
  - `moats.castle`を読む。
- 区域の予約（街路の経路探索の前）: 旧CEの立地規則をセルなしで適用する。
  - 大きさ: 町の半径120 m以下でsmall、それ以外はstandard。入らなければ一段ずつ小さくする。
  - 位置: 85%を縁、残りを中心寄りとする。
  - 向き: 外部道路の来る側（陸の正面）から離れた側を優先する。
  - 場所の条件: 町の壁の内側で、水面・道路・壁・中心の施設を避ける。
  - 置けなければ診断`castle-unplaced`。
- 城の構築（経路探索の後）: 予約した区域に城の地物を作る。
  - 幕壁・門・取付道路・堀（8 m、旧CEの城の堀幅）と橋は、既存の城の地物の生成で作る。
  - 中の部品は旧CEの様式で作り、区域に収まるものだけを残す。収まらない部分は地物の天守と角の塔で補う。
  - 城の道は生成の出力として記録する。
- 循環参照の解消: 生成から城の地物を作るため、地物の組み立てを`featureBuild.ts`に分けた。編集用の`addVectorFeature`は、都市の結果を外してからこれを呼ぶ。

### 未対応

- 町の外に離れた城（detached）。メッシュなしの敷地は町だけを持つため。
- 起伏による立地。
- 城の形（form）・地盤（ground）の設定。
- 旧CEの城の3D部品。現在は地物の量塊として描く。

### 既存の問題（今回の変更の前から）

広場・寺院のある文書の骨格を、同じ文書から再生成すると、施設の取付けが外された道路を指して検証に通らない（`feature:feature:civic-plaza`）。生成パネルの「Generate city」は毎回入力を作り直すので、通常の操作では起きない。

### 確認

- 高中世（一部は大航海時代）、5,000人でcitadelをオンにし、seed 20件で生成した。
  - 全件で城ができ、生成・住宅・描画データが成功し、未配置の人口は0だった。
  - 城の堀ありの2件では堀と橋もできた。
- ブラウザー（Playwright Chromium）で旧CEの「Citadel」をオンにして5,000人を生成した。3Dで、町の壁の内側に幕壁・塔・天守・中庭・門を持つ城を確かめた。

### テスト

- `generators/vector/generation/castle.test.ts`（2件）を追加した。
  - 設定の読み取り。
  - 城の幕壁・門・堀・部品、道の生成の記録、全員の居住。
- 関連テスト（旧CEの城の生成・城のSVGを含む）は66ファイル中59成功・7 skip（計測用）。型検査・biome・アーキテクチャの検査はエラーなし。

## P4d classic 町割り（2026-11-09）

旧CEのclassicの町割りは、地区（セル）ごとに独立した街区の埋め方をする。`buildPerimeterBlocks`の`classic`で、ボロノイ状の近隣に住宅の列と路地を置く。この関数は外形と境界と乱数の種だけを読み、セルを使わない。

- 設定: `vectorWallChoice`が`layout: classic`を解決し、骨格の設定`layout`に`classic`を加えた。classicは同心の街路を敷かず、二重市壁も旧CEと同じく認める。
- 住宅: 外周の計画（`perimeter.ts`）の文脈に`classic`を加えた。
  - classicでは、地区ごとに有機的な街路を作らない。地区全体を1つの街路街区とし、`buildPerimeterBlocks`のclassicで路地と区画を作る。
  - 区画は従来どおり抽選値の順に採用し、高さ（P3b）と住戸容量で全員が住むまで置く。
  - 計画の鍵に`classic`を含め、organicの計画と混ざらないようにした。
- 違い: 旧CEはメッシュのセルごとにclassicで埋め、メッシュなしは骨格の地区ごとに埋める。地区がセルより大きいので、classicの近隣の分割が地区の中で行われる。

### 確認

- classicの12件（5,000人、1件は20,000人、川1本、形状`auto`）で、生成・住宅・描画データがすべて成功し、未配置の人口は0だった。住宅の生成時間は90〜320 msだった。
- ブラウザー（Playwright Chromium）で旧CEの町割りにclassicを選び、5,000人を生成した。2Dで、地区ごとのボロノイ状の近隣と路地、住宅の列を確かめた。

### テスト

- `generators/vector/generation/concentricLayout.test.ts`に1件を加えた。classicの解決、地区ごとに街路街区が1つであること、同心の街路がないこと、全員の居住を確かめる。
- 関連テスト（`generators/vector`、`generators/bastionedTown`、`blockInfill`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、アーキテクチャ、`i18n`）は65ファイル中58成功・7 skip（計測用）。型検査・biome・アーキテクチャの検査はエラーなし。

## P5a 合成の敷地の海岸・川（途中、2026-11-09）

### 状況の確認

旧CEの設定の海岸4種（none・straight・bay・cape）と、川の組8通りを2件ずつ、計64件で生成した。

- 川の組は、なし・through・beside・toCoast・straight・meander・greatBend・through+besideの8通り。
- 単独起動の敷地（川1本まで）以外は、旧CEの合成の都市情報（`synthSite`）を経る。

変更前に成功したのは6件だけだった。失敗の原因は次の2つ。

1. P4aの不具合: FMG・合成の都市情報の道路は中心まで届くので、入口の道路を延ばす処理で向きが0になり、`degenerate-tangent`で落ちた。中心に届く道路は延ばさないよう直した。
2. 合成の都市情報の道路が、川や海の上をそのまま通っていた（`unbridged-road`）。実際のFMGの都市は、認証済みの橋（`fixedCrossings`）を持つ。

### 旧CEの規則の再利用

- `generators/vector/generation/skeletonInputs.ts`（`vectorSkeletonInputs`）: メッシュなしの敷地から旧CEの骨格の入力（K1）を作る。
  - 旧CEと同じく、道路は中心から最初の乾いた区間だけを残す（`dryRuns`）。
  - 岸で切れる道路や岸で終わる道路は、路面が水に掛からないよう、半幅と余裕の分だけ手前で止める。
  - 乾いた区間のない道路は除く。
- `generators/vector/generation/syntheticCrossings.ts`（`bridgeSyntheticCrossings`）: 合成の都市情報にだけ、次を適用する。
  - 旧CEの`planSkeletonCrossings`で、時代の角度の上限に合わせて橋の足を川の法線へ向けた経路を得る。
  - 道路をその経路に置き換える。
  - 橋の位置では、道路を橋の長さより少し長くまっすぐ敷き直し、固定の橋を架ける。
  - 交点と道路網は新しい経路に付け替える。
  - 実際のFMGの都市（`settings.descriptor`あり）には適用しない。

### 結果

64件中41件が成功した（変更前は6件）。残りの23件の原因は次のとおり。

| 原因 | 件数の目安 | 内容 |
| --- | --- | --- |
| `bridge-skew` | 3 | 計画器の川の向き（中心線の弦）と、検証の川の向き（標本点）が蛇行で食い違う |
| `bridge-multiple-channels`・`bridge-landing` | 7 | 河口で橋が海の水面にも掛かる、川幅の変化で岸に掛かる |
| `unbridged-road` | 8 | 海岸沿いを走る道路の路面が海に掛かる。計画器が橋を出さない交差 |
| 交点・幅 | 4 | 敷き直した道路の交点が外れる（`node`）、川の幅の折れ（`width-fold`） |
| `gate-access` | 1 | 蛇行する川と市壁の交差が浅い |

診断用の生成の一覧は作業用の一時ファイルとして残した（リポジトリ外）。

### テスト

- 関連テスト（`generators/vector`、`generators/bastionedTown`、`renderers/vector`、`components/vector`、`CityEditorPage.vector`、`services/io/vector`、`services/vector`、アーキテクチャ、`i18n`）は63ファイル中56成功・7 skip（計測用）。
- P5aの試験は、残りの失敗を直してから加える。
