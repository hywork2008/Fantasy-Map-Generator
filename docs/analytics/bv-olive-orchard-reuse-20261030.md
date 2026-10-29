# BVオリーブ既存4品質の果樹用途での再利用評価

実施日：2026-10-30

[果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) P3／E01。既存の `olive`（Olea europaea）は**孤立した景観用の老木として条件付き再利用可**とする。管理する果樹園の標準樹形・立体の実を見せる近景は別版が必要であり、今回制作済みとはしない。新樹種は追加していない。

## 再利用する範囲と残課題

| 用途 | 判定 | 根拠・後続作業 |
| --- | --- | --- |
| BV単木・孤立した老木の景観 | 再利用可 | ねじれた幹、広く開く冠、銀緑色の葉で識別でき、4品質・採用情報・接地・解放を確認 |
| 実を省略してよい中遠景 | 条件付き | low／mediumの房は輪郭用。近景の透け方・細葉の形までは再現しない |
| 管理する果樹園の代表木 | 未対応 | 地域・時代・剪定法を選び、主枝・樹高・冠の別樹形を作るO01へ |
| 果実の形と付き方を見る近景 | 未対応 | 現状は枝へ明示接続しない三角形マーカー。果実本体・軸のO02へ |
| CEの密な列植・自動配置 | 未対応 | 土地利用・列・間隔・LODと有限予算のO03／CE果樹園設計へ |

[RHSの種・姿の説明](https://www.rhs.org.uk/plants/olives) は銀緑色の葉と開いた枝構造、[RHSの栽培資料](https://www.rhs.org.uk/plants/olives/how-to-grow-olives) は園芸的な樹形の違いと剪定、[Texas A&Mの栽培資料](https://mytexas.ag.tamu.edu/publications/olives-texas-fruit-and-nut-production/) は管理園地での主枝・中心の開き方の参考にした。これらの現代資料から、中世等の歴史的な栽培樹形を一意に確定してはいない。

O01〜O03は同種の後続課題として計画書§4へ追加した。既存の景観用モデルとは作者・派生元・用途別採用を区別し、新樹種の件数に加算しない。

## 既存4品質の計測

| 品質 | 三角形数 | source属性・index bytes | mesh／材質数 | 地表からの上端 m | 作者 | 果実マーカー枚数 |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| low | 253 | 27,324 | 2／2 | 5.781 | Codex GPT-6.1 Sol | 0 |
| medium | 1,337 | 144,396 | 2／2 | 6.036 | Codex GPT-6.1 Sol | 0 |
| high | 9,149 | 988,092 | 2／2 | 6.085 | Codex GPT-6.1 Sol | 135 |
| ultra | 25,091 | 2,709,828 | 2／2 | 6.116 | Claude Opus 5.5 | 135 |

source bytesはCPU側の属性・index配列であり、GPUメモリ量ではない。[前回の乾燥地4品質化](ce-tree-lod-dryland-20261029.md) と三角形数・配列サイズが一致した。生成器 `src/buildings/landscape/mediterraneanMontaneTrees.ts`、樹種登録、作者・版、CE採用表に差分がないことを確認した。

highの木部はultraと一致する。highは葉数を3分の1にし幅を3倍にするため、近景ではultraの細い葉と形が異なる。mediumは葉群に当てはめた房、lowはねじれた3本の幹ごとの上下の房。銀色は葉単位の色の抽象化であり、葉の表裏を別材質にした表現ではない。

果実は各135枚の小さな三角形で、high／ultraの重心位置が完全一致することを確認した。低い2品質では描かれない。果実本体や果柄を生成する処理はなく、葉群付近へマーカーを散布している。元のマーカー数を135個の実・収量と読み替えない。

既存LODは距離40／120／400 m・`quality-first`、樹高定義6.2 m。新規果樹の `pixels`・`bounded` へ置き換えていない。この単木確認では密な園地の予算や都市全体FPSを測っていない。

## 修正した表示メタデータ

BVの `size` は9×9×7 mだったが、全品質の最大Xがhighで約5.0176 mあり、幅の外接枠からはみ出していた。モデルの原点を動かさず、宣言幅だけを**10.1 m**へ修正した。原点中心の必要幅は約10.0352 m、奥行9 m・高さ7 mは既存値で全品質を覆う。地下の根はY=-0.35 m、幹の地表基準はY=0。

`borealTrees.test.ts` に全4品質の外接枠を確認する回帰検証を追加した。BV説明は、老木用途・果実マーカーと低品質での省略・近景と剪定園地の未対応範囲・植物資料を実装に合わせて明記した。形状・作者・派生元・採用版は維持する。

## 実BV・GPU・再現手順

`scripts/verifyBvOliveOrchardReuse.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画し、イチジク・レモンhighとの同尺度比較と、ultraの果実マーカーに寄った近景を確認した。実BVは1200×800でTreesの `Olive · Olea europaea` の4品質を切り替えた。

- ねじれた幹と開く冠を確認。low／mediumは個葉より面が連続し、highの葉はultraより幅広く見える。果実の近景では三角形のマーカーと枝への接続の不足が見えるため、立体果実モデルとして受け入れない。
- 実BVで4品質・作者切替・派生元・`CE adoption: Adopted` と正面／上面SVGを確認した。下位3品質はCodex、ultraはOpusの既存の版である。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回のgeometryは8→8→8、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

計測値は [JSON](bv-olive-orchard-reuse-20261030.json)。検証スクリプトはlocalhost:5231で一時Viteサーバーとheadless Chromiumを起動し、マーカー数・high／ultra位置一致・作者・実BVの採用表示・資源解放を確認してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-olive-reuse` に出力し、目視後に削除した。画像はGitに収録しない。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/borealTrees.test.ts -t olive
npx vitest run src/city3d/adoption.test.ts src/building-viewer/wikipedia.test.ts
node --import tsx scripts/verifyBvOliveOrchardReuse.mts
```

関連5ファイルから選んだ11件が成功。樹木3ファイルはオリーブを対象とする6件のみを実行し、他120件は意図して除外。採用・参照の2ファイルは5件成功。寸法の回帰検証、4品質・接地・木部一致・材質・有限値・CE prototypeと解放、作者・採用・Wikipedia参照を確認した。変更した2ファイルのBiomeと `git diff --check` は成功。

ソース差分は表示メタデータと回帰検証のため、全体型チェックを再実行していない。前作業で報告された既存の `fogControls.ts:45` の型エラーを今回修正・再確認したという意味ではない。全件テスト・森林全条件・多数シードの検証も実行していない。

E01の評価とP3を完了。新規モデルは増えておらず29樹種・116品質枠を維持する。次はP4／F06ヨーロッパグリの資料・樹形・寸法を確定して4品質とBV登録を実装する。
