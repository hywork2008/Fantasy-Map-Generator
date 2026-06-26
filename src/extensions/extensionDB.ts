import { type IDBPDatabase, openDB } from "idb";

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
}

export interface InstalledExtensionRecord {
  id: string;
  manifest: ExtensionManifest;
  jsCode: string;
  cssCode?: string;
  installedAt: number;
  builtin?: boolean;
}

const DB_NAME = "fmg-extensions";
const STORE_NAME = "extensions";
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    }
  });
  return _db;
}

export const extensionDB = {
  async getAll(): Promise<InstalledExtensionRecord[]> {
    const db = await getDB();
    return db.getAll(STORE_NAME);
  },

  async get(id: string): Promise<InstalledExtensionRecord | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, id);
  },

  async save(record: InstalledExtensionRecord): Promise<void> {
    const db = await getDB();
    await db.put(STORE_NAME, record);
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  }
};
