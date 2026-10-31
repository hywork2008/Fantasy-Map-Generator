# BV複合モデル P3：Bakeries

2026-11-01。[設計書](../plan/bv-composite-models.md)のP3のうちMedieval 10の3モデルに対応した。

## 部品と構成

Detached bread bakehouse、Bakery and bread shop、Communal bread oven shelterのLow／Highを独立factoryへ分割した。既存の`createHighBakery`と型の公開入口、モデルID、variant ID、作者、登録品質は維持する。構成違いを新しいHigh資産として登録しない。

| 部品 | 境界と支持関係 |
| --- | --- |
| shell / shelter | 住宅・作業棟、または共同窯の上屋。上屋は柱・足元・支え・屋根を一体で生成 |
| oven | 台座、炉床、ドーム、窯口、煙突、窯口前の受け台。薪を外しても窯本体は地面から支持される |
| fuel | 窯の前の薪。窯口と同じ配置から生成 |
| cooling-bench / bread | 冷却台とパン。パンを含む全体構成では台も必ず含む |
| tools | ピールとその支持台。Highは支持台も同じ部品に含める。Lowは既存の簡略表現を維持 |
| kneading-station | Highの作業台・捏ね槽・生地。台と上の物をまとめて切り替える |

Detached／TownのHighは7部品、Lowは5部品。共同窯は両品質とも4部品。元のモデルにない道具やパンを追加生成せず、例えばTown Lowにはピール部品、Detached Lowにはパン部品を列挙しない。

BVの`Composition`に次の3構成を追加し、`View`で各部品を単体表示できる。

- **Standard bakery**：元の全体構成。
- **Without workstations**：住宅棟または上屋＋窯＋薪。冷却台・パン・道具・捏ね設備を一緒に除外する。
- **Oven and fuel**：窯＋薪。住宅棟／上屋も生成しない。

単体・構成変更は生成前の選択で、全体を作って隠す方式ではない。窯の位置・煙突高さ等は元のモデルに従う。共同窯Highの煙突は上屋用の高さ4.55 mを単体や上屋なし構成でも保持する。異なる住宅棟と窯を任意に接続する配置機能は今回追加していない。

## 形状と負荷

| モデル | 品質 | 標準の三角形 / メッシュ | 作業設備なしの三角形 | 窯と薪の三角形 |
| --- | --- | ---: | ---: | ---: |
| Detached | Low | 1,106 / 63 | 994 | 520 |
| Detached | High | 43,384 / 10 | 37,680 | 23,436 |
| Town | Low | 2,518 / 79 | 1,114 | 520 |
| Town | High | 42,256 / 10 | 36,528 | 23,436 |
| Communal | Low | 780 / 34 | 728 | 520 |
| Communal | High | 30,556 / 6 | 30,456 | 23,580 |

分割前に、標準6ケースの材質RGB・sideと三角形のワールド頂点を小数5桁で記録し、三角形間をソートしたSHA-256を採取した。分割後は全6ケースで一致した。法線・資源ID・bucket順はハッシュの対象外。三角形数・描画メッシュ数も維持した。

Highは各部品を独立所有した後、同じ設定の材質を既存の`compactModel`の明示指定で統合する。台帳と結合メッシュ内の部品別頂点範囲も保持する。Lowは部品ごとの立方体・材質の所有によりユニーク資源数が多少増えた。Detachedはgeometry 13→16・材質7→13、Townは20→22・8→13、Communalは11→13・4→7。FPSやピークメモリの改善を示す変更ではない。

窯本体の単体負荷はLow 240三角形、HighはDetached／Town 22,716、Communal 22,860。元のHighの細かな窯・目地等を保持しており、この段階では簡略化していない。部品別の負荷が比較可能になった。

`node --import tsx scripts/profileBakeryParts.mts`で[計測JSON](bv-bakery-parts-p3-20261101.json)を再生成できる。6ケースの分割前ハッシュと照合し、18構成と全ての単体部品を生成・計測・解放する。

## 検証

関連4ファイル、計27件成功。

- `npx vitest run src/buildings/medieval/bakeryParts.test.ts src/buildings/medieval/cartAndBakeryDetails.test.ts src/buildings/compactModel.test.ts src/city3d/adoption.test.ts`：既存3ファイル21件成功。新規テスト内のRaycaster参照誤りを修正し、以下で対象だけ再実行。
- `npx vitest run src/buildings/medieval/bakeryParts.test.ts`：6件成功。
- 全構成の品質・役割・台帳総数・Highの結合範囲、窯口の開口と奥の炉壁、煙突上端の開口と縁をレイで確認。
- ピール単体に支持台が含まれることを確認。既存の煙突の支持・寸法・投影・資源解放・CE採用の検証も成功。
- 変更した生成・登録・テスト5ファイルのBiome checkと`git diff --check`が成功。

実BVで3モデル×2品質×3構成を巡回し、窯の単体High→Low切替と全体へ戻した際の比較値を確認した。全数値はNode計測と一致した。CEの対話操作・GPU FPSは今回測定していない。

- [Town High・窯単体](bv-bakery-oven-p3-20261101.png)
- [Town High・標準へ戻した表示](bv-bakery-standard-p3-20261101.png)
- [Communal High・上屋を含む標準構成](bv-bakery-shelter-p3-20261101.png)

後続の[Inns実装記録](bv-inn-parts-p3-20261101.md)で宿泊棟・厩舎・サービス棟・中庭を部品化した。次はMedieval 15 Breweriesの醸造棟・炉釜・容器・作業設備を分割する。
