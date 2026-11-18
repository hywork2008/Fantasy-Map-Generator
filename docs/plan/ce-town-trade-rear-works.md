# 町の中の専用作業場を、区画の表の家と裏の作業場に分ける

作成: 2026-11-18
状態: 調査と計画まで。実装はまだ（§6 の R1 から）。
関連: [bv-workhome-facade-variation.md](bv-workhome-facade-variation.md) §8・§9（本書はその未決事項の続き）、[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md)（短冊形区画）

## 1. 目的

CE の施設のある町で、パン焼き・鉄器・魚・肉・刃物・ろうそく・ガラスの専用作業場（MV task 52〜58）は、大きな箱 1 つとして置かれている。

- 大きさは 12×10〜16×13 m。表の店舗兼住宅、裏の作業場、庭をまとめた「区画 1 筆を押しつぶした」形になっている。
- `burgage`／`burgage-dense` では区画がすでに表の家と裏庭を持つ。そこへ間口 12〜16 m の箱を置くので、施設 1 つが区画を 2〜4.5 筆使う（§3.2）。
- 大きさの根拠は史料ではない。Opus 版の外形は「前の CE の仮の外形を保つ」として決めた（[opusTradeProfiles.ts](../../src/buildings/medieval/opusTradeProfiles.ts) の注記）。

本書は、これらを史料に合わせて組み直す。

- 区画のある町では、施設を「区画の表の店舗兼住宅（Workhome）」と「同じ区画の裏の作業場」に分ける。表は Workhome（W4）と同じく区画の間口に合わせる。
- 市場で売る業種（魚・肉）は、店を市場の列に置く。
- `compact`（区画のない町）は今の箱のままにする。

## 2. 範囲

入れる:

- task 52 パン焼き、57 肉、58 の町の業種のうち鉄器・魚・刃物・ろうそく・ガラス。
- `burgage`／`burgage-dense` の置き方。
- MV に「裏の作業場」のモデル（Opus 版）を足す。

入れない:

- 町の外の作業場（皮なめし 55、樽 54、縄 56、石灰とタイル 58、鍛冶 53、陶器、水車・馬の粉ひき）。町の外の空き地に置いており、区画の取り合いがない。大きさの見直しは別に行う。
- `compact` の箱の大きさ。
- Economy から業種を受け取る経路。

## 3. 今の実装の調査

### 3.1 町の中の専用作業場（5,000 人、大航海時代、`atlantic`）

| 業種 | モデル | 外形 | 数 | 区域 |
| --- | --- | --- | --- | --- |
| パン焼き | `trade-workshop.dedicated-bakehouse`（Codex） | 14.5×10.5 m | 12 | 町の中 |
| ビール | `ale-brewhouse` | 11.3×7.4 m | 10 | 町の中 |
| 鉄器（錫・真鍮・小物） | `trade-workshop.dedicated-metalwares`（Opus） | 14×12 m | 8 | 町の中 |
| 魚 | `trade-workshop.dedicated-fishmongery`（Opus） | 14×12 m | 4 | 町の中 |
| 刃物 | `trade-workshop.dedicated-cutlery`（Opus） | 12×10 m | 3 | 町の中 |
| 肉 | `trade-workshop.dedicated-butchery`（Opus） | 16×13 m | 2 | 町の中 |
| ろうそく | `trade-workshop.dedicated-chandlery`（Opus） | 12×10 m | 4 | 町の外（臭いのため） |
| ガラス | `trade-workshop.dedicated-glaziers-workshop`（Opus） | 12×10 m | 0（約 8,300 人以上の町だけ） | 町の中 |

（数は [populationFacilityRequests.ts](../../src/city-editor/generators/populationFacilityRequests.ts) の要求。2,000 人ではパン焼き 5、鉄器 3、肉・魚・刃物・ろうそく 各 1。）

Opus 版の 6 業種（[opusTownTrades.ts](../../src/buildings/medieval/opusTownTrades.ts)）は、どれも同じ組み立てになっている。

- 通りに面した店舗兼住宅。
- 裏の作業場。鉄器なら鋳造の炉、刃物なら鍛冶場と研ぎ場、ろうそくなら脂を煮る小屋。
- 区画の境界と庭の物（樽・燃料・井戸など）。

### 3.2 区画を何筆使うか（5,000 人、`b2-probe`、壁あり・川なし）

| 施設 | `burgage`（間口の中央値 7.2 m、奥行き 33.8 m） | `burgage-dense`（間口 5.0 m、奥行き 23.3 m） |
| --- | --- | --- |
| Workhome（W4 で区画に合わせた） | 1.1 筆 | 0.8 筆 |
| パン焼き | 2.4 筆 | 2.8 筆 |
| 鉄器 | 2.1 筆 | 3.8 筆 |
| 魚 | 3.0 筆 | 4.0 筆 |
| 刃物 | 2.0 筆 | 2.0 筆 |
| 肉 | 2.0 筆 | 4.5 筆 |
| ろうそく（町の外） | 2.8 筆 | 2.0 筆 |

（区画の重心が施設の敷地に入る区画の数の平均。`burgage-dense` の Workhome が 1 未満なのは、敷地が区画の前だけで重心に届かないため。）

- `burgage-dense` の町の中の専用作業場は、5,000 人の町で約 30 棟、約 100 筆を使う。
- 区画の奥行きは 20〜40 m ある。一方、箱の奥行きは 10〜13 m しかない。箱の後ろの区画の奥は、何もない庭になる。
- このため `burgage-dense` の建物の割合は 30〜31% で、`compact`（45〜47%）に届かない（bv-workhome-facade-variation.md §10.4）。

## 4. 史料

| 資料 | 確かめたこと | 設計への適用 |
| --- | --- | --- |
| Suffolk HER BSE 217, Warrens Yards, Bury St Edmunds（[記録](https://heritage.suffolk.gov.uk/Monument/MSF25114)） | 13 世紀末〜14 世紀初めの円形の窯 3 基（直径 1.8〜2.7 m）。Guildhall Street に面した家々の裏の、半地下の室にあった。大きさと造りから、家庭用ではなく商売のパン焼きとみる | パン屋の窯は区画の裏に置く。窯の大きさは直径 2〜2.7 m |
| Suffolk HER BSE 353, 40 Peckham Street, Bury St Edmunds（[記録](https://heritage.suffolk.gov.uk/Monument/MSF25594)） | 12 世紀からの区画。境界はほとんど変わらない。作業の庭で、パン焼きと麦芽乾燥の窯が何度も造り直されていた。浸し穴と石臼もあった | パン焼き・醸造の作業は区画の裏庭で行う |
| Northamptonshire HER, Mill Cotton の中世のパン焼き小屋（[記録](https://her.northamptonshire.gov.uk/Monument/MNN20959)） | 幅約 5.5 m の石造の小屋に円形の窯 2 基（1.4 m と 0.9 m）。1400 年頃〜15 世紀半ば | 裏のパン焼き小屋の幅は 5〜6 m。区画の間口に入る |
| Coleman による スコットランドの burgh の発掘のまとめ（[PSAS](https://journals.socantscot.org/index.php/psas/article/download/9608/9575/9560)、検索結果の抜粋） | 発掘された区画の奥（backlands）には、境界、木造の建物、作業の跡、穴、ごみの山がよく残る | 区画の奥は空き地ではない。作業の小屋を置く |
| VCH Wiltshire vol. 6, "Salisbury: The market place"（[BHO](https://www.british-history.ac.uk/vch/wilts/vol6/pp85-87)） | Butcher Row・Fish Row などは、市場の仮の屋台が恒久の店に置き換わったもの。魚の屋台（fysschamels）には 1314 年に店が建った。1427 年、よそから来た漁師の屋台は町の漁師の屋台の後ろに置かれた。Butcher Row は 1455 年に主に「店」と記される | 魚屋と肉屋は、市場の列（Fish Row・Butcher Row）の小さな店で売る。業種ごとに大きな建物を建てない |
| Wessex Archaeology, London Road, Crawley（[Sussex Arch. Coll. 139](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-285-1/dissemination/pdf/vol_139/06_cooke.pdf)、検索結果の抜粋） | 14 世紀末〜15 世紀初めの鍛冶の炉と床が、通りに面した区画にあった | 鍛冶は本書の範囲の外（町の外に置く）。刃物屋の鍛冶場は区画の裏に置いてよい |

まだ確かめていないこと:

- 鉄器（錫・真鍮の鋳造）、ろうそく、ガラス屋の作業場が区画のどこにあったか。本書では刃物・パン焼きと同じく裏に置く（仮）。
- 町の大きさごとの Fish Row・Butcher Row の店の数。ロンドンの 1543 年の記録では、魚屋の板（stall）が 25、肉屋が 18 ある（検索結果の抜粋、出典は未確認）。
- ドイツ語圏・地中海の町の、パン焼き窯と肉の売り場（Fleischbank、Brotbank）。

## 5. 方式

### 5.1 業種の分け方

| 型 | 業種 | `burgage`／`burgage-dense` での置き方 |
| --- | --- | --- |
| 表の家と裏の作業場 | パン焼き、鉄器、刃物、ガラス、ろうそく（町の外のまま） | 区画 1 筆（狭ければ 2 筆）。表に業種の品物を並べた Workhome、同じ区画の裏に作業場 |
| 市場の列の店 | 魚、肉 | 市場の広場に面した区画に、間口の狭い店を並べる（Fish Row・Butcher Row）。裏に魚の塩蔵小屋、肉の処理場 |
| 今のまま | ビール（`ale-brewhouse`） | 大きさの根拠は未確認だが、今は 2 筆以下で収まっている。後で見直す |

### 5.2 裏の作業場（MV）

- Opus の新しいモデル `trade-workshop.rear-works.<業種>` を作る。区画の裏の小屋と庭の物だけのモデルとし、表の家は含めない。
- 部品は [opusTownTrades.ts](../../src/buildings/medieval/opusTownTrades.ts) の裏の部分（`workShed` など）を使い、間口（3〜8 m）と奥行き（5〜10 m）に合わせて組む。
  - パン焼き: 窯 1〜2 基（直径 2〜2.7 m、Bury）を入れた小屋（幅 5〜6 m、Mill Cotton）と、薪の山。
  - 鉄器: 炉と鋳型の作業小屋。
  - 刃物: 鍛冶小屋と研ぎ場の差し掛け。
  - ガラス: 鉛を溶かす炉と、ガラスを組む台の小屋。
  - ろうそく: 脂を煮る小屋（町の外）。
- 表の家は Workhome の Opus 版を使い、業種の品物（[opusWorkhomeGoods.ts](../../src/buildings/medieval/opusWorkhomeGoods.ts)）を足す。

### 5.3 CE の置き方

- 施設 1 つを、区画 1 筆（または 2 筆）の「表の家と裏の作業場の組」として置く。
  - 表の家は W4 と同じく区画の間口に合わせる。
  - 裏の作業場は、表の家の後ろに庭（4 m 以上）をあけて置く。
- 施設の報告は 1 施設のまま数え、表の家は住戸 1 を持つ（Workhome と同じ）。
- `compact` は今の箱を使う。

### 5.4 市場の列の店

- 魚屋・肉屋は、市場の広場（`feature:civic-plaza`）に面した区画から順に置く。表の家は、間口の狭い店（Workhome の店の型）にする。
- 店の数は今の要求の数を使う（5,000 人で魚 4、肉 2）。

## 6. 段階

| 段階 | 内容 | 依存 |
| --- | --- | --- |
| R1 | MV: 裏の作業場のモデル（パン焼き・刃物・鉄器・ガラス・ろうそく）。表の家に置く業種の品物を Workhome に足す | なし |
| R2 | CE `burgage`／`burgage-dense`: R1 の業種を、表の家と裏の作業場の組として区画 1〜2 筆に置く。版を上げる | R1 |
| R3 | CE: 魚屋・肉屋を市場の列の店にする | R2 |
| R4 | 計測と目視。§7 の条件を確かめる | R3 |

## 7. 受入の条件

- R1〜R2 の業種の施設 1 つが使う区画が、平均 1.5 筆以下（今は 2〜3.8 筆）。
- `burgage-dense` 5,000 人の町の建物の割合（家と施設）が、今の 30〜31% より上がる。
- 施設を置けた数が今以上。未収容の住民が 0。
- `compact` の配置・街区の記録・人口の報告が変わらない。

## 8. 未決事項

- 裏の作業場を表の家と別の配置（モデル 2 つ）にするか、1 つのモデルにまとめるか。2 つにすると、表の家は Workhome と同じ扱い（外観の保存、区画への合わせ方）にできる。本書は 2 つを推す。
- ろうそく屋（町の外）にも組の方式を使うか。町の外は区画のない空き地に置くので、今の箱のままにする案もある。
- 魚屋・肉屋の店の数を、町の大きさで減らすか（市場の列に 25 の板があったロンドンでも、魚屋の建物は数えるほど）。今の要求の数は実務者の数から出ている。

## 9. 次の作業

R1（裏の作業場のモデル）から始める。§8 の 1 つ目（配置を 2 つにするか）を決めてから進める。
