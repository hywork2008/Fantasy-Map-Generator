# BV複合モデル P3：Inns

2026-11-01。[設計書](../plan/bv-composite-models.md)のP3のうちMedieval 12の2モデルに対応した。

## 部品と構成

Roadside inn with stable courtとCourtyard hostelryのLow／Highを独立factoryへ分割した。従来の`createHighInn`と`InnKind`の公開入口、モデルID・variant ID・作者・品質登録を維持する。Lowの大型宿のgroup名`courtyard-inn`も登録factoryでは維持する。

街道宿は6部品、中庭宿は8部品で、両品質とも同じ役割を持つ。

| 部品 | 境界 |
| --- | --- |
| lodging | 宿泊棟の壁・開口・階・屋根・煙突 |
| courtyard | 中庭の舗装とHighの浅い目地 |
| stable | 厩舎の床・柱・仕切り・飼葉設備・屋根。支持物と上部をまとめる |
| service-wing | 中庭宿にあるサービス棟。両側の壁と床・屋根を含む |
| yard-furniture | 卓・ベンチ・足・支持材、Highの卓上の食器。取り外す際は一緒に除外 |
| barrel | 独立した樽。Lowは既存の共通容器factoryを使い、依存元も記録 |
| sign | 看板の腕木・吊り金具・板・図柄。宿泊棟に取り付く位置を維持 |
| gate | 中庭宿の入口両側の柵とHighの門柱。中央の通路を維持 |

BVの`Composition`に次を追加した。

- **Standard inn**：元の全体構成。
- **Without yard furniture**：卓・ベンチ・食器と樽を生成しない。宿泊棟・厩舎・サービス棟等は維持する。
- **Lodging and courtyard**：宿泊棟・中庭・看板と、大型宿の門。厩舎・サービス棟・中庭家具・樽を除外する。

看板は全プリセットで宿泊棟と共存する。サービス棟を外しても宿泊棟の外殻と開口は残る。各部品は`View`から単体表示でき、元の全体配置を保持する。独立生成・資源所有・High結合後の台帳と部品範囲は既存の仕組みを使用する。CEの自動配置と保存形式は変更しない。

## 形状と負荷

| モデル | 品質 | 標準の三角形 / メッシュ | 中庭家具なしの三角形 | 宿泊棟と中庭の三角形 |
| --- | --- | ---: | ---: | ---: |
| Roadside | Low | 6,270 / 121 | 1,198 | 954 |
| Roadside | High | 40,856 / 10 | 29,388 | 21,168 |
| Courtyard | Low | 7,056 / 163 | 1,984 | 1,386 |
| Courtyard | High | 57,608 / 10 | 44,808 | 28,908 |

標準4ケースの分割前後で、材質RGB・sideとワールド三角形頂点（小数5桁）のソート済みSHA-256が一致した。三角形数・描画メッシュ数も維持する。法線・資源ID・材質bucketの並びはハッシュ対象外。基準値は[計測JSON](bv-inn-parts-p3-20261101.json)に保存した。

Lowの部品別資源所有によりユニーク数は増える。Roadsideはgeometry 36→40・材質12→20、Courtyardは45→51・12→28。Highは同じ設定の材質を統合し、最終材質数10を両モデルで維持する。GPU FPS・ピークメモリの改善を示す測定ではない。

付属樽はLowでも4,940三角形、Highは10,136。対してLowの宿泊棟は630、厩舎は244三角形。Low標準の大半を単独展示用の共通容器が占めている。今回は標準形状を保つため置き換えていないが、井戸に続く付属物の軽量化候補である。Highの厩舎は8,220三角形で、単体でも床・仕切り・支持・屋根を保持する。

このJSONは部品化時点の記録。後続の[共有樽への置き換え](bv-inn-shared-barrel-20261101.md)でHighの樽を意図的に変更し、`scripts/profileInnParts.mts`のHigh基準値と出力既定名を更新した。Lowの基準値は同じである。

## 検証

関連4ファイル、計20件成功。

- `npx vitest run src/buildings/medieval/innParts.test.ts src/buildings/medieval/smithyAndInnDetails.test.ts src/buildings/compactModel.test.ts src/city3d/adoption.test.ts`：既存3ファイル16件成功。新規の通路検査は既存敷居の上端0.30 mを避けるよう検査高さを修正し、以下で対象のみ再実行。
- `npx vitest run src/buildings/medieval/innParts.test.ts`：4件成功。
- 全構成の部品・品質・台帳総数と、Highの結合後の頂点範囲を照合。
- Highの入口中心線を敷居より上の0.4／0.8／1.4／1.9 mで検査し、サービス棟の中庭側開口も確認。Lowの既存の簡略形状は変更していない。
- 厩舎単体の接地、開いた馬房入口、固い背面、上向きの屋根をレイで検査。既存の寸法・投影・資源解放・CE採用も成功。
- 変更した部品・登録・テスト5ファイルのBiome checkと`git diff --check`も成功。

実BVで2モデル×2品質×3構成を巡回し、厩舎単体のHigh→Lowと全体へ戻す操作を確認した。全体の比較値が単体・別構成の値で上書きされず、Node計測と一致することも確認した。CEの対話操作・GPU FPSは今回測定していない。

- [Courtyard High・厩舎単体](bv-inn-stable-p3-20261101.png)
- [Courtyard High・宿泊棟と中庭](bv-inn-lodging-court-p3-20261101.png)
- [Courtyard High・標準へ戻した表示](bv-inn-standard-p3-20261101.png)

部品化後の指摘により、Highの専用樽を削除してStorage propsの閉じた樽に共通化した。上表は変更前の値で、変更後の値は[共有樽の修正記録](bv-inn-shared-barrel-20261101.md)を参照。後続の[Breweries部品化](bv-brewery-parts-p3-20261101.md)も完了し、次はP4 Friary Highへ進む。
