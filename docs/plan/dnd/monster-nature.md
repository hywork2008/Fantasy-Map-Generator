# 怪物の性質

**Status**: 五種の既定カードと媒体マスクは `src/generators/monsterNature.ts` と `dangerField.ts` に入った。食性・毒・大きさ・攻撃はバイトに足さない。未知の `type`（ダンジョンの `bossType` を含む）はレアリティ行をそのまま使う。`bossType` ごとの `track = occult` は、種類一覧まで置かない。人の死の人数は [cr-distribution.md](cr-distribution.md) に置き、人口動態には未接続である。家畜、航路の損失は未接続。適合の式とセル収量は変えていない。  
**Date**: 2026-11-16  
**Related**:

| 文書 / コード | 関係 |
| :--- | :--- |
| [danger-calculation.md](danger-calculation.md) | 0〜255 はレアリティの頂点と `power` の半径。本書はそこへ性質を足さない |
| [cr-distribution.md](cr-distribution.md) | 食性と狙いは人の死の入力。`cr` の帯と人数はあちらが正本 |
| [fantasy-world-agenda.md](fantasy-world-agenda.md) | 獣は生態、災厄とダンジョンは呪術。海の航路の損失はまだ開いている |
| [table-background.md](table-background.md) | 人の死はバイトから取らない。食性は人数の入力になる |
| [danger-layer.md](../danger-layer.md) | CR 帯の確定は [cr-distribution.md](cr-distribution.md)。性質の強さへ換算しない |
| `src/types/models.ts` | `Monster` は `rarity`、`power`、`type` だけを持つ |
| `src/generators/monsterNature.ts` | 五種の既定カード、上限、頂点の式 |
| `src/generators/threatProfiles.ts` | 出現数と `power`。本書では数値を変えない |

---

## 0. 結論

レアリティと行動範囲（`power`）は、性質を足して算出するものではない。種類のカードに作者が置く。危険度の頂点は、今どおりレアリティの表だけが決める。

性質の強弱は、そのレアリティが許す上限の中で種類ごとに置く。脅威度から自動で埋めない。上限を超えるカードはデータエラーであり、実行時に危険度へ加点しない。

危険度の塗りが性質から読むのは**媒体**だけである。陸・空・水で、塗るセルの形が変わる。頂点の数は変わらない。人を食うか、家畜を取るか、毒をまくか、炎を吐くかは、塗りへ足さない。

---

## 1. どちら向きにもしない

二つの読みは、どちらも採らない。

性質の点数を重みづけしてレアリティと 0〜255 を出す読みは、大きい草食獣や、弱い性質の重なりが、人を食う小さい怪物や災厄より濃くなる。危険度の算出がやめた加算である。

レアリティだけから大きさ・食性・攻撃を一通り生成する読みは、同じ段の竜と lich と疫病を同じ体にする。段は応答の階級であり、体の設計図ではない。

採るのは次の分け方である。

- **レアリティ**は、村が耐えられるか、地方が無人になるか、国家でも勝つのが難しいか、の段である。作者が 1〜5 を置く。
- **`power`** は行動範囲のホップ半径である。出現帯が今持っている値を、本書では変えない。速度を掛けて半径を伸ばさない。
- **それ以外の性質**は種類に置く。個体は種類のカードを参照し、自分では振らない。討伐で減るのは `power` だけで、性質は残る。

同じ段の中では、上限以下なら種類ごとに違ってよい。レアリティ 5 が人の大きさであることも、レアリティ 1 が空を飛ぶことも、カードとして許す。どちらも頂点は段の表のままである。

---

## 2. カード

種類（今の `type`、ダンジョンなら `bossType`）が一つ、次を持つ。数値の 0〜100 は置かない。各軸は列挙である。

| 軸 | 識別子 | 値 | 危険度 |
| :--- | :--- | :--- | :--- |
| 段 | `rarity` | 1〜5 | 頂点の表 |
| 媒体 | `medium` | `land` / `air` / `water` | 塗るセルの形だけ |
| 狙い | `motives` | `people` / `stock` / `property` / `slaughter` の集合 | 読まない |
| 頻度と量 | `appetite` | `none` / `rare` / `seasonal` / `persistent` / `catastrophic` | 読まない |
| ばらまくもの | `blight` | `none` / `venom` / `poisonGround` / `disease` / `curse` | 読まない |
| 大きさ | `size` | `small` / `medium` / `large` / `huge` / `vast` | 読まない |
| 移動の速さ | `speed` | `slow` / `ordinary` / `fast` / `immediate` | 読まない |
| 頑丈さ | `resilience` | `frail` / `ordinary` / `tough` / `extraordinary` / `unassailable` | 読まない |
| 物理攻撃 | `mundaneStrike` | `effective` / `impaired` / `futile` | 読まない |
| 生来の攻撃 | `innate` | `fire` / `lightning` / `cold` / `acid` の集合。空でもよい | 読まない |
| 攻撃の広さ | `innateScale` | `none` / `personal` / `local` / `regional` | 読まない |
| 補充 | `track` | `ecology` / `occult` | 読まない |

`people` は人を捕食する。`stock` は家畜を取る。`property` は蓄えや建物を壊す。`slaughter` は食べずに殺す。複数を同時に持ってよい。持っている数はレアリティを上げない。

頻度と量は一つの軸にする。二つの数を掛けると、稀に大食のものと、常に少量のものが、別々の経路で同じ死の桁になる。`appetite` の意味は次である。人の人数は [cr-distribution.md](cr-distribution.md) が、この意味の中で置く。家畜のキログラムは、まだ書かない。

| 値 | 意味 |
| :--- | :--- |
| `none` | 人にも家畜にも手を出さない |
| `rare` | 年に数えるほど。村は続く |
| `seasonal` | 季節に家畜を数頭、または人を散発的に |
| `persistent` | その土地の損失が続く。人が住める段では、村が無人になる量ではない |
| `catastrophic` | 数日の事象。年率にしない |

`venom` は噛みと刺しである。`poisonGround`、`disease`、`curse` は土地に残る。土地に残るものは、無人の領域の説明にはなる。バイトへは足さない。

`track` は [fantasy-world-agenda.md](fantasy-world-agenda.md) の二本である。生態は繁殖、呪術は信仰・門・呪い。塗りでは区別しない。

未知の `type` は、その個体のレアリティの既定カードを使う。個体ごとの乱数で性質をずらさない。

---

## 3. 段が許す上限

上限を超える組み合わせは置かない。実行時に切り上げて危険度へ反映しない。

| 軸 | 1 | 2 | 3 | 4 | 5 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `appetite` の最大 | `seasonal` | `persistent` | `persistent` | `catastrophic` | `catastrophic` |
| `blight` | `none` か `venom` | 同左 | `poisonGround` と `disease` も可 | 同左 | `curse` も可 |
| `size` の最大 | `large` | `huge` | `huge` | `vast` | `vast` |
| `resilience` の最大 | `tough` | `tough` | `tough` | `extraordinary` | `unassailable` |
| `mundaneStrike` | `effective` のみ | 同左 | `impaired` も可 | 同左 | `futile` も可 |
| `innateScale` の最大 | `none` | `personal` | `personal` | `local` | `regional` |

`size` の `small` と `medium` は、どの段でも許す。小さい災厄はカードとして合法である。`vast` は 4 以上だけが許す。村の脅威が丘ほどの体を持つと、居住の障害が段と矛盾する。

`medium` と `speed` と `motives` と `track` は、段で禁止しない。空を飛ぶ獣の頂点は 48 のままである。水棲の災厄の頂点は 255 のままである。

`catastrophic` は、数万から数十万人が数日で死にうる段にだけ置く。レアリティ 1〜3 のカードにこの値は書かない。

---

## 4. 危険度が読むもの

頂点と半径の式は [danger-calculation.md](danger-calculation.md) のままである。`power` が今の半径である。性質は半径を倍率しない。

媒体だけが、その式をどのセルに書くかを変える。

| 媒体 | 塗るセル |
| :--- | :--- |
| `land` | 陸（高さ 20 以上）だけをホップする。開水面は越えない |
| `air` | 陸も水面も越える。半径と頂点は陸と同じ式 |
| `water` | 水面をホップする。塗れた水面に隣接する陸 1 ホップへ、その水面セルの貢献を写す。それより内陸は塗らない |

岸へ写すとき、陸側で半径をやり直さない。水面で距離 22 なら、隣の陸もその貢献のままである。内陸 2 ホップ目は 0 である。

水棲のレアリティ 5 は、海岸の 1 セルを無人にできる。内陸の国を、陸の災厄と同じ円では消さない。航路で船がどれだけ沈むかは、本書では置かない。海は同じレアリティの梯子に乗り、塗る場所だけが違う。

今の五種の既定はすべて `land` である。媒体のマスクを実装すると、湖と海の向こうへ獣の円が続かなくなる。頂点の固定点（一本道のグラフ）は、水面の無いグラフのまま有効である。

---

## 5. 危険度が読まないもの

次はカードに残り、別の読み手が後で使う。0〜255 にも、覆っているレアリティにも、足さない。

| 性質 | 後の読み手 | 本書でまだ置かないもの |
| :--- | :--- | :--- |
| `motives` の `people`、`slaughter`、`appetite`、`blight`、`cr` | 脅威の死。入力は覆っている個体のカードであり、バイトではない | 人数と日数は [cr-distribution.md](cr-distribution.md)。実装はまだ |
| `stock` | 家畜の損失 | 頭数。穀物のセル収量は変えない |
| `property` | 町の蓄えと建物 | 金額。セル収量は変えない |
| `speed` | 半径の内側へ到達する時間、討伐の行程 | `power` への倍率 |
| `resilience`、`mundaneStrike`、`innate` | 討伐の手段 | クリア年数。今の 1 / 2 / 3 / 5 / 8 年はレアリティの表のまま |
| `track` | 補充が生態か呪術か | 塗りの差 |
| `size` | 摘要と、何を一口で取れるかの説明 | 頂点 |

クリア年数を頑丈さからもう一度計算しない。レアリティ 5 が `unassailable` であることは、今の「単一の連隊の仕事にしない」と同じ事実の記録である。年数を 8 から動かす設計は、討伐の文書で行う。

レアリティ 3 以上の中心が無人なのは、頂点が 80 以上だからである。毒をまいているから無人、とは書いても、毒の有無で 80 を動かさない。人が住めるレアリティ 1〜2 に、土地へ残る `blight` は置けない。噛みだけが許される。

---

## 6. 今の五種

出現数と `power` は変えない。カードが無いあいだの既定は次である。ダンジョンのボスは、種類一覧を作るまで `track = occult` の別カードを持たない。未知の `type` は、この表のレアリティ行をそのまま使う。rarity 1〜4 の行は ecology のままである。

| `type` | 段 | 媒体 | 狙い | appetite | blight | size | speed | resilience | 物理 | 生来 | track |
| :--- | ---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Beast | 1 | land | `stock` `people` | `seasonal` | none | medium | ordinary | ordinary | effective | 無し | ecology |
| Dire Beast | 2 | land | `stock` `people` | `persistent` | none | large | ordinary | tough | effective | 無し | ecology |
| Greater Monster | 3 | land | `people` `slaughter` | `persistent` | none | huge | ordinary | tough | effective | 無し | ecology |
| Arch-Beast | 4 | land | `people` `slaughter` | `catastrophic` | none | vast | fast | extraordinary | impaired | 無し、`local` まで可 | ecology |
| Calamity | 5 | land | `slaughter` | `catastrophic` | curse | vast | ordinary | unassailable | futile | 無し、`regional` まで可 | occult |

Greater Monster の `persistent` は、中心が既に無人である段の肩に人がいるときの損失である。毎年、国の人口を空にする量ではない。Arch-Beast と Calamity の `catastrophic` は事象であり、年率の既定値ではない。

Arch-Beast の生来攻撃は、既定では空である。火や雷を持たせる種類は、後の一覧で `innate` に足す。足しても頂点は 200 のままである。

---

## 7. 採用しない読み

- 大きさ、飛行、毒、頑丈さの点数を合計し、閾値でレアリティを切る。
- レアリティが上がるほど、必ず巨大で、必ず人を食い、必ず炎を吐く、と生成する。
- 飛行や速度で `power` を倍にする。行動範囲は出現帯の半径のままである。
- 食性や毒を 0〜255 に加算する。媒体以外の性質は塗りの形も変えない。
- 水棲を陸と同じ円で塗り、内陸の適合を下げる。
- 航路の沈没率を、このバイトから置く。
- 家畜の損失や建物の被害で、穀物のセル収量を変える。
- 頑丈さと物理無効から、クリア年数の 1 / 2 / 3 / 5 / 8 を書き換える。
- 個体ごとに性質を振り、同じ Beast が別の食性を持つ。

---

## 8. 実装するときの確認

固定点は `src/generators/monsterNature.test.ts` と `src/generators/dangerField.test.ts` で見ている。性質はバイトへ足さない。

- 五種の既定カードは、§3 の上限を満たす。
- レアリティ 1 で `appetite = catastrophic`、`size = vast`、`blight = curse`、`mundaneStrike = futile` は、不適格である。
- レアリティ 5 で `size = small`、`medium = air` は適格である。頂点は 255 のままである。
- 陸の獣は、水面セルを挟んだ反対岸に貢献を書かない。
- 空の個体は、同じ `power` とレアリティの陸の個体と同じ頂点で、水面の向こうにも書く。
- 水棲の中心の隣の陸は、その水面セルと同じ貢献である。陸の 2 ホップ目は 0 である。
- `motives` や `innate` を変えても、同じ媒体・レアリティ・`power` ならバイトは一致する。
- 脅威モード `none` は、カードが何であっても怪物の塗りが 0 である。

---

## 9. 次に進める作業

頂点の式、五種のカード、媒体マスクは入った。次に種類を増やすときは、§3 の上限の中でカードを一行足す。レアリティと `power` の出現数は、そのときに変えない。

脅威の死の人数と日数は [cr-distribution.md](cr-distribution.md) に置いた。カードの `appetite` と `motives` がそちらの入力である。人口動態へ入れる実装は、まだ書かない。家畜の頭数、航路の損失、討伐年数の置き換えは、まだ書かない。

魔法の濃さと怪物の濃さは [density-knobs.md](density-knobs.md) に置いた。次の設計は、補充と、同じ年に同じ個体を誰が削れるかである。
