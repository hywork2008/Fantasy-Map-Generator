# CE Phase 0 調査・基準採取

このディレクトリはGit管理する再採取ツール。調査結果は [Phase 0記録](../../../docs/city-editor/reviews/1013-ce-refactoring-phase0.md)、比較用hashと失敗名は [基準manifest](../../../docs/city-editor/reviews/1013-ce-phase0-baseline.json) に保持する。

生成物はGit管理対象外の `artifacts/city-editor/` へ出力する。2026-10-13の既存結果は `phase0-20261013/`、既定の新規出力先は `phase0-current/`。`CE_PHASE0_OUTPUT` で出力ルートを変更できる。

リポジトリルートから実行する。

```sh
# import/export、関数、ソースhashの棚卸し → inventory/inventory.json
node scripts/city-editor/phase0/inventory.mjs

# テスト終了後、ほかの高負荷処理と重ねずに採取 → baseline/
node scripts/city-editor/phase0/capture.mjs gothengsfeld-20261012 erente-20261009 atheiate-20261003 hekus-ui-request-20261007 synthetic-circulade synthetic-bram synthetic-double-inner synthetic-double-outer
```

captureは同名resultへの上書きを拒否する。再比較時は新しい出力先を使う。

```sh
CE_PHASE0_OUTPUT=artifacts/city-editor/phase1-check node scripts/city-editor/phase0/inventory.mjs
CE_PHASE0_OUTPUT=artifacts/city-editor/phase1-check node scripts/city-editor/phase0/capture.mjs gothengsfeld-20261012
```

`logs/` は実行ログで確認後に削除可能。`inventory/` は再取得可能な一覧。`baseline/` は後続フェーズとの比較が終わるまでローカルに保持する圧縮入力・文書・SVGと詳細結果。gzipを展開して比較する。テスト実行そのものはスクリプトに含まれない。

基準manifestは過去の記録であり、再採取時に上書きしない。Nodeバージョン等の条件が変わった場合は、別の基準として記録する。
