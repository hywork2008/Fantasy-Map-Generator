import { useMapReadyTaskState } from "../../store/mapReadyTaskState";
import "./mapReadyTaskStatus.css";

export const MapReadyTaskStatus = () => {
  const isRunning = useMapReadyTaskState(state => state.isRunning);
  const label = useMapReadyTaskState(state => state.label);
  const progress = useMapReadyTaskState(state => state.progress);

  if (!isRunning || !label) return null;
  const percentage = Math.round(progress * 100);

  return (
    <output id="mapReadyTaskStatus" aria-live="polite" aria-label={`${label}: ${percentage}%`}>
      <span className="map-ready-task__mark" aria-hidden="true" />
      <span className="map-ready-task__copy">{label}</span>
      <span className="map-ready-task__percent">{percentage}%</span>
      <span className="map-ready-task__track" aria-hidden="true">
        <span className="map-ready-task__fill" style={{ width: `${percentage}%` }} />
      </span>
    </output>
  );
};
