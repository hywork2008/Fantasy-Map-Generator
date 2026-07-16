/**
 * Minimal browser-global stubs so standalone scripts/*.ts tools can import app modules (Zustand
 * stores, etc.) that read `localStorage`/`window`/`document` at module scope, mirroring
 * src/test-setup.ts. Must be imported before any app module that touches these.
 */

if (typeof window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}

if (typeof Node === "undefined") {
  (globalThis as Record<string, unknown>).Node = {
    prototype: {
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  };
}

if (typeof document === "undefined") {
  (globalThis as Record<string, unknown>).document = {
    readyState: "complete",
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null
  };
}

if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
  const store: Record<string, string> = {};
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    }
  };
}
