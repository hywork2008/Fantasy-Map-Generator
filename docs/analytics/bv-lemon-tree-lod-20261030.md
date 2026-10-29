# BVレモン4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP3／F05。`lemon`（Citrus × limon）のBV単木・4品質・作者と派生元の登録を確認した。CE果樹園の配置や経済・季節、都市全体性能は今回の範囲外。

## 樹形・葉・果実

[NC State](https://plants.ces.ncsu.edu/plants/citrus-x-limon/) を小型常緑樹と棘、[RHS](https://www.rhs.org.uk/fruit/citrus/grow-your-own) を光沢のある葉と栽培形、[UC RiversideのFemminello資料](https://citrusvariety.ucr.edu/crc3500) を楕円果・先端の突起・黄色い果皮の凹凸の参考にした。複数品種や異名を含む資料の写真をそのまま同一視せず、特定品種の正確な再現とはしていない。

短い幹から4本の主枝を立ち上げ、内側の枝葉を加えて丸みのある密な冠を作った。地表から約3.8 m・幅約3.7〜4 mは描画用の例示寸法であり、測量値・矮性台木・鉢植え・歴史的樹形の再現ではない。葉は折れた楕円形と細かな葉縁、控えめなPhongの光沢を持つ。4本の短い枝の棘を付けた。

果実は明るい黄色の楕円形で、軸側のくびれと先端側の突起を作り、果皮の細かい凹凸を形状と頂点色へ簡略化した。短い果枝と軸へ接続する。28果は展示用で、生産量や収穫回数へ換算しない。花や季節変化は省略した静的モデル。

## 計測値

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 259 | 27,972 | 2 | 2 | 3.498 |
| medium | 1,095 | 90,540 | 3 | 3 | 3.786 |
| high | 14,812 | 1,434,720 | 3 | 3 | 3.616 |
| ultra | 83,132 | 8,505,504 | 3 | 3 | 3.620 |

high／ultraは木部・棘・果実位置を共有する。highは房内の葉のサンプルを4分の1にして葉面積を補い、果実の分割数を減らす。mediumは同じ葉群から当てはめた房と14果、lowは冠の空間分割による輪郭とし、果実を省略する。4品質の主要寸法を保つが、房の被覆は個葉と完全には一致しない。

全品質が制作目安内。source bytesはCPU側の属性とindex配列の量で、GPUメモリ量ではない。地下の根の下端はY=-0.35 m、地表基準はY=0。BVの外接枠4.1×4.1×3.9 mが全品質を覆い、lowとhighの水平幅比は既存の0.85〜1.15の検査範囲内。LODは `pixels`・`bounded`。

登録先は `src/buildings/landscape/lemon.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。版familyは `tree.lemon`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版の暗黙採用とし、下位品質は同種ultraを派生元にした。自然林の `biomes` は付けていない。

## 外観・実BV・GPU

`scripts/verifyBvLemonTreeLod.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画し、葉と果実の近景、highのレモン・イチジク・オリーブの同尺度比較を確認した。実BVは1200×800でTreesの `Lemon · Citrus × limon` を選び、4品質を切り替えた。

- イチジクより小型で内側にも葉がある冠、オリーブの細い銀葉と異なる緑の楕円葉を確認した。highの幅は約3.90×3.90 m、地表からの高さは約3.62 m。
- 近景で果実の黄色い楕円形と先端の突起、軸、葉の形を確認した。果実は葉群へ無関係に散布せず、枝へ接続している。
- low／mediumは個葉より連続した房になる。近景でhigh／ultraと同じ被覆を保証するものではない。lowでは果実を省略する。
- 実BVの4品質・作者・派生元・`CE adoption: Adopted` と、正面／上面SVGを確認した。high／ultraの上面投影にも葉が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回でgeometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

詳細値は [計測JSON](bv-lemon-tree-lod-20261030.json)。単木の表示と資源解放の確認であり、CE森林予算・都市全体FPSの測定ではない。比較で使用したオリーブhighだけではE01の既存4品質評価を完了扱いにしない。

## テストと再現

関連10ファイル・133件が成功した。品質・作者・採用の登録、段階的な描画量、high／ultraの木部一致、接地・外接枠・有限の属性・資源解放、イチジクより小型の寸法、果実位置の保持と縮約、上面投影を検証した。共通の果樹版登録に追加したため、既存の4果樹の各4件も含めて確認した。

```sh
npx vitest run src/buildings/landscape/lemon.test.ts src/buildings/landscape/commonFig.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/europeanPlum.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
node --import tsx scripts/verifyBvLemonTreeLod.mts
```

検証スクリプトはlocalhost:5230で一時Viteサーバーとheadless Chromiumを起動してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-lemon-lod` へ出力し、目視後に削除した。画像はGitに収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストや多数シード検証は実行していない。

F05を完了。BVは29樹種・116品質枠。P3はE01オリーブの既存4品質の果樹用途での再利用評価が残り、次にこの評価を実施する。
