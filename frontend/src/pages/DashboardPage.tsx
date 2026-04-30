import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PlannedWorkout } from "../types";

const SPORT_COLORS: Record<string, string> = {
  running: "var(--running)",
  lifting: "var(--lifting)",
  cross_training: "var(--cross)",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [weekWorkouts, setWeekWorkouts] = useState<PlannedWorkout[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.get("/training/plan/week?offset=0").catch(() => ({ data: [] })),
      client.get("/training/activities?limit=5").catch(() => ({ data: [] })),
      client.get("/training/summary?weeks=4").catch(() => ({ data: null })),
    ]).then(([weekRes, actRes, sumRes]) => {
      setWeekWorkouts(weekRes.data || []);
      setActivities(actRes.data || []);
      setSummary(sumRes.data);
      setLoading(false);
    });
  }, []);

  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayWorkouts = weekWorkouts.filter((w) => w.day_of_week === todayIdx);

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
                <div
                  className="sport-dot"
                  style={{ background: SPORT_COLORS[w.sport] || "var(--rest)" }}
                />
                <div>
                  <div className="dash-workout-title">
                    {w.completed && <span style={{ color: "var(--success)" }}>✓ </span>}
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
          <h3>This Week</h3>
          <div className="dash-week-strip">
            {DAYS.map((day, i) => {
              const dayWorkouts = weekWorkouts.filter((w) => w.day_of_week === i);
              const isToday = i === todayIdx;
              return (
                <div
                  key={day}
                  className={`dash-week-day ${isToday ? "today" : ""}`}
                >
                  <span className="dash-day-label">{day}</span>
                  <div className="dash-day-dots">
                    {dayWorkouts.length === 0 ? (
                      <div className="dash-day-dot" style={{ background: "var(--border)" }} />
                    ) : (
                      dayWorkouts.map((w) => (
                        <div
                          key={w.id}
                          className={`dash-day-dot ${w.completed ? "completed" : ""}`}
                          style={{ background: SPORT_COLORS[w.sport] || "var(--rest)" }}
                          title={w.title}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Link to="/plan" className="dash-link">View full plan</Link>
        </div>

        <div className="card">
          <h3>Quick Stats (last week)</h3>
          <div className="dash-stats">
            <div className="dash-stat">
              <span className="dash-stat-value">{lastWeekDist.toFixed(1)}</span>
              <span className="dash-stat-label">km run</span>
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
              <div key={a.id} className="activity-row">
                <div className="activity-info">
                  <div className="activity-name">{a.name}</div>
                  <div className="activity-date">
                    {new Date(a.start_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="activity-stats">
                  {a.distance != null && (
                    <span>{(a.distance / 1000).toFixed(1)} km</span>
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
    </div>
  );
}
