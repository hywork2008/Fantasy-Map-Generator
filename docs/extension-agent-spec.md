# Extension Authoring Spec for AI Agents

This document defines the strict rules, file templates, and checklists that AI agents must follow when creating or modifying extensions for Fantasy Map Generator.

---

## 1. Core Constraint: No Direct Host Imports

**Never import from host app modules inside an extension.**

Extensions may be loaded via blob URL at runtime. When that happens, any direct import from the host (e.g. `import { worldContext } from "../../context/worldContext"`) creates a **separate module instance** that does not share state with the host — all reads return stale data and writes are silently lost.

| Forbidden | Required |
| :--- | :--- |
| `import { worldContext } from "../../context/worldContext"` | `api.worldContext` |
| `import { viewContext } from "../../context/viewContext"` | `api.viewContext` |
| `import { toggleLayerById } from "../../controllers/layers"` | `api.toggleLayerById(id)` |
| `import { zoomTo } from "../../actions"` | `api.zoomTo(x, y, scale)` |
| `import { useExtensionState } from "../../store/extensionState"` | `api.isExtensionEnabled(id)` |

The `ExtensionAPI` object passed to `init(api)` is the **only** dependency injection surface. Every host capability the extension needs must be accessed through it.

---

## 2. Mandatory File: `{extension}/context.ts`

Every extension with more than one sub-module **must** have a module-level context holder file. This avoids threading `api` through every function call.

```typescript
// src/extensions/{name}/context.ts
import type { ExtensionAPI } from "../../types/extension-api";

let _api: ExtensionAPI | null = null;

export function initContext(api: ExtensionAPI): void { _api = api; }
export function clearContext(): void { _api = null; }

export function getApi(): ExtensionAPI {
  if (!_api) throw new Error("[{name}] Extension context not initialized");
  return _api;
}
export function getWorldContext() { return getApi().worldContext; }
export function getViewContext()  { return getApi().viewContext; }
```

- Call `initContext(api)` as the **first line** of `init(api)`.
- Call `clearContext()` as the **last line** of `cleanup(api)`.
- Sub-modules call `getWorldContext()` / `getViewContext()` / `getApi()` — they never receive `api` directly.

---

## 3. Mandatory Entry Point: `{extension}/index.ts(x)`

```typescript
// src/extensions/{name}/index.ts
import type { ExtensionAPI } from "../../types/extension-api";
import { clearContext, getApi, initContext } from "./context";

export const EXTENSION_ID = "{name}";

let _unsubscribe: (() => void) | null = null;
let _generateHandler: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  initContext(api);

  // 1. Register extension metadata
  api.registerExtension({ id: EXTENSION_ID, name: "...", description: "..." }, false);

  // 2. Register dialogs
  api.registerDialog({ id: "...", extensionId: EXTENSION_ID, component: MyDialog });

  // 3. Register toolbar actions
  api.registerAction({ id: "...", extensionId: EXTENSION_ID, tab: "tools", section: "edit", label: "...", onClick: () => {} });

  // 4. Subscribe to enable/disable toggle
  _unsubscribe = api.subscribeExtensionState((state, prev) => {
    const isEnabled  = state.enabledExtensions[EXTENSION_ID];
    const wasEnabled = prev.enabledExtensions[EXTENSION_ID];
    if (isEnabled && !wasEnabled) {
      api.addLayers(myLayers);
      // register toggles, bind renderers, start hooks
    } else if (!isEnabled && wasEnabled) {
      myLayers.forEach(l => { if (api.layerIsOn(l.id)) api.toggleLayerById(l.id); });
      api.removeLayers(myLayers.map(l => l.id));
    }
  });

  // 5. Register layer toggle handlers (see Section 5)
  // 6. Register draw hook (see Section 6)
  // 7. If already enabled at load, replay the enable path
  if (api.isExtensionEnabled(EXTENSION_ID)) {
    api.addLayers(myLayers);
  }

  // 8. Listen for post-generation event
  _generateHandler = () => {
    if (api.isExtensionEnabled(EXTENSION_ID)) { /* re-generate */ }
  };
  document.addEventListener("fmg:generate-post-core", _generateHandler);
}

export function cleanup(api: ExtensionAPI): void {
  _unsubscribe?.(); _unsubscribe = null;
  if (_generateHandler) {
    document.removeEventListener("fmg:generate-post-core", _generateHandler);
    _generateHandler = null;
  }
  api.removeLayers(myLayers.map(l => l.id));
  api.unregisterExtension(EXTENSION_ID);
  clearContext();
}
```

---

## 4. Module Augmentation for PackedGraph / PackedGraphCells

If the extension adds fields to `PackedGraph` or `PackedGraphCells`, declare them via TypeScript module augmentation — **never add stubs to `src/types/PackedGraph.ts`**.

```typescript
// src/extensions/{name}/types.ts
import type { MyThing } from "./models";

declare module "../../types/PackedGraph" {
  interface PackedGraph {
    things: MyThing[];
  }
  interface PackedGraphCells {
    thing: Uint16Array;
  }
}
```

Then import this file at the top of `index.ts` to activate the augmentation:

```typescript
import "./types"; // activate module augmentation
```

---

## 5. Layer Toggle Handlers

Every SVG layer the extension owns **must** have a registered toggle handler. Without it, clicking the layer button is a silent no-op.

```typescript
// Must be called in init(), after api.addLayers() or before it — order doesn't matter
api.registerLayerToggle("toggleMyLayer", (_event?: MouseEvent) => {
  if (!api.layerIsOn("toggleMyLayer")) {
    api.turnLayerOn("toggleMyLayer");
    drawMyLayer();           // call your renderer
  } else {
    getViewContext().myLayer.html(""); // clear SVG group
    api.turnLayerOff("toggleMyLayer");
  }
});
```

Rules:
- One `registerLayerToggle` call per layer id.
- Always use `api.turnLayerOn` / `api.turnLayerOff` (not direct DOM manipulation) to keep button state and layer presets in sync.
- If the layer has an animated renderer (e.g. `TradeAnimation`), call `.bind({ draw, clear, isLayerOn })` **before** any toggle can fire — i.e. before `init()` registers the toggle.

---

## 6. Draw Layer Hook

Register a hook so the extension's layers redraw whenever the host calls `drawLayers()` (triggered by map regeneration, style changes, etc.):

```typescript
api.registerDrawLayerHook(() => {
  if (api.layerIsOn("toggleMyLayer")) drawMyLayer();
  if (api.layerIsOn("toggleMyAnimation")) MyAnimation.start();
});
```

---

## 7. Class-Based Modules: Getter Pattern

When converting a class that previously imported `worldContext` directly, use a private getter so every method call always reads from `getWorldContext()` (the lazy live reference):

```typescript
import { getViewContext, getWorldContext } from "../context";

export class MyModule {
  private get worldContext() { return getWorldContext(); }
  private get viewContext()  { return getViewContext(); }

  doSomething(): void {
    const { pack } = this.worldContext; // always current
  }
}
```

Do **not** store `worldContext` in a constructor parameter or module-level `const` — those capture the reference at init time and may be stale.

---

## 8. ZIP Extension Manifest

Dynamic (user-installable) extensions must include `manifest.json` at the ZIP root:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Short description shown in the extensions tab."
}
```

The ZIP must also contain exactly one `.js` or `.mjs` file (the bundled entry point). An optional `.css` file is injected into `<head>` automatically.

The bundled JS must be a self-contained single file — **no lazy chunks**. The module must export `init` and optionally `cleanup`.

---

## 9. Forbidden Patterns Checklist

Before committing, verify none of the following are present in extension code:

- [ ] Direct import of `worldContext`, `viewContext`, `appServices` from host modules
- [ ] Direct import of controller functions (`toggleLayerById`, `turnButtonOn`, `drawLayers`, etc.)
- [ ] Direct import of action functions (`zoomTo`, `generate`) from host modules
- [ ] Any `window.*` assignment other than through `window.fmg`
- [ ] Economy-type stubs added to `src/types/PackedGraph.ts` instead of module augmentation
- [ ] Missing `registerLayerToggle` for an `addLayers`-registered layer
- [ ] Missing `registerDrawLayerHook` when the extension owns renderable layers
- [ ] Missing `import "./types"` when the extension uses module augmentation
- [ ] `_unsubscribe` not called in `cleanup()`
- [ ] `clearContext()` not called in `cleanup()`

---

## 10. Build Validation

After any change to extension code:

```bash
npx tsc --noEmit          # must produce zero output (zero errors)
npx biome check --write src/extensions/{name}/  # auto-fix lint/format
```

Do not commit if either command produces errors.

---

## 11. Reference Implementation

The canonical example is `src/extensions/economy/`. Key files:

| File | Purpose |
| :--- | :--- |
| [economy/index.tsx](../src/extensions/economy/index.tsx) | Entry point: `init` / `cleanup`, all registrations |
| [economy/economyContext.ts](../src/extensions/economy/economyContext.ts) | Context holder: `getWorldContext`, `getViewContext`, `getApi` |
| [economy/types.ts](../src/extensions/economy/types.ts) | Module augmentation for `PackedGraph` |
| [economy/generators/goods-generator.ts](../src/extensions/economy/generators/goods-generator.ts) | Generator class using private getter pattern |
| [economy/renderers/draw-goods.ts](../src/extensions/economy/renderers/draw-goods.ts) | Pure SVG renderer using `getViewContext()` |
