import type { FmgGlobalContext } from "@fmg/types";
import { getCoreFmgInstances } from "@fmg/core/modules/initialize-fmg";

const getFmg = () => window.fmg as FmgGlobalContext | undefined;

export const autoUpdateFmgApi = {
  get Religions() {
    return getFmg()?.Religions || getCoreFmgInstances().Religions;
  },
  get Features() {
    return getFmg()?.Features || getCoreFmgInstances().Features;
  },
  get Cultures() {
    return getFmg()?.Cultures || getCoreFmgInstances().Cultures;
  },
  get Zones() {
    return getFmg()?.Zones || getCoreFmgInstances().Zones;
  },
  get Burgs() {
    return getFmg()?.Burgs || getCoreFmgInstances().Burgs;
  },
  get Markers() {
    return getFmg()?.Markers || getCoreFmgInstances().Markers;
  },
  get Provinces() {
    return getFmg()?.Provinces || getCoreFmgInstances().Provinces;
  }
};
