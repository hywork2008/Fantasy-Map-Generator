# BVナツメヤシ既存4品質の果樹用途での再利用評価

実施日：2026-10-30

[果樹追加計画](../plan/fmg-crop-climate-bv-fruit-tree-tasks.md) P4／E02。既存の `date_palm`（Phoenix dactylifera）は**孤立した結実する雌木の景観例として条件付き再利用可**とする。果実近景・管理園地の樹形・樹齢と雌雄の組合せは未対応。今回の評価で新樹種は追加していない。

## 再利用する範囲と残課題

| 用途 | 判定 | 根拠・後続作業 |
| --- | --- | --- |
| BV単木・孤立したオアシスの景観 | 再利用可 | 傾いた幹、灰緑色の羽状葉、基部のひこばえ、垂れる枯葉を持ち、4品質・接地・作者と採用・解放を確認 |
| 実を省略してよい中遠景 | 条件付き | lowは葉の弓形に沿う帯、mediumは葉に沿う房。個々の小葉と葉軸の連続性は詳細品質と一致しない |
| 管理する果樹園の代表木 | 未対応 | 枯葉・ひこばえの除去や冠の管理、地域・時代・品種の姿はD01へ |
| 実の形と付き方を見せる近景 | 未対応 | 4本の軸と96枚の三角形マーカー。立体の実・枝分かれした果房・小果柄はD02へ |
| 樹齢差・雌雄を含む園地配置 | 未対応 | 現在は結実木の固定例。雄木・若木の別姿、配置と作物データの対応はD03／CE果樹園設計へ |
| CEの密な列植・自動配置 | 未対応 | O03の有限予算・列・間隔・土地利用との接続で扱う |

[RHS](https://www.rhs.org.uk/plants/12768/phoenix-dactylifera-f/details) の弓なりの羽状葉と細長い灰緑色の小葉、[Oxford Universityの植物資料](https://herbaria.plants.ox.ac.uk/bol/plants400/Profiles/op/Phoenix) の雌雄別株・雌木の結実という記述を照合した。資料の園芸寸法や写真を、このモデルの実測値・全地域や全時代共通の管理形として採用していない。元のKew紹介ページは今回403となったため、取得できた上記資料を使用した。

D01〜D03は同種の後続課題として計画書§4へ追加した。E02の完了は既存モデルの再利用評価の完了であり、後続モデルやCE配置の完成ではない。元の作者・版・派生元を保持し、別樹形を作る場合も新樹種の件数へ加算しない。

## 既存4品質の計測

| 品質 | 三角形数 | source属性・index bytes | mesh／材質数 | 地表からの上端 m | 作者 | 果実マーカー枚数 |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| low | 452 | 48,816 | 2／2 | 11.797 | Codex GPT-6.1 Sol | 0 |
| medium | 2,454 | 265,032 | 2／2 | 11.794 | Codex GPT-6.1 Sol | 0 |
| high | 4,224 | 456,192 | 2／2 | 11.825 | Codex GPT-6.1 Sol | 96 |
| ultra | 6,816 | 736,128 | 2／2 | 11.860 | Claude Opus 5.5 | 96 |

表はChromiumでの実測。source bytesはCPU側の属性・index配列であり、GPUメモリ量ではない。[前回の乾燥地4品質化](ce-tree-lod-arid-20261029.md) とlow・high・ultraの描画量は一致した。mediumは今回のNodeでも従来どおり2,455三角形・265,140 bytesだが、Chromiumでは2,454三角形・265,032 bytesとなった。差は1面・108 bytesで、外接寸法は一致する。原因は今回特定しておらず、実行環境間の面数の完全一致を保証しない。JSONに `measurementRuntime` と `nodeMediumMeasurement` を保存し、この差を隠さず残した。両環境とも制作予算内。

high／ultraの木部は一致し、highは小葉の半数を省略して幅を補う。lowは葉に沿う折れた帯、mediumは葉の前後2区間に当てはめた房となり、隙間や枯葉の太さが近景の細い葉と異なる。樹形には2本の基部のひこばえ、30枚の生きた主冠の葉と6枚の垂れる枯葉がある。これらは静的な姿であり、樹齢や管理履歴をシミュレートするものではない。

high／ultraは4本の短い下垂軸と、それぞれ付近へ散布した24枚の小さな黄土色の三角形マーカーを持つ。計96枚の重心位置は詳細2品質で完全一致する。low／mediumでは実と軸を省略する。マーカーは個々の枝分かれした果房や果柄へ接続しておらず、96個の立体果実・収量・成熟段階へ読み替えない。BV説明の従来の `unripe date strands` は、実際の色と簡略形を説明する表現へ改めた。

既存LODは `distance`・`quality-first`（40／120／400 m）、樹高定義12 m。新規果樹の `pixels`・`bounded` へ置き換えていない。単木の測定だけで大量の園地植栽の性能を保証しない。既存の自然林・公園・墓地の選択や `biomes` は変更していない。

## 修正した表示と葉の面向き

BVの `size` は10×10×12 mだったが、傾いた幹と冠の最大Xがlowで約5.7862 mあり、原点中心の必要幅は約11.5724 mだった。宣言幅を**11.6 m**へ修正し、奥行10 m・地表からの高さ12 mは維持した。根の下端Y=-0.35 m、地表Y=0は既存基準どおり。実BVのMesh dimensionsの高さには地下の根も含まれるので、地表からの高さと区別する。

初回の実BV確認でlowの上面SVGに緑の葉が表示されなかった。`aridTrees.ts` のlow用frondの4枚の三角形の面向きが逆で、両面描画の3Dでは見える一方、BVの上面投影では除外されていた。頂点の順番を反転し、形・外接寸法・三角形数・乱数列を変えずに上面へ出るよう修正した。このfrond関数はナツメヤシで使用する。

`borealTrees.test.ts` の外接枠検証をナツメヤシにも適用し、lowの葉だけの上面投影に十分なパスが含まれる回帰検証を追加した。low版に2026-10-30の面向き修正creditを追記し、既存の作者・派生元を維持した。

作者はlow／medium／highが `Codex GPT-6.1 Sol`、ultraが `Claude Opus 5.5`。highの派生元はOpus ultra、low／mediumはCodex high。各品質1版の暗黙採用を維持し、採用表は変更していない。

## 実BV・GPU・再現手順

`scripts/verifyBvDatePalmOrchardReuse.mts` の固定1200×700 viewport・同尺度・照明で4品質の正面・斜め・上面寄りを描画し、カサアカシア・オリーブhighとの同尺度比較と、ultraの果実マーカーに寄った近景を確認した。実BVは1200×800でTreesの `Date palm · Phoenix dactylifera` の4品質を切り替えた。

- 高い単幹と羽状葉の冠が、カサアカシアの平らな冠、オリーブの低い広葉樹形と異なることを確認した。highの幅は約9.20×8.70 m、地表からの高さは約11.83 m。
- 近景で黄土色の三角形と1本の下垂軸を確認。独立した果実本体・細かい果房を持つ近景モデルとしては受け入れない。
- 実BVの4品質・作者切替・派生元・`CE adoption: Adopted`、正面／上面SVGを確認。修正後のlow上面には葉の輪郭が表示される。
- GPUは `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`。モデル破棄・再生成を含む品質巡回3回のgeometryは8→8→8、破棄後geometry・textureは0。pageerrorは0件、WebGL error・context lossは検出されなかった。

計測値は [JSON](bv-date-palm-orchard-reuse-20261030.json)。スクリプトはlocalhost:5233で一時Viteサーバーとheadless Chromiumを起動し、マーカー数・high／ultra位置一致・作者・実BVの採用表示・資源解放を確認してJSONを更新する。9枚の画像はOSの一時ディレクトリ `fmg-bv-date-palm-reuse` へ出力し、目視後に削除した。画像はGitに収録しない。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/borealTrees.test.ts -t date_palm
npx vitest run src/city3d/adoption.test.ts src/building-viewer/wikipedia.test.ts
node --import tsx scripts/verifyBvDatePalmOrchardReuse.mts
```

関連5ファイルから選んだ12件が成功。樹木3ファイルではナツメヤシの7件のみ実行して他124件を意図して除外し、採用・参照の2ファイルは5件成功。寸法の回帰検証、4品質・接地・木部一致・有限値・CE prototypeと資源解放、low上面投影、作者・採用・Wikipedia参照を確認した。面向き修正後は影響する樹木7件とGPU検証を再実行した。変更したソース4ファイルのBiomeと `git diff --check` は成功。

`npx tsc --noEmit` は既存の `src/city-editor/renderers/fogControls.ts:45` の `string` → `EditorMessageKey` エラーで失敗し、今回の変更箇所にはエラーが報告されなかった。全件テスト・森林全条件・多数シードの検証は実行していない。

E02の評価とP4を完了。新規樹種は増えておらず30樹種・120品質枠を維持する。次はP5／F07カカオの幹生果・葉・栽培樹形の資料を確認して4品質とBV登録を実装する。
