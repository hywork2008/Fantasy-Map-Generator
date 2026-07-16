Viewed fmg.d.ts:1-53
Viewed worldContext.ts:1-68
Viewed PackedGraph.ts:1-80
Viewed models.ts:1-406

非常に良いご質問です。`window.fmg` 全体を毎回保存すると10MB〜20MBになり、毎ターン（数手分）保存するには非効率ですし、AIのコンテキスト制限も圧迫してしまいます。

容量の大部分を占めているのは、静的な地形データ（`window.fmg.world.pack.cells` の大量の配列データ）や、D3・SVGの描画関連のビューオブジェクト（`window.fmg.view`）です。

**Advance Time（時間の進行）** によって変化し、軍隊の移動に関するAIとの議論で必要になる**「動的なデータ」**は、実はごく一部に集約されています。数ターン前後の動きを比較・議論するために毎ターン保存すべきデータは以下の3つ（+α）だけです。

### 毎ターン保存すべき最小限のデータ

1. **`window.fmg.world.pack.states` （最も重要）**
   - **理由**: 各国家のオブジェクトの中には `military` という配列があり、ここに全連隊・軍隊のデータが入っています。
   - **含まれる重要情報**: 現在の座標(`x, y`)、現在いるセル(`cell`)、目的地のセル(`destinationCell`)、移動経路(`path`)、移動の進捗(`edgeProgress`)、兵力(`u`)、そして国家間の戦争状態(`diplomacy`, `campaigns`)。軍隊の動きのAIロジックを追うためのすべての答えがここにあります。

2. **`window.fmg.simulation`**
   - **理由**: 現在の年（`currentYear`）や経過ティック数（`tickCount`）が記録されています。これがないと、どの時点のデータなのか比較できなくなります。

3. **`window.fmg.world.pack.burgs` と `provinces`**
   - **理由**: 戦争によって都市（burg）や州（province）が占領された場合、所属する国家（`state`）が変わったり、略奪で人口（`population`）が変動したりするため、戦況の把握に役立ちます。

### 推奨される実装方針（差分保存アプローチ）

APIでデータをダンプする（実装プランの）仕組みを作る際、AIに渡すJSONの構造を以下のように軽く絞り込むのが最適です。

```javascript
// AIデバッグ用に出力するデータのイメージ
const aiDebugData = {
  // 時間情報
  time: window.fmg.simulation,
  
  // 軍隊と外交（軍隊の動きのメイン）
  militaryStates: window.fmg.world.pack.states.map(s => ({
    i: s.i,
    name: s.name,
    diplomacy: s.diplomacy,
    campaigns: s.campaigns,
    military: s.military // ここに連隊の座標や目的地が入っています
  })),
  
  // 占領状況の把握用
  territories: {
    burgs: window.fmg.world.pack.burgs.map(b => ({ i: b.i, state: b.state, name: b.name })),
    provinces: window.fmg.world.pack.provinces.map(p => ({ i: p.i, state: p.state, name: p.name }))
  }
};
```

このようにフィルタリングして出力すれば、**数キロバイト〜数十キロバイト程度**に収まるため、過去3ターン分の履歴（`turn_1.json`, `turn_2.json`, `turn_3.json`）を保存し、「ターン1で目的地がXだったのに、ターン2でYに変わっているのはなぜ？」といった具体的な議論が非常にスムーズに行えるようになります。

（※地形データである `cells` や道路網 `routes` などはAdvance Timeで基本的に変化しないため、議論の前提として1回だけ読み込めば十分です）
