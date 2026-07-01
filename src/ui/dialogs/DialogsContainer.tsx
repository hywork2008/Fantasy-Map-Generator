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
import { BurgsBubbleChartDialog } from "./BurgsBubbleChartDialog";
import { BurgsOverviewDialog } from "./BurgsOverviewDialog";
import { BurgsRenamingDialog } from "./BurgsRenamingDialog";
import { CellInfoDialog } from "./CellInfoDialog";
import { ChartsOverviewDialog } from "./ChartsOverviewDialog";
import { CommonEditorDialog } from "./CommonEditorDialog";
import { CulturesEditorDialog } from "./CulturesEditorDialog";
import { DiplomacyHistoryDialog } from "./DiplomacyHistoryDialog";
import { DiplomacyMatrixDialog } from "./DiplomacyMatrixDialog";
import { DiplomacyRelationDialog } from "./DiplomacyRelationDialog";
import { ElevationProfileDialog } from "./ElevationProfileDialog";
import { ExportMapDialog } from "./ExportMapDialog";
import { ExportToPngTilesDialog } from "./ExportToPngTilesDialog";
import { EDITOR_REGISTRY } from "./editorRegistry";
import { FontDialog } from "./FontDialog";
import { GenerationErrorDialog } from "./GenerationErrorDialog";
import { HeightmapEditModeDialog } from "./HeightmapEditModeDialog";
import { HeightmapSchemeDialog } from "./HeightmapSchemeDialog";
import { HierarchyTreeDialog } from "./HierarchyTreeDialog";
import { IceEditorDialog } from "./IceEditorDialog";
import { IconSelectorDialog } from "./IconSelectorDialog";
import { ImageConverterCloseDialog } from "./ImageConverterCloseDialog";
import { ImageConverterDialog } from "./ImageConverterDialog";
import { LabelEditorDialog } from "./LabelEditorDialog";
import { LakeEditorDialog } from "./LakeEditorDialog";
import { LoadErrorDialog } from "./LoadErrorDialog";
import { LoadMapDialog } from "./LoadMapDialog";
import { LoadMapFromUrlDialog } from "./LoadMapFromUrlDialog";
import { MarkerConfigDialog } from "./MarkerConfigDialog";
import { MarkerEditorDialog } from "./MarkerEditorDialog";
import { MarkersOverviewDialog } from "./MarkersOverviewDialog";
import { MilitaryOptionsDialog } from "./MilitaryOptionsDialog";
import { MilitaryOverviewDialog } from "./MilitaryOverviewDialog";
import { MinimapDialog } from "./MinimapDialog";
import { Options3dDialog } from "./Options3dDialog";
import { PopulationChangeDialog } from "./PopulationChangeDialog";
import { Preview3dDialog } from "./Preview3dDialog";
import { PromptDialog } from "./PromptDialog";
import { ProvinceMergeDialog } from "./ProvinceMergeDialog";
import { ProvinceNameEditorDialog } from "./ProvinceNameEditorDialog";
import { ProvincesChartDialog } from "./ProvincesChartDialog";
import { ProvincesEditorDialog } from "./ProvincesEditorDialog";
import { RegenerateConfirmDialog } from "./RegenerateConfirmDialog";
import { RegenerateFeatureDialog } from "./RegenerateFeatureDialog";
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
import { RouteJoinDialog } from "./RouteJoinDialog";
import { RoutesEditorDialog } from "./RoutesEditorDialog";
import { RoutesOverviewDialog } from "./RoutesOverviewDialog";
import { SaveMapDialog } from "./SaveMapDialog";
import { StateMergeDialog } from "./StateMergeDialog";
import { StateNameEditorDialog } from "./StateNameEditorDialog";
import { StatesChartDialog } from "./StatesChartDialog";
import { StyleSaverDialog } from "./StyleSaverDialog";
import { SubmapToolDialog } from "./SubmapToolDialog";
import { TemperatureGraphDialog } from "./TemperatureGraphDialog";
import { TemplateEditorDialog } from "./TemplateEditorDialog";
import { TextureUrlDialog } from "./TextureUrlDialog";

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
    <div id="dialogs-root" className="-dialogs-container__pointer-events-none">
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
          <BurgsBubbleChartDialog />
          <HeightmapSchemeDialog />
          <MarkerConfigDialog />
          <RegenerateConfirmDialog />
          <PopulationChangeDialog />
          <ProvincesChartDialog />
          <StatesChartDialog />
          <TemperatureGraphDialog />
          <StyleSaverDialog />
          <TextureUrlDialog />
          <HeightmapEditModeDialog />
          <ImageConverterCloseDialog />
          <GenerationErrorDialog />
          <LoadErrorDialog />
          <RouteJoinDialog />
          <DiplomacyHistoryDialog />
          <BurgsRenamingDialog />
          <LoadMapFromUrlDialog />
          <RegenerateFeatureDialog />
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
