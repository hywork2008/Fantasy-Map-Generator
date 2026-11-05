import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import { assembleWorkhomeShell, WORKHOME_FORMS, type WorkhomeForm, workhomeShellParts } from "./workhomeShell";

export const models: MedievalModel[] = (Object.keys(WORKHOME_FORMS) as WorkhomeForm[]).map(form => {
  const p = WORKHOME_FORMS[form],
    id = `trade-workhome.${p.formId}.skeleton`,
    family = `medieval.${id}`;
  return {
    id,
    task: 50,
    name: `${form[0].toUpperCase()}${form.slice(1)} workhome skeleton`,
    author: DEFAULT_AUTHOR,
    cePlacementStatus: "preview-only",
    size: [p.width + 0.6, p.depth + 1.5, p.envelope.max[1]],
    note: "T1b workhome v2 structural preview. Fixed body, floor budget, ports and internal return stair in both qualities. Residential capacity is planned; trade equipment and three workplaces are not yet verified. Not enabled for CE placement.",
    create: () => assembleWorkhomeShell(form, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: DEFAULT_AUTHOR,
      create: () => assembleWorkhomeShell(form, quality)
    })),
    parts: selected => workhomeShellParts(form, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleWorkhomeShell(form, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});
