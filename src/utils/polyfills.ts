// replaceAll
if (String.prototype.replaceAll === undefined) {
  String.prototype.replaceAll = function (
    str: string | RegExp,
    newStr: string | ((substring: string, ...args: unknown[]) => string)
  ): string {
    const isRegexp = Object.prototype.toString.call(str).toLowerCase() === "[object regexp]";
    if (typeof newStr === "string") {
      return isRegexp ? this.replace(str as RegExp, newStr) : this.replace(new RegExp(str as string, "g"), newStr);
    }
    return isRegexp ? this.replace(str as RegExp, newStr) : this.replace(new RegExp(str as string, "g"), newStr);
  };
}

// Match the native signature so importing this module does not change flat's inferred element type.
export function flatArrayFallback<A, D extends number = 1>(this: A, depth?: D): FlatArray<A, D>[] {
  const levels = depth === undefined ? 1 : Math.max(0, Math.trunc(Number(depth)) || 0);
  const flatten = (array: unknown[], remaining: number): unknown[] =>
    array.reduce<unknown[]>((acc, value) => {
      if (Array.isArray(value) && remaining > 0) {
        for (const item of flatten(value, remaining - 1)) acc.push(item);
      } else acc.push(value);
      return acc;
    }, []);
  return flatten(this as unknown as unknown[], levels) as FlatArray<A, D>[];
}

// flat
if (Array.prototype.flat === undefined) {
  Array.prototype.flat = flatArrayFallback;
}

// at
if (Array.prototype.at === undefined) {
  Array.prototype.at = function <T>(this: T[], index: number): T | undefined {
    if (index < 0) index += this.length;
    if (index < 0 || index >= this.length) return undefined;
    return this[index];
  };
}

// readable stream iterator: https://bugs.chromium.org/p/chromium/issues/detail?id=929585#c10
{
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  if (proto[Symbol.asyncIterator] === undefined) {
    proto[Symbol.asyncIterator] = async function* <R>(this: ReadableStream<R>): AsyncGenerator<R, void, unknown> {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    };
  }
}

declare global {
  interface String {
    replaceAll(
      searchValue: string | RegExp,
      replaceValue: string | ((substring: string, ...args: unknown[]) => string)
    ): string;
  }

  interface Array<T> {
    at(index: number): T | undefined;
  }

  interface ReadableStream<R> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
}
