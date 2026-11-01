# BV：会館の共通外階段と入口の手すり修正（2026-11-01）

[複合モデル設計](../plan/bv-composite-models.md)の生成境界・配置・部品台帳の方式を、市庁舎・市場会館・織物商人会館のHighへ適用した。建物ごとに同じ階段を作る代わりに、共通の`createExteriorStair`を寸法指定で生成し、建物の入口へ配置する。

## 共通部品と接続

- `exteriorStair.ts`：段・支持柱付き踊り場・手すり・支柱を一つの自己完結した部品とする。高さ、走行長、階段幅、踊り場奥行、扉幅から再生成する。完成モデルの非等方拡縮は使わない。
- `exteriorStairLayout`：段数、占有範囲、踊り場の扉接続点・通路幅・高さを返す。入口幅と余裕を確保できない踊り場寸法は拒否する。
- `civicHallParts.ts`：Highを`architecture`と`exterior-stair`の2部品へ分割した。共通階段の接続点を、各会館の東側上階扉（Z=-2.3、床高3.32 m）に合わせる。各factoryは選択されたときにだけ生成する。
- `createModelAssembly`と`compactModel`が作者・High品質・部品台帳と統合後の頂点範囲を保持する。階段は528三角形、3メッシュ。制作を共通化し、GPU資源は各生成物が独立して所有・解放する。
- BVの`View`で`Architecture`と`Exterior Stair`を単体表示できる。Lowは元の生成関数を維持し、単一のLow建築部品として扱う。Low階段の独立分割は今回の対象外。

## 手すりの修正

従来の内側手すりは階段の上端を越えて入口前を横切っていた。共通部品では階段の手すりを入口の通路より手前で終え、踊り場の外側と奥側にガードを設けた。壁に面する入口側は開いたままとする。踊り場は奥行1.5 mへ広げた。

| モデル | 修正後High三角形 | メッシュ | 表示 |
| --- | ---: | ---: | --- |
| 市庁舎 | 30,176 | 9 | [全体](bv-medieval-town-hall-front-high-20261101.png)・[階段単体](bv-medieval-town-hall-stair-high-20261101.png) |
| 市場会館 | 27,572 | 8 | [全体](bv-covered-market-hall-front-high-20261101.png)・[階段単体](bv-covered-market-hall-stair-high-20261101.png) |
| 織物商人会館 | 31,952 | 11 | [全体](bv-cloth-guild-hall-front-high-20261101.png)・[階段単体](bv-cloth-guild-hall-stair-high-20261101.png) |

## 検証

- `npx vitest run src/buildings/medieval/exteriorStair.test.ts src/buildings/medieval/civicHallDetails.test.ts src/city3d/adoption.test.ts`を関連範囲として実行。接続位置の修正後に専用テストを再実行し、最終結果は階段3件、会館14件、採用3件の計20件成功。
- 共通階段を2種類の寸法で生成し、入口側の通路、踊り場床面、支持柱との接合、奥側ガード、無効な寸法の拒否を検証した。
- 3会館すべてで、実際の扉の中央と左右に取った5位置・足元から頭上までの高さを走査し、踊り場中央から扉の外面までの経路が空いていることを確認した。室内側の扉開口は既存の別テストで確認する。
- 部品の単独生成、High台帳、統合後の部品範囲、配置、実寸、資源所有、CE用default参照も関連テストで確認した。
- `npx tsc --noEmit`、変更ソースのBiome、`git diff --check`：成功。
- 実BVで3種のHigh全体→階段単体→全体を巡回。階段の単体品質、三角形数、部品選択、外観を確認。巡回中のJavaScriptエラーは0件。

今回の共通化はHigh資産数を追加するものではない。次の作業は職人ギルド会館4種と石工の作業場1種のHigh制作。
