// Bootstrap all core window.fmg APIs from a single initializer.
// Keep this file free of legacy-ui imports that call requireFmgApi at module load.

globalThis.modules ||= {};

import { initializeFmg } from "#modules/initialize-fmg";

initializeFmg();
