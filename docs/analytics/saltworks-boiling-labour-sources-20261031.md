# 煮詰めの人手と燃料の根拠（2026-10-31）

[salt-shared-market-credit-20261031.md](salt-shared-market-credit-20261031.md)§5〜§6の続き。製塩所の煮詰めの人手`boilingHoursPerKg = 82 / 34.5`（1 kgに2.38時間、1袋142.6時間）と、薪`60 / 34.5`（1 kgに1.74 kg）の根拠を史料で確かめた。計測とコードの変更は無い。

## 1. 今の値の出どころ

- [salt-s2-production-20261023.md](salt-s2-production-20261023.md): 「煮詰めの82人時/34.5 kgと木60 kg/34.5 kgは、Dardenizの研究が紹介するTencariuらの実験を参照した暫定設定で、中世一般の標準ではない」。
- Tencariuら（2015）は、先史時代の土器（briquetage）で塩の塊を作る実験である。
  - 土器17個を作った。
  - 固い塩の塊（1個0.39〜0.89 kg）が取れたのは3個だけだった。
  - 人手は2人で約41時間で、82人時はこれと一致する。
- 34.5 kgがどの量かは、この調べでは確かめられなかった。論文の本文を見ていない。
- いずれにせよ、成功の少ない先史時代の技法の実験であり、中世の鉛や鉄の平釜での煮詰めとは違う。

## 2. 中世の平釜の煮詰め

### 2.1 塩泉（濃い塩水）: リューネブルク

| 項目 | 値 | 出典 |
| --- | --- | --- |
| 釜 | 54の煮詰め小屋に4つずつ、216の鉛の釜（1276〜1797年） | Planet Wissen、Wikipedia |
| 年の生産 | 17,000 t以上（中世後期） | Mittelalter-Lexikon |
| 年の生産 | 約20,000 t（1500年頃の重りによる確かめ） | Reinhardt（Der Anschnitt 1981）、Körnerの計算 |
| 働き手 | 約1,000人の「Sülzer」 | Mittelalter-Lexikon |
| 働き手 | 約300人 | Planet Wissen |
| 勤務 | 1日2交代（昼13時間、夜11時間） | Lust auf Lüneburg |
| 薪 | 塩1 Wispel（544 kg）に1.5 Ster | 同上 |

1 kgあたりの人手は、次のように見積もった。

- 1人年3,600時間（12時間×300日）とすると0.05〜0.21時間。300人・20,000 tで0.05、1,000人・17,000 tで0.21。
- モデルの1人月160時間（年1,920時間）で数えると0.03〜0.11時間。

働き手の数は資料によって3倍違う。年の日数と時間は仮定である。

### 2.2 海辺の砂の濃い塩水（sel ignigène、sleeching）

固定入力の製塩所274か所は、すべて海辺のこの形にあたる（種類は`saltPan`で、天日の重みが0なので煮詰め）。

| 項目 | 値 | 出典 |
| --- | --- | --- |
| モン・サン・ミシェル湾（フランス革命の頃） | 225の製塩所で年約3,500 t、1か所あたり約15.5 t。鉛の釜 | Inventaire du patrimoine Bretagne |
| 同じく薪 | 1か所あたり年4,000束を超える | 同上 |
| 同じく人手 | 近くの村の農家が、砂を集める手伝いと薪の納め手を兼ねた | 同上 |
| 英国の北西岸（中世〜近世） | 多くは季節の副業で、燃料は泥炭 | Northern History 60（2022） |
| リミントン（1800年頃、石炭） | 1つの釜で6日に3〜3.25 t、季節は平均16週 | St. Barbe（Lymington salterns） |
| ポーツマス（1749年、石炭） | 1つの釜で年約40 t | 同上の地方史 |

- 海辺の煮詰めの働き手の数は、どの資料にも無かった。
- 仮に1か所2〜4人がひと季節（約1,500時間）働いたとすると、15.5 tに対して1 kgあたり0.2〜0.4時間になる。この人数と時間は仮定である。
- 砂を集めて洗う手間があるので、塩泉（2.1）より多い方向になる。

### 2.3 実験による再現

- エコミュゼ・ド・ラ・ベ（モン・サン・ミシェル湾、ヴァン）は、砂を洗い濾して濃い塩水を作り、煮詰める作業場を復元して、一年中実演している。
- 生産量や人手の測定値は公表されたものを見つけられなかった。
- 鉛の釜の実験（英国のLion Salt Worksの復元した釜の実演）も、測った値は見つからなかった。

## 3. 燃料

| | 塩1 kgに薪 |
| --- | ---: |
| モデル（Tencariuらの実験から） | 1.74 kg |
| リューネブルク（1.5 Ster / 544 kg） | 約1.1〜1.4 kg。1 Ster（積んだ1 m³）を400〜500 kgとした |
| モン・サン・ミシェル湾（4,000束を超える / 15.5 t） | 約1.3〜2.6 kg。1束を5〜10 kgとした |

燃料は、史料の範囲にほぼ入る。

## 4. 分かったこと

1. 今の人手の値（1 kgに2.38時間）は、先史時代の土器の実験から来ている。中世の平釜と比べると次のとおりである。
   - 塩泉のリューネブルクの0.05〜0.21時間の11〜48倍。
   - 海辺の見積もり0.2〜0.4時間（仮定を含む）の6〜12倍。
2. 燃料の値（1 kgに1.74 kg）は、史料の範囲にほぼ入る。変える理由は無い。
3. 人手を史料に合わせると、国28の製塩所に要る人手は月約5.7千人から0.5〜1千人ほどになる。市場2の町（22千人）だけでも、ほぼまかなえる見込みである。

## 5. 直す場合に一緒に見ること

人手が1袋142.6時間から15〜24時間（1 kgに0.25〜0.4時間）になると、作る費用が変わる。

- 1袋の賃金は約0.048から約0.005〜0.008になり、作る費用は約0.021〜0.024（薪0.016が主）になる。
- [salt-untaxed-value.md](../plan/salt-untaxed-value.md)の値0.08は、作る費用（約0.067）に合わせて決めた。人手を直すと、値は作る費用の3〜4倍になる。
- 史料の税の無い値段（穀物の0.15〜0.6倍/kg、値0.02〜0.077）に合わせて、値を一緒に見直す必要がある。
- 塩泉（`brineWell`）と海辺（`saltPan`の煮詰め）で人手を分けるかどうかも決める。固定入力には塩泉が無い。

## 6. 出典

- [Tencariu et al. 2015, Briquetage and salt cakes (ResearchGate)](https://www.researchgate.net/publication/276075587_Briquetage_and_salt_cakes_An_experimental_approach_of_a_prehistoric_technique)
- [Dardeniz 2023, A Model of Salt Production and Consumption Patterns in Bronze Age Anatolia](https://www.cambridge.org/core/journals/european-journal-of-archaeology/article/model-of-salt-production-and-consumption-patterns-in-bronze-age-anatolia/B0A2D8BFF1947DC1566724CC8AF5101A)
- [Sodium Chronicles... Grain by Grain (2026)](https://link.springer.com/article/10.1007/s10816-026-09771-7)（Tencariuらの実験の41時間・2人・塊3個）
- [Mittelalter-Lexikon: Lüneburg](https://www.mittelalter-lexikon.de/wiki/L%C3%BCneburg)、[Salzgewinnung](https://www.mittelalter-lexikon.de/wiki/Salzgewinnung)
- [Planet Wissen: Salz](https://www.planet-wissen.de/gesellschaft/lebensmittel/salz/index.html)
- [Lust auf Lüneburg: Saline](https://www.lustauflueneburg.de/saline/)
- [Reinhardt 1981, Saline Lüneburg 956–1980 (Der Anschnitt)](https://www.bergbaumuseum.de/fileadmin/forschung/zeitschriften/der-anschnitt/1981/1981-02/anschnitt-2-1981-reinhardt-saline-luemeburg.pdf)（Wikipediaの引用による。本文は大きすぎて読めなかった）
- [Lüneburg Saltworks (Wikipedia)](https://en.wikipedia.org/wiki/L%C3%BCneburg_Saltworks)
- [Inventaire du patrimoine Bretagne: Maquette de saline](https://patrimoine.bzh/gertrude-diffusion/dossier/maquette-de-saline/e451a638-47c6-4376-9770-ebaca9538f52)
- [Écomusée de la Baie du Mont-Saint-Michel (Sels de France)](https://www.selsdefrance.org/ecomusee-de-la-baie-du-mont-saint-michel-vains-manche/)
- [Sleech Salt Making from the Solway to the Mersey (Northern History 60, 2022)](https://www.tandfonline.com/doi/abs/10.1080/0078172X.2022.2146562)
- [Historic England, Pre-industrial Salterns (2018)](https://historicengland.org.uk/images-books/publications/iha-preindustrial-salterns/heag225-pre-industrial-salterns/)
- [Lymington Salterns (Hampshire Field Club)](https://www.hantsfieldclub.org.uk/publications/hampshirestudies/digital/1910s/Vol_7/Ravenscroft.pdf)、[Portsmouth salt history](https://salthistory.yolasite.com/post-medieval-sea-salt-industry.php)
- [Greenwood, The changing technology of post medieval sea salt](https://www.citcem.org/encontro/pdf/new_01/TEXTO%20-%20Jeremy%20Greenwood.pdf)
