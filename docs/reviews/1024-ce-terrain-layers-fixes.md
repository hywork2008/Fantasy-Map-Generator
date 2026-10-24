# CE高さの層（ce-terrain-layers.md）実装レビューの修正指示

作成日: 2026-10-24
対象ブランチ: `fix/by-claude-sonnet`（`feature/ce-mesh` から派生）
設計: `docs/plan/ce-terrain-layers.md`
宛先: この修正を担当するエンジニア（Codex）

## 0. 前提

- レビューはコードと自動テストで行った。ブラウザでの見た目は確認していない。
- 設計の主要な意図（回廊 `riverCorridor`・用地 `pad`・合成順・水面を回廊から直接決める・`cells` の壁の切り抜き・セル標高編集の用地への読み替え）は適用済み。ここに書くのは残った不備だけである。
- 作業ルールは `AGENTS.md` に従う。ソースコード中の文字列・コメントは英語。テストは変更箇所と影響範囲に絞り、通ったら範囲を広げない。完了報告は日本語で、実行したテストと結果を簡潔に書く。
- 検証用の既知の失敗（今回の変更とは無関係。増減だけ確認する）:
  - `aerialLandmarks`・`gateApproaches`・`fabricDistricts`・`medievalFabric`・`settlementExtent`・`CityEditorPage.generate`・`CityEditorPage.skeleton` の各テストは、`feature/ce-mesh` でも失敗している。
  - `populationControls` は単独では成功し、`src/city-editor` 全体の実行のときだけ失敗する。

## 1. 修正項目（優先順）

### F1. 型エラー（必須）

- 場所: `src/city-editor/renderers/cellElevationSvg.ts:33`
- 症状: `tsc --noEmit` が `Type 'SVGElement' is missing the following properties from type 'SVGGElement'` を報告する。
- 指示: `element("g", …)` の戻り型を `SVGGElement` に絞るか、使う側の型を `SVGElement` に合わせる。既存の `element` ヘルパーの使い方に合わせる。
- 完了条件: `npx tsc --noEmit -p .` がエラー0件。

### F2. 川幅・水深・岸の変更が回廊に反映されない（必須）

- 場所: `src/city-editor/generators/terrainField/corridor.ts` の `syncRiverCorridors`
- 症状: 保存済みの回廊を使い回す条件が、`sourceId` の一致・中心線の一致・`widthsMeters.length` の一致だけである。川幅を変えても、中心線が同じなら古い幅・水深・岸の形のまま残る。
- 指示:
  1. 使い回す条件に、`widthsMeters` の各要素（許容誤差 0.05 m 程度）と `depthMeters` の一致を加える。幅が変われば `depthMeters`（`max(1.4, width × 0.1)`）も変わるので、両方を比べる。
  2. 岸の形（`bank`）は、町の中か郊外かで既定が決まる。中心線と幅が同じなら、手で変えた岸の形を保つ。この扱いを関数のコメントに1行で書く。
  3. 幅が変わって作り直す場合、`bedMeters` も作り直す（深さが変わるため）。
- テスト（`layers.test.ts` に追加）: 川幅を 6 m から 12 m に変えて `refreshRiverCorridors` を呼ぶと、回廊の `widthsMeters` と `depthMeters` が新しい値になる。幅を変えない再同期では、回廊のオブジェクトがそのまま残る。

### F3. 橋の床の高さを回廊から決める（必須。設計 §6 の3つ目）

- 場所: 橋の高さを決める処理（`grep -rn "bridge" src/city-editor/generators` で、橋の床の高さを `heightAt` から取っている箇所を探す。回廊を参照する差分は、レビュー時点で橋まわりに無かった）。
- 設計の要求: 橋は回廊の幅を最短で渡す。橋の角度は `src/utils/bridgeSkewPolicy.ts` の判定に従う（`AGENTS.md`「河川と橋の角度」）。橋の床の高さは、両岸の地面の高さと、回廊の水面より上の余裕から決める。
- 指示:
  1. 橋の床の高さを、回廊を持つ文書では `max(両岸の地面の高さ, 回廊の水面 + 余裕)` で決める。余裕は `constants.ts` に定数として置く（暫定 1.0 m）。回廊のない文書は今の計算のままにする。
  2. 角度の判定は変えない。`bridgeSkewPolicy.ts` の基準値を複製しない。
- テスト: 回廊のある文書で、橋の床が水面より `余裕` 以上高いこと。回廊のない文書の橋の高さが変更前と一致すること（既存の橋のテストが通ること）。

### F4. 用地が生成後の建物の編集に追従しない（要判断のうえ対応）

- 場所: `src/city-editor/generators/generation/generateCity.ts:432`（`installLotPads(result, buildBlockFabric(result, fabricCache).buildings)`）
- 症状: 用地は生成時の1回しか作られない。そのため、(a) 生成のために建物の配置を1回余分に組み立てている、(b) 建物を足したり動かしたりすると用地が古くなり、建物が用地から外れる。
- 指示:
  1. まず (a) を確認する。`fabricCache` が後段の組み立てと共有され、余分な組み立てになっていないなら、何もしなくてよい。余分なら、既存の組み立て結果を使い回す形に改める。
  2. (b) は、建物の追加・移動のときに、その建物の区画の用地だけを `padsForLots` で作り直す関数 `refreshLotPad(document, lot)` を `pads.ts` に足す案を、まず小さく試す。呼び出し元が多く影響が大きいと分かった場合は、実装せず、手で置いた用地（`pad:<faceId>`）と生成の用地を分けている現状の制限を `ce-terrain-layers.md` の §5.3 に追記して終える。
- 完了条件: どちらを選んだかを完了報告に書く。

### F5. 川の水面の境目（確認して、必要なら修正）

- 場所: `src/city3d/three/waterMeshes.ts` の `partHeight`（`terrain.waterAt` が `null` のとき `rimAt` に落ちる）
- 懸念: 川の多角形の頂点が、回廊の幅の端（`station.distance > station.width / 2`）にぴったり載ると、浮動小数点の誤差で `waterAt` が `null` になり、その頂点だけ `rimAt` の高さになって水面が段になる。
- 指示: 川の多角形の全頂点で `terrain.waterAt` が値を返すこと、または返さない頂点でも水面の高さが回廊の水面と 0.05 m 以内で一致することを、テストで確かめる。外れる場合は、`corridorWaterAt` の判定に小さな余裕（`width / 2 + 0.05`）を持たせる。
- テスト: `riverRibbonRing` で作った多角形の全頂点で、`waterAt` が非 `null`。

## 2. やらないこと

- 設計の方針（高さの持ち主の層分け）の変更。
- `ce-terrain-layers.md` の記述を実装に合わせて弱めること。実装を設計に合わせる。合わない箇所が出たら、設計を変えずに完了報告で指摘する。
- 全件テスト・E2E全件の実行。

## 3. 完了報告に書くこと

1. F1〜F5 のそれぞれについて、対応した・しなかった（理由）。
2. 実行したテストと結果。最低限、次を実行する。
   - `npx tsc --noEmit -p .`
   - `npx vitest run src/city-editor/generators/terrainField src/city3d src/city-editor/services/io/incomingCity.test.ts`
3. 設計と食い違う点が見つかった場合は、その箇所。
