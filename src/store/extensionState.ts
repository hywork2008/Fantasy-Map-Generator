import type { Selection } from "d3";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ExtensionDependency {
  id: string;
  required: boolean;
}

export interface ExtensionConfig {
  id: string;
  name: string;
  description: string;
  dependencies?: ExtensionDependency[];
}

/** Minimal dependency-graph info for an extension, tracked regardless of enabled state. */
export interface ExtensionMeta {
  id: string;
  name: string;
  dependencies?: ExtensionDependency[];
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
  /** Dependency-graph info for every known extension (built-in + dynamic), including disabled ones. */
  extensionMeta: Record<string, ExtensionMeta>;
  /** Reason the most recent toggleExtension() call was blocked, or null if it succeeded. */
  toggleError: string | null;
  actions: ExtensionAction[];
  dialogs: ExtensionDialog[];
  editorTabs: ExtensionEditorTab[];
  styleConfigs: ExtensionStyleConfig[];

  registerExtension: (config: ExtensionConfig, defaultEnabled?: boolean) => void;
  registerAction: (action: ExtensionAction) => void;
  registerDialog: (dialog: ExtensionDialog) => void;
  registerEditorTab: (tab: ExtensionEditorTab) => void;
  registerStyleConfig: (config: ExtensionStyleConfig) => void;
  /** Replace the tracked dependency-graph info for all installed extensions. */
  setExtensionMeta: (meta: ExtensionMeta[]) => void;
  /**
   * Enable/disable an extension. Blocks (and sets `toggleError`) when enabling
   * would leave a required dependency unmet, or when disabling would break an
   * enabled extension that requires this one. Returns whether the toggle applied.
   */
  toggleExtension: (id: string, forceState?: boolean) => boolean;
  /** Remove all registrations for a given extension (called before uninstall or re-inject) */
  unregisterExtension: (id: string) => void;
}

export const useExtensionState = create<ExtensionState>()(
  persist(
    (set, get) => ({
      extensions: {},
      enabledExtensions: {},
      extensionMeta: {},
      toggleError: null,
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
            enabledExtensions: { ...state.enabledExtensions, [config.id]: nextEnabled },
            extensionMeta: {
              ...state.extensionMeta,
              [config.id]: { id: config.id, name: config.name, dependencies: config.dependencies }
            }
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

      setExtensionMeta: meta => {
        set({ extensionMeta: Object.fromEntries(meta.map(m => [m.id, m])) });
      },

      toggleExtension: (id, forceState) => {
        const state = get();
        const currentState = state.enabledExtensions[id] ?? false;
        const nextState = forceState !== undefined ? forceState : !currentState;
        if (nextState === currentState) return true;

        if (nextState) {
          const meta = state.extensionMeta[id];
          const missingRequired = meta?.dependencies?.filter(d => d.required && !state.enabledExtensions[d.id]);
          if (missingRequired && missingRequired.length > 0) {
            set({
              toggleError: `Cannot enable ${meta?.name ?? id}: missing required dependencies (${missingRequired
                .map(d => d.id)
                .join(", ")})`
            });
            return false;
          }
        } else {
          const dependent = Object.values(state.extensionMeta).find(
            m => m.id !== id && state.enabledExtensions[m.id] && m.dependencies?.some(d => d.id === id && d.required)
          );
          if (dependent) {
            set({
              toggleError: `Cannot disable ${state.extensionMeta[id]?.name ?? id}: "${dependent.name}" requires it`
            });
            return false;
          }
        }

        set(s => ({
          enabledExtensions: { ...s.enabledExtensions, [id]: nextState },
          toggleError: null
        }));
        return true;
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
