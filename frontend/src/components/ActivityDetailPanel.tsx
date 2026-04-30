import { useEffect, useState } from "react";
import client from "../api/client";

interface ActivityDetail {
  id: string;
  strava_id: number;
  sport_type: string;
  name: string | null;
  description: string | null;
  start_date: string;
  moving_time: number | null;
  elapsed_time: number | null;
  distance: number | null;
  total_elevation_gain: number | null;
  average_speed: number | null;
  max_speed: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  suffer_score: number | null;
  calories: number | null;
  splits: SplitData[] | null;
  laps: LapData[] | null;
}

interface SplitData {
  distance: number;
  elapsed_time: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  elevation_difference?: number;
  split: number;
}

interface LapData {
  name: string;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatPace(metersPerSecond: number, imperial: boolean): string {
  if (!metersPerSecond || metersPerSecond === 0) return "--";
  const secPerUnit = imperial ? 1609.34 / metersPerSecond : 1000 / metersPerSecond;
  const min = Math.floor(secPerUnit / 60);
  const sec = Math.round(secPerUnit % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /${imperial ? "mi" : "km"}`;
}

function formatDist(meters: number | null, imperial: boolean): string {
  if (!meters) return "--";
  if (imperial) return `${(meters / 1609.34).toFixed(2)} mi`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatSpeed(mps: number | null, imperial: boolean): string {
  if (!mps) return "--";
  if (imperial) return `${(mps * 2.23694).toFixed(1)} mph`;
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

function formatElevation(meters: number | null, imperial: boolean): string {
  if (meters == null) return "--";
  if (imperial) return `${Math.round(meters * 3.28084)} ft`;
  return `${Math.round(meters)} m`;
}

const SPORT_LABELS: Record<string, string> = {
  Run: "Run",
  TrailRun: "Trail Run",
  VirtualRun: "Virtual Run",
  WeightTraining: "Lifting",
  Crossfit: "CrossFit",
  Ride: "Ride",
  Swim: "Swim",
  Yoga: "Yoga",
  Hike: "Hike",
  Walk: "Walk",
  Workout: "Workout",
};

export default function ActivityDetailPanel({
  activityId,
  units,
  onClose,
}: {
  activityId: string | null;
  units: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const imperial = units === "imperial";

  useEffect(() => {
    if (!activityId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    client
      .get(`/training/activities/${activityId}`)
      .then(({ data }) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [activityId]);

  if (!activityId) return null;

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <div className="detail-panel-header">
          <h3>{loading ? "Loading..." : detail?.name || "Activity"}</h3>
          <button className="detail-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {loading && <div className="detail-loading">Loading activity data...</div>}

        {!loading && detail && (
          <div className="detail-panel-body">
            <div className="detail-meta">
              <span className="detail-sport">
                {SPORT_LABELS[detail.sport_type] || detail.sport_type}
              </span>
              <span className="detail-date">
                {new Date(detail.start_date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                {" at "}
                {new Date(detail.start_date).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {detail.description && (
              <p className="detail-description">{detail.description}</p>
            )}

            <div className="detail-grid">
              {detail.distance != null && detail.distance > 0 && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Distance</span>
                  <span className="detail-stat-value">
                    {formatDist(detail.distance, imperial)}
                  </span>
                </div>
              )}
              {detail.moving_time != null && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Moving Time</span>
                  <span className="detail-stat-value">
                    {formatDuration(detail.moving_time)}
                  </span>
                </div>
              )}
              {detail.elapsed_time != null && detail.elapsed_time !== detail.moving_time && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Elapsed Time</span>
                  <span className="detail-stat-value">
                    {formatDuration(detail.elapsed_time)}
                  </span>
                </div>
              )}
              {detail.average_speed != null && detail.distance != null && detail.distance > 0 && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Avg Pace</span>
                  <span className="detail-stat-value">
                    {formatPace(detail.average_speed, imperial)}
                  </span>
                </div>
              )}
              {detail.max_speed != null && detail.max_speed > 0 && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Max Speed</span>
                  <span className="detail-stat-value">
                    {formatSpeed(detail.max_speed, imperial)}
                  </span>
                </div>
              )}
              {detail.average_heartrate != null && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Avg HR</span>
                  <span className="detail-stat-value">
                    {Math.round(detail.average_heartrate)} bpm
                  </span>
                </div>
              )}
              {detail.max_heartrate != null && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Max HR</span>
                  <span className="detail-stat-value">
                    {Math.round(detail.max_heartrate)} bpm
                  </span>
                </div>
              )}
              {detail.total_elevation_gain != null && detail.total_elevation_gain > 0 && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Elevation Gain</span>
                  <span className="detail-stat-value">
                    {formatElevation(detail.total_elevation_gain, imperial)}
                  </span>
                </div>
              )}
              {detail.calories != null && detail.calories > 0 && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Calories</span>
                  <span className="detail-stat-value">
                    {Math.round(detail.calories)}
                  </span>
                </div>
              )}
              {detail.suffer_score != null && detail.suffer_score > 0 && (
                <div className="detail-stat">
                  <span className="detail-stat-label">Suffer Score</span>
                  <span className="detail-stat-value">{detail.suffer_score}</span>
                </div>
              )}
            </div>

            {detail.splits && detail.splits.length > 1 && (
              <div className="detail-section">
                <h4>Splits</h4>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>{imperial ? "Mile" : "KM"}</th>
                      <th>Pace</th>
                      <th>Time</th>
                      {detail.splits.some((s) => s.average_heartrate) && <th>HR</th>}
                      {detail.splits.some((s) => s.elevation_difference) && <th>Elev</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.splits.map((s) => (
                      <tr key={s.split}>
                        <td>{s.split}</td>
                        <td>{formatPace(s.average_speed, imperial)}</td>
                        <td>{formatDuration(s.moving_time)}</td>
                        {detail.splits!.some((sp) => sp.average_heartrate) && (
                          <td>{s.average_heartrate ? Math.round(s.average_heartrate) : "--"}</td>
                        )}
                        {detail.splits!.some((sp) => sp.elevation_difference) && (
                          <td>{formatElevation(s.elevation_difference ?? null, imperial)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detail.laps && detail.laps.length > 1 && (
              <div className="detail-section">
                <h4>Laps</h4>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>Lap</th>
                      <th>Distance</th>
                      <th>Time</th>
                      <th>Pace</th>
                      {detail.laps.some((l) => l.average_heartrate) && <th>HR</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.laps.map((l) => (
                      <tr key={l.lap_index}>
                        <td>{l.name || l.lap_index}</td>
                        <td>{formatDist(l.distance, imperial)}</td>
                        <td>{formatDuration(l.moving_time)}</td>
                        <td>{formatPace(l.average_speed, imperial)}</td>
                        {detail.laps!.some((lp) => lp.average_heartrate) && (
                          <td>{l.average_heartrate ? Math.round(l.average_heartrate) : "--"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <a
              href={`https://www.strava.com/activities/${detail.strava_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-strava-link"
            >
              View on Strava
            </a>
          </div>
        )}
      </div>
    </>
  );
}
