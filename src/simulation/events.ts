/**
 * Simulation event bus (docs/plan/simulation-core-separation.md §6.1, S2).
 *
 * The simulation core used `document` as its event bus. It now dispatches and listens on
 * `simEvents`, a plain EventTarget that exists in browsers, Workers and Node alike. The API keeps
 * the DOM shape (`dispatchEvent(new CustomEvent(name, { detail }))`, `addEventListener`) so call
 * sites and listeners did not change meaning — the same `fmg:*` names, the same mutable `detail`
 * objects (request/response events still fill `detail` synchronously).
 *
 * In the browser, `connectSimulationEventsToDocument()` bridges both ways:
 * - every event the core dispatches is re-dispatched on `document`, after the core's own
 *   listeners, so existing UI/extension listeners keep working unchanged;
 * - for every event name the core listens to, an event dispatched on `document` by the host
 *   (generation pipeline, UI, extension entry points) is relayed into the core.
 * Events relayed one way are never relayed back, so nothing loops or fires twice.
 */

type Bridge = {
  readonly forward: (type: string, detail: unknown) => void;
  readonly listenHost: (type: string) => void;
};

class SimulationEventTarget extends EventTarget {
  private bridge: Bridge | null = null;
  private readonly subscribedTypes = new Set<string>();

  override dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    this.bridge?.forward(event.type, (event as CustomEvent).detail);
    return result;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    super.addEventListener(type, listener, options);
    if (this.subscribedTypes.has(type)) return;
    this.subscribedTypes.add(type);
    this.bridge?.listenHost(type);
  }

  /** Delivers a host event to core listeners only (no forwarding back to the host). */
  deliverFromHost(type: string, detail: unknown): void {
    super.dispatchEvent(new CustomEvent(type, { detail }));
  }

  connect(bridge: Bridge): void {
    this.bridge = bridge;
    for (const type of this.subscribedTypes) bridge.listenHost(type);
  }
}

export const simEvents = new SimulationEventTarget();

let connectedDocument: Document | null = null;

/** Browser adapter: mirror core events onto `document` and relay host events into the core. */
export function connectSimulationEventsToDocument(target: Document = document): void {
  if (connectedDocument === target) return;
  connectedDocument = target;
  const forwarded = new WeakSet<Event>();
  const relayed = new Set<string>();
  simEvents.connect({
    forward: (type, detail) => {
      const event = new CustomEvent(type, { detail });
      forwarded.add(event);
      target.dispatchEvent(event);
    },
    listenHost: type => {
      if (relayed.has(type)) return;
      relayed.add(type);
      target.addEventListener(type, event => {
        if (forwarded.has(event)) return;
        simEvents.deliverFromHost(type, (event as CustomEvent).detail);
      });
    }
  });
}
