# BVイチジク4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP3／F04。`common_fig`（Ficus carica）のBV単木・4品質・作者と派生元の登録を確認した。CEの果樹園配置や経済・季節、都市全体性能は今回の範囲外。

## 樹形・葉・果実

[Oregon State University](https://landscapeplants.oregonstate.edu/plants/ficus-carica) を太枝・広い冠・裂葉・果実形、[University of Maryland](https://extension.umd.edu/resource/growing-figs-maryland) を若い枝の葉腋付近の実と栽培形、[RHS](https://www.rhs.org.uk/fruit/figs/grow-your-own) を栽培上の参考にした。

滑らかな灰色の幹が低く5本の太枝へ分かれ、横に広がる栽培成木。高さ約4.9 m・幅約8〜9 mは描画用の例示寸法であり、特定品種・壁面仕立て・歴史的樹形の測量値ではない。既存のインドボダイジュ `sacred_bodhi_and_fig`（Ficus religiosa）と別の生成器を作り、気根と心形葉を使わない。

3裂・5裂の葉を凹多角形として三角形化した。中心から扇状に面を張って裂片間を埋める形を避け、浅く折れた葉面を作る。若い枝の節に葉柄と葉を付け、付け根付近の実と短い軸を同じ節に接続した。緑と紫の実に短い首と小さい先端の「目」を抽象化する。90果は展示用で、生産量や収穫回数に換算しない。

## 計測値

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 272 | 29,376 | 2 | 2 | 4.632 |
| medium | 2,152 | 143,316 | 3 | 3 | 4.796 |
| high | 24,760 | 2,261,520 | 3 | 3 | 4.913 |
| ultra | 86,500 | 8,000,640 | 3 | 3 | 4.760 |

high／ultraは木部・枝の節・葉柄・実の位置を共有する。highは房内の葉を約5分の1へ減らして葉面積を補い、葉腋付近に付けた葉は両段階で残した。mediumは同じ葉群から当てはめた房と45果、lowは広い樹冠を空間分割した輪郭とし、実を省略する。葉を拡大するhighの外接幅と上端はultraより少し大きく、寸法の完全一致ではない。

全品質が制作目安内。source bytesはCPU側の属性・index配列で、GPUメモリ量ではない。地下の根の下端はY=-0.35 m、地表基準はY=0。外接枠9.5×9.3×5 mが全品質を覆い、lowとhighの水平幅比は既存の0.85〜1.15の検査範囲内。LODは `pixels`・`bounded`。

登録先は `src/buildings/landscape/commonFig.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。版familyは `tree.common-fig`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版の暗黙採用とし、下位品質は同種ultraを派生元にした。自然林の `biomes` は付けていない。

## 外観・実BV・GPU

`scripts/verifyBvFigTreeLod.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画し、葉・実の近景と、highのイチジク・リンゴ・インドボダイジュを同尺度で比較した。実BVは1200×800でTreesの `Common fig · Ficus carica` を選び、4品質を切り替えた。

- リンゴより低く広い冠と太枝、インドボダイジュより低い分岐と気根のない幹を確認した。highの幅は約8.47×8.50 m、地表からの高さは約4.91 m。
- 葉の近景で3裂・5裂の輪郭と裂片の間の隙間を確認した。実は葉柄の付け根付近に付け、葉群へ無関係に散布していない。既存ボダイジュの心形葉と区別できる。
- low／mediumは個葉より連続した房になる。主要寸法と低く広がる輪郭を残すが、葉の被覆は詳細段階と完全には一致しない。lowは実を省略する。
- 実BVの作者・派生元・`CE adoption: Adopted` と4品質の正面／上面SVGを確認した。high／ultraの上面投影にも葉が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回でgeometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

数値は [計測JSON](bv-fig-tree-lod-20261030.json)。単木の表示と資源解放の確認であり、CE森林予算・都市全体FPSの測定ではない。

## テストと再現

関連9ファイル・126件が成功した。品質・作者・採用の登録、段階的な描画量、high／ultraの木部一致、接地・外接枠・有限の属性・資源解放、リンゴより低く広い樹形、果実位置の保持と縮約、上面投影を検証した。共通の果樹版登録に追加したため、既存リンゴ・セイヨウナシ・セイヨウスモモの各4件も確認した。

```sh
npx vitest run src/buildings/landscape/commonFig.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/europeanPlum.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
node --import tsx scripts/verifyBvFigTreeLod.mts
```

検証スクリプトはlocalhost:5229で一時Viteサーバーとheadless Chromiumを起動してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-fig-lod` へ出力し、目視後に削除した。画像はGitに収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストや多数シード検証は実行していない。

F04を完了。BVは28樹種・112品質枠。P3はF05レモン・E01オリーブの再利用評価が残り、次にレモンの樹形・寸法・資料を確定して4品質とBV登録を実装する。
