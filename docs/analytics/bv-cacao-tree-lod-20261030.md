# BVカカオ4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP5／F07。`cacao`（Theobroma cacao）のBV単木・4品質・作者と派生元の登録を確認した。CE果樹園の配置や経済・季節、都市全体性能は今回の範囲外。

## 樹形・葉・幹生果

[NParks](https://www.nparks.gov.sg/florafaunaweb/flora/5/2/5241) の大きな全縁の単葉、若葉の赤み、幹や枝に付く果実と縦方向の稜、[World Agroforestry](https://apps.worldagroforestry.org/treedb2/speciesprofile.php/Spid=618?Spid=1641) の短い主幹と5本の横枝の分岐を参考にした。計画のKewページは今回403となったため、取得できた上記資料を使用した。栽培木の姿の例であり、特定品種・地域や時代共通の剪定形・実測樹木の再現ではない。

地表から約1.7 mの短い幹から5本の主枝を広げる低いjorquetteを作り、上側に大きな先の尖った全縁葉を持つ冠を置いた。地表から約4.0〜4.2 m、水平幅約5.7 mは描画用の例示寸法。葉は折れ目を持つ長い楕円形で、少数の銅赤色の若葉を混ぜた。各小枝の葉序・葉脈・葉柄を完全に再現するものではなく、葉群をサンプルした展示表現。

6個の果実を主幹、10個を5本の古い主枝の下面へ短い果軸で付け、枝先の葉群へは配置しない。果実は長さ約24〜31 cmの長卵形で、10本の縦筋と5方向の強弱を形状・頂点色で抽象化した。黄〜黄橙色の例を使い、特定の品種・熟度を断定しない。16個は展示用で、収量へ換算しない。花・内部の種子・成熟や収穫の季節変化は省略した静的モデル。

## 計測値

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 264 | 28,512 | 2 | 2 | 4.027 |
| medium | 1,482 | 126,936 | 3 | 3 | 4.130 |
| high | 16,388 | 1,474,992 | 3 | 3 | 4.215 |
| ultra | 65,828 | 5,980,272 | 3 | 3 | 4.139 |

high／ultraは木部・果軸・果実の基準位置を共有する。highは葉のサンプルを3分の1にして面積を補い、葉の輪郭・果実の分割数を縮約。mediumは同じ葉群へ当てはめた房と8果、lowは冠を空間分割して当てはめた輪郭とし、果実・果軸を省略する。果実は個別draw callを作らず1 meshへ統合した。

全品質が制作目安内。source bytesはCPU側の属性とindex配列の量で、GPUメモリ量ではない。highは3 MiB未満、ultraは13 MiB未満。地下の根の下端はY=-0.35 m、地表基準はY=0。BV外接枠7×7×4.8 mが全品質を覆い、lowとhighの水平幅比は既存の0.85〜1.15の検査範囲内。LODは `pixels`・`bounded`、基準高は4.5 m。

登録先は `src/buildings/landscape/cacao.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。版familyは `tree.cacao`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版の暗黙採用とし、下位品質は同種ultraを派生元にした。自然林の `biomes` は付けていない。Wikipedia参照は `Theobroma cacao`。ガイドの商品のCocoaとBV名のCacaoを区別する。

## 外観・実BV・GPU

`scripts/verifyBvCacaoTreeLod.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画し、果実と葉の近景、highのカカオ・レモン・イチジクの同尺度比較を確認した。実BVは1200×800でTreesの `Cacao · Theobroma cacao` を選び、4品質を切り替えた。

- 短い主幹と5本の分岐、大きな全縁葉、幹や太枝に付く黄〜黄橙色の果実を確認した。highの水平幅は約5.77×5.69 m、地表からの高さは約4.22 m。
- 近景で果実の縦筋と短い果軸への接続を確認。果実が葉群の枝先だけに付く汎用果樹とは異なる配置になっている。
- レモンの小型の丸い冠・葉・枝先付近の小さな果実、イチジクの低い太枝・裂片葉との違いを同尺度で確認した。
- low／mediumは連続した房、high／ultraは隙間を持つ個葉になる。highは葉面積を補正するため、ultraと葉の寸法・被覆が完全に一致するものではない。銅赤色の若葉は個葉を持つ詳細品質で表す。
- 実BVの4品質・作者・派生元・`CE adoption: Adopted` と正面／上面SVGを確認した。high／ultraの上面投影にも葉が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回でgeometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

詳細値は [計測JSON](bv-cacao-tree-lod-20261030.json)。単木の表示と資源解放の確認であり、CE森林予算・都市全体FPSの測定ではない。

## テストと再現

関連12ファイル・147件が成功した。

品質・作者・採用の登録、段階的な描画量、high／ultraの木部一致、接地・外接枠・有限の属性・資源解放、幹や主枝の範囲にある果実の保持と縮約、上面投影を検証した。共通の果樹版登録に追加したため、既存の6果樹の各4件も含めて確認した。

```sh
npx vitest run src/buildings/landscape/cacao.test.ts src/buildings/landscape/sweetChestnut.test.ts src/buildings/landscape/lemon.test.ts src/buildings/landscape/commonFig.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/europeanPlum.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
node --import tsx scripts/verifyBvCacaoTreeLod.mts
```

検証スクリプトはlocalhost:5234で一時Viteサーバーとheadless Chromiumを起動してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-cacao-lod` へ出力し、目視後に削除した。画像はGitに収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストや多数シード検証は実行していない。

F07を完了。BVは31樹種・124品質枠、新規8樹種中7種・32品質枠中28枠を完了。次はP5のF08アラビカコーヒーへ進む。P5はF08が残るため未完了。
