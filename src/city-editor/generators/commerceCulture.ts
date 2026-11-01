/**
 * Where an approach-commerce town puts its inn (approach-commerce-quarters.md §6.5).
 * A placement switch only: it does not generate a new street form.
 */

import type { CityDocument } from "../types/document";

export type CommerceSeat = "european" | "islamic" | "japanese";

/** Japanese wins over a caravanserai lodging. European is the default. */
export function commerceSeat(source: {
  civilization?: { tradition?: string; fortification?: string } | null;
  facilities?: readonly { kind: string }[] | null;
}): CommerceSeat {
  const civilization = source.civilization;
  if (civilization?.fortification === "japanese" || civilization?.tradition === "japanese") return "japanese";
  if (source.facilities?.some(item => item.kind === "caravanserai")) return "islamic";
  return "european";
}

export function commerceSeatFromDocument(document: CityDocument): CommerceSeat {
  const settings = document.fabric?.generation?.settings;
  return commerceSeat({
    civilization: document.civilization ?? settings?.descriptor?.civilization,
    facilities: document.siteEconomy?.facilities ?? settings?.descriptor?.economy?.facilities
  });
}
