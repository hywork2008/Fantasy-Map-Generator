# Fantasy Map Generator - Project Rules & Architecture Guidelines

This document defines the strict constraints, architectural boundaries, and coding standards for all AI agents working on this repository.

---

## 1. Core Architecture (4-Layer Rule)

The codebase strictly adheres to a unidirectional 4-layer data flow architecture. Every module must be categorized under one of the following layers, passing state downward via read-only references:

```
State (WorldContext / ViewContext / AppServices)
  ↓ Passed down as Readonly references
Generator (src/modules/)   → Generates and mutates world data
Renderer (src/renderers/)  → Pure SVG visualization (No mutations allowed)
Editor (src/controllers/)  → Handles UI/User operations, mutates State, triggers redraws
```

- **State Layer**: Houses `WorldContext`, `ViewContext`, and `AppServices` schemas.
- **Generator Layer (`src/modules/`)**: Implements procedural world simulation and mutates raw data.
- **Renderer Layer (`src/renderers/`)**: Evaluates `Readonly<WorldContext>` to draw SVG infrastructure.
- **Editor Layer (`src/controllers/`)**: Captures UI events, mutates State, and requests redraw operations.

| Layer | Direct DOM / SVG Modification | Writing to `pack` / `grid` | Permitted Actions |
| :--- | :--- | :--- | :--- |
| **Generator** | ❌ Forbidden | ✅ Allowed | Procedural state generation and structural mutation. |
| **Renderer** | ✅ Allowed (SVG only) | ❌ Forbidden | Map state visualization (`Readonly<WorldContext> -> SVG`). Must remain pure. |
| **Editor** | ✅ Allowed (Strictly via events, no direct SVG drawing) | ✅ Allowed | User input handling, controlling state mutations, and triggering re-renders. |

### Renderer Encapsulation Rule
Direct DOM / SVG manipulation using `d3.select("...").append(...)` or similar methods is **strictly prohibited outside of the `src/renderers/` directory**. Non-Renderer layers (such as `src/controllers/` or `src/editors/`) must delegate all drawing operations to the appropriate Renderer (e.g., `BiomesRenderer.render()`).

## 2. Global State Elimination & Context Isolation

The legacy practice of attaching objects and functions directly to the global `window` scope is prohibited.

- **Zero Individual Global Pollution**: Do NOT assign any variable, function, or module to `window.*` individually. All internal module dependencies must be resolved via standard ES `import`/`export` syntax. The `window.*` registration blocks historically present at the end of controller files (e.g. `window.editStates = editStates;`) are dead code and must be deleted on sight.
- **One Allowed Exception — `window.fmg`**: The single permitted global exposure is the typed `window.fmg` namespace, assembled in `app.ts` after all modules have been initialized (see Section 6). No other `window.*` assignment is ever acceptable.
- **Context Injection (DI)**: State must be explicitly managed through the three major contexts or injected via function arguments:
  - `WorldContext` (`src/context/worldContext.ts`): Pure world data store — `pack`, `grid`, `seed`, `mapId`, `mapHistory`, `notes`, `options`, `biomesData`, `nameBases`, `style`, `graphWidth`, `graphHeight`, `mapCoordinates`, `urbanization`, `urbanDensity`, `populationRate`, `distanceScale`. No SVG or UI logic. `graphWidth`/`graphHeight` are equivalent to `options.mapWidth/Height` — they define the logical coordinate space of the generated world and do not change on browser resize, so they belong here.
  - `ViewContext` (`src/context/viewContext.ts`): Pure view infrastructure store. Implemented as a composition of seven domain-grouped interfaces:
    - `RootLayers` — `svg`, `defs`, `viewbox`, `scaleBar`, `legend`, `ruler`, `debug`, `fogging`
    - `EnvironmentLayers` — `ocean`, `oceanLayers`, `oceanPattern`, `landmass`, `texture`, `terrs`, `lakes`, `biomes`, `rivers`, `terrain`, `coastline`, `ice`, `prec`, `temperature`
    - `PoliticalLayers` — `relig`, `cults`, `regions`, `statesBody`, `statesHalo`, `provs`, `zones`, `borders`, `stateBorders`, `provinceBorders`
    - `InfrastructureLayers` — `routes`, `roads`, `trails`, `searoutes`
    - `SettlementLayers` — `icons`, `labels`, `burgLabels`, `burgIcons`, `anchors`, `armies`, `markers`, `emblems`, `population`
    - `EconomyLayers` — `goods`, `marketsFill`, `markets`, `tradeAnimation`
    - `OverlayLayers` — `cells`, `gridOverlay`, `coordinates`, `compass`
    - `ViewState` — `zoom`, `viewX`, `viewY`, `scale`, `customization`, `svgWidth`, `svgHeight`, `lineGen`

    `svgWidth`/`svgHeight` are `Math.min(graphWidth, window.innerWidth/Height)` — they depend on the browser window and change on resize, so they belong here, not in `WorldContext`. D3 rendering utilities (`lineGen`) are likewise view concerns. SVG layer selections are populated by `main.ts` during the synchronous SVG setup phase (via `Object.assign()`) before any renderer runs. Renderers should declare only the group interface(s) they need rather than the full `ViewContext` type.
  - `AppServices` (`src/context/appServices.ts`): Shared utility services — `rng` (pseudo-random number generator), `storage` (IndexedDB wrapper), `COArenderer` (coat-of-arms SVG renderer, nullable).
- **Object In-place Mutation Constraint**: Never replace `grid` or `pack` object references directly (e.g., `grid = newObject`). Use `Object.assign()` to perform in-place mutations so that shared references across module boundaries remain synchronized.

---

## 3. TypeScript & Static Analysis Standards

- **Strict Type Safety**: The use of the `any` keyword is forbidden. If a type cannot be strictly inferred or resolved immediately, declare it as `unknown` and apply explicit type guards.
- **Explicit D3 Selection Types**: Avoid vague typings for SVG layers. Explicitly type all D3 selections, for example: `d3.Selection<SVGGElement, unknown, HTMLElement, any>`.
- **Non-null Assertions**: Use non-null assertions (`!`) only where execution pipelines guarantee that the value is populated beforehand. Document the safety rationale with inline comments.

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

All `page.evaluate()` calls that touch `window.fmg` must be encapsulated in helper functions under `tests/e2e/helpers/` rather than inlined into test bodies. This insulates individual tests from structural changes to `window.fmg`.

User interactions must be driven through DOM clicks and events (Playwright locators), not by calling controller functions via `window.fmg`. `window.fmg` access in tests is reserved for **setup/teardown** and **state assertions** only.

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
| Layer management | `addLayers`, `removeLayers`, `toggleLayerById`, `layerIsOn`, `turnLayerOn`, `turnLayerOff`, `registerLayerToggle`, `registerLayerElement`, `registerDrawLayerHook` |
| Dialog service | `openRichDialog`, `closeDialog` |
| View actions | `zoomTo` |
| Tooltip hooks | `tooltipExtensions` (mutable object — assign in `init()`, clear in `cleanup()`) |

Extension-owned layers are first-class citizens: extensions can add SVG layers via `addLayers()` and hook into the host's `drawLayers()` cycle via `registerDrawLayerHook()`.

---

## 7. Development Pipeline and Git Discipline

- **Pre-commit Quality Gate**: Prior to crafting any commit, you must execute the compilation validation (`npm run build` or `npx tsc --noEmit`) and structural verification linting scripts to ensure zero errors are introduced.
- **Commit Format**: All Git commit messages must be explicitly written in English following structural conventions (e.g., `refactor: migrate module-name to TypeScript`). Do not commit automatically if an error occurs during building.