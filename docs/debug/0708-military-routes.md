# 移動中の軍団の移動がリセットされる

## 質問

temp/debug/latest.json
の
`window.fmg.world.pack.states[4].military.find(r => r.i === 4)`
の目的を知ろうと
temp/debug/debug-script.js
を作成し実行した結果の最後のstrategicGoals出力が以下でした。

```json
[
  {
    targetBurg: 302,
    targetState: 5,
    type: 'siege',
    tension: 100,
    expectedCasualties: 'moderate',
    justification: 'border_expansion',
    requiredAttackForce: 0.11011
  }
]
```

軍団をクリックすると移動ルートも確定しているのですが、Advance Day +1すると元の位置に戻ってしまいます。

地図の見た目的には草原上に描かれたroutesの上を通っており、通れそうなのですが、内部的に通れなくなっているかなど確認する方法はありますか？

### temp/debug/latest.json のこの質問の時点のtimestampファイル名

temp/debug/fmg_state_dump_1783522261320.json

## 回答

Ran command: `node debug-script.js`

現在の状況とソースコードの動作仕様（`src/generators/regimentMovement.ts` および `src/extensions/nobility/generators/strategic-planner.ts`）を調査したところ、**ルートが通れないからではなく、AIの移動ロジック（およびバグ）によって移動がキャンセル・リセットされている可能性が極めて高い**ことが分かりました。

内部的に「本当に道が通れるのか（海や山脈でブロックされていないか）」を確認する方法と、なぜ元の位置に戻ってしまうのかの原因について解説します。

### 1. ルートが内部的に通行可能か確認する方法（debug-script.jsへの追記）

ファンタジーマップジェネレーターの内部では、セルの高さ（`height` または `h`）が `20` 未満の場合は「水域（海や湖）」とみなされ、陸軍は通行できなくなります。
お使いの `debug-script.js` の末尾に以下のコードを追記することで、現在のセル(`1608`)から次のセル(`1725`)へ本当に通行可能かをチェックできます。

```javascript
const fromCell = regs[0].path[regs[0].pathIndex];
const toCell = regs[0].path[regs[0].pathIndex + 1];
const height1 = data.cells.h[fromCell];
const height2 = data.cells.h[toCell];

console.log(`\n--- Passability Check ---`);
console.log(`Current Cell ${fromCell} height: ${height1} (Land: ${height1 >= 20})`);
console.log(`Next Cell ${toCell} height: ${height2} (Land: ${height2 >= 20})`);
```

### 2. なぜ「元の位置（セルの中心）」に戻ってしまうのか？（根本原因）

今回の現象は、コードの仕様上 **「1日単位で時間を進めると、移動の進捗（端数）がリセットされてしまう」** ことが原因で発生しています。

出力データを見ると `pathIndex: 2` (現在セル1608), `edgeProgress: 10.53` となっています。
しかし、時間を進める（`advanceTime` が呼ばれる）と以下の処理が走ります。

1. **目標の再計算**: `regimentMovement.ts` 内の `ensureGarrisonMarchOrder` が毎ターン走り、国境線への防衛目標セル（`destinationCell`）を再計算します。
2. **ルートの再設定と進捗リセット**: もし目標セルが前ターンから1セルでもズレた場合、`planLandMarchOrder` が呼ばれ、新しいルートが引き直されます。このとき、**セル間の移動進捗を示す `edgeProgress` が無条件で `0` にリセット** されてしまいます。
3. **元の位置（セルの中心）への引き戻し**: `edgeProgress` が `0` になるということは、「現在いるセル（1608）のど真ん中」に座標（`x, y`）がスナップされることを意味します。

「Advance Day +1」のような短い時間経過だと、1日で進める距離（budget）がセル間の距離に満たないため、**「少し進む → 目標再計算で進捗リセット → セルの中心に戻される」** というループに陥り、結果としてずっと同じセルから前に進めなくなっています。

### 3. Siege（攻城戦）の目標に向かわない理由

さらに根本的な問題として、**現在の軍隊の移動AIは、`strategicGoals`（Siegeなどの戦略目標）を完全に無視する仕様** になっています。

* `strategic-planner.ts` は `targetBurg: 302` への Siege 目標を作成しますが、**軍隊にその場所へ行けとは命令していません**。
* `regimentMovement.ts`（実際の移動担当）は、Siege 目標を一切見ず、「自国の国境線（Frontier）をうろうろ防衛する（Garrison）」という行動しか取らないようにハードコーディングされています。

そのため、UI上で経路が確定しているように見えても、AIは毎ターン「国境線のどこか」に目標を上書きし続けており、ターゲットの都市（302）へ自発的に攻め込むことはありません。これが軍団が想定通りに動かない最大の原因です。

**今後の対応について：**
もしAIにきちんとSiege目標へ進軍させたい場合は、`src/generators/regimentMovement.ts` の `advanceAllRegimentMovement` 内に、`strategicGoals` を読み取ってその目的地（`targetBurg` のセル）へ `planLandMarchOrder` を発行するロジック（`applyStrategicMarchOrder` のようなもの）を新規実装する必要があります。
