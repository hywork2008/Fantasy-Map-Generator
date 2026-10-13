# CE リファクタリング Phase 6 実装記録

状態: Phase 6完了。実施日: 2026-10-14。着手時コミット: `bd7d115df001041d374d47618c77adac07a9f866`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。前工程: [Phase 5](1014-ce-refactoring-phase5.md)。

## 配置とAPI

旧`core/`・`ui/`・`render/`・`io/`の実装を役割別に移し、CE内部、FMGの現行利用者、CLI・採取スクリプト、テストのimportを更新した。生成順序・RNG・ID・橋の共通判定・保存形式を変更する処理は含めない。廃止予定CGのソースは調査・変更していない。

| 配置（`src/city-editor/`配下） | 責務 |
| --- | --- |
| `generators/` | 旧core/genとcoreのメッシュ・編集制約・都市計算。既存generationパイプラインはそのまま維持 |
| `types/document.ts` / `geometry.ts` / `contracts/` | 文書、生成幾何、層をまたぐドメイン型。単一用途の内部型は担当する生成・描画モジュールに残す |
| `types/history.ts` / `worker.ts` | stateが借用する履歴の公開操作契約、Worker要求・返信・timing。実装への逆向き型参照を除去 |
| `components/CityEditorPage.ts` | 画面組立てと配線。`main.ts`はこの入口を使用 |
| `controllers/generationLogPanel.ts` | 診断パネルの調停 |
| `renderers/` / `renderers/overlays/editorOverlays.ts` | 描画・SVG構築、選択・ホバー・計測・操作preview |
| `services/io/documentCodec.ts` | 旧document.tsのnative解析・検証・旧schema補完と、旧ファイル出力のJSON符号化 |
| `services/io/` | native/MFCGファイル、SVG出力の調停、FMG受渡しとshare形式 |
| `services/generationWorker.ts` / `generationWorkerClient.ts` | 既存Worker通信・キャンセル。Worker内の生成本体はgeneratorsを直接利用 |
| `services/browserPreferences.ts` | 既存localStorageキーとmax-patchesの読書き。共有の正規化を利用 |
| `services/analysis/` | 旧coreのCLI入力読込、生成監査、性能・housing計測の調停 |
| `data/` | fixture、descriptor version、economy参照値。参照SVG/JSONと静的catalogはassetsに維持 |

完全生成は`generators/generation/generateCity.ts`、設定は`settings.ts`、段階生成は`previews.ts`へ直接importする。旧generate/svg窓口、道路接続/gateApproachesの移行窓口を撤去した。overlay、pick、ship、fabric等の不要な再exportも利用者を所有APIへ移行して除去した。公開操作の名前と引数、FMGの遅延preview経路は維持する。

native保存のversion選択（2/3/4）とJSONの整形をcodecへ抽出し、`exportCityMap`とテストが同じ`serializeDocument`を利用する。parserの旧schema補完・固定アプローチの再検証は既存どおり。SVG構築・直列化はrenderersが所有し、ダウンロードをservices/ioが調停する。

## 依存の修復と機械検査

Phase 5で残った8モジュールの実行時循環を解消した。`buildingLots`から独立した都市施設の占有判定を`civicClearance.ts`、localInfillから畑のchord計算を`fieldChord.ts`、aerialLandmarksから占有輪郭の読取りを`aerialFootprints.ts`へ抽出した。判定の内容・呼出し位置・乱数消費を変更していない。

共有型から描画・生成・IO実装を参照していた辺も整理した。CastleStyle、SiteConfig、BurgSiteDescriptor、保存する都市成長・施設・道路契約、診断等を`types/contracts/`へ移し、stateは履歴の公開操作インターフェースを借用する。固定アプローチ入力は独立した型となり、生成関数への`Parameters<typeof ...>`参照を下位層から取り除いた。

`npm run lint:architecture`に`scripts/city-editor/architecture.ts`のCE検査を接続した。次を継続検査する。

- 曖昧な配置への新しい実行モジュールの追加、役割に反する依存方向。
- 型専用import・import型・再export・遅延importも含めた方向。依存を隠す計算されたimportの禁止。
- CE外の現行利用者・テストも含む旧パス、CEから廃止CGへの依存、未解決のCEモジュール。
- 下位層のブラウザーglobal・DOM操作・DOM型。
- 文字列のWorker URLを含む実行時循環。

同じtypes層内の再帰的文書・生成recipe型はデータ契約として許可する。型参照を方向検査から除外する例外ではない。runtime循環と型の再帰は区別する。既存のFMG共通幾何・橋規約・i18nへの外部辺は維持し、その外部graphやcomputed Worker URLまでは再帰走査しない。

Phase 0 inventoryも新配置へ対応し、Worker URL・旧パス・残存窓口を出力する。最終inventoryは実行モジュール306件、runtime循環0、生成から上位層への辺0、CE内の旧パス参照0。

## 残す互換窓口と所有

旧配置の例外は`core/document.ts`のみ。廃止予定CGの既存文書利用者を壊さず、CGソースへ触れないため、文書作成とnative parserの再exportを維持する。現行CE/FMG/CLIにはこの窓口の利用者はいない。CG撤去時に一緒に削除する。検査はこのファイルで許可する二つの再export先を限定し、実行処理の追加や新しい旧パスimportを拒否する。CG自体は今回の検査走査から除外する。

移動による新しい文書cache・全体clone・timer・listener・Worker所有者はない。履歴・生成preview・派生描画・mount lifetimeの所有と解除地点はPhase 3〜5のまま。codecとブラウザー設定サービスは明示的引数または従来のstorage境界で動き、現文書をmoduleに保持しない。静的配列・schema参照値は既存値を移動したもの。

## 検証

ログ・未正規化の採取結果・比較JSON・限定ビルドをGit管理対象外の`artifacts/city-editor/phase6-20261014/`に保持する。

| 検証 | 結果 |
| --- | --- |
| `npx tsc --noEmit` | エラー0 |
| 変更対象Biome、`git diff --check` | 指摘0 |
| アーキテクチャ検査 | CE違反0。FMGの既存allowlistは従来の3辺 |
| CE全体、`npx vitest run city-editor --maxWorkers=4` | 181ファイル: 173成功、8skip。1,386件: 1,367成功、19skip、失敗0。462.95秒 |
| 最終IO・Worker・lifetime・FMG previewの対象検証 | 10ファイル: 9成功、1skip。66件成功、2skip |
| 新しい依存・codec境界の最終検証 | 2ファイル14件成功（依存10件、codec4件） |
| 代表8都市の再採取 | Phase 0と入力・初期文書・設定・生成文書・SVGのSHA-256、生成statusが全件一致 |
| CE単独のVite productionビルド | 334モジュール、CE HTML・entry JS・generationWorker JSの出力成功 |

CE全体の開始後に追加した新しい境界テストと最後のIO/通信整理は、後続の対象検証で確認した。重複する対象検証の件数を全体集計へ加算していない。新しい依存テストは型・遅延import・再export・Worker URL・DOM・runtime循環・旧パス・曖昧な配置・互換窓口の限定・computed importを検証する。codecは保存schema 2/3/4のデータと順序、不変性、再保存同一性、旧schema補完、不正入力拒否を確認する。

8都市の採取はテスト終了後に単独実行した。河川・海岸・輸入橋・二重城壁・Circulade/Bramを含み、入力不変、描画read-only、parse往復、再生成文書とSVGの同一性も全件成功。ID・座標・配列順序・SVG属性を正規化していない。計測環境はNode v22.23.1 / Apple M4 / darwin arm64。今回の時間値から性能改善を主張しない。

補助点検では、移動対象の名前付き関数1,347件でbodyのトークン列が一致した。残る4件の差は遅延import/型importのパス更新とJSON出力のcodec委譲であり、上記の実出力比較で確認した。クラス・匿名関数・全パイプラインをこの点検だけで保証したとは扱わない。

`npm run lint:architecture`のtsx CLIはサンドボックスのIPC制限（EPERM）で起動できなかったため、同じscriptを`node --import tsx scripts/lint-architecture.ts`で実行し成功した。Viteは一時configでCE入口のみを指定し、public copyとFMG/廃止CGの入口を含めていない。既存MPA設定自体は変更していない。大きいchunkの警告は残る。FMG画面からの手動起動・Phase 7の総合性能/保持メモリ点検は今回の完了をもって実施済みとはしない。

入口、現行ソースへの関連ドキュメント、CEテスト手順、基準再採取スクリプトを更新した。過去のreviewsと基準manifestは履歴の旧パスを保持する。Phase 7は未着手。
