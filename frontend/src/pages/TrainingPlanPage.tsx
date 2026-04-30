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
    <div className="page">
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

                  return (
                    <div key={dayIdx} className="week-day">
                      <div className="day-label">{day}</div>
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
                              {w.completed && <span className="check">&#10003;</span>}
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
          {plan.description && (
            <p className="muted" style={{ marginBottom: "1rem" }}>{plan.description}</p>
          )}

          <div className="plan-meta">
            <span>
              {plan.start_date} — {plan.end_date}
            </span>
            {plan.phase && <span className="phase-badge">{plan.phase}</span>}
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
