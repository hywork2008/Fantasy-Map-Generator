import type { Battle as BattleClass } from "../controllers/battle-screen";
import type {
  Opisometer as OpismeterClass,
  Planimeter as PlanimeterClass,
  RouteOpisometer as RouteOpisometerClass,
  Ruler as RulerClass,
  Rulers as RulersClass
} from "../controllers/measurers";
import type { HeightmapModule } from "../generators/heightmap-generator";
import type { Resampler } from "../generators/resample";

declare global {
  // Module singletons
  var Resample: Resampler;
  var HeightmapGenerator: HeightmapModule;

  // Measurer constructors (from measurers.ts)
  var Rulers: typeof RulersClass;
  var Ruler: typeof RulerClass;
  var Opisometer: typeof OpismeterClass;
  var RouteOpisometer: typeof RouteOpisometerClass;
  var Planimeter: typeof PlanimeterClass;

  // battle-screen.ts
  var Battle: typeof BattleClass;

  // Dialog HTML elements — accessed via window.X in uiHelpers.ts (browser auto-globals from element IDs)
  var biomesEditor: HTMLElement | undefined;
  var burgsOverview: HTMLElement | undefined;
  var culturesEditor: HTMLElement | undefined;
  var diplomacyEditor: HTMLElement | undefined;
  var markerEditor: HTMLElement | undefined;
  var militaryOverview: HTMLElement | undefined;
  var notesEditor: HTMLElement | undefined;
  var provincesEditor: HTMLElement | undefined;
  var religionsEditor: HTMLElement | undefined;
  var statesEditor: HTMLElement | undefined;
  var zonesEditor: HTMLElement | undefined;

  // Legacy global path helper used by erosion-bake (set at runtime)
  var getFeaturePath: ((feature: unknown) => string) | undefined;
}
