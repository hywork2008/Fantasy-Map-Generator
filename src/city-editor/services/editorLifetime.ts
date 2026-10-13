/** Owns one editor mount's browser resources; disposal is idempotent. */
export class EditorLifetime {
  private alive = true;
  private cleanups = new Set<() => void>();
  private timers = new Set<number>();
  private frames = new Set<number>();
  private epochs = new Map<string, number>();
  private captures = new Map<Element, Set<number>>();
  private listeners = new Set<{
    target: EventTarget;
    type: string;
    handler: EventListener;
    options?: boolean | AddEventListenerOptions;
    attached: boolean;
  }>();
  private observer: MutationObserver;
  private connected: boolean;

  constructor(private root: HTMLElement) {
    this.connected = root.isConnected;
    this.observer = new MutationObserver(() => {
      if (root.isConnected) this.connected = true;
      else if (this.connected) {
        this.dispose();
        return;
      }
      for (const item of this.listeners) {
        if (!(item.target instanceof Node) || item.target === root) continue;
        if (root.contains(item.target)) item.attached = true;
        else if (item.attached) {
          item.target.removeEventListener(item.type, item.handler, item.options);
          this.listeners.delete(item);
        }
      }
    });
    this.observer.observe(root.ownerDocument, { childList: true, subtree: true });
    this.listen(window, "pagehide", () => this.dispose());
  }

  get active(): boolean {
    return this.alive && (!this.connected || this.root.isConnected);
  }

  listen<K extends keyof GlobalEventHandlersEventMap>(
    target: EventTarget,
    type: K,
    handler: (event: GlobalEventHandlersEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: (event: never) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.alive) return;
    const guarded: EventListener = event => {
      if (!this.active) return;
      (handler as unknown as EventListener)(event);
      if (type === "pointerdown" && target instanceof Element && "pointerId" in event) {
        const pointerId = (event as PointerEvent).pointerId;
        if (target.hasPointerCapture?.(pointerId)) {
          const ids = this.captures.get(target) ?? new Set<number>();
          ids.add(pointerId);
          this.captures.set(target, ids);
        }
      }
    };
    target.addEventListener(type, guarded, options);
    this.listeners.add({
      target,
      type,
      handler: guarded,
      options,
      attached: target instanceof Node && this.root.contains(target)
    });
  }

  replaceChildren(container: Element, ...nodes: (Node | string)[]): void {
    if (!this.active) return;
    for (const item of this.listeners) {
      if (item.target instanceof Node && item.target !== container && container.contains(item.target)) {
        item.target.removeEventListener(item.type, item.handler, item.options);
        this.listeners.delete(item);
      }
    }
    container.replaceChildren(...nodes);
  }

  own(cleanup: () => void): () => void {
    if (!this.alive) {
      cleanup();
      return () => {};
    }
    this.cleanups.add(cleanup);
    return () => {
      if (this.cleanups.delete(cleanup)) cleanup();
    };
  }

  ticket(channel: string): () => boolean {
    const epoch = (this.epochs.get(channel) ?? 0) + 1;
    this.epochs.set(channel, epoch);
    return () => this.active && this.epochs.get(channel) === epoch;
  }

  invalidate(channel: string): void {
    this.epochs.set(channel, (this.epochs.get(channel) ?? 0) + 1);
  }

  timeout(callback: () => void, delay: number): number {
    if (!this.active) return 0;
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (this.active) callback();
    }, delay);
    this.timers.add(id);
    return id;
  }

  frame(callback: FrameRequestCallback): number {
    if (!this.active) return 0;
    const id = requestAnimationFrame(time => {
      this.frames.delete(id);
      if (this.active) callback(time);
    });
    this.frames.add(id);
    return id;
  }

  cancelFrame(id: number): void {
    this.frames.delete(id);
    cancelAnimationFrame(id);
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.observer.disconnect();
    this.epochs.clear();
    for (const [target, ids] of this.captures)
      for (const id of ids) if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
    this.captures.clear();
    for (const item of this.listeners) item.target.removeEventListener(item.type, item.handler, item.options);
    this.listeners.clear();
    for (const id of this.timers) window.clearTimeout(id);
    for (const id of this.frames) cancelAnimationFrame(id);
    this.timers.clear();
    this.frames.clear();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
    this.root.removeAttribute("aria-busy");
    this.root.replaceChildren();
  }
}

const mounts = new WeakMap<HTMLElement, EditorLifetime>();
/** Reusing a root first disposes its previous editor and global listeners. */
export function beginEditorMount(root: HTMLElement): EditorLifetime {
  mounts.get(root)?.dispose();
  const lifetime = new EditorLifetime(root);
  mounts.set(root, lifetime);
  return lifetime;
}
