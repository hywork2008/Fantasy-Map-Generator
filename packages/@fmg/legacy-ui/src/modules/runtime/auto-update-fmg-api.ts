import type { FmgGlobalContext } from "@fmg/types";
import { getFmgOptionalService } from "./get-fmg";

export const autoUpdateFmgApi = {
  get Religions() {
    return getFmgOptionalService("Religions");
  },
  get Features() {
    return getFmgOptionalService("Features");
  },
  get Cultures() {
    return getFmgOptionalService("Cultures");
  },
  get Zones() {
    return getFmgOptionalService("Zones");
  },
  get Burgs() {
    return getFmgOptionalService("Burgs");
  },
  get Markers() {
    return getFmgOptionalService("Markers");
  },
  get Provinces() {
    return getFmgOptionalService("Provinces");
  }
};
