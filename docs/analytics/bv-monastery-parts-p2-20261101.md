# BV複合モデル P2：修道院の独立部品と単体表示

2026-11-01。[設計書](../plan/bv-composite-models.md)のP2を実装した。

## 生成と所有

`monasteryComponents.ts`へ建築棟（教会堂・後陣・居住棟・門棟・鐘架・塔・ドーム）、回廊、壁、地面、植栽、井戸の生成関数を分離した。各factoryが独立した資源を所有し、単体を破棄しても他の部品・全体モデルの資源を破棄しない。

`monasteryPartFactories`は、保存された敷地計画から部品ID・役割・品質・作者・依存元・factoryを列挙する。この列挙では形状を生成しない。建築寸法・方位・標高は選択前の全体計画から求めるため、単体表示でも元の形を保つ。

`createModelAssembly`は選んだfactoryだけを生成し、台帳と資源をまとめて所有する。途中のfactoryが失敗した場合は、それまでに完成した部品を解放する。`createMonastery`の`partIds`で複数部品の部分構成も生成できる。不明ID・重複IDは生成前に拒否し、空配列は空の構成を意味する。

CEは引き続き全体を生成し、既存の頂点色メッシュへの結合と部品範囲の対応を維持する。保存形式・敷地配置は変更していない。

## BVの操作

Medieval 33 Friaries、32 Abbey、41 Orthodoxの`Model options > View`へ`Complete assembly`と各部品を追加した。単体切替は全体を作って隠す方式ではなく、選んだfactoryだけを呼ぶ。切替時に従前のモデルを解放し、カメラ、正面図・平面図、寸法、部品台帳、負荷を表示中の部品へ更新する。

単体はCE上の配置と高さを保持する。例えば鐘架・ドームは屋根上の高さを引き継ぐ。元の施設全体の説明は残し、`View`と`Scope`で単体であることを明記する。植栽・井戸の品質選択は現在APIのみで、BVの単体表示は既定Lowである。

単体の負荷を全体の品質比較キャッシュに登録しない。Abbey・Orthodoxの単体表示から全体へ戻した後も、全体の既定variantの測定値を維持する。

| 実BVの表示 | メッシュ | 三角形 |
| --- | ---: | ---: |
| Friary 全体 | 206 | 4,262 |
| Friary 回廊単体 | 25 | 1,320 |
| Friary 井戸単体 | 28 | 632 |
| Abbey 全体 | 233 | 4,825 |
| Abbey 交差部塔単体 | 11 | 124 |
| Orthodox 全体 | 195 | 3,086 |
| Orthodox ドーム単体 | 6 | 352 |

## 形状の維持と負荷

分割前のP1コードで、修道院三種の固定計画を標高3・基礎下端−1にしてハッシュを採取した。各pickableの名前・材質RGBと、indexを展開したワールド座標（小数5桁）を順番にSHA-256へ入力した。P2で再計測し、三種とも一致した。法線と資源の同一性はこのハッシュの対象外である。

| 種別 | 分割前後で一致したSHA-256 |
| --- | --- |
| Friary | `d1b9325efad320ec36d4858b909b7d3ded6d93acb4ab9a427909e65ce0f28698` |
| Abbey | `14cda5e0637bb5e156e6d19aaa3a9263b014c9c3fe3ca0a88d2f7d8dcf2e377d` |
| Orthodox | `f26d56bd6d03639710c829e1867e167b7fa1cac75bb6c966d6f04293bc8fba58` |

メッシュ数と三角形数は維持した。資源を部品ごとに所有するため、共有していた小さな立方体バッファや材質の一部は別々に生成する。BV全体のユニーク材質数はFriary 36→50、Abbey 37→56、Orthodox 34→40になった。描画メッシュ数は増えていない。CEの最終結合は従来どおり1メッシュ・1材質である。FPSの改善を目的とした変更とは扱わない。

`node --import tsx scripts/profileMonasteryParts.mts`で[計測JSON](bv-monastery-parts-p2-20261101.json)を再生成できる。JSONの全体計測は基礎を含み、通常BVプレビューより1メッシュ・12三角形多い。全68部品（基礎を含む71部品）を個別に生成して寸法と負荷も記録する。

## 検証

`npx vitest run src/buildings/monasteries/monasteryParts.test.ts src/city3d/three/friaryMeshes.test.ts src/city-editor/generators/monasteryLayout.test.ts src/city3d/adoption.test.ts`：4ファイル32件成功。

- 修道院三種の全factoryを個別生成し、全体モデル内の同じ部品と三角形数・ワールド外接範囲が一致することを検証。
- 列挙や教会堂・回廊等の単体生成で、樹木factoryを呼ばないことを確認。各植栽単体では樹木1本だけを生成。
- 部品と全体がgeometryを共有せず、入力計画を変更しないことを確認。
- 複数部品の部分構成、不明／重複IDの拒否、途中失敗時の完成部品の解放を検証。
- 回廊の開口・門の通路・標高・回転・CE結合後の部品範囲・CE採用の既存テストも成功。

新規・共有モジュール4ファイルのBiome checkと`git diff --check`も成功。実BVで回廊・井戸・塔・ドームと全体の往復、寸法・投影図・負荷の更新を確認した。GPU FPS・CEの対話操作は今回検証していない。

この記録はP2時点の結果。後続の[P3 Shop Houses実装記録](bv-shop-house-parts-p3-20261101.md)で住宅系へ展開し、Low/Highに対応した単体表示と3構成の切り替えを追加した。次はBakeries。修道院の品質UI・分解表示・新規Friary Highは後続とする。
