# Submap Tool: latShift と lonShift のフォールバック値に関する備忘録

## 概要
`src/controllers/submap-tool.ts` の `recalculateMapSize` 関数内における緯度・経度のシフト量 (`latShift` および `lonShift`) の計算で、ゼロ除算によって `NaN` や `Infinity` が発生する問題への対処として、現在暫定的に `0.5` をフォールバック値として設定しています。

このフォールバック値は、アプリがクラッシュするのを防ぐための応急処置であり、移植元の（旧バージョンの Vanilla JS の）動作を詳細に調査し、仕様として正しい値が何であるべきか再確認する必要があります。

## 発生していた問題
2回連続で `generateSubmap` を実行した際などに、`viewContext.scale` が 1 にリセットされた状態だと、以下のようなゼロ除算が発生していました。

```typescript
// latT が 180 になるケースなどで 180 - latT = 0 となる
const latShift = (90 - latN) / (180 - latT); // 0除算で NaN や Infinity に
const newLat = rn(latShift * 100, 2);
options.setOption("latitude", newLat); // NaN が Zustand ストアに入る
```

これにより、`<input type="number" value={NaN} />` が React でレンダリングされようとして例外 (`Received NaN for the value attribute.`) が発生していました。

## 現在の暫定対応
```typescript
let latShift = (90 - latN) / (180 - latT);
if (!isFinite(latShift) || isNaN(latShift)) latShift = 0.5;

let lonShift = (180 - lonE) / (360 - lotT);
if (!isFinite(lonShift) || isNaN(lonShift)) lonShift = 0.5;
```

## 今後の課題（Todo）
*   旧バージョンの `submap-tool.js` (またはそれと同等の機能を持つレガシーコード) において、同様のケース（マップ全体を選択した状態からのサブマップ生成など、`180 - latT === 0` になるケース）で `latShift` や `lonShift` がどのように処理されていたかを調査する。
*   オリジナルのコードでも単に `String(NaN)` として握り潰され、意図せずデフォルト動作に依存していたのか、それとも明示的なフォールバックがあったのかを確認する。
*   調査結果に基づき、必要であれば `0.5` (中央値) 以外の適切なフォールバック処理を実装する。
