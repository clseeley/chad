import { useEffect, useState } from "react";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ActivityDetailPanel from "../components/ActivityDetailPanel";

interface Activity {
  id: string;
  strava_id: number;
  sport_type: string;
  name: string | null;
  start_date: string;
  moving_time: number | null;
  distance: number | null;
  total_elevation_gain: number | null;
  average_heartrate: number | null;
  calories: number | null;
  matched_workout_id: string | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatDistance(meters: number | null, units: string = "imperial"): string {
  if (!meters) return "--";
  if (units === "imperial") {
    return `${(meters / 1609.34).toFixed(1)} mi`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
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

const SPORT_COLORS: Record<string, string> = {
  Run: "var(--running)",
  TrailRun: "var(--running)",
  VirtualRun: "var(--running)",
  WeightTraining: "var(--lifting)",
  Crossfit: "var(--lifting)",
  Ride: "var(--cross)",
  Swim: "var(--cross)",
  Yoga: "var(--cross)",
  Hike: "var(--cross)",
  Walk: "var(--cross)",
  Workout: "var(--cross)",
};

export default function ActivityHistoryPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (filter !== "all") params.sport = filter;

    client
      .get("/training/activities", { params })
      .then(({ data }) => setActivities(data))
      .finally(() => setLoading(false));
  }, [filter]);

  const handleSync = async () => {
    try {
      await client.post("/strava/sync");
      setTimeout(() => {
        client.get("/training/activities").then(({ data }) => setActivities(data));
      }, 3000);
    } catch {
      // strava not connected
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Activities</h2>
        <button onClick={handleSync} className="btn-outline btn-sm">
          Sync Strava
        </button>
      </div>

      <div className="filter-bar">
        {["all", "running", "lifting", "cross_training"].map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "cross_training" ? "Cross Training" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading activities...</p>
      ) : activities.length === 0 ? (
        <p className="muted">
          No activities yet. Connect Strava in Settings to sync your workouts.
        </p>
      ) : (
        <div className="activity-list">
          {activities.map((a) => (
            <div
              key={a.id}
              className={`activity-row clickable ${selectedActivityId === a.id ? "selected" : ""}`}
              onClick={() => setSelectedActivityId(selectedActivityId === a.id ? null : a.id)}
            >
              <div
                className="sport-dot"
                style={{ background: SPORT_COLORS[a.sport_type] || "var(--text-muted)" }}
              />
              <div className="activity-info">
                <div className="activity-name">
                  {a.name || SPORT_LABELS[a.sport_type] || a.sport_type}
                </div>
                <div className="activity-date">
                  {new Date(a.start_date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div className="activity-stats">
                <span>{formatDistance(a.distance, user?.units)}</span>
                <span>{formatDuration(a.moving_time)}</span>
                {a.average_heartrate && (
                  <span>{Math.round(a.average_heartrate)} bpm</span>
                )}
              </div>
              {a.matched_workout_id && (
                <span className="matched-badge">Matched</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ActivityDetailPanel
        activityId={selectedActivityId}
        units={user?.units || "imperial"}
        onClose={() => setSelectedActivityId(null)}
      />
    </div>
  );
}
