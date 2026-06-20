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
  - `WorldContext`: Pure world data store (`pack`, `grid`, `seed`, `mapId`, `options`, `graphWidth`, `graphHeight`, `mapCoordinates`, etc.). No SVG or UI logic. `graphWidth`/`graphHeight` are equivalent to `options.mapWidth/Height` — they define the logical coordinate space of the generated world and do not change on browser resize, so they belong here.
  - `ViewContext`: Pure view infrastructure store (`svg`, `viewbox`, all SVG layer `Selection` references, `zoom`, `svgWidth`, `svgHeight`, `lineGen`, etc.). `svgWidth`/`svgHeight` are `Math.min(graphWidth, window.innerWidth/Height)` — they depend on the browser window and change on resize, so they belong here, not in `WorldContext`. D3 rendering utilities (`lineGen`) are likewise view concerns.
  - `AppServices`: Shared utility services (`rng`, `storage`, `COArenderer`).
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
interface FMGWorldAPI {
  readonly pack: PackedGraph;
  readonly grid: Grid;
  readonly seed: string;
  readonly mapId: number;
  readonly notes: WorldNote[];
  readonly mapCoordinates: MapCoordinates;
  readonly options: WorldOptions;
}

interface FMGViewAPI {
  readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  readonly viewbox: d3.Selection<SVGGElement, unknown, null, undefined>;
  /** Browser-window-constrained display dimensions (Math.min(graphWidth, window.innerWidth)) */
  readonly svgWidth: number;
  readonly svgHeight: number;
  // All other SVG layer selections are also accessible here (ViewContext)
  // graphWidth/graphHeight belong to FMGWorldAPI (WorldContext), not here
}

interface FMGActionsAPI {
  generate(options?: { seed?: string; graph?: Grid | null }): Promise<void>;
  zoomTo(x: number, y: number, scale: number, duration?: number): void;
  getWorldState(): WorldState;
}

interface FMGNamespace {
  readonly world: FMGWorldAPI;
  readonly view: FMGViewAPI;
  readonly actions: FMGActionsAPI;
}

declare global {
  interface Window {
    fmg: FMGNamespace;
  }
}
```

### 6.2 Assembly Rule

`window.fmg` is created exactly once, at the end of `initApp()` in `src/app.ts`, and immediately frozen:

```typescript
// src/app.ts — final step of initApp()
window.fmg = Object.freeze({
  world: worldContext,      // C3 Object.defineProperty ensures always-current refs
  view: viewContext,
  actions: { generate, zoomTo, getWorldState },
});
```

**No controller, editor, renderer, or module file may assign to `window.fmg` or any sub-property of it.**

### 6.3 Type Authority

- `src/types/fmg.d.ts` is the **sole** file that declares types for `window.fmg`. All sub-interface types must be defined or re-exported from there.
- `src/types/global.ts` must be kept minimal — it must not duplicate declarations that belong in `fmg.d.ts`. The goal is to eventually reduce `global.ts` to zero declarations.
- The `[key: string]: unknown` index signature in `src/types/window.d.ts` must be removed once all individual `window.*` registrations have been eliminated.

### 6.4 What Does NOT Belong in `window.fmg`

- Controller-internal functions (`editStates`, `toggleHeight`, `layerIsOn`, `confirmationDialog`, etc.) — these are consumed via ES6 imports by other TS modules and must never be surfaced on `window.fmg`.
- Editor lifecycle functions (`initLayers`, `initStyle`, `initTools`, etc.) — these are called once during initialization and have no meaningful post-init callers outside the module.
- Debug flags (`DEBUG`, `INFO`, `WARN`, `ERROR`) — use the module-level exports directly.

---

## 7. Development Pipeline and Git Discipline

- **Pre-commit Quality Gate**: Prior to crafting any commit, you must execute the compilation validation (`npm run build` or `npx tsc --noEmit`) and structural verification linting scripts to ensure zero errors are introduced.
- **Commit Format**: All Git commit messages must be explicitly written in English following structural conventions (e.g., `refactor: migrate module-name to TypeScript`). Do not commit automatically if an error occurs during building.