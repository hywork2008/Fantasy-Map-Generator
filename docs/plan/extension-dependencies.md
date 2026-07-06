# Extension Dependencies Architecture

本ドキュメントは、Fantasy Map Generator (FMG) の拡張機能（Extension）システムにおける「依存関係（Dependencies）」の仕様と実装目的を定義するAI向けの設計資料です。
新しく拡張機能を実装・追加するAIエージェントは、本資料を参照して安全な設計を行ってください。

## 1. 目的（Why we need Extension Dependencies）

FMGのコア機能（地形生成・描画・基盤データ）をクリーンに保つため、特定のドメインロジック（経済、軍事、貴族制度など）はコアにハードコーディングせず、拡張機能（Extension）として切り出すアーキテクチャを採用しています。

しかし、拡張機能が高度化するにつれ、「拡張機能Bは、拡張機能Aが提供するデータを前提とする（例：交易路システムは、経済システムの特産品データを必要とする）」といったケースが発生します。
これを無秩序に許可すると、ユーザーがAを無効化しているのにBを実行しようとしてクラッシュする「依存関係地獄」に陥ります。

これを防ぎ、拡張機能間の安全な連携とUIレベルでの整合性を保証するために、**必須（Required）および任意（Optional）の依存関係宣言システム**を導入しました。

## 2. 実装の仕様（Implementation Details）

### 2.1. データ構造の拡張
`src/store/extensionState.ts` および `src/extensions/extensionDB.ts` にて、以下の型を追加・拡張しました。
`ExtensionDependency` は `extensionState.ts` を唯一の定義元(source of truth)とし、`extensionDB.ts` はそれを再import して使います（型の二重定義を避けるため）。

```typescript
// src/store/extensionState.ts
export interface ExtensionDependency {
  id: string;        // 依存先拡張機能のID
  required: boolean; // true: 必須 (不足時は有効化/維持不可), false: あればなお良い (動作は可能)
}

// 組み込み(Built-in)拡張機能用
export interface ExtensionConfig {
  ...
  dependencies?: ExtensionDependency[];
}

/** 依存グラフ判定専用の軽量メタ情報。無効化中の拡張機能についても保持し続ける。 */
export interface ExtensionMeta {
  id: string;
  name: string;
  dependencies?: ExtensionDependency[];
}

// src/extensions/extensionDB.ts（動的Zip拡張機能用）
import type { ExtensionDependency } from "../store/extensionState";

export interface ExtensionManifest {
  ...
  dependencies?: ExtensionDependency[];
}
```

### 2.2. 検証ロジックの所在 — `extensionState.ts` の `toggleExtension` アクション

依存関係の整合性チェックは **UIコンポーネントではなく、状態の唯一の書き込み口である `extensionState.ts` の `toggleExtension` action内**で行われます。これは `ExtensionAPI.toggleExtension` として拡張機能自身にも公開されているため、UI(`ExtensionsTab.tsx`)を経由しない呼び出し経路（拡張機能同士のAPI呼び出し、将来の設定インポート機能など）でも同じ保証が効くようにするためです。

```typescript
// src/store/extensionState.ts
toggleExtension: (id, forceState) => boolean; // 成功したら true、ブロックされたら false と toggleError をセット
```

- `extensionMeta: Record<string, ExtensionMeta>` に、有効/無効を問わず**全ての既知の拡張機能**（組み込み + 動的）の依存グラフ情報を保持します。
  - 組み込み拡張機能は `registerExtension()` が呼ばれるたびに自動的に反映されます（常に有効・無効に関わらず情報が残ります）。
  - 動的拡張機能は無効化されると `extensions` からは消えますが、`ExtensionsTab.tsx` が IndexedDB (`extensionDB`) とのマージ結果を `setExtensionMeta()` でstoreへ反映するため、無効化中でも依存情報は失われません。
- `toggleError: string | null` に、直近の `toggleExtension` 呼び出しがブロックされた理由が入ります。UIはこれを読んでエラーメッセージとして表示するだけです。

`ExtensionsTab.tsx` はこのロジックを一切持たず、`toggleExtension(id, nextState)` を呼んで戻り値を見るだけの薄いラッパーです。

### 2.3. トグル制御の仕様（`ExtensionsTab.tsx` の見た目 ⇔ `toggleExtension` の判定は対称）

ユーザーが拡張機能タブ（ExtensionsTab）で有効/無効を切り替える際、以下の安全機構（セーフガード）が働きます。無効化・有効化のどちらも**ブロックのみ**で、他の拡張機能を自動的に操作することはありません。

1. **有効化ブロック (Enable Prevention)**
   * 対象の拡張機能が `required: true` としている依存先拡張機能が「有効（Enabled）」になっていない場合、`toggleExtension` はそれを拒否し、UI上のトグルスイッチも `disabled` になります。
   * 欠落している依存先はUIに赤色で警告表示されます（Optionalなものはオレンジ色）。
2. **無効化ブロック (Disable Prevention)**
   * ユーザーがある拡張機能（例：Extension A）を無効化しようとした際、現在有効な他の拡張機能の中に「Extension Aを必須（required）として依存している」ものが存在する場合、`toggleExtension` はそれを拒否します。UI上のトグルスイッチも `disabled` になり、ツールチップに「どの拡張機能が要求しているか」を表示します。
   * ユーザーは、依存している側の拡張機能を先に無効化することで、初めて Extension A を無効化できます。
   * **連動無効化（他拡張機能を自動的に無効化する挙動）は採用していません。** ユーザーが直接操作していない拡張機能の状態を暗黙に書き換えるのは、タグ付け・整合性チェックという本来のスコープを超えるため、また循環依存が宣言された場合に無限再帰を引き起こす実装リスクがあるためです。

## 3. AIエージェントへの設計ガイドライン

今後、新しい拡張機能を設計・実装する場合は以下のルールを遵守してください。

* **安易な依存関係を作らない**： 拡張機能は可能な限り「独立・疎結合」に保ってください。依存チェーンが長くなりすぎる場合は、設計の分割粒度が間違っている（細かすぎる、あるいはコア機能として吸収すべき機能である）可能性を疑ってください。
* **マニフェストへの明記**： 別の拡張機能のAPIやデータモデルをどうしても利用する必要がある場合は、必ず自身の `ExtensionConfig` または `manifest.json` の `dependencies` に対象のIDと必須要否を定義してください。
* **循環依存を宣言しない**： 拡張機能A・B同士が互いを `required: true` として依存させる、あるいは自分自身を依存先に含めるような宣言はしないでください。依存関係は非循環グラフ（DAG）である前提で設計されています。
* **コアの直接変更禁止**： コアの描画サイクルやジェネレーター側に、特定の拡張機能が有効かどうかを判定するハードコード（`if (enabledExtensions['economy']) { ... }` など）を埋め込んではいけません。通信は常に `ExtensionAPI` か、カスタムイベント等の疎結合な手段を用いてください。
* **状態変更は `toggleExtension` を経由する**： 拡張機能の有効/無効を切り替える場合は、必ず `ExtensionAPI.toggleExtension()` を呼び出してください。これは `boolean` を返し、依存関係違反があれば `false` を返して何も変更しません。この検証を独自にバイパスする実装（`enabledExtensions` を直接書き換える等）をしてはいけません。
