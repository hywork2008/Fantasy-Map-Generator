# 国内の羊毛の量の史料照合（2026-11-17）

[sheep-domestic-wool.md](../plan/sheep-domestic-wool.md) §3.1。Web で調べられた範囲。原典の頁を開いて確かめたものは無く、二次の要約・研究の抜粋からの値である。

## 1. 集めた値

| 項目 | 値 | 出典（確かめた程度） |
| --- | --- | --- |
| 羊毛の輸出 | 13世紀末は年平均約26,600袋、1300〜1309年は平均約34,700袋、年により40,000袋超 | W. Childs（Carus-Wilson & Coleman 1963 *England's Export Trade 1275–1547* p.122 の表から）。検索の要約 |
| 同上（別の見方） | 1279〜80年は年50,000〜55,000袋 | Slavin 2020 "Mites and merchants", *EcHR*（特定の関税の記録を足した見直し）。検索の要約 |
| 羊の頭数（1300年） | 1,500万頭 | Broadberry et al.（Wrigley と同じ）。検索の要約 |
| 同上 | 成羊1,370万頭 | Oldland 2014 *EcHR*（国内の布の消費・布の輸出・布の重さ・羊毛の量から逆算）。検索の要約 |
| 1頭の羊毛（1300年） | 1.4 lb（0.64 kg） | Britnell 2004（Stephenson 1988 の指数）。Slavin はノーフォークの小作の羊で1.47 lb、領主直営で1.24 lb |
| 国内の羊毛の割合 | 14世紀初めは羊毛の生産の39%が国内の布（Oldland）。輸出が52〜55%（Slavin） | 検索の要約 |
| 国内の布の消費 | 1311〜15年に160,000反（cloth） | Oldland（[Brewminate の要約](https://brewminate.com/the-economic-impact-of-clothmaking-on-medieval-rural-society-1300-1550/) で文を確認） |
| 1反の布の重さ | 14世紀初めに38 lb、16世紀半ばに64 lb | Oldland（同上で文を確認） |
| 1反に要る羊毛 | 16世紀半ばの標準の広幅の布で84 lb | Oldland（Tawney & Power *Tudor Economic Documents* を引く。同上で文を確認）。1300年の値は無い |
| 1人あたりの布の生産 | 1310年代から1440年代初めに3.5倍、その後1世紀で更に1.5倍 | Oldland（同上で文を確認） |
| 輸入の布 | 14世紀初めは、毛の布の輸出より外国の布の輸入が多かった | 検索の要約 |

- 1袋は364 lb（約165 kg）、羊皮240枚で1袋に数える（Carus-Wilson & Coleman）。
- 1300年の人口は、上の資料では決まっていない（Oldland「まだ合意が無い」）。ここでは400万〜475万人とした。

## 2. 計算

- 刈り取り: 1,370万〜1,500万頭 × 0.64 kg ≈ 880万〜960万 kg。
- 輸出: 34,700袋 × 165 kg ≈ 570万 kg（刈り取りの約6割。Slavin の52〜55%と同じ桁）。
- 国内: 刈り取りの39〜48% ≈ 340万〜460万 kg。1人約0.7〜1.15 kg。
- 布から見ると: 160,000反 × 38 lb ≈ 276万 kg の布、1人約0.6〜0.7 kg。羊毛を16世紀の比（84 / 64 = 1.31）で数えると約360万 kg、1人約0.8〜0.9 kg。

## 3. 読み取り

1. **国内の羊毛は1人約0.8〜1 kg。** コードの「国内の羊毛約0.84 kg・羊1.3頭/人」（`livestockHerdTargetPolicy.ts`）は、この幅に入る。羊の頭数の目標は誤りではない。設計書 §2 の概数（1.7〜2.1 kg）は、羊2,280万頭という記憶の値から出したもので、Broadberry・Oldland の頭数より多すぎた。
2. **布の側の需要が、羊毛を約3倍多く要る。**
   - 衣服の需要: シムは1人・年1 kg。史料の国内の毛の布は1人約0.6〜0.7 kg（輸入の布と亜麻布は別）。
   - 羊毛から布の歩留まり: シムは布1 kg に羊毛2.25 kg（`Wool Cloth` に羊毛6ロット = 9 t で布4 t）。16世紀の標準の広幅の布は1.31 kg。
   - 二つを掛けると、シムは衣服と毛布に羊毛約2.8 kg、史料の幅は約0.8〜1 kg。
3. 1300年代初めの1人あたりの布は、その後の時代よりずっと少ない（1440年代に3.5倍）。基準を1300年代とした以上（[settled-questions.md](../plan/settled-questions.md)）、布の量は少なめが正しい。
4. 籠の布（12.5%）の比較の相手は1450〜1500年の町の労働者の家計で、1人あたりの布が1300年代の3.5倍以上の時代である。1300年代のシムと同じ時代として比べられない（乳製品と同じ、[dairy-herd-20261116.md](dairy-herd-20261116.md) §4）。

## 4. 出典

- [Childs, England's Maritime and Commercial ...（fupress）](https://media.fupress.com/files/pdf/24/4460/14522)
- [Slavin 2020, Mites and merchants, EcHR](https://onlinelibrary.wiley.com/doi/full/10.1111/ehr.12969)
- [Broadberry, The Size of the Medieval Economy](https://ora.ox.ac.uk/objects/uuid:7492273c-857d-45b4-9702-3716fca15418/files/rj9602229v)
- [Oldland の要約（Brewminate）](https://brewminate.com/the-economic-impact-of-clothmaking-on-medieval-rural-society-1300-1550/)
- [Medieval English wool trade（Wikipedia）](https://en.wikipedia.org/wiki/Medieval_English_wool_trade)
- [Bell, Brooks & Dryburgh, The English Wool Market c.1230–1327](https://epdf.pub/the-english-wool-market-c-1230-1327.html)
