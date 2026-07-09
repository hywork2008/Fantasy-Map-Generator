# 商会

大きな商会に会頭の部下としてNPCを作成し、秘書と用心棒は会頭と同じ都市に滞在させる。
会頭を頂点とした商取引の組織を作成し、以下の部下を所属させる。
一番大きい商会の会頭はcapital、その幹部はcityに滞在する。
その他の会頭はcapitalかcityのいずれかに滞在する。

- 秘書 * 1
- 用心棒 * 1 Prowess補正で最低60にし、乱数では100までは高ければ高いほど値を出にくくする。
- 都市3-6つ(ランダム)毎に1人の幹部
- 為政者は男女比9:1なので商会は5:5

`src/extensions/characters/personFactory.ts`
`const gender: Gender = genderOverride ?? (P(0.9) ? "male" : "female");`

[能力値](docs/plan/characters.md)
[商会の補足情報](docs/plan/trade.md)

`src/extensions/economy/generators/burgMarketLedgers.ts`
`ensureLedgerMerchants()`内の`getDesiredMerchantCount()`で2000人近い商人NPCが出来てしまう。
`Math.round(Math.random())`で 0 or 1 にするとマーケットシェア0%の可哀想な商人があちこちで生まれる。

未実装
大商会の会頭が強気で、ライバル商会の会頭が弱気なら、弱気が強気の傘下に入る事を検討する。
