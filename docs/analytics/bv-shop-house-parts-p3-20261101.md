# BV複合モデル P3：Shop Houses

2026-11-01。[設計書](../plan/bv-composite-models.md)のP3のうちMedieval 08の2モデルに対応した。Bakeries・Inns・Breweriesは引き続き後続作業である。

## 部品と組み合わせ

Merchant shop and dwelling、Street workshop and lodgingのLow／Highを独立部品へ分割した。Lowは住宅外殻・戸・カウンター・庇・商品または道具の5部品、Highは棚を加えた6部品。住宅の外殻に店舗開口を含め、窓の位置と追加設備の位置を一致させる。Highの実開口を維持し、既存Lowの簡略な暗色オーバーレイ表現は変更していない。

庇は支持柱・支え・屋根または布を一体の部品とする。商品・工具・万力等はカウンターや棚を前提とするため、今回のプリセットは「標準」「商品・道具なし」「庇なし」に限定する。構成を変更しても戸・カウンター・住宅外殻は維持する。任意の住宅に異なる寸法の設備を接続する機能はまだ提供しない。

High住宅の共通外殻は`dwellingShell.ts`へ移動し、既存住宅3モデルも同じ関数を使う。`dwellingDetails.ts`の公開factory名を維持した。既存のvariant IDと登録品質は変更せず、構成違いを別のHigh資産として登録しない。

## BV表示と結合

`Model options`で`Quality`、`Composition`、`View`を選ぶ。単体も選択したLow／Highを使い、構成にない部品は生成しない。品質切替でHigh専用の棚がなくなるなど、選択中の部品が存在しなくなった場合は全体表示へ戻す。

`ModelPartFactory`の資源所有を維持したままHighを結合するため、`compactModel`へ明示指定の材質統合を追加した。同じ設定を持つ通常Lambert材質だけをまとめ、side等が異なる材質やカスタムシェーダーフックを持つ材質を同じbucketへまとめない。既存呼び出しの既定は従来どおり材質オブジェクト単位である。

結合後も部品台帳と、各出力メッシュ内の部品別頂点範囲を残す。再結合時も範囲を引き継ぐ。台帳のメッシュ数は最終結合前の部品の値で、最終描画メッシュ数とは区別する。

単体や別構成の値は標準variantの比較キャッシュに登録しない。Highの単体をLow欄へ表示していた固定値も品質に追従するよう修正した。単体・別構成では「表示中の品質の値だけを計測」と示し、他品質が存在しないという説明を出さない。CE採用表示も、単体・別構成ではプレビューであることを明記する。CEの自動配置は既存の登録モデルを使う。

## 形状と負荷

| モデル | 品質 | 標準の三角形 / メッシュ | 商品・道具なしの三角形 | 庇なしの三角形 |
| --- | --- | ---: | ---: | ---: |
| Merchant | Low | 1,146 / 98 | 618 | 1,110 |
| Merchant | High | 25,310 / 9 | 20,078 | 18,860 |
| Artisan | Low | 894 / 66 | 694 | 806 |
| Artisan | High | 19,060 / 8 | 18,344 | 14,320 |

標準構成は全4ケースで、分割前と三角形数・描画メッシュ数・形状と色のハッシュが一致した。ハッシュは、材質RGB・sideと、向きを保持した各三角形のワールド頂点（小数5桁）の文字列を三角形間でソートしてSHA-256へ入力する。法線や資源IDは含めない。材質別bucketの順序変更はこの比較に影響しない。

| モデル / 品質 | 分割前後で一致したSHA-256 |
| --- | --- |
| Merchant Low | `0199c4bb1b6d7dfcba00c6c2203f650b527fbbf22930e30d3ba0dfde0aa809ce` |
| Merchant High | `867a5b49fbcbbd126fafc9dff2f78133b199a4584002e8ddf89b0d3a40c3c012` |
| Artisan Low | `5033bb45b684f855042b4fcedd2b1417d2cd9ed311c69b1886441893db4ea9a3` |
| Artisan High | `b8fe4427396dfc00723c7ba1bd4250873852ece8464c9ced57dd071509ed7f40` |

Lowの独立部品は共有立方体・材質をそれぞれ所有するため、ユニークな資源数は増える。Merchantはgeometry 5→9、材質12→17、Artisanはgeometry 10→13、材質7→13。Highは統合後の材質数も9／8を維持する。FPS・ピークメモリの改善を示す測定ではない。

`node --import tsx scripts/profileShopHouseParts.mts`で[計測JSON](bv-shop-house-parts-p3-20261101.json)を再生成できる。標準4ケースのハッシュ照合、12構成、各部品の単体負荷を記録し、計測後はモデルを解放する。

## 検証

`npx vitest run src/buildings/compactModel.test.ts src/buildings/medieval/shopHouseParts.test.ts src/buildings/medieval/dwellingDetails.test.ts src/buildings/monasteries/monasteryParts.test.ts src/city3d/adoption.test.ts src/building-viewer/modelComparison.test.ts`：6ファイル34件成功。

- 2モデル×2品質×3構成で役割・品質・三角形総数・Highの結合頂点範囲を照合。
- Highの店舗開口が各構成でも塞がらないことをレイで確認。既存の入口・外向き屋根・煙突開口・寸法・資源解放と住宅3モデルの検証も成功。
- 部品単体で他のfactoryを呼ばないこと、不明プリセットの拒否を確認。
- 材質統合の明示指定・既定動作、異なる材質設定の分離、再結合後の部品範囲の維持を検証。
- 修道院の独立部品、CE採用ID、比較表のHigh欄と単体表示の説明も成功。

変更した部品生成・共通処理等7ファイルのBiome checkと`git diff --check`も成功。

実BVで12構成を巡回し、部品単体のHigh→Low切替と標準へ戻した比較値を確認。全値がNode計測と一致した。

- [Merchant High・庇なし](bv-shop-open-front-p3-20261101.png)
- [Artisan High・庇単体](bv-shop-canopy-p3-20261101.png)
- [Artisan High・標準へ戻した表示](bv-workshop-standard-p3-20261101.png)

後続の[Bakeries実装記録](bv-bakery-parts-p3-20261101.md)で住宅棟・パン窯・上屋・作業設備を分割した。次はMedieval 12 Innsの宿泊棟・厩舎・サービス棟・中庭を部品化する。
