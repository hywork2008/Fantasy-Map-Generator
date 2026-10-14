# 骨格先行生成 Phase S4: 稜堡式外壁

実施日: 2026-10-14
対象: [設計書](../plan/skeleton-first-generation.md) Phase S4 の1項目目（`bastioned` と時代規則）
前段: [S3記録](1014-skeleton-first-s3.md)

## 1. 実装

- `WallShape` に `bastioned` を追加した。保存codec・共有リンク・fabric planの許可リストも更新した。
- K3（`skeleton/wallShapes.ts`）: `bastionedPolygon` が正N角形の各頂点に稜堡を1つ付ける。1稜堡は5頂点で、肩（幕壁上、頂点から辺長の18〜24%）、側面（辺長の6〜9%）、稜角（頂点の放射方向へ辺長の20〜26%）からなる。半月堡は扱わない。辺数は `wallSides`（未指定は5〜8）。
- 時代規則: `bastionEra(period)` は `ageOfExploration` 以降を真とする。未指定の時代は文書の既定と同じ `ageOfExploration` とみなす。
  - `auto` は時代内に限り `bastioned` を候補に加える。時代外では候補とRNGの消費がS3と同じ。
  - 時代外で `bastioned` を明示した要求は `unsupported-skeleton-settings` で拒否する。別の形に置き換えない。
  - 生成パネルでは時代外のとき選択肢を無効にし、理由をツールチップに示す。辺数欄は多角形と稜堡式で表示する。
- K4（`crossings.ts`）: `SkeletonWall.curtainMidpoints` に各幕壁の中点を記録する。合成街道の門は、使える中で最も近い幕壁中点へ寄せる（§4.4）。FMGの固定街道は入力なので門を動かさない。

## 2. 計測で判明した問題と修正

初回の実装では、側面を幕壁に直角に出していた。この形は核から見た角度が肩で逆行する（星形ではない）。`placeRing` が水に対して放射方向に頂点を引き込むと、輪が折り返して自己交差した。単独生成の比較セットで `wall-shape-invalid`（ring is not a simple polygon）が313件発生した。

側面を放射方向から稜角側へわずかに傾け、核から見た角度が単調に増える形に変えた。修正後の骨格だけの計測では、`wall-shape-invalid` は0件になった。K5の判定は緩めていない。

水際で放射方向に切り詰められると、稜堡は潰れて通常の壁になる。これは他の形と同じ規則で、硬い水を越えないための意図した挙動である。

## 3. 比較結果（`wallShape: "bastioned"` 固定）

S0・S3と同じ単独12条件×12 seedと、Triviersの96都市で計測した。時刻はローカル参考値。

### 単独生成

| 指標 | mesh-first（S0） | skeleton-first S3（形は自動） | **bastioned** |
| --- | ---: | ---: | ---: |
| 成功 | 139 / 144 | 143 / 144 | **143 / 144** |
| 例外 | 0 | 0 | 0 |
| 検証・再読込失敗 | — | 0 | 0 |
| 外側の試行枠の総数 | 234 | 206 | 213 |
| 完了時間 中央値 ms | 1,600 | 707 | 517 |
| p95 / 最大 ms | 7,601 / 11,250 | 2,502 / 3,694 | 2,001 / 4,730 |

失敗は `tiny-evolution-cape` の `ce-s0-20261014:2`（最終の不採用は `urban-area-too-small`）。岬の狭い陸地で、外壁の形とは別の都市面積の問題である。骨格の却下は橋の斜角108、壁と川の平行87、内側から門へ到達不能22など。後段の却下は都市面積不足57、交差不正5。修復処理による制約・featureGroupの変更は0件。

### FMG連携

| 指標（v1対象86都市） | mesh-first（S0） | skeleton-first S3 | **bastioned** |
| --- | ---: | ---: | ---: |
| 成功 | 86 / 86 | 86 / 86 | **86 / 86** |
| 検証・再読込失敗 | — | 0 | 0 |
| 完了時間 中央値 ms | 454 | 839 | 621 |
| p95 / 最大 ms | 2,904 / 3,868 | 45,621 / 175,365 | 34,490 / 130,292 |

城あり10都市はS3と同じく `castle` を理由に対象外とした。Triviersの対象都市は全て時代規則を満たした。FMGの遅い都市の課題はS3から変わらない。

## 4. 互換性

- 方法未指定・mesh-firstの経路は変更していない。
- 時代内で `wallShape: "auto"` を保存した骨格先行recipeは、候補が増えたため再生結果が変わる。S3は同日にこのブランチで入ったもので、未リリースの文書だけが該当する。

## 5. 検証

- 骨格のテストに、時代規則・稜堡の頂点数・幕壁中点の門の2件を追加した。統合テストに稜堡式の完成都市（生成・検証・再読込）と時代外の拒否を追加した。
- `npx vitest run src/city-editor/generators/generation src/city-editor/components src/city-editor/services/io src/city-editor/generators/fabricDistricts`: 24ファイル198件成功。
- `npx tsc --noEmit`、変更ファイルの `biome check`、`scripts/lint-architecture.ts` はclean。

## 6. 再現手順

```sh
node --import tsx scripts/city-editor/skeleton/skeletonLab.ts \
  --out temp/s4/standalone-bastioned.jsonl --seeds 12 --complete \
  --settings '{"generationMethod":"skeleton-first","wallShape":"bastioned"}' --svg none
node --import tsx scripts/city-editor/skeleton/skeletonLab.ts \
  --out temp/s4/fmg-bastioned.jsonl --csv temp/s0/triviers-inputs.csv \
  --burg "$(cat temp/s0/sample-ids.txt)" --complete \
  --settings '{"generationMethod":"skeleton-first","wallShape":"bastioned"}' --svg none
```
