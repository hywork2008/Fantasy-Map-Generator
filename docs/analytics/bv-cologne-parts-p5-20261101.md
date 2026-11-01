# Cologne Cathedralの部品表示（P5）

2026-11-01

## 実装と共通基盤

G05 Cologne Cathedralの既存Low／Highを12部品へ分割し、Salisburyで導入したBVのViewとResolutionから単体表示できるようにした。今回は新規Highの作製ではなく、既に明示登録されていたHighを分割・検査可能にする変更である。三角形数から品質を自動判定せず、Low／Highのfactoryと部品品質を一致させる。

| 部品 | Low三角形 | High三角形 |
| --- | ---: | ---: |
| 身廊・内陣と南北の二重側廊 | 1,740 | 103,552 |
| 北／南翼廊（各） | 74 | 3,984 |
| 北／南の飛梁と支持部（各） | 2,352 | 48,552 |
| 内陣周歩廊 | 96 | 252 |
| 内陣の高い後陣 | 96 | 252 |
| 放射状礼拝堂群 | 504 | 75,432 |
| 西正面と扉・大窓 | 192 | 9,688 |
| 北／南の西塔・尖塔・小尖塔（各） | 2,704 | 53,520 |
| 交差部の小塔・尖塔 | 1,088 | 41,920 |

身廊と側廊の窓列・扶壁は、既存の共通`bays`呼び出しと、それを支持する棟を一つの部品に保持した。塔は塔身と尖塔・小尖塔を一緒に切り替え、飛梁も支持柱と装飾を一緒に切り替える。固有建築の固定配置を検査する単位であり、一般施設の交換可能な建築プリセットとしては公開していない。

`landmarks/components/assembly.ts`へ部品factoryの列挙と材質結合を共通化し、Salisburyも同じ処理へ移した。列挙だけでは形状を生成せず、選択したfactoryのみを作る。部品台帳と結合メッシュの頂点範囲を保持する。既存の`ArchitectureKit`／`GothicDetailKit`／`ModelKit`と`compactModel`を再利用し、建築部品の別実装を作らない。

ギルドホールの`GUILD_HALL_PROFILE`・共通建築・外階段の契約は今回も変更していない。CologneとSalisburyの合成処理は固有建築の表示向けであり、会館の寸法や用途別構成の代替にはしない。CEの配置・LOD・描画コードも変更していない。

## 形状と負荷の比較

| 指標 | Low分割前 | Low分割後 | High分割前 | High分割後 |
| --- | ---: | ---: | ---: | ---: |
| 三角形 | 13,976 | 13,976 | 443,208 | 443,208 |
| メッシュ | 381 | 5 | 62 | 7 |
| 固有頂点バッファ内の頂点 | 24,354 | 41,928 | 1,329,401 | 1,329,624 |
| ジオメトリ | 193 | 5 | 59 | 7 |
| 材質 | 5 | 5 | 7 | 7 |
| CPU属性・indexバッファ bytes | 809,844 | 1,006,272 | 42,541,576 | 31,910,976 |

材質の設定が等しい通常Lambert材質をまとめて結合し、UVを除いた。Lowは共有・index付き形状の非index化でバッファが約24.3%増える。Highは約25.0%減る。これは常駐CPUバッファの値で、JSオブジェクト、生成中の一時領域、GPUメモリ、FPSは測っていない。三角形の削減や実測FPSの改善を示すものではない。

Highの約86.4%は、身廊・側廊103,552、西塔2本107,040、南北飛梁97,104、礼拝堂群75,432の合計が占める。重さの主因を部品単位で調べられる状態になったが、今回それらの装飾の簡略化は行っていない。

ワールド座標の三角形・法線を1e-5で丸め、頂点順と材質設定を含め、バッチ順を無視して比較した。Low／Highとも制作前後で署名が一致した。材質の色・窓の位置・塔と尖塔の高さ・既存の概略的な外殻や接合部を変更していない。

| 品質 | SHA-256 |
| --- | --- |
| Low | `58139dcc3882edec58c837b9e5634ad29ebd26df558ddbea29135c72230fa0b8` |
| High | `ce26ac994c2301e7f1e989ae04de38f28f84060db19ca7875d53d712d4a8e0c5` |

Highの幅×奥行×高さは約142.42×86.62×157.26 mで、登録の151×91×159 m以内。Salisburyも共通化前後の計測JSONの全rowsが一致し、参事会室Highを含めて形状・計測値・部品情報を維持した。計測用の署名関数も`scripts/lib/landmarkFingerprint.mts`を両方のスクリプトで使う。

## 検証と再現

- `npx vitest run src/buildings/landmarks/cologne.test.ts src/buildings/landmarks/cologneParts.test.ts src/buildings/landmarks/salisbury.test.ts src/buildings/landmarks/salisburyParts.test.ts src/buildings/landmarks/gothic/highDetail.test.ts -t 'G05|G07|cologne|salisbury|retains|constructs|keeps|opens'`：関連5ファイル15件成功、対象外14件スキップ。
- 固定署名、全体の三角形数、12部品の品質・作者、台帳と頂点範囲の一致、選択した塔だけの生成と元の配置、独立した資源の解放を検証。Lowの透かし尖塔の8部材×2本という既存検証もfactory単位で維持。
- 変更した建築・共通処理・関連テスト6ファイルのBiome check、`git diff --check`が成功。
- 独立したChromiumで実BVの全体Low／High、西塔Low／High、放射状礼拝堂群High、北飛梁High、全体へ復帰、再選択時のリセットを確認。比較値の混入とページエラーなし。
- 同じ実BVでSalisbury全体Highと参事会室Highを確認し、それぞれ310,832と15,448三角形で一致。

再計測は`node --import tsx scripts/profileCologneParts.mts`。[計測JSON](bv-cologne-parts-p5-20261101.json)に部品ごとの値を保存した。部品台帳のメッシュ数は各factoryの内部結合後、全体の材質結合前の値で、Highの台帳メッシュ総数193は表示の7メッシュとは区別する。

次はNotre-Dame de Parisの既存Low／詳細モデルの生成境界を確認し、同じ部品表示へ展開する。P5のCE側LOD／バッチ評価と、監査に残る非樹木Highの制作は継続課題。
