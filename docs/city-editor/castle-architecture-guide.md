# 城郭レンダリング設計仕様・アーキテクチャガイド
(Castle Architecture & Rendering Guide)

本ドキュメントは、City Editor (CE) における城郭（Fortress / Castle）の生成・レンダリングシステムの設計意図、データ構造、および史実に基づく8大城郭様式の構成要素を定義した技術仕様書です。
今後の開発者やAIモデルが本システムを保守・機能拡張する際の公式リファレンスとして策定されています。

---

## 1. 全体アーキテクチャとパイプライン

城郭レンダリングは、従来の「単一パーツ・幾何学模様のみ」の描画から、**「史実の縄張（なわばり）幾何学と立体建築ディテールを備えた本格的城郭」**へと刷新されました。

```
[CityDocument (FMG時代・文化・城郭データ)]
             │
             ▼
   resolveCastleStyle (文化・時代プロファイル決定)
             │
             ▼
   buildFortressPlan (様式別縄張幾何学ジェネレーター)
             │
             ▼
   applySavedBuildings (ユーザー編集フットプリントの同期)
             │
             ▼
   renderCastle (SVG階層化レンダラー)
```

### 1.1 既存都市レンダラーとの分離と置換機構
CEでは通常、都市防壁（`features`）や防衛設備（`renderTownFortifications`）によって西洋中世風の石壁、円形ドラムタワー、正方形ゲートハウスが描画されます。
新様式城郭では、これらの旧来パーツが新しい城郭の真上に重複して描画されるのを防ぐため、以下の判定関数により旧レンダラーの処理を安全にスキップしています。

- **`isNewStyleCastleWall`** ([svg.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/svg.ts)): 新様式城郭の城壁グループに対する西洋石壁ストローク、狭間・歩廊の描画をスキップ。
- **`isNewStyleCastleCircuit`** ([svg.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/svg.ts)): 新様式城郭の防壁回路に対する円形ドラムタワー隅塔の描画をスキップ。
- **`isNewStyleCastleGate`** ([svg.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/svg.ts)): 城郭所有ID・境界頂点・敷地近接判定に基づき、標準様式の西洋ゲートハウスおよび堀の跳ね橋の描画をスキップ。

### 1.2 レイヤー描画順序（地層の原則）
城郭のSVGグループ内では、地形と立体構造の物理的整合性を保つため、厳密な地層順序でレンダリングされます：

1. **Layer 1: Courtyards（中庭・曲輪地面）**
   - 曲輪のベースグラウンド（白砂利、石畳、土間、練兵広場、パティオ）。
2. **Layer 2: Ramparts（土塁・盛土・高石垣・防壁）**
   - 地面の上に盛り上がる高石垣、円形モット盛土、傾斜スカルプ、木柵、内郭カーテンウォール。
3. **Layer 3: Defensive Gates（城門・出構え・架橋）**
   - 枡形虎口、半月堡（デミルーン）、フライング木橋、カストラ大門。
4. **Layer 4: Complex Buildings（建築群）**
   - 大天守・小天守・渡櫓、多聞櫓、本丸御殿、大広間、兵舎、礼拝堂。
5. **Layer 5: Towers & Bastions（塔・星形稜堡・櫓）**
   - 星形稜堡（bastion）、隅櫓（yagura）、円形ドラムタワー、角塔、木造物見櫓。
6. **Layer 6: Architectural Props（環境ディテール）**
   - 井戸、松の植込、大砲砲台、反射水盤。

---

## 2. FortressPlan データ構造

`FortressPlan` ([castleLayoutBuilder.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/castleLayoutBuilder.ts)) は、各城郭様式の完全な幾何学プランを表現する中間データモデルです。

```typescript
export interface FortressPlan {
  style: CastleStyle;
  ramparts: RampartGeometry[];        // 石垣斜面、モット盛土、防壁、木柵
  towers: TowerGeometry[];            // 稜堡、隅櫓、円塔、角塔、物見櫓
  buildings: BuildingGeometry[];      // 主塔、大広間、御殿、多聞櫓、兵舎
  defensiveGates: DefensiveGateGeometry[]; // 枡形、半月堡、木橋、大門
  courtyards: CourtyardGeometry[];    // 各曲輪の舗装・テクスチャ
  props: PropGeometry[];              // 井戸、水盤、庭木、大砲
}
```

---

## 3. 8大城郭様式別の設計意図・構成要素仕様

### 3.1 日本式城郭 (`japanese-shiro`)
- **文化・時代背景**: 戦国〜江戸初期（East Asian / Shinto 文化圏、Early〜Late Medieval〜Early Modern）
- **設計企図**:
  直線と屈曲を活かした本丸・二の丸の輪郭、威圧的な高石垣（扇の勾配・算木積み）、連立式天守群（大天守・小天守・渡り櫓）、本丸御殿（書院造）、多聞櫓、そして侵入者を十字砲火で殲滅する枡形虎口を忠実に再現。
- **構成要素**:
  - `ramparts`:
    - `stone_slope`: 二の丸外郭の高石垣斜面（算木積みの角石ライン表現）。
    - `stone_slope`: 天守台石垣（大天守・小天守を支える独立台座）。
    - `inner_wall`: 本丸内郭の仕切り石塁。
  - `courtyards`:
    - `white_gravel`: 二の丸・本丸の格式高い白砂利敷き。
  - `buildings`:
    - `tenshu-main` (`main_keep`, `tenshu_gables`): 入母屋破風・千鳥破風を重ねた大天守。棟には金の鯱鉾（shachihoko）が輝く。
    - `tenshu-small` (`small_keep`, `tenshu_gables`): 大天守に隣接する小天守。
    - `tenshu-watari` (`watari_yagura`, `tenshu_shoin`): 大天守と小天守を堅牢に連結する渡り櫓。
    - `honmaru-palace` (`palace_wing`, `tenshu_shoin`): 書院造様式の本丸御殿。
    - `tamon-yagura` (`tamon_yagura`, `tenshu_shoin`): 本丸石垣上に連なる長大な多聞櫓（長屋櫓）。
  - `towers`:
    - `yagura_corner` (隅櫓): 入母屋屋根と白漆喰壁を持つ2層の角櫓。
  - `defensiveGates`:
    - `masugata` (枡形虎口): 高石垣で四角く囲まれた中庭、外門（一の門・高麗門）と内門（二の門・巨大渡櫓門）が直角に交わる厳重な虎口構造。
  - `props`:
    - `garden_pines`: 御殿前庭の松の植込。
    - `stone_well`: 城内生活・籠城用の石組み井戸。

---

### 3.2 星形要塞・稜堡要塞 (`bastion-citadel`)
- **文化・時代背景**: 近世バロック〜ヴォーバン様式（Age of Exploration〜Gunpowder〜Early Modern）
- **設計企図**:
  火砲時代の攻城砲撃に対抗するため、死角を無くした五角形の星形稜堡（bastion）、砲弾を受け流す傾斜土塁（glacis）、カーテンウォールを直撃から守る半月堡（demi-lune / ravelin）、および軍事都市としての幾何学的兵舎と中央練兵広場を配置。
- **構成要素**:
  - `ramparts`:
    - `bastion_glacis`: 要塞外周を取り囲む緩やかな傾斜土塁（スカルプ／グラシス）。
    - `outer_wall`: 稜堡間を結ぶ堅牢なカーテンウォール（幕壁）。
  - `courtyards`:
    - `parade_ground`: 要塞中央の広大な八角形/多角形練兵広場（Place d'Armes）。
  - `buildings`:
    - `bastion-barracks-1, 2` (`barracks`, `hip`): 練兵広場の両脇に対称配置された寄宿兵舎・兵器庫。
    - `bastion-governor` (`palace_wing`, `hip`): 要塞司令官・総督庁舎。
  - `towers`:
    - `star_bastion`: 尖端を外に向けた巨大な5角形星形稜堡。隣接稜堡の側面を相互援護する。
  - `defensiveGates`:
    - `barbican` (半月堡・要塞門 / Demi-Lune Ravelin): 幕壁の門の前面に突き出す三角形・V字形の外構え堡塁。
  - `props`:
    - `cannon_battery`: 各星形稜堡の頂部に配備された防衛カノン砲台。
    - `reflecting_pool`: 練兵広場中央の給水池・貯水池。

---

### 3.3 モット・アンド・ベイリー (`motte-bailey`)
- **文化・時代背景**: 初期中世・ノルマン征服期（Early Medieval）
- **設計企図**:
  「モット・オン・ベイリー（外郭の中央に盛土が乗る）」という誤りを排し、**独立した高大な円錐台盛土（Motte）**と、その**脇に隣接する平坦な生活・防御外郭（Bailey）**が明確に二分された史実の縄張を構築。
- **構成要素**:
  - `ramparts`:
    - `motte_slope`: 円錐台の人工盛土丘陵。同心円状の等高線テラスと放射状ケバ線（スロープハッチング）で土塁の高さを立体表現。
    - `palisade` (モット頂上): モット頂上プラットフォームを取り囲む防護木柵。
    - `palisade` (ベイリー外周): ベイリー全体を囲む急造杭木柵。
    - `palisade` (境界内木柵 / Cross-Palisade): モットの空堀とベイリー平地を隔てる境界柵。
  - `courtyards`:
    - `bailey_dirt`: 兵員や家畜が行き交う踏み固められたベイリーの土間地面。
  - `buildings`:
    - `motte-keep` (`main_keep`, `timber_deck`): モット頂上にそびえる2〜3層の木造シェルキープ（主塔）。
    - `bailey-longhouse` (`great_hall`, `gable`): ベイリー平地の中央に建つ切妻屋根の大広間・ロングハウス。
    - `bailey-stables` (`barracks`, `hip`): ベイリー側壁沿いの厩舎・兵舎。
  - `towers`:
    - `wood_watchtower` (モット頂部): キープ上部の見張り櫓。
    - `wood_watchtower` (ベイリー隅): ベイリー木柵の角に建てられたX型筋交い付きの木造物見櫓。
  - `defensiveGates`:
    - `timber_ramp`: ベイリー平地からモット堀を越えてモット頂上へと急勾配で登る木造連絡架橋（Flying Timber Bridge）。
  - `props`:
    - `stone_well`: ベイリー中央広場の共同井戸。

---

### 3.4 西洋同心円要塞 (`concentric`)
- **文化・時代背景**: 十字軍時代〜盛期中世・エドワード1世様式（High Medieval）
- **設計企図**:
  内郭が外郭を見下ろす二重囲壁構造。外壁を突破されても内壁から撃ち下ろせる防御段差、全周に配置された強固な円形ドラムタワー、そして重厚な双塔大門と前進バービカンを配備。
- **構成要素**:
  - `ramparts`:
    - `outer_wall`: 外郭カーテンウォール。
    - `inner_wall`: 外郭より高く厚い内郭カーテンウォール。
  - `courtyards`:
    - `flagstones`: 内郭を取り囲む石畳の中庭。
  - `buildings`:
    - `concentric-hall` (`great_hall`, `gable`): 内郭に守られたゴシック様式の大広間。
    - `concentric-chapel` (`chapel`, `gable`): 城内礼拝堂。
  - `towers`:
    - `drum_tower`: 外郭および内郭の角・壁面に連続する円形ドラムタワー（跳ね出し胸壁付き）。
    - 双塔大門（Twin Drum Gatehouse）: 門の両脇を固める一対の巨大ドラムタワー。
  - `defensiveGates`:
    - `barbican`: 双塔門の前面に張り出した前進堡塁（バービカン）。
  - `props`:
    - `stone_well`: 内郭中庭の石組み井戸。

---

### 3.5 ノルマン方形主塔城郭 (`norman-keep`)
- **文化・時代背景**: 11〜12世紀ノルマン・イングランド・フランス（High Medieval）
- **設計企図**:
  分厚い石造りの巨大方形主塔（ドンジョン/グレート・キープ）を核とし、入口防御のためのL字型前殿（フォアビルディング）、四角いバットレス付き隅塔、石造り歩廊を再現。
- **構成要素**:
  - `ramparts`:
    - `outer_wall`: ベイリーを取り囲む厚い石造り城壁。
  - `courtyards`:
    - `flagstones`: ベイリー内の石畳中庭。
  - `buildings`:
    - `norman-keep-main` (`main_keep`, `crenellated_open`): 重厚な方形主塔。屋上には狭間胸壁付き歩廊が巡る。
    - `norman-forebuilding` (`service`, `crenellated_open`): 主塔入口を守る階段前殿（Forebuilding）。
    - `norman-hall` (`great_hall`, `gable`): ベイリー壁沿いの領主大広間。
    - `norman-chapel` (`chapel`, `gable`): 城内礼拝堂。
  - `towers`:
    - `square_tower`: コーナーを防御する方形のフランクタワー。
  - `defensiveGates`:
    - `barbican`: ベイリー入口の前衛門（Norman Barbican Gatehouse）。
  - `props`:
    - `stone_well`: 主塔近傍の井戸。

---

### 3.6 イスラム城塞 (`islamic-qalat`)
- **文化・時代背景**: アンダルス・中東・マムルーク朝（Middle Eastern / Moorish 文化圏）
- **設計企図**:
  直進侵入を遮断するL字型の屈曲門（Bent Entrance）、幾何学的なパティオ（中庭）、回廊状の宮殿棟、中央の長方形水盤（反射池）、平屋根と小ドーム（クッバ）の調和。
- **構成要素**:
  - `ramparts`:
    - `outer_wall`: 鋸歯状狭間（クレネル）を持つ外壁。
  - `courtyards`:
    - `patio_pool`: パティオ床面。
  - `buildings`:
    - `qalat-north, south` (`palace_wing`, `flat_parapet`): 中庭を挟む南北の列柱回廊付き宮殿ウィング。
    - `qalat-diwan` (`great_hall`, `flat_dome`): 中央謁見の間（ディーワーン）。屋上に丸屋根ドームを冠する。
  - `towers`:
    - `square_tower`: 方形の堅固な監視塔。
  - `defensiveGates`:
    - `masugata` (屈曲門 / Bent Entrance Gate): 侵入者の勢いを殺すL字クランク型城門。
  - `props`:
    - `reflecting_pool`: パティオ中央の美しい長方形反射水盤。
    - `garden_pines`: 水盤脇の庭園樹。

---

### 3.7 古代カストラ・アクロポリス (`ancient-castra`)
- **文化・時代背景**: 古代ローマ軍団基地・ギリシャ城塞（Ancient / Classical）
- **設計企図**:
  直交グリッドに基づく長方形・矩形の要塞（Castra）。中央の軍団司令部（Principia/Praetorium）、穀物庫（Horreum）、兵営、そして四方位の軍団大門（Porta Praetoria）。
- **構成要素**:
  - `ramparts`:
    - `outer_wall`: 規則的な石造防壁。
  - `courtyards`:
    - `flagstones`: 司令部前のフォルム（広場）。
  - `buildings`:
    - `castra-principia` (`main_keep`, `pitched_tile`): 切妻瓦屋根の軍団司令部庁舎。
    - `castra-horreum` (`barracks`, `pitched_tile`): 防湿高床構造を模した穀物庫および兵舎。
  - `towers`:
    - `square_tower`: 均等配置の方形監視塔。
  - `defensiveGates`:
    - `barbican` (カストラ大門 / Porta Praetoria): 双塔型の正面軍団大門。
  - `props`:
    - `stone_well`: フォルム中央の給水井戸。

---

### 3.8 クラシック様式 (`classic`)
- **設計企図**:
  従来の城郭との後方互換性。単一のキープとウィング、および旧来の連絡通路（`castle.accesses`）を描画する。

---

## 4. 開発者・AI向け保守拡張ガイドライン

### 4.1 ユーザー編集フットプリントの同期 (`applySavedBuildings`)
ユーザーがCE画面上で城の建物を移動・リサイズした場合、その変更は `castle.parts`（永続フットプリント）に保存されます。
`applySavedBuildings` は以下のルールで幾何学と動的に同期します：
1. 主塔（`keep`）が移動された場合、様式固有の主塔付帯設備（前殿、渡り櫓、小天守、モット盛土、登城木橋）が主塔の変位ベクトル `delta` に追従して平行移動します。
2. 編集可能なパーツ（`keep`, `hall`, `range`, `service`, `chapel`）は、保存された形状を維持したまま、各様式の屋根スタイルやマテリアルテクスチャを適用して描画されます。

### 4.2 新しい城郭様式を追加する際の手順
1. **[castlePatterns.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/castlePatterns.ts)**:
   - `CastleStyle` ユニオン型に新キーを追加。
   - `CASTLE_STYLE_PROFILES` にカラーパレットと特徴フラグを定義。
   - `resolveCastleStyle` に判定ルール（文化・時代）を紐付け。
2. **[castleLayoutBuilder.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/castleLayoutBuilder.ts)**:
   - `build<NewStyle>` 関数を実装。`FortressPlan` の各配列（ramparts, courtyards, defensiveGates, buildings, towers, props）を構築。
   - `buildFortressPlan` の `switch` 文に登録。
3. **[castleSvg.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/castleSvg.ts)**:
   - 新様式固有の屋根や壁の描画が必要な場合、各描画サブ関数（`renderRamparts`, `renderComplexBuildings` 等）に分岐を追加。
4. **テストの追加**:
   - [castleSvg.test.ts](file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/city-editor/render/castleSvg.test.ts) にレンダリング検証テストを追加し、`vitest` と `tsc --noEmit` で検証。

---
*初版策定: 2026-10-08 / City Editor (CE) サブシステム*
