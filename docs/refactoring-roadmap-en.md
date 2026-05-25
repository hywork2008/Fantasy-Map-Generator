# Refactoring Roadmap

Date Updated: 2026-05-25

This document analyzes the current codebase, where TypeScript porting has been executed from the `public` folder to the `packages` folder, and outlines a mid-to-long-term roadmap and improvement proposals aimed at enhancing maintainability and performance.

The prerequisite coding conventions adhere to `docs/refactoring-coding-guidelines.md`.

## 1. Resolution of Errors Due to Porting Mistakes [Completed]

Compilation errors caused by duplicate type definitions and overlapping files between the `packages` and `src` folders have now been resolved, and `npm run build` completes successfully.

To prevent recurrence, build checks will be maintained via CI and other means. Concurrently with regular feature modifications, the remaining implicit type definitions in `ui-legacy-globals.d.ts` will be progressively replaced with actual `import` statements.

## 2. Relocation to Appropriate Directories by Feature (Architectural Restructuring)

The inside of the `packages` directory is currently divided based on "technical and historical backgrounds," such as `@fmg/core`, `@fmg/legacy-ui`, and `@fmg/shared`. This will be rearranged into a highly cohesive structure based on "feature (domain) units."

### Proposed Improvements
- **Domain-Driven Module Division**: Create directories for each feature, such as `burgs`, `states`, and `rivers`, and consolidate "State Management (State)," "Generation Logic (Generators)," "Rendering (Renderer)," and "UI Operations (Editors)" within them.
  - Before Example: `core/src/modules/burgs-generator.ts`, `legacy-ui/src/modules/ui/burgs-editor.ts`
  - After Example: `packages/@fmg/burgs/generator.ts`, `packages/@fmg/burgs/renderer.ts`, `packages/@fmg/burgs/editor.ts`
- **Clarification of Dependencies**: To strictly adhere to the guideline stating "core does not depend on renderer," a unidirectional dependency flow will be established within each feature folder, where the `Renderer` receives the output results of the `Generator`.

## 3. Refactoring to Improve Maintainability

Some files, such as `packages/@fmg/legacy-ui/src/modules/dynamic/auto-update.ts`, are extremely long (over 1000 lines), and direct DOM manipulation is tightly coupled with data version migration. This has become a breeding ground for "obscure code (magic numbers and implicit assumptions)."

### Proposed Improvements
- **Separation of Migration Processes**: Giant functions such as `resolveVersionConflicts` inside `auto-update.ts` will be split into separate migrator files for each version (e.g., `migrations/v1.0.ts`, `migrations/v1.1.ts`) and transformed into a pipeline process.
- **Elimination of Global Dependencies (window)**: Implicit global references such as `window.pack`, `window.grid`, and `declare let zones: any;` will be abolished. They will be changed to passing arguments via `FmgGlobalContext` (or an equivalent Context/State management class) or importing from a dedicated Store.
- **Separation of UI Components**: Imperative DOM operations using `d3.select` will be extracted into functions to separate the responsibilities of "data modification" and "view update."

## 4. Performance Tuning

Because the application handles massive maps (tens of thousands to hundreds of thousands of cells), SVG/DOM re-rendering and loop processing can become bottlenecks.

### Proposed Improvements
- **Active Adoption of TypedArray**: In loop calculations for cells and vertices (such as `pathUtils.ts` and generators), TypedArrays like `Uint16Array` and `Float32Array` will be actively adopted instead of the standard `Array` to reduce memory allocation and GC (Garbage Collection) overhead.
- **Rendering Optimization (Considering Partial Migration from SVG to Canvas/WebGL)**: Since recalculating tens of thousands of SVG paths during every zoom or pan operation is heavy, migrating the rendering of background textures, static terrain (heightmaps), and ocean layers to Canvas (or WebGL) will be considered.
- **Utilization of Web Workers**: Heavy computational processes such as `routes-generator` (pathfinding) and `heightmap-generator` will be considered for offloading to Web Workers to avoid blocking the main thread.

## 5. Technology Selection and External Library Consolidation

Currently, `packages/@fmg/legacy-ui` heavily depends on jQuery and D3, and state management is scattered across global variables like `window.fmg`. Considering future "performance improvements (migration to Canvas)" and "testability," the adoption of either of the following, or a combination of them, is recommended.

### 5.1. Restructuring UI Libraries and State Management (Recommended)
- **Adoption of React + Zustand/Redux Toolkit**: 
  - While keeping D3 as a rendering library, DOM operations and state management will be handled by React/Zustand to separate the View and Model.
  - `packages/@fmg/legacy-ui` will be deprecated, and new component libraries will be created for each domain, such as `packages/@fmg/burgs-ui` and `packages/@fmg/world-ui`.
- **Utilization of Context API**: 
  - Without necessarily introducing Redux or similar tools, states can be managed in a tree structure using React's Context API to eliminate global dependencies.

### 5.2. Selection and Elimination of External Libraries
- **Re-evaluation of D3.js**: 
  - Instead of using D3 for DOM operations, its use can be limited exclusively to "utility functions" such as `d3-scale` and `d3-interpolate`. Performance can be improved by delegating the actual rendering to Canvas or React's rendering capabilities.
- **Elimination of jQuery**: 
  - If the UI library is switched to React or similar, jQuery will become unnecessary. It will be completely removed to reduce the bundle size.

### Execution Plan
- **Option A (Gradual Refactoring)**: Remove jQuery, use D3 strictly as a utility, manage states using the Context API, and split giant functions.
- **Option B (Full Replace)**: Newly introduce React + Zustand, dismantle `legacy-ui`, and build a new UI component library. Concurrently, minimize the areas where D3 is used.

## Milestones and Execution Plan

- **Phase 1: Stabilization and Compilation Error Resolution [Completed]**
  - Organization of duplicate files and achieving zero TypeScript errors (Achieved)
  - Successful completion of `npm run build` (Achieved)
- **Phase 2: Module Relocation and Dependency Clarification [Current Phase]**
  - Creation of directories for each domain (e.g., `@fmg/burgs`, `@fmg/rivers`) and file relocation
  - Organization of export/import statements, and replacing direct dependencies under `window` with `window.fmg` (or Context)
- **Phase 3: Dismantling Legacy Giant Functions**
  - Splitting and refactoring of files like `auto-update.ts`
  - Turning magic numbers into constants and enforcing strict typing
- **Phase 4: Performance Improvements**
  - Converting data structures into TypedArrays
  - Optimization of D3 rendering and verification of Canvas migration