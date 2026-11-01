# BV複合モデル P1：井戸Lowと部品台帳

2026-11-01。[設計書](../plan/bv-composite-models.md)のP1を実装した。新規Highの制作はまだ行っていない。

## 変更と計測

`createLowMedievalWellModel`を追加。開いた井筒と笠石、柱、二面の屋根、手回し巻上げ機、吊るした開口のある桶を残し、石材80個・屋根板168枚・巻き縄13巻等の個別生成を省いた。既存の単独展示用`createMedievalWellModel`は維持する。Lowは`well.medieval@low#codex-gpt-6.1-sol`として登録した。

修道院の`wellQuality`は既定`low`、既存モデル指定は`default`とする。これはHighの新設ではなく、付属設備の独立した品質指定である。Friary・Abbey・Orthodoxの共通生成経路でLowを採用し、登録の既定依存元も更新した。

| 固定プレビュー | P0の三角形 / メッシュ | P1の三角形 / メッシュ |
| --- | ---: | ---: |
| 付属井戸 | 11,284 / 319 | 632 / 28 |
| Friary | 14,914 / 497 | 4,262 / 206 |
| Abbey | 15,477 / 524 | 4,825 / 233 |
| Orthodox | 13,738 / 486 | 3,086 / 195 |

FriaryのCE結合後も4,262三角形で、最終属性配列は1,610,712→460,296バイト。描画メッシュは従来どおり1。これは保持する配列の測定で、GPUメモリ、ピーク構築メモリ、FPSの測定ではない。

## 部品の識別

`ModelPartTracker`で生成境界を明示し、`group.userData.modelParts`へJSON化できる台帳を保持する。記録は部品ID、役割、品質、作者、使用した依存元、ソースのメッシュ数・三角形数。各ソースメッシュには`modelPartId`を付ける。メッシュ名から役割を推定しない。

Friaryの固定例は25部品。教会堂・内陣・後陣・鐘架・各居住棟・門棟・回廊・囲壁・各庭・菜園・各樹木・井戸を区別する。基礎は必要な標高差がある場合だけ追加される。IDは計画IDと部品種別・配列番号から決まり、同じ保存計画で再現する。編集後の並べ替えをまたぐ永続IDではない。

CEではソース台帳を資源解放前に引き継ぎ、`monastery-assembly.userData.modelPartRanges`に結合済み非indexメッシュの`partId / start / count`を記録する。`start`と`count`は頂点単位で、部品が複数範囲を持つ場合がある。台帳のメッシュ数は結合前の値であり、CEの描画メッシュ数ではない。台帳にはThreeの資源への参照を保存しない。

BVの修道院インスペクターへ折り畳みの`Assembly parts`表を追加した。役割・品質・メッシュ数・三角形数を表示し、行のツールチップに部品ID・作者・依存元を示す。Friary 25部品、Abbey 29部品、Orthodox 14部品を確認した。

- [全計測JSON](bv-composite-parts-p1-20261101.json)

## 検証

`npx vitest run src/buildings/wells/medievalWell.test.ts src/city3d/three/friaryMeshes.test.ts src/city-editor/generators/monasteryLayout.test.ts src/city3d/adoption.test.ts`：4ファイル30件成功。

- Low井戸の寸法、1,000三角形未満・40メッシュ未満、井筒から水面への開口、桶の開口と底をレイで確認。
- 井戸の共有geometryとmaterialを一度ずつ解放することを確認。
- 台帳が全ソースメッシュを覆い、三角形総数と一致することを確認。依存先は登録済みvariantと照合。
- 標高差のある二つの修道院を結合し、部品IDの区別、基礎の記録、頂点範囲の隙間・重複がないこと、部品別三角形数の一致を確認。
- 回廊の中庭、門の通路、回転・移動・標高、既存井戸の単独展示、CE採用の既存テストも成功。

`npx biome check src/buildings/wells/medievalWellLow.ts src/buildings/modelParts.ts src/building-viewer/modelPartsPanel.ts`：成功。`git diff --check`も成功。

`node --import tsx scripts/profileBvCompositeModels.mts`で計測。出力既定名はP1のJSONへ変更した。旧構成は`vegetationQuality: "ultra", wellQuality: "default"`で再現する。構築時間は単発の順序依存観測のため速度比較に用いない。

実BVで全体・平面図・部品表を確認し、Friaryの206メッシュ・4,262三角形と井戸の28メッシュ・632三角形がNode計測と一致。修道院三種を切り替えて台帳の更新を確認した。CEの対話操作・GPU FPSは今回検証していない。

## 次の作業

この記録はP1時点の結果。後続の[P2実装記録](bv-monastery-parts-p2-20261101.md)で独立factoryとBVの部品単体表示を導入した。次はP3として住宅系施設へ展開する。分解表示・品質や組み合わせを変更するBVの操作は後続とする。
