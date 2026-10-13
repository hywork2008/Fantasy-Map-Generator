# CE リファクタリング Phase 5 実装記録

状態: Phase 5完了。実施日: 2026-10-14。着手時コミット: `e684a836714d996078f3491f84a868a08537871f`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。前工程: [Phase 4](1014-ce-refactoring-phase4.md)。

## 責務と依存の分離

`CityEditorPage.ts` の既存処理をcontroller、component、state、ブラウザーlifetimeへ分けた。ページは所有状態の初期化、画面の組立て、live state・操作APIの配線、既存の入口を担当する。DOMのclass/id、UI文言、編集・生成順序、MPA境界、保存形式、橋の共通規約は維持する。

| 配置（`src/city-editor/` 配下） | 責務 |
| --- | --- |
| `components/editorControls.ts` | 常設パネル、最小化・前面化・ウィンドウ移動、共通control。イベントはmountのlifetimeが所有 |
| `components/documentPanel.ts` / `generationPanel.ts` | 文書・グリッド・世代・生成設定のcontrol構築。呼出し元の操作とlive stateを借用 |
| `components/importedSite.ts` | 読み取り専用の輸入site表示 |
| `controllers/inspector.ts` / `layers.ts` / `history.ts` | Inspector、地図feature群の編集、履歴DOMと履歴ジャンプ |
| `controllers/generation.ts` / `generationPlayback.ts` / `generationSteps.ts` | 生成要求と採用、逐次表示・履歴に対応する生成状態、段階ごとの操作 |
| `controllers/documentIO.ts` / `gridPreview.ts` | 読込・shareの調停、グリッド生成プレビューと採用 |
| `controllers/editing.ts` / `spatialIndex.ts` | 確定commit・undo/redo復元と制約確認、編集用メッシュindex |
| `controllers/mapDisplay.ts` / `contextMenu.ts` | 描画・overlay・表示更新、右クリックメニュー・計測 |
| `controllers/panelEvents.ts` | control名＋event名による型付きのフォームbinding。匿名の工程番号は使わない |
| `controllers/tools/` | ブラシ、経路の描画、選択・hit test、pointer down/move、drag確定、click/contextmenu、補助map event、keyboard |
| `state/editorSession.ts` | 正本文書・履歴、生成要求・プレビュー、表示、操作途中の4所有単位と文書置換境界 |
| `services/editorLifetime.ts` | 一mountのlistener、timeout、描画予約、observer、pointer capture、非同期要求の世代と破棄 |
| `types/editor.ts` / `selection.ts` / `utils/editorUnits.ts` | 共有契約、選択・pick情報、単位表示。描画側の型は旧パスから再export |

controllerはページ全変数を共有せず、各機能が実際に使う状態・control・操作だけを受け取る。既存可変状態は4所有単位の参照かlive getter/setterで渡し、現在の文書のsnapshotを保持しない。controllerの相互操作は明示的な関数契約で渡す。初期化順を維持するためcontrollerの生成は遅延し、フォーム構築中のlistenerは同じフォームのlocal controlを読む。新設モジュールから `CityEditorPage.ts` への逆importはない。

## 状態と確定編集

- `DocumentsState`: 正本のCityDocument、DocumentHistory、reference image、grid/site入力、出力用文書の一件cache。
- `GenerationState`: settings/seed、完全生成の入力・結果、履歴に対応するpreview、Worker job、診断・段階・grid preview。
- `DisplayState`: camera、可視性、表示品質、notice。保存文書に追加しない。
- `InteractionState`: selection、tool、brush、pointer/drag/stroke、計測、landmark/ship操作。保存文書に追加しない。

初期化・RNG呼出し順は既存の位置を維持する。文書の複製は従来の履歴・preview・生成境界だけで、状態分離のための正本文書コピーは追加しない。

確定編集は既存DocumentHistoryのcommit、strokeのamendTop、undo/redo/jump経路を維持する。編集controllerが既存の城・防衛回路検証と必要なcastle layout修復を扱い、各ツールは既存coreのドメイン操作を使う。橋・城壁の独自閾値や別undo stackは追加しない。gesture中の一時文書と確定履歴を混同しない。

`createDocumentsState` がすべての正本文書置換を検知する。旧文書の出力cacheを解除し、文書単位の派生fabricを無効化し、古い読込要求を無効化する。未採用のWorkerは文書が変わるとcancelする。Worker自身の採用中は区別してcancelしない。

`clearRenderDerivedCaches(document)` / `clearBlockFabricCache(document)` に文書単位の解除を追加した。no-argumentの既存APIは全解除のまま。文書置換で共有の256件LRUまで消すと毎編集で未変更districtを再計算するため、共有LRUは維持し、mount/unmountで全解除する。保存データ・生成アルゴリズム・cacheの結果は変更しない。

## ライフサイクルと非同期境界

`mountCityEditor` はdisposerを返す。戻り値を無視する既存利用者にも、同じrootの再mount、DOMからの除去、pagehideに対応する自動破棄を用意した。rootの再mountでは前のmountを先に同期的に破棄する。未接続rootへのmountも従来どおり可能で、その場合は呼出し側がdisposerを所有する。

`EditorLifetime.dispose()` は一度だけ処理する。listenerを解除し、observerをdisconnectし、timeout・animation frameをcancelし、pointer captureを解放し、Workerをcancelする。生成入力・結果、reference image、出力cache・grid previewを解除してDOMとaria-busyを撤去する。lifetimeが保持するcleanup/listener集合も空にする。

パネルの最小化はDOMを破棄するcloseと区別し、controlと設定を保つ。Inspector等の内容再構築では、`replaceChildren` の前に旧controlのlistenerを解除する。文書全体のobserverでも離脱した旧controlを回収する。常設パネルのlistenerを開閉のたびに再登録しない。

- notice・clipboard表示のtimeout、pointermoveで予約する描画はlifetimeが所有し、終了後はcallbackを実行しない。
- clipboard・importのticketは機能ごとの世代を持ち、後の要求・文書置換・破棄で古い結果を無効化する。
- landmarkファイルの読込は終了済みページに適用しない。
- Workerの進捗・診断・採用・例外・finallyはlifetimeと現在のjobを確認する。採用時は既存の入力identity・文書JSON確認も維持する。破棄後のfinallyが再mountしたrootのbusy表示を変更しない。
- 根のobserverはmount一つにつき一つ。旧Worker専用の追加observerは不要になり、撤去した。

新しい長寿命所有者はrootをkeyとするWeakMapのlifetimeのみ。controllerは各mountの配線だけが所有し、DOM/listener/worker/timerの解除後、moduleがページや文書を保持しない。世代Mapは少数の固定機能channelだけを持ち、破棄時に空にする。既存preview cacheの弱参照と一件上限、DocumentHistory、共有LRUの上限も維持する。

## 検証

ログはGit管理対象外の `artifacts/city-editor/phase5-20261014/` に保持する。

新しいlifetime境界テストは6件。DOM離脱・二重dispose、window listener・timerの停止、置換したcontrolの無効化、要求の世代、同じrootへの再mountでの旧Worker停止・遅延返信の無効化、最小化反復での設定保持、clipboard完了後のDOM/URL無変更を確認した。

新規6件＋パネル/Inspector/Worker/計測/船の既存36件、7ファイル42件が成功した。型検査、Biome、既存アーキテクチャ検査も成功。CE専用の依存規則はinventoryで別途検査する。

| 検査 | 結果 |
| --- | --- |
| `npx tsc --noEmit` | エラー0 |
| 変更対象のBiome | 43ファイル、指摘0 |
| `lint-architecture.ts` | 違反0 |
| CE最終inventory | 新設モジュールのruntime循環0、ページへの逆import0、state/types/utilsからUI・controller・renderへの依存0 |
| 新規・既存の対象テスト | 7ファイル42件成功。clipboardタイマーをlifetimeへ統一後も新規6件を再実行し成功 |
| CE全体 | 181ファイル: 172成功、1失敗、8skip。1,386件: 1,366成功、1失敗、19skip。452.11秒 |

全体実行で失敗したのは `③ tints its buildable cells; any other stage clears the tint`。ランダムseed `41p10r` の城壁・河川経路が不採用になり、③のハイライト247面が残って⑥への切替期待に失敗した。単独再実行は1件成功（filterによる39skip）。この再実行を全体集計の成功に置き換えない。

着手時ページと変更後ページを、初期grid・生成seedを `41p10r` に固定して比較した。③の250面、⑥で0面、status、SVGのSHA-256が完全一致した。比較用の一時ページ・テストは撤去し、ログと結果JSONをartifactに保持する。失敗時のランダムgrid seedはログに残らないため、失敗実行そのものを再現したとは扱わない。生成拒否時の表示を変える処置やランダムテストの安定化はこの責務分離に混ぜていない。

最終inventoryにも、以前からあるcore/genの循環1群とcoreからio/renderへの8辺が残る。今回の新設モジュールには関与せず、役割別配置と依存検査への定着はPhase 6の対象とする。

全体テストと型検査等の終了後、代表8都市を同条件（Node v22.23.1 / Apple M4 / darwin arm64）で単独採取した。入力原文・初期文書・設定・生成文書・SVGのSHA-256と生成statusは、8ケースすべてPhase 0と完全一致。入力不変、描画read-only、JSON parse往復、2回の文書/SVG一致も全件成功した。座標・ID・配列順序の正規化は行っていない。最終inventoryと採取は `artifacts/city-editor/phase5-20261014-final/`、比較結果は元のログrootに保持する。採取時間はログに残すが、性能向上・低下の主張には使わない。

FMGからの入口・MPA設定・`main.ts` の呼出しを変更していない。既存のoptionsとexportを維持し、戻り値を無視する入口からも自動破棄する。Worker経由の採用、編集・undo/redo・履歴ジャンプ、パネルとInspectorは既存テストで検証した。FMG画面からの手動ブラウザー操作は今回行っていない。

## 残る互換窓口・大きいファイル

`CityEditorPage.ts` は旧入口と `bringPanelToFront` の再exportを維持する。旧generate/render窓口の参照移行はPhase 6。ページに残る長い部分は状態初期化、live APIの配線、画面の組立てである。`inspector.ts` は約1,000行で、feature種別ごとの既存control構築を含む。単純な行数削減として分けず、Phase 7で追加分割の必要性を点検する。入力snapshotとcontroller共通contextへ全ページ状態を丸ごと移した形にはしていない。
