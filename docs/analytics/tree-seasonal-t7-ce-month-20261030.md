# T7 CEの表示の月

作成日：2026-10-30。設計は [BV樹木の季節の姿と結実層の設計](../plan/bv-tree-seasonal-appearance.md) §8・§9・§19。

## 方式

| 段 | 実装 |
| --- | --- |
| FMG→記述子 | `getBurgSiteDescriptor` が `date`（年・月）と `climate.monthlyMeanTemperatureC`（12か月）を載せる。経済拡張の `buildBurgSiteEconomy` が `perennialHarvest`（多年生作物12種の月別収穫重み）を載せる |
| 姿の判定 | `treeSeason(descriptor, displayMonth)` が樹種ごとに `resolveTreeAppearance` を呼ぶ。自然林・公園・墓地の木は気温だけ、栽培形4キーは作物暦も使う。既定の姿と同じなら姿を渡さない |
| 表示の月 | 3D表示の「照明・大気」→「樹木」→「月」。既定は地図の月。文書に保存せず、Undo/Redoの対象にしない。月別気温のない記述子では無効 |
| 詳細木 | キャッシュキーはvariantのidに、姿（と秋の配色なら `+autumn`）を縦線でつないだもの。同時4つの上限は樹種と姿の組で数える。`setSeason` で全prototypeを解放し、必要なものだけ作り直す |
| 公園・墓地 | 月を表示の更新の差分に含め、開けた空間を作り直す |
| 集合林冠 | 森林内の最大256か所の樹種の姿から、落葉（#7a6e5c）と紅葉（#a3773a）の割合で、夏の色（#66854f）に対する材質の色の倍率を決める。頂点・配置は変えない |

## 実際のFMGでの確認

開発サーバーのFMGで、Culture setをEuropeanにして `seed=t7-trees`（1280×720）を生成した。温帯落葉樹林で最寒月が4°C以下の最大の町Levyaro（記述子の月は1300年1月、月平均気温 −5.7〜11.8°C）の記述子をCEに渡し、Elementsタブで周囲の森林を加えて、3D表示（品質high）で月を切り替えた。

| 視点 | 月 | 三角形/フレーム | draw call | renderer geometry |
| --- | --- | ---: | ---: | ---: |
| 全体 | 地図の月（1月）・1・4・10月 | 2,603,544 | 86 | 83 |
| 全体 | 7月 | 2,683,740 | 86 | 83 |
| 近景 | 1・4・10・1月 | 693,366 | 20 | 63（初回89） |
| 近景 | 7月 | 745,494 | 20 | 63 |

- 1月・4月・10月は、この寒い気候では落葉の月（4月は0.2°C、10月は5.6°Cで、落葉の閾値6°Cより低い）。7月だけ葉の姿になる。
- 近景では、落葉樹（ナラ・ブナ・シラカバ等）が1月に冬枝、7月に葉の姿になり、トウヒは変わらない。全体表示では、冬の林冠が灰褐色に寄り、夏は緑に戻る。
- 月の切り替えを2巡しても、geometry数は全体で83、近景で63に戻り、増え続けなかった。近景の初回の89は、ズーム直後の詳細木の読み込み中の値。
- 表の三角形数は建物などを含むシーン全体の値で、森林だけの内訳は測っていない。詳細木は既存の森林予算（品質highで800,000）の選択を通るため、月を変えても近景の全体は693,366〜745,494に留まった。
- pageerrorは0件。

確認画像は一時保存とし、目視後に削除した。確認用のPlaywrightスクリプトは一時ファイルとし、リポジトリに残していない。

## 実行したテスト

- `npx vitest run src/city3d src/city-editor/renderers src/services/burgSiteDescriptor.test.ts src/extensions/economy/generators/burgSiteEconomy.test.ts src/buildings/landscape src/building-viewer src/city-editor/components src/city-editor/controllers`：120ファイル927件のうち925件が成功。新しい `src/city3d/treeSeason.test.ts`（記述子の月と表示の月、月別気温のない記述子、月の切り替えでprototypeを解放し配置を保つこと、集合林冠の配色の割合）を含む。失敗した2件は `waterGeometry.test.ts`・`obernHouseModels.test.ts` で、T5のコミットの時点から失敗している。
- `burgSiteEconomy.test.ts` は、セルのない最小のworldでも収穫重みを省いて成功する。
- Biome・`npm run lint:architecture`・`npm run lint:sim-boundary`：成功。型チェック：既存の `src/city-editor/renderers/fogControls.ts:45` のエラーのみ。
