let channel: MessageChannel | undefined;
const pending: Array<() => void> = [];
let lastTimerYield = -Infinity;

/** A timer turn at least this often keeps setTimeout callbacks from waiting behind message tasks. */
const TIMER_YIELD_INTERVAL_MS = 50;

/**
 * Lets queued input, rendering and timers run before long work continues. Unlike
 * `setTimeout(0)`, a message task is not clamped to 4 ms once timers nest, so
 * frequent yields from a long loop do not add idle time of their own. A timer
 * turn is still taken every TIMER_YIELD_INTERVAL_MS so timer callbacks progress.
 */
export function yieldToEventLoop(): Promise<void> {
  const now = performance.now();
  if (typeof MessageChannel === "undefined" || now - lastTimerYield >= TIMER_YIELD_INTERVAL_MS) {
    lastTimerYield = now;
    return new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => pending.shift()?.();
  }
  return new Promise(resolve => {
    pending.push(resolve);
    channel!.port2.postMessage(null);
  });
}
