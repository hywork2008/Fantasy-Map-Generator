# CE リファクタリング Phase 1 実装記録

実施日: 2026-10-13。着手時コミット: `cf31760aec50f0b311c4a74c88d0ef47862a4394`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。比較基準: [Phase 0](1013-ce-refactoring-phase0.md) と [基準manifest](1013-ce-phase0-baseline.json)。

## 変更内容

生成アルゴリズム・処理順・乱数・ID・保存形式を変えず、低結合の宣言・計算を抽出した。`core/generate.ts` は6,448行から5,774行へ縮小した。`runPlan` / `applyPlan` の工程分割はPhase 2/3で行う。

| 抽出先（`src/city-editor/` 配下） | 責務と移行元 |
| --- | --- |
| `types/generation.ts` | 公開設定、段階定義/表示、逐次結果、メッシュ境界の型。旧generateの共有契約 |
| `generators/generation/contracts.ts` | 内部のPlan型。型の形状を維持し、工程別の縮小はPhase 2へ残す |
| `generators/generation/settings.ts` | 設定初期値、道路設定の解決、seed選択、地理要求、effective layout |
| `generators/generation/stages.ts` | 17段階の定義と内城壁先行の順序選択。翻訳実行を含めない |
| `controllers/generationStages.ts` | 段階ラベル・説明の翻訳。通常段階の遅延getterと内城壁先行のsnapshot動作を維持 |
| `generators/generation/meshGeometry.ts` | mesh→cells、都市連結成分と境界ループ。走査順と境界選択を維持 |
| `types/ships.ts` / `data/ships.ts` | 船の種類・寸法型と物理寸法。DOM・翻訳なし |
| `generators/ships.ts` | 既存の船名aliasの正規化 |
| `render/shipSpecifications.ts` | 船の表示用ラベルを物理仕様へ付加する互換API |

船の生成 `core/gen/harborShips.ts` はdata/typesを直接参照するようにし、`render/shipSvg.ts` への逆依存を除去した。rendererは表示用仕様を使い、既存のSHIP_SPECS・型・正規化関数を旧パスから再exportする。

Worker clientとincoming IOのGenerationSettings参照は `types/generation.ts` へ移した。ほかの既存利用者には公開窓口を残す。

## 互換性と依存

- `core/generate.ts` の35公開export、`render/shipSvg.ts` の10公開exportを維持した。型検査でも既存利用者を確認する。
- 新設generatorはcontroller・renderer・UI・旧generate窓口をimportしない。新設モジュールに実行時循環はない。
- Phase 0で確認した街区/建物系8モジュールの実行時循環は本工程の変更対象外で、残存を記録する。
- 段階表示はcontrollerの責務。旧generate窓口のcontroller再exportは互換bridgeとして残し、新設モジュールから参照させない。撤去は利用者を新APIへ移すPhase 5/6で行う。
- 既存のsiteConfig、BurgSiteDescriptor、CityDocument等の型配置は維持する。typesから旧gen/site等への型専用参照は移行中の契約であり、旧モジュール配置の整理時に解消する。今回、これらのスキーマや保存内容を再設計しない。
- 小さな段階配列と船の参照データをmodule単位で保持するが、文書・DOM・timer・Worker・派生cacheの新しい長寿命参照は追加しない。

## 検証

着手時の段階定義と船仕様をgitから取得し、8基準入力とdefault/inner-first/outer-firstの計11設定を日本語・英語で比較した。旧公開段階データと船仕様のJSONは全ケースで完全一致した。設定・生成・メッシュ計算の53個のトップレベル関数は、TypeScript token比較で本体が変わっていないことも確認した（段階表示は別途上記の比較で検証）。

新しい境界テスト `controllers/generationStages.test.ts` は、言語変更で通常の遅延ラベルが変わり、既に作成した内城壁先行snapshotは変わらず、生成側の段階選択データも変わらない契約を検証する。

DOMなしのNodeで設定・段階選択・船仕様・alias正規化・メッシュ変換を実行した。既存のアーキテクチャ検査も直接実行したが、CE専用の規則はまだ検査対象外であるため、Phase 0のinventoryで新設モジュールのimportと循環を別途確認した。

詳細な再採取・テスト・依存・API比較ログはGit管理対象外の `artifacts/city-editor/phase1-20261013/` に保持する。生成・描画の比較は [Phase 0の採取スクリプト](../../../scripts/city-editor/phase0/README.md) を同じNode/jsdom条件で実行した。

| 検証 | 結果 |
| --- | --- |
| 型検査 `npx tsc --noEmit` | 終了コード0 |
| Biome（変更した16ファイル） | エラーなし |
| 旧公開export | generateの35件、shipSvgの10件を維持 |
| 段階/船仕様比較 | 11設定×2言語の段階JSON、2言語の船仕様JSONが旧実装と完全一致 |
| 8都市の基準比較 | 入力原文・初期文書・設定・結果文書・SVGのSHA-256がPhase 0と完全一致 |
| 8都市の契約 | 入力不変、描画read-only、JSON parse往復、2回の文書/SVG完全一致すべて成功 |
| CE全体 | 175ファイル: 159成功、8失敗、8skip。1,371件: 1,335成功、17失敗、19skip。536.67秒 |
| 表示境界/船描画の対象テスト | 2ファイル、8件成功 |
| 追加timeoutの単独再検証 | 対象1件成功（ほか39件はfilterでskip）。90.41秒 |

全体テストの失敗は、Phase 0の16件と同じ失敗名に加え、`CityEditorPage.generate.test.ts` の「① reveals the coastline walk as a growing dotted trail, not sea cells」が120秒timeoutとなった。単独再実行では88.91秒のテスト時間で通過し、入力・アルゴリズム・timeout設定・assertionを変更していない。このテストは固定seedを持たず、最大12回の新都市再試行を含むため、時間の不安定性として次フェーズでも監視する。単独成功を全体の17失敗という実測結果の置き換えには使わない。安定した入力への変更は別のテスト改善として扱う。

新設モジュールに旧generate窓口への逆import、generator→UI/render/controller参照、実行時循環はない。既存の建物系循環は変わらず、アーキテクチャ検査のCE適用拡張はPhase 6へ残す。新しいcache、全体clone、文書保持は追加していない。初回1回の採取時間は性能向上の主張には使わない。

## 完了と次工程

Phase 1の抽出・公開API維持・設定と段階の互換性・基準生成結果・依存検証を完了した。既存失敗16件と追加で観測したtimeoutを上記のとおり記録する。Phase 2は未着手であり、`runPlan` の工程別契約と実行順の整理を次の対象とする。
