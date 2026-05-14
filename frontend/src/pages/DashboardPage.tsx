import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Check,
  ChevronRight,
  Footprints,
  Dumbbell,
  TrendingUp,
  Calendar,
  Zap,
  Activity as ActivityIcon,
  GripVertical,
} from "lucide-react";
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

const SPORT_ICONS: Record<string, React.ReactNode> = {
  running: <Footprints size={14} />,
  lifting: <Dumbbell size={14} />,
  cross_training: <Zap size={14} />,
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

function DroppableDashDay({
  dayIdx,
  dateStr,
  isToday,
  children,
}: {
  dayIdx: number;
  dateStr: string;
  isToday: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dash-${dayIdx}`,
    data: { dayIdx, dateStr },
  });

  return (
    <div
      ref={setNodeRef}
      className={`week-schedule-day ${isToday ? "today" : ""} ${isOver ? "drop-target" : ""}`}
    >
      {children}
    </div>
  );
}

function DraggableDashWorkout({
  workout,
  onSelect,
  onToggle,
}: {
  workout: PlannedWorkout;
  onSelect: (w: PlannedWorkout) => void;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: workout.id,
    data: { workout },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`week-schedule-workout ${workout.completed ? "completed" : ""} ${isDragging ? "dragging" : ""}`}
      style={{
        borderLeftColor: SPORT_COLORS[workout.sport] || "var(--border)",
        cursor: "grab",
      }}
      onClick={() => { if (!isDragging) onSelect(workout); }}
    >
      <div className="week-schedule-workout-header">
        <button
          className={`workout-check ${workout.completed ? "checked" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle(workout.id); }}
          title={workout.completed ? "Mark incomplete" : "Mark complete"}
        >
          {workout.completed ? <Check size={10} /> : ""}
        </button>
        <span className={`week-schedule-title ${workout.completed ? "done" : ""}`}>
          {workout.title}
        </span>
      </div>
      <div className="week-schedule-sport">
        {SPORT_ICONS[workout.sport]} {workout.sport}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [weekWorkouts, setWeekWorkouts] = useState<PlannedWorkout[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<PlannedWorkout | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveWorkout(event.active.data.current?.workout ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveWorkout(null);
    if (!event.over) return;

    const workout = event.active.data.current?.workout as PlannedWorkout | undefined;
    if (!workout) return;

    const { dayIdx, dateStr: newDateStr } = event.over.data.current as { dayIdx: number; dateStr: string };
    if (workout.scheduled_date === newDateStr) return;

    const original = { ...workout };

    setWeekWorkouts((prev) =>
      prev.map((w) =>
        w.id === workout.id
          ? { ...w, scheduled_date: newDateStr, day_of_week: dayIdx }
          : w
      )
    );

    client
      .patch(`/training/workouts/${workout.id}/move`, { scheduled_date: newDateStr })
      .then(({ data }) => {
        setWeekWorkouts((prev) => prev.map((w) => (w.id === data.id ? data : w)));
      })
      .catch(() => {
        setWeekWorkouts((prev) => prev.map((w) => (w.id === original.id ? original : w)));
      });
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
        <div className="card card-today">
          <h3>
            <Calendar size={16} className="card-title-icon" />
            Today's Workout
          </h3>
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
                  {w.completed ? <Check size={12} /> : ""}
                </button>
                <div style={{ flex: 1 }}>
                  <div className={`dash-workout-title ${w.completed ? "done" : ""}`}>
                    {w.title}
                  </div>
                  <div className="dash-workout-desc">{w.description}</div>
                </div>
                <ChevronRight size={16} className="muted" />
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
          <h3>
            <TrendingUp size={16} className="card-title-icon" />
            Quick Stats <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>(last week)</span>
          </h3>
          <div className="dash-stats">
            <div className="dash-stat" style={{ '--stat-accent': 'var(--running)' } as React.CSSProperties}>
              <Footprints size={18} className="dash-stat-icon" style={{ color: 'var(--running)' }} />
              <span className="dash-stat-value">{lastWeekDist.toFixed(1)}</span>
              <span className="dash-stat-label">{summary?.units ?? "km"} run</span>
            </div>
            <div className="dash-stat" style={{ '--stat-accent': 'var(--lifting)' } as React.CSSProperties}>
              <Dumbbell size={18} className="dash-stat-icon" style={{ color: 'var(--lifting)' }} />
              <span className="dash-stat-value">{lastWeekLifting}</span>
              <span className="dash-stat-label">lifts</span>
            </div>
            <div className="dash-stat" style={{ '--stat-accent': 'var(--success)' } as React.CSSProperties}>
              <TrendingUp size={18} className="dash-stat-icon" style={{ color: 'var(--success)' }} />
              <span className="dash-stat-value">{summary?.total_activities ?? 0}</span>
              <span className="dash-stat-label">activities (4wk)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-this-week">
        <div className="dash-recent-header">
          <h3>{weekOffset === 0 ? "This Week" : "Next Week"}</h3>
          <Link to="/plan" className="dash-link">View full plan <ChevronRight size={14} /></Link>
        </div>
        {weekWorkouts.length > 0 && (
          <div className="week-summary-bar">
            {weekPlannedMiles > 0 && (
              <span className="week-summary-chip" style={{ borderColor: "var(--running)" }}>
                <Footprints size={12} /> {weekPlannedMiles.toFixed(1)} mi planned
              </span>
            )}
            <span className="week-summary-chip" style={{ borderColor: "var(--lifting)" }}>
              <Dumbbell size={12} /> {weekLiftCount} lift{weekLiftCount !== 1 ? "s" : ""}
            </span>
            <span className="week-summary-chip" style={{ borderColor: "var(--text-muted)" }}>
              {weekWorkouts.length} total
            </span>
          </div>
        )}
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="week-schedule">
            {weekDates.map(({ dayName, dateStr, dateLabel }, dayIdx) => {
              const dayWorkouts = weekWorkouts.filter((w) => w.scheduled_date === dateStr);
              const isToday = dateStr === todayStr;

              return (
                <DroppableDashDay key={dateStr} dayIdx={dayIdx} dateStr={dateStr} isToday={isToday}>
                  <div className="week-schedule-header">
                    <span className="week-schedule-name">{dayName}</span>
                    <span className="week-schedule-date">{dateLabel}</span>
                  </div>
                  {dayWorkouts.length === 0 ? (
                    <div className="week-schedule-rest">Rest</div>
                  ) : (
                    dayWorkouts.map((w) => (
                      <DraggableDashWorkout
                        key={w.id}
                        workout={w}
                        onSelect={setSelectedWorkout}
                        onToggle={handleToggleComplete}
                      />
                    ))
                  )}
                </DroppableDashDay>
              );
            })}
          </div>
          <DragOverlay>
            {activeWorkout && (
              <div
                className="week-schedule-workout drag-preview"
                style={{ borderLeftColor: SPORT_COLORS[activeWorkout.sport] || "var(--border)" }}
              >
                <div className="week-schedule-workout-header">
                  <GripVertical size={12} className="muted" />
                  <span className="week-schedule-title">{activeWorkout.title}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="dash-recent">
        <div className="dash-recent-header">
          <h3>Recent Activities</h3>
          <Link to="/activities" className="dash-link">View all <ChevronRight size={14} /></Link>
        </div>
        {activities.length === 0 ? (
          <div className="empty-state">
            <ActivityIcon size={32} />
            <p>No activities yet. Connect Strava in <Link to="/settings" style={{ color: "var(--primary)" }}>Settings</Link>.</p>
          </div>
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
