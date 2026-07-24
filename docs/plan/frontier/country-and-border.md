# 領地の伸展

docs/plan/frontier-expansion.md
phase 2実装後の調整中。

## 問題点

現在の実装ではやたらと遠くまで伸びる細長い領地が出来る。
その細長い領地とroutesが一致しない。領地の伸びに従ってroutesが出来るべき。ただ、現在の領地は点と点を無理やり線で結んだだけ。routesは通過しやすい地形・気候であるべき。
降水量がゼロのCold Desert内に細長い領地を作りながら伸展している国家で出来てしまう。
`phase 1`の`初期 Burg 候補を同じ定住クラスタへ配る Settlement Pattern Module を実装`が原因と思われる。

地図初期化順序の参考資料
docs/map-initialization-process.md

## 解決の為の仮説あるいは手順

1. 川べりに首都を定め、全国民をそこに配置する。或いは複数の都市を川べりに配置する。
2. 1の都市から近くの河川域に入植する。
3. 河川敷から弾き出された場合は、湖(freshwater, frozen)・井戸・森林資源(狩猟と採集)

河川の無い温暖な地域と河川はあるが極寒の地域ではどちらが住み良いか。

### モデルケース

おかしな事になるのはモデル・理想像を設定していないから。以下をモデルにどのようにすべきか検討する。

1. 古代〜中世、国おこし
2. 新大陸発見・略奪

1は均等に弱い小勢力からはじまる。
2は太いパトロンを得た1プラスアルファ。着の身着のままに近い1に対して、開拓の支援がある。
新大陸での砂糖のプランテーション、奴隷貿易。

### 国家

川のあるところから国家が栄える。
都市国家が乱立する、都市の数>=国家の数のような状態が有っても良い。
開拓モードで通常モードと同じ数の国家を配置すると多すぎる気がする。

#### どのように国家の原型が出来るか

複数の村落が出来る。
窮乏した村落では口減らしや人身売買が行われる。
より発展した方、或いは窮乏した方が他の村落を襲撃する。
併合・併呑・侵略・殺戮・略奪・収奪し、拡大を続ける。
或いは緩やかな連帯から代表者を選ぶという事の繰り返し。
代表者同士が親族・金銭その他で庇護関係にあるなど争いへと発展しにくい、闘争になりにくい土壌がある。

### Biomesと国境線

Cold Desert / 砂漠地帯にわざわざ伸びるか？
砂漠地帯に国境に引かれる事は中世ではあったか？例えば現代におけるモンゴルの領地は、古代・中世ではどのように国境線が引かれたか？

河川〜森林資源のある場所に住む。
小規模の開拓村では森林は伐採しないと都市が森に呑まれる。

`src/data/initialSettlementPatterns.ts`

```ts
    id: "frontier",
    label: "開拓前線",
    initialPopulationSaturation: 30,
```

人口30%だと既に河川域全てに拡がりきっており過剰かもしれない。
河川に入植する集団の数を1-3程度に絞れる設定があった方が良いかもしれない。
Generation -> States numberを3に絞ると多くの国家が支配している広い地域と同面積が少ない国家に分配されるだけになる。

国家数を2に絞ると高確率で生成エラーが出る。

```log
main.ts:1021 TypeError: Cannot read properties of undefined (reading 'start')
    at MarkersModule.addBattlefield (markers-generator.ts:970:40)
    at markers-generator.ts:475:9
    at Array.forEach (<anonymous>)
    at MarkersModule.generateTypes (markers-generator.ts:463:17)
    at MarkersModule.generate (markers-generator.ts:56:10)
    at LegacyWorldRuntime.runGeneratePipeline [as worldGenerateHandler] (main.ts:967:11)
    at async LegacyWorldRuntime.executeGenerate (worldRuntime.ts:907:7)
    at async generate (main.ts:1001:20)
    at async main.ts:1623:3
```

---

1. 古代ローマ帝国は拡張の際のどのような場所で他国或いは未開の部族と戦争になったかから国家の拡張の仕方は逆算できるか？
2. 中世ヨーロッパの開拓はどのように行われたか？
3. アメリカ大陸発見後の開拓、その上陸地点はどのような所で、どのように地形で伸展していったか？気候は？(略奪する)資源のある方へ伸びた？

銃と大砲は無しで設計する。が、大砲・技術がもたらす圧倒的な軍事力の差が無ければ侵略は緩やかになる？
