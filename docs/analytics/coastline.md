結論として、塗りの海岸線問題はほぼ性能を落とさず解決できますが、SVG と同じベジェ曲線を厳密に再現するには少し頂点数が増えるため「完全にゼロコスト」は不可能です。

`ArcLayer` は適しません。これは始点・終点を結ぶ“持ち上がった弧”のレイヤーで、閉じた海岸線や任意のベジェ輪郭を描く用途ではありません。[ArcLayer 公式仕様](https://deck.gl/docs/api-reference/layers/arc-layer)

現状は、国家・文化などの `SolidPolygonLayer` が海岸線を考慮しないセルポリゴンを塗り、海岸線だけが別の `PathLayer` で描かれています。[deckDataAdapters.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/renderers/webgl/adapters/deckDataAdapters.ts)  
一方 SVG は、曲線化した feature path を `#land` マスクとして国家色をクリップしています。

推奨は二段階です。

1. `MaskExtension` で、曲線化済みの島輪郭を GPU マスクとして追加し、land／states／provinces／cultures などへ適用する  
   これで国家色が海へ直線的にはみ出す問題は解決します。CPU で各国家ポリゴンを海岸線で切り直す必要がなく、マスクは GPU 上で処理されます。[MaskExtension](https://deck.gl/docs/api-reference/extensions/mask-extension)

2. SVG の `Q` / `C` 曲線を適応的に折れ線へサンプリングし、同じ輪郭を `PathLayer` とマスクへ共有する  
   deck.gl の `PathLayer` は座標列のポリラインを描くため、ベジェ曲線を直接は扱えません。[PathLayer](https://deck.gl/docs/api-reference/layers/path-layer)  
   現在もフラクタル化はしていますが、SVG の smooth span はベジェ化されるのに対し WebGL は点同士を直線で結んでいます。

性能面では、島輪郭はマップ生成・ロード時だけ作成してキャッシュし、画面上の誤差が 0.25〜0.5px 程度になる最小限の分割数にすれば、通常は影響をほぼ感じない設計にできます。マスクによって各国家ポリゴンを個別に再テッセレーションしなくて済むため、こちらが最も効果的です。

ただし、曲線のサンプリング頂点を増やす分だけ GPU 負荷は必ず増えます。したがって「国家色の海へのはみ出し」は低コストで解決可能、「SVG と完全同一の曲線」は許容誤差ベースで実用的に再現、が現実的な着地点です。
