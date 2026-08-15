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

const METRIC_LABEL: Record<ClimateMetric, string> = {
  temperature: "Temperature",
  precipitation: "Annual precipitation"
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
  cellValue: number | null
): string | null {
  if (cellValue === null) return null;
  const range = getRange(crop, metric);
  const label = metric === "precipitation" ? "Rainfall" : "Temperature";
  if (cellValue <= range.min) return `${label} is below the viable range.`;
  if (cellValue >= range.max) {
    return metric === "precipitation"
      ? `${label} is wetter than the preferred range.`
      : `${label} is above the viable range.`;
  }
  if (cellValue >= range.idealMin && cellValue <= range.idealMax) return `${label} is in the ideal range.`;
  return `${label} is viable, but outside the ideal range.`;
}

const ClimateRangeBar: React.FC<{
  crop: ClimateCropProfile;
  metric: ClimateMetric;
  domain: readonly [number, number];
  cellValue: number | null;
  labelledBy: string;
}> = ({ crop, metric, domain, cellValue, labelledBy }) => {
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
      aria-label={`${METRIC_LABEL[metric]}: viable ${formatClimateRange(metric, range.min, range.max)}, ideal ${formatClimateRange(metric, range.idealMin, range.idealMax)}`}
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
  const crop = getClimateProfile(good)!;
  const temperatureDomain = getDomain(crops, "temperature", cellTemperature);
  const precipitationDomain = getDomain(crops, "precipitation", cellPrecipitation);
  const kindLabel =
    crop.kind === "cereal"
      ? "Cereal"
      : crop.kind === "legume"
        ? "Legume"
        : crop.kind === "tuber"
          ? "Root crop"
          : crop.kind === "vine"
            ? "Vine"
            : "Orchard fruit";

  return (
    <section className="crop-climate-detail">
      <div className="crop-climate-detail__heading">
        <span className="crop-climate-detail__swatch" style={{ backgroundColor: good.color }} />
        <div>
          <h3>{good.name}</h3>
          <p>
            {kindLabel} · Best soils: {crop.soils.join(", ")}
          </p>
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
          Viable range
        </span>
        <span>
          <i className="crop-climate-legend__ideal" />
          Ideal range
        </span>
        <span>
          <i className="crop-climate-legend__marker" />
          Selected cell
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
  const range = getRange(crop, metric);
  const selectedCellStatus = getSelectedCellClimateStatus(crop, metric, cellValue);
  return (
    <section className="crop-climate-metric">
      <div className="crop-climate-metric__label" id={`${label.replaceAll(" ", "-")}-label`}>
        <strong>{METRIC_LABEL[metric]}</strong>
        <span>
          viable {formatClimateRange(metric, range.min, range.max)} · ideal{" "}
          {formatClimateRange(metric, range.idealMin, range.idealMax)}
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
  const cellValue = metric === "temperature" ? cellTemperature : cellPrecipitation;
  const domain = getDomain(crops, metric, cellValue);
  return (
    <section className="crop-climate-compare">
      <div className="crop-climate-compare__controls" role="tablist" aria-label="Comparison metric">
        {(["temperature", "precipitation"] as const).map(candidate => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={metric === candidate}
            className={metric === candidate ? "pressed" : undefined}
            onClick={() => onMetricChange(candidate)}
          >
            {METRIC_LABEL[candidate]}
          </button>
        ))}
      </div>
      <p className="crop-climate-compare__hint">Each marker shows the selected Cell Info climate value.</p>
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
          Viable
        </span>
        <span>
          <i className="crop-climate-legend__ideal" />
          Ideal
        </span>
        <span>
          <i className="crop-climate-legend__marker" />
          Cell
        </span>
      </div>
    </section>
  );
};

const IrrigationSummary: React.FC<{ cellId: number | null; precipitation: number | null }> = ({
  cellId,
  precipitation
}) => {
  if (cellId === null) return null;
  const irrigatedArea = getIrrigatedArea()[cellId] ?? 0;
  const deliveredWater = getIrrigationDeliveredWater()[cellId] ?? 0;
  const waterStress = getIrrigationWaterStress()[cellId] ?? 0;
  const residualFlow = getRiverResidualFlow()[cellId] ?? 0;
  const supplement = irrigatedArea > 0 ? deliveredWater / irrigatedArea : 0;
  const effectivePrecipitation = precipitation === null ? null : precipitation + supplement;

  return (
    <section className="crop-climate-irrigation" aria-label="Irrigation water balance">
      <div className="crop-climate-irrigation__heading">
        <span>Field water balance</span>
        <strong>{irrigatedArea > 0 ? `${irrigatedArea.toFixed(1)} ha irrigated` : "Rain-fed"}</strong>
      </div>
      <div className="crop-climate-irrigation__ledger">
        <span>
          Rain <b>{precipitation === null ? "n/a" : formatAnnualPrecipitation(precipitation)}</b>
        </span>
        <span>
          Canal <b>{irrigatedArea > 0 ? `+${formatAnnualPrecipitation(supplement, 1)}` : "—"}</b>
        </span>
        <span>
          Field <b>{effectivePrecipitation === null ? "n/a" : formatAnnualPrecipitation(effectivePrecipitation, 1)}</b>
        </span>
      </div>
      <p>
        {irrigatedArea > 0
          ? `${(waterStress * 100).toFixed(1)}% of requested irrigation is unmet · downstream flow ${residualFlow.toFixed(1)}`
          : residualFlow > 0
            ? `No irrigation works · downstream flow ${residualFlow.toFixed(1)}`
            : "No allocated river water at this cell"}
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
