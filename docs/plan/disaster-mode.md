# 災害モード

国家の資本を溶かす動機づけの為の、環境の変化を生み出す。

## 災害の種類

疫病
  発生原因
    戦争があり死体処理が杜撰
    排泄物の処理が杜撰
干魃
大雨
河川の氾濫
野盗
山賊
海賊
火山噴火
冷夏
大雪
ミニ氷河期
  地軸の傾き
    記録の蓄積や天体観測による周期の特定
冷害
山火事
地震
津波
台風
日照不足
環境汚染
  鉱山
害獣
  人に対する脅威
    熊・虎・鰐などの雑食・肉食動物
  作物に対する脅威
    猪・鹿などの草食動物

## 必要なもの・あれば良いもの

### 気候シミュレーション

季節による気温や風向きなどの変化
海流の変化
降雨量の変化

最初は **「気候異常 → 食料不足 → 財政支出・人口被害」** を一本通すのが最も効果的です。既存データと Advance Time の接点が多く、内政投資の必然性も自然に作れます。

現状、`prec`（降水）、年間平均 `temp`、河川流量 `pack.cells.fl`、地形・海岸・バイオーム、季節、日次 Advance Time、食料在庫・国家 treasury・人口コホートはすでにあります。一方で気温・降水は生成時の静的値で、気候異常そのものは未実装です。戦争起因の `foodStress` と餓死・食料生産低下の経路はすでにあるため、気候災害はここへ「別原因の食料ショック」として接続するのがよいです。

| 優先 | 項目 | 既存データとの接続 | 実装容易性 | 経済・食料・人口への影響 | 主な内政 |
| --- | --- | --- | --- | --- | --- |
| 0 | 災害共通基盤 | Advance Time、state、treasury、通知 | 高 | 全災害の土台 | 予兆・進行度・被害・復興 |
| 1 | 干魃・熱波 | `prec`、季節、食料生産、在庫 | 高 | 非常に大 | 灌漑、井戸、穀倉、備蓄買付 |
| 2 | 豪雨・河川氾濫 | `prec`、`cells.fl`、低地、河川 | 中 | 非常に大 | 堤防、排水、河川整備、備蓄 |
| 3 | 冷夏・霜害・大雪 | `temp`、緯度、季節、道路閉鎖 | 高 | 大 | 備蓄、耐寒作物、道路維持 |
| 4 | 疫病 | 人口、都市、交易・戦争状態 | 中 | 非常に大 | 衛生、病院、隔離、検疫 |
| 5 | 山火事 | バイオーム、森林消耗、乾燥 | 中 | 中 | 防火帯、森林管理、消防・復旧 |
| 6 | 野盗・海賊 | 交易路、港、軍事・治安 | 中 | 中 | 巡回、砦、護衛、港湾警備 |
| 7 | 地震・津波・火山 | 地形・海岸のみ。地質根拠なし | 低 | 局地的には極大 | 耐震・避難・港湾復旧 |
| 8 | 鉱害・環境汚染 | 鉱山・生産との明示接続が不足 | 低 | 長期的に大 | 規制、浄水、植林、鉱山安全 |

特に、干魃と洪水は「水」という同じ気候異常から分岐させると実装負担が小さくなります。農業では干魃・洪水とも作付け・収穫・食料安全保障を悪化させるため、歴史的にもゲーム上の因果としても強い組み合わせです。[FAOの農業・食料安全保障への影響整理](https://www.fao.org/climatechange/35703-0215b00a0f8226f7c1a7269921e87471c.pdf)

### 既存の予防・軽減機構の棚卸し（実装前チェック、2026-08-21）

災害を実装する前に、同じ効果を持つ機構が既に存在しないか確認した。結論として、**気候・地質・治安といった「発生源」側は表の通りほぼ未実装だが、食料・水・衛生・治安を下支えする経済インフラは既にかなり厚い**。新規実装は「発災トリガーと被害計算」に絞り、既存カラム・既存モジュールへの接続として設計するのが二重実装を避ける近道になる。

| 災害 | 既存の予防・軽減機構 | 主な参照 | ギャップ |
| --- | --- | --- | --- |
| 干魃 | 灌漑（`irrigationDevelopment`/`irrigationConveyanceEfficiency`/`irrigationDeliveredWater`/`irrigationWaterStress`）が作物適性に直結。3ヶ月分の局所備蓄・救済・輸入網も別途存在。 | [economyContext.ts:549-596](../../src/extensions/economy/economyContext.ts#L549)、[agriculturalLandUse.ts](../../src/extensions/economy/generators/agriculturalLandUse.ts)、[stapleCropInventory.ts](../../src/extensions/economy/generators/stapleCropInventory.ts)、[cellFoodRescue.ts](../../src/extensions/economy/generators/cellFoodRescue.ts)、[foodImportNetwork.ts](../../src/extensions/economy/generators/foodImportNetwork.ts) | ほぼ土台あり |
| 大雨・河川の氾濫 | ダムがダム地点＋下流セルに`floodProtectionRating`を床値で付与。AgTechの「水利事業」が州全体に汎用ボーナスを同じ`floodProtection`カラムへ加算。 | [dams.ts:181-206](../../src/extensions/economy/generators/dams.ts#L181)、[damSites.ts](../../src/extensions/economy/generators/damSites.ts)、[agTechInvestment.ts:167-192](../../src/extensions/economy/generators/agTechInvestment.ts#L167) | **専用の堤防（河川区間ごとの護岸投資）は無い**。さらに `getFloodProtection()` は書き込まれるだけで**読み出し箇所がコード上どこにも無い**（[economyContext.ts:607-613](../../src/extensions/economy/economyContext.ts#L607)）——ダムの洪水防御は現状ゲームプレイに何も影響していない。災害モード実装時に被害計算側から新規に配線する必要がある。→ **実装済み**: [river-levee-and-flood-damage.md](./river-levee-and-flood-damage.md)（Dam型の二層パターンを流用した「Levee」区間インフラ＋`floodProtectionByCell`を農業収穫高に接続する背景ドラッグ。2026-08-21実装） |
| 疫病 | キャラクター単位の疾病モデルに`plague`を含むカタログがあり、`diseasePressure()`が衛生水準で発症圧を減衰。病院の`medicalCare`市民スコア、上下水道・堆肥化制度、河川汚染の伝播/緩和も実装済み。 | [characterHealth.ts:100-238](../../src/extensions/characters/characterHealth.ts#L100)、[hospitalInstallations.ts](../../src/extensions/economy/generators/hospitalInstallations.ts)、[urbanWaterInstitutions.ts:259-348](../../src/extensions/economy/generators/urbanWaterInstitutions.ts#L259)、[urbanWaterTech.ts](../../src/extensions/economy/generators/urbanWaterTech.ts) | 州レベルでの発災トリガー（大規模流行イベント）が無い。→ **実装済み**: [epidemic-cholera-and-water-security.md](./epidemic-cholera-and-water-security.md)（`burg.waterSecurity`を新設して上下水道インフラを専用シグナル化、キャラクター疾病カタログに水質特化ゲートの`cholera`を追加、都市人口への水質駆動の連続的損耗を`demography-simulator.ts`に追加、`disease`死因をPopulation Overviewへ追加。2026-08-21実装） |
| 野盗・山賊・海賊 | 交易路の盗賊リスクと護衛雇用（`BASE_BANDIT_RISK_PER_DAY`）。治安の下地となる `cells.danger` は捕食者由来分も合成済み。 | [tradeSecurity.ts](../../src/extensions/economy/generators/tradeSecurity.ts)、[escortHire.ts](../../src/extensions/economy/generators/escortHire.ts)、[escortRouteThreat.ts](../../src/extensions/economy/generators/escortRouteThreat.ts)、[dangerField.ts](../../src/generators/dangerField.ts)、[biomePredators.ts:198](../../src/generators/biomePredators.ts#L198) | 定住地・都市そのものへの襲撃という災害実体が無い |
| 冷夏・大雪・冷害・ミニ氷河期・日照不足 | 上記の食料備蓄網が間接的に緩和する以外、寒さ特化の対策（暖房燃料・耐寒品種など）は無い。 | ― | `temp`/`prec`が生成時の静的値のまま。気候異常の仕組み自体が無い |
| 山火事 | `forestStock`（木材備蓄）のみ。 | ― | 火災リスク・防火帯に相当する仕組みが無い |
| 地震・津波・火山噴火・台風 | 無し。 | ― | 地質・気象データの根拠から新設が必要 |
| 鉱害・環境汚染 | 都市の有機廃棄物由来の河川汚染は`pollutionExport`/`propagateRiverPollution`/`irrigationPollutionPenalty`でモデル化・緩和済み。 | [urbanWaterInstitutions.ts:259-348](../../src/extensions/economy/generators/urbanWaterInstitutions.ts#L259) | 鉱山発の汚染経路との明示的な接続が無い |
| 害獣（対人） | `cells.danger`（捕食者由来分含む）が既に脅威として存在し、フロンティアの砦投資が軽減する仕組みがある。 | [biomePredators.ts:198](../../src/generators/biomePredators.ts#L198)、[frontierGovernance.ts:155](../../src/generators/frontierGovernance.ts#L155) | 州編入後の定住地には効かない |
| 害獣（対作物） | 猫・犬の「穀倉害獣駆除」需要としての言及のみ。 | [faunaPopulation.ts:120](../../src/extensions/economy/generators/faunaPopulation.ts#L120) | 実際の減収メカニズムが無い |

さらに、[frontierGovernance.ts](../../src/generators/frontierGovernance.ts) には災害モードが目指す形そのもの——**災害種別ごとのリスク計算式が投資水準で減衰し、発災時は緊急対応コストを削る**——という仕組みが `drought` / `flood` / `epidemic` / `bandits` の4種について既に実装されている（[frontierGovernance.ts:176-208](../../src/generators/frontierGovernance.ts#L176)、型定義は [simulationContext.ts:66-69](../../src/context/simulationContext.ts#L66)）。ただし対象は州に編入されていないフロンティア開拓地（outpost/settlement）限定で、既存の州・都市には一切効かない。ここでの`flood`緩和策も堤防ではなく`road`投資（排水路的な位置づけ）になっている。

一から設計するより、この`FrontierDisaster`型・リスク減算パターンを州スコープへ一般化する方針が実装コストと一貫性の両面で有利と考えられる。

ただし既存の `foodStress` は「春秋の戦争による農事妨害」という意味で既に使われています。気候災害で直接これを書き換えると原因が混ざるため、例えば次のように分けるのを勧めます。

```ts
state.foodStress          // 戦争による農事被害（既存）
state.climateFoodStress   // 干魃・洪水・冷害
state.disasterRelief      // 備蓄放出・緊急購入による緩和
```

経済・人口側では最終的な `effectiveFoodStress` を合成して読めば、既存の生産減、価格上昇、飢饉死、収容力への傷跡を再利用できます。

ゲーム設計としては、突発的な即死イベントよりも、EU 系の「条件が見える進行型災害」が合っています。危険因子、毎月／毎季節の進行、発生後の解除条件を公開し、投資で進行を抑える形です。[EU4 の Disaster の進行・解除条件の例](https://gaming.stackexchange.com/questions/204314/is-there-a-way-to-reduce-the-risk-of-a-disaster) や、疫病を国家運営上の大きな脅威として扱う CK3 の方向性が参考になります。[Paradox の CK3: Legends of the Dead 紹介](https://www.paradoxinteractive.com/media/press-releases/press-release/great-deeds-confer-immortality-in-new-crusader-kings-iii-expansion)

おすすめの共通サイクルは以下です。

`平時の脆弱性` → `予兆（小被害・警告）` → `災害進行` → `発災` → `救済・復興` → `恒久的な傷跡または改善`

内政は各災害に「恒久投資」と「緊急支出」を必ず一対で置くと、貯蓄の使い道が明確になります。

| 災害 | 恒久投資 | 緊急支出 |
| --- | --- | --- |
| 干魃 | 灌漑・井戸・穀倉 | 他国からの食料調達・配給 |
| 洪水 | 堤防・排水・河川整備 | 復旧・避難・種籾支給 |
| 冷害 | 穀倉・耐候農法 | 暖房燃料・飢民救済 |
| 疫病 | 衛生・病院・水道 | 隔離・治療・埋葬 |
| 火災 | 防火帯・森林管理 | 消火・再植林 |
| 海賊・野盗 | 砦・巡回・護衛 | 護送・治安作戦 |

記録形式は、現段階では **Markdown の主表** がよいと思います。項目の追加、因果、実装上の依存関係、設計判断を同じ場所に残せるためです。数値バランスの試験に入る段階で、その表を CSV に複写して「頻度・被害率・対策費・期待損失」を比較するのがよい順序です。

`disaster-mode.md` の表には、少なくとも以下の列を置くと次の打ち合わせで決めやすくなります。

`災害 / 分類 / 発生条件 / 使用済みデータ / 予兆 / 発生規模 / 食料 / 経済 / 人口 / 恒久対策 / 緊急対策 / 実装難度 / 優先度 / 未解決点`

最初の実装単位としては、「干魃・洪水を含む気候異常基盤」→「食料・財政・人口への共通影響」→「灌漑・堤防・穀倉・緊急調達」の順が一番きれいです。
