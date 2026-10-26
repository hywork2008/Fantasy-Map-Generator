# CE の地域別建物外観と軽量な 2D・3D 描画

2026-10-22。調査・設計。同日、実装順1の共通パレット・保存（§10）、実装順2の2D・3D配色（§11）、実装順3の近景ディテール（§12）、実装順4の特殊建物・共有BV描画（§13）を実装。

2026-10-26追補。現在のコードには5地域のBV詳細住宅とCEの置換経路が既に存在する。§1・§6の簡易形状維持は当初の方針であり、現在は適合する敷地を詳細住宅で置換する。今回、その住宅を敷地寸法・各階高に合わせた生成へ改め、葺き材と店舗・工房兼住宅の表現を補強した。実装範囲・確認結果・次の作業は§15にまとめる。

## 1. 採用する方針

**一般の街区建物は、現在の敷地に沿う簡易マッシングを維持し、屋根・壁の共通パレットで地域色を付ける。BV はその共通部品・色の確認と、近景・特別な建物の確認に使う。** BV はビューアであり、全棟を詳細モデルに置換することとは切り離す。

色だけでなく屋根材、勾配、木骨と明るい塗壁の区別を少数の属性で表す。一般住宅の新しい詳細モデル制作は、配色の第1段階の前提にしない。既存BVモデルも、CEへ使う場合はそのまま棟ごとに生成せず、必要な物だけ共有・統合する。

既存設計 [ce-3d-building-massing.md](ce-3d-building-massing.md) の導出型・決定論を継承する。[ce-3d-friary.md](ce-3d-friary.md) 等の固有施設は別の統合経路を維持する。

## 2. 現行コードで確認したこと

| 場所 | 現状と課題 |
| --- | --- |
| `src/city-editor/generators/buildingMassing.ts` | 階数確定後に材質・屋根形・勾配・tintを導出。`mediterranean` を faith から推定するため、北東欧の orthodox まで地中海扱い。中世木骨は原則 thatch で、北欧都市の瓦・板葺き等を表せない。arid の mudbrick に turf を割り当てる経路も意味が合わない |
| `src/city3d/three/cityMeshes.ts` | 全ロットを壁と屋根の2メッシュに結合。色は頂点属性なので色数を増やしても描画呼び出しは原則2回のまま。非インデックスの位置・法線・色・buildingIndexは合計40 bytes/頂点。広い都市では単一巨大メッシュの再構築とカリングが課題 |
| `src/city3d/three/palette.ts` | 材料別の固定RGBと tint。木骨壁全体が茶色で、明るい塗壁と暗い構造材を分離していない。RGB値は頂点属性へ直接渡され、Linear-sRGBとして扱われる |
| `src/city-editor/renderers/townFabricSvg.ts` | detailed は棟別path、light/minimal はface単位の複合path。minimalは一部の棟を省略。材質や色をキーにしていない |
| `src/city-editor/index.html`, `renderers/standaloneSvg.ts` | `.ce-building` は共に灰色 `#b2afa2`。画面とエクスポート双方の対応が必要 |
| `src/buildings/medieval/modelKit.ts` | BV住宅の部品は棟内では立方体と材質を共有するが、factoryを呼ぶ度に独立した資源と多数のMeshを作る。色はhex指定でthreeが線形空間へ変換 |
| `src/buildings/medieval/07-dwellingsModels.ts`, `45-jettied-housesModels.ts` | 石の茅葺き住宅・塗壁の瓦葺き住宅・張り出し木骨住宅が既存素材として使える。付属小屋・薪・庭等を含むモデルもあり、街区敷地への無条件の伸縮・配置には適さない |
| `src/city3d/three/friaryMeshes.ts` | BV共通部品を変換し、頂点色の1メッシュへ統合する前例がある |
| `src/city-editor/types/contracts/burgSiteDescriptor.ts` | 気温・biome・civilizationを受け取れる。ただしCityDocumentに独立した気温フィールドは無い。保存されたdescriptorだけに依存しない入力の正規化が必要 |

## 3. 史料に基づく範囲と視覚表現の提案

- 材料は緯度だけでは決まらない。地元の石、粘土、植物材料と輸送の利用可能性が屋根の地域差を生んだ。広域流通する近代スレートを中世全域へ配らない。[Historic England: Roof coverings](https://historicengland.org.uk/advice/your-home/maintain-repair/roofs/)
- 茅葺きは麦藁・葦など材料と施工の地域差があり、単一の黄色にはしない。新しい淡い藁色と風化した灰褐色を穏やかに混ぜる。[Historic England: Conservation of Traditional Thatch](https://historicengland.org.uk/advice/technical-advice/buildings/thatching-advice/)
- 北方の都市を全部茅葺きにしない。ロンドンでは中世から規制の例がある。ただしこの例を欧州全域の同一時期の禁止と解釈しない。[London Museum: Three myths about the Great Fire](https://www.londonmuseum.org.uk/collections/london-stories/myths-great-fire-london/)
- 地中海のテラコッタは実例を持つが、現在の屋根景観を中世の全建物の統計とはみなさない。Dubrovnik市の解説は木の下地とテラコッタ瓦の屋根の修復を扱う。[Grad Dubrovnik: Devastation and restoration of roofs](https://www.dubrovnik.hr/stradanje-grada/the-destruction-and-restoration-dubrovnik-1991-2000/devastation-restoration-roofs)
- ノルウェー中世の考古資料では芝土と木質の屋根が記録される。現存建物の現在の屋根材から創建時を断定できない。芝土屋根を現在の一律8°から独立させる根拠とする。[Bergen Archaeological Series: Medieval buildings](https://bora.uib.no/bora-xmlui/bitstream/handle/1956/15393/Olsen_UBAS8-artikkel.pdf?isAllowed=y&sequence=1)

以下のHEX値・勾配の範囲・配合は**ゲーム内の視覚設計の初期案**であり、史料から測定した色や実在都市の屋根材比率ではない。未校正の材料配合を史実の確率として公開しない。

| プロファイル | 屋根の候補とsRGB色 | 壁の仕上げとsRGB色 | 初期の勾配案 |
| --- | --- | --- | --- |
| Mediterranean | tile: `#A95F43`, `#B87350`, `#94523E` | limewash: `#DCCEB1`, `#E7DDC6`; limestone: `#B8AD94` | 瓦25–35° |
| Atlantic / temperate | thatch: `#A48B59`, `#8C7957`; tile: `#8F5442`; local slate: `#56616A` | plaster: `#D5C7A8`; frame: `#514132`; rubble: `#A29C8E` | 茅45–55°、瓦35–45° |
| Northern wooded | shingle: `#796B57`, `#665B4C`; thatch: `#958361`; turf: `#68704B` | timber: `#82705A`; infill: `#CEC2A7`; stone: `#A39F92` | 板35–45°、茅45–55°、芝土22–30° |
| Northern / Baltic urban | tile: `#95513F`, `#A76549`; shingle: `#746858` | brick: `#98634E`; plaster: `#D7C8AB`; frame: `#4B3C30` | 瓦35–45° |
| Local stone upland | stone/slate: `#686C69`, `#77756B` | local stone: `#AAA38E`, `#99988C` | 石・スレート30–45° |

これは文化全体の固定ラベルではなく、材料の利用傾向。北部・南部で複数の候補が重なり、密な都市中心と外周農家で配合が変わる。樹木のない寒冷地を自動的に木材豊富としない。初期段階では板葺きを `shingle`、草・葦を `thatch` として区別し、細分類は必要になるまで増やさない。

## 4. 共通データと選択規則

### 4.1 正本

`src/city3d` のthree依存パレットを直接SVGから参照せず、例えば `src/buildings/appearance/` に純粋な材質・仕上げ・パレット定義と選択関数を置く。2D・3D・BVが参照する。レンダラーでは乱数を引かない。

生成時に1回 `BuildingAppearance` を導出し、既存の `BuildingMassing` と同じ最終ロットへ付ける。最低限 `profileId`, `roofPaletteId`, `wallPaletteId`, `framePaletteId?`, `shadeBin`, `version` を持つ。材質・屋根形・勾配は既存massing側の値を正とし、二重に保存しない。2Dもこの導出結果を読む。

構造材と表面仕上げは別に扱う。`wall: timber-frame` を茶色一色にせず、塗壁の面を基色、木骨を暗いdetail色にする。全棟に木骨の立体部品を増やすのは後段。`timber-frame` と板壁/丸太壁も同一視しない。最初は仕上げ属性で区別し、構造をシミュレーションに使う段階で型を拡張する。

### 4.2 入力を解決する順序

1. 保存された明示的なcity/region外観指定を最優先。
2. `civilization.tradition`（latinMediterranean、norse、anglo等）から候補の重みを作る。faith、文化の表示名、地図上の緯度のみで地域を決めない。未対応の非欧州・fantasy文化は欧州へ強制せず既存相当へフォールバック。
3. 使用可能ならdescriptorの気温とdocumentのbiomeを正規化して補正。降水・地質・材料の採取量は現行入力に揃っていないため、存在することを仮定しない。森林・湿地などのtagは材料候補の弱い手掛かりに留める。
4. period、archetype、role、中心/外周の既存分類で材料を重み付け。富裕住宅や都市中心では瓦・地元の石系を増やし、農家・物置では植物材料を残す。「時代だけで全棟slate」「富裕なら必ず石壁」は避ける。
5. 防火規制は将来の明示的な政策入力。未実装の政策や経済市場が存在するものとして参照しない。初版は都市型プロファイルの配合で表現し、実在ロンドンの条例を世界共通ルールにしない。

材料選択・色揺らぎは専用salt `seed + stableLotId + appearanceVersion + channel` で決め、既存の生成乱数列や人口を動かさない。IDの無い旧lotはfaceと量子化した敷地形状から安定キーを作る。配列indexを新しい見た目のキーにしない。街区の基調色を先に選び、棟ごとの揺らぎは小さくする。

勾配は材質だけの固定値にせず、短辺幅・屋根高さ上限との整合を取る。現行の `assignBuildingMassing` は屋根の立ち上がりを4mに抑えるため、広い建物では表の範囲より浅くなる。茅葺きの排水に必要な勾配を確保できない巨大な一枚屋根は、短いスパンへの分割や別材料を選ぶ。単に色を茅色にして浅勾配の屋根を残さない。形状変更は配色だけの第2段階から分けて検証する。

### 4.3 保存と無効化

ロットと最終のmassingは従来どおり導出。CityDocumentには `buildingAppearanceVersion` と任意のプロファイル指定、必要な正規化済み気候入力だけを保存する。旧文書は既存の外観を維持し、利用者が更新を適用した場合にversionを付ける。新規生成は新versionを使用する。ワールドの文化・時代が後から変わっても、保存都市は入力更新を明示的に適用するまで維持する。

`documentFabricFingerprint` は現状、civilization/biomeの包括的な評価がruralFieldVersion条件の中にある。外観に使う入力・versionを条件に依存せずキーへ含める。長期的には地割り用キャッシュと外観用キャッシュを分け、色の変更で住宅配置まで再生成しない。3D側もfabric参照だけを更新条件にせず、appearance keyを持つ。

## 5. 2D 描画

- 真上視点は屋根色を面のfillにする。壁色を全輪郭へ塗ると地図の読解性が落ちるので、遠景は既存の細い輪郭を維持する。詳細時だけ一方の軒下の帯・木骨の暗色などを任意表示する。壁色の主たる表示は3Dで行う。
- light/minimal のキーを `faceId + roofPaletteId + shadeBin` にする。`shadeBin` は原則3段階、街区内の使用色は最大8色に量子化し、上限超過は最寄り色へ寄せる。棟数分のDOMノードへ戻さない。上限はfaceあたり8 path（選択して個別表示する棟・特殊建物は別）。
- detailed は棟別pathを維持し、属性/クラスで屋根色を指定する。lightをdetailedへ切り替えても同じ棟の色を維持する。選択・検査の強調、landmark、人口cluster、minimalの間引きは現行仕様を保つ。
- SVGのpresentation attributeは `.ce-building { fill: ... }` に負けるため、CSS変数（`fill: var(--ce-roof-color, #b2afa2)`）または共通クラスへ変更する。`standaloneSvg.ts` と画面のCSSを揃え、保存SVGにも必要な色と定義を同梱する。ランドマークの既存ルールと選択強調は個別に確認。
- 棟の小さいズームでは棟線・瓦模様・テクスチャを付けない。近景でのみ棟線や屋根面の2階調を検討する。その段階でも全棟に複雑なSVG patternを作らない。

## 6. 3D と BV の分担

| 用途 | 描画方法 | BVとの関係 |
| --- | --- | --- |
| 一般住宅、工房、倉庫の遠景〜中景 | 現行の敷地に沿うマッシングと頂点色。壁・屋根のバッチを維持 | 同じ屋根生成・外観resolverのプレビュー項目をBVへ追加。モデルを別に作り直さない |
| 一般住宅の近景 | まず棟・軒の陰影と明るい壁。必要なら窓・木骨を共有アトラスまたは少量の統合部品で足す | BV詳細モデルは寸法・色・ディテールの参照。全棟置換はしない |
| 選択中の建物、代表的な角家、目立つ施設 | 詳細モデルの共有prototypeを予算内で表示 | BVと同じfactoryの出力を一度だけbake。見えない内部や庭・薪等の付属品をCE用に除外できる契約が必要 |
| 多数ある同形の小施設 | prototypeを材質別または頂点色に結合しInstancedMesh | instanceIdとlotIdの対応を保持 |

一般ロットは不整形・連続した街路壁を持つ。箱型BVモデルを非等方に伸ばすと窓・屋根勾配が歪み、付属物が道路へはみ出す。モデルの外形・張り出し・接地・向きが敷地へ収まる場合のみ使い、それ以外は簡易形状へ戻す。

材質の色を増やすためにMeshやMaterialを棟ごとに増やさない。パレットの正本はsRGB HEX、threeの頂点色・instance色へは `THREE.Color(hex)` 等を通してLinear-sRGBへ変換する。現在の配列RGBを無変換でHEXへ置き換えると見かけの明るさが変わるため、照明を固定して比較する。2Dは無照明、3Dは照明付きなので、画素の完全一致は要件にしない。[three.js Color Management](https://threejs.org/manual/pages/color-management.html)

BVモデルのcloneは資源を共有してもMesh数・描画回数を減らさない。InstancedMeshは同形・同材質の反復に適するが、三角形数自体は減らさない。再配色が必要なら壁・屋根・木骨を別bucketとし、型の数とbucketの数を抑える。共有prototypeのgeometry/materialをinstanceの削除時にdisposeしない。資源管理は都市単位の所有者にまとめる。[three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)

広い都市向けの街区/chunk分割・LODは後段。色だけの変更では全geometryを作り直さず色バッファのみ更新する。分割はカリングと編集更新を改善する一方draw callを増やすため、実際の画面で判断する。詳細表示候補の暫定予算は同時50棟、追加50 draw calls、追加10万triangles以下とし、計測して調整する。これは測定済み限界ではない。

## 7. ベンチマーク

再現用コマンド:

```sh
node --import tsx scripts/benchmarkCeBuildingAppearance.mts
node --import tsx scripts/benchmarkCityEditorRendering.ts --size=small --pattern=medieval --seed=regional-appearance --out=/tmp/ce-regional-2d
```

3Dの生データ: [ce-building-appearance-benchmark.json](../analytics/ce-building-appearance-benchmark.json)。2D: [ce-building-appearance-2d-baseline.json](../analytics/ce-building-appearance-2d-baseline.json)。

### 7.1 測定方法と制約

- 単一seed `regional-appearance`、small/evolution/medieval（建物配置パターン）、時代は既定の `ageOfExploration` で実際に生成し、massingのあるロットを採取。描画比較はそのロットを繰り返して格子上へ並べ直す。全市の道路・水面・施設・地形を含む実時間測定ではない。
- BVは既存 `stone-cottage`, `plastered-small-house`, `jettied-town-house` を均等に混ぜる。元のモデルの庭・薪等も含む。CE簡易形状と同じ詳細度・敷地形・高さではない。
- `bv-factory`: 毎棟factory生成。`bv-clone`: 3種類だけ先に生成してobjectをclone、geometry/material共有。`bv-instanced`: 3種類の部品を材質別にbakeしてInstancedMesh。bakeの際は使用しないUVを除去して頂点属性を揃える。bakeの時間も各ケースのbuildに含める。
- 100/1,000/5,000棟。ただし毎棟生成とcloneは1,000棟まで。各方式を1回warmupし、順番を回しながら3回測定。1回のrenderは7回の描画の中央値。集約値はこの3標本の中央値。
- Chromium headless、1000×720、DPR=1、antialiasあり、影なし。CEと同じLambertと光源設定。全棟のカリングを無効にして提出量を比較。初回renderにはshader準備とbuffer upload等が含まれる。
- render時間はCPU時計＋`gl.finish()`による完了待ち。GPU単体時間や操作時のFPSではない。ソフトウェアGPUでの結果を実機GPUの速度へ外挿しない。
- bufferBytesは重複を除いたgeometry属性・index・instance行列のバイト数。JS配列・Object3D・driver overhead・総VRAM・peak heapは含まない。CEの生成途中のnumber配列の一時領域も含まない。
- 実行環境のNodeはv22.23.1（projectの宣言は>=24）。ブラウザー内の描画比較は可能だが、Node生成時間は公式サポート環境の基準値としない。初回都市生成・fabric時間は参考値1回のみ。

### 7.2 2D の既存実装

smallで131 faces、515棟。Node + jsdomによるSVG構築時間（layout/paintを含まない）、warmup後3回の中央値。

| quality | 建物path数 | 表示棟数 | SVG全体のnode数 | SVG bytes | 構築ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| detailed | 515 | 515 | 9,941 | 4,037,153 | 166.53 |
| light | 35 | 515 | 8,147 | 1,660,488 | 126.94 |
| minimal | 35 | 267 | 8,112 | 1,639,743 | 93.53 |

色対応でこの集約を失わない。今回の2D測定は現行の灰色描画であり、8色bucket化の所要時間・paint負荷はまだ測っていない。35街区×8なら建物path上限280という値は設計上の上限で、性能の実測値ではない。

### 7.3 3D の結果

| Count | Mode | Build ms | Draw calls | Triangles | Buffer MiB |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | ce-massing | 1.20 | 2 | 1,694 | 0.194 |
| 100 | bv-factory | 12.40 | 9,078 | 110,386 | 0.589 |
| 100 | bv-clone | 14.20 | 9,078 | 110,386 | 0.017 |
| 100 | bv-instanced | 1.00 | 21 | 110,386 | 0.270 |
| 1,000 | ce-massing | 10.20 | 2 | 16,188 | 1.853 |
| 1,000 | bv-factory | 136.90 | 90,978 | 1,105,186 | 5.815 |
| 1,000 | bv-clone | 228.20 | 90,978 | 1,105,186 | 0.017 |
| 1,000 | bv-instanced | 2.00 | 21 | 1,105,186 | 0.655 |
| 5,000 | ce-massing | 48.60 | 2 | 81,104 | 9.282 |
| 5,000 | bv-instanced | 3.20 | 21 | 5,526,410 | 2.364 |

準備時間は各方式の配置・geometry/instance作成のCPU時間。CEは採取ロットの中心の計算と格子への移動も含む。BVのprototype初回作成は別枠（生データのassets.coldMs）。元モデル1棟は69/88/116 Mesh、958/996/1,362 triangles、各7 materialsだった。

1,000棟では単純配置の90,978 draw callsをinstance化で21へ落とせる。一方、三角形数は1,105,186のままで簡易描画16,188の約68倍。instanceは準備時間とバッファ容量に優れ、単純な「BVは必ず生成が遅い」という結論にはならない。ただし地形接地や不整形敷地への適合、画面上で不要な細部のラスタライズは別の費用となる。cloneだけでは多数のObject3Dの作成・走査が残り、今回も準備時間が減らなかった。

**描画時間の解釈を制限する。** 実行環境はApple M4だがGPUバックエンドはSwiftShaderである。gl.finishを含めても、簡易描画とinstance方式の定常render中央値が0.0msに丸まった。GPU負荷が0という意味ではなく、これらの値からGPU性能比・実FPSは算出しない。比較判断にはCPU準備時間とdraw calls/triangles/buffer量を使用する。WebGL context lossとGL errorは全測定ケースで検出されず、100棟の出力画像も確認した。実GPUでの操作性能は未確認。

現行の簡易描画とBV instanceの[比較画像（簡易）](../analytics/ce-building-appearance-ce-massing.png)・[比較画像（BV）](../analytics/ce-building-appearance-bv-instanced.png)も保存した。現行素材の確認用で、提案パレットの完成予想図ではない。

## 8. 実装順と受入条件

1. **共通パレットと外観resolver**: 正規化された入力・version・安定ID・材質/仕上げの分離を追加。人口、階数、lot polygon、道路・橋を一切変更しない。旧文書と非欧州のfallbackを確認。
2. **2Dと3Dの同時配色**: SVGのbucket化・export CSS、threeの線形色変換を接続。BVへ簡易住宅の共通プレビューを追加。同一seedの南方瓦・北方植物材・北方都市瓦・石材地域を比較。まだ詳細モデルの全棟配置はしない。
3. **必要な近景ディテールだけ追加**: 木骨、軒、窓の読解性を固定カメラで確認。共有部品/アトラスのコストを追加計測。ユーザーが見るズームで差が出ない細部は省く。
4. **固有建物・多数同形物だけBV統合**: bake/instanceを使い、敷地収まり・向き・接地・ピッキング・共有資源解放を確認する。

第2段階の性能目標（未測定の受入予算）: 固定ケースでappearance導出を除く生成内容が同じ、通常住宅の3D draw callsは現行2を維持、色追加だけで三角形を増やさない。1,000棟の追加appearance導出は5ms以内を目標とし、同一環境・交互測定で検証する。2D lightの建物pathは街区数×8以下、SVG構築中央値は既存比+15%以内を目標にする。超過時は色数/帯/棟線を先に減らす。

必要な回帰テストはresolverの決定論・入力欠損・orthodox北方の誤分類防止、屋根材と勾配の整合、2D/3Dのpalette key一致、bucketでの選択・export、共有prototypeのdisposeに限定する。関連する既存テストを明示して実行し、全件や多数seedへ広げない。

残る検証は、最終配色の視覚比較、色bucketの実ブラウザーpaint、色だけの更新と全geometry再構築の差、実GPU/低性能端末・実際の大都市での必要範囲の確認。現在の計測だけで万人の端末でのFPSを保証しない。

## 9. 今回の検証

- 2D既存ベンチマーク1件、3Dの10ケース×測定3回が完走。3Dの各ケースで生成した三角形数とrendererの提出数が一致し、BVの3方式間でも三角形数が一致することを照合した。
- 比較画像2枚を目視確認。現行素材が描画されており、WebGLエラー・context lossは検出されなかった。
- `npx vitest run src/city-editor/generators/buildingMassing.test.ts src/city3d/core/massingGeometry.test.ts src/buildings/medieval/45-jettied-housesModels.test.ts`: 3ファイル・23件成功。
- 調査時点では本番コードの変更なし。SVG色集約・LODと、それらの性能目標は未検証。

## 10. 実装順1の実装記録

2026-10-22実装。

- `src/buildings/appearance/` にthree/DOMから独立したsRGBパレット、外観型、入力の正規化・検証・resolverを追加した。地中海・大西洋岸・北方森林・北方都市・石材地域のプロファイルと、未対応文化用のlegacyを持つ。
- `civilization.tradition` と明示プロファイル、森林・湿地等から外観を選ぶ。宗教や翻訳されたbiome表示名から地域を推定しない。北方の同じ木造でも森林の郊外は板壁、都市は塗壁の詰め物と暗い木骨の色を分ける。時代・気温も正規化して保存するが、この段階では屋根材の配分や形状の変更に使わない。
- 最終の `buildBlockFabric` でmassingを付けた後、同じlotへ `appearance` を導出する。既存の屋根材・壁構造材・勾配・階数・敷地・住宅容量・道路と橋は変更しない。色を決める専用saltを使い、IDのないlotでもfaceと正規化した敷地ringから安定キーを得る。ringの始点・向き・lotの並び順で色が変わらない。
- CityDocumentに `buildingAppearanceVersion`, `buildingAppearanceProfile`, `buildingAppearanceContext` を追加。新規文書はversion 1で、完成都市の生成時に入力をsnapshotする。旧文書の読み込みではversionを追加しない。既存都市の明示更新用に `withBuildingAppearance` を用意し、都市の再生成でも更新する。snapshotは保存・読み込み後も維持する。
- 外観設定・snapshotをfabric fingerprintへ追加した。既存massingが読むbiome/civilization/periodもruralFieldVersionに依存せず含め、同じdocument上のプロファイル変更で古い結果が残らないようにした。地割りと外観のキャッシュ分離は後段。
- 2D/3D/BVの描画経路はまだ切り替えない。未対応文化のlegacy外観は、描画への接続時も既存の材質色とtintを優先する。legacyパレットのsRGB値は参照用の近似であり、既存頂点色を置換するものではない。

検証: resolver・CE接続・既存massing・blockInfill・documentCodecの関連5ファイル35件成功。型チェック成功。旧文書の維持、明示更新、保存往復、不正な入力、北東欧の地域判定、安定ID、形状と容量の維持、キャッシュ更新を確認した。描画色の視覚検証と性能予算の判定は実装順2で行う。

## 11. 実装順2の実装記録

2026-10-22実装。

- `buildingAppearanceColors` をSVGとthreeの共通のsRGB参照にした。SVGは `--ce-roof-color` で塗り、画面とstandaloneのCSSを統一。threeはsRGBからLinear-sRGBへ変換した頂点色を使う。旧文書・未対応文化・明示legacyは従来の灰色SVGと材質別linear RGB/tintを維持する。
- 中世〜近世の有効な外観プロファイルでは屋根材も専用seedで導出する。地中海は瓦、北方都市は瓦・板、北方郊外は森林条件に応じた植物系、石材地域はslate。既存の勾配・屋根形状は維持し、40°未満に茅、20–33°の範囲外に芝土を新しく割り当てない。10°未満と対象外時代は元の屋根材を保つ。この段階の配合は視覚設計の仮値で、実在都市の材料統計ではない。
- 一般建物の屋根色は導出時に街区あたり最大8色へ量子化し、棟別SVG・一括SVG・3Dの値を一致させた。light/minimalでは街区と色の組合せでpathをまとめる。選択した街区は既存どおり個別表示へ戻す。特殊建物・人口clusterは従来の個別表示を維持する。
- 通常のfabric経路に加え、単純な街区の2D描画にも同じmassing/appearanceの導出を接続した。屋根・壁の寸法、階数、人口容量、道路・橋は変更しない。
- 3Dの一般建物は壁と屋根の2メッシュのまま。形状が同じ間は色バッファだけ更新し、geometryとmaterialを再作成しない。地形や建物形状が変わる場合は従来どおり構築する。固有施設の更新は従来の経路を維持する。
- BVに **CE regional houses** を追加し、5地域の簡易住宅をCEと同じ生成・配色・3D描画で確認できるようにした。新しい詳細モデルは作っていない。BVの平面/立面投影も頂点色を読むようにした。木骨の立体ディテール・窓・軒・詳細モデル配置は実装順3以降。

### 11.1 性能

単一seed `regional-appearance`、small/evolution/medieval配置、highMedieval、511棟。同一プロセスでlegacyと4地域を順番を回して比較し、warmup後5回の中央値を採った。Node v22.23.1 / Apple M4 / jsdom。SVG構築時間であり、ブラウザーのlayout/paint・GPU時間は含まない。前回の時代が異なるベンチマークとは直接比較しない。

| プロファイル | light構築ms | legacy比 | 建物path数 | 街区内最大path数 | 1,000棟の外観導出ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy | 97.07 | 基準 | 35 | 1 | — |
| Mediterranean | 98.12 | +1.1% | 65 | 5 | 1.74 |
| Northern wooded | 96.49 | −0.6% | 97 | 5 | 1.61 |
| Northern urban | 99.15 | +2.1% | 100 | 6 | 1.56 |
| Stone upland | 91.15 | −6.1% | 65 | 5 | 1.46 |

ばらつきがあり、負の差を高速化の効果とは解釈しない。このケースでは+15%、最大8 path/街区、導出5ms/1,000棟の予算内。全方式で一般建物は2メッシュ、8,330 triangles、999,600 buffer bytesで同一。511棟の色バッファ更新は約0.84–1.18ms。大都市・低性能端末・実GPUのFPSは未確認。

生データ: [ce-regional-colors-benchmark.json](../analytics/ce-regional-colors-benchmark.json)。再現:

```sh
node --import tsx scripts/benchmarkCeRegionalColors.mts
node --import tsx scripts/checkCeRegionalColors.mts
```

前者は比較用の完全なSVGを `/tmp/ce-regional-colors` へ出力する。後者はそのSVGと実際のBV・CE 3DをChromiumで確認し、画像と [ブラウザー確認結果](../analytics/ce-regional-colors-browser.json) を保存する。

### 11.2 視覚確認と回帰検証

4地域のSVGのcomputed fillが共通sRGBと一致した。BVの4プレビューとCEの実際の3Dビューで4地域を切り替え、JavaScriptエラー・WebGLエラー・context lossが無いことを確認した。固定ケースの地中海/北方の2D、BV、CE都市全体の3D画像を目視確認した。

| 表示 | Mediterranean | Northern wooded |
| --- | --- | --- |
| 2D export | [画像](../analytics/ce-regional-colors-mediterranean-2d.png) | [画像](../analytics/ce-regional-colors-northern-wooded-2d.png) |
| BV共通プレビュー | [画像](../analytics/ce-regional-colors-mediterranean-3d.png) | [画像](../analytics/ce-regional-colors-northern-wooded-3d.png) |
| CE都市全体3D | [画像](../analytics/ce-regional-colors-mediterranean-city3d.png) | [画像](../analytics/ce-regional-colors-northern-wooded-city3d.png) |

関連Vitestは `cityMeshes.test.ts`, `renderers/buildingAppearance.test.ts`, `renderQuality.test.ts`, `generators/buildingAppearance.test.ts`, `appearance/resolver.test.ts`, `buildingMassing.test.ts` の6ファイル30件成功。型チェック・変更ファイルのBiomeチェックも成功。新規テストは色変換、旧色の維持、頂点色投影、色だけの更新、地域屋根材、色数上限、選択/一括表示/エクスポートの回帰を対象にした。

## 12. 実装順3の実装記録

2026-10-22実装・外観改訂。近景の縦長窓・窓枠・窓台・入口・軒下の帯と、露出木骨の柱・水平材を追加した。初版の鎧戸・腰壁の筋交いは、顔のように見える組み合わせを避けるため撤去した。

### 12.1 採用した描画方法

必要な小さな壁面部品を頂点色の**追加1メッシュ**へ結合する。窓単位のMesh、テクスチャ、内部空間、影マップは作らない。窓は暗い面で、建物に実際の穴は開けない。軒の表現は壁の上端直下の細い暗帯で、屋根の張り出し形状を増やすものではない。平面の部品で十分な判読性が得られたため、アトラスは採用しなかった。

`buildingSurfaces` の任意出力 `wallPanels` を使い、既存の各階の外周・高さ・張り出しに正確に沿わせる。回転・逆向きのringも正規化後の面を使う。地形の基礎高さを加え、壁から12mmだけ外へ出し、polygon offsetも併用する。基本メッシュの頂点・法線・三角形は変更しない。入口は利用可能な地上階の短辺を1面選び、偏心配置とする。道路側の情報はこの層では受け取っていないため、実際の街路正面を保証するものではない。倉庫階・厩舎階には通常の住居窓を付けない。

露出木骨は共通resolverの `framePaletteId` がある壁だけに表示する。地中海の木造下地はlimewashで覆う仕上げとし、北方都市の露出木骨と区別した。北方森林地域の板壁にも木骨の格子を強制しない。legacy・未対応文化・landmarkはこの追加表示の対象外とする。

### 12.2 表示と資源の上限

- 画面上の建物の概算直径64px以上で表示を開始し、48px未満で解除する。差を持たせ、拡大縮小の境界での点滅を防ぐ。カメラの視野外は候補から除く。奥の建物の隠面判定までは行わない。
- 近い建物を優先して最大50棟・追加30,000 triangles。1棟にも1,200 trianglesの上限を置く。上限を超える壁面は全体を省き、窓枠の途中だけを切らない。
- 候補が決まってから生成し、壁面データのCPUキャッシュは100棟まで。カメラが静止している間は再選定・再構築しない。カメラが動いても候補の集合が同じなら既存メッシュを使う。
- 遠景に戻ったら追加メッシュのGPU geometryを解放する。キャッシュは上限内で残し、都市の更新・破棄で全て解放する。一般建物の基本2メッシュと、元の建物を拾うピッキングは従来のまま。

CE 3DとBVの **CE regional houses** に接続した。近景表現は保存データに追加せず、文書・人口・階数・敷地・道路・橋を変更しない。2Dの建物面・一括描画・SVG出力も変更しない。BVの平面/立面図は従来のマッシングを表示する。

### 12.3 性能の計測

固定の既存CE住宅を1,000棟並べたCPU計測。Apple M4 / Node v22.23.1、warmup1回・測定3回の中央値。条件ごとに新しいcontrollerを作った。基本メッシュは2つ・32,000 triangles。

| 条件 | 詳細棟数 | 追加Mesh | 追加triangles | 追加GPU属性bytes | 初回の選定・構築ms | 静止時1回ms | 候補が同じ微小移動ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 遠景 | 0 | 0 | 0 | 0 | 0.271 | 0.0021 | 0.066 |
| 近景 | 50 | 1 | 12,500 | 1,350,000 | 5.662 | 0.0016 | 0.059 |
| 高解像度で上限確認 | 50 | 1 | 12,500 | 1,350,000 | 5.019 | 0.0017 | 0.099 |

全1,000棟の候補情報の準備は約0.27–0.70ms。表は外観改訂後の再計測値。GPU属性bytesにはdriver overheadやCPUキャッシュは含まない。実GPU・低性能端末でのFPSは未測定。ブラウザーはSwiftShaderで、描画速度の結論には使っていない。比較用の3棟では、遠景/無効時は2 draw calls、近景は3 draw callsで、距離を戻すと2回に戻ることを確認した。

[CPU生データ](../analytics/ce-building-details-benchmark.json)、[ブラウザー確認結果](../analytics/ce-building-details-browser.json)。再現:

```sh
node --import tsx scripts/benchmarkCeBuildingDetails.mts
node --import tsx scripts/checkCeBuildingDetails.mts
```

### 12.4 見た目と回帰確認

| 比較 | 基本形状 | 近景ディテール |
| --- | --- | --- |
| 北方都市 | [画像](../analytics/ce-building-details-northern-urban-base.png) | [画像](../analytics/ce-building-details-northern-urban-near.png) |
| 地中海 | [画像](../analytics/ce-building-details-mediterranean-base.png) | [画像](../analytics/ce-building-details-mediterranean-near.png) |
| 北方森林 | [画像](../analytics/ce-building-details-northern-wooded-base.png) | [画像](../analytics/ce-building-details-northern-wooded-near.png) |

[BVの表示](../analytics/ce-building-details-bv.png)、[実CEの拡大表示](../analytics/ce-building-details-city-near.png)、[縮小後](../analytics/ce-building-details-city-returned-far.png)も保存した。共通プレビューは基礎を12m上げて接地の追従を確認し、実CEは通常の地形経路と拡大縮小を確認した。JavaScriptエラー・WebGLエラー・context lossは無かった。

関連テストは `buildingDetails.test.ts`, `cityMeshes.test.ts`, `massingGeometry.test.ts`, `appearance/resolver.test.ts` の4ファイル28件成功。回転した壁・張り出し・基礎高さへの適合、基本形状の維持、窓の用途別省略、視野外と旧外観の除外、棟数・三角形・キャッシュの上限、静止時の再利用、距離のヒステリシス、geometryの解放と破棄後の更新停止を確認した。型チェック・変更ファイルのBiomeチェックも成功。

詳細なBV建物の敷地への配置、街路に合わせた入口・窓配置、看板・内部空間は実装順4以降の範囲とする。

### 12.5 外観の改訂

初版は四角い黒窓を各階・各壁面へ密に反復し、左右の鎧戸と浅い斜材が目と口のような形を作っていた。細い木材も線画のように見えたため、鎧戸と斜材を外し、窓の間隔を約3.2mへ広げた。プレビューの短辺は1窓、長辺は2窓となる。窓を幅約0.56m・高さ最大0.9mの縦長にし、中央の細い桟と窓台を加えた。木骨は16cm幅の柱・梁に整理し、壁色に寄せた低コントラストの色とした。地上階の入口で上下階の違いも出した。平面部品と頂点色による簡易描画は継続する。

改訂後に関連2ファイル15テスト、型チェック、Biome、3地域×3距離の描画と実BV・実CEの拡大縮小を確認した。比較画像とCPU/ブラウザー生データは改訂後の表示に更新した。


## 13. 実装順4の実装記録

2026-10-22実装。特殊建物は既存BVの `village-chapel`、多数同形物は既存の井戸・水盤を対象にした。通常住宅・ランドマーク敷地を見た目の名前から推測して別モデルへ置換することはしない。既存の修道院・船・公園などの統合経路は維持する。

### 13.1 一度だけ結合し、インスタンスで共有

`bvInstances.ts` はBV factoryの階層変換を頂点へ焼き込み、材質色と既存頂点色をLinear-sRGB上で乗算して1つのgeometryへ結合する。描画時は種類ごとに1つの `InstancedMesh` と1つの頂点色材質を使う。対象は不透明な単色モデル。テクスチャ・透明材質・複数材質のgroupを持つ未対応モデルは採用せず、特殊建物の簡易描画を残す。UV等の不要属性は保持しない。

キャッシュはCEビュー単位の明示的なオブジェクトで、factory定義をキーにする。BV元モデルは結合直後に破棄し、結合後の資源は参照数で管理する。再構築では次のレイヤーを先に取得してから古いレイヤーを解放するため、同じモデルのfactoryとbakeを繰り返さない。最後の利用者が解放するとgeometryとmaterialをそれぞれ1度だけ破棄する。各インスタンスのGPU資源はレイヤーが解放する。二重disposeも許容する。

井戸は従来の材質別16バッチから、頂点色を使った1バッチへ変更した。BVの原点・寸法・配置位置は維持する。

### 13.2 敷地・向き・接地・fallback

- `specialBuildingMeshes.ts` は外観version 1、対応する欧州地域、中世〜前工業時代の礼拝堂だけを候補にする。既存CEと同じ `templeType` / 寸法による礼拝堂判定を使う。basilica・shrine・megalithやユーザー輸入の任意ランドマークへ礼拝堂を強制しない。
- BVモデルの実測AABB全体（屋根の張り出し・階段・控壁も含む）を、CEの回転済み予約敷地の内側94%へ等方スケールで収める。倍率は0.5〜1.5。縦横や高さを別々に引き伸ばさない。全包絡頂点が敷地内にあることを確認する。
- 保存された棟方向をそのまま使う。BVのXZ座標とCEの `(x, -planY)` を回転行列で対応させ、モデルの最下点をCEの基礎高さへ合わせる。既存の地形用基壇も残す。
- 凹形状・穴のある敷地、狭すぎる敷地、包絡が収まらない敷地は置き換えない。実際に配置できたIDだけを簡易構造物の配列から除くため、重複描画も欠落も起こさない。旧文書・legacy・非対応地域は既存の簡易構造物を表示する。

配置は3Dの導出表示で、保存文書、人口容量、敷地、道路、橋、2D描画には変更を加えない。特殊建物はBVの既存配色を使い、地域パレットによる通常住宅の配色は継続する。任意BVモデルの自動選定・街路正面の推定・全モデル共通LODは今回の対象外。

### 13.3 ピッキング

各バッチの `instanceId` を元のCE IDへ戻す。CEのraycasterへ礼拝堂・井戸・水盤を追加し、選択した1棟の実geometryだけをワールド変換して輪郭表示する。読み取り欄の高さも簡易形状の代用値ではなく、実モデルの最高点を使う。

### 13.4 計測・動作確認

`node --import tsx scripts/benchmarkCeBvInstances.mts` で、既存礼拝堂1/10棟と既存井戸1/1,000個を固定配置した。Apple M4 / Node v22.23.1、warmup1回・測定3回の中央値。factory+bake+インスタンス作成と、prototypeを保持した再構築を別々に計測した。CPU負荷により時間は変動するため、GPU速度・FPSの比較には使わない。

| モデル | 個数 | 元BVの部品数/個 | 共有描画Mesh | 提出triangles | 属性・行列bytes | 初回ms | 再構築ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 礼拝堂 | 1 | 96 | 1 | 1,136 | 122,752 | 5.372 | 0.252 |
| 礼拝堂 | 10 | 96 | 1 | 11,360 | 123,328 | 2.727 | 0.074 |
| 井戸 | 1 | 319 | 1 | 11,284 | 1,218,736 | 12.856 | 0.018 |
| 井戸 | 1,000 | 319 | 1 | 11,284,000 | 1,282,672 | 9.461 | 0.351 |

インスタンス化で三角形は減らない。1,000井戸の負荷試験は描画命令と共有資源の確認であり、実都市への1,000個配置を推奨するものではない。GPU・driver overheadとCPUキャッシュは属性bytesに含まない。

[CPU生データ](../analytics/ce-bv-instances-benchmark.json)、[比較表示](../analytics/ce-bv-instances-preview.png)、[実CEでの選択表示](../analytics/ce-bv-instances-city.png)、[ブラウザー結果](../analytics/ce-bv-instances-browser.json)。ブラウザー確認の再現は `node --import tsx scripts/checkCeBvInstances.mts`。

ブラウザーでは向きの違う礼拝堂3棟・井戸1個・水盤1個を3 draw callsで表示し、基礎高12mの表示を確認した。実際の `mountCity3d` でもクリックが `temple:chapel-1` を返し、legacyへの切り替えと復帰後にも選択できることを確認した。JavaScript/WebGLエラーとcontext lossは無かった。バックエンドはSwiftShaderで、実GPUのFPSは未測定。

関連テストは `bvInstances.test.ts`、`wellMeshes.test.ts`、`renderers/structureMassing.test.ts` の3ファイル17件成功。元の井戸の境界・原点・縮尺、線形色と階層変換、完全なモデル包絡の敷地内配置、回転・接地、fallback、インスタンスのID解決、複数利用者の共有と最後の解放を確認した。型チェックと変更ソースのBiomeチェックも成功。


## 14. 単独CEの住宅文化・気候入力

2026-10-22実装。Documentパネルの「現在の建物生成」の下に「住宅文化」「住宅の気候・植生」を追加した。FMG連携なしで選択でき、生成済みの街へも即時反映する。

### 入力項目

| 項目 | 選択肢 | 適用 |
| --- | --- | --- |
| 住宅文化 | 自動、地中海、大西洋岸、北方森林、北方都市、石材地域・高地、従来の外観 | 既存の外観プロファイルを指定。屋根のパレット・葺き材・壁の仕上げ、近景の露出木骨の対象を決める |
| 住宅の気候・植生 | 自動、温帯・開けた土地、森林、湿地・葦原、湿潤な森林、乾燥地 | 既存resolverの森林・湿地・乾燥フラグを指定。板葺き/植物材、葦色、北方農村の板壁等の判定に使う |

単独の街は立地の文化情報を持たないため、「自動」では従来表示に戻ることがある。地域色を見るには住宅文化を明示する。「自動」の気候は文書/立地のbiomeを参照する。未使用の温度パラメータは入力項目にしない。気候は住宅外観への入力であり、地形や河川を生成し直すものではない。葺き材は既存の時代・屋根勾配の制限に従うため、全屋根が一律に同じ材になるわけではない。

### 保存と生成への接続

既存の `buildingAppearanceProfile` と、新しい任意項目 `buildingAppearanceClimate`（5つの安定ID、未指定=自動）を保存する。選択時に `withBuildingAppearance` で正規化snapshotを更新し、既存の2D・3D外観処理へ渡す。文書codecは新しい項目も検証し、未知の値と不正な型を拒否する。旧文書の読込だけでは外観を更新しない。

新しいグリッド、元の生成入力を使った再生成、段階表示、人口に合わせたグリッドの作り直しにも現在の住宅設定を渡す。生成workerの実行中に選択が変わった場合は、完了時に最新設定を適用する。Undo/Redo・保存JSONの読込時には文書の値からUIを同期する。単独の文化選択はFMG全体の文明・信仰・技術を変更しない。

### 確認

- 関連テスト: `buildingAppearanceControls.test.ts`、`generators/buildingAppearance.test.ts`、`services/io/documentCodec.test.ts`、`controllers/generationFromEdits.test.ts` の4ファイル12件成功。UI選択の即時適用・復元、自動への戻し、気候による壁仕上げの違い、人口グリッド再作成時の維持、JSONの検証と旧文書互換を確認した。既存パネル4テストも成功。
- 型チェック、変更ソースのBiomeチェック成功。
- 実際の単独CEを日本語で開き、新規グリッド、都市生成、生成後の文化・気候変更、2D色の変化、3D表示、Undo/Redo、JSON保存・読込、再生成を確認した。外観変更前後でmesh・elements・featureGroupsの値は一致。JavaScript/WebGLエラーとcontext lossは無かった。

[地中海の2Dと入力欄](../analytics/ce-housing-controls-mediterranean.png)、[北方森林の3Dと入力欄](../analytics/ce-housing-controls-northern-3d.png)、[ブラウザー結果](../analytics/ce-housing-controls-browser.json)。再現は `node --import tsx scripts/checkCeHousingControls.mts`。

## 15. 一般住宅のBV詳細モデルへの置換を進める

2026-10-26実装。`src/buildings/houses/regionalHouses.ts` の5地域の住宅と、`regionalHouseMeshes.ts` → `cityView.ts` の既存置換経路を改善した。前回の文書調査で「高品質住宅は未作製」とした説明は正確ではなく、モデルとCEへの接続は存在していた。今回の変更はこの実装を土台とする。

### 15.1 今回完了したこと

- [x] 共通BV factoryに間口・奥行・各階高・地上階用途を渡せるようにした。CEは測定した寸法からモデルを生成し、配置行列の倍率は全軸1とする。従来の5×8 mモデルを最大3.5倍まで縦横別々に伸ばす処理を除去し、窓・扉・木骨・屋根材の部品寸法を保つ。
- [x] 各階の高さをそれぞれ使用し、上階の張り出しをCEと同じ各階累積・各側最大1.2 mで描く。階数を5へ切り詰めて別形状にする処理を止め、未対応の階数は元の形状を描く。
- [x] CEと同じ屋根立上り4 m上限から勾配を導出する。4°単位の丸めと16°下限による改変を除去する。
- [x] 既存の文化・気候resolverが選んだ板葺き、スレート、芝土、鉛板を別の葺き材として扱う。板葺き・スレートの切妻屋根には目地、鉛板には継ぎ目、芝土には厚みと木の留め材を付ける。芝土を茅、板葺き・鉛板を瓦へ読み替えない。葺き材の配分規則自体は既存resolverを使う。
- [x] 地上階の `retail` は販売窓と受け台、`craft` は作業窓・台と作業部品、`storage` は荷の開口を描く。上階は住宅の窓とする。開口の位置は間口・奥行から導出し、装飾を一括拡大しない。
- [x] CE用モデルでは独立住宅プレビューの樽・階段・バルコニー・持送りのあるギャラリー・荷揚げ梁を省く。軒と破風の張り出しはそれぞれ0.12 m、0.10 mとし、街路側への付属物の張り出しを減らす。
- [x] 矩形の外接箱へ敷地の80%が入れば採用する旧判定を止めた。棟方向に沿う矩形（面積比0.999999以上）、間口3〜18 m、奥行4〜28 m、1〜5階、各階高2.5〜5 m、階高合計と軒高が一致するロットを対象にする。厩舎・小屋、非住宅用途、凹形・台形、平屋根などは元のCE形状を表示する。採用できた棟だけを元のマッシングから除く既存経路を使用する。
- [x] factory定義の参照表を512件以内に抑えた。表示中のgeometryは既存のビュー単位・参照数付きキャッシュが所有し、レイヤー破棄時に解放する。512は表示棟数やGPU使用量の上限ではない。

既存の画質選択を使い、高画質では木骨・窓枠・屋根材の詳細を描き、標準画質は対応する低詳細モデルを選ぶ。今回、標準画質を高画質へ自動で引き上げてはいない。保存形式・人口容量・区画・2D形状を変える処理は追加していない。

### 15.2 確認と計測

- 関連テストは `regionalHouses.test.ts`、`regionalHouseMeshes.test.ts`、`bvInstances.test.ts` の3ファイル26件成功。共通factoryと直接geometryの一致、全5地域の資源解放、階高と累積張り出し、配置倍率1・接地、葺き材/用途ごとのprototype、未対応用途と形状のfallbackを確認した。型チェック・変更ソースのBiomeチェック・差分の空白検査も成功。
- `node --import tsx scripts/checkCeRegionalHouses.mts` で5地域×6葺き材を高/低画質で描画し、各画質30棟すべての置換、JavaScript/WebGLエラーなし、キャッシュの解放を確認した。[比較画像](../analytics/ce-regional-houses-20261026.png)と[描画数](../analytics/ce-regional-houses-20261026.json)を保存した。画像は葺き材の取り違えを見つけるために全組合せを強制しており、地中海に芝土を配る等の生成確率や史実を示すものではない。実GPUでのFPS評価ではない。
- 固定1都市（seed `regional-appearance`、small/evolution/medieval、High Medieval、北方都市プロファイル）のNode確認では511ロット中234棟を置換した。低詳細は173,220 triangles、高詳細は1,164,644 triangles。両方とも234 prototypesで、初回生成は低約92 ms、高約428 ms（Node v22.23.1、単発・参考値）。この入力では寸法が異なるためprototypeの共有は生じなかった。固定入力数を増やした校正やFMG画面からの通し操作は今回実施していない。

### 15.3 次に進める作業

優先順に進める。今回の完了範囲を全住宅・全文化の対応完了とは扱わない。

1. [x] **街路正面と選択輪郭**：2026-10-26実装。近隣の街路・敷地内通路から妻入り/平入りと向きを選び、実際のBV詳細geometryを選択輪郭へ使う。適用条件と確認は§16。
2. [ ] **不整形敷地と未対応の屋根**：台形・隅切り・連続街路壁に沿う壁/開口と屋根を同じ敷地から生成し、今回のfallbackを減らす。平屋根・片流れ・中庭型と6階以上、今回の寸法/階高範囲外は、それぞれ適合条件を決める。
3. [ ] **距離別LODと大都市の負荷**：近景の棟だけ高詳細にし、遠景は既存の低詳細またはマッシングへ戻す。実寸によるprototype増加を前提に、チャンク・統合描画・メモリ予算・可視棟数上限を設ける。画質変更時の一時メモリ、共有率、初回時間、実GPUでの操作時間を測る。
4. [ ] **商業区・職人区の職種差分**：現状の用途共通の販売/作業窓を、保存された職種や施設に応じた工房口・看板・荷扱いへ拡張する。内部空間や経済側に無い設備は生成しない。
5. [ ] **地域・時代の拡張**：現在の5地域で表せない非欧州・fantasy文化向けのモデル族、平屋根/中庭型、近現代の住宅を追加する。文化・気候の入力と資料の適用範囲を明示する。
6. [ ] **FMGからの通し確認**：Standardの固定FMG入力から商業区・職人区のCEを開き、文化・気候・用途が詳細モデルへ渡ること、再生成・保存読込・画質切替を確認する。置換できた棟数とfallback理由を残す。

## 16. 街路正面とBV住宅の選択輪郭

2026-10-26実装。§15.3の優先作業1に対応する。

### 16.1 正面の選定

- `buildingFrontage.ts` に、描画用の正面を決める純粋な2D処理を追加した。CEの道路描画と同じ `collectTownRoads` の結果（主要道とfabricの路地）に、各parcelの `access` を加える。街区の `fabric.entrances` は隣接街区間の出入口であり、個々の住宅の扉としては扱わない。
- 棟方向に対して妻側の表裏・軒側の左右の4候補を作り、実際の扉位置から道の端まで12 m以内で通れる最も近い候補を選ぶ。一般街路は壁面にほぼ沿うもの（街路と壁面のずれ30°以内）を候補とする。敷地内通路は同じparcelの建物に限って使い、扉で終わる通路もその接近方向で判定する。
- 扉から街路端までの直線が別の建物・水域・地上の城壁/塔/施設の外形に触れる候補を除く。城壁は既存の門の開口を切り取った壁区間から障害物を作る。見つからない場合は都市中心への推測を止め、安定したローカルの妻側を維持し、導出値の `source` を `unknown` とする。道路取得が失敗した場合も住宅の描画は継続する。
- 一般街路と障害物には既存の `SpatialBoundsIndex` を使用する。描画更新時だけ解決し、カメラを動かしただけで正面を計算し直さない。

正面候補・探索距離・角度の許容幅は描画用の生成規則である。実在都市の入口配置統計ではない。候補への直線が通ることを確認する処理であり、奥まった住宅への迂回路を新設する処理ではない。基礎の平面上で判定するため、階段や段差を含む歩行可能性を保証するものではない。

### 16.2 妻入り・平入りの共通BVモデル

`RegionalHouseSpec.entranceFace` に `gable` / `eave` を加えた。正面を軒側にすると、地上階の扉・販売/作業窓・受け台をその壁面へ移し、妻側には通常の窓を残す。屋根の棟方向・敷地寸法・階高・人口容量は正面選択で変更しない。反対側へ向ける場合はモデルを180°回す。prototypeのキーには入口面を含め、別の正面のgeometryを誤って共有しない。

### 16.3 実モデルによる選択輪郭

`bvInstances.ts` に `bvInstanceGeometry` を追加した。クリックした `instanceId` のgeometryだけを複製し、instanceと親階層の変換を合わせてワールド座標へ写す。CEの住宅クリックは、このgeometryから屋根材・張り出し・煙突・扉などを含む輪郭を描く。読み取り欄は従来どおり元のロットの階数・材質・用途を表示する。

複製geometryは輪郭を作った直後に解放し、共有prototypeを変更・解放しない。同じ変換処理を既存の特殊建物・井戸の選択にも使用する。非対応の住宅は元の簡易形状の選択を維持する。

### 16.4 確認

- 関連6ファイル35テスト成功：`buildingFrontage.test.ts`、`regionalHouseMeshes.test.ts`、`bvInstances.test.ts`、`regionalHouses.test.ts`、`cityViewRendering.test.ts`、`cityView.test.ts`。近い道路の遮蔽、敷地内通路とparcelの帰属、遠い/直交する道路の除外、同距離時の安定性、回転と平行移動、妻/軒4方向の実際の扉へのraycast、棟方向の維持、親変換を含む選択geometry、共有資源の維持を確認した。型チェックと変更ソースのBiomeチェックも成功。
- ブラウザー確認の再現は `node --import tsx scripts/checkCeHouseFrontage.mts`。妻入り2棟・平入り2棟の[比較画像](../analytics/ce-house-frontage-20261026.png)、生成した実CEの[選択画像](../analytics/ce-house-frontage-city-20261026.png)、[確認結果](../analytics/ce-house-frontage-20261026.json)を保存した。前節と同じseed・設定で1都市を生成し、237棟の詳細住宅が表示される実CEで工房兼住宅をクリックした。選択輪郭と実BVモデルのワールド境界の誤差は0 m、JavaScript/WebGLエラーは0件だった。低画質への切替・ビューの破棄も行った。FMG画面からCEを開く通し操作・多シード検証・実GPUでのFPS計測は含めない。

次に進める作業は§15.3の優先作業2（不整形敷地と未対応の屋根）。大都市へ高詳細の適用を広げる前には、優先作業3の距離別LODとメモリ予算も実施する。

## 17. 煙突の閉じた円柱を開口のある排煙口へ修正

2026-10-26実装。§16の画像で、煙突上の2本の円柱が塞がった棒として見える指摘に対応した。

- 丸筒・八角筒を、裾と口縁に厚みのある中空形状へ変更した。上面を蓋で閉じず、内壁を暗くし、煙突本体と天端にも連続した穴を開けた。穴の奥には口縁より低い煤色の底を置き、筒の直下の石板で塞がる状態も除去した。
- 本数は全棟2本の固定を止めた。通常は1口、2階以上で地上の床面積が60 m²以上、または工房兼住宅なら2口とする。これは現在の建物寸法・用途を用いた描画用の加熱需要の仮規則であり、実際の炉や煙道のシミュレーション結果・歴史的な本数統計ではない。
- 地域別の形状は、大西洋岸では丸筒、北方都市では八角筒、北方森林では石造の開口、地中海では瓦の笠、石材地域では石の笠を基本とした。地域の形状を屋根材の名前だけで切り替えない。笠は開いた煙道より上に支持材で持ち上げ、側方へ通じる排煙の隙間を設けた。
- CEとBVは同じfactoryを使う。標準/低画質では従来どおり筒の細部を省略するが、煙突天端の開口は維持する。

関連テストは `regionalHouseChimneys.test.ts`、`regionalHouses.test.ts`、`regionalHouseMeshes.test.ts` の3ファイル27件成功。口の中心を上から見たrayが奥の煤色の底へ届くこと、口縁との高低差、内壁の向きと色、1口/2口の分離、笠の側方の隙間、BVとCEのgeometry一致・資源解放を確認した。型チェックと変更ソースのBiomeチェックも成功。

`node --import tsx scripts/checkCeHouseChimneys.mts` で[煙突の拡大比較](../analytics/ce-house-chimneys-20261026.png)と[確認結果](../analytics/ce-house-chimneys-20261026.json)を保存した。指摘された[街路正面の画像](../analytics/ce-house-frontage-20261026.png)と実CEの選択画像も修正後の形状で更新した。JavaScript/WebGLエラーは無く、実CEの選択輪郭とBVモデルの境界も一致した。画像は今回の視覚設計の比較であり、実在地域の全時代の住宅を再現したという検証ではない。

次の計画作業は引き続き§15.3の優先作業2（不整形敷地と未対応の屋根）。
