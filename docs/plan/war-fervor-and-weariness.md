# 国家世論モデル: 戦意（War Fervor）と厭戦度（War Weariness）設計

| 項目 | 内容 |
| :--- | :--- |
| 状態 | 設計案（Draft） |
| 更新日 | 2026-09-11 |
| 関連 | [skill-specializations.md](characters/skill-specializations.md), [fanatic-player-sacrificial-conflict.md](fanatic-player-sacrificial-conflict.md), [economy-war.md](economy-war.md), [military/manpower-ecosystem.md](military/manpower-ecosystem.md) |
| 主な接続先 | `State` (`warFervor`, `warWeariness`), `Burg.discontent`, `state.councilSupport`, `state.warFooting` |

---

## 1. 概要と背景

中世〜近世およびファンタジー世界における戦争は、君主や将軍の意志だけで完全に決定されるものではない。民衆・都市市民・聖職者・兵士たちの「戦意の高まり（好戦感情）」と「戦争疲弊（厭戦ムード）」が、開戦の敷居、動員令の受容、戦費の調達、そして講和条約の締結時期を強く規定する。

既存のFMGには、軍の不満（`state.militaryDiscontent`）、教会の不満（`state.religiousUnrest`）、都市の生活不満（`burg.discontent`）、市場の戦争激度（`ledger.warIntensity`）が存在するが、国家全体の「戦争に対する民衆世論」が単一の指標として存在しなかった。

本書は、国家（`State`）レベルに **戦意（`warFervor`）** と **厭戦度（`warWeariness`）** を導入し、謀略技能（扇動・情報統制）、軍事的展開、および宗教国家の「神敵認定による聖戦スイッチ」と統合する設計を定める。

---

## 2. コア・パラメーター（State スコープ）

各国家（`State`）は、以下の2つの 0〜100 の世論値を保持する。

```typescript
interface StateWarSentiment {
  /**
   * 戦意・好戦気運（0..100、平時基準値 10〜20）。
   * 敵愾心、大義名分への陶酔、開戦・動員への熱狂。
   * 高いと評議会支持が上がり、AIが開戦を選びやすくなる。
   */
  warFervor: number;

  /**
   * 厭戦度・戦争疲弊（0..100、平時基準値 0）。
   * 戦争継続、家族の死、重税、食料不足による社会全体の疲弊。
   * 高いと評議会支持が削られ、都市不満が悪化し、早期講和圧力となる。
   */
  warWeariness: number;
}
```

### ネット世論（Net War Stance）
政策判断では、戦意から厭戦度を差し引いた実効世論（Net Sentiment: −100〜+100）を用いる：
```text
netWarStance = warFervor - warWeariness
```
- `> +40`: **好戦的熱狂**。議会や民衆が自発的に戦争・遠征を要求。
- `0〜+40`: **受容・容認**。正当な防衛や大義名分があれば動員・開戦を支持。
- `−40〜0`: **消極・倦怠**。戦争への消極姿勢。増税や長期戦に不満が出始める。
- `< −40`: **激しい反戦・厭戦**。徴兵拒否、サボタージュ、暴動（`civilUnrest`）リスク、無条件講和要求。

---

## 3. 戦意（War Fervor）の動態

### 3.1 上昇要因（Inflows）
1. **扇動工作（`intrigue.propaganda`）の成功**:
   - Spymasterや扇動者が流言散布、大義名分の風説工作に成功した場合、対象国家・自国の `warFervor` が大きく上昇（+10〜+30）。
2. **大勝・敵要衝の占領**:
   - 華々しい戦果の報告により、熱狂が広がる（+5〜+15）。
3. **聖戦宣言（Holy War）／神敵認定（Anathema）**:
   - 宗教国家や正統教会による「神の敵に対する聖戦」が布告されると、信仰深い民衆の戦意が一気に上限近くまで沸騰する（+30〜+50）。
4. **宿敵（Rival）からの挑発や先制攻撃**:
   - 被害者意識と防衛本能が刺激される。

### 3.2 減衰・平時への回帰（Decay）
- 平時では、年次または月次で緩やかに平時基準値（10〜20）へ向かって減衰する。
- 平和が長く続くほど、民衆の好戦感情は自然に冷めていく。

---

## 4. 厭戦度（War Weariness）の動態

### 4.1 蓄積要因（Inflows）
1. **戦争の長期化（`ledger.warDurationTicks`）**:
   - 戦争が続く月ごとに基礎疲弊が蓄積する（月あたり +0.5〜+1.5）。
2. **成人男性の戦死（`demographicCasualties`）**:
   - 出征した兵士が未帰還となり、都市・農村の家庭に死者の報が届くたびに厭戦が増大する。
3. **生活苦・食料不足（`burg.foodSecurity` 低下）と戦時増税**:
   - 生活必需品の高騰、略奪、徴発が市民生活を圧迫する。
4. **重大な敗戦・領土の喪失**:
   - 勝ち目のない戦争に対する絶望。

### 4.2 抑制・回復要因（Sinks / Suppression）
1. **情報統制・検閲（`intrigue.censorship`）**:
   - 敗報、戦死者の実数、前線の悲惨な状況を社会流通から遮断・情報封殺することで、**厭戦度の月次蓄積を 30%〜70% カット** する。
2. **宗教的慰撫（Ecclesiastica の充足）**:
   - 救貧、戦没者慰霊、来世の救済を説くことで、厭戦を緩和する。
3. **終戦後の自然回復**:
   - 和平成立後、年次で大きく減衰（年あたり −10〜−20）。

---

## 5. 宗教国家の「神敵こじつけ聖戦スイッチ（Fabricate Anathema）」

宗教国家（Theocracy）や狂信勢力は、信仰をエネルギーとして民衆を動員する。
しかし、本来「聖戦（Holy War）」は異教徒や明白な異端に対してのみ成立するものであり、同宗教国や友好的な世俗国家に対して勝手に聖戦を叫ぶと、教会分裂や民衆の拒絶（`religiousUnrest` 急増）を招く。

これを突破するのが、**扇動と神学を組み合わせた「神敵こじつけ工作（Fabricate Anathema）」** である。

```
【こじつけ工作の成立フロー】
  intrigue.propaganda（流言散布・煽動）
           ×
  learning.theology（偽造教義・異端こじつけ）
           │
           ▼
  成功: 対象国に [神敵（deemedAnathema）] フラグを付与（期限付き）
           │
           ├─► 自国の warFervor が爆発（+40〜+50、即座に聖戦動員へ）
           ├─► 同宗教国であっても「神敵を討つ義戦」として評議会・信徒が熱狂
           └─► 露見時: 教会が「神を冒涜した偽証者」として非難され、他国包囲網リスク
```

### 5.1 工作の要件と手順
1. **実行条件**:
   - 実行者の能力: `intrigue.propaganda`（実践）＋ `learning.theology`（知識）。
   - 拠点: 教会支部、神殿、または印刷ギルド・説教壇へのアクセス。
   - 期間: 30〜90日。
2. **偽造される大義名分の例**:
   - 「相手国の王家は、地下室で邪神・悪魔の祭壇を祀っている（偽造された密約書の流布）」
   - 「聖地の遺物を盗掘・私蔵し、冒涜している」
   - 「表面上は敬虔を装っているが、聖典の根幹を否定する隠れ異端の巣窟である」
3. **成功時の効果**:
   - 対象国家に `deemedAnathemaUntilYear` が付与される。
   - 自国の `warFervor` が跳ね上がり、議会支持率（`councilSupport`）の開戦ペナルティが無効化される。
   - 聖戦開戦（Holy War Casus Belli）が解禁される。

---

## 6. 下流システムへの影響と判定式

### 6.1 開戦判定への影響
国家間の危機や領有権主張がある際、AIルーラーが開戦（War）に踏み切る確率：
```text
warApprovalScore = baseMilitaryAdvantage 
                 + (warFervor - warWeariness) * 0.5 
                 + (isHolyWar ? 30 : 0)
                 - fiscalStressPenalty
```
- `warFervor` が高く `warWeariness` が低い状態では、通常なら踏み切らない僅差の戦力比でも開戦を選択する。

### 6.2 講和・早期和平（White Peace）判定への影響
戦争中、AIルーラーが現状維持和平や領土譲歩を受け入れる確率：
```text
peaceAcceptanceScore = warWeariness * 0.8 
                     - warFervor * 0.3 
                     + militaryCasualtiesRate * 40
```
- `warWeariness ≥ 70` に達すると、軍事的に優勢であっても国内世論の限界により早期講和を模索する。

### 6.3 議会支持（`councilSupport`）と都市不満（`burg.discontent`）
- `state.councilSupport`: 高い `warWeariness` は議会支持率を直接削る（最大 −25）。
- `burg.discontent`: 高い `warWeariness` は各 Burg の生活不満に波及し、市民暴動（`civilUnrest`）のトリガーとなる。
