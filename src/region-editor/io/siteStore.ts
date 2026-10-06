import { REGION_SITE_KEY, type RegionSiteDescriptor } from "../core/types";

const DB_NAME = "fmg-region-site";
const STORE = "site";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** FMG → RE の受け渡しデータを IndexedDB に保存（sessionStorage の容量上限を回避） */
export function saveRegionSite(descriptor: RegionSiteDescriptor): Promise<void> {
  return run("readwrite", s => s.put(descriptor, REGION_SITE_KEY)).then(() => undefined);
}

export function loadRegionSite(): Promise<RegionSiteDescriptor | undefined> {
  return run("readonly", s => s.get(REGION_SITE_KEY) as IDBRequest<RegionSiteDescriptor | undefined>);
}

/** 保存済みの FMG 連携データを削除（次回 RE 単体起動時は連携前の状態になる） */
export function clearRegionSite(): Promise<void> {
  return run("readwrite", s => s.delete(REGION_SITE_KEY)).then(() => undefined);
}
