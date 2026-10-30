# 市場の金庫の出入りと、塩の掛けが積み上がる理由（2026-10-30）

計画: [salt-supply-calibration.md](../plan/salt-supply-calibration.md) §3.4。固定入力は`docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg`。

    NODE_OPTIONS=--max-old-space-size=6144 node --import tsx scripts/auditMarketTreasuryFlows.mts <input> <treasury.json> 48
    NODE_OPTIONS=--max-old-space-size=6144 node --import tsx scripts/auditWetRegionPopulationGrowth.mts <input> <pop.json> 84
    NODE_OPTIONS=--max-old-space-size=6144 node --import tsx scripts/auditUrbanMoneyFlows.mts <input> <money.json> 84
    NODE_OPTIONS=--max-old-space-size=6144 node --import tsx scripts/auditMarketSaltPrice.mts <input> <salt.json> 48
    NODE_OPTIONS=--max-old-space-size=6144 node --import tsx scripts/auditSaltworksOutput.mts <input> 48 > <works.log>

| ファイル | SHA-256 |
| --- | --- |
| treasury-48.json | ca18abc872ab3db593faa18c430ebe693f4535581b52dbfbb1196ba5b17fcef5 |
| salt-owed-reserve/pop-84.json | 0af8e8d3cb1967bdfd8a0c839052412163b1e5b51d1e9b09156593f12ab8f650 |
| salt-owed-reserve/money-84.json | f0f3c2d34786c9f61905cf481a9adb40add1765a296668bac854ceca2949cc58 |
| salt-owed-reserve/salt-48.json | 23f4c40e7fa56457ea09f6b35257d3583657bea0378f0c7e910394a1e0e7922e |
| works-salt-owed-reserve.log | 9bf49dee0f9b7c92621dcba77c8af7736c4eaa086a47620444c77c479f3bb27a |
| paid-need-orders/pop-84.json | be908feab47e283c67bb1979f22b0d93be4fa146ee6f3000a5581b63ea844c91 |
| paid-need-orders/money-84.json | f3f5c19d8cd3ae44b1a8a6b68ef55dbb640ecd92e5e98c72d1f53eec9d5e07bc |
| paid-need-orders/salt-48.json | 0639886a958a25c2162458666f9bb158aabc70a7be880312beaf7ea89ab4d748 |
| paid-need-orders/works-48.log | 6666195b74147597900bfebfc7cbec09cc5c45baa9a4f0569f351a06ed71dc20 |

## 1. 市場の金庫は減っていない

`auditMarketTreasuryFlows.mts`は、市場の金庫の残高を変える処理を、残高に読み書きの仕掛けを付けて全部記録する（掛け売り・家畜の塩を買える量だけ値段に数える変更の後のコード）。捕まえ漏らしは年1千未満。

世界の市場の金庫の年初の残高は、3.4千→50.9千→56.4千→71.3千→70.6千で、減っていない。年の出入りの大きいもの（1303年）は、塩の売上と仕入れ（+277.5千／−251.7千）、都市の主食の売上（+220.9千）、草の買い上げ（−162.0千）、農村への穀物の代金（−118.5千）、余りの分配（−103.7千）、飼い葉の売上（+89.7千）だった。

塩の仕入れに使える現金が年ごとに減って見えたのは、塩の掛けが残高から差し引かれるからだった。

## 2. 直したもの（2つ）

1. 余りの分配（`payOutMarketSurplus`）が、塩の掛けの分の現金まで余りとして配っていた。掛けの額を市場の手元に残す額に足した（`householdWealth.ts`）。
2. 市場の注文・在庫の目標・掛けの上限が、家畜の塩を必要な量の全部で数えていた。値段（[salt-price-pressure.md](../plan/salt-price-pressure.md)§4.2）と同じく、その月の家畜の塩の枠で買える量だけ数えるようにした（`saltLogistics.ts`）。

## 3. 結果（84か月・48か月）

| 年 | 都市の充足 前／1／1+2 | 財布が尽きた市場 前／1／1+2 | 町で使ったお金（千） 前／1／1+2 |
| --- | --- | --- | --- |
| 1303 | 98.8／99.0／99.0% | 6／6／6 | 197.4／196.9／201.7 |
| 1304 | 93.3／93.3／93.5% | 6／4／3 | 215.3／216.4／228.6 |
| 1305 | 93.2／94.1／94.8% | 3／3／1 | 234.5／240.9／253.4 |
| 1306 | 95.6／95.5／96.8% | 3／3／1 | 256.5／257.4／267.4 |
| 1307 | 98.3／98.1／98.4% | 2／3／1 | 260.3／262.6／269.4 |

「前」は家畜の塩を買える量だけ値段に数えた結果（`salt-price-pressure-20261030/affordable/`）。農村の充足と飼料の不足は変わらない。

| 年 | 生産（袋） 前／1／1+2 | 人に売れた割合 前／1／1+2 | 値段÷基準 1+2 | 塩の掛けの残高の最小 1／1+2 |
| --- | --- | --- | --- | --- |
| 1300 | 236千／236千／208千 | 74／74／70% | 2.42 | 7.6千／0 |
| 1301 | 247千／250千／212千 | 70／71／61% | 2.65 | 37.9千／19.8千 |
| 1302 | 218千／234千／176千 | 64／66／52% | 2.76 | 61.0千／36.3千 |
| 1303 | 154千／177千／102千 | 49／56／35% | 2.85 | 79.3千／49.1千 |

- 1+2で、都市の財布が尽きた市場は1か所まで減り、町で使うお金は年10〜20千増えた。1304〜1305年の都市の充足は93.5%・94.8%で、完了条件（94.2%・95.6%）にまだ届かない。
- 一方、塩の掛けは減ったが年ごとにまだ積み上がり、生産と人に売れる塩は年ごとに減って、1303年には人の需要の35%しか売れない。値段も上がる。
- 塩の仕入れに使える現金（夏〜秋の最大）は、1+2でも125.6千→102.3千→79.7千→40.8千と減る。金庫の残高は減っていないので、掛け以外の差し引き（農村への穀物の未払い・掛けの約束・交易の未払い）か、塩の売上より仕入れが大きいことが残っている。まだ確かめていない。

## 4. 追記: 固定入力の戦争の状態（2026-10-30）

一連の計測が戦時経済の影響を受けていないかを確かめた（使い捨てのスクリプトで、読み込み直後と12か月・48か月を数えた）。

- 地図の設定は`conflictAutonomy`が`playerDirected`、`warFrequency`が1、歴史モードは無効。プレイヤーの承認（`conflictAuthorizations`）と戦略目標（`strategicGoals`）は48か月を通じて0で、連隊の数（187）も変わらず、実際の戦闘は起きていない。都市の持ち主の変化（1,123→1,152）は戦争でない経路によるもの（未確認）。
- ただし、地図の生成で作られた外交関係に、敵対（`"Enemy"`）の組が16ある。29か国のうち20か国が敵対の相手を持ち、経済側の`stateHasEnemy`はこれを戦時とみなす。読み込み直後に20か国すべてが戦時体制（`warFooting`）に入り、6か月後も18か国が戦時体制のままだった。
- 戦時体制は、国庫の配分を軍（marshalcy）に寄せ、家政を削り、戦時の臨時の歳入（議会の同意）や国庫の許容の下限（`treasuryAllocation.ts`）を変える。塩の値段は在庫の圧力で決まるので、戦時体制が塩の値段を直接上げる経路は見つかっていない。国庫・税を通じて都市と農村の財布に効いている可能性はある。
- `conflictAutonomy`と`warFrequency`は戦闘の開始を止めるだけで、生成時の敵対関係と、それによる戦時体制は止められない。校正のために、敵対関係を戦時とみなさない（または戦時体制を入れない）設定が要る。
