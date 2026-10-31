# CE修道院のHighが表示されない問題

2026-11-01

## 原因と修正

ユーザーのCE画面を確認すると、Model qualityはHigh、3D model authorsの修道院は`monastery.abbey`だった。Friaryだけに品質設定を接続した前回の修正では、Abbeyはdefault（Low）のままだった。画面の建物をFriaryと見なしたため、対象種別を取り違えていた。

Abbeyにも明示的なLow／Highを登録した。Highは保存済みAbbey計画を使い、Friaryと共通の開口付き壁・控壁・交差屋根・回廊を生成する。交差塔は木造鐘架へ置換せず、Abbey専用の中空の石造塔とし、対の尖頭開口、鎧戸、石の帯、隅の柱と屋根を追加した。下部は教会の交差部を塞がない。作者はCodex GPT-6.1 Sol。実在建築の実測再現ではない。

CEのModel qualityがHighならFriaryとAbbeyのHighを採用し、Low／StandardではLowを使う。Orthodoxの建築Highは未制作なので既存defaultを維持する。品質だけを変えた場合も修道院レイヤーを更新し、結合後の部品範囲を保持する。保存計画と配置は変更しない。BVのAbbeyにもLow／Highの切替と独立部品表示を提供する。

## 検証

`npx vitest run src/buildings/monasteries/friaryDetails.test.ts src/city3d/three/friaryMeshes.test.ts src/city-editor/renderers/cityViewRendering.test.ts src/city3d/adoption.test.ts src/buildings/monasteries/monasteryParts.test.ts`：5ファイル34件成功。

3品質でのFriary・Abbey・Orthodox混在生成、採用ID、三角形数、接地、部品範囲、資源解放、文書編集なしの品質変更、Abbeyの塔内部の空間、明示登録した品質の固定、寸法と有限頂点を検証した。変更した生成・登録・関連テストのBiome checkと`git diff --check`も成功。

ユーザーの都市を置換せず、独立したページでCEの実際の`createTownMonasteries`と`monasteryPreviewPlan("abbey")`を使い、Three.jsのWebGLRendererで同じカメラからLow／Highを表示した。画面のselectから切り替え、採用IDと計測値が変わること、窓・控壁・アーケード・石造塔の詳細が見えることを確認した。これはCE生成処理の3Dプレビューであり、ユーザーの都市全体のスクリーンショットではない。CE本体の更新経路は既存のWebGLRendererモックを使う描画更新テストで確認した。

| CEのAbbey固定プレビュー | Low／Standard | High |
| --- | ---: | ---: |
| 三角形 | 4,825 | 45,922 |
| 結合後メッシュ | 1 | 1 |
| 採用レベル | low | high |

- [CE生成モデル Low](ce-abbey-low-20261101.png)
- [CE生成モデル High](ce-abbey-high-20261101.png)

非樹木High監査は220記録中、Codex Highあり69、未対応151となった。記録数であり固有資産数ではない。

次はP5の固有建築の部品表示へ進む。OrthodoxのHighは別途、ドームと独立鐘楼に適した詳細化が必要。

## 追加：木と井戸の品質追従

ユーザーの追加指示により、CEの修道院に付属する木と井戸もModel qualityへ追従させた。Friary・Abbey・Orthodoxの全種別に適用する。BV単独表示と直接生成APIの既定は変更しない。

| CE Model quality | 木 | 井戸 |
| --- | --- | --- |
| Low | Low | 軽量版 low |
| Standard | Medium | 軽量版 low |
| High | High | 既存の詳細版 default |

井戸は中間品質のモデルがないため、StandardではLowへフォールバックする。defaultをHighと再登録するのではなく、High設定で既存の詳細モデルを選ぶ。樹木のUltraを暗黙に使わない。実際の依存元IDを部品台帳からCEの採用モデル一覧へ記録する。

上記の比較画像と表は付属物をLowに固定した時点のもの。追従修正後の同じAbbey固定プレビューはLow 4,825、Standard 10,531、High 121,029三角形。全品質でCEの結合後メッシュは1つ。Highの井戸は11,284三角形、Low／Standardの井戸は632三角形。

`npx vitest run src/city3d/three/friaryMeshes.test.ts src/city-editor/renderers/cityViewRendering.test.ts src/city3d/adoption.test.ts`：3ファイル21件成功。全修道院・全品質の生成、付属物の品質・依存元ID・井戸の三角形数、結合範囲と解放、設定変更時の再生成を確認した。変更した2ファイルのBiome checkと`git diff --check`も成功。
