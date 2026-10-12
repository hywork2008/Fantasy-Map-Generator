# 共有マップサーバー (map:server)

目的: サーバーが .fmg を1つ保持し、編集者1人がブラウザから保存、閲覧者(人・AI)が同一の地図から都市データを取得する。ブラウザ単独動作は維持する。

## 構成

- `npm run map:server -- <map.fmg> [--port 8787] [--editor-token T] [--read-token T]` (`scripts/mapServer.mjs`, 依存追加なし)。
- 地図は子プロセス(`mapServerWorker.mjs`)に jsdom + Vite module runner で読み込む。ce:perf と同じ仕組みで、`getBurgSiteDescriptor` をそのまま Node で実行する。差し替え時はプロセスごと入れ替え、FMG のモジュールキャッシュが古くならないようにする。
- ブラウザ側は `src/io/mapServer.ts`。サーバーが無ければ何もしない(Save/Load のボタンも出ない)。

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | /api/health | `{ok, version, writable}` |
| GET | /api/map | .fmg 本体、ETag=version |
| PUT | /api/map | 編集トークン + `If-Match: <version>` 必須。不一致は 409、読み込めないファイルは 422 で、共有ファイルは変更しない |
| GET | /api/burgs[?q=名前] | 都市一覧 |
| GET | /api/burgs/:id | Burg Site Descriptor |
| GET | /api/events | SSE。地図が置き換わると `map` イベント |

認証: `--read-token` を指定すると GET も Bearer 必須。`--editor-token` 未指定なら書き込み不可。

## 開発時

`FMG_MAP_SERVER=http://127.0.0.1:8787 npm run dev` で Vite が `/api/map|burgs|health|events` を転送する。ビルド成果物から使う場合は `VITE_MAP_SERVER` にサーバーURLを指定する(CORSは許可済み)。

## 未実装

- 閲覧者の自動再読込(現状は通知のみ)。
- 地図全体を毎回送るため、巨大地図の差分更新は未対応。
- 編集者が複数いる場合の排他はETag照合のみ。
