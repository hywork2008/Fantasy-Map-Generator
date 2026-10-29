# BVセイヨウスモモ4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP2／F03。`european_plum`（Prunus domestica）のBV単木・4品質・作者と派生元の登録を確認した。CE果樹園の自動配置や経済・季節、都市全体の描画性能は今回の範囲外。

## 樹形と計測値

[NC Stateの種資料](https://plants.ces.ncsu.edu/plants/prunus-domestica/) を葉・樹皮・果実、[Utah State University](https://extension.usu.edu/yardandgarden/research/plums-in-the-home-garden) を上向きの樹形とニホンスモモとの違い、[RHS](https://www.rhs.org.uk/fruit/plums/grow-your-own) を栽培形の参考にした。短い暗褐色の幹から5本の主枝が上向きに分かれる約6 mの独立した栽培成木を選んだ。寸法は描画用の例示で、特定品種・矮性台木・歴史的樹形の測量値ではない。

葉はくさび形の基部から先の側へ広がる鋸歯のある楕円形。紫の卵形果実に浅い縫合線を付け、粉の色を頂点色で抽象化した。80果の実は短い果枝と軸に取り付け、葉群へ無関係に散布していない。紫は色の表現例であり、全品種共通の色ではない。ニホンスモモ・紫葉の観賞品種・花・季節変化は再現していない。

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 291 | 31,428 | 2 | 2 | 5.681 |
| medium | 2,144 | 152,352 | 3 | 3 | 5.939 |
| high | 20,452 | 1,737,456 | 3 | 3 | 5.855 |
| ultra | 72,932 | 6,684,336 | 3 | 3 | 5.920 |

high／ultraは主要木部・果枝と果実位置を共有し、highでは葉のサンプルを3分の1にして葉面積を補い、果実の分割数を減らす。mediumは同じ葉群から当てはめた房と40果、lowは上下・水平区画に分けた輪郭とし、果実を省略した。全品質が初期制作目安内。

source bytesはCPU側の属性とindex配列を数えた値で、GPUメモリ量ではない。地下の根の下端はY=-0.35 m、地表基準はY=0。外接枠6×6×6.2 mが全品質を覆い、lowとhighの水平幅比は既存の0.85〜1.15の検査範囲内。LODは `pixels`・`bounded`。

登録先は `src/buildings/landscape/europeanPlum.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。版familyは `tree.european-plum`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版の暗黙採用とし、下位品質の派生元を同種ultraにした。栽培木のため自然林の `biomes` は付けていない。

## 外観・GPU・実BV

`scripts/verifyBvPlumTreeLod.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画した。果実・葉の近景と、highのスモモ・リンゴ・セイヨウナシの同尺度比較も確認した。実BVは1200×800でTreesの `European plum · Prunus domestica` を選び、4品質を切り替えた。

- リンゴより狭い小型の冠、セイヨウナシより短い幹と全高、上向きの主枝を確認した。highの幅は約5.22×5.10 m、地表からの高さは約5.86 m。
- 近景で紫の小さい卵形果実、短い果枝と軸、葉の鋸歯と短く尖った先端を確認した。実の個数は展示用で、生産量を示すものではない。
- low／mediumは個葉より連続した房になる。中央が開く主枝の配置と主要寸法を残すが、被覆の見え方は詳細段階と完全には一致しない。
- 実BVの4品質、作者・派生元・`CE adoption: Adopted`、正面／上面SVGを確認した。high／ultraの上面投影にも葉が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回で常駐geometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

計測値は [JSON](bv-plum-tree-lod-20261030.json)。これは単木の表示と資源解放の確認であり、CEの森林予算・都市全体FPSの測定結果ではない。

## テストと再現手順

関連8ファイル・119件が成功した。4品質の登録・採用・段階的な描画量・幹骨格の一致・接地・有限の属性・資源解放・外接枠に加え、リンゴより狭くセイヨウナシより低い樹形、詳細段階の果実位置保持と縮約、上面投影を検証した。共通の果樹版登録に追加したため、既存リンゴ・セイヨウナシの各4件も確認した。

```sh
npx vitest run src/buildings/landscape/europeanPlum.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
node --import tsx scripts/verifyBvPlumTreeLod.mts
```

検証スクリプトはlocalhost:5228で一時Viteサーバーとheadless Chromiumを起動してJSONを更新する。9枚の確認画像はOSの一時ディレクトリ `fmg-bv-plum-lod` へ出力し、目視後に削除した。画像はGitに収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストや多数シード検証は実行していない。

F03およびP2を完了。BVは27樹種・108品質枠となり、次はP3／F04イチジクの樹形・寸法・資料を確定して4品質とBV登録を実装する。
