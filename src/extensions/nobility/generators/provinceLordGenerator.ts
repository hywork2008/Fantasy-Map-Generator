import { analyzeFrontiers, getProvinceThreats } from "../../hostCore";
import { getWorldContext } from "../nobilityContext";
import { Characters } from "./characterLifecycle";

/**
 * Sparsely assigns landed lords to frontier provinces — the "辺境伯" (margrave) role from
 * docs/plan/char.md. Only provinces that `getProvinceThreats()` (src/generators/frontierAnalysis.ts)
 * actually flags as bordering a threat get a lord; interior provinces stay unnamed, for the
 * same reason city garrisons were rejected in docs/debug/military.md — a lord per province
 * would blow up the character roster for no gameplay benefit.
 *
 * Safe to call repeatedly: provinces that already have a living lord are left untouched, so
 * this only fills vacancies (a lord dying, or a province newly becoming a frontier after a
 * war starts).
 */
export function assignProvinceLords(): void {
  const { pack, options } = getWorldContext();
  const characters = pack.characters;
  if (!characters || !pack.states?.length || !pack.provinces?.length) return;

  const currentYear = Number(options.year) || 1000;
  const states = pack.states.filter(s => s.i && !s.removed);
  const frontierMap = analyzeFrontiers(pack, currentYear);

  for (const state of states) {
    const segments = frontierMap.get(state.i);
    if (!segments?.length) continue;

    const threats = getProvinceThreats(pack, segments);

    for (const provinceId of threats.keys()) {
      if (!provinceId) continue; // 0 = "no province" (states with too few burgs to have any)

      const province = pack.provinces[provinceId];
      if (!province || province.removed || province.state !== state.i) continue;

      const hasLivingLord = characters.some(
        c => !c.dead && c.titles.some(t => t.entityType === "province" && t.entityId === provinceId)
      );
      if (hasLivingLord) continue;

      Characters.createProvinceLord(state, province);
    }
  }
}
