# U02：ヨーロッパナラのBV登録とCE森林LOD

実施日：2026-10-29

## 対象と資料

[未登録樹木タスクリスト](../plan/fmg-biome-unregistered-bv-tree-tasks.md) のU02。対象をヨーロッパナラ `Quercus robur`（Pedunculate oak）、キーを `pedunculate_oak` に確定した。

- [Forest Research：Pedunculate oak](https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/131559-pedunculate-oak-pok-2/)：対象種とヨーロッパにおける分布を確認。
- [Forestry England：Oak](https://www.forestryengland.uk/tree-species/english-oak)：粗い樹皮と切れ込む葉を識別要素として確認。

U02の代表1種として追加した。近縁の `Quercus petraea` や他地域のナラ類を同じ種として登録してはいない。約18 mの樹高は都市描画用の例示寸法であり、最大樹高・樹齢別寸法の測量値ではない。園芸品種、ドングリ、季節変化は今回の対象に含めない。

## モデルと接続

`src/buildings/landscape/pedunculateOak.ts` で4品質を新作した。太い根元、筋と溝を持つ灰褐色の木部、不等間隔の曲がった分岐、横へ広がる樹冠、切れ込む葉を持つ。ブナの細長い樹冠・滑らかな幹・楕円葉と同じ尺度で並べ、分岐位置・幹の太さ・樹冠の幅・葉の輪郭の差を目視確認した。

highとultraは同じ乱数列と木部を使用する。highの葉を6枚ごとに残して面積を補い、mediumは同じ葉位置から当てはめた房、lowは樹冠の空間8分割から作る輪郭とする。初期の葉の密度・輪郭を調整し、lowの水平幅が大きくなり過ぎた差も修正した。最終のlow/high幅比はX約1.03、Z約0.99。不透明な房と個別葉の隙間、少ない面数によるlowの角張りは残る。

BVのTreesに学名・説明・資料・Wikipedia参照と4品質を登録した。作者は全品質 `Codex GPT-6.1 Sol`、版IDは `tree.pedunculate-oak@<quality>#codex-gpt-6.1-sol`。各品質1版の暗黙採用であり、競合のないCE採用表エントリーは追加しない。実BVで4品質の切替と「CE adoption: Adopted」を確認した。

CEはU01と同じ明示キー `temperateDeciduousForest`／`centralEuropeanGreatForest` の森林に限定し、気温不明または3℃超の場合に追加する。ブナのhash判定とその候補を維持し、残るシナノキ候補を別hashでナラとシナノキに分ける。候補分岐はブナ1/2・ナラ1/4・シナノキ1/4の表示用仮配分であり、生態的な比率の校正値ではない。3℃以下のトウヒ・シラカバ、公園・墓地・カスタム入力の従来選択を維持する。2Dと3Dの森林は同じ選択関数を使い、候補座標・密度・土地被覆の生成規則は変更していない。

画面サイズによるLODと `bounded` を使用する。既存シナノキの `quality-first` は維持した。既存21樹種と合わせて22樹種・88品質枠となった。

## 計測値

| 品質 | 三角形数 | geometry属性のbytes | 幅X × 幅Z × 高さY（m、埋没根を含む） |
| --- | ---: | ---: | --- |
| low | 219 | 23,652 | 15.09 × 14.14 × 17.42 |
| medium | 1,149 | 124,092 | 14.54 × 13.81 × 18.0 |
| high | 21,304 | 2,300,832 | 14.61 × 14.26 × 17.85 |
| ultra | 119,584 | 12,915,072 | 14.23 × 13.93 × 17.76 |

全品質の地表基準はY=0、埋没根の最下端はY=-0.35 m。木部と葉の2メッシュ・2材質で、CE prototypeでは統合される。属性bytesはCPU側のgeometry配列の合計であり、GPUの総メモリではない。F0の制作目安（low≤500、medium≤3,000、high≤25,000・3 MiB、ultra≤120,000・13 MiB）内に収まる。

Apple M4・ANGLE Metal、headless Chromium、1200×800、DPR=1。固定入力はseed `ce-oak-u02-v1`、160×160 mの正方形1領域、面積25,600 m²、中欧大森林。単木3視点、ブナとの同尺度比較、実BV4品質と、CE森林の品質3段階×3視点を確認した。

| 視点 | 品質 | BVナラ本数 | ナラ三角形数 | ナラ＋ブナの詳細三角形数 / 有限予算 | 森林全体の提出三角形数 | calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| overview | light | 31 | 16,089 | 75,675 / 100,000 | 246,891 | 13 |
| overview | standard | 83 | 31,197 | 180,501 / 300,000 | 351,717 | 18 |
| overview | high | 83 | 31,197 | 180,501 / 800,000 | 351,717 | 18 |
| edge | light | 2 | 1,368 | 75,868 / 100,000 | 647,265 | 15 |
| edge | standard | 7 | 47,423 | 275,837 / 300,000 | 847,234 | 16 |
| edge | high | 14 | 195,621 | 775,807 / 800,000 | 1,347,204 | 20 |
| inside | light | 8 | 47,642 | 75,856 / 100,000 | 974,263 | 16 |
| inside | standard | 5 | 183,715 | 275,853 / 300,000 | 1,174,260 | 20 |
| inside | high | 12 | 370,658 | 775,776 / 800,000 | 1,674,183 | 22 |

ナラとブナを合わせた詳細描画は全9条件で有限予算内。森林全体はシナノキの既存 `quality-first` 例外を含み、全体予算内という意味ではない。予算で詳細化できない木は既存の簡略木を描く。影の三角形数も各品質の上限以内だった。

品質切替3巡のgeometry数は22→22→22、モデルと森林の破棄後0。pageerror・WebGL error・context lostは0。計時は初回構築を含むCPU更新と描画提出であり、GPU完了時間・都市全体のFPS・p95ではない。数値は [計測JSON](ce-tree-lod-oak-20261029.json) を参照。

## 検証と再現

関連8ファイルの計90件が最終的に成功した。

- `npx vitest run src/buildings/landscape/treeQuality.test.ts -t pedunculate_oak`：該当3件が成功、他47件は選択対象外。4品質の登録・描画量・接地・有限座標、high／ultraの木部共有、lowの幅を確認。外観調整後はこの3件だけを再実行した。
- `npx vitest run src/city-editor/generators/landscapeVegetation.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/forestSvg.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts`：87件が成功。29バイオームとBV表示の整合、用途・温度・カスタムの選択、混交と予算、元の木の復元、資源解放、2D森林・参照先と採用基盤を確認。
- 変更したTypeScriptのBiome、`git diff --check` が成功。

`npx tsc --noEmit --pretty false` は、今回未変更の `src/city-editor/renderers/fogControls.ts:45` にある `string` を `EditorMessageKey` へ渡す既存エラーで失敗した。今回の変更に対する追加の型エラーは報告されていない。全件テスト・多数seed・都市全体の性能試験は実施していない。

`node --import tsx scripts/verifyCeOakTreeLod.mts` でローカルVite（5222番ポート）とPlaywrightを使って再現できる。比較画像はOSの一時ディレクトリ `fmg-ce-oak-lod` に生成し、数値JSONだけを本ディレクトリに出力する。今回の画像は目視確認後に削除し、Gitには収録しない。

U02を完了。次はU03のシデ類について具体的な種・資料・キーを確定し、4品質の作製へ進む。
