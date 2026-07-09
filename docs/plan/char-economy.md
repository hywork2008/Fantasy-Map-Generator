# 経済拡張向けのキャラクター作成

## 質問1

コード編集ではなく相談です。

本プロジェクトはD&DのようなRPGに、主要なプレイヤーキャラクターが生きている世界の背景を構築する為のものです。

Economy拡張機能のMarkets OverviewにOwnerという項目がある。
これをNobility拡張機能でキャラクターを作成したい。

Shipyardsには出来上がった船の納品先としてのOwner項目があります。

今後のNPC拡張を考えるとNobilityをCharacter Creationの拡張機能に設定しなおし、Nobilityはそのキャラクターを使って政治上の意思決定をするアルゴリズムか何か別の機能に置き換えた方が良さそうに見える。

## 回答1

Viewed char-economy.md:1-13

ご相談ありがとうございます。非常に理にかなった、素晴らしいアーキテクチャのアイデアだと思います。

NPC（キャラクター）の「データ（存在）」と、「役割・システム（貴族としての政治行動、市場のオーナー、船の所有者など）」を分離（デカップリング）することは、拡張性の高いシステムを作る上でのベストプラクティス（例えばゲーム開発におけるECS：Entity Component Systemに似たアプローチ）です。

現在の状態から提案されている設計への移行について、以下のように整理してみました。

### 1. 「Character（NPC）拡張機能」の独立化（Core System）
Nobility拡張機能からキャラクター生成部分を切り離し、汎用的な「キャラクター管理基盤」とします。
*   **データ構造**: ID、名前、年齢、文化、所属（Burg）、能力値や性格（Traits）、資産など、役割に依存しない基本的なデータのみを保持します。
*   **役割**: 世界に生きる「人物」を生成し、リストとして管理するだけです。

### 2. 各システム（拡張機能）からの参照（Roles / Systems）
他の拡張機能は、自前で人物を作るのではなく、Character拡張機能が生成したキャラクターのIDを参照（リンク）するようにします。

*   **Nobility（政治システムへの特化）**:
    *   特定のキャラクターに「公爵」「王」などの称号（Title）を付与。
    *   領地の統治、宣戦布告、同盟、後継者争いなどの**「政治的な意思決定アルゴリズム」**に専念します。
*   **Economy / Markets**:
    *   特定の市場（Market）の `Owner` としてキャラクターIDを紐付けます。
*   **Shipyards**:
    *   建造された船の `Owner` としてキャラクターIDを紐付けます。
*   **将来の拡張（例: Guilds, Military, Magic）**:
    *   「ギルドマスター」「将軍」「大魔魔術師」といった役割も、すべて共通のキャラクタープールから割り当てることが可能になります。

### この設計がもたらすメリット
*   **深いロールプレイ体験の実現**: 例えば、「ある市場のオーナー（Economy）であり、かつ複数の貿易船を所有（Shipyards）している大商人が、実は裏で小国の男爵（Nobility）として政治を操っている」といった、TRPGの背景として非常に魅力的なクロスオーバーがデータレベルで自然に表現できるようになります。
*   **開発の独立性**: 「政治システム（Nobility）」を改修しても「キャラクターデータ」が壊れることがなくなり、コードの見通しが良くなります。

---

**今後の進め方についてのご提案**

この方向性で進める場合、まずは以下のようなステップを踏むのが安全かと思いますが、いかがでしょうか？

1.  **データスキーマの設計**:
    *   新しく作る「Character（NPC）」オブジェクトに持たせるべき基本プロパティ（名前、性別、文化、年齢など）を定義する。
2.  **Nobility拡張機能の解体と移行**:
    *   現在のNobilityから「キャラクター生成ロジック」を新しい拡張機能（例: `npcs` または `characters`）に移行する。
3.  **連携部分の実装**:
    *   Economy (Markets) や Shipyards の `Owner` フィールドが、新しいキャラクターリストから選択・参照できるように UI やデータを改修する。

まずはどのようなキャラクターのデータを保持したいか（ステータスや性格など、D&Dの背景として必要な項目）など、データモデルの設計から深掘りしていくのが良いかと思いますが、いかがでしょうか？どのようなことでもお気軽にご相談ください！

## 質問2

為政者ではない雑多な登場人物達を引き続きNobility拡張機能で管理する場合のメリット・デメリット

## 回答2

為政者ではない雑多な登場人物（商人、船主、ギルド職人など）を、引き続き現在の **Nobility（貴族）拡張機能の中** で一元管理する場合のメリットとデメリットをまとめました。

### メリット (Pros)

1. **移行コスト・リファクタリングの手間が最小限**
   * 新しい「Character拡張機能」をゼロから作成し、ライフサイクル（有効化/無効化時の処理）やUIを構築する手間が省けます。
   * 現在のNobilityが既に持っている「名前の生成」「家族関係」「基本ステータス」の仕組みをそのまま流用できます。
2. **データの保存先が1つで済む**
   * セーブデータ（JSON）に書き出す際、キャラクターデータが全て `extensions.nobility.characters` のような単一の階層にまとまるため、ロード/セーブ処理がシンプルに保てます。
3. **身分の流動性を表現しやすい（下剋上など）**
   * 同じデータプール内にいるため、「一介の商人が、のちに爵位を金で買って貴族になる」あるいは「没落した貴族が商人になる」といったステータスの変化を、フラグの書き換え（例: `isNoble: true` にするだけ）で簡単に実装できます。

---

### デメリット (Cons)

1. **名前（セマンティクス）と実態の乖離による混乱**
   * 「Nobility（貴族階級）」という名前の機能が、平民や商人、海賊まで管理することになり、コードを読む開発者（将来の自分を含む）にとって直感的ではなくなります。
   * ユーザー側から見ても、「なぜ市場のオーナーを作るために『貴族』拡張機能をONにしなければならないのか？」という違和感に繋がります。
2. **依存関係の強結合（Coupling）**
   * EconomyやShipyardsが「キャラクター」を必要とする場合、常に「Nobility拡張機能」への依存関係が発生します。
   * 「貴族の政治劇はいらないが、経済と商人のロールプレイだけ楽しみたい」というユーザーがいた場合、Nobility拡張機能をOFFにできなくなってしまいます。
3. **ロジックの肥大化とバグの温床（God Object化）**
   * Nobility拡張機能の中に、「政治的判断をするAIロジック」と「市場の売買を管理するロジック」などが混在しやすくなります。
   * 例えば、「毎年、貴族同士で宣戦布告の判定を行う」というループ処理を回す際、常に `if (!char.isNoble) continue;` のように雑多な人物をフィルタリングする処理が必要になり、パフォーマンスの低下やバグ（間違って商人が宣戦布告してしまう等）の温床になります。

---

### 結論と折衷案

もし「新しい拡張機能を作るのは大掛かりすぎる」と感じる場合は、**Nobility拡張機能自体の名前と役割を変えてしまう（リネームする）** というアプローチがおすすめです。

* **折衷案**: `Nobility` 拡張機能の名前を `Characters` または `NPCs` にリネーム（概念の拡張）します。
  * その中で、「キャラクターの生成・管理」をベース機能とし、「貴族としての政治行動」は、その中の1モジュール（あるいは特定の役職に就いているキャラクター専用のロジック）として扱う形です。

これにより、コードの分離（デカップリング）にかかる労力を抑えつつ、意味的な混乱（デメリット1と2）を解消することができます。いかがでしょうか？

---

**実装コードを確認した上での追加見解**

- Markets Overviewの`Owner`（`getOwnerStateName()`, `markets-overview.ts:440`）もShipyardsの`Owner`（`ShipyardOwner = "state" | "market"`）も、現時点では**キャラクターIDへの参照を一切持たない、State/Burg由来の表示専用プロジェクション**であることを確認した。つまりOwnerはまだCharacterと配線されていない。
- 一方でNobility拡張の`index.tsx`には、外交補正・将校任命・諜報・戦略プランナー・動員・小競り合い解決など、質問2で懸念していた「政治ロジックとキャラクター生成ロジックの混在（God Object化）」が既に進行している。
- ShipbuildingがEconomyに対して`dependencies: [{ id: "economy", required: false }]`を宣言してCustomEventで疎結合連携する仕組み、および`registerSkillModifier`/`getEffectiveSkill(characterId, skill)`という「importせずに他拡張のキャラクターデータを参照する」レジストリパターンが、既にコードベース内に実績として存在する。

**結論**: OwnerがまだCharacterに未接続の今が最も移行コストの低いタイミングであるため、質問1の「完全分離案」を、折衷案（リネームのみ）ではなくそのまま採用するのを推奨する。理由は、後からOwner⇄Character配線を剥がして繋ぎ直すより、配線前に分離した方が明らかに安いこと、また上記の依存宣言・レジストリパターンをテンプレートとしてそのまま転用できるため、想定より移行コストが低いこと。

## 質問3

名前・年齢など一般的な情報を持つCharacterオブジェクトに、D&Dの能力値セット・Crusader Kings 3の能力値セット・その他のゲームの能力値セットのように、内部プリセットから選んで能力値を持たせられるようにしたい。

## 回答3

D&D用・CK3用と決め打ちの型を増やしていくと、新しいゲーム系統を追加するたびにCharacter型そのものを変更することになり、せっかく分離したCharacter拡張が再び特定システムに引っ張られてしまう。既存の`registerSkillModifier`と同様の「レジストリに登録して疎結合に参照する」パターンを能力値プリセットにも適用する。

### 設計

**プリセットはデータとして登録する（コアには書き込まない）**

```ts
// src/extensions/characters/abilityPresets.ts
export interface AbilityStatDef {
  key: string;          // "STR", "diplomacy" など
  label: string;
  min: number;
  max: number;
  default: number;
}

export interface AbilityPreset {
  id: string;            // "dnd5e", "ck3e", "custom:my-system"
  label: string;
  stats: AbilityStatDef[];
  generate(rng: () => number): Record<string, number>;
}
```

Character拡張の初期化時に組み込みプリセット（D&D 5e: STR/DEX/CON/INT/WIS/CHA、CK3風: Diplomacy/Martial/Stewardship/Intrigue/Learning/Prowess）を登録し、他拡張（将来のダイナミック拡張含む）が`registerAbilityPreset()`で独自システムを追加できるようにする。

**Character側は「プリセットID＋値のマップ」だけを持つ**

```ts
export interface AbilityProfile {
  presetId: string;
  values: Record<string, number>;
}

export interface Character {
  // ...name, age, culture など役職非依存の基本項目
  abilityProfile: AbilityProfile;
}
```

厳密なUnion型にはせず`Record<string, number>`＋プリセット側のスキーマで妥当性を担保する（`any`は使わない）。読み出し側は`getAbilityValue(character, "STR")`のようなヘルパーを介し、キー不在時はプリセットの`default`にフォールバックする。

**UIはプリセット定義から動的生成**

プリセット選択ドロップダウン→選ばれた`AbilityPreset.stats`をもとにスライダー/入力欄を動的レンダリングする。新プリセット追加時にダイアログ側の実装変更は不要。

**レイヤー配置**

- プリセット定義＋`generate()`ロジック: Generator層（`characters-generator.ts`が呼び出し）
- レジストリ（`registerAbilityPreset`/`getAbilityPreset`）: Character拡張のcontextモジュール（`getApi()`パターンと同じ場所）
- 選択UI: Editor層のReactダイアログ

## 質問4

Economy拡張機能のMarkets Overviewに表示されるOwnerは、実際には人物ではなく国名だった。
各Marketに責任者としてランダム名のCharacterを作成し、Characters Overviewに表示したい。

ただしMarketは国家に従属するものではなく、`pack.cells.market`で表される独自の担当・支配地域を持つ。
その地域集合がたまたま国家の領域と重なることはあるが、MarketとStateは別概念として扱う。
複数Marketを国家、宗教組織、商会などが束ねる仕組みは別フェーズで設計する。

## 回答4 / 実装結果

### 採用した設計

- 各`Market`に1人ずつMarket責任者キャラクターを作成する。
- `Market`は`managerCharacterId?: number`を持ち、責任者をCharacter IDで参照する。
- `ownerCharacterId`という名前は使わない。国家的所有・法的所有を意味してしまうため、今回の概念には強すぎる。
- Market責任者はCharacterの`titles`ではなく、非政治的な`roles`に保持する。
- EconomyはCharactersを必須依存にする。
- Nobilityのキャラクター再生成・削除では、Market責任者を消さない。

### データモデル

`CharacterRole`を追加した。

```ts
export interface CharacterRole {
  source: string; // "economy"
  kind: string; // "marketManager"
  entityType: "market" | "state" | "province" | "burg";
  entityId: number;
  label: string; // "Market Manager"
  startYear?: number;
  endYear?: number;
  reason?: string;
}
```

Market責任者は以下のroleを持つ。

```ts
{
  source: "economy",
  kind: "marketManager",
  entityType: "market",
  entityId: market.i,
  label: "Market Manager"
}
```

`Character`には、国家所属とは別に扱える任意フィールドも追加した。

```ts
birthStateId?: number;
nationalityStateId?: number;
roles?: CharacterRole[];
```

既存の`state`は当面UI grouping用の後方互換フィールドとして残す。
Market責任者の正規リンクは、`market.managerCharacterId`と`character.roles[].entityId`で表す。

### 生成・同期

Economyに`syncMarketManagers()`を追加した。

- 各Marketに有効な`managerCharacterId`がなければ、新規Characterを1人作る。
- 同じ国名・同じ旧Owner表示でも、Marketごとに別人を作る。
- 名前はCharactersの`createPerson()`を通して、文化ベースのランダム名で生成する。
- 文化・居住地は中心Burgから推定する。
- ただし、それは人物生成とUI表示のための初期値であり、MarketがStateに従属することは意味しない。

呼び出し箇所:

- `Markets.generate()`
- `Markets.addMarket()`
- Economy有効化時、既存Marketがある場合の補完
- Economyの`fmg:generate-post-core`生成処理

### UI

Markets Overview:

- 旧`Owner`列を`Manager`列へ変更した。
- 表示値は`market.managerCharacterId`から引いたCharacter名。
- 未解決時は`Unassigned`。

Characters Overview:

- `titles[0]`がないCharacterでも`roles[0]`を表示する。
- 列名は`Title`から`Title / Role`へ変更した。
- Market責任者は`Market Manager`として表示する。
- 検索対象にrole label/kindを追加した。

Character Details:

- `Roles`セクションを追加した。
- Market責任者の場合は、担当Market名と中心Burgを表示する。

### Nobilityとの関係

Nobilityの`Characters.generate()` / `Characters.clear()`は、従来のように`pack.characters`を丸ごと消さない。

- `roles`を持たない政治キャラクターは再生成対象。
- EconomyのMarket責任者など、非政治roleを持つCharacterは保持する。
- 保持するCharacterからは、Nobility由来の`titles`、`affinities`、`marriages`をクリアする。
- `state.rulerId`はNobility再生成前にクリアし、再生成された政治キャラクターだけで再設定する。

### Economy無効化

Economyを無効化する場合:

- 各Marketの`managerCharacterId`を削除する。
- CharacterからEconomy由来roleを削除する。
- 他の`titles`や`roles`を持たないEconomy-only Characterは削除する。
- 他システムのtitle/roleを持つCharacterは残す。

### 実装ファイル

- `src/extensions/economy/generators/marketManagers.ts`
- `src/extensions/economy/generators/markets-generator.ts`
- `src/extensions/economy/controllers/markets-overview.ts`
- `src/extensions/economy/ui/dialogs/MarketsOverviewDialog.tsx`
- `src/extensions/characters/characterTypes.ts`
- `src/extensions/characters/controllers/characters-overview.ts`
- `src/extensions/characters/ui/components/tables/CharactersTable.tsx`
- `src/extensions/characters/ui/dialogs/CharacterDetailsDialog.tsx`
- `src/extensions/nobility/generators/characterLifecycle.ts`

### テスト

追加・更新したテスト:

- `src/extensions/economy/generators/marketManagers.test.ts`
- `src/extensions/economy/generators/markets-generator.test.ts`
- `src/extensions/nobility/generators/characterLifecycle.test.ts`

確認したこと:

- `syncMarketManagers()`後、全Marketに`managerCharacterId`が入る。
- 同じState配下の複数Marketでも、責任者CharacterはMarketごとに別人になる。
- Market責任者は`roles.kind === "marketManager"`を持つ。
- Economy無効化相当の`clearMarketManagers()`で、Economy-only Characterは削除される。
- 他titleを持つCharacterは、Economy roleだけ削除されて残る。
- Nobility再生成後もMarket責任者は保持される。

実行済み検証:

- `npx vitest run src/extensions/economy/generators/marketManagers.test.ts src/extensions/economy/generators/markets-generator.test.ts src/extensions/nobility/generators/characterLifecycle.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`

### 今後の別フェーズ候補

- Market責任者を手動変更するUI。
- Market責任者の所属組織、商会、宗教組織、国家との契約・庇護関係。
- Market領域をStateやReligionとは独立した政治・経済圏として編集するUI。
- ShipbuildingのOwner/納品先もCharacter ID参照へ移行する。
