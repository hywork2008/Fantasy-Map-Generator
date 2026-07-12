# 騎士の時代と銃・大砲の時代の分離実装計画

本ドキュメントは、軍事ユニット「Artillery（大砲）」の無効化状態と、経済拡張機能（Goods）における「Gunpowder（火薬）」および「Artillery（大砲）」の流通・生産状態を一括して制御・無効化する実装計画です。

プレイヤーの要望に基づき、**「静的な設定トグル（オプション1）」**を採用し、**デフォルト状態を無効（火薬のない騎士の時代）**とします。また、無効化時は関連UIで非活性・ロックにするのではなく、**リストやテーブルから完全に非表示**にします。

---

## 1. 動作仕様

### デフォルト値の変更
* `worldContext.options.gunpowderEraEnabled` のデフォルト値を `false`（無効）とします。新規マップ生成時およびデフォルト状態では大砲・火薬は存在しない状態（騎士の時代）から開始されます。

### 無効化（`gunpowderEraEnabled === false`）時の挙動
1. **軍事（Military）レイヤー**:
   * **Military Options ダイヤログ**: ユニット一覧テーブルから `artillery`（大砲）行を完全に非表示にします。
   * **Regiments Overview（部隊一覧）**: 既存の大砲部隊の編成や追加・再計算の対象外とし、一覧UIや編成UIから大砲ユニットを非表示にします。
   * **Battle Screen（戦闘画面）**: 大砲ユニットの編成・選択肢から完全に非表示にします。
2. **経済（Economy）レイヤー**:
   * **生産・交易**: `Gunpowder` および `Artillery` の Goods はセル資源生成、都市生産（Production）、交易（Deals/Caravans）の計算から完全に除外されます。
   * **Goods Editor**: Goods 一覧テーブルから `Gunpowder` と `Artillery` を完全に非表示にします。
   * **Trade Animation**: 火薬・大砲の Goods に関連する交易アニメーションや荷馬車（Caravans）は生成されません。

---

## 2. レイヤーごとの具体的な変更点

### 2.1 State（状態）レイヤー

#### [types/WorldState.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/types/WorldState.ts)
* `WorldOptions` に `gunpowderEraEnabled?: boolean` を追加します。
```typescript
export interface WorldOptions {
  // ...既存のオプション
  gunpowderEraEnabled?: boolean; // デフォルトは false
}
```

#### [store/optionsState.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/store/optionsState.ts)
* Zustand のストアに `gunpowderEraEnabled` を追加し、初期値を `false` に設定します。
```typescript
export interface OptionsState {
  // ...
  gunpowderEraEnabled: boolean;
}

// ストア作成部分
export const useOptionsState = create<OptionsState>(set => ({
  // ...
  gunpowderEraEnabled: false, // デフォルト無効
}));
```

---

### 2.2 Military（軍事）レイヤー

#### [generators/military-generator.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/military-generator.ts)
* 連隊の自動生成時および再計算時、`gunpowderEraEnabled` が `false` の場合は `artillery` ユニットを配列から除外します。
```typescript
const isGunpowderEra = options.gunpowderEraEnabled === true; // デフォルトfalseのため明示的にtrueのみ有効
const military = options.military.filter(unit => {
  if (!isGunpowderEra && (unit.name === "artillery" || (unit.type === "machinery" && unit.name.includes("artillery")))) {
    return false;
  }
  return unit.enabled !== false;
});
```

#### [ui/dialogs/MilitaryOptionsDialog.tsx](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/ui/dialogs/MilitaryOptionsDialog.tsx)
* テーブルのレンダリングループ内で、`gunpowderEraEnabled === false` かつ該当行が `artillery`（または大砲関連）の場合は、要素を出力せずにスキップします。
```typescript
{units
  .filter(unit => {
    const isGunpowderEra = worldContext.options.gunpowderEraEnabled === true;
    if (!isGunpowderEra && (unit.name === "artillery" || unit.type === "machinery")) {
      return false; // 非表示
    }
    return true;
  })
  .map((unit, index) => {
    // ...
  })
}
```

---

### 2.3 Economy（経済）拡張機能レイヤー

#### [extensions/economy/generators/goods-generator.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/economy/generators/goods-generator.ts)
* `isGoodEnabled` ヘルパーを追加し、火薬時代が無効な場合は `Gunpowder` および `Artillery` の Goods を無効判定します。
```typescript
export function isGoodEnabled(good: Good): boolean {
  const options = getWorldContext().options;
  const isGunpowderEra = options.gunpowderEraEnabled === true;
  if (!isGunpowderEra) {
    if (good.name === "Gunpowder" || good.name === "Artillery") {
      return false;
    }
  }
  return true;
}
```
* `Goods.generate()` にて、セルに資源を配置する前に `isGoodEnabled(good)` でフィルタリングします。

#### [extensions/economy/generators/production-generator.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/economy/generators/production-generator.ts)
* `produce()` および `buildProductionIndex()` 内で、アクティブな Goods 一覧を `isGoodEnabled` でフィルタリングし、計算インデックスから火薬・大砲を完全に除外します。

#### [extensions/economy/controllers/goods-editor.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/economy/controllers/goods-editor.ts)
* UI構築（`goodsEditorAddLines()` など）時に、`worldContext.pack.goods` を走査する箇所で `isGoodEnabled(good)` が `false` の Goods を完全に除外してレンダリングします。
```typescript
const goods = (worldContext().pack.goods ?? [])
  .filter(isGoodEnabled)
  .map(good => {
    // ...
  });
```

---

## 3. 検証・テスト計画

### 自動テスト（Unit / Integration Tests）
1. `military-generator.test.ts` で `gunpowderEraEnabled = false` の際に連隊データに Artillery が含まれないこと。
2. `goods-generator.test.ts` / `markets-generator.test.ts` で `gunpowderEraEnabled = false` の際に Gunpowder/Artillery の Goods が一切生産・流通・取引されないこと。

### 手動確認手順
1. マップオプションで「火薬時代（Gunpowder Era）」を無効にして新規生成またはロードを行う。
2. **Military Options** を開き、大砲（Artillery）の行がテーブルに存在しないことを確認する。
3. **Goods Editor** を開き、大砲・火薬の Goods がテーブルに表示されていないことを確認する。
4. マップ上の交易アニメーションで大砲や火薬を積載した馬車（Caravans）が生成されていないことを確認する。
