const DATABASE_NAME = "d2";
const STORE_NAME = "s";

let db: IDBDatabase | null = null;

function openDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (db) return resolve();

    if (!window.indexedDB) return reject(new Error("IndexedDB is not supported"));

    const request = window.indexedDB.open(DATABASE_NAME);

    request.onsuccess = (event: Event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve();
    };

    request.onerror = () => {
      console.error("IndexedDB request error");
      reject(new Error("IndexedDB open failed"));
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const result = (event.target as IDBOpenDBRequest).result;
      const store = result.createObjectStore(STORE_NAME, { keyPath: "key" });
      store.transaction.oncomplete = () => {
        db = result;
      };
    };
  });
}

export const ldb = {
  get(key: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      openDatabase().then(() => {
        if (!db) return reject(new Error("IndexedDB: database not open"));

        const hasStore = Array.from(db.objectStoreNames).includes(STORE_NAME);
        if (!hasStore) return reject(new Error("IndexedDB: no store found"));

        const transaction = db.transaction(STORE_NAME, "readonly");
        const objectStore = transaction.objectStore(STORE_NAME);
        const getRequest = objectStore.get(key);

        getRequest.onsuccess = (event: Event) => {
          const record = (event.target as IDBRequest<{ key: string; value: Blob } | undefined>).result;
          resolve(record?.value ?? null);
        };
      });
    });
  },

  set(keyName: string, value: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      openDatabase().then(() => {
        if (!db) return reject(new Error("IndexedDB: database not open"));

        const transaction = db.transaction(STORE_NAME, "readwrite");
        const objectStore = transaction.objectStore(STORE_NAME);
        const putRequest = objectStore.put({ key: keyName, value });

        putRequest.onsuccess = () => {
          resolve();
        };

        putRequest.onerror = () => {
          reject(new Error("IndexedDB: put failed"));
        };
      });
    });
  }
};
