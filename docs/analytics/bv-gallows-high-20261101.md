# Medieval 36 Permanent timber gallowsのHigh作製

2026-11-01

## 作製内容と再利用

`permanent-town-gallows`へCodex GPT-6.1 SolのLow／Highを明示登録した。既存`create()`はLowのまま保持し、Highは独立した生成処理を使う。4部品をBVから単体表示できる。

| 部品 | High三角形 | 内容 |
| --- | ---: | --- |
| 基礎 | 192 | 連続した石の基礎、積石の層と笠石、控え材の石座 |
| 木造フレーム | 1,524 | 面取りした柱・横梁・斜材、前後の控え、木栓・鉄帯、控えめな木目 |
| ロープ | 3,920 | 横梁に掛かる部分、吊り下がる芯と表面の撚り、空の輪 |
| 梯子 | 1,512 | 地面の接触材、左右の側材、貫通する踏桟と楔 |

`ModelKit`の梁・箱・円柱・管・輪、既存の部品台帳・合成・材質結合と`registerHighVariants`を使う。`timberLadder.ts`は足元と上端の位置・幅・踏桟数から形状を生成する共通部品として分けた。完成モデルを非等方拡縮せず、傾き・平面上の向きに合わせて側材と踏桟を組み立てる。従来のLow梯子は変更していない。

基礎は柱の形に合わせた穴を作らず、連続した石材へ柱を重ねる。梯子も横梁へ一部重ねて接続し、専用の差し込み穴を設けない。接触・支持と、接合のための意図した重なりを区別する。今後の壁・屋根への付属部品でも、付属物の交換で母体に穴が残らない方針を[複合モデル計画](../plan/bv-composite-models.md)と監査の生成スクリプトへ記録した。今回Notre-Dameのコード・形状は変更していない。

無人の外観モデルであり、人物・遺体は含めない。[London Museumの1780年刊行の版画資料](https://www.londonmuseum.org.uk/collections/v/object-993618/john-smith-being-cut-down-at-tyburn-in-consequence-of-a-reprieve-which-came-five-minutes-after-he-had-been-turned-off/)の解説にある、梯子を掛けた枠組みを外観上の参考とした。中世の特定施設を実測再現したものではなく、既存の町用モデルに合わせた概略的な構成である。

## 品質と負荷

| 指標 | Low | High |
| --- | ---: | ---: |
| 三角形 | 1,164 | 7,148 |
| メッシュ | 23 | 5 |
| 固有頂点バッファ内の頂点 | 1,142 | 21,444 |
| ジオメトリ | 15 | 5 |
| 材質 | 4 | 5 |
| CPU属性・indexバッファ bytes | 42,952 | 514,656 |
| 幅×奥行×高さ m | 5.60×2.71×4.45 | 5.85×3.88×4.61 |

Highは登録の8×7×6 m以内。小さなロープの表面装飾に過剰な分割を使わず、試作の10,892から7,148三角形に抑えた。バッファは常駐CPU配列の測定で、一時領域・GPUメモリ・FPSは含まない。

Lowの三角形・法線・材質を含む形状署名は`17486207b629a73fe0ace5a9d2282730e5701f9eafe40bcb44c7a8ed63cd21c6`。Lowの生成本体は維持している。既存CEの`medieval.permanent-town-gallows@default#codex-gpt-6.1-sol`もLowを使う互換入口として残した。Highの明示採用は登録を通して解決できるが、CEの配置・全体品質UIは今回変更していない。

## 検証

- `npx vitest run src/buildings/medieval/gallowsDetails.test.ts src/city3d/adoption.test.ts`：関連2ファイル8件成功。
- Lowの署名、明示HighとCE既定ID、寸法・接地・有限頂点／法線・投影、部品台帳と結合後の頂点範囲、単体のみの生成、資源の独立と一度だけの解放を確認。
- 連続した基礎の中心まで石材があること、柱の埋め込み、梯子の接地材と横梁への接触、踏桟の数と左右の側材への支持を確認。共通梯子を平面上で回した配置でも踏桟の両端が支持されることをレイで検証。
- 実BVで全体Low／High、フレーム・梯子・ロープの単体、全体復帰と別方向からの表示を確認。計測値が一致し、ページエラーなし。
- 変更した生成・登録・関連テスト5ファイルのBiome checkと`git diff --check`が成功。

再計測は`node --import tsx scripts/profileGallowsHigh.mts`。[計測JSON](bv-gallows-high-20261101.json)へ出力する。

非樹木監査は220記録中、Codex Highあり96、未対応124。前回からHighありが1増えた。これは表示状態や共用モデルを含む監査記録数であり、固有資産数ではない。

次はMedieval 37 Glassworkers' guild hall。既存の`GUILD_HALL_PROFILE`・共通会館本体・外階段を使い、職種による変更は紋章・展示品等の用途部品へ限定してHigh化する。
