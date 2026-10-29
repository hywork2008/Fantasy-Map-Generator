# BVリンゴ4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP0・P1／F01。`domestic_apple`（Malus domestica）のBV単木と品質・作者の登録を確認した。CEの果樹園配置、森林全体性能、季節・収量シミュレーションは今回の検証範囲に含めない。

## 対象と計測

短い幹、6本の低い主枝、上向きの側枝、鋸歯葉、短い果枝から垂れる果実を持つ栽培成木。地表からの高さは約6.1 m。highとultraの枝骨格・果実位置は同一で、highは葉のサンプルを4分の1にして葉面積を補い、果実の分割数を減らす。mediumは同じ葉群から房を当てはめ、果実を半数へ減らす。lowは果実を省略し、樹冠の輪郭を残す。

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 309 | 33,372 | 2 | 2 | 5.789 |
| medium | 1,568 | 141,120 | 3 | 3 | 6.114 |
| high | 18,372 | 1,764,144 | 3 | 3 | 6.036 |
| ultra | 109,380 | 11,192,688 | 3 | 3 | 6.058 |

属性配列サイズは生成元のCPUデータを数えた値で、GPUメモリ量ではない。4品質の地下の根の下端はY=-0.35 m、幹の地表基準はY=0。BVの外接枠8.1×7.6×6.2 mが全品質を覆う。下位品質で幅・高さが完全一致するわけではないが、lowとhighの水平幅比は既存の0.85〜1.15の検査範囲内。

モデルとBV登録・LOD定義は `src/buildings/landscape/domesticApple.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。作者は全品質 `Codex GPT-6.1 Sol`、版familyは `tree.domestic-apple`。比較版はなく暗黙採用。栽培木のためBVの自然林 `biomes` は付けず、既存のCE森林選択を維持した。

## 目視とGPU確認

`scripts/verifyBvAppleTreeLod.mts` の固定1200×700 viewport、同じ照明・尺度で4品質の正面・斜め・上面寄りを描画した。果実・葉の近景と、highのリンゴ・オリーブ・シナノキの同尺度比較も確認した。実BVは1200×800 viewportでTreesの `Domestic apple · Malus domestica` を選択し、4品質の表示・作者・派生元・`CE adoption: Adopted` を確認した。

- 短い幹と開いた主枝、上向きの側枝で、シナノキの高い丸い冠、オリーブの細葉・銀葉・ねじれた幹と区別できた。
- high／ultraは折れた鋸歯葉と、肩・軸のくぼみのある果実を確認した。果実は独立した短い果枝に付け、葉群の外へ無関係に散布していない。花や季節変化は作製していない。
- mediumは詳細葉より連続した房、lowはより粗い面になる。中央の開いた冠と主要寸法を保つが、同じ密度の画像を保証するものではない。果実はmediumで簡略化し、lowでは省略した。
- 実BVのhigh／ultra上面SVGで葉が消える不具合を発見し、葉の頂点順を上向きに修正した。3Dの両面描画だけでは見落とすため、葉だけの上面投影に十分な面が残る回帰検証を追加し、修正後の実BV上面図を確認した。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデルを破棄・再生成する品質巡回3回で常駐geometryは11→11→11、最終破棄後geometry・textureはともに0。pageerrorは0件、WebGL error・context lossは検出されなかった。

数値と検査結果は [計測JSON](bv-apple-tree-lod-20261030.json)。これは単木の生成・表示・解放の確認であり、都市全体のFPS・インスタンス林の描画予算を計測した結果ではない。

## テストと再現手順

関連Vitestの初回実行は6ファイル・103件成功。上面投影の回帰2件を追加し、葉の面向きを修正後に `domesticApple.test.ts` の4件のみ再実行して成功した。最終的に関連6ファイルの計105件が成功している。

```sh
npx vitest run src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
node --import tsx scripts/verifyBvAppleTreeLod.mts
```

検証スクリプトはlocalhost:5226で一時Viteサーバーとheadless Chromiumを起動し、単木の3視点・近景・比較、実BVの4品質と採用表示、資源解放を確認する。計測JSONを更新し、画像はOSの一時ディレクトリ `fmg-bv-apple-lod` へ出す。確認画像は目視後に削除し、Gitに収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は今回未変更の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストは実行していない。

P0・P1／F01を完了。次はP2／F02セイヨウナシの樹形・寸法・枝と果実の資料を確定し、4品質とBV登録を実装する。
