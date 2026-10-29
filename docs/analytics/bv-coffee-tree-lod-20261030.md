# BVアラビカコーヒー4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP5／F08。`arabica_coffee`（Coffea arabica）のBV単木・4品質・作者と派生元を登録した。Coffeeという商品の代表種としてアラビカを選び、ロブスタ等の全種を対応済みにはしない。CE園地・経済・作物暦や収量は今回の範囲外。

## 樹形・対生葉・節の果実群

[NParks](https://www.nparks.gov.sg/florafaunaweb/flora/4/8/4860) の小型に管理する栽培樹形、光沢のある楕円葉と赤い楕円果、[JCU](https://www.jcu.edu.au/discover-nature-at-jcu/plants/nq-weeds-by-scientific-name2/coffea-arabica) の広がる枝・対生葉・葉腋の花と果実を確認した。計画のKew POWOページは今回403となったため、取得できた上記資料を形態の照合に使った。樹高2.4 m・幅約1.9 mは描画用の栽培低木の例示寸法であり、実測木・特定品種・全時代共通の剪定形の再現ではない。

直立する幹へ7段の対生の主枝を置き、上の段ほど枝を短くした。主枝と短い二次側枝の節ごとに、短い葉柄と2枚の対生葉を生成する。葉は全縁に近い、やや波打つ楕円形と折れ目を持つ。個葉をランダムな雲として散布せず、節を起点にした対として作った。high／ultraの対の水平な向きと基部の近さを描画頂点から検証する。

14本の主枝の各5節、計70か所に6果ずつ、420果の展示用の赤い果実群を付けた。楕円の小果実は短い果柄で同じ節へ接続する。約15〜18 mm幅の例とし、果数・色を生産量・成熟過程へ換算しない。花・内部の種子・季節の変化は省略した静的モデル。

## 計測値

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 283 | 30,564 | 2 | 2 | 2.400 |
| medium | 2,318 | 231,024 | 3 | 3 | 2.412 |
| high | 23,364 | 1,918,512 | 3 | 3 | 2.400 |
| ultra | 66,132 | 4,022,496 | 3 | 3 | 2.400 |

high／ultraは木部・葉柄・果柄と果実位置を共有する。highは葉を対の単位で半数にし、面積を補って葉と果実の分割数を縮約する。mediumは枝ごとの葉群へ当てはめた房と、35節に各2果の計70果。lowは冠を空間分割して当てはめた輪郭とし、果実・果柄を省略する。果実は1 meshへ統合した。

全品質が制作目安内。highは3 MiB未満、ultraは13 MiB未満。source bytesはCPU側の属性とindex配列の量で、GPUメモリ量ではない。地表はY=0、地下の根の下端Y=-0.35 mを共通基準とする。BV外接枠2.8×2.8×2.5 mが全品質を覆う。low／highの水平幅比は0.85〜1.15の既存検査範囲内。LODは `pixels`・`bounded`、基準高2.4 m。

版familyは `tree.arabica-coffee`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版の暗黙採用とし、下位品質は同種ultraを派生元にした。Wikipedia参照は `Coffea arabica`。`biomes` を付けず、自然林へ追加していない。

## 目視とGPU

`scripts/verifyBvCoffeeTreeLod.mts` の1200×700 viewport・同尺度・照明で正面・斜め・上面寄りの4品質、果実と対生葉の近景、highのアラビカコーヒー・カカオ・レモンの同尺度比較を確認した。実BVは1200×800でTreesの `Arabica coffee · Coffea arabica` を選び、4品質を切り替えた。

- 初回は葉が水平に揃いすぎていたため、対生を保ったまま葉の下垂と短い側枝の上下差を加えた。highの幅は約1.89×1.79 m、地表からの高さは2.4 m。
- 近景で短い葉柄から出る対生葉、節の近傍にまとまる赤い楕円果と果柄を確認した。カカオの幹生果やレモンの丸い冠と異なる構成になっている。
- 段状の横枝が見える管理低木の例。lowは段の隙間を連続した房へまとめ、mediumは枝ごとの薄い房になる。個葉の形・隙間・対生は近景の詳細品質で確認する。全品質で同じ被覆や季節・樹齢を再現するものではない。
- 実BVの4品質・作者・派生元・`CE adoption: Adopted`、正面／上面SVGを確認した。high／ultraの上面にも葉が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回でgeometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

詳細値は [JSON](bv-coffee-tree-lod-20261030.json)。単木の表示・解放の確認であり、大量のコーヒー園や都市全体FPSの検証ではない。

## テストと再現

初回は関連13ファイルで155件成功・1件失敗。新規テストの果実群の水平幅を1.3 m超とした設定が、実際の節位置による約1.273 mに対して厳しすぎた。幹だけへの集中を検出する目的に合わせ、1 m超を検査するよう修正した。葉と側枝の姿の調整後は、影響するF08の6件と共通品質の3件を再実行し、9件すべて成功。他77件はフィルターで除外した。影響のない147件と合わせ、関連156件の成立を確認した。全体の再実行はしていない。

4品質・作者・採用、段階的な描画量、接地・外接寸法・有限値・資源解放、high／ultra木部一致、複数段と横幅に分布する果実・品質縮約、対生葉の保持、上面投影を検証した。共通の果樹版登録に追加したため、既存7果樹の各4件も初回に含めた。

```sh
npx vitest run src/buildings/landscape/arabicaCoffee.test.ts src/buildings/landscape/cacao.test.ts src/buildings/landscape/sweetChestnut.test.ts src/buildings/landscape/lemon.test.ts src/buildings/landscape/commonFig.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/europeanPlum.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
npx vitest run src/buildings/landscape/arabicaCoffee.test.ts src/buildings/landscape/treeQuality.test.ts -t coffee
node --import tsx scripts/verifyBvCoffeeTreeLod.mts
```

検証スクリプトはlocalhost:5235で一時Viteサーバーとheadless Chromiumを起動してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-coffee-lod` へ出力し、目視後に削除した。Gitには収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テスト・多数シード検証は実行していない。

F08とP5を完了。新規8樹種32品質枠、BV全体32樹種128品質枠となった。続くP6の採用版・寸法・残課題の総括は [最終台帳](bv-fruit-tree-catalog-20261030.md) に記録した。
