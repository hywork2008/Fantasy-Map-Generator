# CE リファクタリング Phase 0 調査記録

調査日: 2026-10-13。基準コミット: `cf32584ecfe5e2e510e8f01e536184db00791b3d`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。本工程では製品コードを変更しない。基準はコミットだけでなく、[モジュールごとのSHA-256](../../../artifacts/city-editor/phase0-20261013/inventory/inventory.json) で識別する。

## 1. 調査範囲と成果物

Git管理する成果物は本書、ロードマップ、再採取スクリプト、[基準manifest](1013-ce-phase0-baseline.json)である。manifestにはソースhash、8ケースの結果hash・契約検証、循環依存、失敗テスト名を保持する。詳細ログと圧縮データは `artifacts/city-editor/phase0-20261013/` に移し、`.gitignore` で除外する。本書のartifactsへのリンクはローカル実行結果であり、clone先に存在することを要求しない。

- `logs/`: 調査・テスト・採取の実行ログ。確認後に削除可能。
- `inventory/`: 詳細なimport・export・関数一覧。再取得可能な生成物。
- `baseline/`: 比較用の入力・文書・SVGと詳細結果。後続フェーズの比較が終わるまでローカルに保持する。

再採取手順は [スクリプトREADME](../../../scripts/city-editor/phase0/README.md) を参照。

CEのTypeScript 338ファイルを走査した（テスト補助を除く実装163ファイル）。[inventory.json](../../../artifacts/city-editor/phase0-20261013/inventory/inventory.json) にファイル行数、公開宣言、関数の位置・長さ、import/reexport先、型専用依存、コードハッシュを記録した。[inventory.mjs](../../../scripts/city-editor/phase0/inventory.mjs) をリポジトリルートから実行して再取得できる。

依存グラフはCE内の静的import、文字列リテラルのdynamic import、reexport、`import()` 型参照を扱う。実行時循環の計算は型専用依存とテストを除外する。CE外の依存は記録するが再帰走査しない。計算されたimport、Worker URL、global経由の依存は自動グラフの対象外であり、別途ソースを確認した。CGのソースは参照していない。

CE外の主要な利用者は [external-consumers.log](../../../artifacts/city-editor/phase0-20261013/logs/external-consumers.log) に記録した。CLI benchmark、wall lab、housing、map server、scratch等が旧パスを参照しており、ファイル移動時にCEだけのimport置換で済ませてはならない。

## 2. 責務と公開APIの棚卸し

| 現在の対象 | 現在の責務・契約 | 移行先と注意 |
| --- | --- | --- |
| `core/generate.ts`（6,448行） | 設定、段階定義、準備、計画、文書反映、完全生成、再試行、逐次プレビュー、道路完成 | `generators/generation/`。既存exportをPhase 1で維持 |
| `core/document.ts` | サイズ・格子生成、descriptorの枠適用、JSON parse/補修 | 生成、state、IOへ分類。単一のstateモジュールへ丸ごと移さない |
| `core/types.ts` | 文書・メッシュ・要素・ツール等の型 | typesへ。現在generator内部型への依存があり、契約抽出が必要 |
| `core/mesh.ts` / `features.ts` | メッシュ参照、編集、制約、clone、ID採番 | 読み取り形状処理とドメイン編集を分類。copy-on-writeを維持 |
| `core/history.ts` | delta履歴、checkpoint、undo/redo、固定橋復元 | 状態所有と編集調停の境界。公開API維持 |
| `core/generationWorker.ts` / `generationWorkerClient.ts` | Worker起動・取消・通信、言語設定、生成実行 | servicesの通信とgeneratorsの本体へ分離 |
| `core/generationDiagnostics.ts` | 診断型、timer、翻訳付きラベル、失敗ログ | 型・生成診断とUI向け翻訳を分離 |
| `core/generationDebug.ts` | 不採用文書のsnapshot | 生成側のデータ。可視化は既存debug renderer |
| `core/housingReport.ts` | CE入力・設定構築、住宅計算、archive hydration | 入力adapter・生成計算・CLI/IOに分ける。ambient worldContextを扱う後半を純粋generatorへ混ぜない |
| `core/cityGenerationAudit.ts` / `cityGenerationPerformance.ts` / `housingBatch.ts` | 入力解析、生成、監査・計測、描画呼出し | generatorそのものではなく調停/CLI。coreから上位依存する理由を分類 |
| `ui/CityEditorPage.ts`（6,368行） | mount、全パネル、操作状態、文書採用、履歴、描画、生成、import、Worker | componentsのshellとcontrollersのパネル・ツールへ |
| `render/svg.ts`（4,085行） | 編集・建物表示、都市施設、overlay、standalone SVG | renderersのレイヤー・overlaysへ。生成判断との境界を先に確認 |
| `io/cityEditorFile.ts` | 文書JSON出力、SVG出力、file picker、MFCG/native読込 | services/io。純粋な形式処理とブラウザー操作を分ける |
| `io/incomingCity.ts` | share解析、設定適用、URL/sessionStorage等の受け渡し | 型契約・純粋adapter・ブラウザー通信を分類 |

`generate.ts` の公開APIは、設定群（`GenerationSettings`、`StreetSettings`、初期値等）、段階群（`GENERATION_STAGES`、`generationStages`等）、生成群（`generateStageOnDocument`、`generateCityOnDocument`、`generateCityAttempt`）、逐次群（`generateUrbanPatchStep`、coast/river/gate/road/ward step）、低水準群（`runPlan`、`completeRoadRouter`、`dryTownApproachLine`）に分かれる。siteConfigの型・定数も再exportしている。低水準APIもテストの利用者があるため、未使用とみなして削除しない。

CE内の製品利用者はCityEditorPage、generationWorker/client、incomingCity、housingReport、audit、performance。テストを含む詳細利用者はinventoryの逆引きで得られる。`mountCityEditor` はvoidを返し、汎用のunmount APIは現在ない。

## 3. 依存問題と優先順位

実行時の強連結成分は1件、以下の8モジュールである。

```text
aerialLandmarks → blockInfill / buildingLots / localInfill / medievalFabric
               / openField / suburbanLanduse / urbanGrowth
```

これは直接の一周を表す矢印ではなく、相互に到達できる集合である。正確な辺はinventoryに保存した。型専用参照を含めると城の配置・approach、frontage・perimeter、描画svg・landscapeにも相互参照があるため、実行時循環と型契約の結合を区別する。

| 発見 | 影響と対応フェーズ |
| --- | --- |
| `gen/harborShips.ts` → `render/shipSvg.ts` の `SHIP_SPECS` / `ShipType` | generator→rendererの逆依存。船の仕様をdata/typesへ抽出（Phase 1候補） |
| 街区・住宅系8モジュールの実行時循環 | Phase 2〜4で調停と共通契約を分離。barrelを増やして隠さない |
| `types.ts` → urbanGrowth / residentialCapacity等のimport型 | 下位型がgeneratorに依存。共有契約をtypesへ抽出（Phase 1〜2） |
| diagnosticsとgeneratorの `editorText` 参照 | 結果の形状と翻訳付き表示文言を区別。機械的reasonを維持し、表示はcontrollerへ（段階移行） |
| audit/performance/housing→incoming IO、performance→SVG | 調停責務として再配置（Phase 6）。一律にgeneratorへ移さない |
| svg→建物・fabric・水車・ferry計画 | Phase 4で読み取り計算と都市の事実の決定を区別する |

現行 `lint:architecture` はhost/extensionのgenerator→rendererとrace所有を検査する。CEの層間依存、型専用依存、循環依存の検査にはなっていない。Phase 6の検査拡張が必要で、既存コマンド成功だけをCEの合格としない。

## 4. 生成順序と決定論の維持対象

| 処理 | 現在の順序・分割時の契約 |
| --- | --- |
| `prepareRun` | descriptorまたはsynthSite → geography/program → wallPlan → params → meshからcells/faceIdOf |
| `runPlan` | edge graph → coast → river → urban → wall/precinct/castle計画 → street計画 → wards。途中のstage return、内城壁・都市形態・輸入河川分岐を保持 |
| `applyPlan` | source clone → terrain/import geometry反映 → wall/inner wall・境界整形 → gate/road routing → ward/landmark等 → validation。城壁建設順で道路と内城壁の前後関係が変わるため、その分岐を保持 |
| `generateCityAttempt` | prepare → plan → 面積等の事前判定 → apply → road shortcuts → hex整形 → finish geometry → bridge直線化 → voronoi整形 → 接続/temple/castle → crossing検証 → fabric → 道路・農地・墓地・水アクセス・船 → fixed approach → regional gate → defense判定 |
| `generateCityOnDocument` | imported flowを試行入力へ付加 → 最大8案 → 成功文書へ時代・技術上限・economy・seed・再現recipe → scene/biome → growth/housing fit → 採用。全失敗はnullと診断 |

細かな工程名と通知の現在値は `generate.ts` のtimer/profiler呼出しおよび採取結果のsamplesで追跡する。通知のelapsed時間自体は決定論比較の対象外、phase・attempt・counts・reason・routingの順は対象とする。

RNGは現時点で一つの共有streamではなく、用途ごとの派生seedを使う。`effective-layout`、`water:i` / `seaward:step` / `flip`、`regional-shore`、`river:i` / `outside:retry`、道路再試行等を維持する。「seedを一回に統一する」変更は本工程に含めない。完全生成の試行seedは最初が入力seed、以降が `${seed}:junction-retry:${attempt}`（attemptは1始まりのsuffix）である。道路計画はdescriptorなしの場合に最大3回追加試行する。城の失敗に応じた `castleStreetLinks` / `castleOutward` の次試行設定も維持する。

`randomSeed()` のMath.randomは要求seedを新しく選ぶ用途であり、固定seed生成の途中へ持ち込まない。生成IDは配列・境界・ループ順に依存し、手動featureの `nextId` は既存IDから最小の空き番号を選ぶ。走査順のsort追加や採番の共通化を抽出と同時に行わない。

## 5. 所有・複製・保存対象

| 状態 | 所有者・保存と現状の注意 |
| --- | --- |
| 文書・mesh・features・gates・elements・都市計画 | CityEditorPageのdocumentStateとDocumentHistory。JSON出力対象 |
| seed・生成要求・stage・grid要求 | ページの生成操作状態。shareで設定を渡し、生成済み文書には有効seed/recipe等を保持。UI変数全体は保存しない |
| 選択・tool・drag・hover・viewport・DOM索引 | ページのローカル状態。文書の正本と分離する |
| referenceImage | 大容量画像を履歴cloneから外し、出力時に再付加する既存設計を維持 |
| generationHistory | ページのWeakMap。履歴に対応した生成表示状態 |
| `wardStepCache` | generate.tsのmodule変数。一件のkey文字列・結果文書・order・Mapを保持。入力/設定/seedのJSON内容で更新するが、明示的な終了時解除がない |
| fabric default cache | blockInfillのmodule所有。FabricCacheは容量256のLRUとclearを持つ。defaultのライフサイクル解除は要整理 |
| fabricByDocument | WeakMapで文書別fingerprint/resultを保持。弱参照と、別の強参照キャッシュを混同しない |
| 最終output文書cache・空間索引 | ページ内で入力identity等に対応。unmountの明示的な一括解除は今後の課題 |
| 診断・処理時間・debug snapshot | transient。通常文書/履歴の正本に混ぜない |

`mesh.clone` は文書のmeshとfeatureを複製し、輸入橋・地域地形・sceneRegions・economy・文化・asset・flow等はcopy-on-write前提で共有する。単純なstructuredCloneへの置換、共有部分のin-place変更は禁止。`applyPlan` は入力clone、debugは専用snapshot、段階表示は結果clone、再現recipeは入力と設定cloneを持つ。これらの目的を保持し、工程ごとの追加cloneを作らない。

履歴は全snapshot方式ではなくdeltaと間隔付きcheckpoint方式で、live/base参照を保持する。resetで履歴を置換するが、entry数の上限は現実装にない。上限導入は挙動変更として別途検討する。

Workerは一回の実行につき専用Workerを作り、完了・失敗・取消でhandlerを外してterminateする。UIはroot切断をMutationObserverで取消し、入力identity/JSON比較で古い結果の採用を拒否する。既存の保護を維持したうえで、画面全体のteardownをPhase 5で整える。

## 6. 検証セットと比較方法

| ケース・既存テスト | 用途 |
| --- | --- |
| `gothengsfeld-20261012.json` / generate.gothengsfeld | 実測河川、輸入固定橋、河岸で終わる城壁、地域道路・gate、橋角度 |
| `erente-20261009.json` / erenteHarbor | 現行の海港、狭い入り江、桟橋・船の航行可能性 |
| `atheiate-20261003.json` / generate.atheiate | 旧海岸descriptorの互換条件。港の詳細テストは現状skipであり、現行港の保証に使わない |
| `hekus-ui-request-20261007.json` / generate.hekus | UIから取得したdocument/settings/seed、城と道路corridor |
| synthetic-circulade / synthetic-bram | 特殊都市形態、固定seed・small/voronoi |
| synthetic-double-inner / synthetic-double-outer | 二重城壁の要求・実際の順序・単城壁fallback |
| innerTownWall / innerFirstTownWall / generateWallCheckpoints | 二重城壁と段階整合性を既存テストで補完 |
| generate / generateLoopSteps | 固定seed、固定要素、段階と逐次表示、入力不変性 |
| history / cityEditorFile / incomingCity / Worker / svg | 保存読込、編集履歴、引渡し、非同期取消、出力の境界 |

採取スクリプトは [capture.mjs](../../../scripts/city-editor/phase0/capture.mjs)。製品コードを変更せずVite runner/jsdomで既存APIを呼び、入力request・結果文書・standalone SVG・samples・SHA-256・時間・環境を保存する。fixtureの原文hashと構築した文書/設定hashを分ける。結果nullも基準結果として記録し、成功扱いへ補正しない。再採取では `CE_PHASE0_OUTPUT` に新しい出力ルートを指定する（既定は `artifacts/city-editor/phase0-current`、入力・文書・SVGはその `baseline/` 配下）（既存resultへの上書きは拒否する）。

同一入力・設定・seedで比較し、JSONとSVGはまず完全一致を確認する。JSONはキー順差分と値差分を分け、配列順・ID・座標・設定を維持する。SVGの許容差分は明示的に決めた属性順等だけとし、都市の幾何形状やレイヤー順は除外しない。parseの完全一致が失敗したら、現在の補修/省略と新規退行を区別するため差分を保存する。

性能はテスト終了後に順次採取する。Node/jsdomの初回一回の時間は基準サンプルであり統計的な性能保証ではない。前後比較の正式計測は同じ入力・マシン・Node・描画条件で複数反復し、既存 [性能手順](../../tools/ce-performance.md) を使う。ブラウザーの画面起動・GPU描画・保持メモリはこの採取では測定しない。

## 7. 実行結果

| 検査 | 結果 |
| --- | --- |
| CE全体 `npx vitest run city-editor --maxWorkers=4` | 174ファイル: 158成功、8失敗、8skip。1,370件: 1,335成功、16失敗、19skip。635.84秒、終了コード1 |
| `npx tsc --noEmit` | 終了コード0 |
| `npm run lint:architecture` | tsx CLIのIPC socket作成がsandbox内でEPERM。検査本体まで到達せず |
| `node --import tsx scripts/lint-architecture.ts` | IPCサーバー不要の実行で終了コード0。ただしCEの層間依存は検査範囲外 |
| 基準採取8ケース | 全ケース生成成功。各ケースの同一入力2回で文書・SVG完全一致 |
| 入力不変性・描画read-only・JSON parse往復 | 採取8ケースですべて完全一致 |

ログ: [CE全体](../../../artifacts/city-editor/phase0-20261013/logs/vitest.log)、[失敗名一覧](../../../artifacts/city-editor/phase0-20261013/logs/test-failures.txt)、[型検査](../../../artifacts/city-editor/phase0-20261013/logs/typecheck.log)、[architecture CLI](../../../artifacts/city-editor/phase0-20261013/logs/architecture-check.log)、[直接実行](../../../artifacts/city-editor/phase0-20261013/logs/architecture-check-direct.log)。これらは製品コード変更前の既存失敗であり、原因修正をPhase 0へ混ぜていない。

| 失敗ファイル | 件数 | 観測した差分（原因の断定ではない） |
| --- | ---: | --- |
| gateApproaches | 2 | 生成/ward-stepがnull |
| CityEditorPage.generate | 4 | 外部道路ラベルなし、初期サイズ、段階数・段階ラベルの期待差 |
| CityEditorPage.grid | 3 | 初期サイズ・格子、Small/Tinyのセル数比の期待差 |
| aerialLandmarks | 2 | glacis外配置の判定、生成null後のlandmarks参照 |
| completeCity | 1 | 4rcc9橋岸の乾燥距離が期待値に届かない |
| frontageBuildings | 1 | 対象街区の建物数0 |
| riverEndpoints | 1 | 再試行seedが期待する元seedと異なる |
| settlementExtent | 2 | Medium/Large・大河川ケースの生成null |

基準採取時間（ms、最初の生成とSVG構築のみ、整数へ丸め）は以下。二度目の再現確認時間は含めない。

| ケース | 生成 | SVG構築 |
| --- | ---: | ---: |
| Gothengsfeld | 1,661 | 284 |
| Erente | 1,913 | 288 |
| Atheiate | 634 | 119 |
| Hekus | 564 | 162 |
| circulade | 941 | 842 |
| bram | 978 | 618 |
| 二重城壁・内城壁先行 | 2,241 | 218 |
| 二重城壁・外城壁先行 | 1,938 | 499 |

環境: Apple M4、darwin/arm64、Node v22.23.1、Vitest v4.1.10、jsdom環境。package.jsonのNode要求は24以上なので、正式な移行比較では使用バージョンを固定し、24以上へ変更する場合は新しい基準を別出力先に採取する。fixtureごとにVite runner/jsdomを再作成するが、同じNodeプロセスを使うためJIT等は共有されうる。CLIの都市別子プロセス計測とは区別する。

入力は `*.request.json.gz`、文書は `*.document.json.gz`、SVGは `*.svg.gz` として [基準データディレクトリ](../../../artifacts/city-editor/phase0-20261013/baseline/) に保存した。gzipを展開して比較し、結果hashは非圧縮のJSON（末尾改行を除く）/SVGへ適用する。`*.result.json` に機械的結果、環境、sample順、hashを保存した。syntheticの生成要求はrequestに固定され、二重城壁の両ケースでring 0/1が存在する。内城壁先行は `townWallGeneration.actualOrder=inner-first`、外城壁先行は同フィールドが未保存であることも現状として維持する。

## 8. Phase 0の結論と次工程

棚卸し、順序/所有の記録、検証セット、既存失敗、基準生成結果と性能サンプルを取得したため、Phase 0を完了とする。全テスト成功を意味しない。Phase 1は既存失敗の数だけでなく失敗名・内容が増えていないことを確認し、関係する失敗に変化があれば基準ログと比較する。

最初の抽出対象は設定・段階・共有契約・船仕様。既存公開APIを維持し、現時点で大きなpipeline/contextの導入や建物循環の一括解消を行わない。型契約の逆依存を分けた後、計画・反映・描画の順に責務を整理する。
