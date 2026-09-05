# 国家財政の構造的赤字（-42%/yr）原因調査

## 状態

**調査完了。実装（修正）は行っていない。** 2026-09-05、ユーザー指示により新規起票。

`docs/plan/advance-time-fast-forward.md` §5.3.3（Fast-Forward機能のPhase 0キャリブレーション作業中に発見、
5シードで-37.6〜-46.4%/yr、ウォームアップ3/10/15年いずれでも同水準——一過性ではない構造的特性と判定）を受け、
「なぜ`state.treasury`が現行デフォルトバランスで恒常的にこれほど大きく減り続けるのか」を実測データに基づいて
調査した。**結論: 原因は単一の系統的パターンに強く集中しており、既存の一過性ランダムイベントや税制側の
問題ではない（§3・§4）。**

## 関連ドキュメント

| Doc / Code | 関係 |
| :--- | :--- |
| `docs/plan/advance-time-fast-forward.md` §5.3.3 | 本調査の発端になった実測結果（Fast-Forwardプリセットのキャリブレーション） |
| `scripts/diagnoseTreasuryDecline.ts`（`npm run diagnose:treasury`、本調査で新設） | `state.treasury`の全ての増減をコールサイト単位で記録する診断ツール |
| `docs/analytics/treasury-decline-diagnosis.json` | 本調査の実測生データ |
| `docs/plan/chemistry-medicine-knowledge-accumulation.md` §4.2 | 「年予算」という設計方針が最初に明文化された元ドキュメント（§4参照） |
| `docs/plan/state-treasury-department-budget.md` | 国庫支出の部局別配分の既存実装（`treasuryAllocation.ts`）——本調査の対象ではないが同じ`state.treasury`を扱う |
| `docs/plan/economy-coupling-audit.md` | 「個別には正しいが集約すると見落とされる」結合度問題を扱う既存監査——本調査はその財政版に相当する |
| `docs/plan/burg-treasury-equilibrium.md` | `civilAdministration.ts`が参照する先行調査（§3で安全側の一例として言及） |

---

## 1. 調査手法

`scripts/diagnoseTreasuryDecline.ts`（`npm run diagnose:treasury`）を新設した。既存の
`scripts/calibrateFastAdvance.ts`と同じハーネス（`scripts/lib/advanceYearHarness.ts`）でマップ生成・
拡張有効化・ウォームアップを行った後、**全`State`の`treasury`プロパティを`Object.defineProperty`で
getter/setterに置き換え**、以後のすべての書き込みについて:

- 増減額（`delta`）
- 呼び出し元（`new Error().stack`から抽出したソースの`file:line`——多くの呼び出し元が
  `chemMedCommon.ts`の共有ヘルパー`debitTreasury()`を経由するため、そのヘルパー自身のフレームだった場合は
  さらに1段上の実際の呼び出しモジュールまで遡って記録する）

を記録する。実行後、`(before, after)`の実測差分と全ログの合計が一致することで計測漏れが無いことを検証した上
（本調査の実行では**完全一致**、`docs/analytics/treasury-decline-diagnosis.json`の`sumOfLoggedDeltas`と
`actualDelta`参照）、コールサイト別に集計した。

実行条件: seed=`treasury-diagnosis-1`、`characters,economy`拡張、ウォームアップ10年→計測3年
（Fast-Forwardキャリブレーションと同条件）。1シードのみだが、元の5シードキャリブレーション
（`docs/analytics/fast-advance-calibration.json`）が-37.6〜-46.4%/yrという狭いレンジで一致していたことから、
本調査で見つかった構造的パターンが他シードでも同様に支配的である可能性は高いと考えている（複数シードでの
再確認は§6の今後の課題）。

## 2. 実測結果: コールサイト別内訳（3年間、全State合計）

`Before=5356.07 → After=2109.33（実測差分-3246.74、ログ合計も-3246.74で完全一致）`

| コールサイト | 収入 | 支出 | 純額 | 収入イベント数 | 支出イベント数 | 分類（§3） |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `dams.ts`（新設+毎年更新の2箇所） | 0 | -1,352.00 | -1,352.00 | 0 | 52 | 🔴定額・毎年全額 |
| `experimentalWorkshops.ts`（2箇所） | 0 | -656.00 | -656.00 | 0 | 41 | 🔴定額・毎年全額 |
| `apothecaryWorkshops.ts`（2箇所） | 0 | -516.00 | -516.00 | 0 | 43 | 🔴定額・毎年全額 |
| `levees.ts`（2箇所） | 0 | -380.00 | -380.00 | 0 | 38 | 🔴定額・毎年全額 |
| `hospitalInstallations.ts`（2箇所） | 0 | -120.00 | -120.00 | 0 | 6 | 🔴定額・毎年全額 |
| **🔴小計（chemMedCommon家族、5モジュール分のみ計測——§3参照）** | **0** | **-3,024.00** | **-3,024.00** | **0** | **180** | **総赤字の93.1%** |
| `fiscalEvents.ts`（複数箇所、正負混在） | +925.00 | -1,119.19 | -194.19 | 37 | 117 | 🟡ランダムイベント（ほぼ均衡） |
| `civilAdministration.ts` | 0 | -500.67 | -500.67 | 0 | 67 | 🟢収入比例（安全） |
| `stateSecretKnowledge.ts` | 0 | -267.50 | -267.50 | 0 | 42 | 🟢treasury比例（安全） |
| `revenueMix.ts` | +31.78 | -131.80 | -100.02 | 27 | 27 | ？未調査（小規模） |
| `wildernessEcology.ts` | 0 | -81.00 | -81.00 | 0 | 15 | ？未調査（小規模） |
| `treasuryAllocation.ts`（複数箇所） | +174.90 | -91.59 | +83.31 | 57 | 154 | 🟢純額はプラス |
| `portDevelopment.ts` | 0 | -30.00 | -30.00 | 0 | 3 | ？未調査（小規模） |
| `climateDisasters.ts` | 0 | -8.00 | -8.00 | 0 | 1 | 🟢災害対応（想定通り） |
| `agTechInvestment.ts` | 0 | -1.62 | -1.62 | 0 | 1 | 🟢treasury比例（安全） |
| `urbanWaterSystem.ts` | +34.11 | -34.11 | 0 | 12 | 12 | 🟢内部振替（純額0） |
| `taxes-generator.ts` | +877.00 | 0 | +877.00 | 72 | 0 | 通常の税収 |
| **🟡🟢小計（上記すべて、chemMedCommon家族を除く）** | **2,042.79** | **-2,265.53** | **-222.74** | — | — | **総赤字の6.9%** |

**中核経済（税収・行政・機密研究・財政イベント・歳入構成・財務配分・災害対応など）はそれ自体ほぼ均衡している
（3年で-222.74、年あたり-74程度）。総赤字-3246.74の93.1%は、`chemMedCommon.ts`の共有ヘルパーを使う
施設系モジュール群のうち、この時点（シミュレーション約10〜13年目）で既に解禁されていた5モジュール
（ダム・実験工房・薬種工房・堤防・病院）だけで説明できる。** 生データは
`docs/analytics/treasury-decline-diagnosis.json`。

## 3. 根本原因: 「毎年全額再徴収」される定額の施設維持費

### 3.1 パターンの実体

[`chemMedCommon.ts:144-150`](../../src/extensions/economy/generators/chemMedCommon.ts)の共有ヘルパー:

```ts
export function debitTreasury(stateId: number, amount: number): boolean {
  const state = getWorldContext().pack.states?.[stateId];
  if (!state?.i || state.removed || amount <= 0) return false;
  if ((state.treasury ?? 0) < amount) return false;
  state.treasury = rn((state.treasury ?? 0) - amount, 2);
  return true;
}
```

これ自体は単純な「引き落とし可能なら引き落とす」処理で問題は無い。問題は**呼び出し側**にある。
[`dams.ts`](../../src/extensions/economy/generators/dams.ts)を例に取ると:

```ts
// 新設時（foundNewDams、96行目）
if (!burgId || !debitTreasury(state.i, DAM_BUDGET)) continue;
// ダムを新規作成...

// 毎年の決済（settleDam、121行目）— 既存の稼働中ダム全てに対して、新設時と「同額」を再度引き落とす
if (!debitTreasury(dam.stateId, DAM_BUDGET)) {
  dam.active = false;  // 払えなければ稼働停止（"fundingCut"）
  ...
  return;
}
```

**新設コストと「毎年の維持費」が同一の`DAM_BUDGET`（26）で、減額も償却も無い。** 一度建てたダムは、
建設した年と全く同じ金額を、稼働している限り毎年払い続けなければならない——現実の公共事業なら初期投資
（資材・労賃）の後は数分の一程度の維持費で済むはずのところ、このコードでは「建設費 ＝ 恒久的な年間予算」
という設計になっている。

### 3.2 このパターンは意図的に設計された仕様である

[`chemistry-medicine-knowledge-accumulation.md` §4.2](chemistry-medicine-knowledge-accumulation.md)は
この挙動を明示的に文書化している:

> 開設は Economy generator。（…）`state.treasury`を減算する。**以後毎年、年予算が払えなければ
> `active = false`**（record は減衰、即ゼロにしない）。

そして表の列名も「年予算」——開設コストと同じ数値を、そのまま繰り返し徴収される「年予算」として明記して
いる。**したがって個々のモジュール単体で見れば、これはバグではなく設計ドキュメント通りの実装である。**

### 3.3 このパターンが他11モジュールにも同一の形で存在することを確認済み

`debitTreasury()`を呼ぶモジュールは21個ある（`grep -rln "debitTreasury(" src/extensions/economy/generators/`）。
うち11個で「新設1回debit + 毎年1回debitのrenewal」という同一の2箇所呼び出しパターンを直接確認した:

| モジュール | 予算定数（[chemMedCommon.ts](../../src/extensions/economy/generators/chemMedCommon.ts)） | 新設debit行 | 毎年renewal debit行 |
| :--- | ---: | ---: | ---: |
| `acidPlants.ts` | 24 | 73行目 | 88行目 |
| `dams.ts` | 26 | 96行目 | 121行目 |
| `hospitalInstallations.ts` | 20 | 102・135行目（2基目あり） | 156行目 |
| `levees.ts` | 10 | 88行目 | 104行目 |
| `experimentalWorkshops.ts` | 16 | 70行目 | 84行目 |
| `apothecaryWorkshops.ts` | 12 | 47行目 | 58行目 |
| `chlorinePlants.ts` | 26 | 74行目 | 89行目 |
| `steelConverters.ts` | 32 | 44行目 | 59行目 |
| `powerStations.ts` | 36 | 54行目 | 70行目 |
| `telegraphLines.ts` | 18 | 39行目 | 54行目 |
| `electrolysisPlants.ts` | 42 | 45行目 | 60行目 |

残り10モジュール（`chlorAlkaliPlants`, `coldStorageDepots`, `gasPowerStations`, `lngPlants`, `mercuryPlants`,
`oilRefineryPlants`, `phosphateFertilizerPlants`, `syntheticAmmoniaPlants`, `climateDisasters`,
`chemMedCommon`自身）はコード確認していないが、同じ`chemMedCommon.ts`の予算定数命名規約
（`XXX_PLANT_BUDGET`, `XXX_STATION_BUDGET`）を共有しており、同型と推定している（未確認、§6）。

### 3.4 なぜ「実測で§2の5モジュールしか出てこなかった」のに深刻と言えるか

本調査を実行したシミュレーション年数（約10〜13年目）では、上記21モジュールのうち**まだ5個
（ダム・実験工房・薬種工房・堤防・病院——いずれも比較的早期にunlockする技術）しか解禁されていなかった**。
それでも総赤字の93%を説明してしまっている。[`chemMedCommon.ts`](../../src/extensions/economy/generators/chemMedCommon.ts)
の予算定数コメントを見る限り、酸プラント・塩素プラント・クロルアルカリ・冷蔵倉庫・電解・実験炉・
ガス発電所・水銀・石油精製・リン酸肥料・発電所・製鋼転炉・合成アンモニア・LNG・電信線の残り16モジュールは
軒並み「era 4〜7」相当のより後期の技術（多くのBUDGET定数コメントに"calibration TBD"と明記されている——
校正が最後まで行われなかったことを示唆）で、**長期プレイでこれらが順次解禁されるたびに、同じ「定額・毎年
全額」パターンの新しい支出項目が積み上がっていく。** 個々の技術解禁時点では「小さな追加コストのはず」と
判断されていたと推測されるが（各BUDGET値は10〜42の狭いレンジ）、**21モジュール合計でどれだけの年間コミット
になるかを横断的に検証した形跡は見当たらなかった**（各vertical-slice設計ドキュメントは自分のモジュール単体
の予算感だけを記述しており、他の20モジュールとの合算を検討していない）。

## 4. 「安全」なパターンとの対比

同じ`state.treasury`を触る他のモジュールには、**treasury/収入に対する割合ベースで自己制限的**な、
より安全な先例が既に存在する:

- [`agTechInvestment.ts:136`](../../src/extensions/economy/generators/agTechInvestment.ts):
  `totalBudget = Math.max(0, state.treasury ?? 0) * STATE_BUDGET_SHARE_OF_TREASURY`
- [`stateSecretKnowledge.ts:68`](../../src/extensions/economy/generators/stateSecretKnowledge.ts):
  `budget = Math.max(0, state.treasury || 0) * STATE_SECRET_BUDGET_SHARE_OF_TREASURY`（5%）
- [`civilAdministration.ts`](../../src/extensions/economy/generators/civilAdministration.ts):
  `totalAdminUpkeep`は`taxes-generator.ts`側で`rawDomesticIncome × administrativeUpkeepShare`として
  算出される——**収入に比例**し、かつこのモジュール自体のdoc commentが「合計額は変更していない、既存の
  按分を変えただけ」と明記している既存の安定コンポーネント。

これらは**treasuryや収入が縮小すれば支出も自動的に縮小する**ため、単体では恒久的な赤字の原因になり得ない
（§2の実測でも中核経済全体の純額は年-74程度で安定していた）。対して§3のパターンは**支出額が固定**で
treasury側の縮小に反応しないため、施設数が積み上がるほど、あるいはtreasuryが小さい国ほど、相対的な負担が
際限なく重くなる。

## 5. まとめ

| 項目 | 判定 |
| :--- | :--- |
| 単一の原因に特定できるか | ✅ できる——`chemMedCommon.ts#debitTreasury()`を共有する施設系モジュール群の「新設費＝恒久年間予算」パターン |
| 個々のモジュール実装は設計通りか | ✅ 設計通り（§3.2、`chemistry-medicine-knowledge-accumulation.md` §4.2に明記） |
| 21モジュール合計の財政インパクトは検証されていたか | ❌ 形跡なし。各vertical-sliceは単体の予算感のみで設計・calibration TBDのまま |
| 中核経済（税収・行政・治安・災害対応等）に問題はあるか | ほぼ無い（年-74程度、安定） |
| 今後さらに悪化するか | 高確率でYes——残り約16モジュール（多くがera4-7）が順次解禁されるたびに同型の固定費が積み上がる |

## 6. 今後の課題・未検証事項

- 残り10モジュール（`chlorAlkaliPlants`等）のコード確認——命名規約から同型と推定しているが未読了。
- 複数シードでの本コールサイト内訳の再現性確認——Fast-Forwardキャリブレーションの5シードでは総額の水準
  （-37.6〜-46.4%/yr）は一致していたが、内訳（どのモジュールが何%を占めるか）まではこの1シードでしか
  見ていない。
- より長期（20〜30年）シミュレーションで、後期モジュール（酸・塩素・アンモニア・電解等）が解禁された後の
  内訳がどう変化するかの追加計測。
- `fiscalEvents.ts`（収支ともに大きいがほぼ均衡、純額-194/3yr）の内容確認——本調査では規模の小ささから
  優先度を下げ未着手。

## 7. 対応案（実装はしていない、方針判断待ち）

いずれも本書のスコープでは実装しない。ユーザー判断で方針を決めてから着手する。

| 案 | 内容 | 長所 | 短所 |
| :--- | :--- | :--- | :--- |
| **A. renewal debitを減額** | 毎年の`debitTreasury`呼び出しを新設コストの一部（例: 10〜20%）に変更し、「建設費」と「維持費」を分離する | 各モジュールの変更が1行で小さい、既存のfundingCut挙動は維持できる | 21箇所（+今後増える分）を個別に直す必要がある。適切な維持費率の根拠が別途必要 |
| **B. 州単位の集約予算上限を新設** | `AgTechInvestment`/`StateSecretKnowledge`と同じ「treasury/収入に対する割合」の上限を、21モジュール合計の施設維持費に対して導入し、上限超過分は優先度順（例: 古い施設優先/新しい施設優先）で`fundingCut`にする | 個々のBUDGET定数を変えずに済む。将来モジュールが増えても自動的に頭打ちになる | 新しい共有インフラ（優先順位付けロジック）が必要。既存モジュールの呼び出し構造の変更を伴う |
| **C. 現状維持（意図的な難易度カーブとして追認）** | 何も変更しない。「文明を維持するには常に再投資が必要で、怠ると衰退する」という設計として明示的に承認する | 変更コストゼロ | 本調査の実測（中核経済は年-74で安定なのに対し施設群だけで年-1000超）を踏まえると、意図した「衰退の圧力」というより「積み上げ式のバグ的膨張」に見える。少なくとも各vertical-slice文書の"calibration TBD"を解消する追加検証が要る |

## 8. 次のアクション

1. ユーザーに上記A/B/Cのどれで進めるか、または追加調査（§6）を先にやるかを確認する。
2. 方針が決まり次第、`docs/plan/advance-time-fast-forward.md`§5.2の「標準」プリセット国庫成長率
   （現在⚠保留）を、修正後の想定値または「意図的に-42%程度」のいずれかで確定させる。
