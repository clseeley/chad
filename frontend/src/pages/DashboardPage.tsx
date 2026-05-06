import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ActivityDetailPanel from "../components/ActivityDetailPanel";
import WorkoutDetailPanel from "../components/WorkoutDetailPanel";
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

function getWeekDates(offset = 0): { dayName: string; dateStr: string; dateLabel: string }[] {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + offset * 7);

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
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(null);

  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    Promise.all([
      client.get("/training/plan/week?offset=0").catch(() => ({ data: [] })),
      client.get("/training/activities?limit=5").catch(() => ({ data: [] })),
      client.get("/training/summary?weeks=4").catch(() => ({ data: null })),
    ]).then(async ([weekRes, actRes, sumRes]) => {
      let workouts = weekRes.data || [];
      let offset = 0;
      if (workouts.length === 0) {
        const next = await client.get("/training/plan/week?offset=1").catch(() => ({ data: [] }));
        if (next.data && next.data.length > 0) {
          workouts = next.data;
          offset = 1;
        }
      }
      setWeekWorkouts(workouts);
      setWeekOffset(offset);
      setActivities(actRes.data || []);
      setSummary(sumRes.data);
      setLoading(false);
    });
  }, []);

  const todayStr = getTodayStr();
  const weekDates = getWeekDates(weekOffset);
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

  const weekPlannedMiles = weekWorkouts
    .filter((w) => w.sport === "running")
    .reduce((sum, w) => {
      const m = w.target_metrics as Record<string, number> | null;
      return sum + (m?.distance_mi ?? 0);
    }, 0);
  const weekLiftCount = weekWorkouts.filter((w) => w.sport === "lifting").length;

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
          {todayWorkouts.length === 0 && weekOffset === 0 ? (
            <p className="muted">Rest day — no workouts scheduled.</p>
          ) : todayWorkouts.length === 0 && weekOffset > 0 ? (
            <p className="muted">Your plan starts next week — check the schedule below.</p>
          ) : (
            todayWorkouts.map((w) => (
              <div
                key={w.id}
                className="dash-workout"
                onClick={() => setSelectedWorkout(w)}
                style={{ cursor: "pointer" }}
              >
                <button
                  className={`workout-check ${w.completed ? "checked" : ""}`}
                  onClick={(e) => { e.stopPropagation(); handleToggleComplete(w.id); }}
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
          <h3>Quick Stats <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>(last week)</span></h3>
          <div className="dash-stats">
            <div className="dash-stat" style={{ '--stat-accent': 'var(--running)' } as React.CSSProperties}>
              <span className="dash-stat-value">{lastWeekDist.toFixed(1)}</span>
              <span className="dash-stat-label">{summary?.units ?? "km"} run</span>
            </div>
            <div className="dash-stat" style={{ '--stat-accent': 'var(--lifting)' } as React.CSSProperties}>
              <span className="dash-stat-value">{lastWeekLifting}</span>
              <span className="dash-stat-label">lifts</span>
            </div>
            <div className="dash-stat" style={{ '--stat-accent': 'var(--success)' } as React.CSSProperties}>
              <span className="dash-stat-value">{summary?.total_activities ?? 0}</span>
              <span className="dash-stat-label">activities (4wk)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-this-week">
        <div className="dash-recent-header">
          <h3>{weekOffset === 0 ? "This Week" : "Next Week"}</h3>
          <Link to="/plan" className="dash-link">View full plan</Link>
        </div>
        {weekWorkouts.length > 0 && (
          <div className="week-summary-bar">
            {weekPlannedMiles > 0 && (
              <span className="week-summary-chip" style={{ borderColor: "var(--running)" }}>
                {weekPlannedMiles.toFixed(1)} mi planned
              </span>
            )}
            <span className="week-summary-chip" style={{ borderColor: "var(--lifting)" }}>
              {weekLiftCount} lift{weekLiftCount !== 1 ? "s" : ""}
            </span>
            <span className="week-summary-chip" style={{ borderColor: "var(--text-muted)" }}>
              {weekWorkouts.length} total
            </span>
          </div>
        )}
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
                      style={{ borderLeftColor: SPORT_COLORS[w.sport] || "var(--border)", cursor: "pointer" }}
                      onClick={() => setSelectedWorkout(w)}
                    >
                      <div className="week-schedule-workout-header">
                        <button
                          className={`workout-check ${w.completed ? "checked" : ""}`}
                          onClick={(e) => { e.stopPropagation(); handleToggleComplete(w.id); }}
                          title={w.completed ? "Mark incomplete" : "Mark complete"}
                        >
                          {w.completed ? "✓" : ""}
                        </button>
                        <span className={`week-schedule-title ${w.completed ? "done" : ""}`}>
                          {w.title}
                        </span>
                      </div>
                      <div className="week-schedule-sport">{w.sport}</div>
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

      <ActivityDetailPanel
        activityId={selectedActivityId}
        units={user?.units || "imperial"}
        onClose={() => setSelectedActivityId(null)}
      />

      <WorkoutDetailPanel
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        onUpdate={(updated) => {
          setSelectedWorkout(updated);
          setWeekWorkouts((prev) =>
            prev.map((w) => (w.id === updated.id ? updated : w))
          );
        }}
      />
    </div>
  );
}
