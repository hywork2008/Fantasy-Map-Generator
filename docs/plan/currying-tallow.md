# 革の仕上げの獣脂

## 1. 背景

[household-goods-values-20261112.md](../analytics/household-goods-values-20261112.md)で、長靴・革の品・蝋燭の値を史料に合わせた後も、獣脂は出た量の約6割（地図2102で年約28万樽）が積み上がった。[byproduct-history.md](byproduct-history.md) §5の候補のうち、革の仕上げ（2）を置く。地図の外へ売る出口（3）は、外から入るお金の釣り合いを決める必要があり、別に設計する。

## 2. 史料

- 鞣した後、革屋（currier）は、革の毛の側に油を、肉の側に油と獣脂を混ぜたものを擦り込み（stuffing）、余りを拭き取った。馬具の革は片側を黒くした（[Industries of Scotland](https://www.electricscotland.com/HISTORY/industrial/industry16.htm)）。
- 牛の獣脂と鱈の肝油を等しい量で擦り込んだ。厚い革（牛の皮）だけに行った（[MFA Cameo](https://cameo.mfa.org/wiki/Curried_leather)、[Conservation Wiki](https://conservation-wiki.com/wiki/BPG_Animal_Skin_and_Leather)）。
- 植物で鞣した甲革は脂を15〜23%、馬具の革は25%以上含む。底革は0.5〜2%（米国特許5468255、[USPTO](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5468255)。今の革の値）。
- 1809年の革屋の遺品の目録に、獣脂25ポンドと皮12枚（[Hagenbuch](https://www.hagenbuch.org/homestead-economics-leather-tanning/)。在庫で、使った量ではない）。

## 3. 決める仕組み

- 長靴・革の品・馬具（Harnesses）を作る時、作り方の革（Leather）1枚あたり`curryingTallowKgPerHide`（既定2 kg）の獣脂を市場から買う（[curryingTallow.ts](../../src/extensions/economy/generators/curryingTallow.ts)、[production-generator.ts](../../src/extensions/economy/generators/production-generator.ts)）。
  - 既定2 kgは、皮1枚の革25 kg（[goodMeasureCatalog.ts](../../src/extensions/economy/generators/goodMeasureCatalog.ts)）× 甲革の脂の約16% × 獣脂の半分である。底革は脂が少ないため、甲革の上の方は取らなかった。
- 市場に在庫が無い時や、財布が足りない時は、買える分だけ買い、作るのは止めない（獣脂の無い仕上げ、魚の油だけ）。
- 0で今までの決まり（獣脂を使わない）。

## 4. 釣り合いの見込み（2102、3年目）

長靴97万ロット × 皮2枚 + 革の品80万 = 皮約275万枚 × 2 kg = 約5,500 t、獣脂約5.1万樽。積み上がる約28万樽の約2割である。

## 5. 設定

| 設定 | 既定 | 意味 |
| --- | --- | --- |
| `curryingTallowKgPerHide` | 2 | 皮1枚に擦り込む獣脂のkg。0で使わない |

## 6. 計測の計画

北緯30°の地図2枚、36か月。[household-goods-values-20261112.md](../analytics/household-goods-values-20261112.md)のnewと比べる。獣脂の使い道と在庫、長靴・革の品の作った量（獣脂の代金で減らないか）。

## 7. 未確定事項

1. 中世の、皮1枚あたりの獣脂の量の史料（今の値は今の革の脂の割合から）。
2. 魚の油（鱈の肝油）の品。今は無く、獣脂の半分として数えただけである。
3. 地図の外へ売る出口（[byproduct-history.md](byproduct-history.md) §5の3）。

## 8. 結果

[currying-tallow-20261112.md](../analytics/currying-tallow-20261112.md)。仕上げに獣脂を年約4.6万樽（2102）使い、獣脂の使い道は出た量の約43%から約52%になった。長靴と革の品の作った量は変わらない。獣脂はまだ約半分が積み上がる。
