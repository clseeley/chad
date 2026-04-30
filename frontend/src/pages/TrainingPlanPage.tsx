import { useEffect, useState } from "react";
import client from "../api/client";
import type { TrainingPlan, PlannedWorkout } from "../types";

const SPORT_COLORS: Record<string, string> = {
  running: "var(--running)",
  lifting: "var(--lifting)",
  cross_training: "var(--cross)",
  rest: "var(--rest)",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function groupByWeek(workouts: PlannedWorkout[]): Record<number, PlannedWorkout[]> {
  const weeks: Record<number, PlannedWorkout[]> = {};
  for (const w of workouts) {
    const wk = w.week_number ?? 0;
    if (!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(w);
  }
  return weeks;
}

function getWeekStartDate(planStart: string, weekNumber: number): Date {
  const start = new Date(planStart + "T00:00:00");
  const d = new Date(start);
  d.setDate(d.getDate() + (weekNumber - 1) * 7);
  return d;
}

function isToday(planStart: string, weekNumber: number, dayIdx: number): boolean {
  const weekStart = getWeekStartDate(planStart, weekNumber);
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIdx);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function TrainingPlanPage() {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rationaleOpen, setRationaleOpen] = useState(false);

  useEffect(() => {
    client
      .get("/training/plan")
      .then(({ data }) => setPlan(data))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await client.post("/training/generate");
      const { data } = await client.get("/training/plan");
      setPlan(data);
    } catch {
      alert("Plan generation failed. Make sure you have goals set up.");
    } finally {
      setGenerating(false);
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

  if (loading) {
    return (
      <div className="page">
        <h2>Training Plan</h2>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="page">
        <h2>Training Plan</h2>
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ marginBottom: "1rem" }}>
            No active training plan. Set your goals and let Chad build one for
            you.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary"
          >
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

  const weeks = groupByWeek(plan.workouts);
  const weekNumbers = Object.keys(weeks)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="page page-wide">
      <h2>{plan.name}</h2>

      <div className="plan-layout">
        <div className="plan-weeks">
          {weekNumbers.map((wk) => (
            <div key={wk} className="plan-week">
              <h3>Week {wk}</h3>
              <div className="week-grid">
                {DAYS.map((day, dayIdx) => {
                  const dayWorkouts = (weeks[wk] || []).filter(
                    (w) => w.day_of_week === dayIdx
                  );
                  const today = isToday(plan.start_date, wk, dayIdx);

                  return (
                    <div key={dayIdx} className={`week-day ${today ? "today" : ""}`}>
                      <div className="day-label">
                        {day}
                        {today && <span className="today-dot" />}
                      </div>
                      {dayWorkouts.length === 0 ? (
                        <div className="day-rest">Rest</div>
                      ) : (
                        dayWorkouts.map((w) => (
                          <div
                            key={w.id}
                            className={`workout-card ${w.completed ? "completed" : ""}`}
                            style={{
                              borderLeftColor: SPORT_COLORS[w.sport] || "var(--border)",
                            }}
                            onClick={() =>
                              setExpanded(expanded === w.id ? null : w.id)
                            }
                          >
                            <div className="workout-title">
                              <button
                                className={`workout-check ${w.completed ? "checked" : ""}`}
                                onClick={(e) => handleToggleComplete(w.id, e)}
                                title={w.completed ? "Mark incomplete" : "Mark complete"}
                              >
                                {w.completed ? "✓" : ""}
                              </button>
                              {w.title}
                            </div>
                            {expanded === w.id && (
                              <div className="workout-detail">
                                {w.description}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

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
                <span className={`rationale-chevron ${rationaleOpen ? "open" : ""}`}>&#9662;</span>
              </button>
              {rationaleOpen && (
                <div className="rationale-body">{plan.rationale}</div>
              )}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-outline btn-sm"
            style={{ width: "100%" }}
          >
            {generating ? "Regenerating..." : "Regenerate Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
