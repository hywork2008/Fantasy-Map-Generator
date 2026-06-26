import type React from "react";
import { useEffect, useState } from "react";
import { applyStoredOptions } from "../../controllers/options";
import { useDialogState } from "../../store/dialogState";
import { type ExtensionDialog, useExtensionState } from "../../store/extensionState";
import { AiGeneratorDialog } from "./AiGeneratorDialog";
import { AlertDialog } from "./AlertDialog";
import { BattleScreenDialog, RegimentSelectorScreenDialog } from "./BattleScreenDialog";
import { BrushesPanelDialog } from "./BrushesPanelDialog";
import { BurgEditorDialog } from "./BurgEditorDialog";
import { BurgGroupsEditorDialog } from "./BurgGroupsEditorDialog";
import { BurgsOverviewDialog } from "./BurgsOverviewDialog";
import { CellInfoDialog } from "./CellInfoDialog";
import { ChartsOverviewDialog } from "./ChartsOverviewDialog";
import { CommonEditorDialog } from "./CommonEditorDialog";
import { CulturesEditorDialog } from "./CulturesEditorDialog";
import { DiplomacyMatrixDialog } from "./DiplomacyMatrixDialog";
import { DiplomacyRelationDialog } from "./DiplomacyRelationDialog";
import { ElevationProfileDialog } from "./ElevationProfileDialog";
import { ExportMapDialog } from "./ExportMapDialog";
import { ExportToPngTilesDialog } from "./ExportToPngTilesDialog";
import { EDITOR_REGISTRY } from "./editorRegistry";
import { FontDialog } from "./FontDialog";
import { HierarchyTreeDialog } from "./HierarchyTreeDialog";
import { IceEditorDialog } from "./IceEditorDialog";
import { IconSelectorDialog } from "./IconSelectorDialog";
import { ImageConverterDialog } from "./ImageConverterDialog";
import { LabelEditorDialog } from "./LabelEditorDialog";
import { LakeEditorDialog } from "./LakeEditorDialog";
import { LoadMapDialog } from "./LoadMapDialog";
import { MarkerEditorDialog } from "./MarkerEditorDialog";
import { MarkersOverviewDialog } from "./MarkersOverviewDialog";

import { MilitaryOptionsDialog } from "./MilitaryOptionsDialog";
import { MilitaryOverviewDialog } from "./MilitaryOverviewDialog";
import { MinimapDialog } from "./MinimapDialog";
import { Options3dDialog } from "./Options3dDialog";
import { Preview3dDialog } from "./Preview3dDialog";

import { PromptDialog } from "./PromptDialog";
import { ProvinceMergeDialog } from "./ProvinceMergeDialog";
import { ProvinceNameEditorDialog } from "./ProvinceNameEditorDialog";
import { ProvincesEditorDialog } from "./ProvincesEditorDialog";
import { RegimentEditorDialog } from "./RegimentEditorDialog";
import { RegimentsOverviewDialog } from "./RegimentsOverviewDialog";
import { ReliefEditorDialog } from "./ReliefEditorDialog";
import { ReligionsEditorDialog } from "./ReligionsEditorDialog";
import { RiverCreatorDialog } from "./RiverCreatorDialog";
import { RiverEditorDialog } from "./RiverEditorDialog";
import { RiversOverviewDialog } from "./RiversOverviewDialog";
import { RouteCreatorDialog } from "./RouteCreatorDialog";
import { RouteEditorDialog } from "./RouteEditorDialog";
import { RouteGroupsEditorDialog } from "./RouteGroupsEditorDialog";
import { RoutesEditorDialog } from "./RoutesEditorDialog";
import { RoutesOverviewDialog } from "./RoutesOverviewDialog";
import { SaveMapDialog } from "./SaveMapDialog";
import { StateMergeDialog } from "./StateMergeDialog";
import { StateNameEditorDialog } from "./StateNameEditorDialog";
import { StyleSaverDialog } from "./StyleSaverDialog";
import { SubmapToolDialog } from "./SubmapToolDialog";
import { TemplateEditorDialog } from "./TemplateEditorDialog";

import { TransformToolDialog } from "./TransformToolDialog";
import { UnitsEditorDialog } from "./UnitsEditorDialog";
import { WorldConfiguratorDialog } from "./WorldConfiguratorDialog";

export const DialogsContainer: React.FC = () => {
  const alertConfig = useDialogState(state => state.alertConfig);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) applyStoredOptions();
  }, [mounted]);

  const { dialogs, enabledExtensions } = useExtensionState();
  const extensionDialogs = dialogs.filter(d => enabledExtensions[d.extensionId]);
  const openDialogs = useDialogState(state => state.openDialogs);

  return (
    <div id="dialogs-root" style={{ pointerEvents: "none" }}>
      {mounted && (
        <>
          <AlertDialog config={alertConfig} />
          <PromptDialog />
          <SaveMapDialog />
          <ExportMapDialog />
          <LoadMapDialog />
          <ExportToPngTilesDialog />
          <IconSelectorDialog />
          <FontDialog />
          <LabelEditorDialog />
          <RiverEditorDialog />
          <RiverCreatorDialog />
          <LakeEditorDialog />
          <ElevationProfileDialog />
          <RouteEditorDialog />
          <RouteCreatorDialog />
          <RouteGroupsEditorDialog />
          <IceEditorDialog />
          <StateMergeDialog />
          <CulturesEditorDialog />
          <ReligionsEditorDialog />
          <RoutesEditorDialog />
          <ReliefEditorDialog />
          <BurgEditorDialog />
          <MarkerEditorDialog />
          <RegimentEditorDialog />
          <RegimentSelectorScreenDialog />
          <StateNameEditorDialog />
          <DiplomacyMatrixDialog />
          <ProvinceNameEditorDialog />
          <ProvinceMergeDialog />
          <SubmapToolDialog />
          <TransformToolDialog />
          <WorldConfiguratorDialog />
          <BattleScreenDialog />
          <BrushesPanelDialog />
          <TemplateEditorDialog />
          <ImageConverterDialog />
          <ProvincesEditorDialog />
          <DiplomacyRelationDialog />
          <UnitsEditorDialog />
          <AiGeneratorDialog />
          <BurgsOverviewDialog />
          <BurgGroupsEditorDialog />
          <RoutesOverviewDialog />
          <RiversOverviewDialog />
          <MilitaryOverviewDialog />
          <HierarchyTreeDialog />
          <RegimentsOverviewDialog />
          <MilitaryOptionsDialog />
          <MarkersOverviewDialog />
          <StyleSaverDialog />
          <CellInfoDialog />
          <MinimapDialog />
          <ChartsOverviewDialog />
          <Options3dDialog />
          <Preview3dDialog />
          {extensionDialogs.map((dialog: ExtensionDialog) => (
            <dialog.component key={dialog.id} />
          ))}
          {Array.from(openDialogs).map(id => {
            const config = EDITOR_REGISTRY[id];
            if (config) return <CommonEditorDialog key={id} id={id} config={config} />;
            return null;
          })}
        </>
      )}
    </div>
  );
};
