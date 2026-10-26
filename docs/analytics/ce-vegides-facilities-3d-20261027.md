# Vegides の施設をBVモデルで3D表示する対応

実施日: 2026-10-27

## 対応内容

CEの `cityView` は住宅・城壁・寺院・井戸などを描画していたが、`fabric.aerialLandmarks` の風車・宿泊施設・各ヤードを3Dへ渡していなかった。保存された施設計画を読む `createTownFacilities` を追加し、BVと共有するモデルを配置するよう接続した。

| 施設 | 使用するモデル |
| --- | --- |
| 柱式・塔式風車 | 既存の `postMill` / `towerMill`。保存された向き・羽根角・羽根長を反映 |
| 家畜市 | 既存の `livestock-market-pens` |
| 材木置場 | 既存の詳細な `medievalLumberYard` |
| 石材置場・燃料置場・穀倉・倉庫 | 対応する既存のBVモデル |
| ギルド会館・作業ヤード・皮なめし場・絞首台・岸壁倉庫（中庭式以外） | 対応する既存のBVモデル |
| 隊商宿・街道宿 | 新しい寸法指定式の中庭宿泊施設。外周・中庭の保存寸法に合わせる |
| 星型城塞の建物 | 新しい寸法指定式の兵舎・司令施設・作業施設。保存された建物を詳細形状に置換 |
| 星型都市要塞の兵舎・火薬庫 | 新しい兵舎・火薬庫モデル |
| 星型城塞の砲台・水盤 | 既存の野砲・水盤モデル |
| 星型城塞の前門 | 新しい稜堡式前門モデル。保存された入口・後方接続を開ける |

新規モデルは `src/buildings/facilities/siteFacilities.ts` に実装し、BVの `Medieval 46 · Citadel And Lodging` に7種類を登録した。兵舎・司令施設・作業施設・火薬庫・前門・隊商宿・街道宿を閲覧できる。BVの説明欄に必要な参照登録も追加した。

宿は乾燥地域では泥煉瓦・陸屋根、その他では漆喰壁・傾斜屋根を使う。建物の入口を中庭側に向け、外部から中庭へ通る入口を実際の空間として確保する。Highでは開口部・木組み・石積み・屋根の細部を追加し、Lowは細部を省く。

施設レイヤーは再描画・画質変更・削除・3D終了時の更新とリソース解放に対応し、施設をクリックして名前と形状を確認できる。詳細モデルに置き換わった要塞建物だけ元の簡易形状を除外する。

## 検証

固定入力は `src/city-editor/data/fixtures/vegides-20261026.json`。元の固定入力には宿等のEconomy情報がないため、そのままでは風車のみが配置される。診断用の再生成結果に以下を指定し、2Dと同じ生成処理が作る施設計画を3Dで確認した。元のFMGや保存済み都市は変更していない。

- `facilityCounts`: `inn=1`、`caravanserai=1`、`livestockPen=1`、`timberYard=1`
- 道路の記録交通量: `traffic=24`、`trafficRank=1`

この条件で隊商宿1、街道宿1、家畜市1、材木置場1、風車1の計画が生成され、すべて3Dへ配置されることを確認した。要塞の建物3棟、実在する稜堡上の砲台6、水盤1、前門1も描画する。城塞の塔の適合処理で除外された地点の砲台は配置しない。

### 自動検証

- 新規BVモデルの契約テスト: 7種類 × 2件 = 14件成功（`MEDIEVAL_MODEL_TASK=46` で限定実行）。寸法、接地、有限座標、図面、所有リソースの解放を検証。
- `facilityMeshes.test.ts`: 2件成功。実際のVegidesの施設計画からの配置、要塞建物の置換、プロトタイプの共有・解放、回転した宿の中庭と入口が塞がれないこと、起伏上の接地を検証。
- `bvInstances.test.ts` と `cityViewRendering.test.ts`: 計10件成功。既存の均等縮尺・選択・3D再表示やカメラ操作を確認。
- `wikipedia.test.ts`: 2件成功。追加したBVモデルの説明欄の参照を確認。
- 関連テスト計28件成功。全件テストは未実行。
- `npx tsc --noEmit --pretty false`: 成功。
- 変更TSファイルのBiomeと `git diff --check`: 成功。

### ブラウザー確認

BVで新しい兵舎・隊商宿・街道宿・前門を表示し、説明欄を含め描画エラーなし。CEの `mountCity3d` へ診断用Vegidesを渡し、`quality=high`、住宅114棟と施設群の描画、ブラウザーエラーなしを確認した。

画像と診断スクリプトはGit管理外に保存:

- `temp/vegides-facilities-ce.png`
- `temp/facilities-bv-barracks.png`
- `temp/facilities-bv-caravanserai.png`
- `temp/facilities-bv-inn.png`
- `temp/facilities-bv-ravelin.png`
- `temp/check-facilities-ce.mjs`
- `temp/check-facilities-bv.mjs`
