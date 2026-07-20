# `unite-data-and-map` Remediation ログ レビュー結果

新しいセッションへの引き継ぎ用ドキュメント。`docs/reviews/unite-data-and-map-remediation.md`（P0–P3 全件 Verified、計画 Phase 0–8 を「完了」または「Done with residual」とクローズ判定した文書）を対象に、記載内容を実装コード（`src/`）および元計画（`docs/plan/unite-data-and-map.md`）と突き合わせるレビューを実施した（2026-07-20）。

このドキュメントは**レビュー結果の記録のみ**であり、修正の実装計画そのものではない。次のセッションはここに列挙した各項目について、対応するかどうか・対応順序をユーザーと合意した上で、修正方針を個別の実装計画へ落とし込むところから着手する。

対象: `docs/reviews/unite-data-and-map-remediation.md`（2026-07-20 時点、全517行）。検証は Explore サブエージェント2件による並列コード調査＋自己確認で行った。

---

## 1. 確定した不具合・整合性の懸念(CONFIRMED)

### 1.1 `world.replace` のロールバックが例外安全でない（P0-2 の "Verified" は過大評価）

- **ファイル**: `src/runtime/worldRuntime.ts:2265-2289`
- **経緯**: `replaceDocument()` は `assertValidWorldDocument(document)` によるスキーマ preflight を変更前に実行しており、これ自体は健全に機能している（`worldRuntime.ts:2265-2268`）。preflight 通過後、`structuredClone` によるスナップショット `previous` を取得し、`try` ブロック内で `applyDocument(document)` を実行する（`:2269-2289`）。
- **不具合**: `applyDocument()` が **preflight 後・適用中** に例外を投げた場合、`catch` ブロックは復元のため `applyDocument(previous)` を再度呼び出すが、この復元呼び出し自体は try/catch で囲まれていない。復元処理は1回目の失敗時と**同一のコードパス**（`bindSimulationCellColumns`、`bindExtensionStateSlices`、`restoreRngFromSimulation` 等、`worldRuntime.ts:2292-2332`）を再び通るため、復元自体が失敗する可能性が現実的にある。
- **失敗シナリオ**: 拡張スライスのバインド処理などで `applyDocument` が失敗し、復元の再適用でも同種の原因（壊れたスライスデータ等）で再度例外が発生すると、例外がそのまま伝播し、`world`/`simulation`/`presentation` が**部分的に変更された状態のまま**残る。
- **裏付け**: remediation 表 P0-2 の完了条件は「apply 中の failure でも live world / simulation / presentation が不変」（`docs/reviews/unite-data-and-map-remediation.md:13`）だが、これと矛盾する。`worldRuntime.test.ts:264-283` は preflight 拒否（`pack.burgs` 欠落など）のケースのみを検証しており、「preflight は通過したが `applyDocument` 自体が失敗する」経路のテストは存在しない（`world.generate` 側には同様のテスト `worldRuntime.test.ts:311+` が存在するのと対照的）。未検証のまま "Verified" と記録されている。
- **重大度**: 高——保存・読込・拡張機能の組み合わせ次第で発生しうる、live state 破損の潜在経路。

### 1.2 `TransactionWriter` は実際の書き込みを一切強制しない（P2-11 の残作業記述はリスクを過小に見せている）

- **ファイル**: `src/runtime/transactionWriter.ts:16-44`
- **経緯**: `createTransactionWriter` が返すオブジェクトの実体は `markChanged(...topics)` のみで、宣言済み `writes` に含まれるかどうかをチェックして `changed` リストに追加するだけである。Proxy 等による `pack`/`simulation` オブジェクトへの書き込みインターセプトは一切行われていない（同ファイルの doc comment `:11-14` 自体が「systems may still mutate live pack/simulation in place; `markChanged` is the enforced seam that records which topics those mutations affect」と明記している）。
- **不具合**: system は `writes` に宣言していないフィールドを自由に書き換えられる（強制的な拒否は起きない）。逆に、実際に書き換えたフィールドに対応する `markChanged` の呼び出しを system が忘れても、検出する手段が存在しない。
- **失敗シナリオ**: 例えば `src/generators/demography-simulator.ts` のような system 実装内の直接インポート経由の `pack.cells.burg[i]` 書き換え（`:146` 付近）で、対応する topic の `markChanged` 呼び出しが漏れた場合、RenderCoordinator は該当 topic の revision を発行しないため、SVG/WebGL の投影が静かに stale なまま残る。バグとして顕在化するまで気づかれない。
- **裏付け**: remediation ログの P2-11 残作業欄は「完全 staged write（現状は in-place + `markChanged`）」（`docs/reviews/unite-data-and-map-remediation.md:61`）とだけ記載しているが、これは「まだ完全ではないが概ね安全」という印象を与える表現であり、実際には「書き込みパス自体への強制力がゼロで、`scripts/lint-world-writers.ts` によるコードパターン検知と規約（コードレビュー）だけが最後の防波堤」という、もう一段深刻なリスクを軽く言い換えているように読める。
- **重大度**: 中〜高——即座に顕在化するバグではないが、新規 system 追加のたびに再発しうる構造的な保証の欠如。

---

## 2. 未言及の劇的なパフォーマンス懸念

### 2.1 `simulation.stepDay` が毎日フル `structuredClone(pack)` を実行し、P2-5 により年送りで数百倍化

- **ファイル**: `src/generators/timeEngine.ts:256-270`（`takeDaySnapshot()`）、`src/runtime/simulationRunner.ts:70-90`（`runDaily`）
- **経緯**: `stepDayMutation()`（`timeEngine.ts:296-325`）はロールバック用に、実行**前に毎回** `structuredClone(worldContext.pack)` と `structuredClone(simulationContext)` のディープクローンを取得する（`takeDaySnapshot`, `:256-270`）。失敗時にのみ `restoreDaySnapshot`（`:272-290`）で使用する。
- **問題**: remediation ログ P2-5（`docs/reviews/unite-data-and-map-remediation.md:22, 433-440`）は、複数日/月/年単位の時間進行（`advanceTime`、UI の rAF ループ）を、従来の単一 `simulation.advance` バルクコミットから、`durationToCalendarDays` で日単位に展開し `simulation.stepDay` を1日ずつ呼ぶ方式に変更したと記録している。`simulationRunner.ts:70-90` の `runDaily` ループにバッチ化は無く、`advance()`（`:96-106`）は単純にこのループを回すだけである。
- **定量化**: 1年進行 ≈ 365 回、1ヶ月進行 ≈ 30 回の `stepDay` 呼び出しがそれぞれ独立してフル `pack` クローンを行う。従来は1回のバルクコミットで済んでいた処理が、100k セル級マップでは無視できないコスト増になる可能性が高い。
- **欠落している検証**: remediation ログはこの意味論変更の正しさ（tickCount の一致など）は特徴づけテストで確認しているが、コスト増そのものは一度も計測・言及していない。`scripts/benchmarkWebglLayers.ts`（`npm run perf:webgl-layers`）は単一フレームの投影性能は測るが、複数日/年送りのシナリオを含まない。
- **推奨**: 複数日進行のベンチマークケースを追加し、実測した上で、(a) スナップショットを失敗が起きたときだけ必要になる形に遅延させる、(b) 差分ベース（dirty フィールドのみ）のロールバックに変える、(c) 複数日をまとめて1トランザクションで検証してから個別コミットする、等の対策要否を判断する。
- **重大度**: 中〜高（体感パフォーマンス）——特に長期シミュレーションを多用するプレイスタイルや、大規模マップで顕在化しやすい。

---

## 3. 計画書との仕様ミスマッチ

### 3.1 P2-9 の "完了" 判定が計画書自身の必須条件と矛盾

- **ファイル**: `docs/plan/unite-data-and-map.md:827`、`src/runtime/worldRuntime.ts:886-926`
- **計画書の記述**: 「load の原子性は Phase 6 の staging pipeline で初めて保証し、generation も staging world を構築できるようになった時点で `world.generate` command へ移す。この transitional exception が残る間は『全 canonical write が dispatch 経由』という target invariant を達成済みと扱わない。」（`unite-data-and-map.md:827`）— generation が「隔離された staging world」を構築することが明示的な必須条件として書かれている。
- **実装の実態**: `executeGenerate()`（`worldRuntime.ts:886-926`）は、コード内コメント自身が認める通り「Live pack/grid act as the staging area (generators are still singleton-bound)」という方式である。すなわち generator が `worldContext` に singleton としてバインドされているため、隔離された staging オブジェクトは存在せず、実装は事前スナップショット（`previous = this.captureRollbackDocument()`, `:905`）を取った上で **live の `pack`/`grid` を直接書き換え**、失敗時にのみ `previous` へロールバックする方式のままである。
- **矛盾点**: remediation ログの個別更新エントリ（`docs/reviews/unite-data-and-map-remediation.md:444`）自体はこの仕組みを正直に説明している。しかし「計画クローズ判定マップ」は Phase 1 を「完了」（`:52`）、P2-9 を「Verified」（`:26`）としており、計画書が明示的に「達成済みと扱わない」と定めている transitional exception のままクローズ済み扱いにしている。
- **重大度**: 低〜中（実害は現時点でのバグではなく、ステータス表記の正確性の問題）——ただし今後 P2-9 を根拠に「生成経路はもう安全に staging されている」と誤った前提で追加変更を行うと、二次的な設計ミスにつながりうる。

---

## 4. 仕様設計そのものの懸念

### 4.1 未知の opaque extension chunk がコア削除を永久にブロックしうる

- **ファイル**: `src/runtime/worldArchive.ts:196-216`（`assertOpaqueCoreDeletesAllowed`）
- **仕様**: `coreReferences === "unknown"` の opaque extension chunk が1つでも存在すると、`for (const chunk of chunks)` ループにより、**種類を問わずあらゆるコアエンティティの削除**（state / burg / province / culture / religion / route / marker / zone…）が無条件で拒否される（`:202-204`）。
- **発生条件**: これは、動的（ZIP）拡張機能をインストール・使用した後にアンインストール、または拡張機能パッケージを紛失した場合や、`collectCoreReferences` を実装する前の古いバージョンで保存されたデータが `.fmg` に残っている場合に容易に発生しうる。`extensionStateSliceRegistry.ts:353-364`（`demoteRegisteredSliceToOpaque`）は、対応する `spec` が registry に見つからない場合、`coreReferences: "unknown"` として無条件に opaque 化する。
- **エスケープハッチの不在**: `opaqueExtensionChunks` を参照するファイルは `src/runtime/worldArchive.ts` / `src/runtime/extensionStateSliceRegistry.ts` / `src/runtime/worldRuntime.ts` の3ファイルのみであり、`src/ui/` や `src/controllers/` を含め、この opaque chunk をユーザーが確認・破棄する UI・コマンドは一切存在しない。
- **失敗シナリオ**: ユーザーが試しに動的拡張機能をインストールしてマップを保存し、その後アンインストールした（あるいは配布元からZIPが入手できなくなった）場合、そのマップでは以後**あらゆる削除操作**（state 削除、burg 削除、province 統合、culture/religion 削除、route/marker/zone 削除等）が例外で失敗し続ける。回復手段は、同一の拡張機能を再インストールして `collectCoreReferences` を実行させるか、アーカイブファイルをアプリ外で手動編集する以外にない。
- **設計意図の評価**: 安全側に倒す（不明な参照がある限り削除を拒否する）という設計思想自体は理解できるが、"unknown" を「特定の種類のみ疑わしいとみなす」等に緩和する仕組みも、chunk を明示的に破棄するUIも計画・実装のどちらにも存在しない。実運用上、ユーザーが原因を理解できないまま「削除ボタンが常にエラーになる」という体験に直結するトラップになり得る。
- **重大度**: 中——即座に顕在化するバグではないが、動的拡張機能を試用してから外す、という一般的な利用パターンで踏みやすい。

---

## 5. 問題なしと確認できた項目（参考）

- **P2-2「PresentationData が WebGL スタイルの単一ソースになった」**: `src/renderers/webgl/webglStyleExtractors.ts` を全体確認した結果、ocean/land 以外の抽出関数（burg icon、label、height 等）も含めてすべて `getPresentationStyle`/`getPresentationStyleRecord`（`src/runtime/presentationData.ts:62,70`）経由であり、live SVG DOM の読み取りは無い。唯一の残存例外はドキュメントが明記する通り `src/renderers/webgl/burgIconRasterCache.ts:78` のアイコンラスタキャッシュのみで、記述は正確（むしろ控えめ）だった。
- **P0-2 の拡張スライス検証範囲の記述**: 「未知 extension slice も安全な record container でなければ拒否する」（`docs/reviews/unite-data-and-map-remediation.md:232`）という記述は、`extensionStateSlices.ts:351-370` / `extensionStateSliceRegistry.ts:209-228` の実装（組み込み4拡張のみフィールドレベル検証、それ以外は `isRecord` チェックのみ）と一致しており、過大表現ではなかった。

---

## 6. 優先度整理（次セッションの検討材料、未合意）

| # | 項目 | 種別 | 暫定重大度 |
| :-- | :-- | :-- | :-- |
| 1.1 | `world.replace` ロールバックの非例外安全性 | バグ | 高 |
| 1.2 | `TransactionWriter` の書き込み非強制 | 設計/バグ潜在 | 中〜高 |
| 2.1 | `stepDay` 毎日フルクローンによる年送りの性能劣化 | パフォーマンス | 中〜高 |
| 3.1 | P2-9 "完了" 判定と計画書の staging 必須条件の矛盾 | ドキュメント正確性 | 低〜中 |
| 4.1 | opaque chunk "unknown" によるコア削除永久ブロック | 仕様設計 | 中 |

対応順序・着手要否はユーザーと未合意。次セッションはこの表を起点に優先度を確認してから着手すること。
