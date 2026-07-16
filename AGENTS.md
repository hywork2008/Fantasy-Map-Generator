# Fantasy Map Generator - Project Rules & Architecture Guidelines

This document defines the strict constraints, architectural boundaries, and coding standards for all AI agents working on this repository.

---

## 0. Project Orientation for AI Agents

This repository is a fork of [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator). The project is migrating the original JavaScript codebase to TypeScript / React / Zustand while adding project-specific simulation and extension systems.

### Upstream Relationship

- The upstream code is tracked on the `upstream/master` branch.
- A local upstream clone exists at `/Users/h-yamaguchi/Projects/fmg-upstream`.
- `docs/upstream/` contains upstream-derived reference documentation. For this fork's current behavior, prefer `src/` and the non-upstream `docs/` files over `docs/upstream/`.

### Current Source Map

| Path | Role |
| :--- | :--- |
| `src/app.ts` | `initApp()`, React UI bootstrap, `window.fmg` and `ExtensionAPI` assembly |
| `src/main.ts` | Map generation pipeline, load-time behavior, zoom/focus, host event registration |
| `src/initViewLayers.ts` | Single owner for creating and re-acquiring host SVG `<g>` layers |
| `src/context/*.ts` | `WorldContext` / `ViewContext` / `AppServices` / `SimulationContext` |
| `src/generators/` | Terrain, states, military, time, and other data generation/update logic |
| `src/renderers/` | SVG rendering from `Readonly<WorldContext>` |
| `src/renderers/webgl/` | deck.gl-based WebGL hybrid rendering (`webglHybrid` render mode, now the default); see §1.1 |
| `src/controllers/` | UI/editing operations, layer control, redraw requests |
| `src/ui/` | React app, tabs, dialogs, shared components |
| `src/store/` | Zustand stores |
| `src/extensions/` | Built-in extensions and dynamic ZIP extension infrastructure |

### Built-in Extensions

Built-in extensions are initialized from `src/extensions/index.ts` in this order:

| ID | Scope | Default |
| :--- | :--- | :--- |
| `economy` | Goods, markets, production, trade, taxes, treasury | Disabled |
| `characters` | Base character roster, skills, personality, family | Disabled |
| `nobility` | Rulers, officers, province lords, diplomacy modifiers, strategic AI, espionage, mobilization, march capture | Disabled; requires `characters` |
| `shipbuilding` | Shipyard candidates, logging, build queues, completed hulls, foreign interference logs | Disabled; `economy` is optional |

Extensions must communicate with the host through `ExtensionAPI`. Dynamic ZIP extensions are imported from blob URLs and must never import host modules directly.

### Documentation Map

| Path | Use |
| :--- | :--- |
| `docs/this-project.md` | Fork-specific project entry point |
| `docs/map-initialization-process.md` | Initialization, generation order, SVG layer order |
| `docs/webgl-renderer-migration-candidates.md` | WebGL hybrid renderer (deck.gl) architecture, per-layer implementation status, caching/invalidation rules, phase history |
| `docs/webgl-economy-layer-migration.md` | Economy extension's WebGL layer migration notes |
| `docs/extension-system-guide.md` | Extension system technical guide |
| `docs/extension-agent-spec.md` | Extension implementation rules for AI agents |
| `docs/simulation/advance-time.md` | Advance Time and tick hook contract |
| `docs/simulation/` | Simulation specs such as economy, population, and time |
| `docs/analytics/` | Implementation investigations |
| `docs/plan/` | Design plans and discussion logs; some entries describe already-implemented work |
| `docs/debug/` / `docs/reviews/` | Bug investigation and review history |
| `docs/ui/` | UI migration and UI/function mapping notes |
| `docs/upstream/` | Upstream reference material only |

Treat `docs/plan/`, `docs/debug/`, and `docs/reviews/` as time-stamped investigation history unless the implementation in `src/` confirms the behavior. Always reconcile them with source code before treating them as current specification.

---

## 1. Core Architecture (4-Layer Rule)

The codebase strictly adheres to a unidirectional 4-layer data flow architecture. Every module must be categorized under one of the following layers, passing state downward via read-only references:

```
State (WorldContext / ViewContext / AppServices / SimulationContext)
  ↓ Passed down as Readonly references
Generator (src/modules/)   → Generates and mutates world data
Renderer (src/renderers/)  → Pure visualization, SVG or WebGL (No mutations allowed)
Editor (src/controllers/)  → Handles UI/User operations, mutates State, triggers redraws
```

- **State Layer**: Houses `WorldContext`, `ViewContext`, `AppServices`, and `SimulationContext` schemas.
- **Generator Layer (`src/modules/`)**: Implements procedural world simulation and mutates raw data.
- **Renderer Layer (`src/renderers/`)**: Evaluates `Readonly<WorldContext>` / `Readonly<ViewContext>` to draw the map. Two implementations run side by side — legacy SVG renderers (`src/renderers/*.ts`) and the deck.gl-based WebGL hybrid renderer (`src/renderers/webgl/`) — selected at runtime by `viewContext.renderMode` (see §1.1).
- **Editor Layer (`src/controllers/`)**: Captures UI events, mutates State, and requests redraw operations.

| Layer | Direct DOM / SVG Modification | Writing to `pack` / `grid` | Permitted Actions |
| :--- | :--- | :--- | :--- |
| **Generator** | ❌ Forbidden | ✅ Allowed | Procedural state generation and structural mutation. |
| **Renderer** | ✅ Allowed (SVG, or the WebGL hybrid `<canvas>` depending on `renderMode`) | ❌ Forbidden | Map state visualization (`Readonly<WorldContext> -> SVG` or `-> deck.gl layers`). Must remain pure. |
| **Editor** | ✅ Allowed (Strictly via events, no direct SVG drawing) | ✅ Allowed | User input handling, controlling state mutations, and triggering re-renders. |

### SVG Layer Initialization (`src/initViewLayers.ts`)

`src/initViewLayers.ts` is the single designated location for creating and re-acquiring the host SVG `<g>` layers. It exports three functions:

| Function | When called | What it does |
| :--- | :--- | :--- |
| `createViewLayers()` | Once at startup (from `main.ts`) | Creates all `<g>` layers in DOM render order, populates `viewContext` via `Object.assign()` |
| `populateSizeRects()` | Immediately after `worldContext.graphWidth/Height` are set | Appends the size-dependent background `<rect>` elements to `landmass`, `oceanPattern`, `oceanLayers` |
| `reinitializeMapLayers()` | On `fmg:reinitialize-map-layers` event (when a saved map SVG is loaded) | Re-selects all layers from the new DOM, updates `viewContext` in-place, dispatches `fmg:map-layers-reinitialized` |

No other file may create or manage host SVG layers. Extension-owned layers are managed exclusively through `api.addLayers()` / `api.removeLayers()` in the extension system.

### 1.1 Render Modes: SVG vs WebGL Hybrid (`viewContext.renderMode`)

The map has two selectable 2D renderers, tracked by `viewContext.renderMode: "svg" | "webglHybrid"` (`src/context/viewContext.ts`):

| Mode | When active | Map body | SVG layers |
| :--- | :--- | :--- | :--- |
| `webglHybrid` | Default when `isWebgl2Available()` is true | deck.gl canvas (`#webglMapCanvas`; `src/renderers/webgl/deckRenderer.ts` + `buildDeckLayers.ts`) draws most layers directly from `pack`/`grid` | Layers in `hybridLayerPolicy.ts`'s `WEBGL_MANAGED_SVG_LAYER_IDS` are hidden (`body.fmg-webgl-hybrid .fmg-webgl-managed-svg-layer { display: none }`); layers in `HYBRID_SVG_OVERLAY_LAYER_IDS` (texture, relief, scaleBar, legend, coordinates, compass, calendar, etc.) stay as real SVG overlays on top of the canvas |
| `svg` | Default when WebGL2 is unavailable, or the user explicitly switches back | Pure SVG rendering — no deck.gl instance; the original/compatibility path | All layers render as SVG, unchanged |

Key rules:

- The user's explicit choice is sticky and wins over the default: `setRenderMode()` (`src/actions.ts`) writes `viewContext.renderMode` and persists it to `localStorage["fmg-render-mode"]`. A stored `"svg"` or `"webglHybrid"` (when WebGL2 is available) preference is always honored; only a missing/invalid stored value falls back to `isWebgl2Available() ? "webglHybrid" : "svg"`.
- The WebGL renderer is a first-class member of the Renderer layer and must obey the same purity rule as SVG renderers — read `Readonly<WorldContext>` / `Readonly<ViewContext>`, never write `pack` or `grid`.
- Style values (color, opacity, stroke width, font size, dash pattern, etc.) are read from live SVG attributes / `worldContext.style` via `src/renderers/webgl/webglStyleExtractors.ts` — the SVG DOM stays the style source of truth even while hidden by the hybrid layer policy. Any new style-changing handler in `src/controllers/style.ts` that touches a WebGL-mapped attribute must call `scheduleWebglUpdate()` (`src/controllers/layers.ts`), or the change will silently fail to reach the canvas.
- Editing/picking in `webglHybrid` mode goes through `WebglPickDetail` (`src/types/webglPicking.ts`), bridged by `src/services/mapInteraction.ts` into the same editor controllers the SVG path uses. Do not add new DOM-event-only editing paths without a WebGL pick equivalent.
- Full architecture, per-layer implementation status, caching/invalidation rules, and phase history live in `docs/webgl-renderer-migration-candidates.md` — consult it before touching either renderer.

**E2E test hazard**: only specs that call `setRenderMode(page, mode)` (`tests/e2e/helpers/fmg-helpers.ts`) pin their render mode explicitly. Any other spec runs under whatever `renderMode` defaults to in the test browser — currently `webglHybrid` whenever it reports WebGL2 support. A spec that asserts on or clicks SVG elements listed in `WEBGL_MANAGED_SVG_LAYER_IDS` will silently break under that default unless it pins `renderMode: "svg"` or is rewritten against the WebGL pick helpers.

## 2. Global State Elimination & Context Isolation

The legacy practice of attaching objects and functions directly to the global `window` scope is prohibited.

- **Zero Individual Global Pollution**: Do NOT assign any variable, function, or module to `window.*` individually. All internal module dependencies must be resolved via standard ES `import`/`export` syntax. The `window.*` registration blocks historically present at the end of controller files (e.g. `window.editStates = editStates;`) are dead code and must be deleted on sight.
- **One Allowed Exception — `window.fmg`**: The single permitted global exposure is the typed `window.fmg` namespace, assembled in `app.ts` after all modules have been initialized (see Section 6). No other `window.*` assignment is ever acceptable.
- **Context Injection (DI)**: State must be explicitly managed through the four major contexts or injected via function arguments:
  - `WorldContext` (`src/context/worldContext.ts`): Pure world data store — `pack`, `grid`, `seed`, `mapId`, `mapHistory`, `notes`, `options`, `biomesData`, `nameBases`, `style`, `graphWidth`, `graphHeight`, `mapCoordinates`, `urbanization`, `urbanDensity`, `populationRate`, `distanceScale`. No SVG or UI logic. `graphWidth`/`graphHeight` are equivalent to `options.mapWidth/Height` — they define the logical coordinate space of the generated world and do not change on browser resize, so they belong here.
  - `ViewContext` (`src/context/viewContext.ts`): Pure view infrastructure store. Implemented as a composition of six domain-grouped interfaces plus view state:
    - `RootLayers` — `svg`, `defs`, `viewbox`, `scaleBar`, `legend`, `ruler`, `debug`, `fogging`
    - `EnvironmentLayers` — `ocean`, `oceanLayers`, `oceanPattern`, `landmass`, `texture`, `terrs`, `lakes`, `biomes`, `rivers`, `terrain`, `coastline`, `ice`, `prec`, `temperature`
    - `PoliticalLayers` — `relig`, `cults`, `regions`, `statesBody`, `statesHalo`, `provs`, `zones`, `borders`, `stateBorders`, `provinceBorders`
    - `InfrastructureLayers` — `routes`, `roads`, `trails`, `searoutes`
    - `SettlementLayers` — `icons`, `labels`, `burgLabels`, `burgIcons`, `anchors`, `armies`, `markers`, `emblems`, `population`
    - `OverlayLayers` — `cells`, `gridOverlay`, `coordinates`, `compass`
    - `ViewState` — `zoom`, `viewX`, `viewY`, `scale`, `customization`, `svgWidth`, `svgHeight`, `lineGen`, `renderMode`, `webglCanvas`, `webglDeck`

    Extension-owned SVG layers (e.g. `goods`, `marketsLayer`, `tradeAnimation`) are **not** part of `ViewContext`. They are created dynamically by the extension system via `addLayers()` and tracked inside `buildExtensionAPI()` in `app.ts`. Access them via `api.getSvgLayer(id)`, not via `viewContext`.

    `svgWidth`/`svgHeight` are `Math.min(graphWidth, window.innerWidth/Height)` — they depend on the browser window and change on resize, so they belong here, not in `WorldContext`. D3 rendering utilities (`lineGen`) are likewise view concerns. SVG layer selections are populated by `src/initViewLayers.ts` (`createViewLayers()` on startup, `reinitializeMapLayers()` on map load) via `Object.assign()` before any renderer runs. Renderers should declare only the group interface(s) they need rather than the full `ViewContext` type. When a renderer needs fields from multiple groups, declare them with an intersection type (e.g., `Readonly<RootLayers & PoliticalLayers>`). **String-based layer lookups via `viewContext.svg.select("#layerName")` are forbidden** when a typed `ViewContext` field exists for that layer — always use the field directly (e.g., `viewContext.statesBody` instead of `viewContext.svg.select("#statesBody")`).
  - `AppServices` (`src/context/appServices.ts`): Shared utility services — `rng` (pseudo-random number generator), `storage` (IndexedDB wrapper), `COArenderer` (coat-of-arms SVG renderer, nullable).
  - `SimulationContext` (`src/context/simulationContext.ts`): Live, tick-driven simulation state — `currentYear`, `currentMonth`, `currentDay`, `era`, `tickCount`, plus Nobility-owned live state such as `intelligence` and `strategicGoals`. Distinct from `WorldContext` because these values are not static generation output; they mutate repeatedly during a session as `src/generators/timeEngine.ts`'s `advanceTime()` runs. Initialized from `worldContext.options.year`/`month`/`day`/`era` once per generation (`initSimulationClock()`, called from `main.ts` after core generation completes) and mirrored back into `worldContext.options.year`/`month`/`day` on every `advanceTime()` call so legacy readers (`military-generator.ts`, `states-generator.ts`, `markers-generator.ts`, `battle-screen.ts`) keep working unchanged. Extensions read/react to it via `registerTimeTickHook()` on `ExtensionAPI`, not by importing this module directly.
- **Object In-place Mutation Constraint**: Never replace `grid` or `pack` object references directly (e.g., `grid = newObject`). Use `Object.assign()` to perform in-place mutations so that shared references across module boundaries remain synchronized.

---

## 3. TypeScript & Naming Standards

- **Strict Type Safety**: The use of the `any` keyword is forbidden. If a type cannot be strictly inferred or resolved immediately, declare it as `unknown` and apply explicit type guards.
- **Explicit D3 Selection Types**: Avoid vague typings for SVG layers. Explicitly type all D3 selections, for example: `d3.Selection<SVGGElement, unknown, HTMLElement, any>`.
- **Non-null Assertions**: Use non-null assertions (`!`) only where execution pipelines guarantee that the value is populated beforehand. Document the safety rationale with inline comments.
- **File Naming Conventions (React Migration)**: The project is actively migrating away from legacy `kebab-case` filenames. All new and refactored files MUST follow the modern React/TypeScript standard:
  - **React Components (`.tsx`)**: Use `PascalCase` (e.g., `TemplateEditorDialog.tsx`).
  - **Classes/Models (`.ts`)**: Use `PascalCase` (e.g., `HeightmapEditorHistory.ts`).
  - **Utility/Controller Functions (`.ts`)**: Use `camelCase` (e.g., `heightmapEditor.ts`, `interactionManager.ts`). Do NOT use `kebab-case` for new files. If modifying an existing `kebab-case` file heavily, rename it to `camelCase` and update all imports.

---

## 4. UI Migration & Framework Separation

- **jQuery Decoupling**: Do not introduce any new jQuery `$(...)` operations. The codebase is under a migration phase targeting the complete removal of jQuery and jQuery-ui.
- **React and Zustand Integration**: New UI panels, modal menus, and tabs must be implemented as native React components. Use Zustand stores (`useOptionsState`, `useToolsState`) for managing view UI states rather than relying on manual imperative DOM queries (`ensureEl`, `.innerHTML`).
- **Bridge Decoupling Pattern**: When communicating between legacy vanilla JS modules and React components, use explicit custom module interfaces or dispatch `CustomEvent` via `document.dispatchEvent` to ensure low coupling.

---

## 5. E2E Test Access Patterns

E2E tests (Playwright) must never rely on arbitrary `window.*` globals. The only permitted access points are:

- **`window.fmg.world.*`** — Read world state (e.g., `window.fmg.world.mapId` for generation-complete polling, `window.fmg.world.pack` for data assertions).
- **`window.fmg.view.*`** — Access SVG layer references and view geometry (e.g., `window.fmg.view.graphWidth`).
- **`window.fmg.actions.*`** — Invoke intentional public operations (e.g., `window.fmg.actions.zoomTo(x, y, scale)`).
- **`window.fmg.simulation.*`** — Read the live simulation clock (e.g., `window.fmg.simulation.currentYear` after calling `window.fmg.actions.advanceTime(n)`).

All `page.evaluate()` calls that touch `window.fmg` must be encapsulated in helper functions under `tests/e2e/helpers/` rather than inlined into test bodies. This insulates individual tests from structural changes to `window.fmg`.

User interactions must be driven through DOM clicks and events (Playwright locators), not by calling controller functions via `window.fmg`. `window.fmg` access in tests is reserved for **setup/teardown** and **state assertions** only.

### 5.1 Test Maintenance Discipline

Lessons from a session that spent far longer diagnosing test failures than fixing them (full account: `docs/debug/0717-test-suite-fixes-retrospective.md`). Almost every failure was a legitimate source change the tests hadn't caught up with, not an app bug — these are the checks that would have caught it at change time instead of at debugging time:

- Before renaming or removing a DOM `id`/class referenced by tests, `grep -rn` `tests/e2e/` for it first. React-migration-era DOM restructuring (`#optionsTrigger` → `#optionsHide`, `#mapLayers > li` → `> button`, `#statesBodySection > div[data-id]` → virtualized `<tr data-id>`) has repeatedly broken specs silently — a stale selector fails with a generic Playwright timeout, never a "this id doesn't exist" message.
- When flipping a shared simulation/options default (e.g. `useOptionsState`'s `simManpower: false → true`), audit unit tests that call the affected generator directly: their fixtures may be missing fields the new code path now requires (e.g. `cells.maleAdults`/`femaleAdults` for manpower reconciliation in `src/generators/manpower.ts`). The failure symptom is a silently-wrong computed value (e.g. every regiment scaled to 0 troops), not a crash pointing at the missing field.
- When adding an entry to a shared array that some test iterates in full (e.g. `WEBGL_MANAGED_SVG_LAYER_IDS`), check whether the new entry's DOM existence depends on runtime state the iterating test doesn't set up (an extension being enabled, a layer toggle, etc.) — the same source change can break two different tests in opposite directions if one asserts the old behavior and another assumes the new one is already in effect.
- When intentionally reordering rendered layers or other array output, `grep` for order-sensitive `toEqual([...])` assertions over that data and update them in the same change — this drift is invisible to lint/tsc.
- Before "fixing" a component that looks inconsistent with its siblings (e.g. missing an `id` convention other similar dialogs have), `grep` across **all** siblings — including built-in extensions — to find the actual dominant convention before deciding whether the outlier is a bug (fix source) or the newer convention (fix the test's assumption instead).
- In Tools-tab-style UIs, an "edit" button and a "regenerate" button can share the same visible label (e.g. both named "States"). Select by a unique `data-tip`/tooltip attribute in tests instead of `getByRole("button", { name })`, which resolves ambiguously once both exist.
- Any test helper that computes a screen point to click on the map must also guard against interactive SVG overlays sitting on top of the WebGL canvas (state/burg labels, open `.fmg-dialog` panels — see `HYBRID_SVG_OVERLAY_LAYER_IDS` in §1.1) — not just other in-world objects (routes, burg icons). A `page.mouse.click()` at a point covered by one of these never reaches deck.gl's picking layer, and the only symptom is a generic `page.waitForFunction` timeout with no indication of what absorbed the click.

---

## 6. `window.fmg` — The Public API Namespace

`window.fmg` is the single typed, intentional, and externally observable API surface of the application. It is a frozen object assembled once, at the final step of `app.ts`, after every module has been fully initialized.

### 6.1 Structure

```typescript
// src/types/fmg.d.ts  ← sole source of truth for global types
// world/view reuse the full context types directly — no separate FMGWorldAPI/FMGViewAPI wrappers.
export interface FMGActionsAPI {
  generate(options?: { seed?: string; graph?: Grid | null }): Promise<void>;
  regenerateMap(opts?: { seed?: string } | string): void;
  zoomTo(x: number, y: number, scale: number, duration?: number): void;
  resetZoom(duration?: number): void;
  toggleLayer(id: string, event?: MouseEvent): void;
  handleLayersPresetChange(preset: string): void;
  savePreset(): void;
  removePreset(): void;
  changeViewMode(event: MouseEvent): void;
  restoreDefaultEvents(): void;
  unselect(): void;
  getWorldState(): WorldState;
  UITour: UITourModule;
  layerIsOn(el: string): boolean;
  toggleLabels(event?: MouseEvent): void;
  toggleBurgIcons(event?: MouseEvent): void;
  saveGeoJsonZones(): void;
  getGeoJsonZones(): object;
  editBurg(id?: number): void;
}

export interface FMGNamespace {
  readonly world: WorldContext;
  readonly view: ViewContext;
  readonly actions: FMGActionsAPI;
  /** Live simulation clock (currentYear, era, tickCount). */
  readonly simulation: SimulationContext;
  /** Dependency-injection API for dynamically loaded extensions. */
  readonly extensionAPI: ExtensionAPI;
}

declare global {
  interface Window {
    fmg: FMGNamespace;
  }
}
```

### 6.2 Assembly Rule

`window.fmg` is created exactly once in `src/app.ts`, assembled **after** all modules are initialized but **before** extensions are loaded. Both the namespace and the `actions` object are frozen:

```typescript
// src/app.ts — initApp() execution order:
// 1. initReactUI()    — React UI must be ready before controllers mount
// 2. initUtils()      — register utility functions
// 3. initModules()    — load/register module singletons
// 4. initRenderers()  — export renderer functions
// 5. initControllers(worldContext, viewContext, appServices)
// 6. initMain()       — setup SVG layers, event listeners, autosave
// 7. ↓ assemble window.fmg ↓
window.fmg = Object.freeze({
  world: worldContext,
  view: viewContext,
  simulation: simulationContext,
  actions: Object.freeze({
    generate,
    regenerateMap,
    zoomTo,
    resetZoom,
    toggleLayer: toggleLayerById,
    handleLayersPresetChange,
    savePreset,
    removePreset,
    changeViewMode,
    restoreDefaultEvents,
    unselect,
    getWorldState,
    UITour,
    layerIsOn,
    toggleLabels,
    toggleBurgIcons,
    saveGeoJsonZones,
    getGeoJsonZones: buildGeoJsonZones,
    editBurg
  }),
  extensionAPI: buildExtensionAPI()
});
// 8. initExtensions() — dynamic modules can now call window.fmg.extensionAPI
```

**No controller, editor, renderer, or module file may assign to `window.fmg` or any sub-property of it.**

### 6.3 Type Authority

- `src/types/fmg.d.ts` is the **sole** file that declares types for `window.fmg`. All sub-interface types must be defined or re-exported from there.
- `src/types/global.ts` currently contains active declarations for legacy module singletons and DOM element auto-globals. Do not duplicate in `fmg.d.ts` any declaration that belongs in `global.ts`. The long-term goal is to migrate these away, but they are live code — do not delete them without migrating call sites.
- The `[key: string]: unknown` index signature in `src/types/window.d.ts` must be removed once all individual `window.*` registrations have been eliminated.

### 6.4 What Does NOT Belong in `window.fmg`

- Controller-internal functions (`editStates`, `toggleHeight`, `layerIsOn`, `confirmationDialog`, etc.) — these are consumed via ES6 imports by other TS modules and must never be surfaced on `window.fmg`.
- Editor lifecycle functions (`initLayers`, `initStyle`, `initTools`, etc.) — these are called once during initialization and have no meaningful post-init callers outside the module.
- Debug flags (`DEBUG`, `INFO`, `WARN`, `ERROR`) — use the module-level exports directly.

### 6.5 Extension System (`window.fmg.extensionAPI`)

Extensions are dynamically loaded modules that receive the `ExtensionAPI` object as their sole dependency-injection contract. An extension must **never** import directly from host app modules, because dynamic loading creates separate module instances that do not share state with the host.

**Extension entry-point signature:**

```typescript
export function init(api: ExtensionAPI): void;
export function cleanup(api: ExtensionAPI): void; // optional
```

**`ExtensionAPI` (`src/types/extension-api.ts`) groups:**

| Group | Methods |
| :--- | :--- |
| Core contexts | `worldContext` (readonly), `viewContext` (readonly) |
| Extension registry | `registerExtension`, `registerAction`, `registerDialog`, `unregisterExtension`, `toggleExtension`, `isExtensionEnabled`, `subscribeExtensionState` |
| Layer preset management | `registerPreset`, `unregisterPreset` |
| Layer management | `addLayers`, `removeLayers`, `toggleLayerById`, `layerIsOn`, `turnLayerOn`, `turnLayerOff`, `registerLayerToggle`, `registerLayerElement`, `registerDrawLayerHook`, `getSvgLayer`, `registerMapReinitHook` |
| Dialog service | `openRichDialog`, `openDialog`, `closeDialog`, `isDialogOpen` |
| Tool action registry | `registerToolAction`, `unregisterToolAction` |
| View actions | `zoomTo` |
| Tooltip hooks | `tooltipExtensions` (mutable object — assign in `init()`, clear in `cleanup()`) |

Extension-owned layers are first-class citizens: extensions can add SVG layers via `addLayers()` and hook into the host's `drawLayers()` cycle via `registerDrawLayerHook()`.

---

## 7. Extension System — Architecture & Conventions

This section describes how extensions plug into the host app and how the economy extension (`src/extensions/economy/`) serves as the canonical implementation example.

### 7.1 Two Kinds of Extensions

| Kind | Source | Loaded by |
| :--- | :--- | :--- |
| **Built-in** | `src/extensions/<name>/index.ts(x)` — bundled at build time | `src/extensions/index.ts` calls `init(window.fmg.extensionAPI)` directly |
| **Dynamic** | ZIP package uploaded by the user, stored in IndexedDB | `src/extensions/dynamicLoader.ts` — blob URL + `import()` at runtime |

Built-in extensions are ES-module imports resolved at build time and share the same module graph as the host. Dynamic extensions are completely isolated module instances loaded via a revoked blob URL; they **must not** import from any host module file.

### 7.2 Extension Entry Points

Every extension (built-in or dynamic) must export these functions:

```typescript
export function init(api: ExtensionAPI): void;
export function cleanup(api: ExtensionAPI): void; // optional
```

`init()` is called once after `window.fmg` is assembled. `cleanup()` is called when the extension is disabled or uninstalled; it must undo every side effect of `init()` (event listeners, layer registrations, tooltip hooks, tool actions).

### 7.3 Sub-module Context Pattern (`economyContext.ts`)

Because dynamic extensions cannot `import` from host files, a built-in extension that spans multiple sub-modules (generators, renderers, UI dialogs) also avoids direct cross-module host imports. Instead it stores the `ExtensionAPI` reference in a single module-level holder and exposes getters:

```typescript
// src/extensions/economy/economyContext.ts
let _api: ExtensionAPI | null = null;

export function initEconomyContext(api: ExtensionAPI): void { _api = api; }
export function clearEconomyContext(): void { _api = null; }
export function getApi(): ExtensionAPI { /* throws if not initialized */ }
export function getWorldContext() { return getApi().worldContext; }
export function getSvgLayer(id: string) { return getApi().getSvgLayer(id); }
```

Sub-modules call `getWorldContext()` or `getApi().getSvgLayer(...)` instead of importing from `src/context/`. This pattern is required for all future extensions with multiple sub-modules.

### 7.4 SVG Layer Ownership

Extensions declare their layers via `LayerConfig` + `SvgLayerSpec`:

```typescript
// src/store/layerState.tsx
export interface SvgLayerSpec {
  id: string;               // DOM element ID for the SVG <g>
  insertBefore?: string;    // insert before this element's DOM id
  insertAfter?: string;     // insert after this element's DOM id
  display?: "none";         // initial CSS display — omit for visible-by-default
}

export interface LayerConfig {
  id: string;               // toggle button id (e.g. "toggleGoods")
  name: React.ReactNode;    // display label in layer panel
  shortcut: string | null;
  tooltip: string;
  svgLayers?: SvgLayerSpec[];
  sortKey?: string;         // plain-text sort key for layer panel ordering
}
```

When `api.addLayers(layers)` is called, `buildExtensionAPI()` in `app.ts` creates or re-acquires each `SvgLayerSpec` element inside `#viewbox` and caches it in a `Map<string, SvgGroup>`. Retrieve the selection later with `api.getSvgLayer(id)`.

Economy example:

```typescript
export const economyLayers: LayerConfig[] = [
  { id: "toggleGoods",        svgLayers: [{ id: "goods",            insertBefore: "icons", display: "none" }], ... },
  { id: "toggleMarketsLayer", svgLayers: [{ id: "marketsLayerFill", insertBefore: "icons", display: "none" },
                                          { id: "marketsLayer",     insertBefore: "icons", display: "none" }], ... },
  { id: "toggleTrade",        svgLayers: [{ id: "tradeAnimation",   insertAfter:  "marketsLayer" }], ... }
];
```

### 7.5 Host Events

The host dispatches `CustomEvent`s on `document` that extensions can listen to:

| Event | Dispatched from | When |
| :--- | :--- | :--- |
| `fmg:generate-post-core` | `src/main.ts` | After core map generation completes — extensions generate their data here |
| `fmg:reinitialize-map-layers` | `src/io/load.ts` | When a saved map is loaded — triggers host SVG layer rebuild |
| `fmg:map-layers-reinitialized` | `src/main.ts` | After host SVG layer rebuild completes — `buildExtensionAPI` re-acquires extension `<g>` elements and fires `registerMapReinitHook` callbacks |

Extensions listen to `fmg:generate-post-core` directly via `document.addEventListener`. They should **not** listen to `fmg:map-layers-reinitialized` directly; use `api.registerMapReinitHook()` instead — the API layer re-acquires SVG elements automatically before calling the hooks.

Economy example:

```typescript
// Listen for core map generation to generate economy data
_generatePostCoreHandler = () => {
  if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
    Goods.generate();
    Markets.generate();
    Production.produce();
  }
};
document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);

// Re-attach SVG click handlers after every map load
api.registerMapReinitHook(() => {
  if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) attachSvgClickHandlers();
});
```

### 7.6 Enable / Disable Lifecycle

Extension enable/disable state is persisted via the Zustand store `useExtensionState` (key `"fmg-extensions"` in `localStorage`). Extensions subscribe to state changes with `api.subscribeExtensionState()` to add/remove their layers and data reactively:

```typescript
_unsubscribe = api.subscribeExtensionState((state, prevState) => {
  const isEnabled  = state.enabledExtensions[ECONOMY_EXTENSION_ID];
  const wasEnabled = prevState.enabledExtensions[ECONOMY_EXTENSION_ID];

  if (isEnabled && !wasEnabled) {
    api.addLayers(economyLayers);
    // register presets, tooltip hooks, generate data if missing…
  } else if (!isEnabled && wasEnabled) {
    api.removeLayers(economyLayers.map(l => l.id));
    // close dialogs, clear worldContext data, remove tooltip hooks…
  }
});
```

`cleanup()` must call the returned unsubscribe function and `document.removeEventListener` for any events registered in `init()`.

### 7.7 UI Integration Points

| Mechanism | How extension registers | Host render location |
| :--- | :--- | :--- |
| **Toolbar button → dialog** | `api.registerAction({ tab: "tools", section: "edit" \| "regenerate", … })` | ToolsTab buttons |
| **Dialog component** | `api.registerDialog({ id, extensionId, component })` | React dialog portal |
| **Tool action handler** | `api.registerToolAction(eventName, handler)` | Called by `tools.ts` fallback when `react-tool-action` CustomEvent fires |
| **Layer preset** | `api.registerPreset(id, label, layers)` | Layer-preset dropdown |
| **Tooltip / cell info** | `api.tooltipExtensions.showMapTooltip = …` | Tooltip pipeline in `uiHelpers.ts` |

The tool action pattern decouples core `tools.ts` from extension dialogs: extension actions dispatch `new CustomEvent("react-tool-action", { detail: { action: "editGoods" } })`, and the extension registers a handler via `api.registerToolAction("editGoods", handler)` that `tools.ts` calls as a fallback.

### 7.8 Dynamic Extension Packaging

Dynamic extensions are distributed as ZIP files containing:

```
manifest.json   ← { id, name, version } — required
index.js        ← single bundled ESM file (may also be .mjs)
styles.css      ← optional
```

The loader (`dynamicLoader.ts`) validates the manifest, stores the record in IndexedDB (`extensionDB`), then creates a blob URL and calls `import(url)` to isolate the module. The URL is revoked immediately after the `import()` resolves. The module's `init(api)` is called with `window.fmg.extensionAPI`.

---

## 8. Development Pipeline and Git Discipline

- **Pre-commit Quality Gate**: Prior to crafting any commit, you must execute the compilation validation (`npm run build` or `npx tsc --noEmit`) and structural verification linting scripts to ensure zero errors are introduced.
- **No Circular Dependencies**: Run `npm run madge` (`madge --circular --extensions ts,tsx src/app.ts`) and confirm it reports no circular dependency before committing. If a cycle is introduced, resolve it by extracting shared types/utilities into a dependency-free module rather than suppressing the check.
- **End-of-Task Error Checks**: At the end of every editing task (not only right before a commit), confirm both of the following are clean:
  - **No VS Code Problems**: The VS Code PROBLEMS tab shows no errors for the files you touched. Note that `tsconfig.json` excludes `src/**/*.test.ts` and `src/test-setup.ts`, so `npx tsc --noEmit` silently skips type errors in test files — the PROBLEMS tab (or a temporary tsconfig with those excludes removed) is the only way to catch them.
  - **No Lint Errors**: `npm run lint` (`biome check --write` + `lint:legacy`) reports zero errors/warnings. Do not leave a `biome-ignore` suppression comment for a rule that is already disabled for that file's path (check `biome.json` overrides first) — it will itself be flagged as an ineffective suppression.
- **Commit Format**: All Git commit messages must be explicitly written in English following structural conventions (e.g., `refactor: migrate module-name to TypeScript`). Do not commit automatically if an error occurs during building.
