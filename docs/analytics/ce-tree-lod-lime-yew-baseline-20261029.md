# シナノキ・イチイの4品質と採用版の基準比較

確認用画像は目視比較のための一時出力とし、永続保存・Git収録を行わない。画像ファイルの有無を完了条件にせず、以下の所見・条件・計測値・再現手順を記録として残す。既存スクリプトによる画像出力も確認後に削除する。

実施日：2026-10-29。対象：[樹木LOD作製計画](../plan/ce-forest-biome-tree-lod-tasks.md) F1-1。

## 確認結果

シナノキ `garden_parkland` とイチイ `sacred_yew` の現在のCE採用8モデルを再確認し、固定条件の基準比較の所見と計測値を揃えた。モデル・品質方針・採用表・作者の変更は行っていない。

両種のmediumはOpus版。low／high／ultraは現在の採用variantのauthorがCodex。lowの陰影改修などの寄与は既存のcreditsを保持し、今回再帰属していない。シナノキhighは採用表どおりCodex版を使用し、BVのOpus high／light等へ置き換えていない。

実BVで全4品質を選び、それぞれの採用作者でAdopted表示になることを確認した。旧Codex mediumも比較用として残り、選択すると `Not adopted; CE uses Claude Opus 5.5` と表示される。

## 計測値

[計測JSON](ce-tree-lod-lime-yew-baseline-20261029/results.json) にvariant ID・作者・派生元、元モデル／CE prototypeの三角形・bufferBytes・外接範囲、関連ソースのSHA-256を記録した。

| 樹種 | 品質 | 作者 | 三角形 | 全高 m | X幅 m | 元buffer KiB | CE prototype KiB |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| シナノキ | low | Codex | 153 | 11.844 | 8.349 | 14.5 | 16.1 |
| シナノキ | medium | Opus | 1,888 | 11.463 | 10.885 | 159.5 | 199.1 |
| シナノキ | high | Codex | 21,626 | 11.884 | 10.852 | 1904.1 | 2280.9 |
| シナノキ | ultra | Codex | 84,098 | 11.594 | 10.616 | 8493.0 | 8869.7 |
| イチイ | low | Codex | 167 | 7.648 | 7.053 | 16.0 | 17.6 |
| イチイ | medium | Opus | 1,827 | 7.792 | 10.684 | 149.8 | 192.7 |
| イチイ | high | Codex | 14,484 | 7.836 | 11.108 | 921.1 | 1527.6 |
| イチイ | ultra | Codex | 33,428 | 7.903 | 11.348 | 2919.1 | 3525.6 |

全高は根を含む外接範囲。全モデルの下端は−0.35 mで揃う。bufferBytesは属性・index配列の合計でGPU実メモリではない。CE prototypeはindexを展開してposition／normal／colorへ統合するため、元モデルよりbyte数が増える。元の2材質をCEの1つのvertex-color材質へまとめるが、三角形数と外接範囲は保持される。

各種でlow→medium→high→ultraの三角形が単調増加し、lowは500未満、mediumは3,000未満。prototypeの座標・法線・色は有限値で、解放後に空sceneを描くとgeometry／textureが0になった。JSON内のprototype構築msは単発のCPU計測であり、ウォームアップを揃えた性能比較やGPU時間ではない。

## 比較条件

ユーザー指定の [medium房の作り方](../plan/tree-medium-canopy-lobes.md) の比較方法に合わせた。現在の採用モデルを `createBvPrototypeCache` でCEと同じDoubleSide・vertex color・MeshLambert材質に焼き込んで描く。元BV材質のまま撮影した画像とは区別する。

- Apple M4／ANGLE Metal、1200×800、DPR 1、sRGB、背景 `#c5c5bf`。
- CEのHemisphereLightと `updateSun(DEFAULT_SUN)` を使用。既定の太陽設定enabled=falseに従う固定方向・強度で、影は無効。以前の樹種作製記録で使ったsunDirection(DEFAULT_SUN)の明示方向と同一の光向きとはみなさない。
- 元モデルのメートル単位・原点・向きを保持し、全品質を同じ正投影のworld scaleで比較する。品質ごとの自動fitやサイズ補正はしない。実際のCEでは別途候補の樹冠半径・高さへ正規化するため、その切替結果の画像ではない。
- 4品質の斜め・側面・真上の3枚。各300×400 pxセル、同じカメラ範囲21×28 m。品質によるネイティブ寸法の差もそのまま残す。
- medium／highの単木は、highの樹冠外接範囲を画面へ投影した高さ45／90 pxを共通基準にし、仰角12°／40°／70°を比較。medium自身へ再fitしない。
- 林は260本、固定の20列×13列、間隔5.5／6 m、同じ向きの列を避ける固定回転。仰角35°・距離130 m、medium／highで配置・照明・視点を共有する。

## 比較条件と目視所見

- 4品質：斜め、側面、真上
- 単木medium／high：12°、40°、70°
- 260本の林・medium／high
- 実BVの採用medium：シナノキ、イチイ

斜め・真上、40°の単木と林の比較を目視した。シナノキの広い樹冠とイチイの低く横へ広がる樹形は区別でき、mediumはhighの樹冠の房・枝の分布を保持している。

ただし、mediumの面で塞がれる部分はhighの個別葉より密に見える。特にイチイはhighに枝間の透けが残り、林ではmediumの方が連続した緑の面になる。lowは樹冠の外接幅が小さく、斜め・真上で粗い房の輪郭になる。したがって「全品質の輪郭・密度が同一」とは判定しない。今回の作業は採用版の基準を残すものであり、見た目の差を解消した最終受入ではない。最終的な切替と密度の評価はF5-6でこの基準を使う。

## 再現と関連検証

```sh
node --import tsx scripts/verifyCeLimeYewBaseline.mts
npx vitest run src/buildings/landscape/smallLeavedLime.test.ts src/buildings/landscape/europeanYew.test.ts src/buildings/landscape/canopyLobes.test.ts src/city3d/adoption.test.ts src/city3d/three/bvInstances.test.ts
```

関連5ファイル20件が成功。接地・形状・所有資源、房の当てはめ、採用版の登録と可視作者、CE prototypeの色・法線・資源共有を確認した。実BVの品質8選択とmedium作者切替、WebGL／pageerror 0、解放後geometry／texture 0も確認済み。重複する単体テストや製品コードの変更は追加していない。型確認は今回再実行していない。

## 次の作業

F1-1を完了。次はF1-4の温帯・寒帯6バイオームの割当・温度分岐と森林内の表示を確認する。その後F2-3の乾燥地・草原の自然林と植栽範囲、F3-3の水辺・高地・火山等の接地を揃え、F5-6で全29バイオーム・全20樹種の最終受入と残課題を整理する。

シナノキ・イチイのCE・BV受入欄は、この基準比較だけでは完了にしていない。別GPU・高DPR・影ありの全樹種の比較や、全品質の密度差・寸法差が自動的に許容されたことも意味しない。
