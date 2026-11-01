# Medieval 37 Glassworkers' guild hallのHigh作製

2026-11-02

## 共通会館と用途部品

ガラス職人会館のHighを明示登録した。建築本体は`createHighCivicHallBody("cloth", false)`、外階段は`civicHallPartFactories("cloth")`を、既存の職人会館と同じ`guildHallPartFactories`経由で使う。`GuildCraft`へ`glassworking`を追加し、この用途だけの展示部品を生成する。

幅15 m、奥行7 m、上階床高3.32 m、上階壁高3.25 m、屋根立上り2.2 m、東側の外階段、扉Z=-2.3 m、石造アーチ回廊という`GUILD_HALL_PROFILE`の契約を維持した。新しい会館外殻・階段を作らず、Lowの前面階段を持つ従来形状も変更しない。

| High部品 | 三角形 | 内容 |
| --- | ---: | --- |
| 共通建築本体 | 29,064 | 既存会館本体そのもの。高さ・支持・屋根・扉を職種で変えない |
| 共通外階段 | 528 | 既存の東階段と踊り場・手すり |
| ガラス職人の用途部品 | 5,432 | ガラス紋章、支持付き検品台2台、杯2個・ビーカー2個・瓶3個、鉛線入り見本パネルと支持脚 |

用途部品は`glassGuildDressing.ts`へ分けた。`ModelKit`と共通の`addCraftBench`を再利用し、ガラス器は口・内壁・底を持つ回転形状にする。板の上へ実際に接地させ、見本パネルには自前の支持脚を付ける。器やパネルを交換するための穴を台や母体の壁へ設けない。壁の紋章も母体へ重ねる配置で、既存の出入口・窓・通路を塞がない。

ガラスは既存の素材パレットによる色付きの面として表現し、透明度や屈折の光学再現は行っていない。会合・検品のための会館で、炉や溶融作業場は追加していない。

## 資料と制作範囲

鉛線で区切る色ガラスは[V&Aのステンドグラス解説](https://www.vam.ac.uk/articles/stained-glass-an-introduction)、器の形状は[Metの中世ビーカー](https://www.metmuseum.org/art/collection/search/462876)と[London Museumの中世後期の瓶](https://www.londonmuseum.org.uk/collections/v/object-32943/bottle/)を参考にした。紋章・器・陳列方法は概略的な表現で、所蔵品や実在会館の精密な複製ではない。

## 負荷・不変性・採用

| 指標 | Low | High |
| --- | ---: | ---: |
| 三角形 | 9,850 | 35,024 |
| メッシュ | 123 | 11 |
| 固有頂点バッファ内の頂点 | 6,726 | 105,072 |
| ジオメトリ | 42 | 11 |
| 材質 | 14 | 11 |
| CPU属性・indexバッファ bytes | 268,320 | 2,521,728 |
| 幅×奥行×高さ m | 12.60×12.18×8.63 | 17.09×8.77×9.06 |

登録の20×14×11 m以内。Highの形状の大半は既存の共通会館で、用途部品は全体の約15.5%。CPU配列の常駐量であり、一時領域・GPUメモリ・FPSは測定していない。

建築本体・外階段は、既存の木工ギルド会館と、三角形・法線・材質を含む署名が一致する。既存4職種（革・木工・石工・金工）のHigh全体の署名も変更前後で一致した。寸法だけでなく実際の形状と材質を共用している。

ガラス職人会館Lowの署名は`9e23da63c47e369a6e466879c1bb2476414c4805bf3cfde7ed4ca38e28f8cf8a`で不変。既存CEの`medieval.glassworkers-guild-hall@default#codex-gpt-6.1-sol`はLowの互換入口として維持した。Highは`@high#codex-gpt-6.1-sol`として解決できる。CEの配置・全体品質UIは今回変更していない。

## 検証と再現

- `npx vitest run src/buildings/medieval/glassGuildDetails.test.ts`：5件成功。LowとCE既定、High登録、共通本体・階段の同一性、寸法・品質・部品範囲・資源所有、開いた器の口と台への接地、パネルの支持を検証。
- 共通登録の`src/city3d/adoption.test.ts`：3件成功。
- `npx vitest run src/buildings/medieval/guildHallAndStoneYardDetails.test.ts -t 'guild|shares'`：既存ギルド関連8件成功、対象外2件スキップ。計16件成功。
- 入口側の手すり・踊り場から扉への通路と、正面扉に紋章が干渉しないことをレイで確認。器7個はいずれも台の高さ0.95 mに接地し、口を覆う面がないことを確認。
- 実BVで全体Low／High、共通本体・階段・用途部品の単体、近景、全体への復帰を確認。比較値の混入とページエラーなし。
- 変更した生成・登録・関連テスト5ファイルのBiome check、`git diff --check`が成功。

再計測は`node --import tsx scripts/profileGlassGuildHigh.mts`。[計測JSON](bv-glassworkers-guild-high-20261102.json)へ出力する。台帳のメッシュ数は各factoryの生成後・全体結合前を示し、最終表示の11メッシュとは区別する。

- [全体High](bv-glassworkers-guild-high-20261102.png)
- [用途部品の単体](bv-glassworkers-trade-high-20261102.png)
- [ガラス見本と検品台の近景](bv-glassworkers-samples-high-20261102.png)
- [既存Low](bv-glassworkers-guild-low-20261102.png)

非樹木監査は220記録中、Highあり97、未対応123。前回からHighありが1増えた。固有資産数とは区別する。

次はMedieval 38の印刷工房と印刷工ギルド会館。会館は同じ共通基盤を使い、工房と会館で共用できる印刷関連の用途部品も確認してから作製する。
