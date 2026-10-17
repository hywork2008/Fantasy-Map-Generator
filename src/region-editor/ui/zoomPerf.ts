/**
 * Zoom/render performance recorder for the Region Editor.
 *
 * While recording it collects:
 * - wheel input (event count, summed deltaY, zoom range, handler time incl. forced layout),
 * - per-frame text-scale patches (time, touched elements),
 * - full re-renders split into build (string) / parse (innerHTML) / post (stats, events) /
 *   paint (time until the next frame after commit),
 * - frame gaps from a rAF probe (catches GPU/raster stalls that no JS timer sees),
 * - long tasks reported by the browser (PerformanceObserver "longtask").
 *
 * Every span is also emitted as performance.measure("re:<name>") so it lines up in the DevTools
 * Performance panel. Console access: window.__rePerf.start() / stop() / report() / json().
 */

export type PerfSpanKind = "wheel" | "textScale" | "render" | "longTask" | "frameGap";

export interface PerfSpan {
  kind: PerfSpanKind;
  /** ms since recording started */
  at: number;
  duration: number;
  detail?: Record<string, number | string>;
}

export interface PerfSummary {
  recordingMs: number;
  wheel: { events: number; sumAbsDeltaY: number; zoomMin: number; zoomMax: number; zoomSteps: number; handlerMs: Stat };
  textScale: { frames: number; elements: number; ms: Stat };
  render: {
    count: number;
    ms: Stat;
    buildMs: Stat;
    parseMs: Stat;
    postMs: Stat;
    paintMs: Stat;
    maxSvgElements: number;
  };
  frames: { count: number; ms: Stat; over50ms: number; over100ms: number; over500ms: number };
  longTasks: { count: number; ms: Stat };
}

export interface Stat {
  total: number;
  mean: number;
  p95: number;
  max: number;
}

function stat(values: number[]): Stat {
  if (!values.length) return { total: 0, mean: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    total: r(total),
    mean: r(total / sorted.length),
    p95: r(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
    max: r(sorted[sorted.length - 1])
  };
}

const MAX_SPANS = 20_000;

export class ZoomPerfRecorder {
  recording = false;
  private t0 = 0;
  private stoppedAt = 0;
  private spans: PerfSpan[] = [];
  private frameIntervals: number[] = [];
  private zoomMin = Number.POSITIVE_INFINITY;
  private zoomMax = 0;
  private sumAbsDelta = 0;
  private rafId = 0;
  private lastFrame = 0;
  private observer: PerformanceObserver | undefined;
  onChange: (() => void) | undefined;

  start(): void {
    this.clear();
    this.recording = true;
    this.t0 = performance.now();
    this.lastFrame = this.t0;
    const probe = (now: number) => {
      if (!this.recording) return;
      const gap = now - this.lastFrame;
      this.lastFrame = now;
      this.frameIntervals.push(gap);
      if (gap > 50) this.push("frameGap", now - gap, gap);
      this.rafId = requestAnimationFrame(probe);
    };
    this.rafId = requestAnimationFrame(probe);
    try {
      this.observer = new PerformanceObserver(list => {
        for (const e of list.getEntries()) this.push("longTask", e.startTime, e.duration);
      });
      this.observer.observe({ type: "longtask", buffered: false });
    } catch {
      this.observer = undefined; // longtask is Chromium-only
    }
    this.onChange?.();
  }

  stop(): void {
    if (!this.recording) return;
    this.recording = false;
    this.stoppedAt = performance.now();
    cancelAnimationFrame(this.rafId);
    this.observer?.disconnect();
    this.onChange?.();
  }

  clear(): void {
    this.spans = [];
    this.frameIntervals = [];
    this.zoomMin = Number.POSITIVE_INFINITY;
    this.zoomMax = 0;
    this.sumAbsDelta = 0;
    this.stoppedAt = 0;
  }

  private push(kind: PerfSpanKind, start: number, duration: number, detail?: PerfSpan["detail"]): void {
    if (this.spans.length >= MAX_SPANS) return;
    this.spans.push({ kind, at: Math.round((start - this.t0) * 10) / 10, duration, detail });
    if (kind !== "longTask" && kind !== "frameGap") {
      try {
        performance.measure(`re:${kind}`, { start, duration });
      } catch {
        // measure with options is unsupported in old engines
      }
    }
  }

  wheel(start: number, deltaY: number, zoomBefore: number, zoomAfter: number): void {
    if (!this.recording) return;
    this.sumAbsDelta += Math.abs(deltaY);
    this.zoomMin = Math.min(this.zoomMin, zoomBefore, zoomAfter);
    this.zoomMax = Math.max(this.zoomMax, zoomBefore, zoomAfter);
    this.push("wheel", start, performance.now() - start, { deltaY, zoom: Math.round(zoomAfter * 1000) / 1000 });
    this.onChange?.();
  }

  textScale(start: number, elements: number): void {
    if (!this.recording) return;
    this.push("textScale", start, performance.now() - start, { elements });
  }

  /** Records a full re-render; paint time is measured until the next animation frame. */
  render(
    start: number,
    buildEnd: number,
    parseEnd: number,
    postEnd: number,
    info: Record<string, number | string>
  ): void {
    if (!this.recording) return;
    requestAnimationFrame(() => {
      const paintEnd = performance.now();
      this.push("render", start, paintEnd - start, {
        ...info,
        buildMs: buildEnd - start,
        parseMs: parseEnd - buildEnd,
        postMs: postEnd - parseEnd,
        paintMs: paintEnd - postEnd
      });
      this.onChange?.();
    });
  }

  summary(): PerfSummary {
    const of = (k: PerfSpanKind) => this.spans.filter(s => s.kind === k);
    const wheels = of("wheel");
    const texts = of("textScale");
    const renders = of("render");
    const long = of("longTask");
    const num = (s: PerfSpan, key: string) => Number(s.detail?.[key] ?? 0);
    const end = this.recording ? performance.now() : this.stoppedAt || this.t0;
    return {
      recordingMs: Math.round(end - this.t0),
      wheel: {
        events: wheels.length,
        sumAbsDeltaY: Math.round(this.sumAbsDelta),
        zoomMin: wheels.length ? Math.round(this.zoomMin * 1000) / 1000 : 0,
        zoomMax: Math.round(this.zoomMax * 1000) / 1000,
        zoomSteps: wheels.filter(s => num(s, "deltaY") !== 0).length,
        handlerMs: stat(wheels.map(s => s.duration))
      },
      textScale: {
        frames: texts.length,
        elements: texts.length ? num(texts[texts.length - 1], "elements") : 0,
        ms: stat(texts.map(s => s.duration))
      },
      render: {
        count: renders.length,
        ms: stat(renders.map(s => s.duration)),
        buildMs: stat(renders.map(s => num(s, "buildMs"))),
        parseMs: stat(renders.map(s => num(s, "parseMs"))),
        postMs: stat(renders.map(s => num(s, "postMs"))),
        paintMs: stat(renders.map(s => num(s, "paintMs"))),
        maxSvgElements: Math.max(0, ...renders.map(s => num(s, "svgElements")))
      },
      frames: {
        count: this.frameIntervals.length,
        ms: stat(this.frameIntervals),
        over50ms: this.frameIntervals.filter(v => v > 50).length,
        over100ms: this.frameIntervals.filter(v => v > 100).length,
        over500ms: this.frameIntervals.filter(v => v > 500).length
      },
      longTasks: { count: long.length, ms: stat(long.map(s => s.duration)) }
    };
  }

  /** Full dump (summary + raw timeline) for offline analysis. */
  json(): string {
    return JSON.stringify({ userAgent: navigator.userAgent, summary: this.summary(), spans: this.spans }, null, 1);
  }

  /** Compact plain-text summary for the side panel. */
  report(): string {
    const s = this.summary();
    const f = (st: Stat) => `${st.total}ms (avg ${st.mean} / p95 ${st.p95} / max ${st.max})`;
    return [
      `time ${s.recordingMs}ms${this.recording ? " (recording)" : ""}`,
      `wheel ${s.wheel.events} ev, |dY| ${s.wheel.sumAbsDeltaY}, zoom ${s.wheel.zoomMin}-${s.wheel.zoomMax}`,
      `  handler ${f(s.wheel.handlerMs)}`,
      `textScale ${s.textScale.frames} fr x ${s.textScale.elements} el`,
      `  ${f(s.textScale.ms)}`,
      `render ${s.render.count}x, max ${s.render.maxSvgElements} el`,
      `  total ${f(s.render.ms)}`,
      `  build ${f(s.render.buildMs)}`,
      `  parse ${f(s.render.parseMs)}`,
      `  post ${f(s.render.postMs)}`,
      `  paint ${f(s.render.paintMs)}`,
      `frames ${s.frames.count}, >50ms ${s.frames.over50ms}, >100ms ${s.frames.over100ms}, >500ms ${s.frames.over500ms}`,
      `  interval ${f(s.frames.ms)}`,
      `longTasks ${s.longTasks.count}, ${f(s.longTasks.ms)}`
    ].join("\n");
  }
}
