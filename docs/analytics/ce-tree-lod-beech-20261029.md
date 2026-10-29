# U01：ヨーロッパブナのBV登録とCE森林LOD

実施日：2026-10-29

## 対象と植物資料

[未登録樹木タスクリスト](../plan/fmg-biome-unregistered-bv-tree-tasks.md) のU01。対象を `Fagus sylvatica`、キーを `european_beech` に確定し、4品質を新作した。

- [Forestry England：Beech](https://www.forestryengland.uk/tree-species/beech)：灰色の滑らかな幹、楕円形の葉をモデルの識別要素とした。
- [Forest Research：Beech](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/beech-be/)：対象種と混交林での利用を確認した。

約20 mの樹高は都市描画向けの例示寸法。自然分布全体、最大樹高、樹齢別形状の再現や園芸品種のモデルではない。

## モデルと接続

`src/buildings/landscape/europeanBeech.ts` は連続した灰色の幹、根張り、上向きの枝、折れ目を持つ楕円の葉を生成する。highとultraは乱数列と木部を共有し、highでは葉数を1/4にして葉の面積を補う。mediumは同じ葉位置を房へ縮約し、lowは樹冠を8つの空間領域へまとめる。lowの水平幅はhighに対しX約0.94、Z約0.98で、接地の基準と輪郭の大きな跳びを抑えた。不透明な房と個別葉の透過する隙間の差は残る。

BVのTrees、品質別の作者・版情報、植物資料、Wikipediaリンクを追加した。作者は全品質 `Codex GPT-6.1 Sol`、版IDは `tree.european-beech@<quality>#codex-gpt-6.1-sol`。各品質1版のためCEは暗黙採用する。BVで4品質の切替とCE採用表示を目視確認した。

CEの明示キー `temperateDeciduousForest`／`centralEuropeanGreatForest` の森林で、気温不明または3℃超の場合にシナノキと地点hashで混ぜる。1:1は表示上の仮配分であり、生態的な分布比率の校正値ではない。`landscapeTreeSpecies` に森林用の文脈を追加し、2Dと3Dの森林から渡す。公園・墓地の呼出しは従来の植栽用の文脈を使う。3℃以下のトウヒ・シラカバ、カスタムバイオームのfallbackは維持し、森林の候補座標・密度・土地被覆の生成規則は変更していない。

新種は画面サイズによるLODと `bounded`。既存シナノキの `quality-first` は維持する。既存20樹種と合わせて21樹種・84品質枠となった。

## 計測値

| 品質 | 三角形数 | geometry属性のbytes | 幅X × 幅Z × 高さY（m、埋没根を含む） |
| --- | ---: | ---: | --- |
| low | 256 | 27,648 | 11.72 × 11.63 × 20.65 |
| medium | 1,290 | 139,320 | 12.38 × 12.13 × 20.82 |
| high | 19,184 | 2,071,872 | 12.51 × 11.88 × 20.69 |
| ultra | 71,408 | 7,712,064 | 12.17 × 11.92 × 20.55 |

全品質の最下端はY=-0.35 m、地表基準はY=0。geometryのbytesはCPU側の属性配列の合計であり、GPUの総メモリではない。各品質は木部と葉の2メッシュ・2材質で、CE prototypeでは統合される。

Apple M4・ANGLE Metal、Chromium headless、1200×800、DPR=1。固定入力はseed `ce-beech-u01-v1`、160×160 mの正方形1領域、面積25,600 m²、中欧大森林。単木は正面寄り・側面・俯瞰、森林は俯瞰・林縁・林内と品質3段階を確認した。

| 視点 | 品質 | BVブナ本数 | ブナ三角形数 / 全体の有限予算 | 森林全体の提出三角形数 | calls |
| --- | --- | ---: | ---: | ---: | ---: |
| overview | light | 75 | 84,342 / 100,000 | 416,495 | 11 |
| overview | standard | 147 | 149,304 / 300,000 | 481,457 | 13 |
| overview | high | 147 | 149,304 / 800,000 | 481,457 | 14 |
| edge | light | 11 | 84,308 / 100,000 | 1,740,873 | 13 |
| edge | standard | 19 | 284,410 / 300,000 | 1,940,975 | 18 |
| edge | high | 32 | 784,504 / 800,000 | 2,441,069 | 18 |
| inside | light | 11 | 84,308 / 100,000 | 2,058,501 | 13 |
| inside | standard | 19 | 284,410 / 300,000 | 2,258,603 | 16 |
| inside | high | 47 | 784,316 / 800,000 | 2,758,509 | 20 |

ブナは全9条件で有限の三角形予算内。森林全体はシナノキの既存 `quality-first` による例外を含み、全体予算以内という結果ではない。予算で詳細化できないブナは既存の簡略木に戻る。影の三角形数は全9条件で各品質の上限以内だった。

品質3段階を3巡したgeometry数は16→16→16、破棄後0。pageerror・WebGL error・context lostは0。計時は初回モデル構築を含むCPU更新と描画提出で、GPU完了時間や都市全体のFPS・p95ではない。数値は [計測JSON](ce-tree-lod-beech-20261029.json) を参照。

## 検証

関連8ファイルの計134件が最終的に成功。既存の「シナノキだけを描く」テストは、ブナが追加された中欧大森林から、明示したシナノキ植栽を表す草原へ入力を変更し、従来の予算例外の検証を維持した。

実行した範囲：

- `src/buildings/landscape/treeQuality.test.ts`：4品質、描画量の段階差、不正座標、接地、木部共有、lowの幅。
- `src/buildings/landscape/treeRegistration.test.ts`：登録からBV・森林・公園への伝播。
- `src/city-editor/generators/landscapeVegetation.test.ts`：29バイオーム、BV表示との一致、森林限定のブナ混交、公園・墓地・寒冷・カスタムの維持。
- `src/city3d/three/forestMeshes.test.ts`、`openSpaceTreeLod.test.ts`：混交林の予算、元の木の復元、用途別LOD、資源解放。
- `src/city-editor/renderers/forestSvg.test.ts`：2Dの森林と開口・品質。
- `src/building-viewer/wikipedia.test.ts`、`src/city3d/adoption.test.ts`：BV参照先と採用基盤。

ブナの外観調整後は `npx vitest run src/buildings/landscape/treeQuality.test.ts -t european_beech` の該当3件を再実行して成功した。実GPUの検証も最終形状で実施。変更ファイルのBiomeと `git diff --check` は成功。

`npx tsc --noEmit --pretty false` は今回未変更の `src/city-editor/renderers/fogControls.ts:45` にある `string` を `EditorMessageKey` へ渡す型エラーで失敗した。今回の変更に関する追加の型エラーは報告されていない。全件テスト・多数seed・都市全体の性能試験は実施していない。

## 再現と次の作業

`node --import tsx scripts/verifyCeBeechTreeLod.mts` でローカルVite（5221番ポート）とPlaywrightを使う。単木・実BV・CE森林の比較画像はOSの一時ディレクトリ `fmg-ce-beech-lod` に生成し、数値JSONだけを本ディレクトリへ出力する。今回の画像は目視確認後に削除し、Gitには収録しない。

U01を完了。次はU02のナラ類について具体的な種・資料・キーを確定し、4品質の作製へ進む。地域別の自然分布の校正、樹林限界、季節、低木は引き続き別課題。
