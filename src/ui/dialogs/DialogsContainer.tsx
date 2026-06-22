import type React from "react";
import { useEffect, useState } from "react";
import { applyStoredOptions } from "../../controllers/options";
import { useDialogState } from "../../store/dialogState";
import { AiGeneratorDialog } from "./AiGeneratorDialog";
import { AlertDialog } from "./AlertDialog";
import { BattleScreenDialog, RegimentSelectorScreenDialog } from "./BattleScreenDialog";
import { BiomesEditorDialog } from "./BiomesEditorDialog";
import { BrushesPanelDialog } from "./BrushesPanelDialog";
import { BurgEditorDialog } from "./BurgEditorDialog";
import { BurgGroupsEditorDialog } from "./BurgGroupsEditorDialog";
import { BurgsOverviewDialog } from "./BurgsOverviewDialog";
import { CellInfoDialog } from "./CellInfoDialog";
import { ChartsOverviewDialog } from "./ChartsOverviewDialog";
import { CoastlineEditorDialog } from "./CoastlineEditorDialog";
import { CoastlineSettingsEditorDialog } from "./CoastlineSettingsEditorDialog";
import { CulturesEditorDialog } from "./CulturesEditorDialog";
import { DiplomacyEditorDialog } from "./DiplomacyEditorDialog";
import { DiplomacyMatrixDialog } from "./DiplomacyMatrixDialog";
import { DiplomacyRelationDialog } from "./DiplomacyRelationDialog";
import { ElevationProfileDialog } from "./ElevationProfileDialog";
import { EmblemEditorDialog } from "./EmblemEditorDialog";
import { ExportMapDialog } from "./ExportMapDialog";
import { ExportToPngTilesDialog } from "./ExportToPngTilesDialog";
import { FontDialog } from "./FontDialog";
import { GoodsEditorDialog } from "./GoodsEditorDialog";
import { HeightmapSelectionDialog } from "./HeightmapSelectionDialog";
import { HierarchyTreeDialog } from "./HierarchyTreeDialog";
import { IceEditorDialog } from "./IceEditorDialog";
import { IconSelectorDialog } from "./IconSelectorDialog";
import { ImageConverterDialog } from "./ImageConverterDialog";
import { LabelEditorDialog } from "./LabelEditorDialog";
import { LakeEditorDialog } from "./LakeEditorDialog";
import { LoadMapDialog } from "./LoadMapDialog";
import { MarkerEditorDialog } from "./MarkerEditorDialog";
import { MarkersOverviewDialog } from "./MarkersOverviewDialog";
import { MarketDealsDialog } from "./MarketDealsDialog";
import { MarketOverviewDialog } from "./MarketOverviewDialog";
import { MarketsGoodCompareDialog } from "./MarketsGoodCompareDialog";
import { MarketsOverviewDialog } from "./MarketsOverviewDialog";
import { MilitaryOptionsDialog } from "./MilitaryOptionsDialog";
import { MilitaryOverviewDialog } from "./MilitaryOverviewDialog";
import { MinimapDialog } from "./MinimapDialog";
import { NamesbaseEditorDialog } from "./NamesbaseEditorDialog";
import { NotesEditorDialog } from "./NotesEditorDialog";
import { Options3dDialog } from "./Options3dDialog";
import { Preview3dDialog } from "./Preview3dDialog";
import { ProductionChainsDialog } from "./ProductionChainsDialog";
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
import { StatesEditorDialog } from "./StatesEditorDialog";
import { StyleSaverDialog } from "./StyleSaverDialog";
import { SubmapToolDialog } from "./SubmapToolDialog";
import { TemplateEditorDialog } from "./TemplateEditorDialog";
import { TradeAnimationDialog } from "./TradeAnimationDialog";
import { TradeDetailsDialog } from "./TradeDetailsDialog";
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

  useEffect(() => {
    if (mounted) applyStoredOptions();
  }, [mounted]);

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
          <CoastlineSettingsEditorDialog />
          <StatesEditorDialog />
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
          <BiomesEditorDialog />
          <ProvincesEditorDialog />
          <DiplomacyEditorDialog />
          <DiplomacyRelationDialog />
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
          <HierarchyTreeDialog />
          <RegimentsOverviewDialog />
          <MilitaryOptionsDialog />
          <MarkersOverviewDialog />
          <StyleSaverDialog />
          <GoodsEditorDialog />
          <MarketsOverviewDialog />
          <MarketOverviewDialog />
          <MarketDealsDialog />
          <MarketsGoodCompareDialog />
          <TradeDetailsDialog />
          <ProductionChainsDialog />
          <TradeAnimationDialog />
          <CellInfoDialog />
          <MinimapDialog />
          <ChartsOverviewDialog />
          <HeightmapSelectionDialog />
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
