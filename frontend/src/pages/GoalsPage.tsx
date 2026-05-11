import { type FormEvent, useEffect, useState } from "react";
import { Plus, Trash2, Target, X } from "lucide-react";
import client from "../api/client";
import type { Goal } from "../types";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState("fitness");
  const [sport, setSport] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [description, setDescription] = useState("");

  const loadGoals = () => {
    client.get("/users/me/goals").then(({ data }) => setGoals(data));
  };

  useEffect(loadGoals, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await client.post("/users/me/goals", {
      title,
      goal_type: goalType,
      sport: sport || null,
      target_date: targetDate || null,
      description: description || null,
    });
    setTitle("");
    setGoalType("fitness");
    setSport("");
    setTargetDate("");
    setDescription("");
    setShowForm(false);
    loadGoals();
  };

  const handleDelete = async (id: string) => {
    await client.delete(`/users/me/goals/${id}`);
    loadGoals();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Goals</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> Add Goal</>}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <form onSubmit={handleSubmit} className="settings-form">
            <label>
              Title
              <input
                type="text"
                placeholder="e.g. Sub-4 Marathon"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label>
              Type
              <select value={goalType} onChange={(e) => setGoalType(e.target.value)}>
                <option value="fitness">General Fitness</option>
                <option value="race">Race</option>
                <option value="strength">Strength</option>
                <option value="habit">Habit</option>
              </select>
            </label>
            <label>
              Sport
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="">Any</option>
                <option value="running">Running</option>
                <option value="lifting">Lifting</option>
                <option value="cross_training">Cross Training</option>
              </select>
            </label>
            <label>
              Target Date (optional)
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
            <label>
              Description (optional)
              <textarea
                className="form-textarea"
                placeholder="Any details about this goal..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </label>
            <button type="submit" className="btn-primary">
              Create Goal
            </button>
          </form>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="empty-state">
          <Target size={32} />
          <p>No goals yet. Add a goal to help Chad create your training plan.</p>
        </div>
      ) : (
        <div className="goals-list">
          {goals.map((g) => (
            <div key={g.id} className="card goal-card">
              <div className="goal-header">
                <div>
                  <div className="goal-title">{g.title}</div>
                  <div className="goal-meta">
                    {g.goal_type}
                    {g.sport && ` / ${g.sport}`}
                    {g.target_date && ` — Target: ${g.target_date}`}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(g.id)}
                  className="btn-outline btn-sm btn-danger"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
              {g.description && (
                <p className="goal-description">{g.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
