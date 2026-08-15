import React from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, useCellInfoState, useDialogState } from "../../../hostUi";
import { formatAnnualPrecipitation } from "../../../hostUtils";
import {
  getGoods,
  getIrrigatedArea,
  getIrrigationDeliveredWater,
  getIrrigationWaterStress,
  getRiverResidualFlow
} from "../../economyContext";
import type { Good } from "../../generators/goods-generator";
import "./cropClimateDialog.css";

type ClimateMetric = "temperature" | "precipitation";
type DialogTab = "detail" | "compare";
type ClimateCropProfile = NonNullable<Good["crop"]> | NonNullable<Good["perennialCrop"]>;

const METRIC_LABEL_KEY: Record<ClimateMetric, string> = {
  temperature: "extensions.cropClimate.temperature",
  precipitation: "extensions.cropClimate.precipitation"
};

const CROP_KIND_KEY: Record<string, string> = {
  cereal: "extensions.cropClimate.kindCereal",
  legume: "extensions.cropClimate.kindLegume",
  tuber: "extensions.cropClimate.kindTuber",
  vine: "extensions.cropClimate.kindVine"
};

function getClimateProfile(good: Good): ClimateCropProfile | undefined {
  return good.crop ?? good.perennialCrop;
}

function getRange(crop: ClimateCropProfile, metric: ClimateMetric) {
  return crop[metric];
}

function getDomain(crops: readonly Good[], metric: ClimateMetric, cellValue: number | null): [number, number] {
  if (metric === "precipitation") {
    let maximumCropPrecipitation = 0;
    for (const good of crops) {
      const profile = getClimateProfile(good);
      if (profile) maximumCropPrecipitation = Math.max(maximumCropPrecipitation, profile.precipitation.max);
    }
    return [0, maximumCropPrecipitation > 0 ? maximumCropPrecipitation * 1.1 : 1];
  }

  const values = crops.flatMap(good => {
    const profile = getClimateProfile(good);
    if (!profile) return [];
    const range = getRange(profile, metric);
    return [range.min, range.max];
  });
  if (cellValue !== null) values.push(cellValue);
  const rawMin = Math.min(...values, -5);
  const rawMax = Math.max(...values, 30);
  const padding = 3;
  return [Math.floor((rawMin - padding) / 5) * 5, Math.ceil((rawMax + padding) / 5) * 5];
}

function rangePosition(value: number, domain: readonly [number, number]): number {
  const [min, max] = domain;
  return Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100));
}

function formatClimateValue(metric: ClimateMetric, value: number, decimals = 0): string {
  return metric === "precipitation" ? formatAnnualPrecipitation(value, decimals) : `${value}°`;
}

function formatClimateRange(metric: ClimateMetric, minimum: number, maximum: number): string {
  return `${formatClimateValue(metric, minimum)}–${formatClimateValue(metric, maximum)}`;
}

function getSelectedCellClimateStatus(
  crop: ClimateCropProfile,
  metric: ClimateMetric,
  cellValue: number | null,
  t: (key: string, options?: Record<string, string>) => string
): string | null {
  if (cellValue === null) return null;
  const range = getRange(crop, metric);
  const label =
    metric === "precipitation"
      ? t("extensions.cropClimate.statusRainfall")
      : t("extensions.cropClimate.statusTemperature");
  if (cellValue <= range.min) return t("extensions.cropClimate.statusBelow", { label });
  if (cellValue >= range.max) {
    return metric === "precipitation"
      ? t("extensions.cropClimate.statusWetter", { label })
      : t("extensions.cropClimate.statusAbove", { label });
  }
  if (cellValue >= range.idealMin && cellValue <= range.idealMax) {
    return t("extensions.cropClimate.statusIdeal", { label });
  }
  return t("extensions.cropClimate.statusViable", { label });
}

const ClimateRangeBar: React.FC<{
  crop: ClimateCropProfile;
  metric: ClimateMetric;
  domain: readonly [number, number];
  cellValue: number | null;
  labelledBy: string;
}> = ({ crop, metric, domain, cellValue, labelledBy }) => {
  const { t } = useTranslation();
  const range = getRange(crop, metric);
  const min = rangePosition(range.min, domain);
  const max = rangePosition(range.max, domain);
  const idealMin = rangePosition(range.idealMin, domain);
  const idealMax = rangePosition(range.idealMax, domain);
  const marker = cellValue === null ? null : rangePosition(cellValue, domain);

  return (
    <div
      className="crop-climate-range"
      role="img"
      aria-labelledby={labelledBy}
      aria-label={t("extensions.cropClimate.viableIdealAria", {
        metric: t(METRIC_LABEL_KEY[metric]),
        viable: formatClimateRange(metric, range.min, range.max),
        ideal: formatClimateRange(metric, range.idealMin, range.idealMax)
      })}
    >
      <span className="crop-climate-range__line" />
      <span className="crop-climate-range__viable" style={{ left: `${min}%`, width: `${max - min}%` }} />
      <span className="crop-climate-range__ideal" style={{ left: `${idealMin}%`, width: `${idealMax - idealMin}%` }} />
      {marker !== null && (
        <span className="crop-climate-range__cell-marker" style={{ left: `${marker}%` }}>
          <span />
        </span>
      )}
    </div>
  );
};

const MetricScale: React.FC<{ domain: readonly [number, number]; metric: ClimateMetric }> = ({ domain, metric }) => (
  <div className="crop-climate-scale" aria-hidden="true">
    <span>{formatClimateValue(metric, domain[0])}</span>
    <span>{formatClimateValue(metric, domain[1])}</span>
  </div>
);

const CropDetail: React.FC<{
  good: Good;
  cellTemperature: number | null;
  cellPrecipitation: number | null;
  crops: readonly Good[];
}> = ({ good, cellTemperature, cellPrecipitation, crops }) => {
  const { t } = useTranslation();
  const crop = getClimateProfile(good)!;
  const temperatureDomain = getDomain(crops, "temperature", cellTemperature);
  const precipitationDomain = getDomain(crops, "precipitation", cellPrecipitation);
  const kindLabel = t(CROP_KIND_KEY[crop.kind] ?? "extensions.cropClimate.kindOrchard");

  return (
    <section className="crop-climate-detail">
      <div className="crop-climate-detail__heading">
        <span className="crop-climate-detail__swatch" style={{ backgroundColor: good.color }} />
        <div>
          <h3>{good.name}</h3>
          <p>{t("extensions.cropClimate.bestSoils", { kind: kindLabel, soils: crop.soils.join(", ") })}</p>
        </div>
      </div>
      <ClimateMetricPanel
        crop={crop}
        metric="temperature"
        domain={temperatureDomain}
        cellValue={cellTemperature}
        label={`${good.name} temperature`}
      />
      <ClimateMetricPanel
        crop={crop}
        metric="precipitation"
        domain={precipitationDomain}
        cellValue={cellPrecipitation}
        label={`${good.name} precipitation`}
      />
      <div className="crop-climate-legend">
        <span>
          <i className="crop-climate-legend__viable" />
          {t("extensions.cropClimate.viableRange")}
        </span>
        <span>
          <i className="crop-climate-legend__ideal" />
          {t("extensions.cropClimate.idealRange")}
        </span>
        <span>
          <i className="crop-climate-legend__marker" />
          {t("extensions.cropClimate.selectedCell")}
        </span>
      </div>
    </section>
  );
};

const ClimateMetricPanel: React.FC<{
  crop: ClimateCropProfile;
  metric: ClimateMetric;
  domain: readonly [number, number];
  cellValue: number | null;
  label: string;
}> = ({ crop, metric, domain, cellValue, label }) => {
  const { t } = useTranslation();
  const range = getRange(crop, metric);
  const selectedCellStatus = getSelectedCellClimateStatus(crop, metric, cellValue, t);
  return (
    <section className="crop-climate-metric">
      <div className="crop-climate-metric__label" id={`${label.replaceAll(" ", "-")}-label`}>
        <strong>{t(METRIC_LABEL_KEY[metric])}</strong>
        <span>
          {t("extensions.cropClimate.viable", { range: formatClimateRange(metric, range.min, range.max) })} ·{" "}
          {t("extensions.cropClimate.ideal", {
            range: formatClimateRange(metric, range.idealMin, range.idealMax)
          })}
        </span>
      </div>
      <ClimateRangeBar
        crop={crop}
        metric={metric}
        domain={domain}
        cellValue={cellValue}
        labelledBy={`${label.replaceAll(" ", "-")}-label`}
      />
      <MetricScale domain={domain} metric={metric} />
      {selectedCellStatus ? <p className="crop-climate-metric__status">{selectedCellStatus}</p> : null}
    </section>
  );
};

const CropComparison: React.FC<{
  crops: readonly Good[];
  metric: ClimateMetric;
  onMetricChange: (metric: ClimateMetric) => void;
  cellTemperature: number | null;
  cellPrecipitation: number | null;
}> = ({ crops, metric, onMetricChange, cellTemperature, cellPrecipitation }) => {
  const { t } = useTranslation();
  const cellValue = metric === "temperature" ? cellTemperature : cellPrecipitation;
  const domain = getDomain(crops, metric, cellValue);
  return (
    <section className="crop-climate-compare">
      <div
        className="crop-climate-compare__controls"
        role="tablist"
        aria-label={t("extensions.cropClimate.compareMetricAria")}
      >
        {(["temperature", "precipitation"] as const).map(candidate => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={metric === candidate}
            className={metric === candidate ? "pressed" : undefined}
            onClick={() => onMetricChange(candidate)}
          >
            {t(METRIC_LABEL_KEY[candidate])}
          </button>
        ))}
      </div>
      <p className="crop-climate-compare__hint">{t("extensions.cropClimate.compareHint")}</p>
      <MetricScale domain={domain} metric={metric} />
      <div className="crop-climate-compare__rows">
        {crops.map(good => (
          <div className="crop-climate-compare__row" key={good.i}>
            <span className="crop-climate-compare__name" id={`crop-${good.i}`}>
              {good.name}
            </span>
            <ClimateRangeBar
              crop={getClimateProfile(good)!}
              metric={metric}
              domain={domain}
              cellValue={cellValue}
              labelledBy={`crop-${good.i}`}
            />
          </div>
        ))}
      </div>
      <div className="crop-climate-legend">
        <span>
          <i className="crop-climate-legend__viable" />
          {t("extensions.cropClimate.viableShort")}
        </span>
        <span>
          <i className="crop-climate-legend__ideal" />
          {t("extensions.cropClimate.idealShort")}
        </span>
        <span>
          <i className="crop-climate-legend__marker" />
          {t("extensions.cropClimate.cell")}
        </span>
      </div>
    </section>
  );
};

const IrrigationSummary: React.FC<{ cellId: number | null; precipitation: number | null }> = ({
  cellId,
  precipitation
}) => {
  const { t } = useTranslation();
  if (cellId === null) return null;
  const irrigatedArea = getIrrigatedArea()[cellId] ?? 0;
  const deliveredWater = getIrrigationDeliveredWater()[cellId] ?? 0;
  const waterStress = getIrrigationWaterStress()[cellId] ?? 0;
  const residualFlow = getRiverResidualFlow()[cellId] ?? 0;
  const supplement = irrigatedArea > 0 ? deliveredWater / irrigatedArea : 0;
  const effectivePrecipitation = precipitation === null ? null : precipitation + supplement;

  return (
    <section className="crop-climate-irrigation" aria-label={t("extensions.cropClimate.irrigationAria")}>
      <div className="crop-climate-irrigation__heading">
        <span>{t("extensions.cropClimate.fieldWater")}</span>
        <strong>
          {irrigatedArea > 0
            ? t("extensions.cropClimate.irrigated", { area: irrigatedArea.toFixed(1) })
            : t("extensions.cropClimate.rainFed")}
        </strong>
      </div>
      <div className="crop-climate-irrigation__ledger">
        <span>
          {t("extensions.cropClimate.rain")}{" "}
          <b>{precipitation === null ? t("extensions.cropClimate.na") : formatAnnualPrecipitation(precipitation)}</b>
        </span>
        <span>
          {t("extensions.cropClimate.canal")}{" "}
          <b>{irrigatedArea > 0 ? `+${formatAnnualPrecipitation(supplement, 1)}` : "—"}</b>
        </span>
        <span>
          {t("extensions.cropClimate.field")}{" "}
          <b>
            {effectivePrecipitation === null
              ? t("extensions.cropClimate.na")
              : formatAnnualPrecipitation(effectivePrecipitation, 1)}
          </b>
        </span>
      </div>
      <p>
        {irrigatedArea > 0
          ? t("extensions.cropClimate.unmet", {
              pct: (waterStress * 100).toFixed(1),
              flow: residualFlow.toFixed(1)
            })
          : residualFlow > 0
            ? t("extensions.cropClimate.noWorks", { flow: residualFlow.toFixed(1) })
            : t("extensions.cropClimate.noRiver")}
      </p>
    </section>
  );
};

export const CropClimateDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("cropClimate"));
  const { cellId, temperature, precipitation } = useCellInfoState();
  const crops = getGoods().filter(good => Boolean(getClimateProfile(good)));
  const [tab, setTab] = React.useState<DialogTab>("detail");
  const [metric, setMetric] = React.useState<ClimateMetric>("temperature");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const selected = crops.find(good => good.i === selectedId) ?? crops[0];

  React.useEffect(() => {
    if (isOpen && selectedId === null && crops[0]) setSelectedId(crops[0].i);
  }, [crops, isOpen, selectedId]);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.cropClimate")}
      onClose={() => closeDialog("cropClimate")}
      className="crop-climate-dialog"
      anchorTitlebarOnOpen
    >
      <div className="crop-climate-dialog__cell-summary">
        <span>
          {cellId === null
            ? t("extensions.cropClimate.cellUnset")
            : t("extensions.cropClimate.cellSet", { id: cellId })}
        </span>
        <strong>{temperature === null ? t("extensions.cropClimate.temperatureNa") : `${temperature}°`}</strong>
        <strong>
          {precipitation === null
            ? t("extensions.cropClimate.precipNa")
            : t("extensions.cropClimate.precip", { value: formatAnnualPrecipitation(precipitation) })}
        </strong>
      </div>
      <IrrigationSummary cellId={cellId} precipitation={precipitation} />
      {!crops.length ? (
        <p className="crop-climate-dialog__empty">{t("extensions.cropClimate.empty")}</p>
      ) : (
        <>
          <div className="crop-climate-tabs" role="tablist" aria-label={t("extensions.cropClimate.tabsAria")}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "detail"}
              className={tab === "detail" ? "pressed" : undefined}
              onClick={() => setTab("detail")}
            >
              {t("extensions.cropClimate.details")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "compare"}
              className={tab === "compare" ? "pressed" : undefined}
              onClick={() => setTab("compare")}
            >
              {t("extensions.cropClimate.compare")}
            </button>
          </div>
          {tab === "detail" && selected && (
            <>
              <label className="crop-climate-select">
                <span>{t("extensions.cropClimate.crop")}</span>
                <select value={selected.i} onChange={event => setSelectedId(Number(event.target.value))}>
                  {crops.map(good => (
                    <option key={good.i} value={good.i}>
                      {good.name}
                    </option>
                  ))}
                </select>
              </label>
              <CropDetail
                good={selected}
                cellTemperature={temperature}
                cellPrecipitation={precipitation}
                crops={crops}
              />
            </>
          )}
          {tab === "compare" && (
            <CropComparison
              crops={crops}
              metric={metric}
              onMetricChange={setMetric}
              cellTemperature={temperature}
              cellPrecipitation={precipitation}
            />
          )}
        </>
      )}
    </Dialog>
  );
};
