# Economy WebGL Layer Migration

Phase 7 で Economy extension の `goods`、`markets`、`tradeAnimation` を deck.gl 化するか判断するための別タスク。Phase 7 の完了には含めない。

## 現状

Economy は `ExtensionAPI.addLayers()` で所有する SVG layer を追加し、`getSvgLayer()` と `registerDrawLayerHook()` で描画する。host `ViewContext` には参照を持たない。

| layer | 現在の描画 | WebGL 化の適性 | 判断 |
| :-- | :-- | :-- | :-- |
| `goods` | cell polygon、resource icon、burg plate | 高い。cell production polygon と source marker を deck.gl 化済み | burg plate / custom SVG icon は後続 |
| `marketsLayerFill` / `marketsLayer` | market area polygon、境界、center、label | 中。market cell area と center marker を deck.gl 化済み | union boundary / label は後続 |
| `tradeAnimation` | SVG path animation | 低い。animation timing と path offset を deck.gl に再実装する必要がある | SVG overlay のまま維持 |

## 実装済み

- `ExtensionAPI.registerWebglLayers()` は dynamic extension でも利用できる declarative `ExtensionWebglLayerSpec` を受け付ける。extension は host module や `@deck.gl/*` class を import せず、polygon / scatter の data descriptor だけを返す。
- host `extensionWebglLayerRegistry` が enabled extension の descriptor を保持し、`buildDeckLayers()` が host-owned `SolidPolygonLayer` / `ScatterplotLayer` に変換する。extension enable / disable で登録 / 解除されるため、deck instance の lifecycle と SVG fallback は host のまま保たれる。extension data cache signature は次の高頻度 extension を追加する前に API として拡張する。
- Economy は `toggleGoods` で生産 cell polygon と産地 marker、`toggleMarketsLayer` で market area cell polygon と market center marker を提供する。hybrid 中は既存の `#goods` / `#marketsLayerFill` / `#marketsLayer` SVG を非表示にして二重描画を防ぐ。
- `.map` load 時は host SVG の可視性から復元できない extension toggle を現在の active state のまま保持する。E2E は Economy の依存 extension を UI から有効化し、WebGL layer id、非空 data、SVG 非表示、DOM 再取得を検証する。

## 後続

- custom goods icons と burg production plate は Phase 6 の icon atlas 方針を再利用する。
- market area の union boundary、hover highlight、center label を必要になった時点で declarative path / text descriptor に追加する。
- `tradeAnimation` は SVG overlay のまま維持する。

## 非目標

- Phase 7 中に Economy SVG renderer を削除しない。
- trade animation の deck.gl 化や、extension layer を `ViewContext` に追加しない。
