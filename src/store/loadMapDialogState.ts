import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export type LoadMapDropboxFile = {
  name: string;
  updated: string;
  size: number;
  path: string;
};

type LoadMapDialogState = {
  isDropboxConnected: boolean;
  isDropboxLoading: boolean;
  dropboxFiles: LoadMapDropboxFile[];
  dropboxStatus: string | null;
  selectedDropboxPath: string;
  sharableLinkUrl: string;
  sharableLinkLabel: string;
  isSharableLinkVisible: boolean;
  setDropboxDisconnected: () => void;
  setDropboxLoading: () => void;
  setDropboxNoFiles: (status: string) => void;
  setDropboxFiles: (files: LoadMapDropboxFile[]) => void;
  setSelectedDropboxPath: (path: string) => void;
  setSharableLink: (url: string, label: string) => void;
  hideSharableLink: () => void;
};

export const loadMapDialogStore = createStore<LoadMapDialogState>(set => ({
  isDropboxConnected: false,
  isDropboxLoading: false,
  dropboxFiles: [],
  dropboxStatus: null,
  selectedDropboxPath: "",
  sharableLinkUrl: "",
  sharableLinkLabel: "",
  isSharableLinkVisible: false,
  setDropboxDisconnected: () =>
    set({
      isDropboxConnected: false,
      isDropboxLoading: false,
      dropboxFiles: [],
      dropboxStatus: null,
      selectedDropboxPath: "",
      sharableLinkUrl: "",
      sharableLinkLabel: "",
      isSharableLinkVisible: false
    }),
  setDropboxLoading: () =>
    set({
      isDropboxConnected: true,
      isDropboxLoading: true,
      dropboxFiles: [],
      dropboxStatus: "Loading...",
      selectedDropboxPath: "",
      sharableLinkUrl: "",
      sharableLinkLabel: "",
      isSharableLinkVisible: false
    }),
  setDropboxNoFiles: status =>
    set({
      isDropboxConnected: true,
      isDropboxLoading: false,
      dropboxFiles: [],
      dropboxStatus: status,
      selectedDropboxPath: "",
      sharableLinkUrl: "",
      sharableLinkLabel: "",
      isSharableLinkVisible: false
    }),
  setDropboxFiles: files =>
    set({
      isDropboxConnected: true,
      isDropboxLoading: false,
      dropboxFiles: files,
      dropboxStatus: null,
      selectedDropboxPath: files[0]?.path ?? "",
      sharableLinkUrl: "",
      sharableLinkLabel: "",
      isSharableLinkVisible: false
    }),
  setSelectedDropboxPath: path => set({ selectedDropboxPath: path }),
  setSharableLink: (url, label) =>
    set({
      sharableLinkUrl: url,
      sharableLinkLabel: label,
      isSharableLinkVisible: true
    }),
  hideSharableLink: () =>
    set({
      sharableLinkUrl: "",
      sharableLinkLabel: "",
      isSharableLinkVisible: false
    })
}));

export const useLoadMapDialogState = <T>(selector: (s: LoadMapDialogState) => T) =>
  useStore(loadMapDialogStore, selector);
