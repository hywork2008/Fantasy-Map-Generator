# BVセイヨウナシ4品質の検証記録

実施日：2026-10-30

対象は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のP2／F02。`european_pear`（Pyrus communis）のBV単木・4品質・作者と派生元の登録を確認した。CEの果樹園配置や都市全体の描画性能、経済・季節の変更は今回の範囲外。

## 樹形と計測値

[RHSの種資料](https://www.rhs.org.uk/plants/14227/pyrus-communis-f/details) の葉・果実と、[栽培資料](https://www.rhs.org.uk/fruit/pears/grow-your-own) を参考に、上向きの主枝と縦長の冠を持つ独立した栽培成木を作製した。約8.8 mの高さは描画用の例示寸法。特定品種・矮性台木・野生型の棘・壁面仕立ては再現していない。

中央の幹に12本の主枝を配し、上部ほど張り出しを減らした。葉は折れた楕円形と細かい葉縁、控えめなPhongの光沢を持つ。黄緑〜黄の果実は丸い下部と細長い首を作り、短い果枝から軸で吊るす。花と季節変化は省略した静的な展示モデルで、72果の実を収穫量へ換算しない。

| 品質 | 三角形数 | source属性・index bytes | mesh数 | 材質数 | 地表からの上端 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| low | 392 | 42,336 | 2 | 2 | 8.616 |
| medium | 2,443 | 192,564 | 3 | 3 | 8.838 |
| high | 18,420 | 1,470,960 | 3 | 3 | 8.678 |
| ultra | 75,444 | 6,932,304 | 3 | 3 | 8.716 |

lowは高さ帯と水平区画ごとの房で先細りの輪郭を作る。mediumは詳細段階と同じ葉のサンプルを房へ当てはめ、果実を36個に減らす。highはultraと同じ枝骨格・果実位置のまま葉のサンプルを4分の1にし、葉面積を補い、果実の分割数も減らす。全品質が制作目安内に収まる。

source bytesはCPU側の属性とindex配列を数えた値であり、GPUメモリ量ではない。地下の根の下端はY=-0.35 m、地表基準はY=0。BVの外接枠6.3×6×9 mが全品質を覆い、lowとhighの水平幅比は0.85〜1.15の検査範囲内。LODは `pixels`・`bounded`。

登録先は `src/buildings/landscape/europeanPear.ts`、`trees.ts`、`treeVariants.ts`、`src/buildings/medieval/43-landscape-treesModels.ts`。版familyは `tree.european-pear`、作者は全品質 `Codex GPT-6.1 Sol`。各品質1版を暗黙採用し、下位品質の派生元を同種ultraにした。自然林の `biomes` は付けず、CEの樹種選択と生産を変えていない。

## 外観とGPU確認

`scripts/verifyBvPearTreeLod.mts` の固定1200×700 viewport、同尺度・照明で4品質の正面・斜め・上面寄りを描画し、果実・葉の近景と、highのセイヨウナシ・リンゴ・オリーブの同尺度比較を確認した。実BVは1200×800でTreesの `European pear · Pyrus communis` を選び、4品質を切り替えた。

- リンゴの開いて横に広がる冠より、背が高く狭い、上向きの枝と中央幹を確認できた。highの幅は約5.58×5.16 m、地表からの高さ約8.68 mで、リンゴhighの約7.26×6.91 m・高さ約6.04 mと区別できる。
- 近景では、首が細く下部が丸い黄緑色の果実、短い果枝と軸、楕円葉の形を確認した。果実は葉群へ無関係に散布していない。
- low／mediumは個葉より連続した面になる。主要寸法と縦長の輪郭を保つが、被覆の見え方は詳細段階と完全には一致しない。遠景のlowは果実を省略する。
- 実BVの4品質、作者・派生元、`CE adoption: Adopted`、正面・上面SVGを確認した。前回のリンゴで修正した葉の面向きの扱いを引き継ぎ、high／ultraの上面図にも葉が出る。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回で常駐geometryは11→11→11、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

詳細な数値は [計測JSON](bv-pear-tree-lod-20261030.json)。単木の確認であり、CE森林のインスタンス描画・都市全体FPSの測定結果ではない。

## テストと再現手順

関連7ファイル・112件が成功した。新しい樹種の採用・4品質の段階的な描画量・幹骨格の一致・接地・外接枠・有限の属性・資源解放に加え、リンゴと比べた縦長の形、果実の詳細段階での位置保持と縮約、上面投影を検証した。作者と派生元の扱いを果樹共通へ広げたため、既存リンゴの4件も含めて確認した。

```sh
npx vitest run src/buildings/landscape/europeanPear.test.ts src/buildings/landscape/domesticApple.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/building-viewer/wikipedia.test.ts src/city3d/adoption.test.ts src/city-editor/generators/landscapeVegetation.test.ts
node --import tsx scripts/verifyBvPearTreeLod.mts
```

検証スクリプトはlocalhost:5227で一時Viteサーバーとheadless Chromiumを起動し、計測JSONを更新する。9枚の確認画像はOSの一時ディレクトリ `fmg-bv-pear-lod` へ出力し、目視後に削除した。画像の永続保存・Git収録は必須にしていない。

変更したソース7ファイルのBiome、`git diff --check` は成功。`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テストや多数シード検証は実行していない。

F02を完了。登録済みは26樹種・104品質枠。P2はF03セイヨウスモモが残るため未完了とし、次に対象樹形・寸法・資料を確定して4品質とBV登録を実装する。
