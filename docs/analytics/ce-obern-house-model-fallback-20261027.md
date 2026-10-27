# Obern #93 の簡易住宅モデル調査と修正

調査日: 2026-10-27

## 再現入力

ユーザーの共有リンクをgzip/base64urlから展開し、固定入力として
`src/city-editor/data/fixtures/obern-20261027.json` に保存した。

- 都市: Obern、都市ID: 93
- seed: `6851550440093`
- 人口: 5,944
- 時代: `ageOfExploration`
- 外観: 全棟 `atlantic`
- 気候: 10℃、forest / wetland、非乾燥
- 入力SHA-256: `48a9a8a22a1d55c7e62530dacffa177d9670b3be84a8ca44294814dc527f7d3f`

`temp/000-perf.csv` の `burgId=93`、`name=Obern` の行も同じseed・人口だった。
同CSVの `quality.buildings` は2,005棟だが、本調査は共有入力を現行コードの
`cityEditorDocument` → `cityEditorSettings` → `generateCityOnDocument` → `buildBlockFabric`
で再生成した2,330棟を対象にする。過去の計測時点の棟数との一致は主張しない。

## 原因

高品質設定でも `regionalHouseSite` は、既存の長方形モデルをはみ出さず配置できる住宅しか受け入れなかった。
切妻・寄棟のモデルは存在していたが、幅3〜18m・奥行4〜28mという制限と、
輪郭面積が屋根軸方向の外接長方形の99.9999%以上という条件があった。
陸屋根は凸形の泥煉瓦モデルだけに対応していた。

| 置換できなかった理由（寸法条件を先に判定） | 棟数 |
| --- | ---: |
| 寸法範囲内だが非長方形 | 1,141 |
| 寸法範囲外 | 162 |
| 凹形・木骨壁の陸屋根 | 1 |
| 合計 | 1,304 |

修正前は1,026棟のみ詳細モデルの対象だった。全2,330棟の屋根内訳は
切妻1,341棟、寄棟988棟、陸屋根1棟。
品質の設定変更だけではこのモデル適用条件を解消できない。

## 修正

`src/buildings/houses/polygonHouses.ts` に、BVとCEで共用する多角形住宅モデルを追加した。

- CEの既存 `buildingSurfaces` で実測輪郭・階高・屋根形状・張り出しを維持する。
  外接長方形で埋めたり、モデル全体の拡大縮小で合わせたりしない。
- 実際の各階の壁に扉・窓を配置。Highでは立体の枠、鎧戸、窓桟、扉の板・金具、
  木骨壁の柱・横架材と屋根面内に収まる継ぎ目を追加する。
- Lowでは開口表現と外形を維持し、細部を省く。
- 入口は既存の道路前面判定で選んだ壁の中央に置く。屋根軸を入口に合わせて回転させない。
- 既存の地域住宅が適合する敷地は既存モデルを使用し、適合しない住宅を新モデルに接続する。
  既存の泥煉瓦・陸屋根モデルを優先する。
- BVの `CE regional houses` → `Polygonal and narrow houses` に、幅2.4mの切妻、
  台形の寄棟、凹形の陸屋根の確認用モデルを登録した。

新モデルの屋根の細部は継ぎ目表現で、既存の地域別モデルの煙突・装飾を全て再現するものではない。
内部は生成しない。

## 検証

関連する4テストファイルの計12件が成功した。

- `polygonHouses.test.ts`: 3件。High/Low、上向き屋根面、凹部を埋めないこと、
  実際の扉、有限な座標・法線・色、BV/CE共通ジオメトリ、解放処理。
- `obernHouseModels.test.ts`: 1件。固定入力から全2,330棟に配置でき、うち1,304棟が新モデルとなる。
  代表的な屋根形状・輪郭について実ジオメトリの敷地範囲・基礎位置・等倍配置も検証。
- `regionalHouseMeshes.test.ts`: 7件。既存の地域住宅・入口方向を維持し、
  台形・陸屋根の置換と多角形住宅の道路側入口を検証。
- `vegidesHouseModels.test.ts`: 1件。既存の泥煉瓦114棟の置換を維持。

新規テストが検出した扉枠の地下への突き出しを修正し、該当テストを再実行して成功した。
`npx tsc --noEmit --pretty false`、変更TSファイルのBiome、`git diff --check` も成功。

実ブラウザーのWebGLでBVのHigh/Low切替とCEのObern（quality=high、2,330棟）を確認し、
ページエラーは0件。画像も目視確認した。全都市や多数シードの検証は行っていない。

確認用スクリプト・画像（Git管理外）:

- `temp/check-obern-bv.mjs`、`temp/obern-bv-high.png`、`temp/obern-bv-low.png`
- `temp/check-obern-ce.mjs`、`temp/obern-polygon-ce.png`
- 初期診断: `temp/obern-models.mjs`、`temp/obern-models.ts`、`temp/obern-model-result.json`、`temp/obern-model-lots.json`
