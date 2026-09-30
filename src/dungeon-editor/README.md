# Dungeon Editor / DE

屋内・施設平面を自動生成し、部屋・壁・扉単位で編集する独立エディター。
caravanserai（隊商宿）を中庭型ダンジョンの一形態として扱う。

**状態: 単層・矩形区画の初期版を実装済み。**

設計の正本: [Dungeon Editor 設計](../../docs/plan/dungeon-editor.md)

最初の対象は `caravanserai` と `room-corridor` の単層平面。
両者は異なる配置アルゴリズムから、共通の `DungeonDocument` を生成する。
City Editor の街区メッシュには依存しない。

## 起動と操作

`npm run dev` で起動し、通常の開発設定では
`http://localhost:5173/Fantasy-Map-Generator/dungeon-editor/` を開く。
`NETLIFY` 設定などで base が `/` の場合は `/dungeon-editor/`。

- 生成方式・seed・寸法を設定して「平面を生成」。隊商宿は入口軸に対する左右対称を選べる。
- 部屋を選択して名称・用途・ロックを編集。
- 壁を選択して中央に扉を追加、または「扉を追加」ツールで壁をクリック。
- 扉を選択して位置・幅・種類・状態・隠し扉の設定を変更。外壁の扉を主入口にできる。
- 共有壁は移動距離を指定して編集。同一直線で連続する壁を一緒に動かす。
- JSON 保存・読込、SVG 出力、Undo / Redo、ズーム・パン・グリッド表示に対応。

再生成・読込も Undo できる。到達不能室は診断パネルに表示する。
ロック済み要素があるときの再生成、形状や扉を破壊する編集は拒否する。

## 構成

```text
dungeon-editor/
  index.html                 独立ページ
  main.ts                    UI の起動
  core/
    types.ts                 文書・部屋・共有境界・開口
    document.ts              作成・読込検証・版移行
    geometry.ts              直交図形・境界座標・重複判定
    connectivity.ts          通行グラフ・到達性
    commands.ts              トランザクション形式の編集
    history.ts               Undo / Redo
    gen/
      types.ts               入力・結果・診断
      prng.ts                seed による決定的乱数
      pipeline.ts            生成手順・検証・試行上限
      settings.ts            入力設定の検証
      caravanserai.ts        中庭・建物帯・入口棟
      roomCorridor.ts        部屋・通路・分岐・ループ
      boundaries.ts          壁・開口の確定
  render/svg.ts              表示・SVG 出力
  io/dungeonEditorFile.ts    編集可能 JSON
  ui/DungeonEditorPage.ts    生成・編集・検証パネル
  ui/dungeon-editor.css      独立ページのスタイル
```

世界側の `src/generators/dungeons-generator.ts` は配置・危険度の担当を維持する。
DE の生成・編集だけでは世界のダンジョン出現、討伐、危険度、集落分類を変更しない。

## 初期版の範囲

部屋・通路・中庭は矩形区画で、共有辺は T 字接続で分割して保持する。
探索型は寸法が異なる部屋を格子状の配置枠に置き、隣接枠の接続をランダムな木と追加辺で構成する。指定部屋数・周回路数を満たせない設定は失敗として返す。
隊商宿の中庭寸法は、中央配置と 0.25 m 格子を両立するため最大 0.25 m 調整し、実効設定を画面・文書に保存する。

井戸は通行を妨げない図面上の装飾。複数階、L 字室、斜角、曲線、通行を妨げる家具、部分再生成、FMG / CE との連携、fort / monastery は後続。

確認コマンド: `npx vitest run src/dungeon-editor`、`npx biome check src/dungeon-editor`。
本番ページは Vite の multi-page build に含まれる。
