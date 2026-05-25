# リファクタリング方針・コーディング規約（実装ガイド）

更新日: 2026-05-24

## 目的

本ガイドは、既存の移行計画と監査ドキュメントを実装規約として統合したものです。

- JavaScript から TypeScript への移行を安全に進める
- レガシーなグローバル依存を排除する
- window 直下の汚染を防ぎ、window.fmg に公開面を統一する
- 機能追加時の設計・命名・テスト方針を統一する

対象は主に packages 配下の TypeScript 実装です。public/modules 配下は移植元資産であり、原則として新規編集しません。

## 最上位原則

1. 実装の単一責務を守る
2. 公開 API は機能単位で公開する
3. クラスやインスタンスをグローバル公開しない
4. 依存は import で明示する
5. 実行時エラーを E2E で捕捉する

## アーキテクチャ境界

以下の責務分離を厳守します。

- State: データ保持のみ
- Generators: ワールド生成ロジック
- Editors: UI からの状態変更
- Renderer: 描画専任（状態を書き換えない）

依存方向の原則:

- core は renderer に依存しない
- renderer は描画処理に集中し、副作用を最小化する
- legacy-ui から core/shared への参照は明示 import を優先する

## グローバル公開ルール

### 禁止

- window.SomeClass = ClassDefinition
- window.someInstance = new SomeClass()
- window 直下への関数・変数の追加

### 許可

- window.fmg のみをグローバル公開面とする
- window.fmg には機能（関数）または機能インターフェースのみを登録する
- window.fmg への登録は initializeFmg() の単一エントリーポイントでのみ行う

### 実装テンプレート

1. FmgGlobalContext に型を追加
2. 各モジュールファイルでは export のみを行い、window.fmg 代入を禁止する
3. initializeFmg() でインスタンス化とメソッド bind を実施して window.fmg へ一括登録する
4. 呼び出し側は window.fmg 経由、または import 呼び出しへ移行

## import/export 規約

1. すべての機能は export し、呼び出し側は import を基本にする
2. 移行期間の互換性は globals-compat に集約する
3. declare let/const による暗黙グローバル参照を新規追加しない
4. 既存の暗黙参照を見つけた場合は import へ置換する

## クラス設計規約

1. Function properties パターンを使用しない
2. prototype 経由の状態保持を廃止し、クラスメンバーへ移す
3. this に依存する公開関数は bind またはラッパーで公開する
4. 命名は簡潔なドメイン名を使い、不要な Module 接尾辞は付けない

## TypeScript 規約

1. any/unknown は境界部のみで使用し、内部では具体型に収束させる
2. ui-legacy-globals.d.ts は段階的に縮小し、実体 import へ移行する
3. window.fmg に公開した機能は型定義と実装を同時更新する
4. 型変更時は呼び出し側の引数数・戻り値・nullability を必ず確認する

## Renderer 実装規約

1. renderer 関数は export し、呼び出しは import ベースに統一する
2. renderer ファイル内で window 直下代入を行わない
3. 描画前提データはガードを置き、未初期化時にクラッシュさせない
4. HTML/SVG 文字列生成時は型を明示し、暗黙の変換に依存しない

## レガシー互換運用

1. 互換レイヤーは globals-compat に限定する
2. 互換 API は initializeFmg() から登録し、段階的に削減して import 利用へ置換する
3. 互換のために追加した公開関数は削除条件を issue または計画書に残す

## テスト規約

1. 変更後は最小でも npm run build を実施する
2. UI 変更では Playwright E2E を実施する
3. コンソールスモークテストは非無視エラーをすべて失敗扱いにする
4. 再現手順がある不具合は、その手順を E2E に追加して回帰防止する

推奨テスト観点:

- Tools 配下の主要ボタン押下
- ダイアログ開閉時の pageerror/console.error
- レイヤー切替と再描画
- 保存・エクスポート・ロードの導線

## リファクタリング手順（標準フロー）

1. 対象機能の参照元を検索
2. 実体関数を export 可能な形へ整理
3. 呼び出し側を import に置換
4. 必要な機能のみ window.fmg へ登録
5. 型定義同期
6. build/E2E 検証
7. 互換コード削減

## PR チェックリスト

- window 直下への新規公開がない
- window.fmg 公開は機能単位のみ
- window.fmg への登録が initializeFmg() 以外に存在しない
- 追加/変更した公開機能に型定義がある
- declare ベースの暗黙依存を増やしていない
- npm run build 成功
- 影響範囲に応じた E2E 成功
- 回帰防止テストを必要に応じて追加

## アンチパターン

- 実行時にしか検知できない暗黙グローバル依存の追加
- renderer からの状態更新
- public/modules 側への逆戻り修正
- 一括巨大変更で検証不能なコミット

## 運用メモ

- docs/plans/function2class-migration-plan.md を上位計画とし、本ガイドは実装規約として扱う
- 移行中に例外運用が必要な場合は理由と撤去条件を同一PRに記載する

