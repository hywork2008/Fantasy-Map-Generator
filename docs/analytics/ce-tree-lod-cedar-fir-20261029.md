# CE森林LOD：ベイスギ・モミの4品質化

確認用画像は目視比較のための一時出力とし、永続保存・Git収録を行わない。画像ファイルの有無を完了条件にせず、以下の所見・条件・計測値・再現手順を記録として残す。既存スクリプトによる画像出力も確認後に削除する。

2026-10-29。[全樹種のタスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) F1-3の作業記録。

## 1. 実装と作者

ベイスギ `western_red_cedar` とモミ `silver_fir` を4品質化し、BVの品質一覧とCE森林・公園等の共通登録へ接続した。既存のバイオーム選択規則・森林領域・保存形式は変更していない。

既存のClaude Opus 5.5製defaultをultraへ移し、変更前HEADの生成器との全geometry属性配列・index配列の完全一致を確認した。同じ生成器を共有するハンノキ・オリーブも変更前と完全一致。新作のlow／medium／highはCodex GPT-6.1 Solとして登録し、highはOpus ultra、low／mediumは同樹種highを `basedOn` に記録した。作者が段階で異なることをBVで確認できる。競合版がない各品質は単独版の暗黙採用で、既存の `CE_ADOPTION` は編集していない。

トウヒのOpus plate採用は確認済み。このチェックアウトにはシラカバのOpus版定義・採用エントリが見当たらず、その追加や他作者への切替は今回行っていない。

| 樹種 | 品質 | 三角形 | source bufferBytes | 作者 |
| --- | --- | --- | --- | --- |
| `western_red_cedar` | low | 432 | 46,656 | Codex GPT-6.1 Sol |
| `western_red_cedar` | medium | 2,719 | 293,652 | Codex GPT-6.1 Sol |
| `western_red_cedar` | high | 14,850 | 1,603,800 | Codex GPT-6.1 Sol |
| `western_red_cedar` | ultra | 26,122 | 2,821,176 | Claude Opus 5.5 |
| `silver_fir` | low | 416 | 44,928 | Codex GPT-6.1 Sol |
| `silver_fir` | medium | 2,962 | 319,896 | Codex GPT-6.1 Sol |
| `silver_fir` | high | 16,664 | 1,799,712 | Codex GPT-6.1 Sol |
| `silver_fir` | ultra | 104,596 | 11,296,368 | Claude Opus 5.5 |

[変更前の棚卸し](ce-tree-lod-cedar-fir-before-20261029.json) は32モデル枠、[変更後](ce-tree-lod-cedar-fir-after-20261029.json) は38枠。制作台帳は6樹種×4品質＝24枠が実装済みとなり、残る14樹種×4品質＝56枠を継続する。bufferBytesはsource geometryの属性・index配列の合計で、GPU実メモリではない。

## 2. mediumの作り方と比較による調整

[tree-medium-canopy-lobes.md](../plan/tree-medium-canopy-lobes.md) を基準にした。

1. high／ultraの枝生成・乱数列を共有する。葉を間引く前の乱数消費を保ち、highとultraの木部は同じ形状にする。
2. mediumはhighが実際に出力する鱗葉・針葉の頂点を採取する。一つの主枝に属する隣接した枝葉の分布を一房として当てはめ、lowでは隣接する2枝段をまとめる。カメラに依存する配置や板への置換は行わない。
3. `fitCanopyLobe` と `createCanopyLobes` を共用し、樹冠に沿う法線、上向きの補正、頂点AO、色むら、頂点の揺らぎ、隠れた面の除去を適用する。mediumは生成後に `computeVertexNormals` で陰影を上書きしない。
4. 初回の水平断面を円とする近似では、平たい枝葉が丸く膨らみhighとの差が大きかった。この2樹種のmediumに限り、点群のXZ共分散から長軸・短軸・固定の向きを求める楕円体近似を加えた。判定・法線も同じ向きを使う。これは静的な枝の向きで、カメラ追従処理ではない。
5. 既存の球対称な房は従来の計算を既定のまま保持する。変更前の共通処理と、向き指定のない房のposition／normal／color配列が完全一致することを確認した。

最終パラメーター：

| 樹種 | medium coverage | low coverage | 色相／彩度／明度 | mediumで残す枝の根元半径 |
| --- | --- | --- | --- | --- |
| ベイスギ | 1.05 | 1.05 | 0.29 / 0.42 / 0.24 | 0.05 m以上 |
| モミ | 1.05 | 1.18 | 0.35 / 0.38 / 0.21 | 0.06 m以上 |

lowの初期値0.85では樹冠幅が不足したため、実寸の比較と検査で調整した。mediumは林でhighより明るかったため、ベイスギの明度を0.27→0.24、モミを0.24→0.21へ下げた。モミでは細い枝の描画を減らし、mediumを3,000三角形未満に収めた。lowは500未満、highは25,000未満、ultraは120,000未満の制作目安も満たしている。

highは個別の枝葉、mediumは面として縮約した房であり、拡大時の葉の隙間・不透明な面の量まで完全一致するわけではない。採用の比較資料として以下の同条件で目視確認し、所見を残す。

## 3. 比較条件と画像

すべて `createBvPrototypeCache().acquire()` を通した、CEと同じDoubleSideの頂点カラー材質・結合geometryで描く。照明は `HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9)`、`DirectionalLight(1.15)`、`sunDirection(DEFAULT_SUN)`。背景は `0xc5c5bf`、SRGB、DPR 1、1200×800。

- 4品質・斜め、側面、俯瞰
- medium／highの単木：highの樹冠boundsを基準に45／90 px相当で倍率を揃え、12°、40°、70°を比較。枝葉の隙間で実画素の占有面積は異なる。
- 各260本の林・35°／130 m。同じ位置・回転・寸法を使い、2樹種それぞれのmedium／highを比較した。
- 実BV画面：ベイスギmedium、モミmedium。それぞれ全4品質の選択と描画を確認した。

再現コマンド：

```sh
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-cedar-fir-after-20261029.json
node --import tsx scripts/verifyCeConiferTreeLod.mts
```

変更前JSONは上書きせず保持する。JSONにはソースのSHA-256、比較スクリプトには固定入力・カメラ・照明を記録した。全量JSONは2 MB未満。

## 4. CE森林LODとGPU確認

既存ライム・タイガと同じ、距離40／120／400 mによる `quality-first` とした。森林全体の三角形・本数・callsの予算で木を汎用形状へ戻したり、距離品質を下げたりしない。影の提出予算は既存処理を維持する。従来のbounded予算達成とは区別する。

固定入力はseed `ce-tree-lod-cedar-fir-v1`、standard密度、256 m四方、24×32 mの穴を持つ平坦な森林領域（64,768 m²）。`temperateRainforest`／`montaneForest` ×俯瞰・林縁・低視点×森林light／standard／highの18条件を描いた。全条件で面積を維持し、表示される樹木数と採用BVモデルの品質別本数合計が一致した。

Apple M4、ANGLE Metal Renderer、Chromium。森林standardの数量は以下の通り。light／highでも同じ距離の品質を維持する仕様である。

| バイオーム | 視点 | 表示樹木 | low / medium / high / ultra | 三角形 | calls |
| --- | --- | --- | --- | --- | --- |
| `temperateRainforest` | overview | 773 | 773 / 0 / 0 / 0 | 334,660 | 6 |
| `temperateRainforest` | edge | 408 | 0 / 307 / 92 / 9 | 2,436,755 | 10 |
| `temperateRainforest` | low | 230 | 0 / 128 / 89 / 13 | 2,009,992 | 10 |
| `montaneForest` | overview | 773 | 773 / 0 / 0 / 0 | 322,292 | 6 |
| `montaneForest` | edge | 408 | 0 / 307 / 92 / 9 | 3,384,510 | 8 |
| `montaneForest` | low | 230 | 0 / 128 / 89 / 13 | 3,222,704 | 8 |

- ベイスギの林縁、俯瞰、低視点
- モミの林縁、俯瞰、低視点

両バイオームで品質切替3巡のgeometry数はそれぞれ15→15→15で安定し、WebGLエラー・pageerrorとも0件。[描画記録JSON](ce-tree-lod-cedar-fir-20261029/results.json) は単発CPU更新／描画提出時間のみで、GPU完了時間・街全体の操作p95・33 ms目標の達成を示さない。影ありの見た目・別GPU・高DPR・全バイオームの総合受入はF5に残る。

## 5. テストと残作業

関連12ファイル・79件のVitestが成功（重複実行は数えない）。登録・採用・段階ごとの三角形減少、high／ultraの木部一致、接地・寸法・有限値・資源解放、CE prototypeでの法線／色の保持、静的な房の向き、既存ライム・イチイとの互換、森林・公園・CE更新を確認した。法線の再正規化によるFloat32誤差は1e-6未満で判定する。

公園のライムの既存テストには、LODがカメラ更新前に描画meshを作るという古い前提が残っていたため、カメラ更新後の実際のLODインスタンスと色を検証する形へ更新した。製品の公園描画処理は変更していない。

Biome・差分チェックを実施。TypeScript全体検査は、今回触っていない `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗し、今回の変更ファイルには型エラーが報告されなかった。

次はF1-1の既存モデルの基準画像とF1-4の温帯・寒帯バイオームの確認を残作業として進め、次のモデル作製はF2-1のナツメヤシ・アンブレラソーンへ進む。全樹種の最終受入はまだ完了していない。
