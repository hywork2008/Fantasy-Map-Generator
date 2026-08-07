# Fauna × Biome 妥当性見直し: 調査と計画

`docs/plan/biome-goods-producer-ecosystem.md`（以下「親設計書」）Phase 1〜5実装後に発覚した、野生・家畜動物のバイオーム分布の非現実性についての調査・改修計画。親設計書§10未決定事項1（害獣密度指標の不在）を継承・具体化する。

---

## 0. 決定記録

**2026-08-07 調査開始**: ユーザーから2件の指摘を受けた。(1) 森林セル以外でWildが常に0になる仕様は非現実的——サバンナには独自の生態系があり、非森林セルを一律0にするのはバイオーム設定ごと見直しが必要。(2) 実世界では、人間にとって脅威となる肉食獣（人間に食べられない害獣・猛獣）が多く存在するが、現行モデルは「食料になる狩猟対象（Game）」しか表現していない。(3) Camelは砂漠に生息すべき（確認の結果、これは既にCamels Goodの`biomeOutput`で実装済み——後述2.3）。本書はこれらを起点に、GoodsとBiomesの現状データを調査し、Faunaモデルへの妥当な修正案をまとめる。

**2026-08-07 ユーザー方針決定**: §5の3質問に回答を得た。(1) 実装はPhase A・Cから着手（Phase Bは範囲が大きいため後続）。(2) Phase B（着手時）は案B1（必要牧夫数を土地ベースに再定義）の方向で進める。(3) 害獣・猛獣（Phase D）は今回D1（見送り、既存`biomePredators.ts`の領域のまま）とする。

**2026-08-07 Phase A・C実装完了**: §3のPhase A（Wildのバイオーム対応拡張）とPhase C（データ修正）を実装した。**Phase A**: (1) `faunaPopulation.ts`に`WILD_GAME_DENSITY_PER_HECTARE_BY_TAG`（forest 0.08 / wetland 0.06 / grassland 0.05 / scrub 0.03 / mountain 0.025 / cold 0.02 / dry 0.012 / desert 0.006、非該当タグは`WILD_GAME_DEFAULT_DENSITY_PER_HECTARE`=0.01でフォールバック）を新設し、`getWildCarryingCapacity()`の`isForestCell`一発判定を撤去、`habitability<=0`（氷河・海洋相当）だけを0条件にした。(2) 軽量な適格性判定`hasWildGameHabitat(cellId)`（タグ別面積計算に依存せず、`habitability>0`のみで判定——農村労働配分パス内での牧畜/ブドウ栽培との計算順序循環を避けるため意図的に分離）を新設し、`ruralOccupationAllocation.ts`の狩猟自給枠ゲートを`isForestCell`から差し替えた。(3) `goods-generator.ts`の`Game`Goodの`biomeOutputByTag`を`{ forest: 0.05 }`単独から8タグへ拡張（値は密度テーブルと相対順序を揃えた）——`getBiomesProduction()`はこのレートが正のバイオームでのみGameを生産ループに含めるため、実際の産出量（狩猟者数×固定レート、`GAME_YIELD_PER_HUNTER_PER_MONTH`）自体は変えずに対象バイオームだけを広げる形になっている。`distribution`（マップ生成時のリソースアイコン散布、森林限定のまま）はcosmeticな別系統として意図的に未変更。**Phase C**: `Elephants`に`biomeOutputByTag: { grassland: 0.015, forest: 0.01 }`を新規追加（従来`biomeOutput`/`biomeOutputByTag`のいずれも無く常に産出0だったバグを修正）。`Camels`の`biomeOutput: { 1: 0.05, 2: 0.05 }`（数値バイオームコード直指定）を`biomeOutputByTag: { desert: 0.05, dry: 0.03 }`（タグベース）へ移行——他のliveAnimal種と同じ参照方式に揃え、カスタム/将来バイオームにも追従するようにした。**既存テストの回帰対応**: `ruralOccupationAllocation.test.ts`の3件（Grapes/Fish系）は、非森林バイオームでも狩猟固定枠（3人）が最初に労働力を取るようになったことで期待値がずれたため、狩猟枠を差し引いた後の残余予算で再計算した（AGENTS.md §5.1の想定どおりの回帰）。`faunaPopulation.test.ts`の`getWildCarryingCapacity`系は「非森林セルは0」というテスト意図自体が新仕様と矛盾するため、「タグ非該当はデフォルト密度にフォールバック」「habitability 0のみ0」という新しい期待値に書き換え、`hasWildGameHabitat`の新規テストを追加した。新規/更新テストを含む economy拡張全体920件が全てgreen、`tsc --noEmit`（テストファイル込み確認）/`lint`/`madge --circular`もすべてクリーン。

**2026-08-07 Phase B（案B1）実装完了**: ユーザーから「牛・山羊・羊が出てこないのに森林に象が出る、チーズや羊毛が流通しない」という実プレイ報告を受け、急遽Phase Bに着手した（§2.4で発見済みだった、グレイズド種の労働力ゲートが月次フロー量を常設頭数扱いしていた単位不整合の是正）。`husbandry.ts`の`calculateHusbandryDemand()`の`requiredWorkers`計算を、`rawDemand(=population×biomeOutputByTag、月次フロー) / effectiveHeadsPerHerder`から、`landCapacity(=desiredArea×stockingDensity、常設ストック) / effectiveHeadsPerHerder`へ再定義した。`desiredArea`（新設`calculateDesiredPastureAreaHectares()`）は、`viticulture.ts`の`calculateDesiredVineyardAreaHectares()`と全く同じ「土地上限を人口比例のデシレッドエリア（`HUSBANDRY_LAND_AREA_PER_POPULATION_POINT`=1 ha/人口点、仮置き）でクランプする」パターンを踏襲——親設計書§10未決定事項6が記録しているとおり、ブドウ栽培が同じ問題（人口の少ない好適地セルが土地上限だけで非現実的に巨大な労働力需要を要求する）に先に遭遇し解決済みだった前例をそのまま流用した。`getPastureAreaUsedHectares()`もこの`desiredArea`を使うよう統一。

**副産物としての簡略化**: `requiredWorkers`を土地ベースに揃えた結果、前回セッションで追加した第2の労働力ベース頭数キャップ（`getGrazedLaborCapacityHeads`、`min()`で土地ベース容量と合成）が、あらゆる充足率で土地ベース容量と**代数的に完全一致**することが判明した（`effectiveHeadsPerHerder`が比の計算から相殺されるため）——つまり前回追加した第2キャップは死重となり撤去し、`getGrazedCarryingCapacity()`を単一の土地ベース項（`pastureAreaUsed × stockingDensity`）に戻した。撤去にあたり、当該種がこのバイオームで正のレートを持つかのチェックを新規追加した（`pastureAreaUsed`はセル単位の集計値で、他の共存種の需要だけでも正になりうるため、レートを持たない種が誤って非ゼロ容量を返す既存の潜在的な抜け穴を塞いだ）。

**既存テストの回帰対応**: `husbandry.test.ts`の`calculateHusbandryDemand`/`getPastureAreaUsedHectares`/`getGrazedCarryingCapacity`系テストを、新しい土地ベース数式・人口バウンドの期待値に全面的に書き換えた。「小さい人口が土地上限いっぱいの群れを持てないこと」「フル充足時は土地ベース項と一致すること」「充足率に比例して線形に縮小すること」「該当バイオームでレートを持たない種は他種の需要があっても0のままであること」を新規/更新テストで検証。economy拡張全体922件が全てgreen、`tsc --noEmit`/`lint`/`madge --circular`もすべてクリーン。

**2026-08-07 Phase B後続バグ2件を実プレイ検証で発見・修正**: ユーザーから「Phase B適用後もCattle/Sheep/Goats/Horses/Camelsが相変わらず出てこない、森林にElephantsだけ出る」との再報告を受け、Playwright経由で実際にマップを生成・`Advance Time`して`window.fmg.simulation.extensions.economy`（`husbandryRequiredWorkers`/`husbandryWorkers`/`faunaStock`等）を直接検証した。**バグ1（単位不整合）**: `calculateDesiredPastureAreaHectares()`が`world.pack.cells.pop[cellId]`を"人口ポイント"のまま（`populationRate`で実人数へ換算せず）`HUSBANDRY_LAND_AREA_PER_POPULATION_POINT`に掛けていた——実マップでは`cells.pop`は1セルあたり中央値1.6程度（`populationRate`が1000なら実人口1,600人相当）と極小の値のため、`desiredArea`が常に数haという無意味に小さい値になり、あらゆるグレイズド種の容量が実質0に丸め込まれていた。`agriculturalLandUse.ts`の`currentPeople = cells.pop[cellId] * populationRate`と同じ実人口換算を追加して修正（定数名も`HUSBANDRY_LAND_AREA_PER_POPULATION_POINT`→`HUSBANDRY_LAND_HECTARES_PER_PERSON`に変更、値はいったん1のまま維持）。**既知の関連問題（今回は未修正）**: `viticulture.ts`の`VINEYARD_AREA_PER_POPULATION_POINT`も同じ`cells.pop`直接参照パターンを持ち、同種の過小スケールバグを抱えている可能性が高い——Grapes/Wineのスコープは今回のCattle/Sheep/Goats/Horses/Camelsの範囲外のため未修正、要フォローアップ。**バグ2（生成順序）**: `index.tsx`の初期生成シーケンスが`DevelopmentPotential.generate()`（内部で`calculateHusbandryDemand()`/`calculateViticultureDemand()`が`getGoods()`を参照する）を`Goods.generate()`より**先に**呼んでいたため、マップ新規生成直後は`getGoods()`が空でグレイズド種もGrapesも一切見つからず、`husbandryRequiredWorkers`/`viticultureRequiredWorkers`が地図全体で0になっていた——`updateAnnualAgriculture()`が最初の`Advance Time`で再実行されるまで自己修復しない、という体感上「絶対に出てこない」ように見えるバグだった。3箇所の呼び出し順序（メイン生成パス、拡張有効化時のフォールバック生成パス、`regenerate economy`コマンド）を`Goods.generate()`→`DevelopmentPotential.generate()`の順に修正。両修正後、Playwrightでの実地検証により、マップ新規生成直後（Advance Time不要）でもCattle/Sheep/Horsesの`faunaStock`に妥当な頭数が現れることを確認した。economy拡張全体922件green、tsc/lint/madgeクリーン。

**2026-08-07 新たに発見した、より根深い別問題（今回は未着手）**: 上記2件の修正後もなお、実マップの大半のセルで`husbandryWorkers`が0のままだった。原因を追ったところ、`agriculturalLandUse.ts`の農地労働力計算が、実人口が数千〜数万人のセルであっても`migratableAdults`（農業以外に回せる余剰労働力）をわずか数人程度にしか算出しておらず（検証した2枚のマップで最大値がそれぞれ約11人・約5.8人——地図全体でこれが上限）、そのわずかな余剰のほぼ全てを狩猟の最低枠（`HUNTING_MINIMUM_HEADCOUNT`=3、Phase Aで全バイオームに拡張済み）が先に消費してしまうため、牧畜・漁業・ブドウ栽培に回る労働力がほぼ地図全域で恒常的に枯渇している。これは今回のFauna修正群とは独立した`agriculturalLandUse.ts`（Phase 1、農地面積/収穫量/労働日数の基礎定数群）側の較正問題である可能性が高く、Wine/Fish/Cheese/Woolを含む二次産業全般が地図の大半で常に労働力不足になる——ユーザーが当初から指摘していた「商業・加工業が潰れそう」という体感の、より根本的な原因はこちらである可能性が高い。スコープが今回のFauna/Biome調査を超えるため、別途調査・計画が必要（本書の追跡対象外、新規ドキュメントでの調査を推奨）。

**Phase D（D1で見送り）のみ引き続き未着手。**

---

## 1. スコープと既存システムとの関係

### 1.1 対象

`src/extensions/economy/generators/faunaPopulation.ts`（Fauna個体群ストック）・`husbandry.ts`（家畜キャリング容量）・`ruralOccupationAllocation.ts`（狩猟/牧畜労働配分）・`goods-generator.ts`（Goodsカタログのバイオーム紐付け）・`src/data/biomeCatalog.ts`（バイオームタグ）。いずれも economy 拡張が所有する、Goods/Marketと連動した「取引可能な動物資源」モデル。

### 1.2 非対象（隣接する既存システム）

調査の過程で、**host側（economy拡張の外）に既に別系統の「危険な野生動物」モデルが存在する**ことを確認した：

- `src/generators/biomePredators.ts`（`docs/plan/wild-oikoumene-frontier.md`）: forest/mountainタグのセルに「捕食者による危険度」を`cells.danger`へ加算する。Goodsや個体数とは無関係の、フロンティア拡張抑制・脅威討伐システム向けの抽象スカラー値。
- `src/generators/threatCullHire.ts`/`cullPractice.ts`（`docs/plan/player-threat-cull-jobs.md`）: named Characterが個別の脅威を討伐する別系統の仕組み。

親設計書§5.1は「狩猟自給枠と害獣密度指標の接続は将来の拡張候補だが本設計のスコープ外」と明記しており、§10未決定事項1も「`threatCullHire.ts`/`cullPractice.ts`の脅威イベント頻度との関連付けが有力候補だが未検討」としている。**この2つのシステムを統合・再発明することは本書のスコープに含めない。** ユーザー指摘(2)の「人間に食べられない害獣・猛獣」は、経済シミュレーション（Goods/Market）側で新たに表現すべきか、既存の`cells.danger`系に委ねるべきか自体が論点であり、§4で選択肢を提示する。

---

## 2. 現状調査

### 2.1 バイオームタグの現状（`src/types/biome.ts`, `src/data/biomeCatalog.ts`）

利用可能な`BiomeTag`: `marine, forest, wetland, mountain, coastal, dry, cold, desert, grassland, scrub, snow, arable, nomadic`。

ユーザーが名指ししたSavannaのタグ構成（`STANDARD_BIOME_DEFINITIONS`）:

```text
D("savanna", "Savanna", ..., ["dry", "grassland", "arable", "nomadic"])
```

`forest`タグを持たない。他の非森林バイオームも同様: `grassland`（`grassland, arable, nomadic`）、`hotDesert`/`coldDesert`（`dry, desert, nomadic`/`dry, desert, cold, nomadic`）、`tundra`（`cold`のみ）、`coldSteppe`（`grassland, dry, nomadic`）、`xericShrubland`（`dry, scrub, nomadic`）。`STANDARD_BIOME_DEFINITIONS`は27種の標準バイオームを持ち、うち`forest`タグ保有は10種のみ——残り17種（サバンナ、草原、砂漠2種、ツンドラ、氷河、湿原、ステップ等）はWildが恒常的に0になる。

### 2.2 Wild（Game）がforest限定になっている3箇所

現行実装は、以下の**3箇所すべて**が独立にforestタグをハードコードしており、いずれか1つを直しても残りが効いて0のままになる:

1. **Goodsカタログ**（`goods-generator.ts:272-284`）: `Game`の`biomeOutputByTag: { forest: 0.05 }`。forest以外は`resolveBiomeOutputRate()`が0を返す。
2. **狩猟労働配分**（`ruralOccupationAllocation.ts:200-203`）:

   ```ts
   const isForestCell = (world.biomesData.tags?.[biomeCode] ?? []).includes("forest");
   const hunting = isForestCell ? getHuntingSubsistenceClaim(budget) : 0;
   ```

   forest以外は狩猟者自体が0人に固定される（Gameのレートが仮に非0でも、労働力がないため産出0）。
3. **Fauna個体群キャリング容量**（`faunaPopulation.ts:152-168`、`getWildCarryingCapacity`）:

   ```ts
   const isForestCell = (world.biomesData.tags?.[biomeCode] ?? []).includes("forest");
   if (!isForestCell) return 0;
   ```

   forest以外はストック自体のキャリング容量が0——CellInfoの「Wild 0」の直接原因。

親設計書§4.2は本来「`carryingCapacity = biomeBaseDensity(biome) × wildHabitatArea`」と**バイオームごとに密度が変わる関数**を想定していたが、実装は密度関数を作らず「forest以外は密度0（＝容量0）」という一点だけのハードコードに単純化された。§5.1も「対象: `biomeTag("forest")`セル（現行`Game`の`distribution`と同じ判定を流用）」と明記しており、これはPhase 1着手時点で**意図的な絞り込み**だった——upstream由来の`Game`Good自体が元々forest限定の分布ルールだったため、それをそのまま流用した経緯であり、実装バグではなく設計判断の射程が狭すぎた、というのが正確な評価。

### 2.3 家畜（liveAnimal）種のバイオーム紐付け一覧

`goods-generator.ts`から抽出した現状（`biomeOutputByTag`＝タグベース、`biomeOutput`＝数値バイオームコード直指定）:

| 種 | tags | バイオーム紐付け | 備考 |
| :--- | :--- | :--- | :--- |
| Cattle | food, draft, liveAnimal | `{ grassland: 0.1, nomadic: 0.08 }` | 妥当 |
| Horses | supply, military, draft, liveAnimal | `{ nomadic: 0.06, grassland: 0.05 }` | 妥当 |
| Sheep | clothing, liveAnimal | `{ grassland: 0.1, scrub: 0.08 }` | 妥当 |
| Goats | food, clothing, supply, liveAnimal | `{ scrub: 0.1, mountain: 0.08, dry: 0.06 }` | 妥当 |
| **Camels** | supply, military, liveAnimal | `biomeOutput: { 1: 0.05, 2: 0.05 }`（数値コード1=hotDesert, 2=coldDesert） | **既に砂漠限定で実装済み**——ユーザー指摘(3)は現状の仕様と一致している。ただし数値コード直指定のため、後述2.4のとおりカスタム/将来バイオームに追従しない |
| **Elephants** | supply, military, liveAnimal | **なし**（`biomeOutput`も`biomeOutputByTag`も未設定） | `resolveBiomeOutputRate()`は常に0を返す——Elephantsは**どのバイオームでも継続生産されない**、Phase 2以前からの既存バグ。`distribution: "biome(1, 3, 5, 7)"`はマップ生成時の初期配置スキャッター判定のみで、経済生産レートとは別系統 |
| Pig | food, liveAnimal | `{ forest: 0.08, arable: 0.05 }` | 妥当 |
| Chicken | food, liveAnimal | `{ arable: 0.04, grassland: 0.03 }` | 妥当 |
| Cats | liveAnimal, pestControl | `{ arable: 0.005, grassland: 0.003 }` | 妥当（非食用、低レート） |
| Dogs | liveAnimal, herding | `{ grassland: 0.02, nomadic: 0.02, scrub: 0.015, mountain: 0.01 }` | 妥当 |

**発見1（新規バグ）**: Elephantsは`biomeOutput`/`biomeOutputByTag`のいずれも持たず、恒常的に生産量0——Fauna個体群にも一切登録されない死んだGoodになっている。§3.3で修正案を出す。

**発見2**: Camelsは数値バイオームコード（`1`, `2`）直指定——`STANDARD_BIOME_DEFINITIONS`の配列順序に依存する脆い参照方式で、他の全種が使う`biomeOutputByTag`（タグベース）から外れている。カスタムバイオームカタログや将来のPhase 5追加バイオーム（`tropicalDryForest`等、`dry`タグ持ちだが`desert`タグなし）には一切対応しない。タグベース（`desert`または`dry`）へ移行すべき。

### 2.4 家畜キャリング容量の労働力ゲート — 今回のセッションで発見した新規の設計上の欠陥

前ターンで「342人口のセルがCattle 21708頭を保有」というバグを修正する過程で、`husbandry.ts`の`calculateHusbandryDemand()`が算出する`requiredWorkers`（必要牧夫数）に、**単位が噛み合わない構造的欠陥**があることが判明した:

```text
requiredWorkers_g = rawDemand_g / effectiveHeadsPerHerder_g
  rawDemand_g = population × biomeOutputByTag（= 1ヶ月あたりのフロー量、頭/月）
  effectiveHeadsPerHerder_g = 60〜2000（= 1牧夫が管理できる「常設の群れ規模」、頭）
```

`rawDemand`（月次フロー）を`effectiveHeadsPerHerder`（常設ストック規模）で割ると、次元が噛み合わないまま「必要牧夫数」を導出してしまう——本来は「毎月の産出フローを支えるための労働力」であって「常設の群れサイズ」を意味しないが、この`requiredWorkers`を使って労働力充足率（`getHusbandryWorkerFactor`）を計算し、それが牧草地利用面積（`pastureAreaUsed`）のゲートに使われている。

**実際に起きること**: `rawDemand`（例: 人口342×レート0.1＝34.2）を`effectiveHeadsPerHerder`（Cattle 60）で割ると`requiredWorkers`はわずか0.57人——**ほぼどんな人口でも、牧夫1人未満の「必要労働力」を割り当てるだけで充足率100%に到達する**。充足率が100%になった瞬間、`pastureAreaUsed`（牧草地利用面積）は上限係数に張り付き、そのセルの牧草適地**全域**が「利用中」として解放される——これが前ターンの「342人口が21708頭を保有」の直接原因だった。

前ターンでは「実際に割り当てられている牧夫数×1牧夫あたり頭数」という**第2の頭数上限**を追加してこれを塞いだが、その労働力キャップ式も同じ`requiredWorkers`を分母に使う限り、代数的に「フル充足時の頭数上限＝rawDemand（月次フロー量そのもの）」に収束してしまう——非グレイズド種（Pig/Chicken）が使う「フラットレート×24ヶ月分」というストック換算の掛け目が、グレイズド種の労働力キャップには存在しないため、**グレイズド種の頭数上限は非グレイズド種よりおよそ24倍小さくなる**（具体例: 人口342、Cattle rawDemand=34.2 → 労働力キャップも34.2頭程度。同じ人口でPigのrawDemand=17.1なら容量は17.1×24=410頭）。これが今回ユーザーが報告した「ドメスティケートはPig・Chickenばかりになる」症状の直接原因。

根本原因は`calculateHusbandryDemand`の`requiredWorkers`が「今月の産出フローを処理するのに必要な労働力」という設計意図（親設計書§5.4の「生（労働力ゲート前）需要量を...実効許容頭数で割って合算する」）のまま据え置かれ、**「土地が支えられる常設の群れ規模を世話するのに必要な労働力」には一度も再定義されていない**ことにある。前者の意味では「牧夫はほぼ常に足りている」で正しいが、後者の意味を暗黙に要求する牧草地ゲート（§5.4の「人手不足のセルは牧草地上限まで到達しない」という設計意図）には小さすぎる分母を使っていることになる。

### 2.5 隣接する既存の「危険な野生動物」システム（§1.2で触れた`biomePredators.ts`）

参考までに、こちらも forest/mountain 限定である（`if (!forest && !mountain && !highland) return 0;`）——ユーザーの「サバンナにも独自の生態系がある」という指摘は、economy拡張のFaunaモデルだけでなく、host側のこの隣接システムにも同様に当てはまる。ただし前述のとおり、このシステムの改修は本書のスコープ外とし、§4.3で軽い連携案のみ提示する。

---

## 3. 修正方針（フェーズ案）

### Phase A: Wild（Game）のバイオーム対応を forest限定 → タグ別密度テーブルへ拡張

`husbandry.ts`の`PASTURE_BIOME_TAG_CEILING`（バイオームタグ別の土地適性係数テーブル）と同型のパターンを踏襲する。

1. **Goodsカタログ**（`goods-generator.ts`）: `Game`の`biomeOutputByTag`を`{ forest: 0.05 }`単独から、`grassland`/`savanna`相当（`grassland`タグ）・`desert`（`dry`/`desert`タグ、低め）・`wetland`（`wetland`タグ）等を含む複数エントリへ拡張する。`resolveBiomeOutputRate()`は複数タグ一致時に最大値を採用する既存挙動をそのまま使える。
2. **狩猟労働配分**（`ruralOccupationAllocation.ts`）: `isForestCell`の単一判定を、`biomeOutputByTag`が拡張された`Game`のレートが正であるかどうか（＝そのバイオームで実際にGameが取れるか）に置き換える。ハードコードされたタグ判定を保持するのではなく、Goodsカタログのレート定義を単一の真実源にする。
3. **Fauna個体群キャリング容量**（`faunaPopulation.ts`の`getWildCarryingCapacity`）: `isForestCell`一発判定を、`WILD_GAME_DENSITY_BY_TAG`（`PASTURE_BIOME_TAG_CEILING`と同型のタグ別密度テーブル、非該当タグは低めのデフォルト密度）に置き換える。密度は史料的裏付けのない概算（§9.3方針を踏襲、相対順序のみ意識——森林・サバンナは高密度、砂漠・ツンドラは低密度、湿原は中程度等）。

この3箇所を**同じGoodsカタログのレート定義から導出する**ように揃えることで、以後「Gameのバイオーム対応を広げたのに労働配分だけ追従していない」といった再発を構造的に防ぐ。

### Phase B: 家畜キャリング容量の労働力ゲートを再設計（§2.4の是正）

現行の「フロー量ベースの`requiredWorkers`」と「前ターンで追加した労働力キャップ」の二重構造を整理する。有力な方向性（要ユーザー確認、§5参照）:

- **案B1**: `calculateHusbandryDemand`の`requiredWorkers`を、フロー量ベースではなく**土地キャリング容量ベース**（`landCapacity_g / effectiveHeadsPerHerder_g`）へ再定義する。これにより「充足率100%＝土地が支えられる群れを世話しきれる労働力がある」という、親設計書が本来意図していた意味に整合し、前ターンに追加した第2の労働力キャップ（`getGrazedLaborCapacityHeads`）は不要になる（土地ゲート単独で十分に機能するようになるため撤去できる）。**ただし**、これは`requiredWorkers`が現状よりずっと大きくなることを意味し、農村労働配分器（§3.1の貪欲配分）における牧畜の優先順位・実際に割り当てられる労働力の総量が大きく変わる——他産業（漁業・ブドウ栽培）との労働力の奪い合いバランスの再校正が必要。
- **案B2**: `requiredWorkers`（フロー量ベース、労働配分の優先順位付け用）と、頭数ゲート専用の別指標（土地ベース）を明確に分離し、前ターンの労働力キャップは撤去して土地ゲートのみに戻す（実質的に前ターンの変更を巻き戻し、Phase Aの密度拡張と合わせて森林一辺倒でなくなったことで既に体感が変わることを期待する案）。

### Phase C: データ修正（小粒、独立に着手可能）

1. **Elephants**（§2.3発見1）: `biomeOutputByTag`または`biomeOutput`を追加——象が生息しうるバイオーム（熱帯雨林・サバンナ相当のタグ）を割り当てる。史料的正確性より「現状ゼロ産出という明白なバグを直す」ことを優先し、値は仮置き。
2. **Camels**（§2.3発見2）: 数値`biomeOutput: {1, 2}`を、タグベース`biomeOutputByTag: { desert: X, dry: Y }`へ移行し、カスタム/将来バイオームにも追従するようにする。

### Phase D（要確認・大きめ）: 「人間に食べられない害獣・猛獣」の扱い

ユーザー指摘(2)への対応。3つの選択肢を提示する（詳細は§5の質問参照）:

- **D1（最小）**: 何もしない。既存の`biomePredators.ts`（host側`cells.danger`）が担っている領域とみなし、economy拡張はGoods/Marketに乗る「取引可能な動物資源」だけを扱う——今回はPhase A〜Cのみ実施。
- **D2（軽量連携）**: economy拡張のCellInfoに、`biomePredators.ts`が計算する`cells.danger`由来の値を「Predator pressure」のような読み取り専用の表示行として追加する（新規Good・新規個体群ストックは増やさない、フレーバー情報の橋渡しのみ）。
- **D3（本格導入）**: economy拡張のFaunaモデル内に、`Game`とは別の非食用「害獣」個体群（例: 大型ネコ科・イヌ科）を新設し、家畜の間引き（捕食による損耗）や狩猟自給枠の増減（親設計書§10未決定事項1が既に示唆していた拡張）に接続する。GoodsカタログにShop対象外の「非交易種」概念を新設する必要があり、スコープが大きい。

---

## 4. Phase Aの想定インパクト

- Wild（Game）が森林以外（サバンナ・草原・砂漠・湿原等、全27標準バイオーム中17種）でも0でなくなる——CellInfoの「Wildが0の地域が大半」という現状が解消される。
- Gameの総産出量（市場供給量）はバイオーム別の密度次第で変化するため、既存セーブでは食料需給バランスが動きうる——親設計書§7「産出の急変を避ける」の既存注意書きと同様の校正作業が必要。

## 5. ユーザーへの確認事項

1. **Phase B（案B1 or B2）**: 家畜の労働力ゲートを「土地ベースの必要牧夫数」へ本格的に再定義する（B1、農村労働配分の優先順位バランスに波及）か、前ターンに追加した労働力キャップを撤去して土地ゲート単独に戻す（B2、変更を小さく保つ）か。
2. **Phase D（害獣・猛獣の扱い）**: 今回は見送り(D1)/host側のdanger値を読み取り表示するだけ(D2)/economy拡張内に本格的な非食用害獣モデルを新設する(D3)、のどれを希望するか。D3を選ぶ場合は別途スコープを切って設計する。
3. **Phase A・Cの密度/レート数値**: 史料的裏付けのない概算になる前提（§9.3方針）で進めてよいか、それとも牧畜の牧羊犬調査（`docs/temp/herding-dogs.md`）のように特定の数値だけ史料照会が必要な種類・バイオームがあるか。

---

## 6. 未決定事項・保留

- Phase Dで新設する可能性のある「非食用害獣」概念は、`liveAnimal`タグの家畜と同じFauna個体群ストック構造を共有できるかもしれないが、Goods/Marketに一切乗らない「取引不可の野生種」を`goods-generator.ts`のカタログにどう位置づけるかは未検討。
- Phase Bで`requiredWorkers`の意味を変更した場合、農村労働配分器（§3.1）における漁業・ブドウ栽培との相対優先順位が動く可能性があり、既存の`ruralOccupationAllocation.test.ts`の期待値も広範囲に見直しが必要になる見込み——実装フェーズで規模を再評価する。
