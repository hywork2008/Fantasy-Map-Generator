# CE リファクタリング Phase 3 実装記録

実施日: 2026-10-13〜14。着手時コミット: `ee862818cf6617eeca5a0127dfe51ce7e163f0cd`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。比較基準: [Phase 0 manifest](1013-ce-phase0-baseline.json)、[Phase 2](1013-ce-refactoring-phase2.md)。

## 変更内容

`core/generate.ts` を既存APIの互換窓口へ縮小し、試行・再試行・採用、段階プレビュー、文書反映、道路完成・接続修復を責務別に分けた。保存形式、seed、RNG、ID、走査順、observer通知、再試行条件、橋の規約を維持する。

| 配置（`generators/generation/` 配下） | 責務 |
| --- | --- |
| `generateCity.ts` | 完全生成の最大8試行、retry設定・seed、候補の仕上げ・最終検証、最終採用と生成recipe |
| `prepareRun.ts` | 文書から地理・program・params・cellsを導出する既存処理 |
| `previews.ts` | 通常段階と6種類の逐次プレビュー、区画スクラブのキャッシュ |
| `debugPreview.ts` | 計画時の拒否を示す診断文書の組立て |
| `assembly/applyPlan.ts` | 一つの試行文書の所有、工程順、途中終了・拒否の受け渡し |
| `assembly/terrain.ts` | 固定crossing・frame水域、前回生成物の解除、海・河川・都市域・区画の反映 |
| `assembly/firstWall.ts` | 内城壁先行での城・最初の城壁、途中終了 |
| `assembly/outerWalls.ts` | 外城壁と沿岸開口、raw-wall checkpoint |
| `assembly/gates.ts` | 境界平滑化、河川との城壁間隔・通路修復、外城門候補の準備・採用 |
| `assembly/landmarks.ts` | 城門準備後のplaza・citadel・temple・harbor要素 |
| `assembly/circuits.ts` | 防衛回路登録、城配置、堀設定 |
| `assembly/crossings.ts` | 橋の通路と外城壁先行の内城壁。街路をrouteする前の既存順序を保持 |
| `assembly/finalize.ts` | 城門接続の検証、道路端の整理、連結した郊外区画の保持、城・メッシュ・墓地の最終反映 |
| `routing/assembleRoads.ts` | 修復済みメッシュでの道路検索・診断・ID順の反映、渡し場・輸入道路・河川横断の接続 |
| `routing/completeRoadRouter.ts` | 開通した城門・橋・城壁・堀・水域を踏まえた既存の道路ルーター |
| `routing/frameRoadConnection.ts` / `gateApproaches.ts` | 既存coreのframe道路接続修復・gate側のdry cell/shore修復。旧パスは互換再export |
| `routing/fixedConnections.ts` | 仕上げ後の固定crossing approach、frame道路の接続修復・診断 |
| その他 | 河川polyline→mesh、城壁run、temple、文書property、乾いたapproach、道路数、old-town entry、生成prefix・preset・城壁gapの各責務 |

`applyPlan` は150行程度の工程調停へ分割した。工程は入力interfaceを持ち、更新された文書・mesh・cell対応・城壁計画等を返す。`stopped: true` は途中表示または拒否の終了を明示し、`document: null` は拒否を表す。終了後の工程を実行しない。

terrain、outerWalls、circuits、finalize、completeRoadRouterのPlan引数は必要なfieldのPickへ限定した。内城壁・城門工程は更新したPlanを次工程へ渡すため、全Plan契約を移行中の内部契約として残す。複数の工程を受け渡す道路反映側のPlan契約も次の縮小対象として残す。新しい万能contextは設けていない。

## 文書・試行・診断の所有

入力文書は借用して読み取り専用で扱う。`applyPlan` が既存どおり一回cloneし、城の計画でmeshが変わった場合は従来のmesh cloneとcell対応を採用する。工程分割のための文書全体clone、graph再構築、重複route計算は追加していない。

文書の更新を返す `installCastle`、城壁・通路修復、幾何仕上げ等の参照は呼出し元で明示的に受け取る。元の `appendGeneratedGroup`、`faceFor`、river landing判定は可変な外側文書・meshのclosureを外し、現在の文書・mesh・領域を明示的に受け取る。これにより別工程へ分けても古い文書へ書き込まない。

assemblyのreject契約は拒否時点の文書を引数で受け取り、debug observerへ渡す。失敗文書を次の試行へ渡さない。`generateCityOnDocument` は従来どおり同じ未変更の入力から試行を開始し、採用した候補にだけrecipe、地理設定、都市成長、住宅fitを付与する。debug modeが最初の拒否で止まる動作と、通常modeの最大8回retryを維持した。

bridgeの生成・整形は既存 `core/passages.ts` のドメイン処理を呼ぶ。最終判定の `resolveBridgeSkewLimit` は共通 `src/utils/bridgeSkewPolicy.ts` を直接使い、独自の斜交閾値を抽出先へ追加していない。輸入crossing、固定城、locked要素、内外城壁の途中表示も既存処理を保持する。

## プレビューの所有・無効化・解除

他の逐次段階は既存どおり呼出し単位の計画を使う。区画だけは、城門修復済みの文書・決定順・face→step対応を一件cacheし、表示する区画範囲だけを変更する。

- キーは既存の `JSON.stringify([document, settings, seed])`。in-place編集も次の呼出しで無効化される。
- sourceはWeakRef、派生結果はそのsourceをkeyにした一件のWeakMapが所有する。module自身は入力や派生文書を強参照で保持しない。前のsourceを捨てるとcacheもGC対象になる。
- 内容が同じ別sourceへは同じ派生結果を受け渡し、再計画しない。WeakMapを置換して一件に保つ。返すプレビュー文書のcloneは従来どおりcacheから独立している。
- `clearGenerationPreviewCache()` でWeakMapとownerを解除できる。UIのmount、既存の完全生成結果を無効化する設定変更・grid/site置換、文書読込、履歴復元に接続した。
- UIの区画スクラブでは、読み取り専用の `generateWardStep` にページの安定した `completeSource` を渡す。一時cloneをkeyにしてクリック間でcacheがGCされることを避け、毎clickの余分な入力cloneも不要になる。他段階の呼出しは従来の経路を保持する。

新しいDOM listener、timer、Worker、常設の文書参照は追加しない。ページ本体に元からあるlistener・completeSource・履歴等の全体ライフサイクル整理はPhase 5へ残す。

## 互換性と検証

ログはGit管理対象外の `artifacts/city-editor/phase3-20261013/` に保持する。日付をまたいだ作業のため出力ディレクトリは着手日の名称を維持した。

着手時の `applyPlan` を一時moduleで公開し、代表8都市×17設定（stage 1〜6、complete false/true、walls/riverPassages/passages/innerWall/firstInnerGates）で比較した。136ケース、成功文書108件・拒否28件で文書、通知順・内容、拒否時の文書が完全一致した。入力は両実装とも不変。DOM globalsなしのNode/Vite runnerで実行した。elapsedMsだけを通知比較から除き、座標・ID・配列・Set/Mapの順序は正規化しない。

6種類の逐次プレビューについて、8都市の先頭・末尾を96ケース比較した。文書、total/index、detail、highlight/overlay等の結果全体が完全一致し、入力不変。比較用一時moduleは検証後に削除した。

抽出した27関数の本体はTypeScript token比較で着手時と一致した。分割・cache所有を変更した `applyPlan`、`generateCityAttempt`、`generateWardStep` は上記の実行比較と境界テストで確認する。frame接続とgate approachの二moduleはimport以外の全tokenが旧実装と一致した。

既存35公開exportを維持し、cache解除API一件を追加した。frame接続の15 export、gate approachの4 exportも旧パスで維持した。新設generationにUI/render/controllerへの直接import、旧generate/frame接続/gate approach窓口への逆import、新しい実行時循環はない。既存建物系循環は変更対象外。既存architecture lintはCE専用規則の対象外なのでinventoryでも検査した。

追加した境界テストは3件。返されたプレビューの編集がcache/inputを汚さないこと、同内容sourceとstep変更で再計画しないこと、source/settings編集・明示的解除で再計画すること、仕上げ後に拒否した8試行が毎回元入力から始まり、その後の採用結果も変わらないことを確認する。

| 検証 | 結果 |
| --- | --- |
| 最終 `npx tsc --noEmit` | 終了コード0 |
| Biome | generation配下46ファイル、UI・互換窓口ともエラーなし |
| アーキテクチャ検査 | 終了コード0。CE generationの43 production moduleはinventoryで逆import・循環なしも確認 |
| assembly比較 | 136ケース完全一致、入力不変、DOMなしで成功 |
| 逐次プレビュー比較 | 96ケース完全一致、入力不変、DOMなしで成功 |
| 追加境界テスト | 3件成功（全体テストにも含む） |
| 既存対象テスト | generationDebug、wall checkpoints、frame接続の17件成功 |
| CE全体 | 178ファイル: 162成功、8失敗、8skip。1,376件: 1,340成功、17失敗、19skip。571.46秒 |

全体テストの17失敗はPhase 2と同じテスト名で、Phase 0の既存16件と海岸プレビュー「① reveals the coastline walk as a growing dotted trail, not sea cells」の120秒timeoutである。timeoutは実測失敗として記録し、成功として扱わない。このテストは固定seedを持たず最大12回の再試行を含み、Phase 1/2でも全体timeoutを観測した。安定化は別のテスト改善とする。

最後に区画スクラブの安定source所有をUIへ接続した後、該当UIテスト「② reveals the river walk the same way, and ⑥/⑦/⑧ scrub the document itself」を単独再実行し、1件成功（filterによる39skip）を確認した。これは上の全体集計へ重ねて加算しない。

全体テスト・型検査・UI対象テストの終了後、Node v22.23.1 / Apple M4 / darwin arm64の同条件で代表8都市を単独採取した。入力原文、初期文書、設定、生成文書、SVGのSHA-256は全ケースでPhase 0と完全一致。入力不変、描画read-only、JSON parse往復、2回の文書/SVG一致も全ケース成功した。最終inventory・採取データは `artifacts/city-editor/phase3-20261013-final/`、比較ログは着手日の出力rootに保持する。単発の時間はログに残すが、性能向上・低下の主張に使わない。

## 完了と次工程

文書反映の工程分割、routingへの道路完成・修復移行、試行・再試行と最終採用の集約、所有と拒否境界、プレビューcacheの所有・解除を確認した。`core/generate.ts` は4,265行から44行の互換窓口となった。`generateCity.ts` は749行、`previews.ts` は534行、assembly/routingの各moduleは最大609行である。

既存17失敗と、元からあるUIのlistener・履歴・完成都市cacheのライフサイクル整理を上記のとおり残す。Phase 3の必須項目は完了し、Phase 4では描画の文書変更・生成呼出しの分類と読み取り専用化、描画・overlay・cacheの責務分離を進める。
