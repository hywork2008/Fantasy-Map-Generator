import type React from "react";
import { useEffect, useState } from "react";
import { useDialogState } from "../../store/dialogState";
import { AiGeneratorDialog } from "./AiGeneratorDialog";
import { AlertDialog } from "./AlertDialog";
import { BattleScreenDialog } from "./BattleScreenDialog";
import { BiomesEditorDialog } from "./BiomesEditorDialog";
import { BrushesPanelDialog } from "./BrushesPanelDialog";
import { BurgEditorDialog } from "./BurgEditorDialog";
import { BurgGroupsEditorDialog } from "./BurgGroupsEditorDialog";
import { BurgsOverviewDialog } from "./BurgsOverviewDialog";
import { CellInfoDialog } from "./CellInfoDialog";
import { CoastlineEditorDialog } from "./CoastlineEditorDialog";
import { DiplomacyEditorDialog } from "./DiplomacyEditorDialog";
import { DiplomacyMatrixDialog } from "./DiplomacyMatrixDialog";
import { ElevationProfileDialog } from "./ElevationProfileDialog";
import { EmblemEditorDialog } from "./EmblemEditorDialog";
import { ExportMapDialog } from "./ExportMapDialog";
import { ExportToPngTilesDialog } from "./ExportToPngTilesDialog";
import { FontDialog } from "./FontDialog";
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
import { NamesbaseEditorDialog } from "./NamesbaseEditorDialog";
import { NotesEditorDialog } from "./NotesEditorDialog";
import { Options3dDialog } from "./Options3dDialog";
import { Preview3dDialog } from "./Preview3dDialog";
import { PromptDialog } from "./PromptDialog";
import { ProvinceNameEditorDialog } from "./ProvinceNameEditorDialog";
import { ProvincesEditorDialog } from "./ProvincesEditorDialog";
import { RegimentEditorDialog } from "./RegimentEditorDialog";
import { RegimentSelectorScreenDialog } from "./RegimentSelectorScreenDialog";
import { RegimentsOverviewDialog } from "./RegimentsOverviewDialog";
import { ReliefEditorDialog } from "./ReliefEditorDialog";
import { RiverCreatorDialog } from "./RiverCreatorDialog";
import { RiverEditorDialog } from "./RiverEditorDialog";
import { RiversOverviewDialog } from "./RiversOverviewDialog";
import { RouteCreatorDialog } from "./RouteCreatorDialog";
import { RouteEditorDialog } from "./RouteEditorDialog";
import { RouteGroupsEditorDialog } from "./RouteGroupsEditorDialog";
import { RoutesOverviewDialog } from "./RoutesOverviewDialog";
import { SaveMapDialog } from "./SaveMapDialog";
import { StateNameEditorDialog } from "./StateNameEditorDialog";
import { StyleSaverDialog } from "./StyleSaverDialog";
import { SubmapToolDialog } from "./SubmapToolDialog";
import { TemplateEditorDialog } from "./TemplateEditorDialog";
import { TransformToolDialog } from "./TransformToolDialog";
import { UnitsEditorDialog } from "./UnitsEditorDialog";
import { WorldConfiguratorDialog } from "./WorldConfiguratorDialog";
import { ZonesEditorDialog } from "./ZonesEditorDialog";

export const DialogsContainer: React.FC = () => {
  const alertConfig = useDialogState(state => state.alertConfig);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          <CoastlineEditorDialog />
          <ReliefEditorDialog />
          <BurgEditorDialog />
          <MarkerEditorDialog />
          <RegimentEditorDialog />
          <RegimentSelectorScreenDialog />
          <StateNameEditorDialog />
          <DiplomacyMatrixDialog />
          <ProvinceNameEditorDialog />
          <SubmapToolDialog />
          <TransformToolDialog />
          <WorldConfiguratorDialog />
          <BattleScreenDialog />
          <BrushesPanelDialog />
          <TemplateEditorDialog />
          <ImageConverterDialog />
          <BiomesEditorDialog />
          <ProvincesEditorDialog />
          <DiplomacyEditorDialog />
          <NamesbaseEditorDialog />
          <ZonesEditorDialog />
          <NotesEditorDialog />
          <AiGeneratorDialog />
          <EmblemEditorDialog />
          <UnitsEditorDialog />
          <BurgsOverviewDialog />
          <BurgGroupsEditorDialog />
          <RoutesOverviewDialog />
          <RiversOverviewDialog />
          <MilitaryOverviewDialog />
          <RegimentsOverviewDialog />
          <MilitaryOptionsDialog />
          <MarkersOverviewDialog />
          <StyleSaverDialog />
          <CellInfoDialog />
          <MinimapDialog />
          <Options3dDialog />
          <Preview3dDialog />
          {/* 
        Here we will mount the other dialogs such as:
        <WorldConfigurator isOpen={openDialogs.has("worldConfigurator")} />
      */}
        </>
      )}
    </div>
  );
};
