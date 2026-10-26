# Vegides の高品質3D住宅が簡易形状になる原因

調査日: 2026-10-27

## 結論

高品質設定の伝達漏れではなく、生成される陸屋根住宅が詳細住宅モデルの対応範囲外であることが原因。地中海系の詳細住宅モデル自体は存在しhighに対応しているが、CEからの配置処理は切妻・寄棟のみを受け入れ、陸屋根を受け入れない。

## 固定入力での確認

`src/city-editor/data/fixtures/vegides-20261026.json` から、CEと同じ `cityEditorDocument` → `cityEditorSettings` → `generateCityOnDocument` → `buildBlockFabric` を実行。各建物を `regionalHouseSite(lot, index, 0, "high")` に渡して判定した。

| 項目 | 観測 |
| --- | --- |
| 文化 | `latinMediterranean` |
| バイオーム | `coldSteppe` |
| 気温 | 6℃ |
| 外観バージョン | 1 |
| 建物数 | 114 |
| 外観プロファイル | 全114棟が `mediterranean` |
| 壁 | 全114棟が `mudbrick` |
| 屋根 | 全114棟が `flat`、屋根材は `turf` |
| 高品質指定で詳細住宅モデルの候補になった数 | 0 |

診断スクリプトと観測データは `temp/vegides-models.mjs`、`temp/vegides-models.ts`、`temp/vegides-model-result.json`、`temp/vegides-model-lots.json` に保存。実ブラウザーの保存済み都市やlocalStorageは取得しておらず、固定入力を現行コードで再生成した結果である。

## 原因の連鎖

1. `src/city-editor/generators/buildingMassing.ts:51` の気候判定がバイオーム文字列の `desert|arid|steppe` を乾燥扱いにする。ここでは気温を参照しないため、coldSteppeも乾燥扱いになる。
2. 同95行で乾燥地域の非富裕建物は `mudbrick` が文化系の壁判定に優先する。
3. 同109行でmudbrickの屋根材を `turf`、182行で屋根形を `flat` にする。
4. 外観側は `src/buildings/appearance/resolver.ts` の文化対応表から `mediterranean` を選択しており、文化設定は欠落していない。外観設定は既存の屋根形を切妻等に置き換える処理ではない。
5. `src/city3d/three/regionalHouseMeshes.ts:91` は `gable` / `hip` 以外を詳細モデル配置から除外する。したがって全棟が通常のCE簡易形状に残る。
6. `src/city-editor/renderers/cityView.ts:362` は詳細モデルに置換できた建物だけ簡易形状を除外する。今回の114棟は置換されないため、画質設定がhighでも簡易形状で描かれる。

品質の配線は `CityEditorPage.ts` の `getModelQuality: readModelQualityPreference` → `cityView.ts:535` → `rebuild` → `createTownRegionalHouses` → `regionalHouseSite`。設定値の読み出し既定値もhighであり、今回の再現ではhighを明示しても詳細モデル対象が0だった。

`src/buildings/houses/regionalHouses.ts` の地中海系モデルにはhigh/low両品質が存在する。今回の現象はhighからlowへの品質段階の代替ではなく、詳細モデルへの置換そのものが行われないための簡易形状表示である。

## 検証と対応候補

関連する既存テスト `regionalHouseMeshes.test.ts` の、high指定での実寸モデル配置と陸屋根等の対象外条件の2件を実行して成功。製品コードは変更していない。

直接の対応は、泥煉瓦・陸屋根住宅の詳細モデルとCEへの配置対応を追加すること。併せてcoldSteppeを含む乾燥判定が、気温を考慮せず全棟を泥煉瓦・陸屋根へ寄せる仕様を見直すか判断する。文化設定の再指定や品質設定の再保存だけでは、この再現条件は解消しない。

## 高品質モデルの追加・CE接続

後続の実装依頼により、`src/buildings/houses/earthenHouses.ts` にBV・CE共通の泥煉瓦・陸屋根住宅モデルを追加した。

- BVの `CE regional houses` → `Earthen flat-roof houses` に登録。1〜3階建てと台形の例を閲覧でき、High / Lowを切り替えられる。
- Highでは木製の扉・鎧戸、まぐさ、開口部の縁、露出した泥煉瓦、梁端、屋上の立ち上がりと排水口を描く。Lowは外形・開口・屋上の立ち上がりを維持して細部を省く。
- CEの詳細住宅配置に接続し、対応する凸形状の泥煉瓦・陸屋根建物へ自動適用する。輪郭を長方形に置き換えず、台形や狭い建物もそのままモデル化する。
- CEの階高・基礎標高・外観色をモデルへ渡し、既存の前面道路判定で入口を選ぶ。モデル全体を拡大縮小して合わせる処理は使用しない。
- 住宅・店舗・工房・倉庫に対応。内部と屋上への出入口は描かない。既存の切妻・寄棟住宅は従来のモデルを使用する。

### 検証結果

- `earthenHouses.test.ts`、`vegidesHouseModels.test.ts`、既存の `regionalHouseMeshes.test.ts`: 計11件成功。
- 屋上面の上向き法線、屋上の立ち上がり内部の空間、台形外側を埋めないこと、頂点・法線・色の有限値、BV/CEの同一ジオメトリ、リソース解放を検証。
- Vegidesの114棟すべてがhighモデルに置き換わること、階高・基礎位置を維持することを検証。建物輪郭に対する水平範囲の検証を追加後、Vegidesのテストを再実行して成功。
- `npx tsc --noEmit --pretty false`: 成功。
- 変更TS5ファイルのBiomeチェック、`git diff --check`: 成功。
- BVでモデル表示およびHigh / Low切替を実ブラウザー確認。描画エラーなし。
- CEの `mountCity3d` へ固定入力から再生成したVegidesを渡し、実ブラウザーのWebGLで `quality=high`、建物114棟、描画エラーなしを確認。

確認画像（Git管理外）:

- `temp/earthen-bv-high.png`
- `temp/earthen-bv-low.png`
- `temp/vegides-earthen-ce.png`

ブラウザー確認スクリプトは `temp/check-earthen-bv.mjs` と `temp/check-earthen-ce.mjs`。ローカル開発サーバーのポートは実行環境に合わせて変更する。
