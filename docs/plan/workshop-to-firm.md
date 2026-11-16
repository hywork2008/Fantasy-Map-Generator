# 工房から企業へ（経済主体の移行）

## 状態

**設計案（未実装）**。この文書は台帳と昇格の決定である。生産量、交易の決済、技術グラフの段階条件は変えない。コードはこの文書だけでは変えない。

ここでいう経済主体は、地図の中で資本と知識を持って産出と取引の名義を持つ組織である。操作する人（FMGのプレイヤー）の台帳とは別である。

中世の開始では、国家と都市が経済主体に見える。組織と敷地と都市がほぼ一つに重なるためである。近代では国家と企業が経済主体であり、都市は敷地、労働、港、税、地元需要を持つ背景である。輸出の意思決定は企業が持つ。都市はその合計を表示する。

工房へ商会と金貸しの属性を足す方法は、中世の家業を表すところまで有効である。近代の企業には、工房から切り離した組織の記録が要る。

関連:

- [商会](./corporation.md): `MerchantOrganization` の人員編成。本設計はこれを企業に吸収しない。
- [ギルドの親方を工房の稼ぎで置く](./guild-master-workshop.md): 家業の候補は、親方の席と同じ儲けの条件を見る。
- [知識・技術蓄積システム](./knowledge-guild-system.md): 共通知識は `GuildKnowledgeStock` に残す。
- [蒸気機関の知識・技術蓄積](./steam-engine-knowledge-accumulation.md): そこが後続とした企業と特許の台帳が本設計である。複数都市の研究機関は引き続き後続。
- [多層会計](./multi-ledger-fiscal-architecture.md): 金貸しシンジケートは国家信用のまま残す。
- 技術ノードは `src/generators/technologyDefinitions.ts`。段階の読み取りは `isTechnologyAtLeast`（`src/generators/technologyProgress.ts`）。

## 1. 決定

| ID | 決定 |
| --- | --- |
| D1 | 企業は経済スライスの新しい記録 `Firm` である。工房の属性フラグではない。 |
| D2 | `MerchantOrganization` は市場あたり一つ、のまま残す。企業はそれを参照できる。 |
| D3 | 金貸しは首都市場のシンジケートのままである。家業の必須属性にしない。工房を持たない金融企業は範囲外。 |
| D4 | 知識は写す。ギルドの在庫は減らさない。 |
| D5 | 技術段階の範囲は国家のまま。火薬術など国家機密は企業へ写さない。 |
| D6 | 新しい金は生まない。ギルド金庫からの付け替えは式だけ決め、計測まで無効。 |
| D7 | `marketTreasury.tradeWorkingCapital` は商会に残す。企業は交易の第二の現金台帳にしない。 |
| D8 | 年次の昇格と、開始時の系譜の書き戻しは、同じ `Firm` を書く。 |
| D9 | 書き戻しの条件は開始時の Historical period である。実在地形かどうかでは分岐しない。 |
| D10 | 新しい Good は作らない。自動車のような完成品は範囲外。 |
| D11 | City Editor は敷地を描く。企業は描かない。 |
| D12 | 年次経路では、一つの都市から一年に新しい企業は一つ。一つの企業の段階は一年に一段。 |
| D13 | 名前は生成する。実在の社名は説明用の例であり、生成表には入れない。 |
| D14 | 特許は記録する。他国への敷地は作らない。 |
| D15 | 本設計の実装が産出量と交易決済を変えるのは、別の計測のあとである。それまで産出は不変。 |

## 2. 目標と非目標

### 2.1 目標

- 中世の家業から、複数都市に工場を持つ企業まで、一つの記録で表す。
- 年を進めた地図と、近代から始めた地図が、同じ記録を読む。
- 都市に残るもの（労働、土地、港、税、共通知識、地元需要）と、企業に移る名義（勘定、専有知識、拠点の一覧、輸出の品目群）を分ける。
- 既存の商会、ギルド、金貸し、国家技術を置き換えない。

### 2.2 非目標

- 自動車、会社法、証券取引所、株主名簿、有限責任の新しい技術ノード。
- 金貸しだけの銀行企業。シンジケートの置換。
- ギルドの廃止、都市金庫の廃止、商会の取引距離規則の変更。
- 国家技術の主体を国家から企業へ移すこと。
- 他国の支店、独占価格、特許料。
- 造船所の所有者（`state` / `market`）の変更。
- City Editor の工場地区。`BurgSiteEconomy` へ企業 ID を足すこと。
- 本設計の初回実装での産出倍率と交易決済の変更。

## 3. 三つの層

| 層 | 既存の実体 | 本設計での位置 |
| --- | --- | --- |
| 敷地 | Burg の生産、`GuildKnowledgeStock`、`ExperimentalWorkshop`、親方の `workshopMargin` | `FirmSite` が `burgId` と職域を指す。建物と人は都市に残る |
| 組織 | 市場ごとの `MerchantOrganization`。金貸しは `resolveMoneylenderSyndicate` | 商会とシンジケートは残す。企業は別記録で、商会 ID と出資元を参照できる |
| 管轄 | State の技術段階（`scope: "state"`）、Burg の金庫、ギルドの共通知識 | 国家は技術段階と軍事知識を持ち続ける。都市は共通知識と基盤を持ち続ける |

`MerchantOrganization` は交易の到達と人員を持つ。生産拠点と知識在庫は持たない。`TradeCargo` は金属と高額のフラグだけで、品目の内訳を持たない。企業の職域は、交易貨物ではなく、その都市のギルド知識と工房の儲けから決める。

## 4. 段階

工房は `Firm` の段階ではない。`Firm` が無い状態が工房の時代である。

```text
（Firm なし）工房
  → house          commercialFinance が adopted 以上
  → chartered      overseasTradingPosts が adopted 以上
  → manufactory    factoryOrganization が adopted 以上
  → firm           rotarySteamPower または modernSteelmaking が adopted 以上
```

判定は `isTechnologyAtLeast(technologyId, stateId, "adopted")`。開始時代より前のノードは `diffused` で種まきされ、adopted 以上なので条件を満たす。開始時代のノードは `demonstrated` であり、条件を満たさない。

年次経路は、到達している技術のうち次の一段だけを一年に進める。`overseasTradingPosts` が未到達のときだけ、特許を飛ばして工場制に進んでよい。到達している特許を、工場制と同じ年にまとめて通過させることはしない。書き戻しは、種まき済みの技術が許す最高段階までを、過去の年号付きで一度に書いてよい。

### 4.1 家業（`house`）

次をすべて満たす都市と職域に作る。

- その都市の国家で `commercialFinance` が adopted 以上。
- その都市に、その職域の `GuildKnowledgeStock` があり、`stock > 0`。
- 親方を置くときと同じ儲けの条件を満たす。平らにした儲け `marginAverage` × `guildMasterWorkshopShare` が親方の月の生活費以上。席の置き方が `legacy` でも、この儲けの条件で見る。席の有無だけでは決めない。
- 同じ都市・同じ職域を創業敷地に持つ `Firm` が無い。

一つの都市から一年に作る企業は一つである。候補が複数なら、`marginAverage` が大きい職域を採る。同点なら `stock` が大きい職域を採る。

由来は `merchant-house`。本拠は都市。`homeMarketId` はその都市を中心にする市場。`merchantOrganizationId` はその市場の商会。一つの商会を、職域の違う複数の企業が参照してよい。

### 4.2 特許（`chartered`）

`house` であり、国家で `overseasTradingPosts` が adopted 以上のとき、翌年以降に `chartered` にする。

特許の中身は「本拠の外に敷地を持ってよい」という記録である。品目の独占にはしない。`monopoly` は常に `false` とし、価格にも交易にも効かせない。他国の敷地は作らない（D14）。国内の別都市への工場は、特許ではなく `firm` 段階の条件で開く。

### 4.3 工場制（`manufactory`）

国家で `factoryOrganization` が adopted 以上でも、その年の次の一段が特許なら、その年は `chartered` で止める。特許の次の年以降に `manufactory` にする。`overseasTradingPosts` が未到達のときだけ、`house` の次の一段を `manufactory` にしてよい。特許の記録は、そのノードが adopted 以上の年にだけ付ける。

`factoryOrganization` の採用条件（織物 0.42、冶金 0.32、都市人口 38、金庫 230、行政 0.42）は国家側の門である。企業側では、本拠の主要職域の `stock` が、同じ国家でその職域の在庫を持つ都市の中央値以上であることを追加する。在庫を持つ都市が 3 未満のときは、この中央値の条件を外す。

この段階の追加敷地は本拠都市の中だけであり、種類は `workshop` である。新しい建物は生まない。同じ職域の既存の生産が、一つの勘定を参照するようになる、という記録である。

### 4.4 企業（`firm`）

`manufactory` であり、国家で `rotarySteamPower` または `modernSteelmaking` が adopted 以上のとき、`firm` にする。

この段階で、同じ国家の他の都市に工場を一つまで開いてよい。開く都市は次を満たすものの、主要職域の `stock` が最大の都市である。

- その企業の敷地がまだ無い。
- 主要職域の `GuildKnowledgeStock.stock > 0`。
- 本拠とは別の Burg であり、同じ国家に属する。

工場の種類は `plant`。一年に一つの企業は一つの工場まで。労働する人は都市の人口のままである。企業は人口を移動させない。

### 4.5 機械の輸出

`firm` であり、主要職域が `metallurgy` であり、国家で `standardMachineWorks` が adopted 以上のとき、品目群を `machinery` にする。それ以外の品目群は `craft` である。

`machinery` が指す Good は、既存の Steel、Tools、Machine Parts、Stationary Steam Engine、Locomotive、Marine Steam Engine のうち、その国家の技術でレシピが開いているものである。新しい Good は足さない。

`internalCombustionEngine` が adopted 以上なら、系譜に「機械の輸出が車両の型に入った」と記す。車両 Good は作らない。トヨタのような輸出企業は、この型の説明である。国名と社名の表は持たない。実在地形で港と冶金の在庫が厚い国家に、この規則が同じ企業を出す。

## 5. 記録

経済スライスの任意配列 `firms`。`getSliceArray` / `setSliceArray`。拡張を切ったときの `clear` で空にする。読み込み時にセーブを書き換えない。キーが無いセーブは企業なしとして読む。

```ts
type FirmStage = "house" | "chartered" | "manufactory" | "firm";

type FirmOrigin =
  | "workshop-spinout"
  | "merchant-house"
  | "state-charter"
  | "lender-capitalization"
  | "retroject";

type FirmSiteKind = "workshop" | "plant" | "office" | "yard";

type FirmProductLine = "craft" | "machinery";

interface FirmSite {
  burgId: number;
  kind: FirmSiteKind;
  domain: CraftKnowledgeDomain;
  openedYear: number;
}

interface FirmKnowledge {
  domain: CraftKnowledgeDomain;
  /** 0..1。GuildKnowledgeStock は減らさない。 */
  stock: number;
  source: "guild-increment" | "experiment-record" | "retroject";
}

interface FirmCharter {
  stateId: number;
  fromYear: number;
  /** 本設計では常に false。価格と交易には効かない。 */
  monopoly: false;
}

interface FirmCapitalSource {
  kind: "guild-treasury" | "lender" | "retroject";
  characterId?: number;
  amount: number;
  year: number;
}

interface FirmPedigreeEvent {
  year: number;
  kind: "founded-as-workshop" | "house" | "charter" | "manufactory" | "plant" | "retroject";
  burgId?: number;
}

interface Firm {
  i: number;
  name: string;
  stage: FirmStage;
  origin: FirmOrigin;
  domicileBurgId: number;
  homeStateId: number;
  homeMarketId?: number;
  merchantOrganizationId?: number;
  primaryDomain: CraftKnowledgeDomain;
  productLine: FirmProductLine;
  sites: FirmSite[];
  knowledge: FirmKnowledge[];
  /** burg.treasury、ギルド金庫、marketTreasury とは別。 */
  capital: number;
  capitalSources: FirmCapitalSource[];
  charter?: FirmCharter;
  foundedYear: number;
  pedigree: FirmPedigreeEvent[];
}
```

`office` と `yard` は後続のための値である。本設計の生成は `workshop` と `plant` だけを書く。

名前は商会の `${人物または都市} Company` と衝突させない。`${基盤名} ${職域} Works` とする。基盤名は、本拠市場の商会の会頭が生きていればその名、いなければ都市名。実在企業の名は使わない。

年次の位置は `GuildKnowledge.settleAnnual()` の直後。ギルドの在庫が今年の値になってから企業を決める。自前の年ゲートを持つ。

## 6. 知識の写し

家業を作った年と、その後の毎年に、主要職域について次を計算する。

```text
peerStocks = 同じ国家で、その職域の stock > 0 である都市の在庫
commonFloor = peerStocks が 3 未満なら 0、そうでなければ中央値
increment = clamp01(本拠の guildStock - commonFloor)
```

企業の専有在庫は、この `increment` へギルドと同じ係数で近づける。採用も減衰も `GUILD_ADOPTION_RATE` と `GUILD_DECAY_RATE`（どちらも 0.15、`guildKnowledge.ts`）を使う。新しい係数は置かない。ギルドの `stock` と `treasury` は、この写しでは変えない。

`manufactory` 以降、本拠に `ExperimentalWorkshop` があるとき、出典 `experiment-record` の在庫を `experimentRecord` と同じ値で別に持つ。実験工房の記録は減らさない。学士院の自然哲学は企業へ写さない。国家の技術段階も写さない。企業の在庫は `isTechnologyAtLeast` を満たさない。

国家機密（`StateSecretStock`、現状の火薬術を含む）は写さない。蒸気設計の `MachineWorks` は未接続である。Burg 単位の工作経験が後からできたとき、ギルド増分と同じ形で写す。本設計はその記録を新設しない。

## 7. 資本

新しい金は生まない（D6、D7）。

初回の実装では `capital` は 0、`capitalSources` は空である。勘定の箱だけがある。

付け替えを有効にする段では、その職域の既存の `GUILD_PROFIT_SHARE`（0.35）をギルドと企業で分ける。仮の分けは各 0.175。ギルドの分け前は今のとおりギルド金庫へ入り、企業の分け前が `capital` に入る。都市の家計へ戻すギルドの余剰支出は、この付け替えを有効にする前に、同じ地図で比べる。比べるまで分け前は 0 とし、0.35 はすべてギルドに残す。

金貸しからの出資は `FirmCapitalSource.kind = "lender"` として後から記せる。自動では起こさない。シンジケートのメンバーの `characterId` を参照するだけで、工房の属性にはしない。工房の無い貸し手は企業にしない。

`marketTreasury.balance` と `tradeWorkingCapital` は動かさない。輸出の名義は品目群のラベルであり、商会の取引現金とは別の決済をしない。

## 8. 二つの作り方

### 8.1 年次

開始時代が `preIndustrialEra` より前のとき、書き戻しは走らない。§4 の昇格だけが企業を作る。中世の工房から、年を進めるうちに家業、特許、工場制、複数都市の工場へ進む。

### 8.2 書き戻し

世界生成時に一度だけ走らせる。条件は開始の Historical period が `preIndustrialEra` 以上であること。実在の世界地図であることは条件にしない。`firms` が既にあれば何もしない。古いセーブの読み込みでは走らない。

種まきの規則（`HISTORICAL_PERIOD_FRONTIER_ERA`）では、選んだ時代より前のノードは `diffused`、その時代のノードは `demonstrated` である。したがって開始直後の最高段階は次のとおり。

| 開始時代 | 技術の前線 | 書き戻す最高段階 |
| --- | --- | --- |
| `preIndustrialEra` | era 4。`factoryOrganization` は demonstrated | `chartered`（`commercialFinance` と `overseasTradingPosts` は diffused）。工場制にはしない |
| `steamEra` | era 5。`factoryOrganization` は diffused、`rotarySteamPower` は demonstrated | `manufactory`。他都市の工場は開かない |
| `industrialChemistryEra` 以降 | `rotarySteamPower` は diffused 以上 | `firm`。条件を満たせば国内に工場を一つ書く |
| `petroleumEra` 以降 | `modernSteelmaking` は diffused、`internalCombustionEngine` は demonstrated から始まり、adopted 後に車両の注記 | 機械の品目群は `standardMachineWorks` が diffused なら付ける。車両の注記は `internalCombustionEngine` が adopted 以上のときだけ |

書き戻した企業の `origin` は `retroject`。系譜の年は開始年からの固定の差分であり、その間の経済は回さない。開始年は `options.year`、無ければ simulation の `currentYear`。

| 最高段階 | 工房としての創業 | 家業 | 特許 | 工場制 | 企業 |
| --- | --- | --- | --- | --- | --- |
| `house` | 開始年 | 開始年 | | | |
| `chartered` | 開始年 − 20 | 開始年 − 20 | 開始年 | | |
| `manufactory` | 開始年 − 60 | 開始年 − 60 | ノードが届いていれば開始年 − 30 | 開始年 | |
| `firm` | 開始年 − 90 | 開始年 − 90 | ノードが届いていれば開始年 − 50 | 開始年 − 20 | 開始年 |

差分は表示用の仮値である。経済の校正対象にはしない。

書き戻しのあとの年次昇格は、既にある都市・職域を作り直さない。まだ達していない段だけを、§4 の一年一段で進める。

## 9. 都市に残るもの

`firm` 段階のあと、都市が持ち続けるものは次である。

- 人口と労働。企業は人を自陣の人口に移さない。
- 金庫、税、地元需要。
- ギルドの共通知識と、親方の席の規則。
- 港、水、動力など、既存の都市基盤。
- City Editor が描く工房の建物。

都市が手放す名義は、専有知識の増分、企業の勘定、どの都市に次の工場を開くかの決定、機械品目群としての輸出のラベルである。都市の画面が後から企業を出すときは、本拠がそこにある企業と、敷地がそこにある企業の合計を示す。初回実装に画面は含まない。

## 10. 実装の順

産出と決済に触れる段は、それぞれの前に地図の計測を置く。全件テストと多数シードは、この順の中では行わない。

| 段 | 内容 | 産出・現金 |
| --- | --- | --- |
| P1 | 型、空の年次、昇格判定の単体テスト | 変えない |
| P2 | 年次の創業と昇格、知識の写し | ギルド在庫と金庫は不変。企業の資本は 0 |
| P3 | §7 の分け前。無効が既定。有効化は家計とギルド金庫の比較のあと | 有効にするまで現金は不変 |
| P4 | §8.2 の書き戻し。生成時一度 | 現金は不変 |
| P5 | 専有在庫を生産倍率に接続する。仮の上限は、ギルド補正との合算で +0.10 を超えない。接続前に計測 | この段まで産出は不変 |
| P6 | 品目群を交易の表示と決済に接続する | 別設計。`tradeWorkingCapital` は商会に残したまま始める |

P5 の +0.10 は仮の上限であり、P5 に入るときに計測で置き直してよい。P5 より前の実装は、この倍率をコードに入れない。

## 11. テスト

判定の単体テストに限る。

- `commercialFinance` が adopted 未満の国家では企業を作らない。
- 一つの都市から一年に企業は一つ。同じ都市・職域は二重にしない。
- 知識の写しの前後で `GuildKnowledgeStock.stock` が変わらない。
- 火薬術の `StateSecretStock` を企業の知識に入れない。
- 資本の分け前が無効のとき、ギルド金庫と `marketTreasury` が変わらない。
- `steamEra` の書き戻しは `manufactory` までで、他都市の `plant` を作らない。
- `industrialChemistryEra` の書き戻しは、条件を満たすとき `plant` を一つまで作る。
- 書き戻しは二度目に何もしない。
- 年次経路は段階を一年に一段しか進めない。

## 12. 未決

次は校正の未決であり、§1 の決定を開き直すものではない。

1. ギルドの分け前 0.175 / 0.175 を有効にするか。家計への余剰支出と比べてから決める。
2. P5 の生産補正の上限。接続時に測る。
3. 企業数が地図全体で多すぎるとき、国家あたりの上限を足すか。初回は都市あたり年一つだけとし、上限は計測のあと。
4. 他国の敷地と独占。記録の余地だけ残し、効果は別設計。
