# Economy WebGL Layer Migration

Phase 7 で Economy extension の `goods`、`markets`、`tradeAnimation` を deck.gl 化するか判断するための別タスク。Phase 7 の完了には含めない。

## 現状

Economy は `ExtensionAPI.addLayers()` で所有する SVG layer を追加し、`getSvgLayer()` と `registerDrawLayerHook()` で描画する。host `ViewContext` には参照を持たない。

| layer | 現在の描画 | WebGL 化の適性 | 判断 |
| :-- | :-- | :-- | :-- |
| `goods` | cell polygon、resource icon、burg plate | 高い。ただし custom SVG icon と zoom threshold を再現する必要がある | Phase 9 以降に pilot 候補 |
| `marketsLayerFill` / `marketsLayer` | market area polygon、境界、center、label | 中。polygon/path/text は generic layer spec で表せる | goods pilot の後に判断 |
| `tradeAnimation` | SVG path animation | 低い。animation timing と path offset を deck.gl に再実装する必要がある | SVG overlay のまま維持 |

## 先行条件

- `ExtensionAPI` に dynamic extension でも使える declarative `ExtensionWebglLayerSpec` を設計する。extension は host module や `@deck.gl/*` class を import しない。
- host が descriptor を deck layer、cache signature、layer toggle、picking、map reload / finalize lifecycle に統合する。
- custom goods icons は Phase 6 の icon rasterization / atlas 方針を再利用する。
- SVG fallback、extension enable / disable、`.map` reload のすべてで SVG layer を引き続き再取得できることを E2E 化する。

## 非目標

- Phase 7 中に Economy SVG renderer を削除しない。
- trade animation の deck.gl 化や、extension layer を `ViewContext` に追加しない。
