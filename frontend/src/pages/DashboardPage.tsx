import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ActivityDetailPanel from "../components/ActivityDetailPanel";
import type { PlannedWorkout } from "../types";

const SPORT_COLORS: Record<string, string> = {
  running: "var(--running)",
  lifting: "var(--lifting)",
  cross_training: "var(--cross)",
};

interface Activity {
  id: string;
  sport_type: string;
  name: string;
  start_date: string;
  distance: number | null;
  moving_time: number | null;
}

interface Summary {
  weekly_running_distance: number[];
  lifting_sessions_per_week: number[];
  total_activities: number;
  units?: string;
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekDates(): { dayName: string; dateStr: string; dateLabel: string }[] {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return {
      dayName: name,
      dateStr: `${y}-${m}-${day}`,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
    };
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [weekWorkouts, setWeekWorkouts] = useState<PlannedWorkout[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);

  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    Promise.all([
      client.get("/training/plan/week?offset=0").catch(() => ({ data: [] })),
      client.get("/training/activities?limit=5").catch(() => ({ data: [] })),
      client.get("/training/summary?weeks=4").catch(() => ({ data: null })),
      client.get("/training/plan/debug").catch(() => ({ data: null })),
    ]).then(([weekRes, actRes, sumRes, debugRes]) => {
      setWeekWorkouts(weekRes.data || []);
      setActivities(actRes.data || []);
      setSummary(sumRes.data);
      setDebugInfo(debugRes.data);
      setLoading(false);
    });
  }, []);

  const todayStr = getTodayStr();
  const weekDates = getWeekDates();
  const todayWorkouts = weekWorkouts.filter((w) => w.scheduled_date === todayStr);

  const handleToggleComplete = async (workoutId: string) => {
    try {
      const { data } = await client.patch(`/training/workouts/${workoutId}/toggle`);
      setWeekWorkouts((prev) =>
        prev.map((w) => (w.id === workoutId ? { ...w, completed: data.completed } : w))
      );
    } catch {
      // ignore
    }
  };

  const lastWeekDist = summary?.weekly_running_distance?.slice(-1)[0] ?? 0;
  const lastWeekLifting = summary?.lifting_sessions_per_week?.slice(-1)[0] ?? 0;

  if (loading) {
    return (
      <div className="page">
        <h2>Dashboard</h2>
        <div className="dashboard-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton-line wide" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Welcome back{user?.first_name ? `, ${user.first_name}` : ""}</h2>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Today's Workout</h3>
          {todayWorkouts.length === 0 ? (
            <p className="muted">Rest day — no workouts scheduled.</p>
          ) : (
            todayWorkouts.map((w) => (
              <div key={w.id} className="dash-workout">
                <button
                  className={`workout-check ${w.completed ? "checked" : ""}`}
                  onClick={() => handleToggleComplete(w.id)}
                  title={w.completed ? "Mark incomplete" : "Mark complete"}
                >
                  {w.completed ? "✓" : ""}
                </button>
                <div style={{ flex: 1 }}>
                  <div className={`dash-workout-title ${w.completed ? "done" : ""}`}>
                    {w.title}
                  </div>
                  <div className="dash-workout-desc">{w.description}</div>
                </div>
              </div>
            ))
          )}
          {weekWorkouts.length === 0 && (
            <p className="muted">
              No plan yet.{" "}
              <Link to="/plan" style={{ color: "var(--primary)" }}>
                Generate one
              </Link>
            </p>
          )}
        </div>

        <div className="card">
          <h3>Quick Stats (last week)</h3>
          <div className="dash-stats">
            <div className="dash-stat">
              <span className="dash-stat-value">{lastWeekDist.toFixed(1)}</span>
              <span className="dash-stat-label">{summary?.units ?? "km"} run</span>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-value">{lastWeekLifting}</span>
              <span className="dash-stat-label">lifts</span>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-value">{summary?.total_activities ?? 0}</span>
              <span className="dash-stat-label">activities (4wk)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-this-week">
        <div className="dash-recent-header">
          <h3>This Week</h3>
          <Link to="/plan" className="dash-link">View full plan</Link>
        </div>
        <div className="week-schedule">
          {weekDates.map(({ dayName, dateStr, dateLabel }) => {
            const dayWorkouts = weekWorkouts.filter((w) => w.scheduled_date === dateStr);
            const isToday = dateStr === todayStr;

            return (
              <div key={dateStr} className={`week-schedule-day ${isToday ? "today" : ""}`}>
                <div className="week-schedule-header">
                  <span className="week-schedule-name">{dayName}</span>
                  <span className="week-schedule-date">{dateLabel}</span>
                </div>
                {dayWorkouts.length === 0 ? (
                  <div className="week-schedule-rest">Rest</div>
                ) : (
                  dayWorkouts.map((w) => (
                    <div
                      key={w.id}
                      className={`week-schedule-workout ${w.completed ? "completed" : ""}`}
                      style={{ borderLeftColor: SPORT_COLORS[w.sport] || "var(--border)" }}
                    >
                      <div className="week-schedule-workout-header">
                        <button
                          className={`workout-check ${w.completed ? "checked" : ""}`}
                          onClick={() => handleToggleComplete(w.id)}
                          title={w.completed ? "Mark incomplete" : "Mark complete"}
                        >
                          {w.completed ? "✓" : ""}
                        </button>
                        <span
                          className={`week-schedule-title ${w.completed ? "done" : ""}`}
                          onClick={() => setExpandedWorkout(expandedWorkout === w.id ? null : w.id)}
                          style={{ cursor: "pointer" }}
                        >
                          {w.title}
                        </span>
                      </div>
                      {expandedWorkout === w.id && (
                        <div className="week-schedule-desc">{w.description}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="dash-recent">
        <div className="dash-recent-header">
          <h3>Recent Activities</h3>
          <Link to="/activities" className="dash-link">View all</Link>
        </div>
        {activities.length === 0 ? (
          <p className="muted">No activities yet. Connect Strava in <Link to="/settings" style={{ color: "var(--primary)" }}>Settings</Link>.</p>
        ) : (
          <div className="activity-list">
            {activities.map((a) => (
              <div
                key={a.id}
                className={`activity-row clickable ${selectedActivityId === a.id ? "selected" : ""}`}
                onClick={() => setSelectedActivityId(selectedActivityId === a.id ? null : a.id)}
              >
                <div className="activity-info">
                  <div className="activity-name">{a.name}</div>
                  <div className="activity-date">
                    {new Date(a.start_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="activity-stats">
                  {a.distance != null && a.distance > 0 && (
                    <span>
                      {user?.units === "imperial"
                        ? `${(a.distance / 1609.34).toFixed(1)} mi`
                        : `${(a.distance / 1000).toFixed(1)} km`}
                    </span>
                  )}
                  {a.moving_time != null && (
                    <span>{Math.round(a.moving_time / 60)} min</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {debugInfo && (
        <details style={{ marginTop: "2rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>Debug: Plan Date Info</summary>
          <pre style={{ background: "var(--surface)", padding: "1rem", borderRadius: "8px", overflow: "auto", maxHeight: "300px" }}>
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      )}

      <ActivityDetailPanel
        activityId={selectedActivityId}
        units={user?.units || "imperial"}
        onClose={() => setSelectedActivityId(null)}
      />
    </div>
  );
}
