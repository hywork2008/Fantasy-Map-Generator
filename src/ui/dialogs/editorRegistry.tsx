import type React from "react";
import { biomesExitCustomization } from "../../controllers/biomes-editor";
import { diplomacyEditorActions } from "../../controllers/diplomacy-editor";
import { closeEmblemEditor } from "../../controllers/emblems-editor";
import { closeNotesEditor } from "../../controllers/notes-editor";
import { statesEditorActions } from "../../controllers/states-editor";
import { zonesEditorActions } from "../../controllers/zones-editor";
import { BiomesEditorContent } from "./BiomesEditorDialog";
import { CoastlineEditorContent } from "./CoastlineEditorDialog";
import { CoastlineSettingsEditorContent } from "./CoastlineSettingsEditorDialog";
import { DiplomacyEditorContent } from "./DiplomacyEditorDialog";
import { EmblemEditorContent } from "./EmblemEditorDialog";
import { HeightmapSelectionContent } from "./HeightmapSelectionDialog";
import { NamesbaseEditorContent } from "./NamesbaseEditorDialog";
import { NotesEditorContent } from "./NotesEditorDialog";
import { StatesEditorContent } from "./StatesEditorDialog";
import { ZonesEditorContent } from "./ZonesEditorDialog";

export interface EditorConfig {
  title: string;
  // biome-ignore lint/suspicious/noExplicitAny: Required for polymorphic component mapping
  component: React.ComponentType<any>;
  moduleFlag?: string;
  onClose?: () => void;
  /** Apply overflow-hidden layout (fixed header/footer, scrollable body).
   *  Height defaults to the CSS value (75vh). Use dialogHeight only to override. */
  tableLayout?: boolean;
  /** Override the default CSS height (75vh) with a specific value, e.g. "400px". */
  dialogHeight?: string;
  /** Dialog-specific structural modifier for non-table editors. */
  dialogClassName?: string;
}

export const EDITOR_REGISTRY: Record<string, EditorConfig> = {
  biomesEditor: {
    title: "Biomes Editor",
    component: BiomesEditorContent,
    moduleFlag: "editBiomes",
    onClose: () => biomesExitCustomization("close"),
    tableLayout: true
  },
  diplomacyEditor: {
    title: "Diplomacy Editor",
    component: DiplomacyEditorContent,
    moduleFlag: "editDiplomacy",
    onClose: () => diplomacyEditorActions.closeDiplomacyEditor(),
    tableLayout: true
  },
  coastlineSettingsDialog: {
    title: "Coastline Settings Editor",
    component: CoastlineSettingsEditorContent
  },
  coastlineEditor: {
    title: "Coastline Editor",
    component: CoastlineEditorContent
  },
  emblemEditor: {
    title: "Edit Emblem",
    component: EmblemEditorContent,
    moduleFlag: "editEmblems",
    onClose: () => closeEmblemEditor()
  },
  statesEditor: {
    title: "States Editor",
    component: StatesEditorContent,
    moduleFlag: "editStates",
    onClose: () => statesEditorActions.closeStatesEditor(),
    tableLayout: true
  },
  zonesEditor: {
    title: "Zones Editor",
    component: ZonesEditorContent,
    moduleFlag: "editZones",
    onClose: () => zonesEditorActions.closeZonesEditor(),
    tableLayout: true
  },
  namesbaseEditor: {
    title: "Namesbase Editor",
    component: NamesbaseEditorContent,
    moduleFlag: "editNamesbase",
    tableLayout: true
  },
  notesEditor: {
    title: "Notes Editor",
    component: NotesEditorContent,
    onClose: () => closeNotesEditor(),
    dialogClassName: "fmg-dialog--notes"
  },
  heightmapSelection: {
    title: "Select Heightmap template",
    component: HeightmapSelectionContent
  }
};
