import client from "../api/client";
import type { Exercise, PlannedWorkout } from "../types";

const SPORT_COLORS: Record<string, string> = {
  running: "var(--running)",
  lifting: "var(--lifting)",
  cross_training: "var(--cross)",
  rest: "var(--rest)",
};

function formatReps(reps: number | string): string {
  if (typeof reps === "string") return reps;
  return String(reps);
}

export default function WorkoutDetailPanel({
  workout,
  onClose,
  onUpdate,
}: {
  workout: PlannedWorkout | null;
  onClose: () => void;
  onUpdate: (updated: PlannedWorkout) => void;
}) {
  if (!workout) return null;

  const exercises: Exercise[] = workout.target_metrics?.exercises ?? [];
  const isStrength = workout.sport === "lifting" && exercises.length > 0;

  const handleToggleExercise = async (index: number) => {
    const updated = { ...workout };
    const metrics = { ...updated.target_metrics };
    const exList = [...(metrics.exercises as Exercise[])];
    exList[index] = { ...exList[index], completed: !exList[index].completed };
    metrics.exercises = exList;
    updated.target_metrics = metrics;

    const allDone = exList.every((ex) => ex.completed);
    updated.completed = allDone;
    onUpdate(updated);

    try {
      const { data } = await client.patch(
        `/training/workouts/${workout.id}/exercises/${index}/toggle`
      );
      const synced = {
        ...workout,
        completed: data.completed,
        target_metrics: data.target_metrics,
      };
      onUpdate(synced);
    } catch {
      onUpdate(workout);
    }
  };

  const handleToggleWorkout = async () => {
    const updated = { ...workout, completed: !workout.completed };
    onUpdate(updated);

    try {
      const { data } = await client.patch(
        `/training/workouts/${workout.id}/toggle`
      );
      onUpdate({ ...workout, completed: data.completed });
    } catch {
      onUpdate(workout);
    }
  };

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel workout-detail-panel">
        <div className="detail-panel-header">
          <h3>{workout.title}</h3>
          <button className="detail-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="detail-panel-body">
          <div className="workout-detail-meta">
            <span
              className="workout-detail-sport"
              style={{ borderColor: SPORT_COLORS[workout.sport] || "var(--border)" }}
            >
              {workout.sport === "cross_training" ? "cross training" : workout.sport}
            </span>
            <span className="workout-detail-type">{workout.workout_type.replace(/_/g, " ")}</span>
            <span className="workout-detail-date">
              {new Date(workout.scheduled_date + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          {workout.description && (
            <p className="workout-detail-desc">{workout.description}</p>
          )}

          {isStrength && (
            <div className="exercise-list">
              <h4>Exercises</h4>
              {exercises.map((ex, i) => (
                <button
                  key={i}
                  className={`exercise-card ${ex.completed ? "completed" : ""}`}
                  onClick={() => handleToggleExercise(i)}
                >
                  <span className={`workout-check ${ex.completed ? "checked" : ""}`}>
                    {ex.completed ? "✓" : ""}
                  </span>
                  <div className="exercise-info">
                    <span className={`exercise-name ${ex.completed ? "done" : ""}`}>
                      {ex.name}
                    </span>
                    <span className="exercise-detail">
                      {ex.sets} x {formatReps(ex.reps)}
                      {ex.rpe != null && ` @ RPE ${ex.rpe}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            className={`btn-workout-complete ${workout.completed ? "completed" : ""}`}
            onClick={handleToggleWorkout}
          >
            {workout.completed ? "Mark Incomplete" : "Complete Workout"}
          </button>
        </div>
      </div>
    </>
  );
}
