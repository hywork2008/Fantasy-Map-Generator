# War Zones / 戦場可視化メモ

**Status**: 主機能は **Combat Deaths レイヤー** として実装済み（2026-07-15）  
**Canonical doc**: [`combat-deaths-heatmap.md`](./combat-deaths-heatmap.md)

---

## 初期要望

`Population Overview` の Deaths のうち Combat での死人がどの地域で発生しているのか、`Population` レイヤーのようなヒートマップで見たい。戦争については `Zones` レイヤーが最適に見える。セルに情報を載せて参照すればよさそう、という問いから始まった。

---

## 結論（役割分担）

| 用途 | 手段 |
| :--- | :--- |
| **死人がどこで何人出たか（強度）** | **Combat Deaths** レイヤー（専用ヒートマップ） |
| **侵攻・反乱などの「舞台」ラベル** | 既存 **Zones**（生成時 Invasion / Rebels 等） |
| **激戦区に名前を付ける** | 将来案: 高死亡セルのクラスタ → 一時 Zone（未実装） |

Zones は人数の連続強度表現に向かないため、主表示には使わず補完に留める。計画・実装詳細・API・ファイル一覧は **`combat-deaths-heatmap.md`** を参照。
