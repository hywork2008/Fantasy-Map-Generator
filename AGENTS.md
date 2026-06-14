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
| **Editor** | ✅ Allowed | ✅ Allowed | User input handling, controlling state mutations, and triggering re-renders. |

## 2. Global State Elimination & Context Isolation

The legacy practice of attaching objects and functions directly to the global `window` scope is heavily penalized.

- **Zero Global Pollution**: Do NOT assign variables, configurations, or modules to `window.*`. All internal dependencies must be resolved via standard ES `import`/`export` syntax.
- **Context Injection (DI)**: State must be explicitly managed through the three major contexts or injected via function arguments:
  - `WorldContext`: Pure world data store (`pack`, `grid`, `seed`, `options`). No SVG or UI logic.
  - `ViewContext`: Pure view infrastructure store (`svg`, `layers`, `zoom`).
  - `AppServices`: Shared utility functions (`rng`, `history`, `storage`).
- **Object In-place Mutation Constraint**: During legacy synchronization transitions, never replace `grid` or `pack` object references directly (e.g., `grid = newObject`). Use `Object.assign()` to perform in-place mutations so that shared references across legacy code boundaries remain synchronized.
- **Development Mode Backdoor**: Attaching state to the global scope is only permitted inside the explicit DEV environment gate: `if (import.meta.env.DEV) { window.__fmg = { worldContext, viewState }; }`.

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

## 5. Development Pipeline and Git Discipline

- **Pre-commit Quality Gate**: Prior to crafting any commit, you must execute the compilation validation (`npm run build` or `npx tsc --noEmit`) and structural verification linting scripts to ensure zero errors are introduced.
- **Commit Format**: All Git commit messages must be explicitly written in English following structural conventions (e.g., `refactor: migrate module-name to TypeScript`). Do not commit automatically if an error occurs during building.