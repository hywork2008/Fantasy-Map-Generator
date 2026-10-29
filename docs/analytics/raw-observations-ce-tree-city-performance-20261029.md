# CE樹木LOD・都市全体性能の全量観測一覧

実施日：2026-10-29。固定入力と再生成可能なフレームごとの全量JSONはGit管理外の `docs/analytics/raw/` に置く。条件・派生比較・判定は [計測記録](ce-tree-city-performance-20261029.md)。

| ファイル | bytes | SHA-256 |
| --- | ---: | --- |
| `docs/analytics/raw/ce-forest-f0/medium-flat.json` | 13,084,986 | `b6b071b85f5d441203cd4be00a042c5d366f75a9d14352d477f8f4a08a9de8be` |
| `docs/analytics/raw/ce-forest-f0/small-flat.json` | 3,281,983 | `4220c49105da9d78a10d73e71122bc8f3d0f5ab597ed0f56b20bbac9946bc856` |
| `docs/analytics/raw/ce-forest-f0/small-river-valley.json` | 3,867,491 | `dbbb94af849c0be827ca8fc69ef9ddccbe66e5e86de121bda23cd2ad3cca78db` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/bounded-control-plain/results.json` | 1,410,576 | `5e4bc13fb5045b4aeeb568c7e877419b6be6831ebe7ba207d763b1c1e10715ed` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/bounded-control-shadow/shadows-results.json` | 1,411,320 | `47e8f7536cb25dc4d92c573de00ece92ef086b84fb864f10e45d3b9676466daf` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/native-plain/results.json` | 1,431,733 | `e3fa1c61842a596398590daefa60a6891c2e2a8c47207078571a32daacf9729b` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/native-shadow/shadows-results.json` | 1,431,647 | `2e95d8a5895a54cbb17c9fafcdcc523dd0663c3464dab3b2b13227018d483c63` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/bounded-control-plain/results.json` | 1,409,855 | `d1f63b37e6593ff532f20375883f36bf061d5d653049801b45f1b47b36293e41` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/native-plain/results.json` | 955,078 | `8ce156c6a56d428568974b65bc3b1d49baacfa3dfea46d412ef8712414ba4af5` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/native-plain/small-flat-results.json` | 477,619 | `4fc92f979745da6bf5e24630e6f5317f45b273589fb167c6d762b39b486db697` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/native-shadow/shadows-results.json` | 1,431,703 | `e23225b28a76f5321124d5d738a6a2fa3dabf80fd5689e4e00209903c72136fd` |

`-before` はフレーム内の採用モデル検索共有を導入する前。native・影なしの小都市は先行計測を別ファイルへ保存し、同じ条件の中都市・河川谷都市を後続のresults.jsonに保存した。その他のresultsは各3都市を含む。固定入力は2026-10-28の森林F0で作製したものをそのまま使用した。

計測後の各条件は1000×720・DPR 1、標準住宅・森林standard、都市部と郊外の簡略化auto。nativeは製品の品質優先方針、bounded-controlは検証プロセス内だけ全樹種のprofileをboundedにした対照条件で、製品設定の追加ではない。

確認用画像の永続保存・Git収録・ハッシュ一覧への記載は不要とし、この一覧は固定入力と全量観測JSONを対象とする。
