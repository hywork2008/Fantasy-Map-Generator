# CE樹木LOD：用途別4樹種の4品質化

確認用画像は目視比較のための一時出力とし、永続保存・Git収録を行わない。画像ファイルの有無を完了条件にせず、以下の所見・条件・計測値・再現手順を記録として残す。既存スクリプトによる画像出力も確認後に削除する。

2026-10-29。[全樹種のタスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) F4-1の作業記録。

## 1. 実装と作者

イトスギ `mediterranean_cypress`、コノテガシワ `oriental_evergreen`、インドボダイジュ `sacred_bodhi_and_fig`、シダレヤナギ `peaceful_willow` をlow／medium／high／ultraとしてBVとCEの共通登録へ接続した。既存Claude Opus 5.5のdefaultは形状を変えずultraとし、新作3品質をCodex GPT-6.1 Solとして作者・派生元に記録した。highはOpus ultra、low／mediumは同樹種highを元にする。4樹種すべてで、変更前HEADとのgeometry全属性・index配列の完全一致を確認した。既存CE採用表は編集していない。

| 樹種 | 品質 | 三角形 | source bufferBytes | 作者 |
| --- | --- | --- | --- | --- |
| `mediterranean_cypress` | low | 339 | 36,612 | Codex GPT-6.1 Sol |
| `mediterranean_cypress` | medium | 1,688 | 182,304 | Codex GPT-6.1 Sol |
| `mediterranean_cypress` | high | 5,192 | 560,736 | Codex GPT-6.1 Sol |
| `mediterranean_cypress` | ultra | 9,092 | 981,936 | Claude Opus 5.5 |
| `oriental_evergreen` | low | 297 | 32,076 | Codex GPT-6.1 Sol |
| `oriental_evergreen` | medium | 2,205 | 238,140 | Codex GPT-6.1 Sol |
| `oriental_evergreen` | high | 9,820 | 1,060,560 | Codex GPT-6.1 Sol |
| `oriental_evergreen` | ultra | 15,676 | 1,693,008 | Claude Opus 5.5 |
| `sacred_bodhi_and_fig` | low | 356 | 38,448 | Codex GPT-6.1 Sol |
| `sacred_bodhi_and_fig` | medium | 1,559 | 168,372 | Codex GPT-6.1 Sol |
| `sacred_bodhi_and_fig` | high | 15,423 | 1,665,684 | Codex GPT-6.1 Sol |
| `sacred_bodhi_and_fig` | ultra | 42,618 | 4,602,744 | Claude Opus 5.5 |
| `peaceful_willow` | low | 392 | 42,336 | Codex GPT-6.1 Sol |
| `peaceful_willow` | medium | 1,970 | 212,760 | Codex GPT-6.1 Sol |
| `peaceful_willow` | high | 37,292 | 4,027,536 | Codex GPT-6.1 Sol |
| `peaceful_willow` | ultra | 75,452 | 8,148,816 | Claude Opus 5.5 |

[変更前の棚卸し](ce-tree-lod-garden-before-20261029.json) は68モデル枠、[変更後](ce-tree-lod-garden-after-20261029.json) は80枠。全20樹種・80品質枠に実装が揃った。これは作製と登録の完了であり、全バイオーム・用途・性能の最終受入を意味しない。bufferBytesはsource geometryの属性・index配列の合計で、GPU実メモリではない。

## 2. mediumの当てはめと樹形

[tree-medium-canopy-lobes.md](../plan/tree-medium-canopy-lobes.md) に従い、highが出力する枝葉の頂点分布から房を当てはめた。葉を省く前に元の乱数を消費し、high／ultraの木部を一致させる。共通の法線・上向きの補正・頂点AO・色むら・頂点の揺らぎ・隠れた面の除去を使い、生成後に法線を再計算しない。

| 樹種 | high | medium | low |
| --- | --- | --- | --- |
| イトスギ | 鱗葉の枝葉を半分にし幅2倍 | 高さ1 m帯×方位6区分の分布をcoverage 1で当てはめる | 高さ帯ごとの房、coverage 0.82。鉛直半径を1.55倍にし、細い紡錘形の連続性を保つ |
| コノテガシワ | 各扇の枝葉を1本おきに残し幅1.75倍 | 側枝ごとの扇状の頂点群を0.85で当てはめる | 4本の主幹ごとに高さ方向を3群、0.9 |
| インドボダイジュ | 葉を3分の1にし幅3倍 | 小枝と主枝先端の葉群を0.9で当てはめる | 7本の主枝ごとの葉群、0.95。4本の気根は省略しない |
| シダレヤナギ | 各垂れ枝の葉を3分の1にし幅3倍。細枝を維持 | 隣接する垂れ枝3本ずつを0.75で当てはめ、水平半径を0.8倍にする | 各主枝の葉群を2つの垂れる房、0.9。水平半径を0.85倍にする |

イトスギlowの初期版は高さ帯の間が空いて見えたため、水平幅を維持しながら鉛直方向を補った。ヤナギmediumの初期版は垂れ枝4本をまとめていたが、房が大きかったため3本ずつへ分け、横幅も抑えた。lowの幹は6分割、残す木部の側面はlow 3分割・medium 4分割とし、元の枝葉の生成と乱数消費は継続する。

lowは全種500未満、mediumは全種3,000未満。ヤナギhighは37,292三角形・4,027,536 bytesで、初期制作目安の25,000三角形・3 MiBを超える。木部だけで18,212三角形あり、元ultraの垂れる細枝を維持した上で葉を57,240→19,080三角形へ減らした結果である。これは目安の例外として記録し、さらなる木部の縮約や性能の受入はF5に残す。

## 3. CEの用途とLOD方針

この4樹種は既存イチイと同じ `selection: pixels`／`budget: bounded` に登録した。自然林の主樹種へ一律に転用せず、既存の公園・墓地・宗教施設等の配置で選択された際に画面サイズによるLODを使う。バイオームの樹種選択関数、用途・文化の選択処理、保存形式は編集していない。

元ultraの樹高／水平最大半径比（イトスギ12.385、コノテガシワ3.448、インドボダイジュ1.24、シダレヤナギ1.378）も登録した。森林用の任意指定であり、公園等で明示される高さ・半径は優先する。森林のbounded予算と、公園のLODを区別する。公園は既存どおり配置数まで描画し、木の総三角形に上限を設けていない。

## 4. 同条件の比較と実BV

CEと同じ `createBvPrototypeCache().acquire()`、DoubleSideの頂点カラー材質、HemisphereLight（0xf4f0e6／0x6d7a62、0.9）、DirectionalLight（1.15、`sunDirection(DEFAULT_SUN)`）を使った。背景0xc5c5bf、SRGB、DPR 1、1200×1600。

- 4品質・斜め、側面、俯瞰
- 単木medium／high：high樹冠bounds基準の45／90 px相当で倍率を揃え、12°、40°、70°を比較。
- 各260本の林、35°／130 m：同じ位置・回転・寸法で比較。
- 実BV：イトスギ、コノテガシワ、インドボダイジュ、シダレヤナギ。各4品質の選択と描画を確認した。

mediumはhighの個別葉を不透明な房へ縮約するため、面の占有率と透け方が異なる。特にヤナギは葉の房が高品質の細い垂れ枝より密に見える。画像はこの差を含む比較資料であり、全条件の最終受入はF5に残す。

## 5. CE公園の36条件とGPU確認

今回は森林の主樹種を置き換えず、`createTownOpenSpaces` の実描画を使う。各樹種260本、同じ位置・回転、元ultraの高さ・水平最大半径を明示した固定配置で、俯瞰・近景・低視点×zoom 0.5／1／2の計36条件を描いた。Apple M4・ANGLE Metal・Chromium・DPR 1、viewportは1200×1600。各樹種で全4品質が観測された。

zoom 1の数量：

| 樹種 | 視点 | 表示樹木 | low / medium / high / ultra | 三角形 | calls |
| --- | --- | --- | --- | --- | --- |
| `mediterranean_cypress` | overview | 260 | 0 / 260 / 0 / 0 | 438,880 | 2 |
| `mediterranean_cypress` | edge | 203 | 0 / 0 / 87 / 116 | 1,506,376 | 4 |
| `mediterranean_cypress` | low | 112 | 0 / 0 / 0 / 112 | 1,018,304 | 2 |
| `oriental_evergreen` | overview | 260 | 260 / 0 / 0 / 0 | 77,220 | 2 |
| `oriental_evergreen` | edge | 192 | 0 / 0 / 168 / 24 | 2,025,984 | 4 |
| `oriental_evergreen` | low | 102 | 0 / 0 / 16 / 86 | 1,505,256 | 4 |
| `sacred_bodhi_and_fig` | overview | 260 | 260 / 0 / 0 / 0 | 92,560 | 2 |
| `sacred_bodhi_and_fig` | edge | 209 | 0 / 0 / 172 / 37 | 4,229,622 | 4 |
| `sacred_bodhi_and_fig` | low | 125 | 0 / 0 / 10 / 115 | 5,055,300 | 4 |
| `peaceful_willow` | overview | 260 | 260 / 0 / 0 / 0 | 101,920 | 2 |
| `peaceful_willow` | edge | 205 | 0 / 0 / 185 / 20 | 8,408,060 | 3 |
| `peaceful_willow` | low | 117 | 0 / 0 / 20 / 97 | 8,064,684 | 3 |

- イトスギ：近景、俯瞰、低視点
- コノテガシワ：近景、俯瞰、低視点
- インドボダイジュ：近景、俯瞰、低視点
- シダレヤナギ：近景、俯瞰、低視点

zoom切替3巡のgeometry数は全種32→32→32で安定した。WebGL・pageerror・BVエラーは0件。[描画記録JSON](ce-tree-lod-garden-20261029/results.json) は単発CPU更新／提出時間だけを記録し、GPU完了時間・街全体の操作p95・33 ms目標の達成を示さない。ヤナギの固定配置は近景約841万三角形であり、実際の配置密度・木部縮約・予算の扱いを含むF5の性能確認が必要である。影の提出先は選択するが、影ありの外観は今回の確認範囲に含めない。

## 6. 検証・再現と残作業

関連9ファイル123件のVitestが成功（重複実行は数えない）。全20樹種の登録・採用・作者、品質ごとの三角形増加、寸法・接地・有限値、high／ultra木部一致、CE prototypeの法線／色と資源解放、森林・公園・CE更新を確認した。公園のpixel LODの検査を新4樹種へ拡張し、zoomでlow→highへ切り替わることを確認した。

森林のイトスギを固定指定するbounded試験は、単一defaultの代わりに品質ごとの採用BV geometryを検査し、遠景集約後に配置が戻ることを確認する。同時4樹種制限／cache eviction試験は、実際に選ばれた品質の描画meshを取得する形に修正した。製品のLOD・資源管理処理は変更していない。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/treeRegistration.test.ts src/city3d/adoption.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city3d/three/openSpaceMeshes.test.ts src/city-editor/renderers/cityViewRendering.test.ts
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-garden-after-20261029.json
node --import tsx scripts/verifyCeGardenTreeLod.mts
```

変更前JSONは上書きせず保持する。棚卸しJSONにソースSHA-256、描画スクリプトに固定配置・比較条件を保存した。保存対象のJSONは各ファイル2 MB未満。TypeScript全体検査は既存の `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗し、今回の変更ファイルには型エラーが報告されなかった。

モデル作製枠は20樹種・80品質すべて実装済み。次はF4-2の用途・文化別割当、F4-3の無立木・未指定・全件台帳の確認へ進む。F1-1の既存モデルの基準比較、F1-4／F2-3／F3-3のバイオーム確認と、F5の総合受入・性能確認は未完了である。
