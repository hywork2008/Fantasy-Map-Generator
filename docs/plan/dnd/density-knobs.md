# 魔法の濃さと怪物の濃さ

**Status**: 設計。設定の名前、保存の移行、Cultures set に残すものを置いた。シミュレーションには未接続。出現数、`power`、適合、セル収量、王国の死亡率は変えない。  
**Date**: 2026-11-16  
**Related**:

| 文書 / コード | 関係 |
| :--- | :--- |
| [fantasy-world-agenda.md](fantasy-world-agenda.md) | §5 と §9 の 1。本書がその項目名と移行である |
| [magic-agrarian-economy.md](magic-agrarian-economy.md) | `magicEconomy` は食料側のスイッチのまま。`adventurerActiveShare` の既定 0.0005 は変えない |
| [danger-calculation.md](danger-calculation.md) | 頂点の式と適合は動かさない。脅威の有無は本書の怪物の濃さが選ぶ |
| [cr-distribution.md](cr-distribution.md) | 人数の表は濃さで倍率しない。`monsterDensity = none` は脅威モード `none` である |
| [monster-nature.md](monster-nature.md) | 五種のカードと媒体。海の航路はまだ開いている |
| `src/controllers/options.ts` | `changeCultureSet` が、今は定住と脅威の既定を一緒に書く |
| `src/generators/threatProfiles.ts` | `highFantasy` は辺境、`darkFantasy` は災厄。数値は変えない |
| `src/generators/threats-generator.ts` | 生成時の出現。今は `culturesSet` からプロファイルを取る |
| `src/data/raceCivicStance.ts` | `highFantasy` と `darkFantasy` が幻想の種族セットである |

---

## 0. 結論

魔法の濃さと怪物の濃さは、Cultures set から独立した二つの設定にする。

| 設定 | 値 | 既定 |
| :--- | :--- | :--- |
| `magicDensity` | `off` / `rare` / `common` | `off` |
| `monsterDensity` | `none` / `frontier` / `dark` | `none` |

種族の一覧、文化の名前、文化数の上限は Cultures set に残す。`highFantasy` と `darkFantasy` が Marches・居住地面積 0.45・初期人口 45 を書くことと、戦争の格差の既定も、今の `changeCultureSet` のまま残す。脅威の出現帯、`dangerEnabled` のオン、火の精霊、グレムリンは、Cultures set の変更では書かない。

出現数と `power` の数値は、今の二つのプロファイルのままである。本書は新しい出現数を置かない。

---

## 1. Cultures set に残すもの

`changeCultureSet` が幻想のセットへ切り替えたときに、これまでどおり書くのは次である。鍵でロックされている項目は、今と同じくロックの値を維持する。

| 書くもの | 値 |
| :--- | :--- |
| `initialSettlementPattern` | `marches` |
| `oikoumeneLandShare` | 0.45 |
| `initialPopulationSaturation` | 45 |
| `maxWarDisparityRatioEnabled` | 幻想のセットでは false。それ以外のセットの初期化は今のまま |

幻想以外のセットへ戻しても、定住パターンは今どおり戻さない。標準定住へ戻すのは、利用者が定住の設定を変えたときである。

ランダム生成が、文化セットのあとで未ロックの定住を引き直す処理は残す。

書かなくなるのは、`dangerEnabled`、`fireSpiritsEnabled`、`gremlinsEnabled`、脅威の出現帯の既定、廃止済みの `threatCalculation` である。

---

## 2. 怪物の濃さ

値は、今の `ThreatCultureMode` へ次のように対応する。倍率と出現帯の中身は変えない。

| `monsterDensity` | 内部のモード | 獣害の倍率 | 出現 |
| :--- | :--- | ---: | :--- |
| `none` | `none` | 0 | 怪物を置かない。`cells.danger` の怪物分は 0 |
| `frontier` | `highFantasy` | 1 | 今の High Fantasy 帯。レアリティ 4 と 5 は出さない |
| `dark` | `darkFantasy` | 1.25 | 今の Dark Fantasy 帯。災厄を含む |

`buildThreatBandsFromOptions` と `resolveThreatCultureMode` は、`culturesSet` ではなく `monsterDensity` を読む。Danger の個数と `power` の欄は、今どおりオプションが出現時の正本である。濃さを切り替えたときは、ロックされていない欄へ、そのプロファイルの既定を書く。`frontier` と `dark` は、ロックされていない `dangerEnabled` を true にする。`none` は `dangerEnabled` を false に戻さない。

`dangerEnabled` が false のときは、濃さが `frontier` や `dark` でも出現しない。これは今の早期 return と同じである。濃さが `none` のときは、`dangerEnabled` が true でも出現せず、獣害の倍率は 0 である。

文化セットが `world` で定住が Standard、濃さが `frontier` の地図は生成できる。人が多い地図で脅威を試す経路はこれである。幻想の Cultures set が Marches と低い初期人口を連れてくることは、本書では残る。

`highFantasy` の種族のまま濃さを `dark` にすること、`darkFantasy` の種族のまま濃さを `none` にすることもできる。

ダンジョンの出現プロファイルは、本書では `culturesSet` のままである。洞窟の生成も、幻想の文化セットのままである。地下を独立したノブにするのは、まだである。

---

## 3. 魔法の濃さ

`rare` と `common` の差は、後の設計が読む旗である。本書が変える数は、どちらも同じである。`common` だから寺院、ギルド、ポーションの店、術者の定員を置かない。死亡率もセル収量も変えない。

| 読み手 | `off` | `rare` と `common` |
| :--- | :--- | :--- |
| 冒険者の注記 | 0 として読む。保存した `adventurerActiveShare` は消さない | 保存した割合。無いときの既定は 0.0005 |
| `magicEconomy` | 効果は `off`。設定の値は残す | 設定の値どおり。既定の `off` では円を作らない |
| 人物の秘術ロール | 0。種族の `arcaneCap` は変えない | 今の種族の上限の中で振る。人間の上限も、今のデータのまま |
| 火の精霊、グレムリン | トグルが true でも動かさない | それぞれのトグルが true のときだけ動く |

濃さを `rare` または `common` へ切り替えたときは、ロックされていない `fireSpiritsEnabled` と `gremlinsEnabled` を true にする。`off` へ切り替えたときは、ロックされていない二つを false にする。実行時の門は、濃さが `off` でないことと、それぞれのトグルである。文化セットでは判定しない。

医学と科学技術を迷信とする係数は、本書では置かない。衛生、コレラ、王国の死亡率の式は動かさない。

---

## 4. 文化セットを変えたときの濃さ

ロックされていない `magicDensity` と `monsterDensity` は、文化セットを変えたときに次の組へ書く。ロックした鍵は維持する。この書き込みは濃さの変更として扱い、§2 と §3 のロックされていない既定（出現帯、`dangerEnabled`、火の精霊、グレムリン）も書く。これで、今の High Fantasy と Dark Fantasy のボタンは、ロックが無い限り今の束ねを再現する。ロックした濃さは、種族を切り替えても残る。

| 切り替えた `culturesSet` | `magicDensity` | `monsterDensity` |
| :--- | :--- | :--- |
| `highFantasy` | `rare` | `frontier` |
| `darkFantasy` | `rare` | `dark` |
| それ以外 | 変えない | 変えない |

幻想以外へ戻しても濃さは残る。歴史的な種族のまま辺境の脅威を置くには、文化セットを戻したあと濃さを変えず、定住を別に Standard へ戻す。

---

## 5. 保存

鍵が保存に無いときだけ、文化セットから一度埋める。既にある鍵は上書きしない。人口、怪物の配置、危険度のバイトは、ロードでは変えない。次の生成から新しい鍵を読む。

| 保存の `culturesSet` | 欠いた `magicDensity` | 欠いた `monsterDensity` |
| :--- | :--- | :--- |
| `highFantasy` | `rare` | `frontier` |
| `darkFantasy` | `rare` | `dark` |
| それ以外、または文化セットも欠ける | `off` | `none` |

片方だけ欠ける保存は、欠ける方だけをこの表で埋める。

新しく生成する地図の既定は `off` と `none` である。利用者が文化セットを幻想へ切り替えたとき、§4 の組がロックの無いかぎり入る。

設定は `persistedOptionKeys` と生成オプションの保存に入れる。`magicDensity` と `monsterDensity` は文字列である。未知の文字列は、それぞれ `off` と `none` として読む。

---

## 6. 三段階の土地は置かない

生産がゼロの土地、通れるが住めない土地、住めるが収穫が減る土地、をセルの新しい区分にはしない。

今の適合が、その役割を分けている。危険度 80 以上は住めない。80 未満は直線で居住が減る。セル収量の式は危険度を見ない。危険な肩の収穫をさらに下げる倍率は置かない。無人の中心を、収量ゼロの別区分として持たない。

緩衝帯、海の航路、地下、聖域は、本書の独立項目にしない。海の怪物が塗る範囲は [monster-nature.md](monster-nature.md) のままである。

---

## 7. 採用しない読み

- 怪物の濃さを上げると、魔法の濃さも上がる。災厄の地図が自動で術者社会になる。
- 魔法の濃さを `common` にしただけで、セル収量、死亡率、冒険者の割合、出現数を変える。
- `magicEconomy` を、濃さの変更で `strict` や `off` へ書き換える。
- 種族の `arcaneCap` を、濃さで書き換える。
- 洞窟とダンジョンの出現を、本書で `monsterDensity` へ移す。
- 適合の 80 を、三段階の新しい閾値に取り替える。
- 古い保存の人口を、欠いた鍵を埋めたときに掛け直す。
- High Fantasy の出現数を、標準定住で人が多いからといって減らす。

---

## 8. 実装するときの確認

コードは、この文書だけでは変えない。関連テストだけを見る。地図全体の多シード検証はしない。

- 鍵の無い `highFantasy` の保存は、`rare` と `frontier` として読む。人口の配列はロードの前後で一致する。
- 鍵の無い `darkFantasy` の保存は、`rare` と `dark` として読む。
- 鍵の無い `world` の保存は、`off` と `none` として読む。
- `monsterDensity = frontier` はレアリティ 4 と 5 を出さない。`dark` は今の Dark Fantasy 帯を出す。`none` は `dangerEnabled` が true でも怪物と獣害が 0 である。
- ロックした `monsterDensity` は、文化セットを切り替えても変わらない。
- `magicDensity = off` の `highFantasy` は、秘術ロールが 0 であり、冒険者の注記も 0 である。`arcaneCap` の表は一致したままである。
- `magicEconomy = off` のまま `magicDensity = rare` にしても、セル収量は今のビルドと一致する。
- `off` と `none` の標準の地図は、人口がビット単位で今と同じである。

---

## 9. 次に進める作業

コードは変えない。医学と科学技術を迷信とする係数は、まだ置かない。置くのは、棲み分けのあとと決めた治療と技術の設計である。

次の設計は、[fantasy-world-agenda.md](fantasy-world-agenda.md) §9 の 2、補充の二本と、同じ年に同じ個体を誰が削れるかである。ダンジョンの出現を文化セットから外すかどうかは、その設計で決める。
