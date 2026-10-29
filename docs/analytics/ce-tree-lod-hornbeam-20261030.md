# U03：ヨーロッパシデのBV登録とCE森林LOD

実施日：2026-10-30

## 対象と資料

[未登録樹木タスクリスト](../plan/fmg-biome-unregistered-bv-tree-tasks.md) のU03。ヨーロッパシデ `Carpinus betulus`、キー `european_hornbeam` の4品質を新作した。

- [Forest Research：Hornbeam](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/hornbeam-hbm-2/)：対象種と、オークを含む混交広葉樹林での位置づけを確認した。
- [RHS：Carpinus betulus](https://www.rhs.org.uk/plants/3136/carpinus-betulus/details)：縦にうねる灰色の幹、起伏の目立つ卵形の葉を識別要素とした。
- [Keele University：Hornbeam](https://www.keele.ac.uk/arboretum/ourtrees/speciesaccounts/hornbeam/)：葉縁の歯、目立つ葉脈、長い枝を確認した。

約16.5 mの樹高は都市描画用の例示寸法。最大樹高や樹齢別寸法の測量値ではない。刈込、萌芽林・頭木更新、柱状の園芸品種、果房、季節変化は今回の対象に含めない。ほかのシデ類を同じ種として登録してはいない。

## モデルと接続

`src/buildings/landscape/europeanHornbeam.ts` は、灰色の木部、縦にうねる幹、長い上向きの枝、細身の卵形の樹冠、歯と折れ目のある葉を生成する。葉の中央脈と左右の縁を連続した面で結び、起伏と歯を抽象化した。高密度の樹冠を表すため、初期highの疎らな葉を見直し、葉数と1枚の分割を調整した。

highとultraは木部と乱数列を共有する。highは3枚ごとに葉を残して面積を補い、葉を長手方向に5分割する。ultraは10分割。mediumは同じ葉群を房へ当てはめ、lowは樹冠の8つの空間領域をまとめる。最終low/highの幅比はX約0.87、Z約0.86で、既存の0.85〜1.15の検査範囲内。房の不透明さ、lowの角張り、high／ultraの個別葉の隙間には差が残る。

同じ尺度でシデ・ブナ・ナラのhighを並べ、シデの細い幹と縦のうねり、ナラの太い低い分岐、ブナの長い主幹、樹冠幅と葉の形の差を確認した。単木の正面寄り・側面・俯瞰も比較した。

BVのTreesに学名・資料・対応バイオーム・Wikipedia参照と4品質を登録。作者は全品質 `Codex GPT-6.1 Sol`、版IDは `tree.european-hornbeam@<quality>#codex-gpt-6.1-sol`。各品質1版なのでCEは暗黙採用し、競合のない採用表エントリーは追加しない。実BVで4品質を切り替え、「CE adoption: Adopted」を確認した。

CEへの追加は明示キー `centralEuropeanGreatForest`、気温不明または3℃超の森林だけに限定した。ブナ・ナラのhash判定を維持し、残るシナノキ候補の半分を別hashでシデに置換する。候補分岐はブナ1/2・ナラ1/4・シデ1/8・シナノキ1/8の表示用仮配分であり、自然分布の校正値ではない。温帯落葉樹林は既存3種のまま。3℃以下、公園・墓地、カスタム入力の既存選択と、候補座標・密度・土地被覆の生成規則も維持した。2Dと3Dの森林は同じ選択関数を使う。

画面サイズによるLODと `bounded` を使用。既存シナノキの `quality-first` は維持した。登録済みは23樹種・92品質枠となった。

## 計測値

| 品質 | 三角形数 | geometry属性のbytes | 幅X × 幅Z × 高さY（m、埋没根を含む） |
| --- | ---: | ---: | --- |
| low | 237 | 25,596 | 7.79 × 7.56 × 17.11 |
| medium | 1,175 | 126,900 | 8.9 × 9.02 × 16.86 |
| high | 19,124 | 2,065,392 | 8.96 × 8.83 × 17.03 |
| ultra | 117,380 | 12,677,040 | 8.7 × 8.73 × 16.89 |

全品質の地表基準はY=0、埋没根の最下端はY=-0.35 m。木部と葉の2メッシュ・2材質で、CE prototypeでは統合される。属性bytesはCPU側の配列合計であり、GPUの総メモリではない。F0の制作目安（low≤500、medium≤3,000、high≤25,000・3 MiB、ultra≤120,000・13 MiB）内に収まる。

Apple M4・ANGLE Metal、headless Chromium、1200×800、DPR=1。固定入力はseed `ce-hornbeam-u03-v1`、160×160 mの正方形1領域、面積25,600 m²、中欧大森林。森林の俯瞰・林縁・林内と品質3段階を組み合わせて9条件を確認した。

| 視点 | 品質 | BVシデ本数 | シデ三角形数 | シデ＋ブナ＋ナラの詳細三角形数 / 有限予算 | 森林全体の提出三角形数 | calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| overview | light | 14 | 15,512 | 71,290 / 100,000 | 157,190 | 15 |
| overview | standard | 41 | 45,361 | 219,142 / 300,000 | 305,042 | 21 |
| overview | high | 41 | 45,361 | 219,142 / 800,000 | 305,042 | 21 |
| edge | light | 2 | 2,350 | 71,167 / 100,000 | 283,933 | 16 |
| edge | standard | 3 | 3,525 | 271,126 / 300,000 | 483,892 | 20 |
| edge | high | 6 | 60,897 | 771,178 / 800,000 | 983,944 | 22 |
| inside | light | 2 | 20,299 | 71,237 / 100,000 | 395,009 | 19 |
| inside | standard | 2 | 38,248 | 271,096 / 300,000 | 594,868 | 20 |
| inside | high | 6 | 239,460 | 771,289 / 800,000 | 1,095,061 | 26 |

3種を合わせた詳細描画は全9条件で有限予算内、影の三角形数も品質ごとの上限以内。森林全体には既存シナノキの `quality-first` による例外があり、全体が予算内という意味ではない。予算で詳細化できない木は既存の簡略木を描く。

品質切替3巡のgeometry数は28→28→28、モデルと森林の破棄後0。pageerror・WebGL error・context lostは0。計時は初回構築を含むCPU更新と描画提出で、GPU完了時間・都市全体のFPS・p95ではない。数値は [計測JSON](ce-tree-lod-hornbeam-20261030.json) を参照。

## 検証と再現

関連8ファイルの計91件が成功した。

- `npx vitest run src/buildings/landscape/treeQuality.test.ts -t european_hornbeam`：該当3件成功、他50件は選択対象外。4品質の登録と描画量、接地・有限座標、木部共有、lowの幅を確認。外観調整後はこの3件だけを再実行した。
- `npx vitest run src/city-editor/generators/landscapeVegetation.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/forestSvg.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts`：88件成功。29バイオームとBV表示の整合、混交・予算・元の木の復元・資源解放・2D森林・参照先・採用基盤を確認。既存の植栽・寒冷fallbackの検査を中欧大森林にも適用した。
- 変更したTypeScriptのBiome、`git diff --check` が成功。

`npx tsc --noEmit --pretty false` は、今回未変更の `src/city-editor/renderers/fogControls.ts:45` にある `string` を `EditorMessageKey` へ渡す既存エラーで失敗した。今回の変更に関する追加の型エラーは報告されていない。全件テスト・多数seed・都市全体の性能試験は実施していない。

`node --import tsx scripts/verifyCeHornbeamTreeLod.mts` でローカルVite（5223番ポート）とPlaywrightを使用する。比較画像はOSの一時ディレクトリ `fmg-ce-hornbeam-lod` に生成し、数値JSONだけを本ディレクトリに出力する。今回の画像は目視確認後に削除し、Gitには収録しない。

U03を完了。次はU04の中欧のマツ類について具体的な種・資料・キーを確定し、4品質の作製へ進む。
