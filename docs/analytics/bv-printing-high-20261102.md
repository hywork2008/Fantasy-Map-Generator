# Medieval 38 — Printing High (2026-11-02)

`early-printing-workshop`と`printers-guild-hall`にCodex GPT-6.1 Solの明示的なLow／Highを登録した。既存Lowの形状とCEのdefault IDは維持する。

## 共通化と部品

- 工房は`shelter`、`printing-press`、`composing-station`、`paper-storage`、`drying-rack`の5部品。上屋は既存`addCraftShed`、作業台は`addCraftBench`を使う。
- 会館は共通の`architecture`、`exterior-stair`、印刷用途の`trade-dressing`、`printing-press`の4部品。`GUILD_HALL_PROFILE`・本体・東側階段は変更しない。木工会館と本体・階段の形状署名が一致する。
- 両施設の印刷機は同じ独立factory。配置を除いた形状署名が一致し、片方のために別実装を増やさない。木ねじ・螺旋・横木・加圧板・滑走台・組版・刷り見本・起こしたティンパンを含む。螺旋は112分割・断面4辺に制限する。
- 工房には区画付き活字ケース、用紙の折丁、足付き乾燥架、紙と縄を挟むクリップを追加。会館には開いた本の紋章と用紙検品台を置く。
- 印刷機は高さ2.95 mで、共通上屋の梁下2.985 mと会館の床下に収まる。母体に設備専用の穴は開けず、支持部との意図的な重ね合わせを使う。
- BVは組立全体と独立部品を選べる。任意の部品交換や新しい組立プリセットのUIは今回追加していない。

## 計測

| モデル | 品質 | 三角形 | メッシュ | CPU属性バッファ bytes |
| --- | --- | ---: | ---: | ---: |
| Early printing workshop | Low | 5,356 | 51 | 124,360 |
| Early printing workshop | High | 16,332 | 9 | 1,175,904 |
| Printers' guild hall | Low | 12,890 | 121 | 322,224 |
| Printers' guild hall | High | 33,400 | 11 | 2,404,800 |

Highの寸法（幅×奥行×高さ）は工房8.73×5.72×4.53 m、会館17.09×8.77×9.06 m。共通印刷機は3,092三角形。材質結合は描画メッシュを削減するが三角形は減らさず、非index化で属性配列は増える。CPU値は重複しないArrayBufferの合計で、JSオブジェクト・一時領域・GPUメモリ・FPSを含まない。

再計測は`node --import tsx scripts/profilePrintingHigh.mts`。[計測JSON](bv-printing-high-20261102.json)に形状署名・部品別値・台帳を保存する。監査は220記録中Highあり99、未対応121。配置・状態違いを含む記録数であり、固有資産数ではない。

## 検証と次の対象

- `printingHigh.test.ts`：6件成功。Low署名・CE既定ID、共通本体・階段・印刷機、ねじ／加圧板の接続、台・用紙の支持、梁下高さ、乾燥架の接触、寸法・有限座標・部品台帳・独立資源を検証。
- `glassGuildDetails.test.ts`：5件成功。既存のガラス会館が共通化変更の影響を受けないことを確認。
- `guildHallAndStoneYardDetails.test.ts -t 'guild|shares'`：8件成功、対象外2件スキップ。
- `src/city3d/adoption.test.ts`：3件成功。合計22件成功。
- `npx tsc --noEmit --pretty false`成功。変更した生成コード・テストのBiome check成功。
- 実BVで2モデルのHigh全体、9部品の単体、Lowへの切替、High全体復帰を確認。表示値が固定計測と一致し、ページエラー0件。工房全体・共通印刷機の近景・会館全体を目視確認した。画像は一時領域のみとし、リポジトリに追加しない。

既存BV制作記録の完成画像PNG参照を削除し、監査の再生成でも出力しない方針を追加した。次はMedieval 39 Instrument makers' guild hallを、同じ会館本体・東側階段へ楽器用途部品を加えてHigh化する。
