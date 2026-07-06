import type { Selection } from "d3";
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
  dialogId?: string; // Used to track if the button should appear pressed

  label: string;
  tooltip?: string;
  onClick: () => void;
}

export interface ExtensionDialog {
  id: string;
  extensionId: string;
  component: React.ComponentType;
}

export interface ExtensionEditorTab {
  id: string;
  extensionId: string;
  editorId: string;
  label: string;
  component: React.ComponentType;
}

export interface ExtensionStyleProps {
  visibility: Record<string, boolean>;
  values: Record<string, string | number>;
  applySliderChange: (id: string, value: string) => void;
}

export interface ExtensionStyleConfig {
  id: string;
  extensionId: string;
  elements: { value: string; label: string }[];
  component?: React.ComponentType<ExtensionStyleProps>;
  onSelect?: (
    elementId: string,
    sliderValues: Record<string, string>,
    visibility: Record<string, boolean>,
    el: Selection<SVGGElement, unknown, null, undefined>
  ) => void;
}

interface ExtensionState {
  extensions: Record<string, ExtensionConfig>;
  enabledExtensions: Record<string, boolean>;
  actions: ExtensionAction[];
  dialogs: ExtensionDialog[];
  editorTabs: ExtensionEditorTab[];
  styleConfigs: ExtensionStyleConfig[];

  registerExtension: (config: ExtensionConfig, defaultEnabled?: boolean) => void;
  registerAction: (action: ExtensionAction) => void;
  registerDialog: (dialog: ExtensionDialog) => void;
  registerEditorTab: (tab: ExtensionEditorTab) => void;
  registerStyleConfig: (config: ExtensionStyleConfig) => void;
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
      editorTabs: [],
      styleConfigs: [],

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

      registerEditorTab: tab => {
        set(state => ({
          editorTabs: [...state.editorTabs.filter(t => t.id !== tab.id), tab]
        }));
      },

      registerStyleConfig: config => {
        set(state => ({
          styleConfigs: [...state.styleConfigs.filter(c => c.id !== config.id), config]
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
            dialogs: state.dialogs.filter(d => d.extensionId !== id),
            editorTabs: state.editorTabs.filter(t => t.extensionId !== id),
            styleConfigs: state.styleConfigs.filter(c => c.extensionId !== id)
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
