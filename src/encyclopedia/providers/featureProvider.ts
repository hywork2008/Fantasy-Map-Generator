import encyclopediaEn from "../content/features/encyclopedia.en.md?raw";
import encyclopediaJa from "../content/features/encyclopedia.ja.md?raw";
import type { EncyclopediaEntry } from "../encyclopediaTypes";
import { createStaticProvider } from "./staticProvider";

/** Feature help pages. Cost of Living reuses the About tab's i18n strings so the two never drift apart. */
export const FEATURE_ENTRIES: readonly EncyclopediaEntry[] = [
  {
    id: "feature:encyclopedia",
    namespace: "feature",
    title: { en: "Encyclopedia", ja: "百科事典(Encyclopedia)" },
    summary: { en: "How to search and read this encyclopedia.", ja: "この百科事典の検索と読み方。" },
    tags: ["help", "codex", "dictionary", "ヘルプ", "辞書"],
    body: [{ kind: "markdown", text: { en: encyclopediaEn, ja: encyclopediaJa } }]
  },
  {
    id: "feature:cost-of-living",
    namespace: "feature",
    title: { i18nKey: "about.costOfLivingHeading" },
    summary: {
      en: "What a peasant, a town dweller, a family, and a house cost in this world's coinage.",
      ja: "農民・都市住民・家族・住宅にかかる費用を、この世界の硬貨で示した目安。"
    },
    tags: ["coinage", "currency", "gold", "silver", "copper", "price", "grain", "通貨", "硬貨", "物価", "about"],
    body: [
      { kind: "markdown", text: { i18nKey: "about.costOfLivingIntro" } },
      {
        kind: "list",
        items: [
          { i18nKey: "about.costOfLivingPeasant" },
          { i18nKey: "about.costOfLivingUrban" },
          { i18nKey: "about.costOfLivingFamily" },
          { i18nKey: "about.costOfLivingHouse" }
        ]
      }
    ]
  }
];

export const featureProvider = createStaticProvider("feature", FEATURE_ENTRIES);
