# CE 森林 F4：操作・表示設定・自動品質

実施日：2026-10-28  
結果：F4を実装。次はF5の固定3入力による比較・性能校正・見た目の調整。

## 操作と保存

- Generate → Elements → Surrounding landscape に「従来／耕作地を森林化／森林に囲まれた都市」「疎林／標準／密林」と「景観を適用」を追加した。日本語・英語に対応する。
- 選択は次回の生成入力に反映する。既存都市にはボタンで適用し、一履歴としてUndo/Redoできる。都市全体の再生成を呼ばず、`withForestSettings()` で土地被覆と派生農地を更新する。生成のsource/resultとレシピも更新し、再実行へ継承する。
- ロック・固定要素で保護される農地セルの件数とセル面積を表示する。表示面積は区画の実耕作面積ではなく、対象外セル全体の面積と明記した。農地生成が停止中でもロックを外す必要のある対象を確認できる。
- Generate → View に2D表現「林縁の木と面／全域に樹木」、3D品質「自動／軽量／標準／高品質」を追加した。描画上限は折りたたみで確認できる。
- 景観モード・密度は従来の文書v6／共有v4の正本へ保存する。表示選択は端末の `localStorage` の `fmg-city-editor:forest-view` に保存し、都市の履歴・JSON・共有入力には加えない。保存が使えない場合も同じページ内では選択を維持する。不正な選択値は既定値へ戻す。
- 2D表示とSVGエクスポートに選択した表現を渡す。出力はF2の静的全景予算を使い、表示中のビューポートで欠けない。
- 3D品質の変更は森林へ渡し、市街や森林の領域を再構築しない。住宅モデルの品質とは独立する。

## 自動品質

`forestAutoQuality.ts` と `cityView.ts` に接続した。通常は描画要求にだけ応答し、品質判定専用の常時RAFやタイマーは追加しない。

| 項目 | 初版の判定 |
| --- | --- |
| 開始品質 | 標準。手動から自動へ戻した際も標準 |
| 測定対象 | カメラが変わった連続した操作フレーム。前フレーム終了から200 msを超える空白、非表示タブ、静止中、都市・森林の再構築を除く |
| 時間 | 隣接する描画開始間隔と現在の描画CPU時間の大きい方。遅いCPUフレームも採用する |
| 低下 | 33 ms超が30サンプル連続し、前の切替／初回サンプルから5秒以上で一段低下 |
| 回復 | 20 ms未満が120サンプル連続し、20秒以上で一段上昇 |
| 安定化 | 操作の中断で連続カウンターを解除。手動指定中は自動変更しない |
| 範囲 | 軽量〜高品質の3段階。F3の本数・三角形・draw calls・影の上限をそのまま使う |

計測パネルとJSONへ森林の面積、樹木数、三角形、draw calls、指定／適用品質、操作中の直近120サンプルのp95とサンプル数を追加した。2Dは森林の面積・表現・要素数を記録する。カメラ操作時間には都市全体・ブラウザーの処理が含まれ、森林だけのGPU時間ではない。判定値は暫定であり、実GPUによる校正はF5に残す。

## 検証

関連する8ファイル・30件が成功した。全件テスト・多数seedの検証は行っていない。

```sh
npx vitest run \
  src/city-editor/components/CityEditorPage.forest.test.ts \
  src/city-editor/renderers/forestAutoQuality.test.ts \
  src/city-editor/renderers/cityViewRendering.test.ts \
  src/city-editor/components/performancePanel.test.ts \
  src/city-editor/components/CityEditorPage.generationWorkspace.test.ts \
  src/city-editor/components/CityEditorPage.language.test.ts \
  src/city-editor/services/io/cityEditorFile.test.ts \
  src/i18n/editorMessages.test.ts
npx tsc --noEmit --pretty false
```

- 既存都市の設定だけの選択は文書を変更せず、適用の一操作をUndo/Redoできる。都市のメッシュ・要素を保持し、ロックされた農地を表示する。JSON再読込と新規Fort生成への設定継承を確認した。
- 表示選択で文書や履歴を変えず、再マウント後も設定を復元する。不正な列挙値を安全な既定値へ戻す。
- 自動品質の低下・遅い回復・中断・手動固定を確認した。実際のOrbitControlsのwheel入力と制御したフレーム時刻で、標準から軽量へ切り替わること、市街・森林groupを再利用すること、静止後にRAFが残らないことを確認した。
- 既存の翻訳試験の17段階という期待値が現行の18段階（農地・非表示工程を含む）に追従していなかったため、期待値と試験名を18へ更新した。生成工程自体は変更していない。
- 型検査、変更したTypeScriptのBiome、`git diff --check` が成功した。

## ブラウザー確認

再現コマンド：`node --import tsx scripts/verifyCeForestControls.mts`。F0の固定 `docs/analytics/raw/ce-forest-f0/small-flat.json` を使用する。入力がない場合はF0の手順で再生成する。ローカルViteサーバーの5202番を使う。

Headless Chromium 151、1440 × 1000、DPR 1で実際のCEページを開き、ファイル読込・適用・保存・Undo/Redo・2D表現・SVG出力・3D品質・ページ再読込を確認した。都市のメッシュと既存要素は元入力と一致し、pageerrorは0件だった。

| 状態 | 森林面積 m² |
| --- | ---: |
| 適用前 | 0 |
| 周辺全体・密林を適用 | 993,664.5634041692 |
| Undo | 0 |
| Redo | 993,664.5634041692 |
| 全域樹木へ切替 | 993,664.5634041692 |
| 保存JSONの再読込 | 993,664.5634041692 |

3Dの計測表示は `light / light`、自動へ戻すと `auto / standard` となった。俯瞰時の森林は約99.4 ha、個別立木0、34,534三角形、35 callsで、軽量・標準の予算内だった。静止画の確認であり、ここで33 msやFPSの達成を主張するものではない。

- [操作UI](ce-forest-f4/landscape-controls.png)
- [表示設定UI](ce-forest-f4/view-controls.png)
- [3Dと森林計測](ce-forest-f4/forest-3d-controls.png)
- [確認結果JSON](ce-forest-f4/results.json)

F5では固定3入力の2D・3D比較、林縁への接近・低い斜め視点、品質の上昇／低下を含む同一カメラ経路を測り、遠景樹冠やクリアランスの見た目と自動品質の閾値を調整する。必要性を実測で確認した処理だけWorker化を検討する。
