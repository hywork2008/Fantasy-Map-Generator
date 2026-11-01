# BV複合モデル P4：Urban mendicant friary High

2026-11-01。[設計書](../plan/bv-composite-models.md)のP4を実装した。作者はCodex GPT-6.1 Sol。

## Highの建築

既存の`Monastery`敷地計画を使い、主要建築を別の詳細factoryで生成する。部品を細分化しただけのHighではなく、次の形状を追加した。

- **教会堂・内陣・後陣**：厚みを持つ壁、実際に貫通する尖頭窓・入口、石の窓枠、奥まったガラスと方立、開いた木扉、段付き控壁、石の帯。身廊と内陣の共有面を除き、内部の接続を塞がない。
- **居住棟**：二段の開口、回廊へ面する扉、屋根の継ぎ目、壁の帯。隅で重なる棟の床を一度だけ生成し、屋根は隣接棟の高い屋根面に合わせて切る。
- **門棟**：通路を空けた石の支持部と上階の開口、床・壁・屋根。既存の門の配置と最低通路高さを保つ。
- **鐘架**：開いた木組み、支え、梁、軒、空洞のある鐘と舌。教会堂の屋根には鐘架の位置で切り欠きを設ける。
- **回廊**：柱脚・柱身・柱頭、実際に通り抜けられる尖頭アーケード、垂木、屋根の継ぎ目。中庭の中央には床・屋根を追加しない。
- **囲壁**：開いた既存壁線と入口を保ち、分節した笠石を追加。

教会堂＋回廊＋中庭という敷地構成を既存計画から詳細化した例示的外観である。正確な実在建築の寸法や彫像、室内用途・家具を再現したモデルではない。

## 品質の登録とCE

`monastery.friary@low#codex-gpt-6.1-sol`と`monastery.friary@high#codex-gpt-6.1-sol`を明示登録した。既存`monastery.friary@default#codex-gpt-6.1-sol`はLowのまま維持する。登録factoryは要求された品質を固定し、呼出側の`architectureQuality`でLow／defaultをHighへ変えたり、HighをLowへ変えたりできない。

直接生成APIでは`MonasteryRenderOptions.architectureQuality`で選ぶ。High対応はFriaryのみで、Abbey・Orthodoxへ未対応Highを指定すると拒否する。既存の両修道院にHighと表示しない。

教会堂・後陣・居住棟・門棟・鐘架・回廊・囲壁の部品をHighとし、庭・菜園・基礎・樹木・井戸は独立したLow部品として扱う。既定の樹木4本は合計564三角形、井戸は632三角形。樹木Ultraへの暗黙の依存を戻していない。

制作時点ではCEの`createTownMonasteries`はdefaultを採用し、実測でもLowの4,262三角形・1描画メッシュだった。以下のJSONと画像はその時点の記録である。

同日の追加修正で、CEのModel quality設定を生成と更新判定へ接続した。Highでは登録High、Low／Standardでは登録Lowを採用する。設定変更だけでも既存モデルを解放して再生成し、同じ設定の再同期では再生成しない。Highの材質結合済みメッシュが持つ部品範囲もCEの結合へ引き継ぐ。保存計画と自動配置、樹木・井戸のLowは維持する。BVのCE採用表示も設定に応じた説明へ更新した。

その後、ユーザーのCEで表示されていた施設がAbbeyであると確認し、Abbeyにも専用Highと設定切替を追加した。Orthodoxは既存defaultのまま。[原因と追加修正・比較画像](ce-abbey-quality-20261101.md)を参照。

追加修正の検証は`npx vitest run src/city3d/three/friaryMeshes.test.ts src/city-editor/renderers/cityViewRendering.test.ts src/city3d/adoption.test.ts`の3ファイル21件が成功。3品質の混在修道院生成・三角形数・接地・部品範囲・解放と、文書編集なしの品質変更・再生成・旧モデル解放を確認した。描画更新のテストではWebGLRendererをモックし、ブラウザーでの追加確認は行っていない。

## 計測

| 指標 | 現行Low | 新規High |
| --- | ---: | ---: |
| 三角形 | 4,262 | 38,983 |
| 描画メッシュ | 206 | 13 |
| 材質 | 50 | 13 |
| ユニーク頂点 | 5,768 | 116,949 |
| 属性・index配列バイト | 196,216 | 2,822,760 |

Highは材質別に結合し、部品台帳と各描画メッシュ内の部品別頂点範囲を維持する。Lowの共有小形状は結合で展開されるため、ユニーク頂点数の比率をそのまま品質比・速度比には扱わない。配列バイト数はCPUの最終保持配列で、JSオブジェクト、構築中の一時領域、GPUメモリは含まない。

旧調査開始時のFriary Lowは350,742三角形・497メッシュだった。新規Highでも38,983三角形であり、旧Lowの重さが建築の精密さに由来しなかったことと整合する。比較対象だったSalisbury Highは295,432三角形。いずれも異なる寸法・構成のモデルで、三角形の多さを品質の判定には用いない。GPU FPSの改善を測定したものではない。

`node --import tsx scripts/profileFriaryHigh.mts`で[計測JSON](bv-friary-high-p4-20261101.json)を再生成できる。登録Low／High、25部品それぞれの単体表示経路、実CEのdefault結合を計測し、モデルを都度解放する。生成時間はNode v22の単発・順序依存の観測で速度比較には使わない。

## 検証

関連5ファイル、計27件成功。

- 初回：`npx vitest run src/buildings/monasteries/friaryDetails.test.ts src/buildings/monasteries/monasteryParts.test.ts src/city3d/three/friaryMeshes.test.ts src/city3d/adoption.test.ts src/buildings/compactModel.test.ts`：25件成功。
- 床・屋根の重複検査と登録品質の固定検査を追加後、`npx vitest run src/buildings/monasteries/friaryDetails.test.ts`：7件成功。変更のない既存20件は再実行していない。
- Highの入口、壁を貫通して奥にあるガラス、身廊と内陣の接続、回廊の中庭とアーチ下の通路、アーチ頂部の石をレイで確認。
- 居住棟の重複部分で床を二重に生成せず、低い方の屋根を残さず高い屋根面へ接続することを確認。
- 回転0.43 rad・縮尺0.7・標高3・基礎下端−1の計画で、門の通路、接地と高さ、入力の不変性を確認。
- Highの寸法上限、75,000三角形未満・20メッシュ以下、有限頂点・法線、部品の品質と台帳総数、結合後の部品範囲、資源の独立と一度だけの解放を検証。
- `node --import tsx scripts/profileMonasteryParts.mts`：Friary・Abbey・OrthodoxのLow形状ハッシュがP2以前の基準と一致。CE既定と採用IDの既存テストも成功。
- 変更した生成・登録・関連テスト5ファイルのBiome checkと`git diff --check`が成功。

実BVでLow／High全体、教会堂と回廊の単体表示、品質切替と全体へ戻した比較値を確認し、Nodeの数値と一致した。依存元表示は全体の樹木・井戸を解決し、単体ではその部品の依存元だけを示すよう修正した。CEの対話操作・GPU FPSは今回検証していない。

非樹木High監査を再生成した結果は220記録、Codex Highあり68、未対応152。前回からHighありが1増加した。これらは重複表示・状態等を含む記録数で、固有資産数ではない。

次はP5としてG07 Salisbury等の固有建築を部品ごとに検査できる表示へ展開する。既存の固有建築の配置・寸法を維持し、一般施設への任意交換は互換性を個別に確認する。
