// Minimal runtime shim for `window.fmg` to allow incremental migration away from
// the legacy compatibility layer. Provides callable stubs that queue calls made
// before the real implementations are registered, then flushes them once
// implementations appear. This file is intended to be imported as early as
// possible (before modules that expect `window.fmg`).

(() => {
  if (typeof window === "undefined") return;
  const global = window as any;
  if (global.fmg && global.fmg.__isShim) return; // already installed

  const queuedCalls: Array<{ prop: string | symbol; args: any[] }> = [];
  const warnTimers = new Map<string | symbol, number>();
  let dropWarned = false;
  const WARN_THROTTLE_MS = 500; // ms between warnings for the same property
  const MAX_QUEUE_LENGTH = 2000; // cap queued calls to avoid memory/CPU blowup
  // Methods that should be ignored (no-op) when called before initialization
  const NOOP_METHODS = new Set<string>(["updateMinimap"]);
  const target: Record<string | symbol, any> = {};

  const handler: ProxyHandler<typeof target> = {
    get(_t, prop) {
      if (prop === "__isShim") return true;
      if (prop === "__queuedCalls") return queuedCalls;
      if (prop === "__flush") {
        return () => {
          try {
            const real = (window as any).fmg;
            while (queuedCalls.length) {
              const c = queuedCalls.shift()!;
              const fn = real?.[c.prop];
                if (typeof fn === "function") {
                try {
                  fn(...c.args);
                } catch (err) {
                  console.error("Error replaying queued fmg call", c.prop, err);
                }
              } else {
                console.warn(`fmg.${String(c.prop)} not implemented yet`);
              }
            }
          } catch (err) {
            console.error("Error flushing fmg queue", err);
          }
        };
      }

      if (!(prop in target)) {
        // If this property is in NOOP_METHODS, expose a noop stub instead of queuing
        const propName = String(prop);
        if (NOOP_METHODS.has(propName)) {
          const noop = (..._args: any[]) => {
            // intentional no-op when called before implementation
          };
          Object.defineProperty(target, prop, { value: noop, configurable: true, writable: true });
        } else {
          const stub = (...args: any[]) => {
            // Keep queue bounded to avoid memory / perf issues when UI floods calls
            if (queuedCalls.length >= MAX_QUEUE_LENGTH) {
              queuedCalls.shift();
              if (!dropWarned) {
                console.warn(`fmg shim: max queued calls reached, dropping oldest entries`);
                dropWarned = true;
              }
            }
            queuedCalls.push({ prop, args });

            // Throttle repeated warnings per property to avoid console spam
            try {
              const now = Date.now();
              const last = warnTimers.get(prop);
              if (!last || now - last > WARN_THROTTLE_MS) {
                console.warn(`fmg.${String(prop)} called before initialization; queued.`);
                warnTimers.set(prop, now);
              }
            } catch (e) {
              // best-effort: ignore timer errors
            }
          };
          Object.defineProperty(target, prop, { value: stub, configurable: true, writable: true });
        }
      }
      return target[prop];
    },
    set(_t, prop, value) {
      // Assign the real implementation into the proxy target
      target[prop] = value;

      // When a real implementation appears for a specific property,
      // immediately replay any queued calls for that property.
      try {
        for (let i = queuedCalls.length - 1; i >= 0; i--) {
          const c = queuedCalls[i];
          if (c.prop === prop) {
            const fn = value;
                if (typeof fn === "function") {
              try {
                fn(...c.args);
              } catch (err) {
                console.error("Error replaying queued fmg call", c.prop, err);
              }
              queuedCalls.splice(i, 1);
            } else if (fn && typeof fn === "object") {
              // If an object implementation is assigned (e.g. an API instance),
              // try to call the queued property on that object if it exists as a function.
                try {
                const maybe = (fn as any)[c.prop];
                if (typeof maybe === "function") {
                  try {
                    maybe(...c.args);
                  } catch (err) {
                    console.error("Error replaying queued fmg call on object", c.prop, err);
                  }
                  queuedCalls.splice(i, 1);
                }
              } catch (err) {
                // ignore
              }
            }
          }
        }
      } catch (err) {
        console.error("Error flushing queued calls on set", err);
      }

      return true;
    },
    has(_t, prop) {
      return prop in target;
    },
    ownKeys() {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Object.getOwnPropertyDescriptor(target, prop) || { configurable: true, enumerable: true, writable: true, value: target[prop as string] };
    }
  };

  const proxy = new Proxy(target, handler);
  global.fmg = proxy;

  // Periodically attempt to replay queued calls when concrete implementations
  // appear on `window.fmg`. Stop once queue is empty or after a timeout.
  let tries = 0;
  const interval = setInterval(() => {
    tries += 1;
    try {
      const real = (window as any).fmg;
      if (!real) return;

      // Try to flush any queued calls when a real function becomes available.
      for (let i = queuedCalls.length - 1; i >= 0; i--) {
        const c = queuedCalls[i];
        try {
          const fn = real[c.prop];
                if (typeof fn === "function") {
              try {
                fn(...c.args);
                queuedCalls.splice(i, 1);
              } catch (err) {
                console.error("Error calling real fmg function during replay", c.prop, err);
              }
            } else if (fn && typeof fn === "object") {
            // If the real value is an object, attempt to call a same-named method on it.
              try {
              const maybe = (fn as any)[c.prop];
              if (typeof maybe === "function") {
                try {
                  maybe(...c.args);
                  queuedCalls.splice(i, 1);
                } catch (err) {
                  console.error("Error calling method on real fmg object during replay", c.prop, err);
                }
              }
            } catch (err) {
              // ignore
            }
          }
        } catch (err) {
          // ignore per-item errors
        }
      }

      if (queuedCalls.length === 0) clearInterval(interval);
      if (tries > 300) clearInterval(interval); // ~30s timeout
    } catch (err) {
      console.error("legacy-fmg-shim check failed", err);
      if (tries > 300) clearInterval(interval);
    }
  }, 100);
})();
