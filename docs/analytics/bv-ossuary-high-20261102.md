# Medieval 44 — Ossuary and shared bone rack High (2026-11-02)

`ossuary-charnel-house`と、内部で共用する`skull-shelf`にCodex GPT-6.1 Solの明示的なLow／Highを追加した。既存の`cemetery.ossuary_charnel_house`・`cemetery.skull_shelf`ファミリーを使い、別のmedievalファミリーは増やさない。両モデルのLow/defaultの形状署名は不変。他19種の墓地備品はdefaultのみのLow扱いを維持する。

## 部品と再利用

納骨堂は`architecture`・`roof`・`door`・`vent-grilles`・`bone-racks`の5部品。既存の教会用石造壁・アーチ開口・開いた扉と金物、共通の瓦屋根を使い、入口や換気窓を暗い面で塞がない。換気格子の棒は丸アーチの内側に収める。床は連続させ、棚のための壁・屋根の穴は追加しない。

納骨棚は`frame`と`remains`の2部品。足・支柱・棚受け・棚板・込栓・背面筋交いを持ち、3段に9頭の模式的頭骨と長骨を置く。眼窩・鼻腔は実際の開口で、奥に半球状の頭蓋部がある。下顎と骨端は棚板に接触する。人体の厳密な解剖学的再現ではなく、建物備品用の様式化した形状である。

納骨堂にはこの同じ棚を2台配置し、`basedOn`に`cemetery.skull_shelf@high#codex-gpt-6.1-sol`を記録する。内部で別の棚を作り直さず、単独Highと同じ共通factoryを使う。建物内部へ配置した時は外側の部品範囲を正しく記録できるよう、生の共通棚を合成し、最後に材質結合する。棚の複数配置を新規High資産として数えない。

BVは独立した7部品を選択できる。任意の棚交換・寸法調整UIは今回追加しない。CEの既存墓地配置は引き続き互換defaultを採用し、Highへ自動置換しない。

## 計測

| モデル | 品質 | 三角形 | メッシュ | CPU属性バッファ bytes |
| --- | --- | ---: | ---: | ---: |
| Ossuary charnel house | Low | 498 | 44 | 1,272 |
| Ossuary charnel house | High | 35,372 | 7 | 2,546,784 |
| Skull shelf | Low | 1,572 | 14 | 43,608 |
| Skull shelf | High | 8,436 | 3 | 607,392 |

| 納骨堂High部品 | 三角形 |
| --- | ---: |
| 石造本体 | 7,572 |
| 共通瓦屋根 | 7,884 |
| 共通扉・金物 | 1,532 |
| 換気格子 | 1,512 |
| 共通納骨棚2台 | 16,872 |

納骨棚の枠は468、収納骨は7,968三角形。Highの幅×奥行×高さは納骨堂約6.73×4.72×5.02 m、棚約2.25×0.73×2.26 m。CPU値は重複しない属性・index ArrayBufferの合計で、JSオブジェクト・一時領域・GPUメモリ・FPSを含まない。材質結合・非index化により、描画メッシュは減る一方で属性配列は増える。

再計測は`node --import tsx scripts/profileOssuaryHigh.mts`。[計測JSON](bv-ossuary-high-20261102.json)に署名・寸法・台帳・部品別値を保存する。監査は220記録中Highあり105、未対応115。今回の2モデルは各1記録として追加し、同じ棚の配置数は加算しない。

## 検証と次の対象

- `ossuaryHigh.test.ts`：6件成功。Low/default署名、既存墓地ファミリーと他19種の登録維持、入口・換気開口、眼窩・鼻腔の開口と奥行、棚への支持、共通棚の同一性、室内への収まり、7部品の範囲と独立生成、寸法・有限座標・資源所有と解放を検証。
- `src/city3d/adoption.test.ts`：3件成功。`src/city3d/three/openSpaceMeshes.test.ts`：7件成功。合計16件成功。
- `npx tsc --noEmit --pretty false`、変更した生成コード・テストのBiome check、`git diff --check`が成功。
- 実BVで両モデルのHigh全体、7部品の単体、Low切替、High全体復帰を確認。固定計測値と一致し、ページエラー0件。納骨堂全体、棚全体と頭骨の近景を目視確認。画像は一時領域だけに置き、リポジトリへの保存・PNG参照は追加しない。CE対話操作とGPU FPSは今回測定していない。

次は同じMedieval 44のPreaching cross calvary。既存の石造十字架・墓標の部品を確認してHigh化する。
