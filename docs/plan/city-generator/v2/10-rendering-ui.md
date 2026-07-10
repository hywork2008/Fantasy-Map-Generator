# 10. 描画・UI・エクスポート

## 1. ビューとレイヤー構成（deck.gl）

OrthographicView を継続使用。レイヤーは下から順に:

| # | レイヤー | 内容 | deck.gl |
|---|---------|------|---------|
| 1 | terrain | 高度帯の色分け（等高線調の淡い段彩） | SolidPolygonLayer |
| 2 | water | 川・堀・海 | SolidPolygonLayer |
| 3 | fields | 耕地短冊（色相を短冊ごとに微変動） | SolidPolygonLayer |
| 4 | roads | 道路占有ポリゴン（ランク別幅）。広場含む | SolidPolygonLayer（PathLayer ではなく面で描く） |
| 5 | bridges | 橋 | PolygonLayer |
| 6 | lots | 敷地の庭・空地（薄緑）、袋地の courtyard | SolidPolygonLayer |
| 7 | buildings | 押し出し + 屋根（ridgeAxis を反映した 2 段押し出し） | SolidPolygonLayer (extruded) |
| 8 | walls | 壁体・塔・門（押し出し） | SolidPolygonLayer (extruded) |
| 9 | landmarks | 例外形状建物（押し出し） | SolidPolygonLayer (extruded) |
| 10 | labels | 地区名・施設名（ズーム連動） | TextLayer |

- **配色**: 羊皮紙地図調（ベージュ地・焦げ茶の道・赤茶の屋根）を基調に、地区で屋根色相を微調整。v1 の colorJitter/hueJitter の仕組みは踏襲。
- 道路を「線」でなく「面」で描くこと。幅がランクを語る。

## 2. デバッグ表示（開発の生命線）

各ステージ出力を個別に重ね表示できるトグルを Tweakpane に設ける。**マイルストーンの受け入れ確認はこの表示で行う**（[12-roadmap.md](12-roadmap.md)）。

- S1: 高度場ヒートマップ / 傾斜場 / 川・橋候補
- S2: アンカー点・プレシンクト輪郭
- S3/S5: RoadGraph のノード（次数で色分け: 3叉=緑, 4叉=橙, 行き止まり=灰）とエッジ（ランク別色）
- S6: 街区リング + 接道辺の強調（フロンテージランク別色）
- S8: 敷地境界 + フロンテージスパン + **袋地の赤色警告表示**
- S10: 検証メトリクスの合否を HUD に常時表示（fail は赤）

## 3. UI パラメータ（Tweakpane）

`CityParams` v2 の全項目 + 「Regenerate」「シードランダム化」。ステージ別デバッグトグル群。既存の URL 状態同期（`ui/urlState.ts`）は params v2 に追従させ、URL を共有すれば同じ都市が再現できることを維持する。

## 4. HUD 統計

既存 HUD を `ValidationReport` ベースに置き換える: 街区数・敷地数・建物数・接道率・T字路率・推定人口（敷地数 × 世帯係数 5）・生成時間（ステージ別内訳）。

## 5. エクスポート（`io/`）

- GeoJSON: 全レイヤーを FeatureCollection で（properties にランク・地区・use 等）。
- PNG: 現行ビューのスクリーンショット。
- 形式は既存 `io/export.ts` を v2 モデルへ追従させる。
