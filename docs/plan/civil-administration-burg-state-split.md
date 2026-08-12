# Civil administration の内訳分解と Burg/State 按分 設計

## 状態

**実装済み。** Edit State ダイアログ Fiscal Report タブの Treasury outflows のうち、内訳を一切持たない単一の "Civil administration" 行を調査した結果として着手した。[department-budget-spending-effects.md](./department-budget-spending-effects.md)(multi-ledger PR-17)の続き。

## 背景・問題

`administrativeUpkeep`(taxes-generator.ts)は、州の domesticIncome に対する完全に不透明な単一の固定割合として実装されていた:

```
administrativeUpkeep = rawDomesticIncome × administrativeUpkeepShare
```

`administrativeUpkeepShare`は[economyStartMode.ts](../../src/extensions/economy/generators/economyStartMode.ts)の経済開始モードごとに固定(provisioned 0% / **balanced(新規マップ既定) 88%** / subsistence 95%)。コードコメントには「courts, scribes, tax farmers, messengers, and routine local administration」と書かれていたが、実装は内訳を一切持たない単一の減算だった。

**この控除はPR-17の6部門予算システムより遥かに大きい**——部門予算(marshalcy〜ecclesiastica)は、この控除で残った12%(balancedモード)の中からしか配分されない。つまり「為政者が一番削りたいのはCivil administrationのはず」というユーザー指摘は、規模の面でも正確だった。

同時に`burg.treasury`側を調査すると:

- [burg-treasury-equilibrium.md](./burg-treasury-equilibrium.md)の調査時点(2026-07-31)で、burg.treasuryの支出先は原材料購入と略奪イベントのみで、恒常的な維持費が存在しなかった。
- その後`urbanWaterSystem.ts`が上下水道の維持費を追加したが、これは自己資金(清掃税)による独立採算。
- [guildTreasury.ts](../../src/extensions/economy/generators/guildTreasury.ts)の`settleAnnual()`が、burg.treasuryの「快適水準」超過分を毎年Market金庫とState treasuryへ上納する仕組みを**既に実装済み**(burg-treasury-equilibrium.md自身は「未実装」と書かれているが、これはドキュメントが実装に追いついていない例——AGENTS.mdの`docs/plan/`の扱いに関する注意書き通り)。

つまりBurgは既に「快適水準を超えた分をStateへ渡す」仕組みを持ちながら、courts/scribes/tax farmers のような地方行政コストに相当する経常支出をほとんど持たない。一方pollTax収入はburg.treasuryを一切経由せずstate.treasuryへ直接発生する完全に独立した流れであり、「地方行政」という機能に対応する実際の金の動きがどこにも存在しなかった。

## 設計方針

`administrativeUpkeep`の**合計額は変更しない**(`economyStartMode.ts`の各モードの割合値は据え置き)。既存の単一控除を、5つの名前付きコンポーネントに分解し、うち地方色の強いものをState統治形態に応じてBurg側へ按分する。

### コンポーネント構成([civilAdministration.ts](../../src/extensions/economy/generators/civilAdministration.ts))

| コンポーネント | 割合 | Burg按分対象か |
| :--- | ---: | :--- |
| courts(裁判所) | 25% | ✅ |
| scribesNotaries(書記・公証人) | 20% | ✅ |
| taxFarmers(徴税請負人) | 20% | ✅ |
| messengers(急使・伝令網) | 15% | ❌(常に100% State) |
| routineLocalAdministration(日常の地方行政) | 20% | ✅ |

messengersを常にStateに固定しているのは、急使網が「地方自治」ではなく「中央の物流・通信インフラ」という性質上、統治形態に関わらず中央が担うのが自然なため。

### Burg按分比率(`BURG_LOCAL_ADMINISTRATION_SHARE_BY_FORM`)

地方コンポーネント合計(85%)のうち、Burgが負担する割合。[state-treasury-department-budget.md](./state-treasury-department-budget.md) §1の史実調査と同じ根拠を使う:

| 統治形態 | Burg按分率 | 根拠 |
| :--- | ---: | :--- |
| Republic | 70% | ヴェネツィア/ジェノヴァ型都市共和国の強い自治伝統 |
| Union | 65% | 構成国自治、中央は薄い(既存のtreasuryAllocation.tsのUnion構造係数と同じ考え方) |
| Monarchy | 45% | 巡回裁判官など中央の関与も一定量ある |
| Theocracy | 40% | 地方行政が教会法官僚機構(=Ecclesiastica部門で別途会計)と一体化しており、俗人の地方自治の比重は相対的に低い |
| Anarchy | 15% | どちらのレベルでも機構自体が機能していない |

### 按分の実装ルール

- Burg按分は**該当Stateに属し人口>0のBurgが1つ以上存在する場合のみ**発動する。Burgが存在しない(例: 序盤・Burgを失った残存State)場合は地方コンポーネント全額がStateに留まる——「持っていない都市に行政を委譲する」という不自然な割引を防ぐ。
- Burg間の配分は人口比例。
- 各Burgの支払いは**現金制約あり**(`burg.treasury`をマイナスにしない)。
- **Stateの負担額は「Burgが実際に払えた額」ではなく「按分で本来Burgが払うべき額(desired)」を基準に計算する**——Burgが払えなかった分をStateに押し戻すと、按分の意味(「Stateの負担を実際に減らす」)が消えてしまうため。払えなかった分は系全体として単純に「今期は執行されなかった行政コスト」として扱う(既存の他のPR-17系メカニクスと同じ、"underfunded = real consequence, not silently absorbed elsewhere" という方針を踏襲)。

### `budgetIncome`(部門予算サイジング)への影響

意図的に**変更していない**。`budgetIncome`は引き続き元の`administrativeUpkeepShare`(全体の想定コスト率)を使って計算する。Stateが実際に負担する額(`totalFromTreasury`)がBurg按分により小さくなっても、部門予算の名目サイズは変えない——差額は単純に`state.treasury`に多く残る(治療の増加として体感できる)。部門サイジングとBurg按分ロジックを結合させず、それぞれ独立に動くようにするための意図的な設計判断。

## Fiscal Report UI

[StateFiscalReportTab.tsx](../../src/extensions/economy/ui/components/StateFiscalReportTab.tsx)の`EXPENSE_LABELS`から`administrativeUpkeep`(単一行)を削除し、5つの新しい行("Civil administration — courts"等)に置き換えた。表示される数値は**Stateが実際に負担した額**(Burgが吸収した分は既に差し引かれた後の値)。Burg側が負担した額(`burgLocalAdministrationPaid`)はstate.treasuryのフローではないため、このタブには表示していない(タブ自身のキャプション「Public treasury settlements only」の対象外)。

## 非目的

- Burg側の"local administration"負担に対する専用の可視化UI(Burg版Fiscal Report)——`burgLocalAdministrationPaid`は`civilAdministration.ts`の戻り値として既に取得可能だが、表示先は未実装。将来必要になれば追加できる。
- Burgが地方行政費を払えなかった場合の具体的なゲーム内帰結(治安/衛生の悪化など)——現時点では「今期は執行されなかった」で終わり、civic-conditions.mdのsecurity/sanitationスコアへの接続はしていない。
- コンポーネント別割合(25/20/20/15/20%)・Burg按分率(45〜70%)の数値調整——他のPR-17系定数と同様、仮値であり実プレイでのバランス確認が必要。

## テスト

[civilAdministration.test.ts](../../src/extensions/economy/generators/civilAdministration.test.ts): フォーム別按分率、Burg不在時のフォールバック、複数Burgへの人口比例配分、他州のBurgを巻き込まないこと、現金制約(Burgが払えない場合にStateへ押し戻さないこと)を検証。[taxes-generator.test.ts](../../src/extensions/economy/generators/taxes-generator.test.ts)の既存テストは全てBurgなし/`administrativeUpkeepShare=0`のいずれかの条件で書かれていたため、本変更による数値ドリフトは1件のみ(旧`administrativeUpkeep`キーを直接参照していたテストをキー分解後の合算に更新)。
