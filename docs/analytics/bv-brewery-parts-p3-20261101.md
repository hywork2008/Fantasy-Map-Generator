# BV複合モデル P3：Breweries

2026-11-01。[設計書](../plan/bv-composite-models.md)のP3の最後としてMedieval 15の2モデルに対応した。P3は住宅系4カテゴリ9モデルで完了し、次はP4 Friary Highへ進む。

## 部品と構成

Town brewery and copper yard、Small ale brewhouseを両品質とも6部品へ分割した。モデルID・variant ID・作者・公開factory名を維持する。

| 部品 | 構造と境界 |
| --- | --- |
| hall | 醸造棟の外殻、開口、床、屋根 |
| shelter | 炉釜の上屋。柱・足元・梁・屋根、Highの煙突用切り欠きと雨仕舞い |
| heating-unit | 炉・支持台と銅釜・液面・煙突・煙道。上屋と別生成しても地面から支持される |
| mash-tun | 仕込み桶、箍、液面、攪拌棒、Highの蛇口。道具と容器を一緒に生成 |
| malt-station | 作業台・トレー・麦芽。支持物と上の物をまとめる |
| casks | 閉じた貯蔵樽3本。両品質ともStorage propsの同じfactoryを使用 |

銅釜と仕込み桶は加熱・仕込みに必要な形状、蛇口、攪拌棒を持ち、閉じたStorage樽とは用途が異なるため専用設備として保持する。Highの貯蔵用`cask`関数は削除し、宿屋と同じ`createMedievalContainerModel("barrel", "closed")`へ置き換えた。貯蔵樽部品は共通default（Low扱い）で、親のHighを継承しない。依存元も両品質で記録する。

BVの`Composition`は以下の3構成。各部品の単体表示も可能。

- **Standard brewery**：全6部品。
- **Without storage casks**：貯蔵樽を除く5部品。
- **Brewing yard only**：醸造棟と貯蔵樽を除く、上屋・加熱ユニット・仕込み桶・麦芽作業台。

構成変更時も加熱用の釜と炉、煙突を切り離さず、単体表示では上屋がなくても加熱ユニットが接地する。Highの煙突は、切り欠いた上屋の屋根を通過する。Lowの従来の簡略表現は維持する。配置は元の全体位置を保持し、部品を並べ替えたり空いた場所へ詰め直したりはしない。

## 分割と共通化を別々に検証

まず旧High貯蔵樽を残したまま分割し、全4ケースの三角形・色・形状のSHA-256が元と一致することを確認した。[樽共通化前の計測](bv-brewery-before-shared-casks-20261101.json)に記録している。ハッシュは材質RGB・sideとワールド頂点（小数5桁）を三角形単位でソートし、法線・資源ID・bucket順を含めない。

次にHighの樽を意図的に共通モデルへ置き換えた。樽以外の各部品のハッシュは共通化前後で全て一致し、Low全体のハッシュも元と一致した。[最終計測](bv-brewery-parts-p3-20261101.json)には共通化後の基準値と、非樽部品の一致結果を含む。

| 対象 | 変更前の三角形 | 変更後の三角形 |
| --- | ---: | ---: |
| Town Low 標準 | 16,978 | 16,978 |
| Small Low 標準 | 16,858 | 16,858 |
| Town High 標準 | 43,110 | 53,538 |
| Small High 標準 | 34,194 | 44,622 |
| High 貯蔵樽3本 | 4,392 | 14,820 |

旧High貯蔵樽は簡単な一体形状で、共通Storage樽の方が細かい。共通化によるコード重複の削減と、形状の閉塞保証が目的で、三角形の削減ではない。High全体のメッシュ・材質数は元の14→15（分割のみの段階では同色材質の統合で11）。Lowの描画メッシュ数はTown 178、Small 168のまま。部品所有で小さなバッファ・材質が増え、Lowのgeometryは103→105、材質は27→32となる。

| 最終構成 | Town Low / High 三角形 | Small Low / High 三角形 |
| --- | ---: | ---: |
| 標準 | 16,978 / 53,538 | 16,858 / 44,622 |
| 貯蔵樽なし | 2,158 / 38,718 | 2,038 / 29,802 |
| 醸造庭のみ | 1,564 / 16,350 | 1,564 / 16,350 |

共通樽3本の14,820三角形がLow標準の大半を占める点は付属物の品質予算の課題として残す。GPU FPS・ピークメモリを改善したという測定ではない。

`node --import tsx scripts/profileBreweryParts.mts`で最終計測を再生成できる。共通化前JSONを比較入力として読み、全12構成・各単体部品・非樽部品の一致を確認し、生成モデルを都度解放する。

## 検証

`npx vitest run src/buildings/medieval/breweryParts.test.ts src/buildings/medieval/breweryAndGranaryDetails.test.ts src/buildings/props/medievalContainers.test.ts src/buildings/compactModel.test.ts`：4ファイル36件成功。

- 全構成の役割・品質・台帳総数・High結合後の部品別頂点範囲を確認。
- 炉口の開口と周囲の壁、屋根を含む煙突内の煙道、仕込み桶の液面、単体加熱ユニットの接地と銅釜の液面をレイで確認。
- 貯蔵樽の共通factory呼び出し、閉じた状態・Low扱いの宣言・依存元、3本の蓋が閉じることを確認。Storage props側の既存の蓋全面検査も成功。
- 屋根間の離隔、寸法・投影・資源解放等の既存検証も成功。
- 変更した部品生成・登録・関連テスト6ファイルのBiome checkと`git diff --check`も成功。

実BVで2モデル×2品質×3構成を巡回し、加熱ユニットのHigh→Lowと全体へ戻した際の比較値を確認。全値がNode計測と一致した。CEの対話操作・GPU FPSは今回測定していない。

- [Town High・醸造庭のみ](bv-brewery-yard-p3-20261101.png)
- [Town High・加熱ユニット単体](bv-brewery-heating-p3-20261101.png)
- [Town High・標準へ戻した表示](bv-brewery-standard-p3-20261101.png)

次はFriaryの主要建築（教会堂・居住棟・回廊等）を部品単位でHigh化する。樹木・井戸等の付属物の品質と予算を独立させる方式を維持する。
