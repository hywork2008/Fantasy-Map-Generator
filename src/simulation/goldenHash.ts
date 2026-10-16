/**
 * Canonical world hashing for the simulation golden test (docs/plan/simulation-core-separation.md §8).
 *
 * Hashes a decoded WorldDocument so two runs can be compared bit for bit regardless of where the
 * simulation ran (browser, jsdom, Node). Only simulation-relevant sections are hashed: `world`,
 * `simulation` and `opaqueExtensionChunks`. `presentation` (styles, view state) and the archive
 * timestamps are excluded because they change without the simulation changing.
 *
 * Besides the overall digest, every second-level key gets its own digest (`world.pack.burgs`,
 * `simulation.tickCount`, …) so a mismatch names the section that diverged.
 */

export interface WorldHashReport {
  readonly digest: string;
  readonly sections: Readonly<Record<string, string>>;
}

const HASHED_ROOTS = ["world", "simulation", "opaqueExtensionChunks"] as const;
const DEEP_SECTIONS = new Set(["world.pack", "simulation.extensions"]);

/** Serializes with sorted keys; typed arrays become plain arrays; -0 and NaN keep a stable form. */
export function canonicalJson(value: unknown): string {
  const parts: string[] = [];
  write(value, parts);
  return parts.join("");
}

function write(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    out.push("null");
    return;
  }
  switch (typeof value) {
    case "number":
      out.push(Number.isNaN(value) ? '"NaN"' : Object.is(value, -0) ? "-0" : String(value));
      return;
    case "string":
      out.push(JSON.stringify(value));
      return;
    case "boolean":
      out.push(value ? "true" : "false");
      return;
    case "bigint":
      out.push(`"${value}n"`);
      return;
    case "function":
    case "symbol":
      out.push("null");
      return;
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayLike<number | bigint>;
    write(
      Array.from(view, item => item),
      out
    );
    return;
  }
  if (Array.isArray(value)) {
    out.push("[");
    value.forEach((item, index) => {
      if (index) out.push(",");
      write(item, out);
    });
    out.push("]");
    return;
  }
  if (value instanceof Map) {
    write(Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), item])), out);
    return;
  }
  if (value instanceof Set) {
    write([...value].map(item => canonicalJson(item)).sort(), out);
    return;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort();
  out.push("{");
  keys.forEach((key, index) => {
    if (index) out.push(",");
    out.push(JSON.stringify(key), ":");
    write(record[key], out);
  });
  out.push("}");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Per-section and overall digests of a decoded world document. */
export async function hashWorldDocument(document: Readonly<Record<string, unknown>>): Promise<WorldHashReport> {
  const sections: Record<string, string> = {};
  for (const root of HASHED_ROOTS) {
    const value = document[root];
    if (value && typeof value === "object" && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
      const rootRecord = value as Record<string, unknown>;
      for (const key of Object.keys(rootRecord).sort()) {
        const child = rootRecord[key];
        // world.pack and the extension slices hold most of the state; one level deeper keeps a
        // mismatch actionable.
        const nested = DEEP_SECTIONS.has(`${root}.${key}`) && child && typeof child === "object";
        if (nested) {
          const record = child as Record<string, unknown>;
          for (const childKey of Object.keys(record).sort())
            sections[`${root}.${key}.${childKey}`] = await sha256(canonicalJson(record[childKey]));
        } else {
          sections[`${root}.${key}`] = await sha256(canonicalJson(child));
        }
      }
    } else if (Array.isArray(value)) {
      // Opaque extension chunks: one digest per extension, in a stable order.
      for (const [index, chunk] of value.entries()) {
        const id = (chunk as { extensionId?: unknown })?.extensionId;
        let name = `${root}.${typeof id === "string" ? id : index}`;
        if (name in sections) name = `${name}#${index}`;
        sections[name] = await sha256(canonicalJson(chunk));
      }
    } else {
      sections[root] = await sha256(canonicalJson(value));
    }
  }
  const digest = await sha256(canonicalJson(sections));
  return { digest, sections };
}

/** Section names whose digests differ (or exist on one side only). */
export function diffWorldHashes(expected: WorldHashReport, actual: WorldHashReport): string[] {
  const names = new Set([...Object.keys(expected.sections), ...Object.keys(actual.sections)]);
  return [...names].filter(name => expected.sections[name] !== actual.sections[name]).sort();
}
