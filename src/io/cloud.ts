// Cloud provider implementations (Dropbox only)

import { DropboxAuth, Dropbox as DropboxClient } from "dropbox";

interface DropboxResponse<T> {
  result: T;
}

declare global {
  var Cloud: {
    providers: {
      dropbox: {
        api: unknown;
        save: (fileName: string, contents: string) => Promise<boolean>;
        load: (path: string) => Promise<Blob>;
        list: () => Promise<Array<{ name: string; updated: string; size: number; path: string }> | null>;
        auth: () => Promise<void>;
        getLink: (path: string) => Promise<string>;
        initialize: () => Promise<void>;
      };
    };
  };
}

const lSKey = (x: string) => `auth-${x}`;
const setToken = (prov: string, key: string) => localStorage.setItem(lSKey(prov), key);
const getToken = (prov: string) => localStorage.getItem(lSKey(prov));

const DBP = {
  name: "dropbox" as const,
  clientId: "pdr9ae64ip0qno4",
  authWindow: null as Window | null,
  token: null as string | null,
  // biome-ignore lint/suspicious/noExplicitAny: Dropbox instance methods called dynamically by name
  api: null as any,

  async call(name: string, param: unknown): Promise<unknown> {
    try {
      if (!this.api) await this.initialize();
      return await this.api![name](param);
    } catch (e) {
      if ((e as Error).name !== "DropboxResponseError") throw e;
      await this.auth();
      return await this.api![name](param);
    }
  },

  async initialize(): Promise<void> {
    const token = getToken(this.name);
    if (token) {
      return this.connect(token);
    } else {
      return this.auth();
    }
  },

  async connect(token: string): Promise<void> {
    const auth = new DropboxAuth({ clientId: this.clientId });
    auth.setAccessToken(token);
    this.api = new DropboxClient({ auth });
  },

  async save(fileName: string, contents: string): Promise<boolean> {
    await this.call("filesUpload", { path: `/${fileName}`, contents });
    DEBUG.cloud && console.info("Dropbox upload done:", fileName);
    return true;
  },

  async load(path: string): Promise<Blob> {
    const resp = (await this.call("filesDownload", { path })) as DropboxResponse<{ fileBlob: Blob }>;
    const blob = resp.result.fileBlob;
    if (!blob) throw new Error("Invalid response from dropbox.");
    return blob;
  },

  async list(): Promise<Array<{ name: string; updated: string; size: number; path: string }>> {
    const resp = (await this.call("filesListFolder", { path: "" })) as DropboxResponse<{
      entries: Array<{ name: string; client_modified: string; size: number; path_lower: string }>;
    }>;
    const filesData = resp.result.entries.map(({ name, client_modified, size, path_lower }) => ({
      name,
      updated: client_modified,
      size,
      path: path_lower
    }));
    return filesData.filter(({ size }) => size).reverse();
  },

  auth(): Promise<void> {
    const width = 640;
    const height = 480;
    const left = window.innerWidth / 2 - width / 2;
    const top = window.innerHeight / 2 - height / 2.5;
    this.authWindow = window.open("./dropbox.html", "auth", `width=640, height=${height}, top=${top}, left=${left}}`);

    return new Promise((resolve, reject) => {
      const watchDog = setTimeout(() => {
        this.authWindow?.close();
        reject(new Error("Timeout. No auth for Dropbox"));
      }, 120 * 1000);

      const channel = new BroadcastChannel("dropbox-auth");
      channel.onmessage = async ({ data }: MessageEvent<{ type: string; token?: string; description?: string }>) => {
        channel.close();
        clearTimeout(watchDog);
        if (data.type === "token" && data.token) {
          await this.setDropBoxToken(data.token);
          resolve();
        } else {
          this.returnError(data.description ?? "Unknown auth error");
          reject(new Error(data.description));
        }
      };
    });
  },

  async setDropBoxToken(token: string): Promise<void> {
    DEBUG.cloud && console.info("Access token:", token);
    setToken(this.name, token);
    await this.connect(token);
  },

  returnError(errorDescription: string): void {
    console.error(errorDescription);
    tip(errorDescription.replaceAll("+", " "), true, "error", 4000);
  },

  async getLink(path: string): Promise<string> {
    const sharedLinks = (await this.call("sharingListSharedLinks", { path })) as DropboxResponse<{
      links: Array<{ url: string }>;
    }>;
    if (sharedLinks.result.links.length) return sharedLinks.result.links[0].url;

    const settings = {
      require_password: false,
      audience: "public",
      access: "viewer",
      requested_visibility: "public",
      allow_download: true
    };
    const resp = (await this.call("sharingCreateSharedLinkWithSettings", { path, settings })) as DropboxResponse<{
      url: string;
    }>;
    DEBUG.cloud && console.info("Dropbox link object:", resp.result);
    return resp.result.url;
  }
};

window.Cloud = { providers: { dropbox: DBP } };
