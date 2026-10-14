# CE Phase 7 総合検証

[ロードマップ](../../../docs/city-editor/plan/architecture-refactoring-roadmap.md)と[実装記録](../../../docs/city-editor/reviews/1014-ce-refactoring-phase7.md)の再検証用。リポジトリルートで実行する。比較・性能はテスト終了後に順次実行し、同じNode・依存パッケージ・マシンを使う。

```sh
npx vitest run city-editor --maxWorkers=4
npx tsc --noEmit
node --import tsx scripts/lint-architecture.ts

# 出力先は新しいディレクトリにする。廃止CGを含まず、workspaceのnode_modulesを借用する。
node scripts/city-editor/phase7/prepare.mjs cf32584ecfe5e2e510e8f01e536184db00791b3d artifacts/city-editor/phase7-20261014/pre-refactor

node --expose-gc scripts/city-editor/phase7/compare.mjs --root=artifacts/city-editor/phase7-20261014/pre-refactor --mode=stages --out=artifacts/city-editor/phase7-20261014/stages-before.json
node --expose-gc scripts/city-editor/phase7/compare.mjs --mode=stages --out=artifacts/city-editor/phase7-20261014/stages-after.json
node scripts/city-editor/phase7/verify.mjs artifacts/city-editor/phase7-20261014

node scripts/city-editor/phase7/compare.mjs --mode=request --out=artifacts/city-editor/phase7-20261014/large-request.json
node --expose-gc scripts/city-editor/phase7/compare.mjs --root=artifacts/city-editor/phase7-20261014/pre-refactor --mode=performance --request=artifacts/city-editor/phase7-20261014/large-request.json --out=artifacts/city-editor/phase7-20261014/performance-before.json
node --expose-gc scripts/city-editor/phase7/compare.mjs --mode=performance --request=artifacts/city-editor/phase7-20261014/large-request.json --out=artifacts/city-editor/phase7-20261014/performance-after.json
node scripts/city-editor/phase7/performance-summary.mjs artifacts/city-editor/phase7-20261014

node --expose-gc scripts/city-editor/phase7/lifetime.mjs --out=artifacts/city-editor/phase7-20261014/lifetime-final.json
```

`compare.mjs`はPhase 0の圧縮requestを既定で使う。手元にない場合は[基準採取](../phase0/README.md)で同じ8ケースを新しい出力先へ採取し、`--requests=<採取先>/baseline`をbefore/after両方に渡す。`verify.mjs`はGit管理するPhase 0 manifestとも生成文書・SVGのhashを比較する。

旧版にはcacheの公開reset APIがないため、Vite runnerだけで既存LRUのclearとward cacheの解除を公開する。旧版の生成・描画・文書のコードやtracked sourceは変更しない。生成条件・乱数・IDを変更するinstrumentationはしない。

性能は4.8 km、Large/Evolution、classic、陸地、城壁なし、legacy建物、seed `render-quality`。共通のJSON要求を使い、1回warm-up後、cold cache・同じGC地点で3回計測する。SVGは単独出力の全詳細。GC後のlive文書・SVGのheapと、文書/cacheを解放してDOM windowを閉じた後のheapを記録する。これはNode/jsdomのheapであり、実ブラウザーのGPUやフレーム時間ではない。DOM windowを使い回すとjsdomのselector cacheに最後のdetached SVGが残るため、終了後の測定ではwindowも置換する。

`lifetime.mjs`は使い捨てrunnerにWeakRefの観測hookを差し込む。生成関数のspyが文書引数を強く保持してしまう測定は使わない。3回mount、各20回のminimize/restore、文書置換、全disposeを実行し、disposerを保持した場合の旧文書回収、listener/timer/frame/cleanupの空状態、fabricの弱いkey、長寿命connectionを持つferry cacheの文書回収を確認する。製品APIに診断用のglobalやexportを増やさない。

ブラウザーsmokeはCEのMPAを実際に開き、FMG descriptorのsessionStorage受渡し、実Worker、Undo/Redo、native JSON/SVG出力・読み戻し、キャンセルを確認する。結果とPNGはartifactへ保存し、検証用server・tabを終了する。

修正前の保持を同じ入力で再現するには、`lifetime.mjs --baseline=38eb5c267381df5bb8272f794b2251cd45b60d90 --out=<別の出力先>`を使う。当該コミットのPage/ferryモジュール2件だけをrunnerに読み、他の条件は同じにする。保持の検出で終了コード1になることが期待値である。通常の修正後検証は終了コード0を要求する。
