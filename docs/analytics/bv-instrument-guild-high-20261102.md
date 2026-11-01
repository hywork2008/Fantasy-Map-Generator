# Medieval 39 — Instrument makers' guild hall High (2026-11-02)

`instrument-makers-guild-hall`にCodex GPT-6.1 Solの明示的なHighを登録した。既存Lowの形状署名とCEのdefault IDを維持する。

## 構成

Highは共通の`architecture`・`exterior-stair`、楽器用途の`trade-dressing`、独立した`harp-display`の4部品。会館本体・東側階段・`GUILD_HALL_PROFILE`を変更せず、木工会館と同じ形状署名を確認した。既存の作業台factoryも再利用する。

リュートは共通factoryで洋梨形の胴、胴の継ぎ目、実際に開口した響孔、指板・フレット・駒・上駒・弦・折れた糸倉・糸巻きを作る。検品台の3挺と壁の紋章に同じfactoryを使い、紋章だけ大きさと向きを変える。検品用リュートは革の支持パッドに接触させる。もう一方の台には響板材・棹材・定規・小型鉋を置く。

ハープは床に接する脚、支柱、ネック、斜めの共鳴箱と弦受け、14本の弦、弦留めと調弦ピンから成る。弦の両端は取付部品に接触する。高さは床下に収まり、共通会館に設備専用の切り欠きは追加しない。BVで単体表示できるが、自由な楽器交換UIは今回追加しない。

## 計測

| 品質 | 三角形 | メッシュ | CPU属性バッファ bytes |
| --- | ---: | ---: | ---: |
| Low | 9,606 | 133 | 275,200 |
| High | 39,876 | 13 | 2,871,072 |

| High部品 | 三角形 |
| --- | ---: |
| 共通本体 | 29,064 |
| 共通東側階段 | 528 |
| 楽器用途部品 | 9,304 |
| ハープ | 980 |

Highの幅×奥行×高さは約17.09×8.77×9.06 m。材質結合で描画メッシュを削減する一方、非index化で属性配列は増える。CPU値は重複しない属性・index ArrayBufferの合計で、JSオブジェクト・一時領域・GPUメモリ・FPSを含まない。

再計測は`node --import tsx scripts/profileInstrumentGuildHigh.mts`。[計測JSON](bv-instrument-guild-high-20261102.json)に形状署名・寸法・部品別計測・台帳を保存する。非樹木監査は220記録中Highあり100、未対応120。配置・状態違いも含む記録数であり、固有資産数ではない。

## 検証

- `instrumentGuildDetails.test.ts`：6件成功。Low署名・CE既定、共通本体と階段、寸法・資源所有・入口通路・部品範囲、響孔の開口、弦と駒／上駒の接触、検品台の支持、ハープ弦と取付部品の接触を検証。
- 最初の実行では、ガラス会館から流用したテストに残っていた3部品・12メッシュ上限の想定が失敗した。今回の4部品・13材質に合わせて訂正し、該当2件のみ再実行して成功。
- `printingHigh.test.ts`：6件、`src/city3d/adoption.test.ts`：3件成功。
- `guildHallAndStoneYardDetails.test.ts -t 'guild|shares'`：8件成功、対象外2件スキップ。合計23件成功。
- `npx tsc --noEmit --pretty false`、変更した生成コード・テストのBiome check、`git diff --check`が成功。
- 実BVでHigh全体、4部品の単体、Lowへの切替、High全体への復帰と固定計測値の一致を確認。ページエラー0件。全体・楽器検品台と紋章の近景を目視確認。画像は一時領域のみを使用し、完成画像PNGは保存・参照しない。

次はMedieval 40 Sand storage and loading yardを、既存の運搬具・容器・上屋を確認して部品化・High化する。
