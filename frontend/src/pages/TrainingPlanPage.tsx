import { useEffect, useState } from "react";
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
  GripVertical,
  RefreshCw,
  Trash2,
  ChevronDown,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import client from "../api/client";
import WorkoutDetailPanel from "../components/WorkoutDetailPanel";
import type { TrainingPlan, PlannedWorkout } from "../types";

const SPORT_COLORS: Record<string, string> = {
  running: "var(--running)",
  lifting: "var(--lifting)",
  cross_training: "var(--cross)",
  rest: "var(--rest)",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function groupByWeek(workouts: PlannedWorkout[], planStart: string): Record<number, PlannedWorkout[]> {
  const weeks: Record<number, PlannedWorkout[]> = {};
  const start = new Date(planStart + "T00:00:00");
  const startMonday = new Date(start);
  startMonday.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  for (const w of workouts) {
    let wk = w.week_number;
    if (wk == null) {
      const wDate = new Date(w.scheduled_date + "T00:00:00");
      const diffDays = Math.floor((wDate.getTime() - startMonday.getTime()) / 86400000);
      wk = Math.floor(diffDays / 7) + 1;
    }
    if (!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(w);
  }
  return weeks;
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayHasDate(workouts: PlannedWorkout[], todayStr: string, weekNum: number, dayIdx: number): boolean {
  return workouts.some(
    (w) => w.week_number === weekNum && w.day_of_week === dayIdx && w.scheduled_date === todayStr
  );
}

function isDayToday(planStart: string, weekNum: number, dayIdx: number, todayStr: string, allWorkouts: PlannedWorkout[]): boolean {
  if (dayHasDate(allWorkouts, todayStr, weekNum, dayIdx)) return true;
  const start = new Date(planStart + "T00:00:00");
  start.setDate(start.getDate() + (weekNum - 1) * 7 + dayIdx);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` === todayStr;
}

function computeDate(planStart: string, weekNum: number, dayIdx: number): string {
  const start = new Date(planStart + "T00:00:00");
  const startMonday = new Date(start);
  startMonday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const target = new Date(startMonday);
  target.setDate(startMonday.getDate() + (weekNum - 1) * 7 + dayIdx);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function DayColumn({
  weekNum,
  dayIdx,
  isToday,
  children,
}: {
  weekNum: number;
  dayIdx: number;
  isToday: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${weekNum}-${dayIdx}`,
    data: { weekNum, dayIdx },
  });

  return (
    <div
      ref={setNodeRef}
      className={`week-day ${isToday ? "today" : ""} ${isOver ? "drop-target" : ""}`}
    >
      {children}
    </div>
  );
}

function DraggableWorkoutCard({
  workout,
  onSelect,
  onToggle,
}: {
  workout: PlannedWorkout;
  onSelect: (w: PlannedWorkout) => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
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
      className={`workout-card ${workout.completed ? "completed" : ""} ${isDragging ? "dragging" : ""}`}
      style={{
        borderLeftColor: SPORT_COLORS[workout.sport] || "var(--border)",
      }}
      onClick={() => {
        if (!isDragging) onSelect(workout);
      }}
    >
      <div className="workout-title">
        <button
          className={`workout-check ${workout.completed ? "checked" : ""}`}
          onClick={(e) => onToggle(workout.id, e)}
          title={workout.completed ? "Mark incomplete" : "Mark complete"}
        >
          {workout.completed ? <Check size={10} /> : ""}
        </button>
        {workout.title}
      </div>
    </div>
  );
}

export default function TrainingPlanPage() {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(null);
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [genNotes, setGenNotes] = useState("");
  const [activeWorkout, setActiveWorkout] = useState<PlannedWorkout | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    client
      .get("/training/plan")
      .then(({ data }) => setPlan(data))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await client.post("/training/generate", { notes: genNotes || undefined });
      const { data } = await client.get("/training/plan");
      setPlan(data);
    } catch {
      alert("Plan generation failed. Make sure you have goals set up.");
    } finally {
      setGenerating(false);
    }
  };

  const handleClearPlans = async () => {
    if (!confirm("Delete all training plans? This cannot be undone.")) return;
    try {
      await client.delete("/training/plans");
      setPlan(null);
    } catch {
      alert("Failed to clear plans.");
    }
  };

  const handleToggleComplete = async (workoutId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await client.patch(`/training/workouts/${workoutId}/toggle`);
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workouts: prev.workouts.map((w) =>
            w.id === workoutId ? { ...w, completed: data.completed } : w
          ),
        };
      });
    } catch {
      // ignore
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveWorkout(event.active.data.current?.workout ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveWorkout(null);
    if (!plan || !event.over) return;

    const workout = event.active.data.current?.workout as PlannedWorkout | undefined;
    if (!workout) return;

    const { weekNum, dayIdx } = event.over.data.current as { weekNum: number; dayIdx: number };

    if (workout.week_number === weekNum && workout.day_of_week === dayIdx) return;

    const newDateStr = computeDate(plan.start_date, weekNum, dayIdx);
    const original = { ...workout };

    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workouts: prev.workouts.map((w) =>
          w.id === workout.id
            ? { ...w, scheduled_date: newDateStr, day_of_week: dayIdx, week_number: weekNum }
            : w
        ),
      };
    });

    client
      .patch(`/training/workouts/${workout.id}/move`, { scheduled_date: newDateStr })
      .then(({ data }) => {
        setPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            workouts: prev.workouts.map((w) => (w.id === data.id ? data : w)),
          };
        });
      })
      .catch(() => {
        setPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            workouts: prev.workouts.map((w) => (w.id === original.id ? original : w)),
          };
        });
      });
  };

  if (loading) {
    return (
      <div className="page">
        <h2>Training Plan</h2>
        <div className="card skeleton-card">
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="page">
        <h2>Training Plan</h2>
        <div className="card empty-state-card">
          <ClipboardList size={40} className="empty-state-icon" />
          <h3>No active training plan</h3>
          <p className="muted">Set your goals and let Chad build one for you.</p>
          <textarea
            className="gen-notes-input"
            placeholder='Optional notes for the coach (e.g. "I want 4 lifts per week", "No running on Fridays")'
            value={genNotes}
            onChange={(e) => setGenNotes(e.target.value)}
            rows={3}
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary"
            style={{ marginTop: "0.75rem" }}
          >
            <Sparkles size={16} />
            {generating ? "Generating plan..." : "Generate Training Plan"}
          </button>
          {generating && (
            <p className="muted" style={{ marginTop: "1rem" }}>
              This may take 10-15 seconds...
            </p>
          )}
        </div>
      </div>
    );
  }

  const weeks = groupByWeek(plan.workouts, plan.start_date);
  const weekNumbers = Object.keys(weeks)
    .map(Number)
    .sort((a, b) => a - b);
  const todayStr = getTodayStr();

  return (
    <div className="page page-wide">
      <h2>{plan.name}</h2>

      <div className="plan-layout">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="plan-weeks">
            {weekNumbers.map((wk) => (
              <div key={wk} className="plan-week">
                <h3>Week {wk}</h3>
                <div className="week-grid">
                  {DAYS.map((day, dayIdx) => {
                    const dayWorkouts = (weeks[wk] || []).filter(
                      (w) => w.day_of_week === dayIdx
                    );
                    const today = isDayToday(plan.start_date, wk, dayIdx, todayStr, plan.workouts);

                    return (
                      <DayColumn key={dayIdx} weekNum={wk} dayIdx={dayIdx} isToday={today}>
                        <div className="day-label">
                          {day}
                          {today && <span className="today-dot" />}
                        </div>
                        {dayWorkouts.length === 0 ? (
                          <div className="day-rest">Rest</div>
                        ) : (
                          dayWorkouts.map((w) => (
                            <DraggableWorkoutCard
                              key={w.id}
                              workout={w}
                              onSelect={setSelectedWorkout}
                              onToggle={handleToggleComplete}
                            />
                          ))
                        )}
                      </DayColumn>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeWorkout && (
              <div
                className="workout-card drag-preview"
                style={{ borderLeftColor: SPORT_COLORS[activeWorkout.sport] || "var(--border)" }}
              >
                <div className="workout-title">
                  <GripVertical size={12} className="muted" />
                  {activeWorkout.title}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <div className="plan-sidebar">
          <div className="sidebar-card">
            <h4>Plan Details</h4>
            {plan.description && (
              <p style={{ marginBottom: "0.75rem", lineHeight: 1.6 }}>{plan.description}</p>
            )}
            <div className="plan-meta">
              <span>{plan.start_date} &mdash; {plan.end_date}</span>
              {plan.phase && <span className="phase-badge">{plan.phase}</span>}
            </div>
          </div>

          {plan.rationale && (
            <div className="rationale-card">
              <button
                className="rationale-toggle"
                onClick={() => setRationaleOpen(!rationaleOpen)}
              >
                <span>Coach's Notes</span>
                <ChevronDown
                  size={16}
                  className={`rationale-chevron ${rationaleOpen ? "open" : ""}`}
                />
              </button>
              {rationaleOpen && (
                <div className="rationale-body">{plan.rationale}</div>
              )}
            </div>
          )}

          <textarea
            className="gen-notes-input gen-notes-sm"
            placeholder="Notes for regeneration..."
            value={genNotes}
            onChange={(e) => setGenNotes(e.target.value)}
            rows={2}
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-outline btn-sm"
            style={{ width: "100%" }}
          >
            <RefreshCw size={14} />
            {generating ? "Regenerating..." : "Regenerate Plan"}
          </button>
          <button
            onClick={handleClearPlans}
            className="btn-outline btn-sm btn-danger"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            <Trash2 size={14} />
            Clear All Plans
          </button>
        </div>
      </div>

      <WorkoutDetailPanel
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        onUpdate={(updated) => {
          setSelectedWorkout(updated);
          setPlan((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              workouts: prev.workouts.map((w) =>
                w.id === updated.id ? updated : w
              ),
            };
          });
        }}
      />
    </div>
  );
}
