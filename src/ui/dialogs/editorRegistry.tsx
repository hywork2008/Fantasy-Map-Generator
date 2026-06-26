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
  layerId?: string | null;
  moduleFlag?: string;
  onClose?: () => void;
}

export const EDITOR_REGISTRY: Record<string, EditorConfig> = {
  biomesEditor: {
    title: "Biomes Editor",
    component: BiomesEditorContent,
    layerId: "toggleBiomes",
    moduleFlag: "editBiomes",
    onClose: () => biomesExitCustomization("close")
  },
  diplomacyEditor: {
    title: "Diplomacy Editor",
    component: DiplomacyEditorContent,
    layerId: "toggleStates",
    moduleFlag: "editDiplomacy",
    onClose: () => diplomacyEditorActions.closeDiplomacyEditor()
  },
  coastlineSettingsDialog: {
    title: "Coastline Settings Editor",
    component: CoastlineSettingsEditorContent,
    layerId: "toggleCoastline"
  },
  coastlineEditor: {
    title: "Coastline Editor",
    component: CoastlineEditorContent,
    layerId: "toggleCoastline"
  },
  emblemEditor: {
    title: "Edit Emblem",
    component: EmblemEditorContent,
    layerId: "toggleEmblems",
    moduleFlag: "editEmblems",
    onClose: () => closeEmblemEditor()
  },
  statesEditor: {
    title: "States Editor",
    component: StatesEditorContent,
    layerId: "toggleStates",
    moduleFlag: "editStates",
    onClose: () => statesEditorActions.closeStatesEditor()
  },
  zonesEditor: {
    title: "Zones Editor",
    component: ZonesEditorContent,
    layerId: "toggleZones",
    moduleFlag: "editZones",
    onClose: () => zonesEditorActions.closeZonesEditor()
  },
  namesbaseEditor: {
    title: "Namesbase Editor",
    component: NamesbaseEditorContent,
    moduleFlag: "editNamesbase"
  },
  notesEditor: {
    title: "Notes Editor",
    component: NotesEditorContent,
    onClose: () => closeNotesEditor()
  },
  heightmapSelection: {
    title: "Select Heightmap template",
    component: HeightmapSelectionContent
  }
};
