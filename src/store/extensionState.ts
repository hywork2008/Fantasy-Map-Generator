import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ExtensionConfig {
  id: string;
  name: string;
  description: string;
}

export interface ExtensionAction {
  id: string;
  extensionId: string;
  tab: string; // The UI tab to render the button in (e.g., "tools")
  section?: string; // The section within the tab (e.g., "regenerate")
  label: string;
  tooltip?: string;
  onClick: () => void;
}

export interface ExtensionDialog {
  id: string;
  extensionId: string;
  component: React.ComponentType;
}

interface ExtensionState {
  extensions: Record<string, ExtensionConfig>;
  enabledExtensions: Record<string, boolean>;
  actions: ExtensionAction[];
  dialogs: ExtensionDialog[];

  registerExtension: (config: ExtensionConfig, defaultEnabled?: boolean) => void;
  registerAction: (action: ExtensionAction) => void;
  registerDialog: (dialog: ExtensionDialog) => void;
  toggleExtension: (id: string, forceState?: boolean) => void;
  /** Remove all registrations for a given extension (called before uninstall or re-inject) */
  unregisterExtension: (id: string) => void;
}

export const useExtensionState = create<ExtensionState>()(
  persist(
    set => ({
      extensions: {},
      enabledExtensions: {},
      actions: [],
      dialogs: [],

      registerExtension: (config, defaultEnabled = true) => {
        set(state => {
          const isCurrentlyEnabled = state.enabledExtensions[config.id];
          const nextEnabled = isCurrentlyEnabled ?? defaultEnabled;
          return {
            extensions: { ...state.extensions, [config.id]: config },
            enabledExtensions: { ...state.enabledExtensions, [config.id]: nextEnabled }
          };
        });
      },

      registerAction: action => {
        set(state => ({
          actions: [...state.actions.filter(a => a.id !== action.id), action]
        }));
      },

      registerDialog: dialog => {
        set(state => ({
          dialogs: [...state.dialogs.filter(d => d.id !== dialog.id), dialog]
        }));
      },

      toggleExtension: (id, forceState) => {
        set(state => {
          const currentState = state.enabledExtensions[id] ?? false;
          const nextState = forceState !== undefined ? forceState : !currentState;
          return {
            enabledExtensions: { ...state.enabledExtensions, [id]: nextState }
          };
        });
      },

      unregisterExtension: id => {
        set(state => {
          const { [id]: _removed, ...remainingExtensions } = state.extensions;
          const { [id]: _removedEnabled, ...remainingEnabled } = state.enabledExtensions;
          return {
            extensions: remainingExtensions,
            enabledExtensions: remainingEnabled,
            actions: state.actions.filter(a => a.extensionId !== id),
            dialogs: state.dialogs.filter(d => d.extensionId !== id)
          };
        });
      }
    }),
    {
      name: "fmg-extensions",
      partialize: state => ({ enabledExtensions: state.enabledExtensions })
    }
  )
);
