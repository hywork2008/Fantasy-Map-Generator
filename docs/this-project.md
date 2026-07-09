# このプロジェクトについて

本プロジェクトは [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) から fork し、JavaScript で書かれていたコードを TypeScript / React / Zustand ベースへ移植しつつ、独自のシミュレーションと拡張機能を追加しているバージョンです。

コーディング規約とアーキテクチャ上の制約はリポジトリ直下の `AGENTS.md` が最優先です。特に「4層アーキテクチャ」「`window.fmg` 以外のグローバル禁止」「`pack` / `grid` 参照の in-place mutation」は守る必要があります。

## Upstream との関係

- upstream のコードは `upstream/master` ブランチで追跡しています。
- upstream のローカルクローンは `/Users/h-yamaguchi/Projects/fmg-upstream` にあります。
- `docs/upstream/` は upstream 由来の参考ドキュメントです。本プロジェクト固有の実装状況を確認するときは、`docs/upstream/` よりも `src/` とこのリポジトリ側の `docs/` を優先してください。

## 現在の実装構成

主要なエントリーポイント:

| ファイル | 役割 |
| :-- | :-- |
| `src/app.ts` | `initApp()`、React UI 初期化、`window.fmg` と `ExtensionAPI` の組み立て |
| `src/main.ts` | マップ生成パイプライン、ロード時処理、ズーム/フォーカス、ホストイベント登録 |
| `src/initViewLayers.ts` | ホスト SVG `<g>` レイヤーの作成・再取得を一元管理 |
| `src/context/*.ts` | `WorldContext` / `ViewContext` / `AppServices` / `SimulationContext` |
| `src/generators/` | 地形、国家、軍事、時間経過などのデータ生成・更新 |
| `src/renderers/` | `Readonly<WorldContext>` を入力に SVG を描画する層 |
| `src/controllers/` | UI 操作、編集操作、レイヤー制御、再描画要求 |
| `src/ui/` | React UI、タブ、ダイアログ、共有コンポーネント |
| `src/store/` | Zustand ストア |
| `src/extensions/` | 組み込み拡張と動的 ZIP 拡張の基盤 |

## 状態コンテキスト

| Context | 主な内容 |
| :-- | :-- |
| `WorldContext` | `pack` / `grid` / seed / mapId / notes / options / style / biomes / name bases / logical map size / population and distance settings |
| `ViewContext` | SVG レイヤー参照、zoom/pan、表示サイズ、focus scope、`renderMap` フラグ |
| `AppServices` | RNG、IndexedDB ラッパー、COA renderer などの共有サービス |
| `SimulationContext` | `currentYear` / `currentMonth` / `currentDay` / `era` / `tickCount`、Nobility が使う `intelligence` と `strategicGoals` |

`SimulationContext` はセッション中に tick ごとに変化する「生きた状態」です。`worldContext.options.year/month/day/era` とは同期されますが、意味論としては別物です。

## 生成と描画

マップ生成の正確な順序は `docs/map-initialization-process.md` を参照してください。現在の大枠は以下です。

1. `initApp()` が React UI、utils、generators、renderers、controllers、main を初期化します。
2. `src/initViewLayers.ts` がホスト SVG レイヤーを作成し、`viewContext` に in-place で代入します。
3. `generate()` が grid / pack を in-place で再構築し、地形、河川、文化、都市、国家、ルート、宗教、州、軍事、マーカー、ゾーンを生成します。
4. `initSimulationClock()` 後に `fmg:generate-post-core` が dispatch され、Economy / Characters / Nobility / Shipbuilding などの拡張が派生データを生成します。
5. `drawLayers()` が表示中の SVG レイヤーを描画し、最後に拡張の draw layer hook を呼びます。

## 拡張機能

組み込み拡張は `src/extensions/index.ts` から以下の順に初期化されます。

| ID | 概要 | デフォルト |
| :-- | :-- | :-- |
| `economy` | goods、markets、production、trade、taxes、treasury | disabled |
| `characters` | 汎用キャラクター名簿、能力値、性格、家族 | disabled |
| `nobility` | ruler / officer / province lord、外交補正、戦略 AI、諜報、動員、行軍制圧 | disabled、`characters` が必須 |
| `shipbuilding` | 造船所候補、伐採、建造キュー、完成船、外国干渉ログ | disabled、`economy` は任意 |

拡張は `ExtensionAPI` だけを通じてホストと通信します。動的 ZIP 拡張は blob URL で `import()` されるため、ホストモジュールを直接 import してはいけません。詳細は `docs/extension-system-guide.md` と `docs/extension-agent-spec.md` を参照してください。

## docs フォルダの読み方

| パス | 性格 |
| :-- | :-- |
| `docs/this-project.md` | このリポジトリ固有の入口 |
| `docs/map-initialization-process.md` | 初期化・生成・SVG レイヤー順序 |
| `docs/extension-system-guide.md` | 拡張システムの技術ガイド |
| `docs/extension-agent-spec.md` | AI エージェント向けの拡張実装ルール |
| `docs/simulation/advance-time.md` | Advance Time と tick hook の仕様 |
| `docs/simulation/` | 経済・人口・時間経過などのシミュレーション仕様 |
| `docs/analytics/` | 実装調査メモ |
| `docs/plan/` | 設計案、実装計画、検討ログ。一部は実装済みの履歴を含みます |
| `docs/debug/` / `docs/reviews/` | バグ調査・レビュー履歴 |
| `docs/ui/` | UI 移行・UI 関数対応表 |
| `docs/upstream/` | upstream 由来の参考資料 |

`docs/plan/`、`docs/debug/`、`docs/reviews/` には会話・調査時点の記録が多く含まれます。現在の仕様として扱う前に、必ず `src/` の実装と照合してください。
