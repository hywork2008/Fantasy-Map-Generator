// Bootstrap core side-effect modules that register window.fmg APIs.
// Keep this file free of legacy-ui imports that call requireFmgApi at module load.

globalThis.modules ||= {};

import "#modules/voronoi";
import "#modules/heightmap-generator";
import "#modules/features";
import "#modules/names-generator";
import "#modules/ocean-layers";
import "#modules/lakes";
import "#modules/river-generator";
import "#modules/burgs-generator";
import "#modules/biomes";
import "#modules/cultures-generator";
import "#modules/routes-generator";
import "#modules/states-generator";
import "#modules/zones-generator";
import "#modules/religions-generator";
import "#modules/provinces-generator";
import "#modules/emblem";
import "#modules/ice";
import "#modules/military-generator";
import "#modules/markers-generator";
import "#modules/fonts";
import "#modules/resample";
import "#modules/ui-tour";
