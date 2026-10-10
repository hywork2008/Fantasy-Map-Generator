# 文化・文明・宗教オーバーホール

2026-10-08。`docs/plan/cultures/`（埋葬文化体系）の上位に「文明圏（Civilization tradition）」層を置き、
FMG の文化・宗教・時代から CE の墓地・城・修道院までを一つの表で決める。

実装: `src/data/civilizationTraditions.ts`（表）、`src/utils/cultureTradition.ts`（解決関数）。

## 1. 問題（実装前）

| 箇所 | 実装前の決め方 | 起きていた矛盾（Combreche 2026-10-08） |
| --- | --- | --- |
| 文化の埋葬 `rollCultureBurialProfile` | 文化 *type*（Naval/Desert/Highland…）からランダム、30% は完全ランダム合成 | イングランド系にスンニ派墓地、カスティーリャ系に沈黙の塔、ハンガリー系にローマ街道墓地 |
| 宗教の形態 `religions-generator` | 文化と無関係に重み付き乱択 | ラテン文化の主要宗教が多神教 |
| CE の城 `resolveCastleStyle` | 埋葬プロファイルの特徴（ドーム廟・イトスギ）から推定 | ローマ街道墓地 → イスラム要塞宮殿（カラート） |
| CE の修道院 `placeMonasteries` | 建物数だけ（文化・宗教・時代を見ない） | 托鉢修道会が中世前期・イスラム圏・プロテスタント圏にも出る |
| FMG→CE 記述子 | 文化・宗教の情報なし | CE 側で判断材料がない |

## 2. 設計

```
culture.base（名前ベース）──► 文明圏 tradition ──► 時代ごとの era { faith, fortification }
                                   │
religion（type/form/起源文化）──────┴──► 都市の faith ──► 修道院の種類・墓地
                                                     
tradition.fortification ＋ 時代 ──► CE の城の様式
```

- **文明圏は名前ベースから導く**。保存データに新フィールドを足さないので、既存マップも移行なしで CE 側が整合する。
- **改宗はその文明自身の歴史だけを反映する**。北欧の改宗（1000年頃）、宗教改革、テュルク・ペルシアのイスラム化は反映するが、
  スペインによるメキシコ・ペルーの改宗や宣教師によるハワイの改宗のような「外からの征服」は反映しない（ファンタジー世界にスペインは無い）。
- **城は文化（建てた側）、修道院と墓地は都市の宗教（祈る側）** で決める。都市の宗教が文化の教会と違えば
  「征服・改宗された都市」として両方が並ぶ（例: グラナダのアルハンブラ内の聖フランシスコ修道院）。この差は記述子の
  `civilization.faith` と `civilization.cultureFaith` で明示される。
- **Antique 文化セットは古典古代として解決する**。FMG の Historical period は技術背景で中世前期から始まるため、
  そのままだとローマ人がカトリックになる。`worldTraditionPeriod()` が `culturesSet === "antique"` を `classicalAntiquity` にする。
- 宗教の形態: 民間信仰は文明の基層信仰（改宗前）に合う形態から選ぶ。組織宗教は 80% を文明の教会に合う形態から選び、
  20% は自由（改革運動・外来宗教が出る余地）。組織宗教の形態が教会と合わなければ基層信仰側（復興異教）とみなす。

## 3. 名前ベース × 時代 網羅表

時代の略号: CA=古典古代, EM=中世前期, HM=中世盛期, LM=中世後期, AE=大航海時代, SE=蒸気時代。
「→」は改宗。城は CE の様式（european は時代で motte-bailey → norman-keep → concentric → bastion-citadel）。

| # | 名前ベース | 文明圏 | 信仰（時代） | 基層信仰（民間宗教） | 城 |
| --- | --- | --- | --- | --- | --- |
| 0 | German | latinWest | CA ゲルマン異教 → EM カトリック | ゲルマン異教 | earthwork → european |
| 1 | English | anglo | CA ケルト異教 → EM カトリック → AE プロテスタント（修道院解散 1536–41） | ゲルマン異教 | european |
| 2 | French | gallic | CA ケルト異教 → EM カトリック | ケルト異教 | european |
| 3,4,13 | Italian / Castillian / Portuguese | latinMediterranean | CA 古典多神教 → EM カトリック | 古典多神教 | european |
| 5 | Ruthenian | ruthenian | CA スラヴ異教 → EM 正教（988） | スラヴ異教 | european |
| 6 | Nordic | norse | ゲルマン異教 → HM カトリック → AE プロテスタント | ゲルマン異教 | earthwork → european |
| 7 | Greek | hellenic | CA 古典多神教 → EM 正教 | 古典多神教 | classical → european |
| 8 | Roman | roman | CA 古典多神教 → EM カトリック | 古典多神教 | classical → european |
| 9 | Finnic | finnic | フィン・バルト異教 → LM カトリック → AE プロテスタント | フィン・バルト異教 | earthwork → european |
| 10 | Korean | korean | 大乗仏教 → LM 朱子学（1392） | シャーマニズム | sinitic |
| 11,30 | Chinese / Cantonese | sinitic | 儒仏道習合 | 同左 | sinitic |
| 12 | Japanese | japanese | 神仏習合 | 同左 | japanese |
| 14 | Nahuatl | nahua | メソアメリカ | 同左 | classical |
| 15 | Hungarian | magyar | テングリ → HM カトリック（1000） | テングリ | earthwork → european |
| 16 | Turkish | turkic | テングリ → HM スンニ派 | テングリ | earthwork → islamic |
| 17 | Berber | maghrebi | CA 古典多神教 → EM スンニ派（マグリブ） | 西アフリカ伝統 | classical → islamic |
| 18 | Arabic | arab | CA セム多神教 → EM スンニ派 | セム多神教 | classical → islamic |
| 19 | Inuit | arctic | シャーマニズム | 同左 | earthwork |
| 20 | Basque | basque | CA 古典多神教 → EM カトリック | 古典多神教 | earthwork → european |
| 21 | Nigerian | westAfrican | 西アフリカ伝統（ヨルバ） | 同左 | earthwork |
| 22 | Celtic | insularCeltic | CA ケルト異教 → EM カトリック（5世紀〜） | ケルト異教 | earthwork → european |
| 23 | Mesopotamian | mesopotamian | セム多神教 | 同左 | classical |
| 24 | Iranian | persian | ゾロアスター → HM スンニ派 → AE シーア派（1501） | ゾロアスター | islamic |
| 25 | Hawaiian | polynesian | ポリネシア | 同左 | earthwork |
| 26 | Karnataka | indic | ヒンドゥー | 同左 | islamic（デカンの石造山城） |
| 27 | Quechua | andean | アンデス | 同左 | classical |
| 28 | Swahili | swahili | 西アフリカ伝統 → HM スンニ派 | 西アフリカ伝統 | earthwork → islamic |
| 29 | Vietnamese | vietnamese | 大乗仏教 | 儒仏道習合 | sinitic |
| 31 | Mongolian | mongol | テングリ → AE チベット仏教（1578） | テングリ | earthwork |
| 32 | Human Generic | latinWest | （German と同じ） | | |
| 33 | Elven | elven | 森のエルフ信仰 | 同左 | fantastic（時代の様式） |
| 34,40 | Dark Elven / Arachnid | darkElven / arachnid | 地底信仰 | 同左 | fantastic |
| 35 | Dwarven | dwarven | ドワーフ祖霊 | 同左 | european |
| 36,37,44 | Goblin / Orc / Beastfolk | tribal | 部族精霊 | 同左 | earthwork |
| 38 | Giant | giant | 巨石祖霊 | 同左 | classical（巨石積み城塞） |
| 39 | Draconic | draconic | 竜族 | 同左 | sinitic |
| 41 | Serpents | serpent | 蛇神殿 | 同左 | classical |
| 42 | Levantine | levantine | ユダヤ教 | セム多神教 | classical → islamic |
| 43 | Infernal | infernal | 魔族 | 同左 | fantastic |

名前ベースが 45 以降（ユーザー追加）なら latinWest とみなす。

## 4. 信仰 × 時代 → 墓地・修道院

| 信仰 | 墓地プリセット | 修道院 |
| --- | --- | --- |
| カトリック | medieval_parish（地中海・ローマは catacomb_paris も）、PI から catacomb_paris、SE から victorian_garden | EM 大修道院のみ、HM から托鉢修道会（1209/1216）＋大修道院 |
| プロテスタント | protestant_gottesacker（宗教改革の壁外墓地）、SE から victorian_garden | なし（修道院解散） |
| 正教 | orthodox_churchyard（納骨堂付き） | 正教修道院 |
| スンニ派 | sunni_wahhabi, ottoman_turbe（テュルクは turbe 優先） | なし（§6） |
| シーア派 | wadi_us_salaam | なし |
| ユダヤ教 | jewish_orthodox, prague_ghetto | なし |
| ゾロアスター | zoroastrian_tower | なし |
| ヒンドゥー | varanasi_ghat（川なしは hindu_shmashana） | なし（§6） |
| 上座部 / 大乗 / チベット / 神仏習合 / 儒教 | thai_chedi_wat / fengshui_mountain / tibetan_jhator / edo_temple_town / fengshui_mountain | なし（§6） |
| 古典多神教 / セム多神教 | roman_via_appia / mesopotamian_household | なし |
| ゲルマン / ケルト・スラヴ・フィン異教 | norse_ship_barrow, pagan_barrow / pagan_barrow | なし |
| テングリ / シャーマニズム | steppe_kurgan / arctic_cairn | なし |
| メソアメリカ / アンデス / ポリネシア / 西アフリカ | mesoamerican_temple / andean_chullpa / polynesian_sea / african_compound | なし |
| 森エルフ / 地底 / ドワーフ / 巨人 / 竜 / 部族 / 蛇 / 魔族 | elven_grove / catacomb_paris / dwarven_hall / megalithic_dolmen / fengshui_mountain / steppe_kurgan・pagan_barrow / mesoamerican_temple / hindu_shmashana・catacomb_paris | なし |

新規プリセット 14 種（`burialCultures.ts`）: orthodox_churchyard, protestant_gottesacker, norse_ship_barrow, pagan_barrow,
mesopotamian_household, mesoamerican_temple, andean_chullpa, polynesian_sea, african_compound, arctic_cairn,
hindu_shmashana, megalithic_dolmen, dwarven_hall, elven_grove。

手続き的合成（`synthesizeBurialCulture`）はファンタジー信仰だけが 30% で使う。史実の文明はプリセットのみ。

## 5. FMG → CE

記述子 `civilization`（`BurgCivilization`）: `tradition`, `period`, `faith`（都市の宗教）, `cultureFaith`（文化の教会）,
`fortification`, `culture {id,name,nameBase}`, `religion {id,name,type,form}`。CE の `CityDocument.civilization` に保存される。

記述子の `burialProfile` は `burgBurialProfile()` で決める。文化の保存済みプロファイルが都市の信仰に合えばそれを使い、
合わなければ（他宗教の都市、または旧マップの矛盾したプロファイル）信仰のプリセットを burg id で安定に選ぶ。
シミュレーション（遺体残存率など）は文化の保存済みプロファイルのままで、CE の描画だけが変わる。

`civilization` の無い旧 CE 文書は、カトリックとみなして修道院を置き（托鉢修道会は HM 以降に修正済み）、
城は埋葬プリセット名（sunni/turbe/edo…）でだけ推定する。ドーム廟・イトスギのような共有特徴では推定しない。

## 6. 未対応（次の候補）

### 6.1 CE の未実装施設（2026-10-08 調査）

優先度: ★★★ 次に着手、★★ その次、★ 余裕があれば。

#### A. 信仰別の宗教施設

CE の宗教施設は修道院（`abbey` / `friary` / `orthodoxMonastery`）だけで、それ以外の信仰の都市には何も置かれない。
`ReligiousHouse` に種類を足し、`religiousHousesFor()` で信仰と時代から選び、`aerialLandmarks.ts` に配置と描画を足す。

| 優先 | 施設 | 信仰・文明 | 俯瞰で見える特徴 |
| --- | --- | --- | --- |
| ★★★ | モスク（会衆モスク） | スンニ派・シーア派 | 中庭（サフン）、礼拝堂、ミナレット、清めの泉。メッカの方向に軸を合わせる |
| ★★★ | 仏教寺院（伽藍） | 大乗・神仏習合・上座部 | 山門・金堂・塔・講堂の配置。上座部は布薩堂と仏塔（チェディ） |
| ★★★ | ヒンドゥー寺院 | ヒンドゥー | 段々の塔（シカラ）、周回路、門塔（ゴープラム）、沐浴池 |
| ★★ | マドラサ | イスラム | 中庭と四方の大アーチ（イーワーン）、学生の個室 |
| ★★ | ハーンカー / 聖者廟（ザーウィヤ） | イスラム（スーフィー） | ドーム廟と巡礼者の宿 |
| ★★ | 隊商宿（キャラバンサライ） | イスラム・シルクロード | 城門外の方形中庭建築 |
| ★★ | 浴場（ハマム） | イスラム・オスマン | ドーム群。モスクの近く |
| ★★ | 孔子廟・祖廟（祠堂） | 中華・朝鮮・ベトナム | 中軸線上の門と殿舎、泮池 |
| ★★ | 神社 | 日本 | 鳥居、参道、社殿、鎮守の森 |
| ★★ | シナゴーグ＋ユダヤ人街 | ユダヤ教（他の信仰の都市の少数派も） | 小さな礼拝堂、沐浴場（ミクヴェ）、壁で囲まれた街区 |
| ★ | 拝火神殿 | ゾロアスター | 方形の聖火堂（チャハール・ターク） |
| ★ | チベット仏教の僧院（ゴンパ） | チベット仏教 | 丘の斜面の段状の僧房、マニ車の回廊 |
| ★ | 古典神殿とフォルム | 古典多神教（Antique 文化セット） | 列柱神殿、広場、バシリカ |
| ★ | 神殿ピラミッドと球技場 | メソアメリカ・蛇人 | 段々のピラミッド、聖域の壁、頭蓋骨棚 |
| ★ | 太陽神殿と儀礼広場（ウシュヌ） | アンデス | 台形の石組み、儀礼広場 |
| ★ | マラエ | ポリネシア | 石の基壇と広場 |
| ★ | 聖なる森 | ケルト・ゲルマン・スラヴ異教、エルフ | 囲いのある木立と祭壇 |
| ★ | ファンタジー種族の聖域 | ドワーフ（祖霊の広間の入口）、巨人（環状列石）、地底系（地下神殿の入口）、魔族 | 種族ごとの手本に合わせる |

町の中心の神殿（`temple` 要素）も信仰で形を切り替える（★★）。カトリック・プロテスタントは教会、正教はドームを中心にした
十字形の教会、イスラムはモスク、仏教は寺院。今はどの信仰でも同じ形。

#### B. 墓地の付属施設

埋葬プリセットの `ritualFacilities` / `sanctuary` にあるが、`cultureCemeteryLayout.ts` / `cultureCemeterySvg.ts` が描かないもの（★）。

| 施設 | 使っている主なプリセット |
| --- | --- |
| 墓守小屋（`caretaker_cottage`） | 多くのプリセット |
| 追悼回廊（`mourning_cloister`） | ローマ・教区教会・ヴィクトリア朝・ドワーフ |
| 納骨堂（`ossuary_charnel_house`、中心施設） | 正教 |
| 祖先祠堂（`ancestral_hall`、中心施設） | 西アフリカ・ドワーフ |
| 献灯台・香炉（`incense_candle_stand`） | 正教・メソアメリカ・アンデス・極北 |
| 骨の洗浄台（`bone_cleaning_table`） | パリのカタコンベ |

#### C. 城の様式

`fortification` 系統に専用の `CastleStyle` が無く、近い様式で代用しているもの（★★）。

| 様式 | 対象 | 今の代用 |
| --- | --- | --- |
| 中華の城郭と役所（門楼、甕城、衙門） | 中華・朝鮮・ベトナム・竜族（`sinitic`） | `classic` |
| インドの山城（デカンの石造城塞） | インド | `islamic-qalat` |
| 神殿城塞（サクサイワマンなど） | アンデス・メソアメリカ | `ancient-castra` |
| 遊牧民の幕営と土塁 | モンゴル・テュルク初期 | `motte-bailey` |
| 巨石積みの城塞 | 巨人 | `ancient-castra` |

#### D. 以前からの計画で未実装の施設

`docs/city-editor/plan/1008-wards-and-features.md` の「優先度リスト外」（★）。

| 施設 | 種類 |
| --- | --- |
| 鐘楼と布地会館 | 都市自治・商業 |
| 泉と共同井戸 | インフラ |
| 晒し台 | 法と権力 |
| 漂白場 | 産業 |
| ハンセン病施設（城壁外） | 慈善・医療 |
| 防鎖塔（港の入口を鎖で閉じる塔） | 防衛 |
| 射撃場 | 防衛 |
| 貴族の塔（塔状住宅） | 居住 |
| ユダヤ人街 | 居住（A のシナゴーグと一緒に作る） |

1008 の「宗教・慈善複合施設」の章にある施療院・救貧院は、実装状況を未確認。

#### 施設の作り方（修道院の作り直しで確定した方式）

当初の修道院は「ランダムな点に回転した長方形の絵を置き、重なる住宅を消す」方式で、街区と無関係な形・専用の色になり、
町から浮いた。新しい施設は次の方式で作る（実装: `core/gen/monasteryLayout.ts`、描画: `render/aerialLandmarksSvg.ts`）。

1. **敷地はボロノイの街区そのもの。** 街区の外形を、通り・城壁の幅＋余白だけ内側に引いたものを境内にする
   （`aerialLandmarks.ts` の `monasteryBlocks`）。通りに面した辺ごとに配置を試し、収まる最大の縮尺を採る。
2. **建物は住宅と同じ部品・同じ見た目。** 施設の建物は `.ce-building`（住宅の灰色と輪郭線）で描く。区別は屋根の濃淡と
   平面形（十字形、塔、ドーム）だけで付け、独自の色体系を作らない。地面は街区の地面をそのまま見せ、
   庭だけ町の菜園・中庭と同じ色を使う。
3. **配置の規則と平面の型を分ける。** 規則（どの街区に置くか、時代・信仰、通りへの面し方）は `aerialLandmarks.ts`、
   平面の型（教会、回廊、棟、塔、門、庭、果樹）は `monasteryLayout.ts` の `LocalPlan`。新しい施設は型を足す。
   型は共通の部品（`rect` の棟、中庭、塔、ドーム）から組み、通りに沿った局所座標（u=通りの方向、v=街区の奥）で書く。
4. **壁は境内の輪郭、門は壁の切れ目。** 余った地面は庭と果樹（通りに沿った列）で埋める。
5. **確認は画像で行う。** `renderStandaloneCitySvg` の出力に `STANDALONE_SVG_STYLE` を付けて SVG にし、ブラウザで拡大して
   住宅との色・輪郭・街区との噛み合わせを見る。幾何の性質は `monasteryLayout.test.ts` で固定する
   （街区内に収まる、建物が重ならない、門が壁上にある、決定的）。

#### 着手順

1. A の★★★（モスク・仏教寺院・ヒンドゥー寺院）。今は宗教施設が一つも無い都市が多い。
2. 町の中心の神殿の形を信仰で切り替える。
3. B（既存の墓地の描画に足すだけ）。
4. A の★★、C、D。

### 6.2 CE 以外

1. **旧マップの文化の埋葬プロファイル**はシミュレーション上は矛盾したまま。再生成するか、Culture エディタで再ロールする UI が要る。
2. Culture エディタに文明圏と時代ごとの信仰を表示する。
3. CE で同じ都市に墓地が複数区画できることがある（Combreche #799 で 3 区画）。以前からある問題で、今回の変更とは無関係。
