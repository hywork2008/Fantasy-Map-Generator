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

// flat
if (Array.prototype.flat === undefined) {
  Array.prototype.flat = function <T>(this: T[], depth?: number): T[] {
    return (this as Array<unknown>).reduce<unknown[]>(
      (acc, val) => (Array.isArray(val) ? acc.concat((val as unknown[]).flat(depth)) : acc.concat(val)),
      []
    ) as T[];
  };
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
    flat(depth?: number): T[];
    at(index: number): T | undefined;
  }

  interface ReadableStream<R> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
}
