# バイオームごとの蜂蜜の量（2026-11-07）

設計は[honey-forage-lands.md](../plan/honey-forage-lands.md)。

## 1. 条件

- 地図: [site-bonus-20261107.md](site-bonus-20261107.md)のH = 25の地図4枚（シード2101〜2104）。
- 計測は、地図を読み込んだ始まりの時点だけ。シミュレーションは進めていない。
- 計測スクリプト: [honeyprobe.mts](honey-biome-20261107/honeyprobe.mts)。読み取りのみ。
  - セルごとに、農村の生産（`getRuralProductionContributions`、preview）の蜂蜜を、バイオームごとに足した。
- 集計: [summarize.py](honey-biome-20261107/summarize.py)。出力は[summary.txt](honey-biome-20261107/summary.txt)。
- before: 変更の前（森だけ）。after: `migrateHoneyForageLands`の後。どちらも同じ地図である。
- 1樽 = 168 kg。

## 2. 結果

| バイオーム | 農村の人 | 蜂蜜 t/年 前 → 後 | 1人あたり kg/年 前 → 後 |
| --- | ---: | --- | --- |
| 温帯の落葉樹林 | 8,665k | 908 → 908 | 0.105 |
| 温帯雨林 | 5,796k | 595 → 595 | 0.103 |
| 寒冷ステップ | 3,731k | 0 → **313** | 0 → 0.084 |
| 温帯の針葉樹林 | 3,182k | 302 → 302 | 0.095 |
| 草原 | 2,452k | 0 → **203** | 0 → 0.083 |
| タイガ | 1,753k | 175 → 175 | 0.100 |
| 中央ヨーロッパの大森林 | 1,590k | 150 → 150 | 0.094 |
| 氾濫原の森 | 1,489k | 141 → 141 | 0.094 |
| 火山の土 | 425k | 0 → 36 | 0 → 0.086 |
| 乾燥低木地 | 392k | 0 → 32 | 0 → 0.083 |
| 湿地 | 350k | 0 → 0 | 0 |
| 泥炭地 | 332k | 0 → 0 | 0 |
| 荒れ地 | 196k | 0 → 17 | 0 → 0.086 |
| 世界 | 30.38M | 2,270 → 2,872（1.27倍） | 0.075 → 0.095 |

- 1人あたりの量がバイオームで少し違うのは、文化の型の掛け算（Genericで1.2倍）のためである。
- 史料の目安（1人あたり年約1.5〜2 kg、設計書§2）と比べると、今の量は約1/15〜1/20である。量は蜂蜜酒の計測と合わせて決める。

## 3. 全量の出力

`docs/analytics/raw/honey-biome-20261107/`（Git管理外）:

| ファイル | バイト | SHA-256 |
| --- | ---: | --- |
| before-2101.json | 1136 | 8c91c0bc9fbae11332a16aed701b4b9eb960f3cf6781bc66c210be6006b3600a |
| before-2102.json | 1635 | f263db953e76a7d5ccf6e058b4f3a9fd5644f576a7d1d2e7a154a13d083385bf |
| before-2103.json | 1611 | 31f1befbd84d7cdc149df80a4a77e6ef4d036bd98342c2285035024c6fef4d39 |
| before-2104.json | 1315 | 1baba367481b1e845837af025b294706562e41ef6b4953ee4b9c41ef4e5d4d59 |
| after-2101.json | 1170 | e231b32fc41ff095f25da19a92c8b7ad415d8f0a0c7da5f39f09a10bfa0c8ceb |
| after-2102.json | 1698 | 541d0cb8dc0dbfcf9b3750e8ba017c2052c8a93f64872899ed5c26b98ca59777 |
| after-2103.json | 1693 | c7e64508146a9630f10a9b564d220add7a5c6381f873cc5c44f8f4826193dd3b |
| after-2104.json | 1366 | 0de1597996383cb6004aa87cbe3f5d3a8414e03ea114ef71998caa1bd6b59f1a |
