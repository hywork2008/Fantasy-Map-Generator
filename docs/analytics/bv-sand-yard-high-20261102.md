# Medieval 40 — Sand storage and loading yard High (2026-11-02)

`sand-storage-yard`にCodex GPT-6.1 Solの明示的なHighを登録した。Lowの形状署名とCEのdefault IDは維持する。

## 構成と負荷の原因

既存Lowは45,256三角形のうち、共通の空籠だけで41,448三角形を使っていた。Highでは籠を追加せず、空樽2,232三角形と既存Highの手押し車を再利用した。既存の籠・樽・手押し車のfactory自体は変更していない。

| 部品 | 品質 | 三角形 | 内容 |
| --- | --- | ---: | --- |
| shelter | High | 6,892 | 既存`addCraftShed`による開いた上屋 |
| retaining-bays | High | 1,548 | 敷地床・区画床、板壁・支柱・留め具・控え材。積み込み側は開放 |
| sand-stock | High | 1,280 | 床上の閉じた専用砂山2基。地中の球体を使わない |
| wheelbarrow | High | 7,376 | 既存`createHighHandCart("wooden-wheelbarrow")` |
| loading-tools | High | 604 | 足付き道具架・シャベル・枠と網を持つ篩 |
| barrel | Low | 2,232 | Storage propsの空樽をそのまま使用 |

主要構造はHighだが、共通樽はBV部品表示・台帳ともLowと明示し、全体Highを理由に格上げしない。手押し車と樽の`basedOn`も記録する。6部品は独立factoryから必要なものだけを生成し、既存の合成・材質結合処理を使う。任意配置・部品交換のUIは今回追加しない。

上屋は既存の寸法で生成し、完成モデル全体の縮小は行わない。そのため登録の高さ上限を4 mから5 mへ拡張した。実際のHighは幅11×奥行8.5×高さ約4.53 mで、幅・奥行の既存上限15×13 mにも収まる。Lowの実形状は不変。

## 計測

| 品質 | 三角形 | メッシュ | CPU属性バッファ bytes |
| --- | ---: | ---: | ---: |
| Low | 45,256 | 124 | 1,156,448 |
| High | 19,932 | 13 | 1,435,104 |

Highの三角形はLowより約56%少ない。材質結合で描画メッシュも削減する一方、非index化で属性配列は増える。CPU値は重複しない属性・index ArrayBufferの合計で、JSオブジェクト・一時領域・GPUメモリ・FPSを含まない。実行速度の改善率を示す値ではない。

再計測は`node --import tsx scripts/profileSandYardHigh.mts`。[計測JSON](bv-sand-yard-high-20261102.json)に署名・寸法・台帳・部品別値を保存する。非樹木監査は220記録中Highあり101、未対応119。配置・状態違いを含む記録数であり、固有資産数ではない。

## 検証と次の対象

- `sandYardHigh.test.ts`：5件成功。Low署名・CE既定、共通手押し車の同一性・樽Lowの依存元、砂山の床との接触・区画内への収まり・前面開放、シャベルと篩の支持、寸法・有限座標・6部品範囲・必要部品のみの生成・資源所有と解放を検証。
- 最初の支持検査で篩の片側を支える足が不足していたため、架台の足をつなぐ横材を追加した。支持と全体資源・部品範囲の2件を再実行して成功。
- `src/city3d/adoption.test.ts`：3件成功。合計8件成功。
- `npx tsc --noEmit --pretty false`、変更した生成コード・テストのBiome check、`git diff --check`が成功。
- 実BVでHigh全体、6部品の単体、Low切替、High復帰を確認。値は固定計測と一致し、ページエラー0件。全体と道具の近景を目視確認。確認画像は一時領域のみで、リポジトリへの保存・PNG参照は追加しない。

次はMedieval 41 Eastern European Orthodox monastery。既存の修道院部品factoryとCEの品質指定を確認し、共通部品を再利用して未対応の建築をHigh化する。
