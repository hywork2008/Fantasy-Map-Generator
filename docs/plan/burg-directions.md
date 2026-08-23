# 都市間ルート案内ダイアログ（Directions）

右クリックの「Distance to/from here」を、都市（burg）の上で行った場合に「Distance to/from {都市名}」に変え、
直線距離ではなく道・海路網に沿った実際の移動距離・標高・所要時間を、徒歩・馬車・船の各移動手段ごとに
Google Maps の Directions のようなダイアログで表示する。

関連:

- 既存の Ruler / RouteOpisometer: `src/controllers/measurers.ts`
- 右クリックメニュー: `src/controllers/mapContextMenu.ts`, `src/ui/components/MapContextMenu.tsx`, `src/store/mapContextMenuState.ts`
- 陸路・海路のグラフ探索: `src/generators/landRouteGraph.ts`, `src/generators/seaRouteGraph.ts`
- 勾配・標高・移動速度: `src/services/routeGrade.ts`（Phase 1〜3 実装済み。本機能はここを再利用するのみで変更なし）
- 標高プロファイル描画: `src/renderers/elevation-profile-renderer.ts`, `src/controllers/elevation-profile.ts`
- 参考（経済拡張側の同種実装）: `src/extensions/economy/generators/trade-animation.ts`（混在陸海川 Dijkstra）,
  `src/extensions/nobility/controllers/playerCharacterTravel.ts`（burg間移動見積もり）

**実装状況**: 完了（2026-08-23）。

---

## 0. 確定した方針

| 項目 | 決定 |
| :--- | :--- |
| 発動条件 | 「from」「to」双方が都市（burg）の場合のみ、専用ダイアログを開く。片方でも都市でなければ従来通り直線 Ruler |
| 依存範囲 | economy 拡張（TradeAnimation / CaravanMovement）には依存しない、完全に core 実装。economy が無効でも動作する |
| 経路探索 | 徒歩・馬車は `landRouteGraph`（roads/trails）、船は `seaRouteGraph`（searoutes）をそれぞれ独立に探索。手段をまたいだ混在ルート（陸→港→海）は今回のスコープ外 |
| 複数ルート候補 | 「平面最短」と「勾配考慮の低コスト（landEdgeEffortCost）」の2通りを Dijkstra で求め、同一経路になれば1本（Recommended）、異なれば2本（Shortest / Easier）を提示。k-shortest-paths のような一般的な複数経路探索は行わない |
| 移動速度 | 徒歩 28 km/day・馬車 32 km/day・船 60 km/day を本モジュール内にローカル定数として定義（economy の `CaravanMovement` 既定値と数値は合わせるが、参照はしない） |
| 所要時間の表示 | シミュレーション日単位（切り上げ）ではなく、連続値を日/時間/分に分解して表示（情報表示のみで tick 進行とは無関係なため） |
| 地図上の表示 | 選択中のルートを `view.ruler` レイヤーにハイライト線として描画し、ダイアログを閉じると消える |
| burg のヒット判定 | `findCell` + `pack.cells.burg` によるセル判定ではなく、クリック地点に最も近い burg 座標を画面ピクセル半径で直接判定（burg 座標が自セルの重心から外れることがあるため。詳細はコード内コメント参照） |

---

## 1. 新規ファイル

- `src/services/travelDirections.ts` — 経路・距離・所要時間・標高プロファイルの計算（core、拡張非依存）
- `src/services/travelDirections.test.ts` — 上記のユニットテスト
- `src/store/directionsDialogState.ts` — ダイアログのペイロード用 zustand ストア
- `src/ui/dialogs/DirectionsDialog.tsx` — モードタブ + ルート選択 + 標高チャートを表示するダイアログ
- `src/ui/dialogs/directionsDialog.css`
- `tests/e2e/directions-dialog.spec.ts` — 実地図での右クリック→ダイアログ表示の E2E

## 2. 変更ファイル

- `src/store/mapContextMenuState.ts` — 右クリック地点の burg 解決結果を保持するフィールドを追加
- `src/controllers/mapContextMenu.ts` — burg 判定、burg-to-burg 時に Directions ダイアログを開く分岐
- `src/ui/components/MapContextMenu.tsx` — メニュー文言を burg 名入りに
- `src/ui/dialogs/DialogsContainer.tsx` — `<DirectionsDialog />` を登録
- `src/controllers/elevation-profile.ts` — チャート用データ構築ロジックを `buildElevationChartData` として抽出（Directions ダイアログと共用するため）
- `src/i18n/locales/{en,ja}.json` — `mapContextMenu.distanceFrom/ToBurg`、`dialogs.titles.directions`、`directions.*`
- `tests/e2e/helpers/fmg-helpers.ts` — `findConnectedBurgPair` ヘルパーを追加

## 3. 今回やらないこと（スコープ外）

- 徒歩→港→船のような複数手段にまたがる一本のルート（economy 拡張の TradeAnimation は対応しているが、今回は流用しない設計）
- 一般的な k-shortest-paths による多数のルート候補提示（Google Maps のような3本以上の代替案は、地形上「平面最短」と「勾配考慮」が異なる場合の最大2本まで）
- economy 拡張が有効な場合に、そのユーザー設定速度（CaravanMovement）を反映すること（将来 `burgEconomyExtensions.ts` と同様のフック方式で拡張可能）
