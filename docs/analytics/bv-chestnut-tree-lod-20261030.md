# BVヨーロッパグリ4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP4／F06。`sweet_chestnut`（Castanea sativa）のBV単木・4品質・作者と派生元の登録を確認した。CE果樹園の配置や経済・季節、都市全体性能は今回の範囲外。

## 樹形・葉・いが

[Woodland Trust](https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/sweet-chestnut/) の樹形写真、樹皮、長く先の尖った鋸歯の単葉、細い刺のある緑のいがを参考にした。計画のKewページは取得が403となったため、今回の形態確認はWoodland Trustを使用した。トチノキの掌状複葉、ニホングリ、ナラの裂片葉として制作していない。

太い幹から6本の主枝を広げ、内側の上向きの枝葉で広い冠を作った。地表から約8.7 m・水平幅約9 mは描画用の栽培成木の例示寸法であり、実測値・特定品種・地域や歴史時代共通の剪定形・萌芽林の再現ではない。樹皮は頂点色の帯で溝を抽象化し、個々の溝の立体彫刻は行わない。葉は折れ目と粗く簡略化した鋸歯を持つ長い単葉で、細かな葉脈は省略した。

緑のいがは球殻と細い三角錐の刺で作り、短い軸で枝へ接続する。highは1個32本、ultraは72本の刺を持ち、全てのいがを1 meshへ統合する。36個は展示用で、収量へ換算しない。閉じたいがなので内部の褐色の種子は見せず、花・落葉・裂開・収穫などの季節変化も省略した静的モデル。

## 計測値

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 310 | 33,480 | 2 | 2 | 8.447 |
| medium | 1,984 | 214,272 | 3 | 3 | 8.825 |
| high | 24,812 | 2,679,696 | 3 | 3 | 8.709 |
| ultra | 109,340 | 11,808,720 | 3 | 3 | 8.688 |

high／ultraは木部・果軸・いがの中心位置を共有する。highは葉のサンプルを4分の1にして葉面積を補い、葉縁・球殻・刺の分割数を減らす。mediumは同じ葉群へ当てはめた房と18個の簡略ないが、lowは冠を空間分割して当てはめた輪郭とし、いがを省略する。主要寸法を保つが、遠景の房は連続した面なので個葉と同じ被覆を保証しない。

初回の目視で葉が疎らだったため、1房96→144サンプルとし、葉縁の分割数・房の広がり・葉の幅を調整した。最終値は全品質が制作目安内。highは上限25,000三角形に近いため、今後の追加は再計測する。source bytesはCPU側の属性とindex配列の量で、GPUメモリ量ではない。highは3 MiB未満、ultraは13 MiB未満。

地下の根の下端はY=-0.35 m、地表基準はY=0。BVの外接枠11×11×9 mが全品質を覆い、lowとhighの水平幅比は既存の0.85〜1.15の検査範囲内。LODは `pixels`・`bounded`、基準高は8.8 m。

登録先は `src/buildings/landscape/sweetChestnut.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。版familyは `tree.sweet-chestnut`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版の暗黙採用とし、下位品質は同種ultraを派生元にした。自然林の `biomes` は付けていない。Wikipedia参照は `Castanea sativa`。

## 外観・実BV・GPU

`scripts/verifyBvChestnutTreeLod.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画し、葉といがの近景、highのヨーロッパグリ・ヨーロッパナラ・リンゴの同尺度比較を確認した。実BVは1200×800でTreesの `Sweet chestnut · Castanea sativa` を選び、4品質を切り替えた。

- 太い分岐と広い冠、長い鋸歯の単葉、枝に付いた細い刺のあるいがを確認した。highの水平幅は約9.01×8.45 m、地表からの高さは約8.71 m。
- ナラの大きな樹形と裂片葉、リンゴの低い樹形と丸い果実との差を確認した。近景での形態確認と、樹木全体の同尺度比較を分けて行った。
- low／mediumは連続した房、high／ultraは隙間を持つ個葉になる。highは葉を大きくする補正があり、ultraと密度・葉の寸法が完全に一致するものではない。
- 実BVの4品質・作者・派生元・`CE adoption: Adopted` と、正面／上面SVGを確認した。high／ultraの上面投影にも葉が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回でgeometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

詳細値は [計測JSON](bv-chestnut-tree-lod-20261030.json)。単木の表示と資源解放の確認であり、CE森林予算・都市全体FPSの測定ではない。

## テストと再現

関連11ファイル・140件が成功した。共通の果樹版登録に追加したため、既存の5果樹の各4件も含めて確認した。最終の葉の調整後は影響のあるヨーロッパグリの7件を再実行して成功（他71件はフィルターでスキップ）。全体の再実行はしていない。

品質・作者・採用の登録、段階的な描画量、high／ultraの木部一致、接地・外接枠・有限の属性・資源解放、いがの位置の保持と縮約、上面投影を検証した。

```sh
npx vitest run src/buildings/landscape/sweetChestnut.test.ts src/buildings/landscape/lemon.test.ts src/buildings/landscape/commonFig.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/europeanPlum.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
npx vitest run src/buildings/landscape/sweetChestnut.test.ts src/buildings/landscape/treeQuality.test.ts -t chestnut
node --import tsx scripts/verifyBvChestnutTreeLod.mts
```

検証スクリプトはlocalhost:5232で一時Viteサーバーとheadless Chromiumを起動してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-chestnut-lod` へ出力し、目視後に削除した。画像はGitに収録しない。

変更したソース7ファイルのBiomeと `git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストや多数シード検証は実行していない。

F06を完了。BVは30樹種・120品質枠。主対象6種24品質枠の追加を完了し、次はP4のE02ナツメヤシの既存4品質の再利用評価へ進む。P4はE02が残るため未完了。
