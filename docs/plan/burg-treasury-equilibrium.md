# 都市治療(burg.treasury)の均衡化設計 — ギルド金銭モデルと上納先の設計

## 状態

**未実装(設計のみ)**。2026-07-31、`executeManufacture`の原料購入無予算バグ修正([production-generator.ts](../../src/extensions/economy/generators/production-generator.ts)、`Markets.buy`に`budget`未指定だった箇所)の副作用として本設計の必要性が判明した。バグ修正自体(治療の下限保証・初期シード)は実装済み。本ドキュメントはその先——治療の**上限側**の設計。

## 背景・問題

原料購入の予算バグを修正し、都市に初期予算(`STARTING_BURG_TREASURY_PER_POPULATION`, [foodProduction.ts:64](../../src/extensions/economy/generators/foodProduction.ts))を持たせた結果、ブラウザで50年分シミュレートして次が判明した(689都市):

- `negTreasuryCount: 0` — 治療の無限マイナス化は解消
- `zeroProductCount: 392`(約57%) — 資源に乏しい都市は生産を再開できないまま
- 儲かる都市の治療は際限なく積み上がる(支出先が原料購入以外に一切ない)

コード調査で以下が確定した:

| 事実 | 根拠 |
| :--- | :--- |
| 加工売上の100%が`burg.treasury`に入る。ギルドへの分配経路はゼロ | `production-generator.ts:220`、`GuildKnowledgeStock`([guildKnowledgeTypes.ts:22](../../src/extensions/economy/generators/guildKnowledgeTypes.ts))は`stock`(技能EWMA)のみで金銭フィールドを持たない |
| `burg.treasury`の支出先は原料購入と略奪イベントのみ。恒常的な維持費が存在しない | 全リポジトリ横断で`burg.treasury -=`の書き込み箇所は[production-generator.ts:426,630](../../src/extensions/economy/generators/production-generator.ts)と[marchCapture.ts:95](../../src/extensions/nobility/generators/marchCapture.ts)のみ |
| `state.treasury`は対照的に軍事維持費([militaryLogistics.ts](../../src/extensions/economy/generators/militaryLogistics.ts)の`getStateMilitaryUpkeep()`)が毎サイクル確実に引かれ、`Math.max(0, ...)`で下限も付いている | [taxes-generator.ts:89,95](../../src/extensions/economy/generators/taxes-generator.ts) |
| 治療0・局所資源なしの都市に復帰手段が皆無(subsidy/loan/stipend相当のコードはゼロ件) | grep確認済み |
| `constructionEmployment.ts`の建設(`buildingStock`)は**治療ではなく市場のGOODS在庫**(石材・木材等)を消費する仕組みであり、治療とは直結していない | [constructionEmployment.ts:178-213](../../src/extensions/economy/generators/constructionEmployment.ts) |

前回の提案(「余剰治療を自動的に`buildingStock`へ再投資する」)は上記最後の事実により**既存の建設メカニクスと直結しない孤立した新規シンク**になってしまうことが判明し、かつユーザー指摘の通り「州から見て交易・防衛のどちらにも波及しない、意味の薄い消費先」になるリスクがある。本設計ではこれを撤回し、**既に系全体へ波及する効果を持つ既存の支出先(貿易安全保障・軍事維持費・辺境拡張・技術投資)に治療を合流させる**方針に切り替える。

## 目的

1. 都市治療が無限に発散しない(儲かる都市の余剰が上位の仕組みへ還流する)
2. 治療0・局所資源なしの都市にも再起動のチャンスがある
3. 還流したお金が**交易・防衛・技術**など、国家/州スケールで実際に意味を持つ既存メカニクスの原資になる(新規の孤立したシンクを作らない)
4. 私有の技能産業(ギルド)と公有の土地資源(領主=都市)の会計を概念的に分離する

## 非目的

- ギルド組合員個人のオブジェクト化(所感3で明示的にスコープ外とされた — 集計プールとして扱う)
- 政体(君主制/共和制等)による上納比率の作り込み(将来の拡張ポイントとして触れるのみ)
- `constructionEmployment.ts`のGOODS消費モデル自体の変更

## 既存の系統的な支出先(調査結果のまとめ)

新設するシンクをどこに接続すべきかの判断材料として、既存の「治療を使って何かを起こす」メカニクスとそのスコープを整理する。

| メカニクス | 原資 | 効果のスコープ |
| :--- | :--- | :--- |
| [tradeSecurity.ts](../../src/extensions/economy/generators/tradeSecurity.ts) | `state.treasury` | **州全体**の盗賊リスク低減(全キャラバンの交易路に波及) |
| 軍事維持費([militaryLogistics.ts](../../src/extensions/economy/generators/militaryLogistics.ts)) | `state.treasury` | **州全体**の常備軍維持 |
| [frontierExpansion.ts](../../src/generators/frontierExpansion.ts) / [frontierGovernance.ts](../../src/generators/frontierGovernance.ts) | `state.treasury` | 新規辺境領土の獲得・維持 |
| ag/industrial tech investment([agTechInvestment.ts](../../src/extensions/economy/generators/agTechInvestment.ts) 等) | `market.marketTreasury.balance`(主)+ `state.treasury`(副) | **マーケットの商圏に属する全都市**の生産性 |
| [strategicProcurement.ts](../../src/extensions/economy/generators/strategicProcurement.ts) | `state.treasury` → `sourceBurg.treasury` | 州が都市から調達し、実際の交易路(キャラバン)を生成する既存の「州→都市」金流 |

`market.marketTreasury.balance`は1つのマーケットが複数の都市を商圏に持つため(`markets-generator.ts`の`createMarkets()`/`expandMarkets()`)、都市単位の余剰をここに合流させれば**自動的に多都市への波及効果**を持つ。同様に`state.treasury`は既に貿易安全保障・軍事維持・辺境拡張という3つの系統的シンクを持っている。**新しいシンクを発明するのではなく、この2つの既存プールへ都市の余剰を合流させる**のが本設計の骨子。

## 設計: 都市治療の3方向フロー

```text
加工品の売上(sellInventoryToMarket)
  │
  ├─ 販売税(既存、変更なし) ──────────────────→ state.treasury
  │
  └─ 税引後の純利益
       ├─ craft domainを持つ加工品 ──┬─ GUILD_PROFIT_SHARE ──→ ギルド金庫(burg×domain)
       │                              └─ 残り ────────────────→ burg.treasury
       └─ craft domainを持たない売上(局所資源ボーナス等)────→ burg.treasury(全額、従来通り)

burg.treasury(年次決算 settleAnnual 相当のタイミング)
  └─ COMFORTABLE_TREASURY_LEVEL を超えた分(余剰)
       ├─ MARKET_SHARE ──→ market.marketTreasury.balance(既存のagTech/industrialTech投資がそのまま使う)
       └─ STATE_SHARE   ──→ state.treasury(既存の軍事維持費/貿易安全保障/辺境拡張がそのまま使う)

ギルド金庫(月次 produceForBurg 相当のタイミング)
  └─ 所属burgの治療が COMFORTABLE_TREASURY_LEVEL を下回っている場合のみ
       └─ GUILD_PAYOUT_RATE 分をトリクル還元 ──→ burg.treasury
```

### 3.1 ギルド金庫(私有産業の富の分離)

`GuildKnowledgeStock`([guildKnowledgeTypes.ts:22](../../src/extensions/economy/generators/guildKnowledgeTypes.ts))に`treasury: number`を追加する(既存の`stock`フィールドと同じ`(burgId, domain)`キー)。

- `executeManufacture`が生んだ加工品を`sellInventoryToMarket`が売る際、その売上のうち`getCraftDomainForGood(good.name)`が非nullなものだけを対象に、`GUILD_PROFIT_SHARE`(仮値 0.3〜0.4)をギルド金庫へ、残りを`burg.treasury`へ。
- craft domainを持たない売上(局所資源ボーナス、domain未対応の加工品)は従来通り全額`burg.treasury`。
- ギルド金庫はドメイン別・都市別に独立して積み上がる。同じ都市でも冶金ギルドは豊かだが織物ギルドは貧しい、という差が自然に出る。

これは「私有の技能産業(ギルド)」と「公有の土地資源(都市=領主)」を会計上分離するという所感2への直接対応であり、かつ次項3.3で述べる「都市治療が無限成長しない」効果もこの分離自体から一部生まれる(加工品利益の一部が最初から都市治療をバイパスするため)。

### 3.2 治療0都市への復帰チャンス(ギルドからのトリクル還元)

月次生産サイクル(`produceForBurg`と同じ頻度)で、各都市について:

```ts
if (burg.treasury < COMFORTABLE_TREASURY_LEVEL(burg)) {
  for each domain の GuildKnowledgeStock(burgId, domain) with treasury > 0:
    payout = min(guildTreasury * GUILD_PAYOUT_RATE, COMFORTABLE_TREASURY_LEVEL(burg) - burg.treasury)
    guildTreasury -= payout
    burg.treasury += payout
}
```

困窮している都市にのみ的を絞って還元する(潤沢な都市への追加流入はしない)。ギルド自身の蓄えを上限とするため、ギルドが空なら還元もゼロ——「資源も技能蓄積も無い都市は本当に詰む」という状態は残るが、それは意図的な結果(所感1の要求は「チャンスがない」ことへの異議であり、「必ず復帰できる」ことへの要求ではない)。

### 3.3 州・マーケットへの上納(交易・防衛への合流)

年次決算(既存の`settleAnnual()`系メカニクスと同じ頻度)で、各都市について:

```ts
comfortable = COMFORTABLE_TREASURY_LEVEL(burg)
surplus = max(0, burg.treasury - comfortable)
if (surplus > 0) {
  burg.treasury -= surplus
  market.marketTreasury.balance += surplus * MARKET_SHARE   // 仮値 0.5
  state.treasury += surplus * (1 - MARKET_SHARE)            // 仮値 0.5
}
```

- マーケットへの上納分は、既存の`agTechInvestment`/`industrialTechInvestment`がそのまま消費する。効果は**そのマーケットの商圏に属する全都市**の生産性向上として波及する(1都市の余剰が近隣都市群の底上げに変わる)。
- 州治療への上納分は、既存の軍事維持費・[tradeSecurity.ts](../../src/extensions/economy/generators/tradeSecurity.ts)の投資・[frontierExpansion.ts](../../src/generators/frontierExpansion.ts)の辺境拡張がそのまま消費する。**これが所感の懸念(「交易・防衛のどちらにも意味を持たない場所へ消える」)への直接的な回答**——新しい消費ロジックを一切増やさず、既存の州レベルシンクの原資を太らせるだけ。
- 販売税(既存、州が徴収)とは別枠の「上納」として扱う。フレーバー的には「豊かな都市からの献金・自主上納」であり、取引ごとに機械的に課される税とは性質が異なる。

## データモデル変更

```typescript
// guildKnowledgeTypes.ts
export interface GuildKnowledgeStock {
  burgId: number;
  domain: CraftKnowledgeDomain;
  stock: number;
  treasury: number; // 追加: この都市・ドメインのギルドが蓄えた私有資本
}
```

`burg.treasury` / `market.marketTreasury.balance` / `state.treasury`は既存フィールドをそのまま使う(型変更なし)。

## チューニング定数(すべて仮値・要調整として明記する)

| 定数 | 仮値 | 意味 |
| :--- | :--- | :--- |
| `GUILD_PROFIT_SHARE` | 0.35 | 加工品純利益のうちギルド金庫へ回す割合 |
| `GUILD_PAYOUT_RATE` | 0.15 | 月次でギルド金庫から困窮都市へ還元する割合 |
| `COMFORTABLE_TREASURY_MULTIPLIER` | 3〜5倍(`STARTING_BURG_TREASURY_PER_POPULATION`基準) | 「快適水準」の算出係数。これを超えた分だけ上納対象 |
| `MARKET_SHARE` | 0.5 | 都市余剰のうちマーケット共有金庫へ回す割合(残りは州治療) |

既存コードの`INITIAL_TREASURY_MIN_SHARE`等と同じ扱いで、実装後にバランス調整が前提の初期値。

## 期待される挙動

- 儲かる都市: 加工利益の一部が最初からギルドへ分岐 → 治療自体の伸びが緩やかになる → さらに快適水準を超えた分はマーケット/州へ上納 → 無限発散しない
- 困窮する都市: 局所資源ボーナスが無くてもギルドの蓄えがあれば復帰の芽が残る(ギルドも空なら詰んだままだが、それは「資源も技能もない」という状態を正直に表しているだけで、以前のような「無限に借金し続ける」異常事態ではない)
- マーケット: 複数都市の上納が集まり、ag/industrial tech投資が活発化 → 商圏全体の生産性が上がる(既存のEWMA上限0〜1により自然に頭打ち)
- 州: 既存の軍事維持費・貿易安全保障・辺境拡張という「本来やりたかったこと」の原資が、都市の繁栄と連動して太くなる。州自体は既存の均衡ロジック(毎サイクルの軍事維持費)により発散しない

## 未決事項

- 「快適水準」の算出式を人口比例のみにするか、直近数サイクルの平均収益ベースにするかは実装時に要検討
- 政体(`state.salesTax`と同様に君主制/共和制等)によって`MARKET_SHARE`/州上納比率を変えるべきか — 将来の拡張ポイントとして定数を分岐しやすい形にはしておくが、今回はスコープ外
- ギルド金庫を将来Nobility拡張の国家機密ドメイン(`StateSecretStock`、treasury駆動型EWMA)と同様の投資駆動ロジックに接続する余地があるか(火薬術ドメインの前例([knowledge-guild-system.md](knowledge-guild-system.md) Phase 4)を参照) — 今回はスコープ外、将来検討

## 実装フェーズ案

1. **Phase A**: `GuildKnowledgeStock.treasury`追加、加工品売上のギルド分岐(3.1)
2. **Phase B**: ギルドからの困窮都市トリクル還元(3.2)
3. **Phase C**: 都市余剰のマーケット/州への年次上納(3.3)

3フェーズは互いに独立して着手可能(Phase Aのみでも治療の伸びは緩和される)。着手順はA→B→Cを推奨(データモデルの追加が先に必要なため)。

## テスト方針

- `guildKnowledge.test.ts`: ギルド金庫への分配・トリクル還元のユニットテスト追加
- `production-generator.test.ts`相当: 加工品売上のギルド/都市分岐が既存の`sellInventoryToMarket`テストを壊さないことを確認
- 統合テスト: 50年規模のシミュレーションで「治療が発散しない」「治療0都市の一定割合が復帰する」ことをアサートする回帰テストを追加(前回のブラウザ手動検証と同等の内容をテスト化する)
