/**
 * Module imports for local bundling
 * Modules have been migrated to packages/@fmg/core/src/modules
 * This file is kept for backward compatibility with build scripts
 */

import { initializeFmg } from "#modules/initialize-fmg";

// Legacy UI modules still rely on a global modules registry.
globalThis.modules ||= {};

import "#modules/voronoi";
import "#modules/heightmap-generator";
import "#modules/features";
import "#modules/names-generator";
import "#modules/ocean-layers";
import "#modules/lakes";


import "#modules/biomes";
import "#modules/cultures-generator";
import "#modules/routes-generator";
import "@fmg/states";
import "#modules/zones-generator";
import "#modules/religions-generator";
import "@fmg/states";
import "#modules/emblem";
import "#modules/ice";
import "#modules/military-generator";
import "@fmg/markers";
import "#modules/fonts";
import "#modules/resample";
import "#modules/ui-tour";

// Renderers for global type definitions
import "../renderers/draw-features";

import "@legacy-ui-runtime/globals-compat";
import "@legacy-ui-runtime/modules/ui/style";
import "@legacy-ui-runtime/modules/ui/tools";
import "@legacy-ui-runtime/modules/ui/world-configurator";
import "@legacy-ui-runtime/modules/ui/heightmap-editor";
import "@fmg/states";
import "@legacy-ui-runtime/modules/ui/biomes-editor";
import "@legacy-ui-runtime/modules/ui/temperature-graph";
import "@legacy-ui-runtime/modules/ui/routes-editor";
import "@legacy-ui-runtime/modules/ui/routes-creator";
import "@legacy-ui-runtime/modules/ui/route-group-editor";
import "@legacy-ui-runtime/modules/ui/ice-editor";
import "@legacy-ui-runtime/modules/ui/lakes-editor";
import "@legacy-ui-runtime/modules/ui/coastline-editor";
import "@legacy-ui-runtime/modules/ui/labels-editor";

import "@legacy-ui-runtime/modules/ui/relief-editor";
import "@fmg/burgs";
import "@legacy-ui-runtime/modules/ui/units-editor";
import "@legacy-ui-runtime/modules/ui/notes-editor";
import "@legacy-ui-runtime/modules/ui/ai-generator";
import "@fmg/states";
import "@legacy-ui-runtime/modules/ui/zones-editor";

import "@legacy-ui-runtime/modules/ui/routes-overview";

import "@legacy-ui-runtime/modules/ui/military-overview";
import "@legacy-ui-runtime/modules/ui/regiments-overview";
import "@fmg/markers";
import "@legacy-ui-runtime/modules/ui/regiment-editor";
import "@legacy-ui-runtime/modules/ui/battle-screen";
import "@legacy-ui-runtime/modules/ui/emblems-editor";
import "@fmg/markers";
import "@legacy-ui-runtime/modules/ui/3d";
import "@legacy-ui-runtime/modules/ui/submap-tool";
import "@legacy-ui-runtime/modules/ui/transform-tool";
import "@legacy-ui-runtime/modules/ui/hotkeys";

import "@legacy-ui-runtime/modules/io/load";
import "@legacy-ui-runtime/modules/io/cloud";

initializeFmg();
