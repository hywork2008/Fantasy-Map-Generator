# T6 果樹園の栽培形

作成日：2026-10-30。設計は [BV樹木の季節の姿と結実層の設計](../plan/bv-tree-seasonal-appearance.md) §7.3・§9・§18、課題は [果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) のO01・D01・D03。

## 樹形と根拠

| キー | 対象 | 樹形 |
| --- | --- | --- |
| `olive_orchard` | 天水の伝統的な地中海オリーブ園。古代から近世の手作業の剪定 | 開心形（vaso）。幹は約0.95 mで1つの分岐。4本の主枝が約45°で外へ傾いてから立ち上がり、各主枝の5本の側枝が外側と横へ広がって、隣の主枝の側枝と輪につながる。中心は光を入れるために開け、結実枝は収穫の高さへ垂れ、裾は放牧と収穫のために上げる。樹高4.1 m・樹冠幅約7.3 m。現代の垣根状密植・高密度園は対象外 |
| `date_palm_orchard` | 灌漑オアシスの伝統的なナツメヤシ園の結実雌木 | 直立した幹。葉の付け根を短く均等に切り揃えた株が螺旋に並ぶ。枯葉と最下段の葉は毎年切るので垂れる枯葉はなく、ひこばえは植え付け用に外す。8つの果房を冠の下へ引き下げる |
| `date_palm_orchard_male` | 同じ園の受粉用の雄木 | 雌木と同じ幹と冠で、果房なし。開花すると、割れた仏炎苞から立つ短い雄花序に、クリーム色の小花が密に付く |
| `date_palm_orchard_young` | 結実前の若木 | 1.4 mの短く太い幹、地面近くから立つ短めの葉（24枚）、根付いて分けるまで残す2本のひこばえ |

参照：University of California ANR の Olive Production Manual（Publication 3353）の仕立てと剪定の章、RHS のオリーブとナツメヤシの解説（モデルの説明文にURLを記載）。寸法は図示用で、実測の個体や品種ではない。

## 登録

- 4キーとも4品質。作者はClaude Opus 5.5。ナツメヤシの3形は、景観用の生成器 `createAridTree` に `DatePalmForm`（`landscape`／`orchard`／`male`／`young`）を加えて作り、`basedOn` は同じ品質の景観用ナツメヤシとした。オリーブ園は `oliveOrchard.ts` の独自の骨格で、葉の描き方だけ景観用に揃えた。
- 季節プロファイル・`FruitSpec`・作物は景観用と共有する。雄木は `Dates` の時期に開花し、それ以外は葉の姿になる。
- LODは新規果樹と同じ `pixels`・`bounded`。BVの生物群系の表示は持たず、CEの自然林・公園・墓地の選択に入らない。

## 三角形数（mesh数）と外接寸法

low / medium / high / ultra。寸法はultraの幅×奥行×高さ。

| キー | 姿 | low | medium | high | ultra | 寸法（m） |
| --- | --- | --- | --- | --- | --- | --- |
| olive_orchard | leaf | 276 (2) | 1,977 (2) | 10,712 (2) | 29,160 (2) | 7.2×7.2×4.1 |
| olive_orchard | unripe・fruit | 276 (2) | 2,585 (3) | 21,800 (3) | 107,280 (3) | 同上 |
| date_palm_orchard | bloom | 320 (2) | 2,056 (3) | 4,400 (3) | 8,656 (3) | 9.2×9.2×11.2 |
| date_palm_orchard | unripe・fruit | 320 (2) | 2,120 (3) | 20,528 (3) | 63,248 (3) | 同上 |
| date_palm_orchard | harvested | 320 (2) | 2,056 (3) | 3,440 (3) | 4,880 (3) | 同上 |
| date_palm_orchard_male | bloom | 320 (2) | 1,976 (3) | 18,800 (3) | 50,240 (3) | 同上 |
| date_palm_orchard_male | leaf | 320 (2) | 1,864 (2) | 3,120 (2) | 4,560 (2) | 同上 |
| date_palm_orchard_young | leaf | 344 (2) | 1,835 (2) | 3,224 (2) | 5,240 (2) | 6.7×6.1×3.1 |

全て制作目安以内で、BVの外接寸法（オリーブ園8×8×4.8、雌木・雄木10×9.6×11.5、若木7.2×6.6×3.4）に収まる。

## 試行と所見（headless Chromium・Metal、正面・斜め・上面と近景、実BV）

- オリーブ園の初版は、主枝ごとに3本の側枝としたため、上から見ると十字形の4つの塊で、主枝の間が大きく空いた。側枝を5本とし、主枝の中ほどからも出して隣の主枝の側枝とつなげ、開いた中心を囲む輪の樹冠にした。景観用の老木と並べると、低く幅の広い管理樹形として区別できる。実の大きさは景観用と同じで、全体表示では見えず、近景で緑の実と紫黒の実が判別できる。
- 雄木の初版に、景観用の三角形のマーカーと4本の軸が残っていた。マーカーは果房を持たない景観用の版だけの部品なので、栽培形では描かないようにした。
- 葉の付け根の切り株は初版で幹の中に隠れていた。幹の中心から0.42 mまで伸ばし、幹から短く突き出るようにした。
- 雄花序は葉の付け根にあり、全体表示ではほとんど見えない。mediumではクリーム色の塊として見える。
- 実BVで4キーの全品質・全姿を切り替え、`CE adoption: Adopted` と表示された。若木は姿が1つなのでSeasonの選択が出ない。pageerrorは0件。

## 既定の姿の不変

T5のコミット（HEAD）を `git worktree` に取り出し、BVの全146版を引数なしで生成して、属性・index・mesh名のハッシュを変更後と比べた。146版すべて一致した。新しい16版が追加された。

## 実行したテスト

- `npx vitest run src/buildings/landscape/ src/city3d/adoption.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/building-viewer/ src/city-editor/generators/landscapeVegetation.test.ts src/city3d/three/forestMeshes.test.ts src/city-editor/renderers/openSpaceSites.test.ts src/city-editor/components/biomeControls.test.ts`：29ファイル364件が成功。4キーの品質の段階と接地、姿の数（全91）、雄木の開花が雌木と同じ月になることを確認する。
- `src/buildings/medieval/modelContracts.test.ts`：T5のコミットの時点で、全樹木の根（地面下0.35 m）を接地の誤りとして失敗している。新しい4キーも同じ理由で失敗し、失敗が4件増えた。テストの期待値は変更していない。
- Biome：成功。型チェック：既存の `src/city-editor/renderers/fogControls.ts:45` のエラーのみ。

確認画像は一時保存とし、目視後に削除した。
