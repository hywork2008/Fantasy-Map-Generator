# 統一通貨(🟡)の金貨・銀貨・銅貨デノミネーション 設計

## 状態

**未着手**(設計のみ)。本ドキュメントは実装前の設計プランであり、`src/` への変更はまだ一切含まない。

## 背景・目的

現在この世界の通貨は🟡という単一の抽象単位のみで、`formatPrice()`(`src/utils/unitUtils.ts:105-106`)が `🟡 ${rn(value, 2)}` という小数2桁表示を全経済UIで共通して行っている。[cost-of-living.md](../analytics/cost-of-living.md)で確認した通り、農民一人の年間最低生存費は約0.3〜0.4🟡という値になり、これは「一年分の生活費」としては小さすぎる桁ではないものの、**「住民が普段の買い物で実際に手渡す硬貨」としては小数の抽象単位のままでは物理的なリアリティに欠ける**という指摘がユーザーから出た。

ユーザー指定の要件:

1. 金貨・銀貨の交換レートは史実の金銀比価を参考に、**銀貨11〜13枚 = 金貨1枚**程度をプロンプト用の仮レートとする。
2. 銅貨も用意しないと、現行の統一通貨では住民の日常的な少額決済(パンや雑貨など)を表現できない。
3. 地図上の全ての国は同じ通貨を使うと仮定する(地域ごとの為替・通貨制度の違いは設計しない)。

## 用語衝突についての注意

`src/extensions/economy/generators/goods-generator.ts` には既に **Gold Ingot / Silver Ingot / Copper Ingot(および Gold Ore 等)という交易品(Goods)** が定義されている。これらは🟡通貨で売買される**地金**であり、通貨そのものではない(`goods-generator.ts:1055` に「これは硬貨の物理的供給を二重に表現するものではない」という既存コメントがあり、地金と通貨が意図的に分離されていることが確認できる)。

新しい通貨単位を「Gold」「Silver」「Copper」とだけ呼ぶと、既存の交易品(Gold Ingot 等)と紛らわしい。本設計では通貨側を **Gold Piece / Silver Piece / Copper Piece**(略称 GP/SP/CP)と明確に呼び分け、UI文言でも「〜貨」ではなく「金貨/銀貨/銅貨」(交易品側は「金インゴット」等)で表記を分離する。

## 設計方針: 表示レイヤーのみのデノミネーション(推奨)

「デノミネーション」という言葉から連想される作業は、本来なら国庫・所持金・商品価格などあらゆる金額の**内部保存値そのものを新しい単位系に置き換える**大規模改修に見える。しかし実際に解決すべき課題は「プレイヤーへの表示が硬貨として自然に読めること」であり、内部計算(500件超の既存テスト、`allocateTreasury`、`Taxes.collectTaxes`、`characterStipends.ts` 等の財政ロジック一式)を変更する必要はない。

そこで本設計は次の2フェーズに分割し、**フェーズ1のみを実装対象として推奨**する。

### フェーズ1(推奨・本設計のスコープ): 表示レイヤーの硬貨内訳化

- 内部的に保存されている🟡の数値(`Burg.treasury`, `State.treasury`, `Character.wealth`, `MarketTreasury.balance`, `GuildKnowledgeStock.treasury`, 各Goodの`value`)は**一切変更しない**。
- 現行の🟡単位を、そのまま **「銀貨(Silver Piece)」** として再定義する。つまり `1 old🟡 = 1 SP` — 既存の全ての数値・計算式・テストの期待値はこの1行だけで意味づけが変わり、コード変更が不要になる。
- 金貨・銅貨は、銀貨からの**表示専用の換算(閾値ごとの繰り上げ表示)**として導出する。実際に金庫や所持金の内部表現が「金貨N枚+銀貨N枚+銅貨N枚」の3フィールドに分かれるわけではない。
- リスクが最小(既存のバランス調整・527件のテスト・生成ロジックに触れない)であり、ユーザーの要件「日常決済を表現したい」は銅貨への内訳表示で満たせる。

### フェーズ2(将来・非推奨・本設計の対象外): 内部単位そのものの再スケール

内部保存値自体を銅貨単位の整数に置き換える(例: `Grain.value` や `STARTING_BURG_TREASURY_PER_POPULATION` 等30以上の定数と、その定数を参照する既存テストの期待値をすべて銅貨スケールに書き換える)案。フェーズ1で表示上の課題は解決できるため、追加のゲームプレイ上の恩恵(例えば硬貨単位でのインベントリ管理や、硬貨の重さ・盗難といった新規メカニクス)を具体的に必要とする段になるまでは着手しない。

## 史実の参考レート

| 時代・地域 | 金:銀 | 銀:銅 | 備考 |
| --- | --- | --- | --- |
| 古代ローマ(帝政初期) | aureus:denarius ≈ 25:1 | denarius:as ≈ 16:1 | ユーザー指定の11〜13よりだいぶ広い比率。 |
| ビザンツ帝国 | solidus:miliaresion ≈ 12:1 | miliaresion:follis ≈ 24:1 | 金:銀=12:1はユーザー指定レンジにほぼ一致する実例。銀貨を24分割してさらに細かい銅貨を刻んでいた点が本設計にとって参考になる(後述)。 |
| 中世ヨーロッパ(£/s/d 会計単位) | (金貨の本格流通は後代、対銀比は概ね10〜12:1で推移) | shilling:pence = 12:1 | 本来は銀貨のみの会計上の単位区分で、金/銀/銅の比喩はのちの創作作品による転用。 |
| D&D等の現代ファンタジーRPGの慣習 | gp:sp = 10:1 | sp:cp = 10:1 | 史実比率ではなく、暗算のしやすさを優先した10進法。 |

ユーザー指定の「銀貨11〜13枚=金貨1枚」はビザンツのsolidus:miliaresion(12:1)にほぼ一致する、史実として妥当な数値。本設計の`GOLD_TO_SILVER_RATE=12`はこれに倣う。

## 交換レート

| 単位 | 換算 | 備考 |
| --- | --- | --- |
| 1 金貨 (GP) | 12 銀貨 (SP) | ユーザー指定の史実レンジ11〜13の中央値。範囲内で11〜13の任意値に調整可能なプレースホルダー定数として実装する。 |
| 1 銀貨 (SP) | 現行の🟡そのもの(無変換) | 既存の内部保存値・全定数・全テストの意味はそのまま。 |
| 1 銀貨 (SP) | 12 銅貨 (CP) | ユーザー指定なし。中世の shilling:pence(1:12)に倣った提案値。10進(1:10)の方が暗算しやすい代替案もあり、後述の「未確定事項」で選択を残す。 |
| 1 金貨 (GP) | 144 銅貨 (CP) | 上記2つの複合(12 × 12)。 |

```ts
// 提案: src/utils/currencyConstants.ts (新規)
export const GOLD_TO_SILVER_RATE = 12; // ユーザー指定レンジ 11–13 のプレースホルダー中央値
export const SILVER_TO_COPPER_RATE = 12; // 未確定。史実shilling:pence類推、要調整
export const GOLD_TO_COPPER_RATE = GOLD_TO_SILVER_RATE * SILVER_TO_COPPER_RATE; // 144
```

## 表示アルゴリズム

`src/utils/unitUtils.ts` に `formatPrice()` と並べて新しい `formatCoinage()` を追加し、既存の `formatPrice()` 呼び出し32箇所(後述)を段階的に置き換える。

```ts
export interface Coinage {
  gold: number;
  silver: number;
  copper: number;
}

export function toCoinage(silverAmount: number): Coinage {
  const totalCopper = Math.max(0, Math.round(silverAmount * SILVER_TO_COPPER_RATE));
  const gold = Math.floor(totalCopper / GOLD_TO_COPPER_RATE);
  const remainder = totalCopper % GOLD_TO_COPPER_RATE;
  const silver = Math.floor(remainder / SILVER_TO_COPPER_RATE);
  const copper = remainder % SILVER_TO_COPPER_RATE;
  return { gold, silver, copper };
}

export function formatCoinage(silverAmount: number): string {
  const { gold, silver, copper } = toCoinage(silverAmount);
  const parts: string[] = [];
  if (gold > 0) parts.push(`🟡${gold}`);
  if (silver > 0 || parts.length === 0) parts.push(`⚪${silver}`);
  if (copper > 0) parts.push(`🟤${copper}`);
  return parts.join(" ");
}
```

- アイコン案: 金貨 🟡(既存流用、変更不要)、銀貨 ⚪(白丸)、銅貨 🟤(茶丸)。
- ゼロ額(`silver=0, gold=0, copper=0`)の扱い、負の値(現状マイナス金額があり得るか要確認)、1銀貨未満の端数(現行では0.01〜0.99の小数🟡が存在しうる — `Math.round(silverAmount * 12)`で四捨五入されるため、0.5銀貨未満は0銅貨に切り捨てられる)は、実装時にユニットテストで境界値を固定する。
- `GoodsEditorDialog.tsx:299` の生の `🟡 {good.basePrice}` 直書き箇所は `formatPrice()`/`formatCoinage()` を経由していない唯一の抜け穴として、移行時に必ず同時に直す。

## 影響範囲(調査済み・32呼び出し箇所)

`formatPrice()` の呼び出しをカテゴリ別に整理(詳細ファイルは実装時に再grep):

| カテゴリ | ファイル数/箇所数(概算) | 代表ファイル |
| --- | --- | --- |
| 市場・交易ダイアログ | 約19箇所 | `MarketTradeOpportunitiesDialog.tsx`, `MarketsOverviewDialog.tsx`, `TradeDetailsDialog.tsx`, `MarketsGoodCompareDialog.tsx`, `MarketOverviewDialog.tsx`, `MarketDealsDialog.tsx`, `TradeAnimationDialog.tsx` |
| Burg/State 国庫 | 約9箇所 | `burgEconomySummary.ts`, `StatesEditorTreasuryTab.tsx`, `ProductionOverviewDialog.tsx`, `production-overview.ts` |
| キャラクター所持金 | 3箇所 | `CharactersTable.tsx`, `CharacterDetailsDialog.tsx`, `PlayerCharacterPanel.tsx` |
| 生書き(要修正) | 1箇所 | `GoodsEditorDialog.tsx:299` |

全て `formatPrice()` という単一関数を経由しているため、**このヘルパー1つの実装差し替えだけで表示は全箇所に伝播する**(呼び出し側の書き換えは不要な設計にできる可能性がある — `formatPrice()` 自体の中身を `formatCoinage()` の実装に置き換え、シグネチャ・呼び出し規約は維持する案が最小差分)。ただし国庫のような大きい金額と、商品単価のような小さい金額とで「硬貨内訳を出すか、単位を1種類に絞るか」を呼び出し側ごとに変えたいケースが出てくる可能性があるため、`formatPrice()` は後方互換のため残しつつ `formatCoinage()` を新設し、呼び出し側ごとに任意に移行する方が安全(一括置換は移行時にUIごとの見た目を個別に確認しながら判断する)。

## i18n への影響

`formatPrice()` 自体はi18nを経由しない生テンプレート文字列(`src/utils/unitUtils.ts:106`)。ただし [cost-of-living.md](../analytics/cost-of-living.md) 実装時に追加した `src/i18n/locales/en.json` / `ja.json` の `about.costOfLiving*` 系5キー(intro/Peasant/Urban/Family/House、各言語で計10箇所)は🟡グリフを本文中に直接埋め込んでいるため、フェーズ1実装時に**表現を金貨/銀貨/銅貨ベースに書き換える**必要がある(例: 農民の年間生存費「約0.3〜0.4🟡」→「約4〜5🟤(銅貨)」)。`CustomAboutContent.tsx` 自体のコード変更は不要(キーの値のみ変更)。

## 既存定数を使った換算例(サニティチェック)

新レート(1 old🟡 = 1 SP、1 SP = 12 CP、1 GP = 12 SP)を実在の値に当てはめた場合の読みやすさを確認:

| 項目 | 現行値(old🟡) | 出典 | 新表示 |
| --- | --- | --- | --- |
| Grain 小売価格 | 1 / wain | `goods-generator.ts:229` | 🟡0 ⚪1 🟤0(≒銀貨1枚) |
| Grain farmgate価格 | 0.8 / wain | `foodProduction.ts:46`(`FARMGATE_PRICE_SHARE`) | 🟡0 ⚪0 🟤10 |
| 商品価格の最高値 | 70 | `goods-generator.ts` 全体調査、最大約70 | 🟡5 ⚪10 🟤0 |
| Marshal(中央官職)の所持金の例 | 350 | `treasuryAllocation.test.ts` 実測値 | 🟡29 ⚪2 🟤0 |
| 農民の年間最低生存費 | 0.3〜0.4 | [cost-of-living.md](../analytics/cost-of-living.md) | 🟡0 ⚪0 🟤4〜5 |

商品単価は概ね1桁の金貨/銀貨、日常の食料は銅貨単位に収まり、「銅貨で日常の買い物をする」というユーザーの要望を満たせることを確認した。

## 少額決済(外食1食など)についての追加検討

上記のサニティチェックは**年間の集計値**で見ており、実際に硬貨を手渡す**1回分の取引**(例: 酒場での1食)を検証すると別の問題が生じることが判明した。

```text
GROSS_FOOD_NEED = 0.43(1人が1年に必要な食料、抽象単位)
1日あたり = 0.43 / 365.2425 ≈ 0.001178 (foodProduction.ts:184 の実装と同じ割り方)
1日分の生穀物コスト(小売1🟡/wain) ≈ 0.001178 🟡/日
→ 本設計のレート(1 old🟡=1銀貨、1銀貨=12銅貨)では ≈ 0.014銅貨/日
3食に分けると1食 ≈ 0.005銅貨 — 銅貨1枚の1%にも届かない
```

**この問題はレート調整では解決しない。** 1日分の生穀物コストを銅貨1枚ちょうどに合わせようとすると、逆算で `1 old🟡 ≈ 金貨5.9枚相当` まで基準単位を引き上げる必要があるが、そうすると連動して他の数値が破綻する。

| 項目 | 現行の新表示(本設計採用レート) | 「1食=銅貨1枚」に合わせた場合 |
| --- | --- | --- |
| 商品価格の最高値(70 old🟡) | 🟡5 ⚪10 🟤0 | 約413金貨相当 |
| 中央官職の所持金の例(350 old🟡) | 🟡29 ⚪2 🟤0 | 約2065金貨相当 |

「1食」と「国庫・高額商品」の間には現行データ上5〜6桁(10万倍以上)の開きがあり、単一の線形な交換レートでは両立できない。原因はレートの選び方ではなく、`GROSS_FOOD_NEED`が「年間の生存必要量」という粗い集計値であり、そもそも外食1食分の価格として使うために設計された定数ではないことにある。

### 採用する解決策: 独立したフレーバー値として定義する

[cost-of-living.md](../analytics/cost-of-living.md)の住宅価格と同じ扱いとし、**「酒場での質素な1食」を`GROSS_FOOD_NEED`から逆算せず、独立したフレーバー値として直接定義する**。

- 生穀物(farmgate価格で農家が売る原材料)が実質ゼロに近いのは経済的に自然で、実際の食堂・酒場の1食には調理・接客・店の取り分といった付加価値が乗る。現実の経済でも「小麦の原価」と「レストランの一食」には数十〜数百倍の価格差があるのが普通であり、「原材料はほぼ0銅貨なのに1食は数銅貨」という開きはむしろ整合的。
- 目安値: **酒場での質素な1食 ≈ 銅貨1〜3枚**。既存の財政ロジック(`allocateTreasury`, `characterStipends.ts`等)には一切接続しない、UI/ドキュメント上のフレーバー値として扱う。
- 参考として、[史実の参考レート](#史実の参考レート)節のビザンツ帝国の例(銀:銅=24:1)のように、`SILVER_TO_COPPER_RATE`をより大きくして銅貨の刻みを細かくする調整も可能だが、それだけでは上記の5〜6桁の開きを埋められないため、根本解決にはならない(粒度をわずかに改善する程度の副次的な調整に留まる)。

## 未確定・要調整事項

1. **`SILVER_TO_COPPER_RATE` の具体値**: 本設計では12(shilling:pence類推)を提案しているが、ユーザーからの指定はない。10進(1:10)の方が暗算しやすいトレードオフがあり、実装着手前に確定させる。
2. **`GOLD_TO_SILVER_RATE` の具体値**: ユーザー指定レンジ11〜13の中でどの値を採用するか(本設計では中央値12を仮採用)。将来、金銀比価にマップ生成ごとの揺らぎを持たせる(seed依存で11〜13の中からランダムに決定する)拡張も考えられるが、「全ての国が同じ通貨を使う」という前提と整合させるなら固定値のほうが単純。
3. **アイコン選定**: 🟡(金)は既存流用で問題ないが、⚪(銀)/🟤(銅)が視認性・他UI要素との衝突がないか実装時に確認する。
4. **1銀貨未満の端数の丸め規則**: `Math.round()` か `Math.floor()` か。国庫のような大きい金額では影響が無視できるが、少額の所持金表示では境界値の挙動をテストで固定する必要がある。
5. **`formatPrice()` を直接置き換えるか、`formatCoinage()` を新設して呼び出し側ごとに移行するか**: 前者は差分が最小だが全UIの見た目が一括で変わり検証範囲が広い。後者は移行を段階的に検証できるが、しばらく2つの表示形式が混在する。
6. **フェーズ2(内部単位の再スケール)着手条件**: 硬貨の重量・盗難・インベントリ枠といった、内部保存値が整数銅貨単位であることを前提とする新規メカニクスが具体的に計画されるまでは着手しない。
7. **「1食」フレーバー値の具体的な数字**: 「[少額決済(外食1食など)についての追加検討](#少額決済外食1食などについての追加検討)」で提案した銅貨1〜3枚は暫定値。宿屋・酒場サービス(食事以外に宿泊費等)を将来追加する場合、そのレンジ内でのバリエーション付けが必要になる。

## 実装ステップ(想定・未実施)

1. `src/utils/currencyConstants.ts` を新規作成し、`GOLD_TO_SILVER_RATE` / `SILVER_TO_COPPER_RATE` / `GOLD_TO_COPPER_RATE` を定義。
2. `src/utils/unitUtils.ts` に `toCoinage()` / `formatCoinage()` を追加。
3. `GoodsEditorDialog.tsx:299` の生書きを `formatPrice()` 経由に統一(最低限の修正)。
4. `formatPrice()` の呼び出し32箇所を4カテゴリ(市場・交易/Burg・State国庫/キャラクター所持金/その他)ごとに `formatCoinage()` へ移行するか判断し、UIごとにPlaywrightで見た目を確認しながら置き換え。
5. `src/i18n/locales/en.json` / `ja.json` の `about.costOfLiving*` 5キー×2言語を金貨/銀貨/銅貨表現に書き換え、[cost-of-living.md](../analytics/cost-of-living.md) の計算方法セクションも合わせて更新。
6. `toCoinage()` / `formatCoinage()` の境界値(0、負値、1銀貨未満の端数、金貨繰り上がり)を対象にした新規ユニットテストを追加。
7. `npx tsc --noEmit` / `npm run lint` / `npx madge --circular` / 既存テストスイート全体で回帰がないことを確認(フェーズ1は表示層のみのため、経済系テストの期待値は変更不要のはず)。
