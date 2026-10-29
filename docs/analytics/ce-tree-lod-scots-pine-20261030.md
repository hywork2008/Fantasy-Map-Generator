# U04：ヨーロッパアカマツのBV登録とCE森林LOD

実施日：2026-10-30

## 対象と資料

[未登録樹木タスクリスト](../plan/fmg-biome-unregistered-bv-tree-tasks.md) のU04。ヨーロッパアカマツ `Pinus sylvestris`（Scots pine）、キー `scots_pine` の4品質を新作した。

- [Forest Research：Scots pine](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/131589-scots-pine-sp-2/)：対象種、ヨーロッパを含む分布と混交利用を確認した。
- [Forestry England：Scots pine](https://www.forestryengland.uk/article/scots-pine)：橙赤色の上部樹皮、下部の割れた樹皮、青緑色の針葉、下枝の脱落を識別要素とした。
- [Forestry and Land Scotland：Scots pine](https://forestryandland.gov.scot/living-and-working/learning-and-education/trees/scots-pine)：二葉の針葉と上下の樹皮の違いを確認した。

約21 mの樹高は都市描画用の例示寸法で、最大樹高・樹齢別寸法の測量値ではない。針葉は表示用に抽象化した。球果、季節、幼木の円錐形、他のマツ類・園芸品種は今回の対象に含めない。

## モデルと接続

`src/buildings/landscape/scotsPine.ts` は、暗い下部の木部、橙赤色の上部樹皮、少数の枯れ枝の残る長い幹、不規則な上部の枝、共通の基部から出る二葉の針葉を生成する。青緑色の針葉の房と上部に集まる樹冠を持ち、既存のトウヒの輪生・円錐形や、カナリアマツの低い枝段・長い垂れた針葉とは別のモデルとした。

highとultraは木部・乱数列を共有し、highは4組ごとに針葉を残して面積を補う。mediumは同じ針葉位置から房を当てはめ、lowは樹冠の空間8分割から輪郭を作る。low/high幅比はX約1.12、Z約1.00。mediumの房・lowの不透明な樹冠と、high／ultraの細い針葉の隙間には差が残る。単木3視点と、トウヒ・カナリアマツのhighとの同尺度比較で、幹・樹皮・枝段・針葉・樹冠の違いを確認した。

BVのTreesに学名・植物資料・対応バイオーム・Wikipedia参照と4品質を登録。作者は全品質 `Codex GPT-6.1 Sol`、版IDは `tree.scots-pine@<quality>#codex-gpt-6.1-sol`。各品質1版の暗黙採用なので、競合のないCE採用表エントリーは追加しない。実BVで4品質の切替と「CE adoption: Adopted」を確認した。

CEへの追加は明示キー `centralEuropeanGreatForest`、気温不明または3℃超の森林に限定した。ブナ・ナラ・シデのhash判定と候補を維持し、残るシナノキ候補の半分を別hashでマツへ置換する。候補分岐はブナ1/2・ナラ1/4・シデ1/8・マツ1/16・シナノキ1/16の表示用仮配分で、自然分布の校正値ではない。温帯落葉樹林・寒冷時・公園・墓地・カスタム入力の選択、候補座標・密度・土地被覆の生成規則は維持した。2Dの記号と3Dの簡略木の分類へ `scots_pine` を追加し、針葉樹として扱う。

画面サイズLOD・`bounded` を使用し、既存シナノキの `quality-first` は維持。これで初期追加U01〜U04の4代表種・16品質を完了し、登録済みは24樹種・96品質枠となった。

## 計測値

| 品質 | 三角形数 | geometry属性のbytes | 幅X × 幅Z × 高さY（m、埋没根を含む） |
| --- | ---: | ---: | --- |
| low | 275 | 29,700 | 10.69 × 10.06 × 21.67 |
| medium | 1,305 | 140,940 | 8.71 × 9.22 × 20.91 |
| high | 10,316 | 1,114,128 | 9.58 × 10.03 × 21.41 |
| ultra | 37,364 | 4,035,312 | 8.86 × 9.5 × 21.02 |

全品質の地表基準はY=0、埋没根の最下端はY=-0.35 m。木部と針葉の2メッシュ・2材質で、CE prototypeでは統合される。属性bytesはCPU側の配列合計で、GPUの総メモリではない。F0の制作目安（low≤500、medium≤3,000、high≤25,000・3 MiB、ultra≤120,000・13 MiB）内。

Apple M4・ANGLE Metal、headless Chromium、1200×800、DPR=1。固定入力はseed `ce-pine-u04-v1`、160×160 mの正方形1領域、面積25,600 m²、中欧大森林。俯瞰・近景・林内と品質3段階の9条件を確認した。

俯瞰で最初に詳細化されたマツの位置をアンカーとし、最終の近景・林内では位置と樹高に合わせて視点を設定した。アンカーは約X=-29.856・Z=45.714 m、地上樹高約17.593 m。nearはアンカーからX+5・Z+7 m、カメラ高は樹高の半分+3 m。insideはX+2・Z+3 m、カメラ高3.2 mで、両方とも樹高の半分へ向ける。値はJSONとスクリプトに記録した。

| 視点 | 品質 | BVマツ本数 | マツ三角形数 | マツ＋シデ＋ブナ＋ナラの詳細三角形数 / 有限予算 | 森林全体の提出三角形数 | calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| overview | light | 1 | 1,305 | 70,861 / 100,000 | 134,728 | 20 |
| overview | standard | 10 | 13,050 | 225,800 / 300,000 | 289,667 | 27 |
| overview | high | 10 | 13,050 | 225,800 / 800,000 | 289,667 | 27 |
| near | light | 1 | 37,364 | 85,400 / 100,000 | 143,152 | 14 |
| near | standard | 1 | 37,364 | 285,372 / 300,000 | 343,124 | 15 |
| near | high | 2 | 38,669 | 785,490 / 800,000 | 843,242 | 19 |
| inside | light | 1 | 37,364 | 78,252 / 100,000 | 92,752 | 10 |
| inside | standard | 1 | 37,364 | 264,520 / 300,000 | 279,020 | 10 |
| inside | high | 1 | 37,364 | 368,968 / 800,000 | 383,468 | 10 |

有限予算を使う4種の詳細描画合計と影の三角形数は、全9条件で各品質の上限以内。森林全体には既存シナノキの `quality-first` 例外を含むため、全体が予算内という意味ではない。全9条件で詳細マツを観測し、近景ではultraの採用モデルが使われた。

初期の任意の近景では周囲の広葉樹が有限予算を使い、マツの詳細化が見られない条件があったため、最終確認を実際のマツの位置へ合わせた。未選択時は既存の針葉樹の簡略木を使う。簡略木は共通形状のため、全距離でマツ固有の樹冠を保証する結果ではない。周囲の樹冠による遮蔽も残る。

品質切替3巡のgeometry数は24→24→24、モデルと森林の破棄後0。pageerror・WebGL error・context lostは0。計時は初回構築を含むCPU更新と描画提出で、GPU完了時間・都市全体のFPS・p95ではない。数値は [計測JSON](ce-tree-lod-scots-pine-20261030.json) を参照。

## 検証と再現

関連8ファイルの計92件が成功した。

- `npx vitest run src/buildings/landscape/treeQuality.test.ts -t scots_pine`：該当3件成功、他53件は選択対象外。4品質の登録と描画量、有限座標・接地、木部共有、lowの幅を確認。
- `npx vitest run src/city-editor/generators/landscapeVegetation.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/forestSvg.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts`：89件成功。29バイオームとBV表示の整合、用途・気温・カスタム選択、予算・資源解放・元の木の復元、2D森林・参照先・採用基盤を確認。実際に選ばれたマツを2Dで針葉樹記号にし、周囲の広葉樹を広葉樹記号にする回帰検査を追加した。
- 変更したTypeScriptのBiome、`git diff --check` が成功。

`npx tsc --noEmit --pretty false` は、今回未変更の `src/city-editor/renderers/fogControls.ts:45` にある `string` を `EditorMessageKey` へ渡す既存エラーで失敗した。今回の変更に関する追加の型エラーは報告されていない。全件テスト・多数seed・都市全体の性能試験は実施していない。

`node --import tsx scripts/verifyCeScotsPineTreeLod.mts` でローカルVite（5224番ポート）とPlaywrightを使用する。比較画像はOSの一時ディレクトリ `fmg-ce-pine-lod` に生成し、数値JSONだけを本ディレクトリに出力する。今回の画像は目視確認後に削除し、Gitには収録しない。

U04を完了。次はR01の熱帯季節林・熱帯乾燥林について対象地域と追加樹種・資料を選定する。U01〜U04完了は全バイオームの全樹種を網羅した意味ではない。
