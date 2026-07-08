# Extension System — Technical Guide

This document describes the architecture, data flow, and implementation patterns of the Fantasy Map Generator extension system. It is intended for engineers who want to understand, create, or maintain extensions.

---

## 1. Overview

The extension system lets new features be added to the map generator without modifying the host application's core modules. Extensions can be:

- **Built-in** — TypeScript modules bundled at compile time (e.g. the economy extension).
- **Dynamic** — ZIP packages installed by the user at runtime and stored in IndexedDB.

Both types share the same lifecycle interface and interact with the host exclusively through `ExtensionAPI`.

---

## 2. Architecture

### 2.1 Host ↔ Extension Boundary

```
┌─────────────────────────────────────────────────────┐
│  Host Application                                   │
│                                                     │
│  WorldContext ─────┐                                │
│  ViewContext  ─────┼──► ExtensionAPI ──► init(api) │
│  AppServices       │         ▲                      │
│  controllers/layers┘         │                      │
│  actions/zoomTo ─────────────┘                      │
└─────────────────────────────────────────────────────┘
```

`ExtensionAPI` is a plain object assembled in `src/app.ts` (`buildExtensionAPI()`). It holds references to the live `WorldContext` and `ViewContext` objects and wraps the host's controller functions behind a stable interface.

The host calls `module.init(window.fmg.extensionAPI)` once when the extension is loaded. From that point the extension is self-driving: it subscribes to state changes, registers its layers and dialogs, and responds to user events — all through `api`.

### 2.2 Why Dependency Injection?

Dynamic extensions are loaded via `import(blobURL)`. The JavaScript module system treats a blob URL as a distinct module specifier, so any `import { worldContext } from "../../context/worldContext"` inside the extension would create a **new instance** of that module — a private copy with its own initial state, not the host's live object.

DI sidesteps this entirely: the host passes its own `worldContext` and `viewContext` references as properties of `api`. The extension always reads the same objects the host mutates, with no need for shared module instances.

### 2.3 The 4-Layer Rule

Extensions must still respect the project's 4-layer architecture:

| Layer | Extension role |
| :--- | :--- |
| **Generator** (`generators/`) | Produce and mutate data in `worldContext.pack.*` |
| **Renderer** (`renderers/`) | Read `Readonly<WorldContext>` and draw SVG — pure, no mutations |
| **Editor** (`controllers/`) | Handle UI events, call generators, trigger redraws via `api` |
| **State** | Read/write only through `api.worldContext` and `api.viewContext` |

Direct `window.*` assignments and direct D3 manipulation outside `renderers/` are forbidden.

---

## 3. `ExtensionAPI` Reference

Defined in [src/types/extension-api.ts](../src/types/extension-api.ts). All methods are injected from `src/app.ts`.

### 3.1 State Access

```typescript
api.worldContext   // live WorldContext — same object the host holds
api.viewContext    // live ViewContext  — SVG layers, zoom, dimensions
```

These are references, not snapshots. Never store them in module-level variables at init time; always dereference lazily (e.g. `api.worldContext.pack.cells`).

### 3.2 Extension Registration

```typescript
api.registerExtension(config, defaultEnabled?)
// Adds the extension to the Extensions tab UI. defaultEnabled=false means
// the extension is installed but not running until the user enables it.

api.subscribeExtensionState((state, prev) => { ... })
// Returns an unsubscribe function. The callback fires whenever any extension
// is enabled or disabled. Use state.enabledExtensions[EXTENSION_ID] to
// check this extension's own state.

api.isExtensionEnabled(id)   // synchronous read of current state
api.toggleExtension(id, forceState?)

api.registerAction(action)   // adds a button to a ToolsTab section
api.registerDialog(dialog)   // registers a React dialog component

api.unregisterExtension(id)  // removes all registrations (call in cleanup)
```

### 3.3 Layer Management

```typescript
api.addLayers(layers: LayerConfig[])
// Appends buttons to the Layers panel. Call when the extension is enabled.

api.removeLayers(ids: string[])
// Removes buttons. Call when the extension is disabled.

api.registerLayerToggle(id, handler)
// Wires the toggle button. Without this, clicking the button does nothing.

api.layerIsOn(id)         // true if the layer is currently active
api.turnLayerOn(id)       // activate button state + update preset
api.turnLayerOff(id)      // deactivate button state + update preset
api.toggleLayerById(id, event?)  // dispatch to the registered handler

api.registerDrawLayerHook(fn)
// fn() is called at the end of drawLayers(). Use to redraw extension
// SVG layers after the host redraws everything.

api.registerLayerElement(id, getter)
// Supplies the <g> element for drag-to-reorder in the Layers panel.
```

### 3.4 Navigation and Dialogs

```typescript
api.zoomTo(x, y, scale, duration?)   // pan/zoom the map
api.openRichDialog(options)           // open an imperative dialog
api.closeDialog(id)
```

### 3.5 Tooltip Hooks

```typescript
api.tooltipExtensions.showMapTooltip = (point, e, i, g, group, subgroup) => boolean;
// Return true if the extension handled the tooltip; host skips its own handler.

api.tooltipExtensions.updateCellInfo = (point, i, g) => void;
// Called when the info panel cell is refreshed.
// Assign in enable path, set to undefined in disable path.
```

---

## 4. Extension Lifecycle

```
app.ts: initExtensions()
    │
    ├── init(api)                    ← built-in extensions called directly
    │       │
    │       ├── initContext(api)
    │       ├── api.registerExtension(...)
    │       ├── api.registerDialog(...)
    │       ├── api.registerAction(...)
    │       ├── api.subscribeExtensionState(...)
    │       ├── api.registerLayerToggle(...)  [for each layer]
    │       ├── api.registerDrawLayerHook(...)
    │       └── document.addEventListener("fmg:generate-post-core", ...)
    │
    └── loadDynamicExtensions()      ← ZIP extensions from IndexedDB
            │
            └── for each record: import(blobURL) → mod.init(api)

User enables extension
    └── subscribeExtensionState callback fires
            └── api.addLayers(layers)
                api.tooltipExtensions.showMapTooltip = ...
                generate initial data if missing

User disables extension
    └── subscribeExtensionState callback fires
            └── turn off active layers
                api.removeLayers(...)
                api.tooltipExtensions.showMapTooltip = undefined

app unload / extension uninstall
    └── cleanup(api)
            ├── _unsubscribe()
            ├── document.removeEventListener(...)
            ├── api.removeLayers(...)
            ├── api.unregisterExtension(EXTENSION_ID)
            └── clearContext()
```

### Important: `fmg:generate-post-core`

The host dispatches `document.dispatchEvent(new CustomEvent("fmg:generate-post-core"))` after the core world has been generated (terrain, biomes, states, burgs, etc.). Extensions that produce derived data (economy, trade, etc.) should listen for this event and run their generators then — not at init time, because the world may not exist yet.

---

## 5. Context Holder Pattern

For extensions with multiple sub-modules, a single `{name}Context.ts` file stores the `api` reference (e.g.
`economyContext.ts`, `nobilityContext.ts`, `shipbuildingContext.ts`):

```
src/extensions/{name}/
├── {name}Context.ts ← stores api, exports getApi() / getWorldContext() / getViewContext()
├── index.ts         ← calls init{Name}Context(api) first, clear{Name}Context() in cleanup
├── generators/      ← generators: call getWorldContext(), never import worldContext
├── renderers/       ← pure SVG: call getViewContext(), getWorldContext()
├── controllers/     ← UI handlers: call getApi() for toggles, zoomTo, dialogs
└── ui/dialogs/      ← React components
```

Sub-modules import from `../context` — never from host paths. This is the mechanism that makes the extension safe to load as a blob URL.

---

## 6. Layer Toggle Pattern

A layer button click calls `toggleLayerById(id, event)` in `layers.ts`, which dispatches to `TOGGLE_REGISTRY[id]`. If no handler is registered for that id, the click is silently ignored.

Every layer added via `api.addLayers()` must have a corresponding `api.registerLayerToggle()` call. The handler follows this structure:

```typescript
api.registerLayerToggle("toggleMyLayer", (_event?: MouseEvent) => {
  if (!api.layerIsOn("toggleMyLayer")) {
    api.turnLayerOn("toggleMyLayer");
    drawMyLayer();
  } else {
    getViewContext().myLayer.html("");   // clear SVG group
    api.turnLayerOff("toggleMyLayer");
  }
});
```

`turnLayerOn` / `turnLayerOff` update the button's active class, write to the current layer preset via `getCurrentPreset()`, and trigger a 3D sync update. Direct button DOM manipulation bypasses all of that and should never be used.

---

## 7. Animated Layers

For layers with continuous animation (e.g. trade route particles), use a bind pattern to connect the animation module to its renderer without circular imports:

```typescript
// In init(), before any toggle can fire:
MyAnimation.bind({
  draw: drawMyAnimation,           // () => void — renders one animation frame
  clear: clearMyAnimation,         // () => void — removes all animation elements
  isLayerOn: () => api.layerIsOn("toggleMyAnimation")
});

api.registerLayerToggle("toggleMyAnimation", () => {
  if (!api.layerIsOn("toggleMyAnimation")) {
    api.turnLayerOn("toggleMyAnimation");
    MyAnimation.start();
  } else {
    MyAnimation.stop();
    api.turnLayerOff("toggleMyAnimation");
  }
});
```

The animation module calls `isLayerOn()` on each frame to decide whether to continue. `start()` / `stop()` manage a `requestAnimationFrame` loop.

---

## 8. Module Augmentation for World Data

Extensions that add new fields to the world data structures declare them with TypeScript module augmentation:

```typescript
// src/extensions/{name}/types.ts
declare module "../../types/PackedGraph" {
  interface PackedGraph {
    myItems: MyItem[];
  }
  interface PackedGraphCells {
    myCell: Uint16Array;
  }
}
```

This file must be imported in `index.ts` with `import "./types"`. The import has no runtime value — it only activates the type declaration.

**Never add extension-specific stubs to `src/types/PackedGraph.ts`**. That file belongs to the host; only host-owned fields live there.

---

## 9. Dynamic ZIP Extensions

### ZIP Structure

```
my-extension.zip
├── manifest.json        ← required
├── index.js             ← bundled entry point (single file, no lazy chunks)
└── style.css            ← optional; injected into <head>
```

`manifest.json` minimum fields:
```json
{ "id": "my-extension", "name": "My Extension", "version": "1.0.0", "description": "..." }
```

### Loading Flow

1. User drops a ZIP in the Extensions tab UI.
2. `installExtensionFromZip(file)` in `dynamicLoader.ts` parses the ZIP via JSZip.
3. The record (`id`, `jsCode`, `cssCode`, `manifest`) is saved to IndexedDB (`fmg-extensions` store) via `extensionDB`.
4. `injectExtension(record)` creates a `Blob` from `jsCode`, calls `URL.createObjectURL(blob)`, and `await import(url)`.
5. The blob URL is revoked immediately after the import resolves.
6. `mod.init(window.fmg.extensionAPI)` is called.

On subsequent app loads, `loadDynamicExtensions()` replays step 4–6 for all enabled extensions from IndexedDB.

### Bundling Requirements for Dynamic Extensions

The JS entry point must be a single self-contained file. Use a bundler configured to output a single chunk with no code-splitting. All extension-internal imports must be inlined. Do not import from the host app — use only what `api` provides.

---

## 10. Reference Implementation: Economy Extension

The economy extension (`src/extensions/economy/`) is the canonical example. It demonstrates every pattern described in this document.

| File | Demonstrates |
| :--- | :--- |
| [index.tsx](../src/extensions/economy/index.tsx) | Full `init`/`cleanup` lifecycle, all registration calls, `subscribeExtensionState`, `registerLayerToggle`, `registerDrawLayerHook`, `TradeAnimation.bind` |
| [economyContext.ts](../src/extensions/economy/economyContext.ts) | Context holder pattern |
| [types.ts](../src/extensions/economy/types.ts) | Module augmentation for `PackedGraph` and `PackedGraphCells` |
| [generators/goods-generator.ts](../src/extensions/economy/generators/goods-generator.ts) | Generator class with private getter pattern |
| [generators/markets-generator.ts](../src/extensions/economy/generators/markets-generator.ts) | Generator with inline helper replacing host `States.getSalesTax()` |
| [generators/trade-animation.ts](../src/extensions/economy/generators/trade-animation.ts) | Animated layer with `bind`/`start`/`stop` |
| [renderers/draw-goods.ts](../src/extensions/economy/renderers/draw-goods.ts) | Pure SVG renderer using `getViewContext()` |
| [controllers/markets-overview.ts](../src/extensions/economy/controllers/markets-overview.ts) | Editor using `getApi().toggleLayerById()` instead of host controller import |

---

## 11. Zustand Stores Used by Extensions

Extensions do not call Zustand stores directly — `ExtensionAPI` wraps them. For reference:

| Store | What it holds | Accessed via |
| :--- | :--- | :--- |
| `useExtensionState` | Registered extensions, enabled flags, actions, dialogs | `api.registerExtension`, `api.isExtensionEnabled`, etc. |
| `useLayerState` | Layer configs, active preset | `api.addLayers`, `api.removeLayers`, `api.layerIsOn` |

`useExtensionState` is persisted to `localStorage` (key `fmg-extensions`) — the `enabledExtensions` map survives page reloads.
