# FMG水辺都市の生成パフォーマンス改善（2026-10-27）

対象は `Nidyia_2026-10-26-13-17.fmg` の指定20都市。比較元は `0fe753dec8437cadd1ad66369cd4e04ff4650036` の生成処理。既存の `temp/000-perf.jsonl` から原因を調べ、同じ固定入力・シードで変更前後を再計測した。

## 結果

都市ごとの2回の `timings.generationMs` の平均を合計すると **96.793秒 → 56.671秒（41.5%短縮）**。20都市すべてで短縮し、都市別の短縮率は19.6〜56.2%。各条件40回とも生成成功。

1都市1回に換算した住宅用fabricの初期構築は **41回 → 22回**。面積不足で都市全体を作り直す追加パスは **21回 → 2回**。Nobraの門接続不成立による破棄は **4候補 → 2候補**。DescouxとLucetaには各1回の面積補正が残る。

| burgId | 都市 | 変更前 秒 | 変更後 秒 | 短縮率 | 初期fabric構築回数 |
| --- | --- | ---: | ---: | ---: | ---: |
| 13 | Nobra | 9.004 | 4.939 | 45.1% | 2 → 1 |
| 93 | Obern | 4.749 | 2.607 | 45.1% | 2 → 1 |
| 7 | Seseneva | 6.426 | 3.430 | 46.6% | 2 → 1 |
| 11 | Gjevels | 6.926 | 4.201 | 39.4% | 2 → 1 |
| 92 | Pforztaltens | 5.381 | 2.783 | 48.3% | 2 → 1 |
| 14 | Descoux | 5.655 | 4.033 | 28.7% | 2 → 2 |
| 17 | Schotig | 5.456 | 3.726 | 31.7% | 2 → 1 |
| 301 | Wudensauern | 4.973 | 2.176 | 56.2% | 2 → 1 |
| 12 | Cormigny | 5.097 | 2.795 | 45.2% | 2 → 1 |
| 380 | Vejotillas | 4.967 | 2.952 | 40.6% | 2 → 1 |
| 20 | Sandela | 4.396 | 2.157 | 50.9% | 2 → 1 |
| 8 | Alolaba | 5.188 | 2.743 | 47.1% | 2 → 1 |
| 1 | Prestad | 4.604 | 2.644 | 42.6% | 2 → 1 |
| 396 | Jilesca | 4.687 | 2.467 | 47.4% | 2 → 1 |
| 71 | Falldalder | 3.964 | 2.316 | 41.6% | 2 → 1 |
| 15 | Luceta | 4.268 | 3.418 | 19.9% | 2 → 2 |
| 6 | Etendorf | 4.011 | 3.225 | 19.6% | 2 → 1 |
| 145 | Cerdos | 2.079 | 1.218 | 41.4% | 3 → 1 |
| 118 | Oraliga | 2.035 | 1.331 | 34.6% | 2 → 1 |
| 22 | Baden | 2.927 | 1.510 | 48.4% | 2 → 1 |

## 変更したアルゴリズム

- **住宅面積の先行予約**: 従来は小さい都市を最後まで作り、低層住宅の容量不足を検出してから再生成していた。FMG都市形態データと建物高さ分布から、人口計画と同じ80 m²の住宅・27%の住宅建築面積率で最初の必要面積を見積もる。実測による補正、最大面積、ロック、手動人口枠の制約は維持する。明示された面積倍率は再見積もりせず、生成recipeにも確定した倍率を保存する。
- **水面を住宅面積に数えない成長**: FMG都市形態データを持つ都市では、測量河川・水路をセルから差し引いた陸地面積を使って市街地を成長させる。重複水面は二重控除しない。水没率の高いセルの優先度を下げ、中心と主要市街地を陸側へ寄せる。河岸の部分セルは残し、既存の港・水辺施設・郊外の制約を適用する。成長コストはセルごとに一度計算する。
- **不足判定の前倒し**: 詳細fabricが不足していれば、占有率調整や船配置を行う前に面積を補正する。完成後に同じfabricをもう一度作って面積を測る処理も省く。
- **同じ地形の計算を共有**: 外部道路の接続確認・補修と道路ルーターは、不変の地形に対する水判定を共有する。CPUプロファイルで目立った海岸と全メッシュの比較・割当てを辺ごとに繰り返さない。農地ステージにも住宅生成のdistrict cacheを渡す。

川岸・海岸・FMGの固定橋は移動していない。新方式はFMGの都市形態データを持つ都市に適用し、従来の手動設定地図の輪郭を維持する。橋の角度・道路接続などの既存検証を省略して速度を稼ぐ変更は行っていない。

主な実装は `generation/heightArea.ts`、`generation/planning/landBudget.ts`、`classifyUrban.ts`、`generation/generateCity.ts`。水判定の共有は `generation/routing/frameRoadConnection.ts` と `completeRoadRouter.ts`。

## 生成品質と残る制約

- 変更後40回すべてで交差検証エラー0、角度上限を超える橋0。同一都市の2回のdocument/mesh/features/defenses/fabric fingerprintがすべて一致した。
- Nobra・Obernの固定入力を回帰テストに追加。低層住宅の初期fabricが1回、面積補正なし、住宅不足0、住宅を含む建物の水面重複0、入力の測量河川の保持を確認した。Obernは生成recipeから再生成してfingerprint一致も確認した。
- Prestad・Nobra・Obernの変更前後SVGを、CEの実際のスタイルを付けてChromiumで描画し目視確認した。Obernでは陸側の市街地が増え、水辺の港も残る。
- Badenは必要1,860戸に対し容量1,788戸、Falldalderは必要1,993戸に対し容量1,948戸。この不足は変更前と同じで、既存の都市枠による面積拡大上限に達している。
- Nobraの外部道路接続診断は変更前後とも1件未接続。今回も同じ門接続不成立による2候補の破棄が残る。生成を成功扱いにするためにこの診断を消してはいない。
- Cerdosなどには住宅容量の余剰が残る。今回の面積見積もりは初期値であり、全都市で容量を人口と厳密に一致させるものではない。

次に進める作業は、Nobraの二重城壁と門の内向き道路を同時に計画して残る破棄候補をなくすこと。その後、Baden・Falldalderの市街地枠を陸側へ拡張する方法を検討する。

## 検証

変更箇所に関連するVitestをファイル指定で実行。以下11ファイル・66テストが通過した。全件テスト・全件E2E・追加シードの走査は実施していない。

- `classifyUrban.test.ts`、`generation/heightArea.test.ts`、`generation/pipeline.test.ts`
- `generation/planning/landBudget.test.ts`、`nidyiaWaterfront.test.ts`
- `ruralFields.test.ts`、`regionalRoadGates.test.ts`、`roadEndpoints.test.ts`
- `fmgHandoffGeneration.test.ts`、`generate.gothengsfeld.test.ts`、`waterGeometry.test.ts`

`generation/generateCity.test.ts` の1件は既存不整合により失敗。生成前処理が付与する `buildingHeightPolicy` を含む入力と、付与前入力のJSON完全一致を要求する45行目。変更対象の本番ソースをHEADへ戻した状態でも同じ失敗を確認した。テストや本番コードをこの性能改善と無関係な内容で変更していない。

変更TSファイルのBiome検査、`npx tsc --noEmit --pretty false`、`git diff --check` は成功。

## 再計測と保存物

Node v22.23.1、cold worker、`--jobs 1`相当、同一入力を2回。時間はCEの生成処理のみ。FMG読込・descriptor作成・worker起動・SVG描画時間は含めない。開発環境の参考計測であり、OS負荷やJITの影響を含む。処理回数の減少と合わせて評価する。

```sh
node --import tsx scripts/benchmarkFmgCities.mjs \
  docs/analytics/ce-waterfront-generation-20261027.inputs.csv \
  docs/analytics/raw/ce-waterfront-generation-20261027/recheck.jsonl \
  --repeat 2
npm run ce:perf:csv -- \
  docs/analytics/raw/ce-waterfront-generation-20261027/recheck.jsonl \
  docs/analytics/raw/ce-waterfront-generation-20261027/recheck.csv
```

SVGも比較する場合は `--svg-dir docs/analytics/raw/ce-waterfront-generation-20261027/recheck-svg` を付ける。前後比較では両側に同じ指定を付けた。

- [固定20入力](ce-waterfront-generation-20261027.inputs.csv): 元のshare payloadを保持し、CE生成に使わないFMG側の既計測timing欄のみ省略。
- [都市別比較](ce-waterfront-generation-20261027.comparison.csv): 時間、構築回数、破棄数、住宅容量、道路診断、再現性。
- [全量出力のSHA-256一覧](ce-waterfront-generation-20261027.sha256.csv): 前後JSONL・meta・SVG80件・CPUプロファイル・比較PNGを含む89ファイル。
- 全量出力はGit管理外の `docs/analytics/raw/ce-waterfront-generation-20261027/`。約406 MB。変更前JSONLのObern2行は元の本番コードで再計測したものを収録し、対応metaを `before-obern.meta.json` に保持する。

| 入力・出力 | SHA-256 |
| --- | --- |
| 元FMG | `9a3470236d160b44cab5e94e68ffd02e40726c08743d708f79fd6242bfedd5e6` |
| 固定入力CSV | `4ae6b268affe130f5603be65f5167b5a014324444073d368062b6439942b1be9` |
| 変更前JSONL | `26828a74c92174f7d04a04999cf7bfa4829bd2d6bfcef3d041b7d52bdec49339` |
| 変更後JSONL | `0e35d99970e46325adca2ad4a16d648e0c2e6a0d47b7147298fbe0bdcf18092f` |

## 河口形状の追加修正

2026-10-27、Nobraの水際城壁と橋から市街地への接続を追加修正した。門接続による候補破棄と外部道路の未接続は0件になった。追加修正後の形状・性能・次の課題は[河口都市の修正記録](ce-estuary-approaches-20261027.md)を参照。上の計測値は追加修正前の記録として保持する。
