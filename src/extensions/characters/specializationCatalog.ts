import type { CharacterSkills } from "./characterTypes";

export interface SpecializationDefinition {
  id: string;
  skill: keyof CharacterSkills;
  label: { en: string; ja: string };
  knowledge: string;
  practice: string;
  targets: string;
  appraisal?: boolean;
  economyDomain?: string;
  /** When set, generic office rolls skip this field; matching races get it as an extra domain. */
  raceKeys?: readonly string[];
}

/** Stable IDs: labels never identify saved expertise. */
export const SPECIALIZATION_DEFINITIONS: readonly SpecializationDefinition[] = [
  {
    id: "diplomacy.negotiation",
    skill: "diplomacy",
    label: { en: "Negotiation", ja: "交渉" },
    knowledge: "交渉理論、利害分析、譲歩と代替案",
    practice: "交渉、説得、条件調整",
    targets: "同盟、和平、通商、婚姻の交渉歴"
  },
  {
    id: "diplomacy.protocol",
    skill: "diplomacy",
    label: { en: "Protocol", ja: "儀礼" },
    knowledge: "儀礼、称号、使節慣行",
    practice: "接遇、演説、公式会談",
    targets: "宮廷・国家・文化別の儀礼"
  },
  {
    id: "diplomacy.treaties",
    skill: "diplomacy",
    label: { en: "Treaties", ja: "国際慣習" },
    knowledge: "国際慣習、条約構造、履行保証",
    practice: "条文起草、批准調整、履行確認",
    targets: "国境、通商、従属関係の協定"
  },
  {
    id: "diplomacy.mediation",
    skill: "diplomacy",
    label: { en: "Mediation", ja: "紛争構造" },
    knowledge: "紛争構造、派閥・宗派関係",
    practice: "仲裁、危機交渉、合意形成",
    targets: "内乱、捕虜交換、都市紛争"
  },
  {
    id: "diplomacy.representation",
    skill: "diplomacy",
    label: { en: "Representation", ja: "他国の権力構造" },
    knowledge: "他国の権力構造、外交史",
    practice: "情報交換、使節団運営",
    targets: "駐在先、任期、接触した制度"
  },
  {
    id: "diplomacy.intercultural",
    skill: "diplomacy",
    label: { en: "Intercultural", ja: "学識側の文化知識を参照" },
    knowledge: "学識側の文化知識を参照",
    practice: "異文化での説明、誤解の修復",
    targets: "対象文化IDごとの実務習熟"
  },
  {
    id: "martial.strategy",
    skill: "martial",
    label: { en: "Strategy", ja: "軍事史" },
    knowledge: "軍事史、戦争目的、戦力集中、戦域戦略",
    practice: "戦域選択、長期戦争計画",
    targets: "防衛、遠征、海上覇権"
  },
  {
    id: "martial.operations",
    skill: "martial",
    label: { en: "Operations", ja: "作戦立案" },
    knowledge: "作戦術、行軍計画、予備兵力、共同作戦",
    practice: "作戦立案、日程調整、状況変化への改案",
    targets: "複数部隊・戦線の規模別経験"
  },
  {
    id: "martial.tactics",
    skill: "martial",
    label: { en: "Tactics", ja: "陣形" },
    knowledge: "陣形、火力・機動、地形利用",
    practice: "戦場判断、包囲、追撃、撤退",
    targets: "会戦、伏撃、渡河、夜戦"
  },
  {
    id: "martial.command",
    skill: "martial",
    label: { en: "Command", ja: "指揮" },
    knowledge: "指揮系統、命令伝達、参謀勤務",
    practice: "命令、権限委譲、部隊間調整",
    targets: "小隊相当・連隊・軍団・艦隊などの指揮規模"
  },
  {
    id: "martial.leadership",
    skill: "martial",
    label: { en: "Leadership", ja: "統率" },
    knowledge: "集団心理、規律、士気の維持",
    practice: "統率、鼓舞、混乱収拾、兵との信頼形成",
    targets: "敗走、長期包囲、補充兵の統合"
  },
  {
    id: "martial.logistics",
    skill: "martial",
    label: { en: "Logistics", ja: "兵站学" },
    knowledge: "兵站学、糧秣、輸送、宿営、衛生",
    practice: "補給線運用、徴発調整、輸送護衛",
    targets: "遠征期間、輸送方式、季節"
  },
  {
    id: "martial.training",
    skill: "martial",
    label: { en: "Training", ja: "教範" },
    knowledge: "教範、訓練課程、動員・編制",
    practice: "教練、部隊編成、教官育成",
    targets: "兵科別の訓練・補充経験"
  },
  {
    id: "martial.siege",
    skill: "martial",
    label: { en: "Siege", ja: "築城史" },
    knowledge: "築城史、攻囲法、要塞防御",
    practice: "攻城・籠城指揮、工兵との調整",
    targets: "城壁、要塞、包囲戦の経験"
  },
  {
    id: "martial.naval",
    skill: "martial",
    label: { en: "Naval", ja: "海戦術" },
    knowledge: "海戦術、船団・上陸作戦",
    practice: "艦隊指揮、護送、上陸連携",
    targets: "沿岸・外洋・河川、艦種"
  },
  {
    id: "martial.intelligence",
    skill: "martial",
    label: { en: "Intelligence", ja: "偵察計画" },
    knowledge: "偵察計画、敵情評価、戦況推定",
    practice: "偵察部隊への指示、報告統合",
    targets: "敵軍編制・戦法への習熟"
  },
  {
    id: "stewardship.finance",
    skill: "stewardship",
    label: { en: "Finance", ja: "会計" },
    knowledge: "会計、予算、債務、貨幣制度",
    practice: "予算編成、帳簿、監査",
    targets: "国家・都市・商会の規模、通貨"
  },
  {
    id: "stewardship.taxation",
    skill: "stewardship",
    label: { en: "Taxation", ja: "税法" },
    knowledge: "税法、地租、関税、徴税制度",
    practice: "課税査定、台帳整備、徴収監督",
    targets: "地域別税制、徴税改革"
  },
  {
    id: "stewardship.administration",
    skill: "stewardship",
    label: { en: "Administration", ja: "官僚制" },
    knowledge: "官僚制、人事、文書管理",
    practice: "任用、業務分担、行政監督",
    targets: "官庁、領地規模、組織制度"
  },
  {
    id: "stewardship.economy",
    skill: "stewardship",
    label: { en: "Economy", ja: "市場" },
    knowledge: "市場、交易、価格、産業構造",
    practice: "調達、契約、産業振興",
    targets: "商品群、交易路、市場制度"
  },
  {
    id: "stewardship.rural",
    skill: "stewardship",
    label: { en: "Rural", ja: "農政" },
    knowledge: "農政、土地制度、収穫・備蓄",
    practice: "土地配分、灌漑運営、食糧管理",
    targets: "農法、牧畜、土地・気候"
  },
  {
    id: "stewardship.urban",
    skill: "stewardship",
    label: { en: "Urban", ja: "都市行政" },
    knowledge: "都市行政、人口、公共サービス",
    practice: "建設発注、事業進捗、住宅・衛生管理",
    targets: "都市規模、公共事業"
  },
  {
    id: "stewardship.crisis",
    skill: "stewardship",
    label: { en: "Crisis", ja: "災害対応" },
    knowledge: "災害対応、配給、復興制度",
    practice: "飢饉救済、避難調整、復旧資源配分",
    targets: "洪水、疫病、戦災の対応歴"
  },
  {
    id: "intrigue.analysis",
    skill: "intrigue",
    label: { en: "Analysis", ja: "情報評価" },
    knowledge: "情報評価、情報源の信頼性、勢力分析",
    practice: "情報照合、虚報の看破、推論",
    targets: "宮廷、商会、軍、宗教組織"
  },
  {
    id: "intrigue.networks",
    skill: "intrigue",
    label: { en: "Networks", ja: "情報網の構造" },
    knowledge: "情報網の構造、秘密連絡",
    practice: "協力者管理、連絡網維持",
    targets: "地域・組織別の活動経験"
  },
  {
    id: "intrigue.covertOperations",
    skill: "intrigue",
    label: { en: "Covert operations", ja: "秘密活動の計画" },
    knowledge: "秘密活動の計画、隠蔽原理",
    practice: "潜入、偽装、工作の調整",
    targets: "潜入先の制度・文化"
  },
  {
    id: "intrigue.counterintelligence",
    skill: "intrigue",
    label: { en: "Counterintelligence", ja: "防諜" },
    knowledge: "防諜、内部統制、警護制度",
    practice: "漏洩調査、工作検知、警護監督",
    targets: "宮廷・軍・技術機密の保護"
  },
  {
    id: "intrigue.cryptography",
    skill: "intrigue",
    label: { en: "Cryptography", ja: "暗号・符号" },
    knowledge: "暗号・符号、文書の真正性",
    practice: "暗号運用、解読、偽文書鑑定",
    targets: "暗号体系、言語、文字体系"
  },
  {
    id: "intrigue.propaganda",
    skill: "intrigue",
    label: { en: "Propaganda", ja: "扇動" },
    knowledge: "集団心理、好戦感情醸成の論理、風説設計",
    practice: "流言散布、世論誘導、好戦気運の醸成、反乱扇動",
    targets: "階級・宗教・都市・敵対国家の習熟"
  },
  {
    id: "intrigue.censorship",
    skill: "intrigue",
    label: { en: "Censorship", ja: "情報統制" },
    knowledge: "情報流通路、禁書・検閲制度、摘発基準",
    practice: "情報封殺、出版・書簡統制、敗報・異端の遮断",
    targets: "伝達媒体（口伝/印刷/書簡）、地域、組織"
  },
  {
    id: "intrigue.interrogation",
    skill: "intrigue",
    label: { en: "Interrogation", ja: "尋問・思想改造" },
    knowledge: "心理誘導、認知的疲弊、自白・転向の理論",
    practice: "尋問、心理的圧迫、虚偽自白の看破、転向工作・思想改造",
    targets: "組織、信仰・宗派、捕虜階級"
  },
  {
    id: "learning.law",
    skill: "learning",
    label: { en: "Law", ja: "慣習法" },
    knowledge: "慣習法、成文法、法学",
    practice: "法解釈、判例比較、法案起草",
    targets: "国家・制度別の法律"
  },
  {
    id: "learning.theology",
    skill: "learning",
    label: { en: "Theology", ja: "教義" },
    knowledge: "教義、宗教史、典礼",
    practice: "経典解釈、宗教討論",
    targets: "宗教・宗派ID、典礼言語"
  },
  {
    id: "learning.history",
    skill: "learning",
    label: { en: "History", ja: "政治史" },
    knowledge: "政治史、軍事史、年代学",
    practice: "史料批判、編纂",
    targets: "地域・時代・国家"
  },
  {
    id: "learning.philosophy",
    skill: "learning",
    label: { en: "Philosophy", ja: "論理学" },
    knowledge: "論理学、倫理学、哲学",
    practice: "論証、討論、概念整理",
    targets: "学派・思想体系"
  },
  {
    id: "learning.mathematics",
    skill: "learning",
    label: { en: "Mathematics", ja: "算術" },
    knowledge: "算術、幾何、代数、数量分析",
    practice: "計算、証明、モデル化",
    targets: "商業計算、測量、天文等の応用"
  },
  {
    id: "learning.naturalScience",
    skill: "learning",
    label: { en: "Natural science", ja: "自然哲学" },
    knowledge: "自然哲学、天文、物理、化学、生物",
    practice: "観察、実験、記録、仮説検証",
    targets: "各学問を対象IDでさらに区分"
  },
  {
    id: "learning.botany",
    skill: "learning",
    label: { en: "Botany", ja: "植物学・本草学" },
    knowledge: "植物分類、生態特性、薬効・毒性、生育環境",
    practice: "野外同定、毒抜き・調製、標本採取、栽培管理",
    targets: "気候帯、地形、薬用・食用・有毒分類",
    appraisal: true
  },
  {
    id: "learning.medicine",
    skill: "learning",
    label: { en: "Medicine", ja: "解剖" },
    knowledge: "解剖、病理、薬学、公衆衛生",
    practice: "診察、処置、薬の調製",
    targets: "内科・外科・薬学等、症例経験"
  },
  {
    id: "learning.cultures",
    skill: "learning",
    label: { en: "Cultures", ja: "言語学" },
    knowledge: "言語学、文献学、他文化の歴史・習俗",
    practice: "比較研究、注釈、文化解釈",
    targets: "文化ID・言語ID"
  },
  {
    id: "learning.education",
    skill: "learning",
    label: { en: "Education", ja: "教授法" },
    knowledge: "教授法、学習課程、図書管理",
    practice: "講義、個別指導、教材作成",
    targets: "指導した分野と生徒の水準"
  },
  {
    id: "prowess.melee",
    skill: "prowess",
    label: { en: "Melee", ja: "間合い" },
    knowledge: "間合い、防御、武器特性",
    practice: "剣・槍・斧・鈍器の操作",
    targets: "武器種、流派、決闘・乱戦"
  },
  {
    id: "prowess.ranged",
    skill: "prowess",
    label: { en: "Ranged", ja: "射法" },
    knowledge: "射法、射程、弾道の基礎",
    practice: "弓・弩・投擲・火器の操作",
    targets: "武器種、射撃環境"
  },
  {
    id: "prowess.mounted",
    skill: "prowess",
    label: { en: "Mounted", ja: "馬の扱い" },
    knowledge: "馬の扱い、騎乗戦法",
    practice: "馬術、騎乗攻撃、騎射",
    targets: "騎乗動物、装備、地形"
  },
  {
    id: "prowess.unarmed",
    skill: "prowess",
    label: { en: "Unarmed", ja: "組討ち" },
    knowledge: "組討ち、受け身",
    practice: "格闘、拘束、離脱",
    targets: "流派、防具の有無"
  },
  {
    id: "prowess.defense",
    skill: "prowess",
    label: { en: "Defense", ja: "警戒" },
    knowledge: "警戒、護身、防具知識",
    practice: "回避、防御、護衛行動",
    targets: "襲撃・護衛の経験"
  },
  {
    id: "prowess.fieldcraft",
    skill: "prowess",
    label: { en: "Fieldcraft", ja: "野外踏破" },
    knowledge: "登攀具・踏破具の操作理論、身体ペース配分、肉体負荷管理",
    practice: "岩壁登攀、急流渡河、悪路走破、隠密行動",
    targets: "険路、急流、登攀壁、遠征踏破歴"
  },
  {
    id: "artistry.ceramics",
    skill: "artistry",
    label: { en: "Ceramics", ja: "陶器・磁器" },
    knowledge: "陶器・磁器、釉薬の表現、窯・産地・作風",
    practice: "成形、絵付け、意匠",
    targets: "器種、産地、流派",
    appraisal: true
  },
  {
    id: "artistry.painting",
    skill: "artistry",
    label: { en: "Painting", ja: "絵画史" },
    knowledge: "絵画史、構図、顔料表現",
    practice: "素描、彩色、壁画、肖像",
    targets: "画材、主題、流派",
    appraisal: true
  },
  {
    id: "artistry.sculpture",
    skill: "artistry",
    label: { en: "Sculpture", ja: "造形" },
    knowledge: "造形、彫刻史",
    practice: "石彫、木彫、金属彫刻",
    targets: "素材、宗教像・記念像",
    appraisal: true
  },
  {
    id: "artistry.calligraphy",
    skill: "artistry",
    label: { en: "Calligraphy", ja: "書体" },
    knowledge: "書体、書の歴史",
    practice: "書、装飾文字",
    targets: "言語・文字体系・書体",
    appraisal: true
  },
  {
    id: "artistry.literature",
    skill: "artistry",
    label: { en: "Literature", ja: "詩学" },
    knowledge: "詩学、物語、文芸史",
    practice: "詩作、物語、戯曲",
    targets: "言語、文体、ジャンル",
    appraisal: true
  },
  {
    id: "artistry.music",
    skill: "artistry",
    label: { en: "Music", ja: "音楽理論" },
    knowledge: "音楽理論、楽曲・楽器の歴史",
    practice: "作曲、歌唱、楽器演奏",
    targets: "楽器ID・様式別の習熟",
    appraisal: true
  },
  {
    id: "artistry.performance",
    skill: "artistry",
    label: { en: "Performance", ja: "演劇・舞踊・語りの伝統" },
    knowledge: "演劇・舞踊・語りの伝統",
    practice: "演技、舞踊、語り",
    targets: "演目、役柄、文化",
    appraisal: true
  },
  {
    id: "artistry.decorativeArts",
    skill: "artistry",
    label: { en: "Decorative arts", ja: "織物" },
    knowledge: "織物、装身具、漆器、ガラスの意匠",
    practice: "刺繍、装飾、工芸意匠",
    targets: "工芸種、素材、技法",
    appraisal: true
  },
  {
    id: "artistry.spatialDesign",
    skill: "artistry",
    label: { en: "Spatial design", ja: "建築美" },
    knowledge: "建築美、庭園、空間構成",
    practice: "意匠設計、庭園構成",
    targets: "様式、地域、用途",
    appraisal: true
  },
  {
    id: "engineering.civil",
    skill: "engineering",
    label: { en: "Civil", ja: "構造" },
    knowledge: "構造、土質、道路・橋梁",
    practice: "測量成果からの設計、施工・検査",
    targets: "石工・木工、道路、橋、城壁"
  },
  {
    id: "engineering.hydraulics",
    skill: "engineering",
    label: { en: "Hydraulics", ja: "水理" },
    knowledge: "水理、治水、灌漑、排水",
    practice: "堤防・水路・ポンプ設計、維持",
    targets: "河川工事、鉱山排水、水車"
  },
  {
    id: "engineering.architecture",
    skill: "engineering",
    label: { en: "Architecture", ja: "建築構造" },
    knowledge: "建築構造、荷重、材料",
    practice: "建築設計、工事監督、補修",
    targets: "木造、石造、用途・地域工法"
  },
  {
    id: "engineering.mining",
    skill: "engineering",
    label: { en: "Mining", ja: "鉱床" },
    knowledge: "鉱床、採掘、支保、換気",
    practice: "探鉱、坑道設計、鉱山運転",
    targets: "鉱種、深部鉱山、排水技術"
  },
  {
    id: "engineering.metallurgy",
    skill: "engineering",
    label: { en: "Metallurgy", ja: "製錬" },
    knowledge: "製錬、合金、熱処理",
    practice: "製錬、鍛造、鋳造、工程管理",
    targets: "`metallurgy`、金属・技法"
  },
  {
    id: "engineering.materials",
    skill: "engineering",
    label: { en: "Materials", ja: "陶磁器" },
    knowledge: "陶磁器、ガラス、石灰、素材特性",
    practice: "配合、焼成、品質検査",
    targets: "`glassware`、`masonry`等、窯式"
  },
  {
    id: "engineering.mechanics",
    skill: "engineering",
    label: { en: "Mechanics", ja: "機構" },
    knowledge: "機構、動力伝達、熱機関",
    practice: "機械設計、組立、運転、修理",
    targets: "水車、風車、蒸気機関"
  },
  {
    id: "engineering.precision",
    skill: "engineering",
    label: { en: "Precision", ja: "計測" },
    knowledge: "計測、誤差、公差",
    practice: "精密加工、校正、機器製作",
    targets: "`instruments`、精密中ぐり"
  },
  {
    id: "engineering.shipbuilding",
    skill: "engineering",
    label: { en: "Shipbuilding", ja: "船体構造" },
    knowledge: "船体構造、浮力、帆装",
    practice: "造船、艤装、修繕",
    targets: "`woodworking`、船種・材料"
  },
  {
    id: "engineering.military",
    skill: "engineering",
    label: { en: "Military", ja: "攻城装置" },
    knowledge: "攻城装置、砲・防御設備の構造",
    practice: "製造、設置、試験、整備",
    targets: "国家機密、火器・要塞技術"
  },
  {
    id: "engineering.production",
    skill: "engineering",
    label: { en: "Production", ja: "木工" },
    knowledge: "木工、織物、皮革、印刷の工程",
    practice: "工具・工程設計、保守、歩留まり改善",
    targets: "`woodworking` / `textiles` / `leather` / `printing`"
  },
  {
    id: "engineering.chemical",
    skill: "engineering",
    label: { en: "Chemical", ja: "化学工程" },
    knowledge: "化学工程、蒸留、反応、材料安全",
    practice: "装置設計、工程制御、試験",
    targets: "化学・医学の技術蓄積、試験工房"
  },
  {
    id: "engineering.runes",
    skill: "engineering",
    label: { en: "Runes", ja: "ルーン" },
    knowledge: "ルーン刻印、石と金属への拘束、氏族の銘式",
    practice: "銘刻、補強、封印、修復",
    targets: "武器、防具、坑道支保、門、氏族の遺構",
    raceKeys: ["dwarf"]
  },
  {
    id: "geography.physical",
    skill: "geography",
    label: { en: "Physical", ja: "地形" },
    knowledge: "地形、地質、水系",
    practice: "現地観察、踏査、危険地形の評価",
    targets: "地域、地形種"
  },
  {
    id: "geography.climate",
    skill: "geography",
    label: { en: "Climate", ja: "気候" },
    knowledge: "気候、季節風、降水、積雪",
    practice: "季節予測、行程判断",
    targets: "気候帯、季節"
  },
  {
    id: "geography.cartography",
    skill: "geography",
    label: { en: "Cartography", ja: "地図" },
    knowledge: "地図、投影、測地",
    practice: "測量、地図作成、境界画定",
    targets: "地域、測量器具、地図の年代"
  },
  {
    id: "geography.navigation",
    skill: "geography",
    label: { en: "Navigation", ja: "方位" },
    knowledge: "方位、天文航法、海流、潮汐",
    practice: "陸上案内、沿岸・外洋航海",
    targets: "経路、海域、河川"
  },
  {
    id: "geography.human",
    skill: "geography",
    label: { en: "Human", ja: "人口" },
    knowledge: "人口、都市、産業・資源分布",
    practice: "地誌作成、交易路評価",
    targets: "地域・都市・市場"
  },
  {
    id: "geography.geopolitics",
    skill: "geography",
    label: { en: "Geopolitics", ja: "国境" },
    knowledge: "国境、要衝、勢力圏",
    practice: "国境案、拠点・進出先の評価",
    targets: "国家、戦域、交通網"
  },
  {
    id: "geography.survival",
    skill: "geography",
    label: { en: "Survival", ja: "野外生存術" },
    knowledge: "水脈・食糧確保理論、避難所構造、発火法、環境リスク評価",
    practice: "シェルター構築、火起こし、水質浄化、現地資源調達",
    targets: "過酷環境・地形（山岳、砂漠、森林、湿地、極地等）"
  },
  {
    id: "learning.translation",
    skill: "learning",
    label: { en: "Translation", ja: "翻訳・通訳理論" },
    knowledge: "翻訳・通訳理論",
    practice: "口訳・筆訳",
    targets: "原言語・訳出言語"
  },
  {
    id: "prowess.melee.swordsmanship",
    skill: "prowess",
    label: { en: "Swordsmanship", ja: "剣術" },
    knowledge: "剣術の理論",
    practice: "剣術",
    targets: "剣術",
    economyDomain: "swordsmanship"
  },
  {
    id: "prowess.ranged.archery",
    skill: "prowess",
    label: { en: "Archery", ja: "弓術" },
    knowledge: "弓術の理論",
    practice: "弓術",
    targets: "弓術",
    economyDomain: "archery"
  },
  {
    id: "prowess.mounted.horsemanship",
    skill: "prowess",
    label: { en: "Horsemanship", ja: "馬術" },
    knowledge: "馬術の理論",
    practice: "馬術",
    targets: "馬術",
    economyDomain: "horsemanship"
  },
  {
    id: "engineering.metallurgy.blacksmithing",
    skill: "engineering",
    label: { en: "Blacksmithing", ja: "鍛造" },
    knowledge: "鍛造の理論",
    practice: "鍛造",
    targets: "鍛造",
    economyDomain: "blacksmithing"
  },
  {
    id: "engineering.metallurgy.smelting",
    skill: "engineering",
    label: { en: "Smelting", ja: "製錬" },
    knowledge: "製錬の理論",
    practice: "製錬",
    targets: "製錬",
    economyDomain: "smelting"
  },
  {
    id: "engineering.production.weaving",
    skill: "engineering",
    label: { en: "Weaving", ja: "製織" },
    knowledge: "製織の理論",
    practice: "製織",
    targets: "製織",
    economyDomain: "weaving"
  },
  {
    id: "engineering.production.tailoring",
    skill: "engineering",
    label: { en: "Tailoring", ja: "仕立て" },
    knowledge: "仕立ての理論",
    practice: "仕立て",
    targets: "仕立て",
    economyDomain: "tailoring"
  },
  {
    id: "engineering.civil.fortification",
    skill: "engineering",
    label: { en: "Fortification", ja: "築城" },
    knowledge: "築城設計、防御線、堀・城門・稜堡",
    practice: "設計、施工監督、改修",
    targets: "城壁、城塞、砦",
    economyDomain: "fortification"
  },
  {
    id: "engineering.metallurgy.foundry",
    skill: "engineering",
    label: { en: "Metal Casting", ja: "鋳造" },
    knowledge: "鋳型設計、溶融金属流動、冷却速度制御",
    practice: "型込め、注湯、仕上げ、中ぐり",
    targets: "大砲、鐘、弾丸、鍋",
    economyDomain: "foundry"
  },
  {
    id: "engineering.metallurgy.goldsmithing",
    skill: "engineering",
    label: { en: "Goldsmithing", ja: "金銀細工" },
    knowledge: "貴金属合金比率、彫金理論、宝石セッティング",
    practice: "彫金、線細工、打出し、造幣極印",
    targets: "装身具、貨幣、典礼具",
    economyDomain: "goldsmithing"
  },
  {
    id: "engineering.civil.masonry",
    skill: "engineering",
    label: { en: "Stonemasonry", ja: "石工" },
    knowledge: "切石力学、組積構造、モルタル配合",
    practice: "採石、切石加工、組積施工",
    targets: "石橋、大聖堂、石壁、舗装",
    economyDomain: "masonry"
  },
  {
    id: "engineering.civil.hydraulics",
    skill: "engineering",
    label: { en: "Hydraulic Engineering", ja: "水利土木" },
    knowledge: "流体力学、水路勾配、治水計画",
    practice: "導水路掘削、堤防構築、揚水機設置",
    targets: "灌漑水路、水道橋、堤防、鉱山排水",
    economyDomain: "hydraulics"
  },
  {
    id: "engineering.civil.mining",
    skill: "engineering",
    label: { en: "Mining Engineering", ja: "採鉱工学" },
    knowledge: "地質構造、支保工理論、坑内換気",
    practice: "坑道掘進、支保建て、採掘指揮",
    targets: "鉱山、坑道、露天掘り",
    economyDomain: "mining"
  },
  {
    id: "engineering.production.carpentry",
    skill: "engineering",
    label: { en: "Carpentry", ja: "木工・大工" },
    knowledge: "木材強度、継手構造、乾燥処理",
    practice: "製材、ほぞ組み、樽締め、建て方",
    targets: "建築骨組、荷車、密閉樽、家具",
    economyDomain: "carpentry"
  },
  {
    id: "engineering.production.shipwrighting",
    skill: "engineering",
    label: { en: "Shipwrighting", ja: "造船・船匠" },
    knowledge: "船体浮力、復原性、肋骨線図",
    practice: "竜骨据付け、外板張り、槙肌水密、艤装",
    targets: "沿岸船、遠洋探検船、大型軍艦",
    economyDomain: "shipwrighting"
  },
  {
    id: "engineering.production.fletching",
    skill: "engineering",
    label: { en: "Bowmaking & Fletching", ja: "弓矢製作" },
    knowledge: "弾性力学、複合材積層、空力飛翔",
    practice: "弓幹削出し、矢羽根矧ぎ、弩機製作",
    targets: "長弓、複合弓、弩、矢",
    economyDomain: "fletching"
  },
  {
    id: "engineering.production.leatherworking",
    skill: "engineering",
    label: { en: "Leatherworking", ja: "革細工" },
    knowledge: "皮鞣し化学、型紙設計、硬化革工法",
    practice: "浸漬鞣し、裁断、縫製、型成形",
    targets: "靴、馬具、革鎧、革袋",
    economyDomain: "leatherworking"
  },
  {
    id: "engineering.materials.ceramics",
    skill: "engineering",
    label: { en: "Ceramics", ja: "陶芸・窯業" },
    knowledge: "粘土鉱物組成、釉薬配合、窯内熱循環",
    practice: "素地水簸、轆轤成形、施釉、窯焚き",
    targets: "耐火坩堝、瓦、陶器、白磁",
    economyDomain: "ceramics"
  },
  {
    id: "engineering.materials.glassmaking",
    skill: "engineering",
    label: { en: "Glassmaking", ja: "硝子工" },
    knowledge: "珪石融解、清澄剤反応、屈折率理論",
    practice: "竿吹き、板硝子展延、徐冷、レンズ研磨",
    targets: "瓶、窓ガラス、理化学硝子、レンズ",
    economyDomain: "glassmaking"
  },
  {
    id: "engineering.precision.instrumentMaking",
    skill: "engineering",
    label: { en: "Instrument Making", ja: "精密計器" },
    knowledge: "目盛割出幾何、脱進調速理論、公差管理",
    practice: "歯車加工、目盛刻線、軸受調相、校正",
    targets: "日時計、機械時計、羅針盤、アストロラーベ",
    economyDomain: "instrumentMaking"
  },
  {
    id: "engineering.production.printing",
    skill: "engineering",
    label: { en: "Printing", ja: "製紙印刷" },
    knowledge: "活字合金比率、印刷インキレオロジー、版面割付",
    practice: "活字鋳造、文選組版、印刷圧調整、製本",
    targets: "書籍、公文書、地図、聖典",
    economyDomain: "printing"
  },
  {
    id: "engineering.military.pyrotechnics",
    skill: "engineering",
    label: { en: "Pyrotechnics", ja: "火工・火薬" },
    knowledge: "酸化還元燃焼論、造粒力学、信管時限計算",
    practice: "原料精製、湿式圧搾、粒状化、導火線編組",
    targets: "火薬、導火線、爆薬、花火",
    economyDomain: "pyrotechnics"
  },
  {
    id: "learning.medicine.apothecary",
    skill: "learning",
    label: { en: "Apothecary", ja: "薬学・調剤" },
    knowledge: "本草学、薬理作用、毒物中和理論",
    practice: "生薬採集、浸出蒸留、軟膏混和、調剤",
    targets: "傷薬、解毒剤、強壮剤、防疫薬",
    economyDomain: "apothecary"
  },
  {
    id: "engineering.production.brewing",
    skill: "engineering",
    label: { en: "Brewing", ja: "発酵醸造" },
    knowledge: "糖化発酵生化学、酵母生態、雑菌汚染防止",
    practice: "麦汁煮沸、ホップ添加、発酵管理、樽詰熟成",
    targets: "エール、ワイン、酢、蒸留酒",
    economyDomain: "brewing"
  },
  {
    id: "prowess.mounted.animalBreeding",
    skill: "prowess",
    label: { en: "Animal Breeding", ja: "家畜育種" },
    knowledge: "遺伝形質選抜、馬匹解剖学、調教心理",
    practice: "交配管理、装蹄、調馬、輓具装着",
    targets: "軍馬、役牛、猟犬",
    economyDomain: "animalBreeding"
  }
];
export const SPECIALIZATIONS = new Map(SPECIALIZATION_DEFINITIONS.map(definition => [definition.id, definition]));
export const SPECIALIZATION_SKILLS = [...new Set(SPECIALIZATION_DEFINITIONS.map(definition => definition.skill))];
