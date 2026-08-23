# 都市間ルート案内ダイアログ（Directions）

右クリックの「Distance to/from here」を、都市（burg）の上で行った場合に「Distance to/from {都市名}」に変え、
直線距離ではなく道・海路網に沿った実際の移動距離・標高・所要時間を、徒歩・騎馬（単騎）・荷馬車の各移動手段
ごとに Google Maps の Directions のようなダイアログで表示する。

関連:

- 既存の Ruler / RouteOpisometer: `src/controllers/measurers.ts`
- 右クリックメニュー: `src/controllers/mapContextMenu.ts`, `src/ui/components/MapContextMenu.tsx`, `src/store/mapContextMenuState.ts`
- 陸路・海路のグラフ探索: `src/generators/landRouteGraph.ts`, `src/generators/seaRouteGraph.ts`
- 勾配・標高・移動速度: `src/services/routeGrade.ts`（Phase 1〜3 実装済み。本機能はここを再利用するのみで変更なし）
- 標高プロファイル描画: `src/renderers/elevation-profile-renderer.ts`, `src/controllers/elevation-profile.ts`
- 参考（経済拡張側の同種実装）: `src/extensions/economy/generators/trade-animation.ts`（混在陸海川 Dijkstra）,
  `src/extensions/nobility/controllers/playerCharacterTravel.ts`（burg間移動見積もり）

**実装状況**: 完了（v1: 2026-08-23 / v2 改訂: 同日）。本ドキュメントは v2 の内容が最新の正。

---

## 0. 確定した方針（v2）

v1（最初の実装）は「徒歩・馬車・船」を3つの独立したモードタブとして扱い、各モードは自分のネットワーク
（陸路 or 海路）だけを探索していた。ユーザーからのフィードバックで以下に変更:

| 項目 | v1 | v2（現状） |
| :--- | :--- | :--- |
| モード | 徒歩・馬車・船（船は独立モード） | **徒歩・騎馬（単騎）・荷馬車**（船はモードではない） |
| 海路の扱い | 船モードでのみ海路探索 | **全モード共通で陸海統合グラフを探索**（`findMergedRoutePath`）。最速ルートが海路を含むなら自動的に陸+海の混在ルートを提示。港↔港で陸路が無ければ自然に「海路のみ」になる |
| 複数ルート候補（shortest/easier） | 2本まで自動提示 | **廃止**。モードごとに1本（最速）のみ。「船を避ける」チェックボックスが実質的な代替ルート選択手段になったため |
| 船を避ける | なし | **「Avoid sea travel」チェックボックス**。ON で陸路のみ探索。陸路が存在しない場合は無視され、`seaRequiredDespiteAvoid` フラグでその旨を表示 |
| 移動速度 | 徒歩28 / 馬車32 / 船60 km/day | 徒歩28 / **騎馬（単騎）48** / 馬車32 / 船60 km/day（陸海はモード別、海は全モード共通） |
| 港transfer | なし（モード別ネットワークなので不要だった） | 陸⇔海の切替ごとに固定2日（`PORT_TRANSFER_PENALTY_DAYS`）を経路確定後に加算（economy の `tradeRouteDuration.ts` と同様、探索コストには含めない簡略化） |
| 標高チャート | 全モード（陸のみ）で表示 | **全陸ルート（`composition === "land"`）のみ**フルチャート表示。混在ルート（`mixed`）は登り/下り合計のみのシンプル表示（陸区間のみ）でチャートは省略。海のみ（`sea`）は「標高差なし」表示 |

引き続き有効な v1 からの方針:

| 項目 | 決定 |
| :--- | :--- |
| 発動条件 | 「from」「to」双方が都市（burg）の場合のみ、専用ダイアログを開く。片方でも都市でなければ従来通り直線 Ruler |
| 依存範囲 | economy 拡張（TradeAnimation / CaravanMovement）には依存しない、完全に core 実装。economy が無効でも動作する |
| 所要時間の表示 | シミュレーション日単位（切り上げ）ではなく、連続値を日/時間/分に分解して表示（情報表示のみで tick 進行とは無関係なため） |
| 地図上の表示 | 選択中のルートを `view.ruler` レイヤーにハイライト線として描画し、ダイアログを閉じると消える |
| burg のヒット判定 | `findCell` + `pack.cells.burg` によるセル判定ではなく、クリック地点に最も近い burg 座標を画面ピクセル半径で直接判定（burg 座標が自セルの重心から外れることがあるため。詳細はコード内コメント参照） |

### 経路探索の実装詳細（v2）

`src/services/travelDirections.ts` の `findMergedRoutePath`: `landRouteGraph`（roads/trails）と
`seaRouteGraph`（searoutes）の隣接情報を、両方とも「時間（day）コスト」に変換した上で単一の Dijkstra で
探索する。陸区間は `landEdgeEffortCost`（勾配考慮、モード別 sensitivity）から時間に変換、海区間は
距離 / 60km/day。これにより「最速ルートがたまたま海路を経由する」ケースを自然に発見できる。

「船を避ける」ON 時は `seaGraph: null` を渡して陸路のみで探索し、失敗したら（陸路が存在しない場合のみ）
海路ありで再探索して `seaRequiredDespiteAvoid: true` を返す。

港transferペナルティは探索コストに含めず（TradeAnimation のようなモード状態追跡が必要になるため）、
確定した経路の陸⇔海切替回数を事後集計して加算する簡略化。sea⇔land が何度も入れ替わるような不自然な
経路は実際の route 網では稀という前提。

---

## 1. 新規ファイル

- `src/services/travelDirections.ts` — 経路・距離・所要時間・標高プロファイルの計算（core、拡張非依存）
- `src/services/travelDirections.test.ts` — 上記のユニットテスト（勾配回避・陸海混在・avoidSea フォールバック・同一地点・孤立ペアを網羅）
- `src/store/directionsDialogState.ts` — ダイアログのペイロード用 zustand ストア（`avoidSea` を含む）
- `src/ui/dialogs/DirectionsDialog.tsx` — モードタブ + avoidSea チェックボックス + 標高チャートを表示するダイアログ
- `src/ui/dialogs/directionsDialog.css`
- `tests/e2e/directions-dialog.spec.ts` — 実地図での右クリック→ダイアログ表示、avoidSea トグルの E2E

## 2. 変更ファイル

- `src/store/mapContextMenuState.ts` — 右クリック地点の burg 解決結果を保持するフィールドを追加
- `src/controllers/mapContextMenu.ts` — burg 判定、burg-to-burg 時に Directions ダイアログを開く分岐
- `src/ui/components/MapContextMenu.tsx` — メニュー文言を burg 名入りに
- `src/ui/dialogs/DialogsContainer.tsx` — `<DirectionsDialog />` を登録
- `src/controllers/elevation-profile.ts` — チャート用データ構築ロジックを `buildElevationChartData` として抽出（Directions ダイアログと共用するため）
- `src/i18n/locales/{en,ja}.json` — `mapContextMenu.distanceFrom/ToBurg`、`dialogs.titles.directions`、`directions.*`
- `tests/e2e/helpers/fmg-helpers.ts` — `findConnectedBurgPair` ヘルパーを追加（陸路のみで判定 — searoutes を含む `pack.cells.routes` は使わず `landRouteGraph` と同じ roads/trails フィルタを再実装）

## 3. 今回やらないこと（スコープ外）

- 一般的な k-shortest-paths による多数のルート候補提示（v1 で検討したが v2 で「船を避ける」チェックボックスに一本化）
- economy 拡張が有効な場合に、そのユーザー設定速度（CaravanMovement）を反映すること（将来 `burgEconomyExtensions.ts` と同様のフック方式で拡張可能）
- 陸海混在ルート（`mixed`）でのフル標高チャート表示（現状は登り/下り合計のみ）。将来的には陸区間ごとに
  `buildRouteGradeProfileFromPoints` を個別に呼び、海区間をギャップとして扱うチャート合成で実現可能
- 港transferペナルティを探索コストに含めること（モード状態追跡付き Dijkstra が必要 — 現状は事後加算）
