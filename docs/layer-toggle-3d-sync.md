# レイヤートグルと 3D シーン同期の設計

> **対象ファイル**: `src/controllers/layers.ts`, `src/renderers/draw-population.ts`, `src/renderers/draw-precipitation.ts`
> **解決した問題**: 3D シーン (`viewMesh`) 表示中に population / precipitation レイヤーをトグルすると、表示状態とボタン状態がずれる

---

## 背景: なぜ問題が起きていたか

### 旧レンダラーの構造

`PopulationRenderer.render()` は D3 トランジションでラインを描画していた。

```typescript
// 旧 draw-population.ts（問題のある実装）
const show = transition().duration(2000).ease(easeSinIn);

population.select("#rural").selectAll("line")
  .data(rural).enter().append("line")
  .attr("y2", d => d[1])        // ← 開始値: y1 と同じ（長さ 0）
  .transition(show)
  .attr("y2", d => d[2]);       // ← 2000ms かけて最終値へ
```

ラインは `y2 = y1`（長さ 0）から始まり、2000ms かけて伸びる。

### 旧トグル関数の構造

```typescript
// 旧 togglePopulation（問題のある実装）
if (!viewContext.population.selectAll("line").size()) {
  turnButtonOn("togglePopulation");          // ① RAF_3D を登録
  PopulationRenderer.render(...);             // ② ライン追加（y2 = y1）
  // ③ RAF_3D 発火 → y2 = y1 の SVG をキャプチャ → 3D に何も映らない
}
```

`turnButtonOn()` 内の `schedule3dUpdate()` が `requestAnimationFrame` で **RAF_3D** を登録する。RAF はマイクロタスクではなくレンダリングサイクルに乗るため、同期コードがすべて完了した「次のフレーム冒頭」に発火する。

しかし `render()` がラインを `y2 = y1` で追加した直後に RAF_3D が発火するため、3D テクスチャのキャプチャ時点ではラインが長さ 0 の状態だった。

---

## setTimeout による一次対処とその問題点

```typescript
// 一次対処（廃止済み）
PopulationRenderer.render(...);
setTimeout(() => {
  if (ThreeDRenderer.options.isOn) ThreeDRenderer.update();
}, 2600);  // 2000ms + 500ms(urban delay) + 100ms(buffer)
```

この方法は「2600ms 後には必ずアニメーションが終わっているだろう」という **仮定** に依存している。

**ON → OFF → ON を素早く繰り返すと何が起きるか:**

```text
t=0ms    ON  → render → setTimeout_A (2600ms後)
t=500ms  OFF → hide開始
t=900ms  ON  → render → setTimeout_B (2600ms後 = t=3500ms)
t=2600ms     setTimeout_A 発火 → hide途中の SVG をキャプチャ → 3D に残像
t=3500ms     setTimeout_B 発火 → 正しい状態をキャプチャ
```

setTimeout_A が hide アニメーション中の「中途半端な状態」でキャプチャするため、3D シーンが正しい状態に追いつかないフレームが生じる。

---

## 新しい実装: RAF 順序保証 + D3 interrupt イベント

### 設計の核心

**`requestAnimationFrame` は同一フレーム内で登録順（FIFO）に発火する。**

この保証を使い、「3D キャプチャ用の RAF」を「コスメティックアニメーション用の RAF」より先に登録することで、両者を正しい順序で実行させる。

```text
同期コード実行中:
  turnButtonOn()           → RAF_3D を登録  ← 先に登録
  PopulationRenderer.render() → ライン最終値で即座配置
  requestAnimationFrame()  → RAF_anim を登録 ← 後に登録

次フレーム（FIFO 順）:
  1. RAF_3D  発火 → SVG を最終値でクローン → 3D テクスチャ生成 ✓
  2. RAF_anim 発火 → y2 = y1 に戻してアニメーション開始 ✓
```

### レンダラーの変更

トランジションを除去し、**最終値を即座に設定**するよう変更。

```typescript
// 新 draw-population.ts
population.select("#rural").selectAll("line")
  .data(rural).enter().append("line")
  .attr("y1", d => d[1])
  .attr("y2", d => d[2]);  // ← トランジションなし、最終値を直接セット
```

3D キャプチャ（RAF_3D）は次フレームに発火するが、その時点ではすでにラインが最終値にある。

### ON パス: コスメティックアニメーション（連続動作対応）

RAF_3D の後に RAF_anim が発火することを利用して、視覚的なエントリーアニメーションを再現する。
`interrupt()` を呼ぶ**前に**現在の `y2` を保存しておくことで、hide アニメーション途中に ON にした場合でも
グラフがゼロにリセットされず、中断された位置から連続して伸びる。

```typescript
// src/controllers/layers.ts — togglePopulation ON パス

// interrupt() 前に現在の y2 を保存
// キー: "x1_y1" = セル/バーグの座標（render() 後も同一値なので新旧要素間でマッチできる）
const priorRuralY2 = new Map<string, number>();
const priorUrbanY2 = new Map<string, number>();
viewContext.population.select("#rural").selectAll<SVGLineElement, unknown>("line").each(function () {
  priorRuralY2.set(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`, parseFloat(this.getAttribute("y2") ?? "0"));
});
viewContext.population.select("#urban").selectAll<SVGLineElement, unknown>("line").each(function () {
  priorUrbanY2.set(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`, parseFloat(this.getAttribute("y2") ?? "0"));
});

viewContext.population.interrupt();
viewContext.population.selectAll("*").interrupt();

turnButtonOn("togglePopulation");
PopulationRenderer.render(worldContext, viewContext, appServices);
// ↑ RAF_3D はここまでに登録済み。ラインは最終 y2 で配置されている。

// RAF_anim を登録（同フレーム内で RAF_3D の後に発火する）
populationAnimRafId = requestAnimationFrame(() => {
  populationAnimRafId = null;
  viewContext.population.select("#rural").selectAll<SVGLineElement, unknown>("line").each(function () {
    const finalY2 = parseFloat(this.getAttribute("y2") ?? "0");
    // hide 途中なら中断時の y2 を起点に、初回 ON なら y1（= ゼロ長）を起点にする
    const startY2 = priorRuralY2.get(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`)
      ?? parseFloat(this.getAttribute("y1") ?? "0");
    d3.select(this).attr("y2", startY2).transition().duration(2000).ease(d3.easeSinIn).attr("y2", finalY2);
  });
  viewContext.population.select("#urban").selectAll<SVGLineElement, unknown>("line").each(function () {
    const finalY2 = parseFloat(this.getAttribute("y2") ?? "0");
    const startY2 = priorUrbanY2.get(`${this.getAttribute("x1")}_${this.getAttribute("y1")}`)
      ?? parseFloat(this.getAttribute("y1") ?? "0");
    d3.select(this).attr("y2", startY2).transition().delay(500).duration(2000).ease(d3.easeSinIn).attr("y2", finalY2);
  });
});
```

**キーの設計**: `x1_y1` は DOM 属性から読める値で、`PopulationRenderer.render()` が古い要素を削除して新要素を追加した後も
セル座標 / バーグ座標は変わらないため、古い要素で保存した値と新しい要素を正しく対応づけられる。

### OFF パス: interrupt + D3 transition の "end/interrupt" イベント

```typescript
// src/controllers/layers.ts — togglePopulation OFF パス

// 未発火の RAF_anim をキャンセル
if (populationAnimRafId !== null) {
  cancelAnimationFrame(populationAnimRafId);
  populationAnimRafId = null;
}
// 実行中のアニメーションを即座に停止
viewContext.population.interrupt();
viewContext.population.selectAll("*").interrupt();

turnButtonOff("togglePopulation");

const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
viewContext.population.select("#rural").selectAll("line")
  .transition(hide).attr("y2", d => (d as number[])[1]).remove();
viewContext.population.select("#urban").selectAll("line")
  .transition(hide).delay(1000).attr("y2", d => (d as number[])[1]).remove();

// urban の最終フレーム（1000ms delay + 1000ms duration = 2000ms）に
// 親グループ上の no-op トランジションを重ねて 3D 更新の起点にする
viewContext.population
  .transition()
  .delay(2000)
  .on("end.3d", () => {
    if (ThreeDRenderer.options.isOn) ThreeDRenderer.update();
  });
```

**なぜ `.on("end.3d")` が安全なのか:**

D3 は1つの要素に対して同時に1つのアクティブなトランジションしか持てない。ON パスで `viewContext.population.interrupt()` が呼ばれると、この `delay(2000)` トランジションは中断され、`"end"` の代わりに `"interrupt"` が発火する。そのため `ThreeDRenderer.update()` は呼ばれない。

```text
OFF → delay(2000) トランジション開始
  ↓ ユーザーが ON を押した場合
  interrupt() → "interrupt" 発火 → "end.3d" は発火しない ✓

OFF → delay(2000) トランジション開始
  ↓ そのまま 2000ms 経過
  "end" 発火 → "end.3d" コールバック → ThreeDRenderer.update() ✓
```

---

## 状態遷移図

### 素早い ON → OFF → ON の挙動

```text
t=0   ON 押下
        priorRuralY2 / priorUrbanY2 保存（ラインなし → Map 空）
        interrupt() で前の hide トランジション停止
        render() → ライン最終値で即座配置
        RAF_3D 登録（schedule3dUpdate 経由）
        RAF_anim 登録（populationAnimRafId = id_A）

t=16  RAF_3D 発火 → SVG クローン（最終値） → 3D テクスチャ生成
      RAF_anim 発火 → startY2 = y1（Map 空のため） → アニメーション開始

t=200 OFF 押下（アニメーション進行中、各ライン y2 ≈ 中間値）
        cancelAnimationFrame(id_A) → id_A は発火済みなのでノーオペレーション
        interrupt() → コスメティックアニメーション停止（ライン中途値で固定）
        hide トランジション開始（中途値 → y1）
        population.transition().delay(2000).on("end.3d") 登録

t=300 ON 押下（hide アニメーション進行中、各ライン y2 ≈ 小さい中間値）
        priorRuralY2 / priorUrbanY2 保存（各ライン現在の y2 を記録）
        interrupt() → hide トランジション停止 AND delay(2000) トランジション停止
                       "interrupt" 発火 → "end.3d" は発火しない ✓
        render() → ライン最終値で再配置（DOM 上は最終 y2）
        RAF_3D 登録
        RAF_anim 登録（id_B）

t=316 RAF_3D 発火 → SVG クローン（最終値） → 3D テクスチャ再生成 ✓
      RAF_anim 発火 → startY2 = 保存済み中間値 → 中断位置から連続して伸びる ✓
```

どのタイミングで ON/OFF を切り替えても、3D シーンは常に「最後に確定した状態」を正しく反映する。

---

## まとめ: setTimeout を廃止できた理由

| 方法 | 問題 |
| :-- | :-- |
| `setTimeout(fn, 2600)` | 「2600ms 後には終わっているはず」という仮定。ON/OFF を素早く繰り返すと古いタイマーが残り誤った状態でキャプチャ。 |
| RAF 順序保証 + interrupt | 「同フレーム内で RAF_3D → RAF_anim の順に発火する」という**仕様として保証された事実**に依存。絶対時間に依存しない。 |

**依存するのはタイマーの絶対時間ではなく、RAF キューの相対的な登録順序。**
これが setTimeout を廃止できた根拠であり、素早い ON/OFF でも状態がずれない理由。
