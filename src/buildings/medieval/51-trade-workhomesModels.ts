import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import { WORKHOME_FORMS } from "./workhomeShell";
import {
  assembleWorkhomeTrade,
  tradeDefinition,
  WORKHOME_TRADE_COMBINATIONS,
  workhomeTradeParts
} from "./workhomeTrades";

export const models: MedievalModel[] = WORKHOME_TRADE_COMBINATIONS.map(({ role, form }) => {
  const trade = tradeDefinition(role),
    p = WORKHOME_FORMS[form],
    id = `trade-workhome.${p.formId}.${role}`,
    family = `medieval.${id}`;
  return {
    id,
    task: 51,
    name: `${trade.name} workhome (${form})`,
    author: DEFAULT_AUTHOR,
    size: [p.width + 0.6, p.depth + 1.5, p.envelope.max[1]],
    note: `Dry workhome via explicit CE conversion: one planned dwelling, three static workplaces; production throughput and supply chain are not verified. ${trade.dependencies.length ? `External inputs/processes: ${trade.dependencies.join(", ")}. ` : ""}Supply and occupational process conditions remain separate from placement.`,
    create: () => assembleWorkhomeTrade(role, form, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: DEFAULT_AUTHOR,
      create: () => assembleWorkhomeTrade(role, form, quality)
    })),
    parts: selected => workhomeTradeParts(role, form, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleWorkhomeTrade(role, form, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});
