Please explain the religion generator of FMG (Fantasy Map Generator) based on [https://raw.githubusercontent.com/Azgaar/Fantasy-Map-Generator/refs/heads/master/src/generators/religions-generator.ts](https://raw.githubusercontent.com/Azgaar/Fantasy-Map-Generator/refs/heads/master/src/generators/religions-generator.ts).

Azgaar氏の「Fantasy Map Generator (FMG)」における宗教生成スクリプト（`religions-generator.ts`）は、地図上の文化や国家に基づいて多様な宗教体系を自動生成する仕組みを持っています。
Azgaar's "Fantasy Map Generator (FMG)" religion generation script (`religions-generator.ts`) automatically generates diverse religious systems based on the cultures and states on the map.

主な仕様と生成のロジックは以下の通りです。
The main specifications and generation logic are as follows.

1. 宗教の分類（グループと形態）
2. Classification of Religions (Groups and Forms)
宗教は大きく4つの「グループ（Group）」に分類され、それぞれに具体的な「形態（Form）」が定義されています。
Religions are broadly classified into four "Groups," each defined by specific "Forms."

* **Folk（民俗宗教 / 伝統宗教）**:
* Shamanism（シャーマニズム）
* Animism（アニミズム）
* Ancestor worship（祖先崇拝）
* Polytheism（多神教）


* **Organized（組織化された宗教 / 制度宗教）**:
* Polytheism（多神教）
* Dualism (二元論)[https://ja.wikipedia.org/wiki/%E4%BA%8C%E5%85%83%E8%AB%96]
* Monotheism（一神教）
* Nontheism（無神論 / 非有神論）


* **Cult（カルト / 密教・狂信的集団）**:
* Cult（カルト）
* Dark Cult（暗黒カルト）


* **Heresy（異端）**:
* 既存の組織化された宗教から派生する異端。
* Heresies derived from existing organized religions.



2. 神格（Deity）の生成とアプローチ
3. Deity Generation and Approaches
宗教の形態に応じて、信仰の対象となる神格やその性質（Approach）が決定されます。
Depending on the form of the religion, the deity to be worshiped and its nature (Approach) are determined.

* 一神教（Monotheism）や二元論（Dualism）では、最高神や対立する神の名前、そしてその神が象徴する意味（例：太陽、豊穣、戦争、正義など）が自動生成されます。
* In Monotheism and Dualism, the names of the supreme deity or opposing deities, along with the meanings they symbolize (e.g., sun, fertility, war, justice), are automatically generated.
* 神の名前は、その宗教が発祥した地域の「言語（Language）」データに基づいてランダムに組み合わされ、それらしい響きを持つように作られます。
* Deity names are generated based on the "Language" data of the region where the religion originated, combining elements randomly to create a plausible sound.

3. 宗教名の命名規則
4. Naming Conventions for Religions
宗教の名前は、いくつかのパターン（接尾辞や定型句）から選択されます。
Religion names are selected from several patterns (suffixes or formulas).

* **等（-ism）の追加**: 土地の名前や神の名前に「-ism（主義・教）」を付与する（例：Pradaniumism）。
* **Addition of "-ism"**: Attaching "-ism" to the name of a land or a deity (e.g., Pradaniumism).
* **「〜の道 / 〜の信仰」系**: 「Way of [神の名前]」や「Faith of [神の名前]」といった形式で生成されます。
* **"Way of / Faith of" systems**: Generated in formats such as "Way of [Deity Name]" or "Faith of [Deity Name]".

4. 地図上への普及と伝播
5. Spread and Propagation on the Map
生成された宗教は、単にデータとして存在するだけでなく、セル（Cell）単位で地図上に広がります。
The generated religions do not just exist as data but spread across the map on a cell-by-cell basis.

* **文化的・政治的背景**: 宗教は特定の文化圏や国家の中心地から発生しやすく、境界線を越えて伝播します。
* **Cultural and Political Background**: Religions tend to originate from specific cultural areas or state centers and propagate across borders.
* **異端の発生**: 組織化された宗教が広く普及すると、その勢力圏内から一定の確率で「Heresy（異端）」が分離・発生するロジックが含まれています。
* **Emergence of Heresies**: When an organized religion becomes widespread, a logic is included where a "Heresy" splits off and emerges within its sphere of influence with a certain probability.
