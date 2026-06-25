import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Battle as BattleClass } from "../controllers/battle-screen";
import type {
  Opisometer as OpismeterClass,
  Planimeter as PlanimeterClass,
  RouteOpisometer as RouteOpisometerClass,
  Ruler as RulerClass,
  Rulers as RulersClass
} from "../controllers/measurers";
import type { GoodsModule } from "../extensions/economy/modules/goods-generator";
import type { MarketsModule } from "../extensions/economy/modules/markets-generator";
import type { ProductionModule } from "../extensions/economy/modules/production-generator";
import type { HeightmapModule } from "../modules/heightmap-generator";
import type { Resampler } from "../modules/resample";

declare global {
  /** DEV-only: organized access to world data and SVG state for console debugging. */
  var __fmg: { worldContext: WorldContext; viewContext: ViewContext } | undefined;

  // Module singletons
  var Resample: Resampler;
  var HeightmapGenerator: HeightmapModule;
  var Goods: GoodsModule;
  var Production: ProductionModule;
  var Markets: MarketsModule;

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

  // Provinces editor callback (set dynamically, read in ProvinceNameEditorDialog.tsx)
  var applyProvinceNameChange: (() => void) | undefined;

  // Legacy global path helper used by erosion-bake (set at runtime)
  var getFeaturePath: ((feature: unknown) => string) | undefined;

  // Browser auto-globals from HTML element IDs (readonly, created by the DOM)
  var addMarker: HTMLElement;
  var allowErosion: HTMLInputElement;
  var areaUnit: HTMLSelectElement;
  var burgBody: HTMLElement;
  var burgsOverviewRefresh: HTMLElement;
  var cellTypeFilter: HTMLSelectElement;
  // cellsDensityMap is exported from controllers/options.ts — not a global, use imports
  var colorsAssigned: HTMLElement;
  var colorsAssignedContainer: HTMLElement;
  var colorsSelect: HTMLSelectElement;
  var colorsSelectFriendly: HTMLElement;
  var colorsSelectValue: HTMLElement;
  var colorsUnassigned: HTMLElement;
  var colorsUnassignedContainer: HTMLElement;
  var conditionSign: HTMLElement;
  var convertColors: HTMLElement;
  var convertOverlay: HTMLInputElement;
  var convertOverlayNumber: HTMLInputElement;
  var distanceScaleInput: HTMLInputElement;
  var distanceUnitInput: HTMLSelectElement;
  var emblemsDownloadSize: HTMLInputElement;
  var heightExponentInput: HTMLInputElement;
  var heightUnit: HTMLSelectElement;
  var heightmapBrushPower: HTMLInputElement;
  var heightmapBrushRadius: HTMLInputElement;
  var heightmapEditMode: HTMLSelectElement;
  var heightmapInfoCell: HTMLElement;
  var heightmapInfoHeight: HTMLElement;
  var heightmapInfoX: HTMLElement;
  var heightmapInfoY: HTMLElement;
  var heightmapLinePower: HTMLInputElement;
  var hideEmblems: HTMLInputElement;
  var hideLabels: HTMLInputElement;
  var undo: HTMLButtonElement;
  var redo: HTMLButtonElement;
  var rescaleLabels: HTMLInputElement;
  var iceNew: HTMLElement;
  var imageConverter: HTMLInputElement;
  var imageConverterPalette: HTMLInputElement;
  var imageToLoad: HTMLInputElement;
  var latitudeInput: HTMLInputElement;
  var latitudeOutput: HTMLInputElement;
  var layersPreset: HTMLSelectElement;
  var longitudeInput: HTMLInputElement;
  var longitudeOutput: HTMLInputElement;
  var mapLayers: HTMLElement;
  var mapName: HTMLInputElement;
  var mapSizeInput: HTMLInputElement;
  var mapSizeOutput: HTMLInputElement;
  var mapToLoad: HTMLInputElement;
  var markerAdd: HTMLElement;
  var markersFooterTotal: HTMLElement;
  var militaryOverviewRefresh: HTMLElement;
  var openPicker: (fill: string, callback: (fill: string) => void) => void;
  var optionsContainer: HTMLElement;
  var optionsSeed: HTMLInputElement;
  var options3dColorSection: HTMLElement;
  var options3dGlobe: HTMLInputElement;
  var options3dGlobeResolution: HTMLInputElement;
  var options3dGlobeRotationNumber: HTMLInputElement;
  var options3dGlobeRotationRange: HTMLInputElement;
  var options3dLightnessNumber: HTMLInputElement;
  var options3dLightnessRange: HTMLInputElement;
  var options3dMesh: HTMLInputElement;
  var options3dMeshLabels3d: HTMLInputElement;
  var options3dMeshRotationNumber: HTMLInputElement;
  var options3dMeshRotationRange: HTMLInputElement;
  var options3dMeshSkinResolution: HTMLInputElement;
  var options3dMeshSky: HTMLInputElement;
  var options3dMeshSkyMode: HTMLSelectElement;
  var options3dMeshWater: HTMLInputElement;
  var options3dOBJSave: HTMLInputElement;
  var options3dScaleNumber: HTMLInputElement;
  var options3dScaleRange: HTMLInputElement;
  var options3dSubdivide: HTMLInputElement;
  var options3dSunColor: HTMLInputElement;
  var options3dSunX: HTMLInputElement;
  var options3dSunY: HTMLInputElement;
  // overviewRegiments is a function exported from controllers/regiments-overview.ts
  var pngResolutionInput: HTMLInputElement;
  var populationRateInput: HTMLInputElement;
  var precInput: HTMLInputElement;
  var precOutput: HTMLInputElement;
  var preview3d: HTMLElement;
  var recalculatePopulation: () => void;
  var regimentAdd: HTMLElement;
  var regimentsFilter: HTMLSelectElement;
  var regimentsOverviewRefresh: HTMLElement;
  var reliefBulkAdd: HTMLElement;
  var reliefBulkRemove: HTMLElement;
  var reliefEditorSet: HTMLSelectElement;
  var reliefIconsDiv: HTMLElement;
  var reliefIconsSeletionAny: HTMLElement;
  var reliefIndividual: HTMLElement;
  var reliefRadiusNumber: HTMLInputElement;
  var reliefSize: HTMLInputElement;
  var reliefSizeNumber: HTMLInputElement;
  var reliefSpacingNumber: HTMLInputElement;
  var reliefTools: HTMLElement;
  var renderOcean: HTMLInputElement;
  var rescaleHigher: HTMLInputElement;
  var rescaleLower: HTMLInputElement;
  var rescaleModifier: HTMLInputElement;
  var routeCreatorGroupSelect: HTMLSelectElement;
  var routeGroup: HTMLSelectElement;
  var stylePreset: HTMLSelectElement;
  var temperatureScale: HTMLSelectElement;
  var templateBody: HTMLElement;
  var templateRedo: HTMLButtonElement;
  var templateToLoad: HTMLInputElement;
  var templateUndo: HTMLButtonElement;
  var tooltip: HTMLElement;
  var unitsFooter: HTMLElement;
  var urbanDensityInput: HTMLInputElement;
  var urbanizationInput: HTMLInputElement;
}

// jQuery UI DialogOptions doesn't allow string for size fields like minHeight/maxHeight/minWidth/maxWidth,
// but jQuery UI itself accepts "auto" and similar string values. Extend to match runtime behavior.
declare namespace anyUI {
  interface DialogOptions {
    minHeight?: number | string;
    maxHeight?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
  }
}
