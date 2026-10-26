# Vegides (Burg 230) 城配置失敗の調査

調査日: 2026-10-27

## 結論

城の外側配置の探索が、市街地に直接隣接するセルだけに限定されているため、有効な城用地を探索から除外している。Vegidesではその範囲で城の形状・設置条件を通過した候補がすべて道路進入帯との離隔条件 C1 に抵触する。城の縮小と8回の再試行でも探索範囲が広がらず、`castle-no-site` → `all-attempts-rejected` になる。

探索範囲だけを診断実行中に拡張すると、城の要求も道路制約も維持したまま1回目で都市生成に成功した。土地自体が不足していると断定する失敗ではなく、探索範囲の不足である。原因調査時点では製品ソース・セーブデータは変更していない。後続の修正内容は末尾に記載する。

## 対象と入力

- セーブ: `temp/000.savdata/Nidyia_2026-10-26-13-17.fmg`
- セーブ SHA-256: `9a3470236d160b44cab5e94e68ffd02e40726c08743d708f79fd6242bfedd5e6`
- Burg: 230 / Vegides、seed: `6851550440230`
- 既存 `temp/000-perf.jsonl`: 435都市中434都市が `generated`、Vegidesのみ `rejected`
- 人口112、住宅目標25、都市半径40 m、描画範囲390 m、集落範囲300 m
- evolution グリッド46面、市街地7面、block size 27 m
- descriptor: `burg.citadel=true`、`burg.walls=false`、河川なし
- 進入道路4方向: 約44.8°、104.4°、176.0°、324.1°
- 進入帯の半幅: 13.5 m

shareの `settings.config.features.citadel` はfalseだが、FMGからの生成はdescriptorの城要求を使用するため、`descriptor.burg.citadel=true` により城配置が実行される。城要求を無視した診断と混同しないこと。

## 失敗経路

1. `src/city-editor/generators/castlePlacement.ts:266` は小規模・無城壁都市で外側配置を先に試す。
2. 同ファイル415行の `!urban.has(face.id) && border.has(face.id)` により、外側配置でも候補の開始セルは市街地に直接隣接するセルに限定される。
3. 城サイズはsmallからtinyへ縮小できるが、候補位置の移動はセルの重心から都市中心へ向かう方向のみ（505–512行）。遠いセルや任意の横方向の候補を探索する処理ではない。
4. 最初の試行の診断では、道路判定に到達した52候補すべてがC1で棄却された。内訳は `C1=52 C2=0 C3=0 C4=0`。C1は城の輪郭と進入帯の中心線の距離を判定する（`approachCorridors.ts:414`）。C2以降はC1で早期returnするため、0という値は他条件の適合を意味しない。
5. `generation/generateCity.ts:698` は城配置失敗時に都市候補全体を棄却する。
6. 同ファイル531行以降の再試行は `castleOutward=true` / `castleStreetLinks=true` を指定するが、直接隣接セルという制限は変わらない。8試行とも同じ `C1=52` で失敗した。

## 検証

全都市の再計測は行わず、Vegidesだけを使用した。

| 条件 | 結果 |
| --- | --- |
| 既存入力CSVからBurg 230のみ再計測 | 8試行すべて城配置失敗、`rejected`、生成約2.12秒 |
| 元のFMGからBurg 230のみ入力を再作成・計測 | 8試行すべて城配置失敗、`rejected`、生成約2.38秒 |
| 診断用入力コピーで `descriptor.burg.citadel=false` | 1試行で `generated` |
| 城要求を維持し、外側配置だけ非市街地セル全体へ候補を拡張 | 1試行で `generated`、smallのdetached城を採用 |

最後の実験はViteの診断用transformで、実行時だけ候補フィルタを以下に差し替えた。製品ファイルは編集していない。

```ts
if (relationship === "integrated" || outward)
  return !urban.has(face.id) && (outward || border.has(face.id));
```

C1–C4の判定、城の設置処理、最終都市の検証処理は変更していない。採用された城輪郭の頂点平均はローカル座標約 `(-110.47, 30.92)` m。生成後のqualityは `crossingIssues=0`、`overSkewedBridges=0`、`targetDwellings=25`、`drawnHousing=79`。探索範囲を拡張すれば城付きで完了できることの確認であり、この広い候補探索をそのまま製品修正として推奨するものではない。

再現コマンド:

```sh
node --import tsx scripts/benchmarkFmgCities.mjs temp/000.savdata/Nidyia_2026-10-26-13-17.fmg temp/vegides-archive-investigation.jsonl --burg 230
```

ベンチマークは既存出力への上書きを拒否するため、再実行時は別の出力名を使用する。

診断スクリプトと観測出力はGit管理外の `temp/vegides-*` に保存した。大容量の全量観測は作成していない。原因調査時点では製品コード変更がないためVitestは実行していない。

## 修正内容

ユーザーの修正依頼に基づき、`castlePlacement.ts` に第二近傍の探索フォールバックを追加した。

- 従来の外側・内側、縮小、緩和の全パスが失敗してから追加探索する。従来成功する配置の探索順は変更しない。
- 道路制約付きの外側配置に限り、直接隣接セルからさらに1セル外側までを追加候補とする。
- 追加候補セルの重心と市街地境界の距離は `2 × max(blockSizeMeters, sqrt(castleTargetArea))` 以下に制限する。Vegidesのsmall城では約126.5 mが上限。
- 追加探索ではdetached城のみを許可する。明示的なcentral/integrated指定には追加探索を適用しない。
- C1–C4、城形状、道路接続、最終検証の条件は緩めない。
- セーブデータは変更していない。

固定入力 `src/city-editor/data/fixtures/vegides-20261026.json` と回帰テスト `vegidesCastle.test.ts` を追加した。修正前に同テストが `castle-no-site` で失敗することを確認し、修正後は城付きで完了し、生成道路が城の離隔を守ることを検証した。

関連テストはVegides、Aute、Breistattlin、castleGeneration、castleRoadClearanceの5ファイル・17件が成功。追加探索をdetachedに限定する最終調整後は、影響するVegides、Breistattlin、castleGenerationの3ファイルを再確認した。Biomeも変更TSファイル2件で成功。

元FMGを使った単都市ベンチマークでも `generated`、1試行、生成約698 msを確認した（`temp/vegides-fixed.jsonl`）。`crossingIssues=0`、`overSkewedBridges=0`。全都市ベンチマークは実行していない。

