# 中世ヨーロッパ都市ランダム生成 v2 — 計画書・指示書

本フォルダは、現実・史実の中世ヨーロッパ都市（アーバン・モルフォロジー）に忠実な街並みをランダム生成する Web アプリケーションを **構築** するための計画書・指示書一式である。

実装者（AI エージェントを想定）は、コードを書き始める前に必ず本 README と対象マイルストーンに関連する仕様書を読むこと。

## 史実スコープ（必読）

- **既定の生成対象**は、おおむね **北西ヨーロッパの城壁市**における、13–15 世紀的な完成形の形態である（狭い間口の短冊敷地・門–市場動線・壁内外の密度断絶など）。
- これは「全中世ヨーロッパの平均」ではなく、**実装可能で説得力のある制約付きモデル**である。地中海中庭型・低地運河都市・ローマ格子残存型などは **地域様式プリセット** として拡張する（[15-region-presets.md](15-region-presets.md)）。
- 史実との対応・妥当性・ギャップの詳細は [14-historical-morphology-review.md](14-historical-morphology-review.md) を参照。計画と矛盾する場合の優先順位: **01 の禁止事項 > 番号付き仕様（02–13, 15–17）> 14 の勧告 > 背景資料（docs/*.md）**。村落形態については **17 が 16 の形態層（K22）を supersede**し、予算・envelope・V1–V7 数値は 16 を正本とする。

## 文書一覧と読む順序

| # | 文書 | 内容 | 種別 |
|---|------|------|------|
| — | [README.md](README.md) | 本書。索引・用語集・スコープ | 索引 |
| 01 | [01-goals.md](01-goals.md) | 背景・現行実装の問題点・目的・設計原則・禁止事項 | 計画 |
| 02 | [02-architecture.md](02-architecture.md) | 技術スタック・モジュール構成・データモデル・決定論 | 設計 |
| 03 | [03-pipeline.md](03-pipeline.md) | 生成パイプライン全体像（ステージ・入出力・不変条件） | 設計 |
| 04 | [04-terrain.md](04-terrain.md) | 地形・河川・立地アーキタイプ | 仕様 |
| 05 | [05-roads.md](05-roads.md) | 道路網生成（幹線・街路・路地） | 仕様 |
| 06 | [06-walls.md](06-walls.md) | 城壁・城門・城壁外（郊外・耕地） | 仕様 |
| 07 | [07-blocks-lots.md](07-blocks-lots.md) | 街区抽出・バーゲージ・プロット分割 | 仕様 |
| 08 | [08-buildings.md](08-buildings.md) | 建物フットプリント・屋根・例外形状 | 仕様 |
| 09 | [09-districts-facilities.md](09-districts-facilities.md) | 地区（土地利用）・施設・ランドマーク配置 | 仕様 |
| 10 | [10-rendering-ui.md](10-rendering-ui.md) | deck.gl 描画・デバッグ表示・UI・エクスポート | 仕様 |
| 11 | [11-validation.md](11-validation.md) | 構造妥当性メトリクス・テスト戦略 | 仕様 |
| 12 | [12-roadmap.md](12-roadmap.md) | マイルストーン・受け入れ基準・実装者への作業指示 | 指示 |
| 13 | [13-fmg-site-input.md](13-fmg-site-input.md) | FMG 立地入力（Burg Site Descriptor）契約・site モード | 仕様 |
| 14 | [14-historical-morphology-review.md](14-historical-morphology-review.md) | 史実・都市形態学レビュー（計画の妥当性評価） | レビュー |
| 15 | [15-region-presets.md](15-region-presets.md) | 地域様式プリセット（地中海中庭・運河都市等）の拡張計画 | 計画 |
| 16 | [16-compact-village.md](16-compact-village.md) | コンパクト先駆村落（pop 10–100 Phase A）・連続人口スケール方針・M10 具体化・予算/envelope | 設計 |
| 17 | [17-village-morphology-v2.md](17-village-morphology-v2.md) | Village Morphology v2: roads-first・形態カタログ・frontage 件数保証（16 K22 を置換） | 設計 |
| 18 | [18-village-lab.md](18-village-lab.md) | Village Lab: SVG 先行の形態検証・one generator two renderers | 設計 |
| 19 | [19-block-accretion-village.md](19-block-accretion-village.md) | 街区連鎖: 街区→家→道（Lab 主経路。17 有機 roads-first を supersede 実験） | 設計 |

## 本計画書の位置づけ

- `docs/spec.md`・`docs/current.md`・`docs/bottom-up.md`・`docs/algorithm.md` は本計画書の **背景資料** である。本フォルダの記述と矛盾する場合、本フォルダが優先する。
- 現行の `src/generation/` 実装は本計画に基づき **置き換える**。再利用・破棄の方針は [02-architecture.md](02-architecture.md) を参照。
- 実装の進め方（マイルストーン順序・受け入れ基準・作業ループ）は [12-roadmap.md](12-roadmap.md) に従う。**受け入れ基準を満たすまで次のマイルストーンに進んではならない。**
- 地域様式の追加実装は v2 コア（M0–M10）完了後、[15-region-presets.md](15-region-presets.md) の M11–M16 に従う。

## 用語集

| 用語 | 意味 |
|------|------|
| アーバン・モルフォロジー | 都市形態学。街路・街区・敷地・建物のパターンとその成因の分析 |
| バーゲージ・プロット (burgage plot) | 通りに狭い間口で面し、奥へ細長く伸びる短冊状の敷地。中世都市の敷地割の基本単位（英法制名。形態は汎ヨーロッパ的） |
| フロンテージ (frontage) | 敷地・建物が道路に接する間口。中世では課税・商業価値の基準 |
| 街区 (block) | 道路に囲まれた閉領域。凹多角形も普通に存在する |
| 敷地 (lot) | 街区を分割した一区画。原則すべて道路に面する |
| 幹線 (artery) | 城門・広場・橋を結ぶ主要道路。連続した緩いカーブを描く |
| 路地 (alley) | 街区内部に入り込む細い道。行き止まりも多い |
| T字路支配 | 有機的に成長した町では十字路より三叉路（T字路）が圧倒的に多いという形態的特徴 |
| バスティード (bastide) | 中世の計画都市。直交グリッドと中央市場広場を持つ |
| プレシンクト (precinct) | 教会・城・修道院などが占有する専用敷地。道路はこれを迂回する |
| 平面グラフ (planar graph) | 交差点で必ずノード化された道路網のグラフ表現。街区は面（face）として抽出する |
| 決定論 | 同一シード・同一パラメータから常に同一の都市が生成されること |
| regionPreset | 地域・形態様式の切替（北西短冊／地中海中庭／運河都市など）。[15](15-region-presets.md) |
| 中庭型 (courtyard / patio) | 間口広め・奥行浅め・敷地内に中庭を持つ地中海的住居形態 |
| 運河都市 (canal city) | 水路が骨格となり、道路と橋で縫合される低地商業都市形態 |
| Conzen 三層 | 町プランを street system / plot pattern / building fabric に分ける分析枠 |

## スケールの約束

- **1 シーン単位 = 1 メートル** とする。すべての仕様の数値（道幅・敷地間口・塔の間隔など）はメートルで記述されている。
- 都市規模プリセット（城壁内面積の目安）: 小都市 ≈ 15 ha（半径 ~220 m）、中都市 ≈ 40 ha（半径 ~360 m）、大都市 ≈ 100 ha（半径 ~560 m）。アプリ内の「大」であり、中世最大都市の城壁内面積そのものではない。
