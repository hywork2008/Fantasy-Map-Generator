// replaceAll
if (String.prototype.replaceAll === undefined) {
  type ReplaceAllCallback = (substring: string, ...args: unknown[]) => string;

  String.prototype.replaceAll = function (
    str: string | RegExp,
    newStr: string | ReplaceAllCallback
  ): string {
    if (Object.prototype.toString.call(str).toLowerCase() === "[object regexp]") {
      return typeof newStr === "function"
        ? this.replace(str as RegExp, newStr)
        : this.replace(str as RegExp, newStr);
    }
    return typeof newStr === "function"
      ? this.replace(new RegExp(str, "g"), newStr)
      : this.replace(new RegExp(str, "g"), newStr);
  };
}

// flat
if (Array.prototype.flat === undefined) {
  // @ts-ignore - Polyfill definition
  Array.prototype.flat = function <T>(this: T[], depth?: number): unknown[] {
    // @ts-ignore - Polyfill implementation
    return (this as Array<unknown>).reduce(
      (acc: unknown[], val: unknown) => {
        if (Array.isArray(val)) {
          const nested = val as { flat: (depth?: number) => unknown[] };
          return acc.concat(nested.flat(depth));
        }
        return acc.concat(val);
      },
      []
    );
  };
}

// at
if (Array.prototype.at === undefined) {
  // @ts-ignore - Polyfill definition
  Array.prototype.at = function <T>(this: T[], index: number): T | undefined {
    if (index < 0) index += this.length;
    if (index < 0 || index >= this.length) return undefined;
    return this[index];
  };
}

// readable stream iterator: https://bugs.chromium.org/p/chromium/issues/detail?id=929585#c10
const readableStreamPrototype = ReadableStream.prototype as ReadableStream<unknown> & {
  [Symbol.asyncIterator]?: () => AsyncGenerator<unknown, void, unknown>;
};

if (readableStreamPrototype[Symbol.asyncIterator] === undefined) {
  readableStreamPrototype[Symbol.asyncIterator] = async function* <R>(
    this: ReadableStream<R>
  ): AsyncGenerator<R, void, unknown> {
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

declare global {
  interface String {
    replaceAll(
      searchValue: string | RegExp,
      replaceValue: string | ((substring: string, ...args: unknown[]) => string)
    ): string;
  }

  interface Array<T> {
    flat(depth?: number): unknown[];
    at(index: number): T | undefined;
  }

  interface ReadableStream<R> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
}
