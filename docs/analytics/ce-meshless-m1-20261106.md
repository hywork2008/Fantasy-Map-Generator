# メッシュなしCE M1：文書・曲線・保存・履歴・方式分岐

記録日: 2026-11-06  
状態: M1完了。次はM2「自動・プリセット・自由描画、幅、市壁パラメーター」のうち、手動曲線・プリセット操作から進める。

設計: [CEメッシュなし都市生成・編集](../plan/ce-meshless-city-editor.md)。前段: [M0記録](ce-meshless-m0-20261106.md)。

## 1. 実装範囲

M1では、セルメッシュを持たない手動文書を保存・読込・表示し、曲線上の参照を保った編集transactionとUndo／Redoを扱えるようにした。既存CEのGeneration methodへ「Meshless (document preview)／メッシュなし（文書プレビュー）」を追加した。

この選択で開くのは専用文書のプレビューである。既存都市の自動変換、FMGのメッシュなし自動生成、対話的な線描画、幅付きの河岸・道路面、市壁の開口処理、3D表示はまだ実装していない。画面の説明でもその範囲を示す。既存のメッシュ方式・現行skeleton-first・Freeformは従来の処理を使う。

## 2. 文書と曲線の正本

| 実装 | 内容 |
| --- | --- |
| `src/city-editor/types/vector/document.ts` | `VectorCityDocument`、曲線・プリセット・幅・anchor・接続・領域・配置の契約 |
| `types/editorDocument.ts` | host境界の`EditorDocument = CityDocument | VectorCityDocument`と方式判別 |
| `generators/vector/document.ts` | 空文書と小さい手動サンプルの生成 |
| `generators/vector/geometry/curves.ts` | 曲線上の位置・解析的接線、プリセット区間ID、De Casteljauによる分割 |
| `generators/vector/validation/document.ts` | 形式、形状、ID、参照、共有点、閉鎖、領域等の検証 |
| `services/io/vector/documentCodec.ts` | 専用のparse／serialize |

新しいnative形式は`format: "fmg-vector-city"`、`version: 1`。`mesh`、`faceId`、メッシュのダミー辺は持たない。`CityDocument.mesh`をoptional化していない。

v1で保存するものはframe、context、paths、connections、regions、placements、recipeとrevision。曲線の点はメートルの+X東・+Y北、プリセットの`bearingDegrees`は幅軸の方位（北0度、時計回り）、配置の`facingDegrees`も北0度・時計回りとした。SVGへのY反転はrendererに限定する。

- 曲線は安定したIDを持つ直線区間と三次ベジェ区間。連続する区間の端点、閉曲線の始終点を検証する。
- プリセットは楕円、矩形、多角形のrecipeを正本とする。幅・高さが同じ楕円が円になる。楕円は解析式とSVGのarcで評価・表示し、制御点への近似変換で保存形状を失わない。
- プリセットの区間IDは楕円の`arc:0..3`、矩形・多角形の`edge:0..n`。位置・寸法・方位の値だけを変えても区間の識別方法は変わらない。
- 幅は左右の基準幅と曲線上の基準点で保存する。M1のプレビューは中心線を表示し、幅付き領域を計算した結果のようには表示しない。
- 接続は共有ノード、道路区間、門、市壁回路として保存する。anchorは`pathId + segmentId + t`であり、最近傍への自動付替えをしない。
- 共有ノードと曲線上の点を1e-6 m以内で検証する。門と道路の接続には同じノードと対応するanchorが必要。
- 面領域と配置敷地は外周と穴を保持する。穴が外周を跨ぐ、穴同士が交差・包含する、不正な単純ポリゴンとなる文書を拒否する。

v1の既知でないフィールドや新しいversionを黙って捨てない。M2以降で保存契約を広げる際は、版と移行処理を明示する。設計上のFMG入力由来情報、地形、橋、都市run等の全契約がM1で揃ったという意味ではない。

初期の文書上限はpaths 2048、区間合計16384、各entity表10000、輪郭512点、codec入力文字列8×1024×1024 UTF-16 code units。大都市向けの最終上限ではなく、小さい手動文書を対象とするM1の上限である。

## 3. 参照を保った分割と履歴

`generators/vector/editing/splitPath.ts:splitVectorPath`は、元文書を変更せず、区間分割と次の参照更新を一度に行う。

- 幅の基準点
- 接続ノードのanchor
- 道路区間の始終anchor
- 門のanchor
- 配置物のaccess参照

分割対象でない区間のIDは変えない。分割点そのもののanchorは左区間の`t=1`へ写し、右側の点は右区間の局所パラメーターへ写す。新しい区間IDの衝突、範囲外の分割、固定曲線の編集、分割後の不正な参照は確定前に拒否する。

三次ベジェの分割前後で21位置の一致（1e-10 m未満）、ノードの不動、幅と配置参照の更新、直線道路と共有門の参照維持、保存・読込を確認した。これはM2の編集ツールを接続するためのドメインAPIで、M1画面から制御点をドラッグする機能はまだない。

`generators/vector/history.ts:VectorDocumentHistory`は専用のsnapshot履歴である。既存`DocumentHistory`のメッシュ差分処理を変更していない。共通`DocumentHistoryState`だけを既定型`CityDocument`付きのgenericにし、旧呼出側の型を維持した。

commit／amend／reset前に検証・cloneを済ませ、不正なtransactionで現在の履歴やredoを失わない。戻り値と外部の入力を変更しても内部snapshotへ波及しない。Undo／Redoで曲線、anchor、幅、配置、revisionを一括で戻す。Undo後の新commitとamendは先のredoを破棄する。

## 4. IOと画面の境界

### 4.1 読込・保存

`services/io/cityEditorFile.ts`でnativeの`fmg-vector-city`を判別し、専用codecへ渡す。認識したvector形式が壊れている場合はMFCGや旧形式へfallbackしない。旧nativeとFreeformは既存codecを使う。

`ImportedCityMap`に判別用の`source: "vector-city"`を追加した。`controllers/documentIO.ts`はこの判別をメッシュ参照・施設通路修復・旧履歴作成より前に行い、hostの専用画面へ渡す。既存の地図領域へのファイルdropからも新文書を開ける。

保存は`ce-vector-YYYYMMDD-HHMMSS.json`。プリセット、制御点、区間ID、anchor、幅、origin／editPolicy、配置をそのまま保存し、`CityDocument`への空メッシュ投影は行わない。

### 4.2 専用画面と方式切替

`components/CityEditorPage.ts`の入口に`initialDocument`による方式分岐を設けた。vector文書は旧グリッド、セル索引、メッシュcontroller、3D sceneを初期化する前に`components/vector/VectorEditorPage.ts`へ進む。

専用画面は共通ボタンとlifetimeの仕組みを使い、新規、手動サンプル、Undo／Redo、ファイル読込、保存、旧画面への復帰を扱う。`renderers/vector/documentSvg.ts`は保存された曲線・ノード・面・敷地だけを描画し、都市や建物を再生成しない。

メッシュ版から方式を切り替える場合は元文書・設定・履歴・UI状態を保持し、旧scopeの入力イベント・Worker・3D資源を解放する。「メッシュ版の編集画面に戻る」で状態を復元し、再度メッシュなしを開けば専用履歴も保持する。最初に返したdispose handleは方式切替・言語変更後の現在の画面にも有効である。明示的に閉じた時は保持文書も解放し、閉じた世代の古いhandleで新しいmountを破棄しない。

専用画面のファイル読込はlifetime ticketで管理する。読込中の新規作成、サンプル読込、Undo、Redo、別の読込、unmountで古い結果を採用しない。これはファイル操作の保護であり、M6の生成job／部分再生成まで実装したという意味ではない。

## 5. 固定サンプル

[vector-manual-v1.json](../../src/city-editor/data/fixtures/vector-manual-v1.json)は、図枠400 m、円、楕円、矩形、直線道路、三次ベジェ河川の5本と2つの共有接続点、1つの門、市壁回路、可変幅の基準点を持つ。メッシュは含まない。

SHA-256: `5fe9ca0fa010580aea0cf1b4374d0b7ae67ded9b6ca193151ed1dee992eb4359`。

`createVectorExample()`の結果と固定ファイルが一致することをテストしている。これは都市自動生成の結果や、河川交差・門の開口幅まで検証済みの完成都市ではなく、文書・曲線・参照の固定入力である。

## 6. 検証

### 6.1 関連テスト

最終変更に関係するテストは、重複を除いて69件が成功した。

| 対象 | 件数 | 確認内容 |
| --- | --- | --- |
| vector文書・IO、旧ファイル・Freeform・履歴、日英キー | 60 | 曲線と参照の保存、不正文書の拒否、分割・履歴、既存形式の維持、翻訳キー |
| vector画面 | 6 | グリッド未構築、保存形状の表示、Undo／Redo、旧状態復元、dropの方式分岐、不正・遅延import、閉じた文書と古いdispose handleの扱い |
| 旧画面の言語切替 | 2 | 文書・seed・設定・Undo履歴・3D sceneの維持 |
| 旧生成方法の選択 | 1 | mesh-firstの既定とskeleton-firstだけの形状設定 |

実行したコマンド:

```sh
npx vitest run src/city-editor/generators/vector/document.test.ts src/city-editor/services/io/vector/documentCodec.test.ts src/city-editor/services/io/cityEditorFile.test.ts src/city-editor/generators/history.test.ts src/city-editor/generators/freeform/freeformCity.test.ts src/i18n/editorMessages.test.ts
npx vitest run src/city-editor/components/CityEditorPage.vector.test.ts
npx vitest run src/city-editor/components/CityEditorPage.language.test.ts
npx vitest run src/city-editor/components/CityEditorPage.vector.test.ts src/city-editor/components/CityEditorPage.skeleton.test.ts -t 'routes a vector|keeps the existing method by default'
```

最後のコマンドのvector drop 1件は、vector画面6件にも含まれるため総数で二重計上していない。lifetimeの変更後はvector画面・言語切替の8件、古いhandleへの対処後は該当する1件を再確認した。全件テストや多数seed探索は実行していない。

### 6.2 実ブラウザー

ローカルのCEをPlaywright経由で操作した。

1. Generation methodからメッシュなしを選択。
2. サンプル読込で5本の曲線・2接続点を表示。円・楕円はarc、河川はcubicとして描画されることを確認。
3. 文書をダウンロードし、固定サンプルとのJSON内容の完全一致を確認。
4. Undo、保存ファイルの再読込、Undo／Redoで表示が切り替わることを確認。
5. 旧画面へ戻ると元の582セル・mesh-first・元の履歴が復元され、再度切り替えるとvectorの5本・2接続点が保持されることを確認。

ダウンロードしたファイルのSHA-256は`bd020518290b31daddf6ad4654349e4d04999b66850a8c964735052525bd18a8`。固定JSONと末尾改行の有無が異なるが、parse後の全内容が一致した。画像・ダウンロード・操作ログはGit管理外の`.playwright-mcp/`へ一時出力した。

実ブラウザーのconsoleにはfaviconの404が1件あり、今回の画面操作による例外はなかった。関連jsdomテストにはCanvas未実装のメッセージが出たが、失敗はなかった。

### 6.3 静的確認と既存の問題

- M1当初のBiome確認では`controllers/documentIO.ts:useStandaloneSite`がReact hook factoryと判定されたため、`lint/correctness/noComponentHookFactories`をskipした。その後のpre-commit修正で関数と呼出先を`applyStandaloneSite`へ統一し、ルールを除外しないBiome検査を通す対応を行った。
- `npx tsc --noEmit`では今回の追加・変更箇所にエラーは出ていない。プロジェクト全体は既存の`src/controllers/charts-overview.ts:560`（TS2322）と`src/services/approachPrior.ts:259`（TS2488）で未通過。
- M0計測JSONは当時のソースハッシュを持つ記録として維持した。M1で履歴interfaceやhostを変えたため、M0の全ソースハッシュが現在の作業ツリーと一致するとは扱わない。

## 7. 次の作業

M2で、保存済みのプリセットへ幅・高さ／面積・縦横比・方位の操作を接続し、フリーハンド・折れ線・ベジェの作成と制御点編集を追加する。M1の`splitVectorPath`と専用履歴を使い、anchorを失わないtransactionにする。

河岸・道路面の幅評価、プリセットから曲線への変換、角丸、近似精度の保証、固定曲線の編集制御はM2以降で扱う。二重壁間の経路探索、橋の幾何・規約整合、門の開口と道路接続の意味検証はM3、都市生成はM4以降であり、M1の中心線プレビューをその代替にしない。
