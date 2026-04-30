import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../auth/AuthContext";
import StravaConnectButton from "../components/StravaConnectButton";

type Step = "profile" | "strava" | "goals" | "plan";

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("profile");
  const [stravaConnected, setStravaConnected] = useState(false);

  // Profile fields
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [timezone, setTimezone] = useState(user?.timezone || "America/New_York");
  const [units, setUnits] = useState(user?.units || "imperial");

  // Goal fields
  const [goalTitle, setGoalTitle] = useState("");
  const [goalType, setGoalType] = useState("fitness");
  const [goalSport, setGoalSport] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);

  // Plan generation
  const [generating, setGenerating] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const [planRationale, setPlanRationale] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    client.get("/strava/status").then(({ data }) => {
      setStravaConnected(data.connected);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("strava") === "connected") {
      setStravaConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
      setSyncing(true);
      client.post("/strava/sync").then(() => {
        const poll = setInterval(() => {
          client.get("/training/activities?limit=1").then(({ data }) => {
            if (data && data.length > 0) {
              clearInterval(poll);
              setSyncing(false);
            }
          });
        }, 2000);
        setTimeout(() => {
          clearInterval(poll);
          setSyncing(false);
        }, 60000);
      });
    }
  }, []);

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    await client.put("/users/me", {
      first_name: firstName || null,
      phone: phone || null,
      timezone,
      units,
    });
    await refreshUser();
    setStep("strava");
  };

  const handleStravaNext = () => {
    setStep("goals");
  };

  const saveCurrentGoal = async () => {
    if (!goalTitle.trim()) return;
    const { data } = await client.post("/users/me/goals", {
      title: goalTitle,
      goal_type: goalType,
      sport: goalSport || null,
      target_date: goalDate || null,
      description: goalDescription || null,
    });
    setGoals((prev) => [...prev, { id: data.id, title: data.title }]);
    setGoalTitle("");
    setGoalType("fitness");
    setGoalSport("");
    setGoalDate("");
    setGoalDescription("");
    return data;
  };

  const handleAddGoal = async (e: FormEvent) => {
    e.preventDefault();
    await saveCurrentGoal();
  };

  const handleGoalsNext = async () => {
    if (goals.length === 0 && goalTitle.trim()) {
      await saveCurrentGoal();
    }
    setStep("plan");
  };

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      const { data } = await client.post("/training/generate");
      setPlanRationale(data.rationale || null);
      setPlanReady(true);
    } catch {
      alert("Plan generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleFinish = async () => {
    await client.put("/users/me", { onboarding_complete: true });
    await refreshUser();
    navigate("/");
  };

  const stepIndex = ["profile", "strava", "goals", "plan"].indexOf(step);

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <div className="onboarding-header">
          <h1>Welcome to Chad</h1>
          <p className="muted">Let's set up your AI coaching in a few steps.</p>
        </div>

        <div className="progress-bar">
          {["Profile", "Strava", "Goals", "Plan"].map((label, i) => (
            <div
              key={label}
              className={`progress-step ${i <= stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
            >
              <div className="step-dot">{i < stepIndex ? "✓" : i + 1}</div>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>

        {step === "profile" && (
          <div className="onboarding-card">
            <h2>About You</h2>
            <form onSubmit={handleProfileSave} className="settings-form">
              <label>
                First Name
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                Phone (for SMS coaching)
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+14155551234"
                />
              </label>
              <label>
                Timezone
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <option value="America/New_York">Eastern</option>
                  <option value="America/Chicago">Central</option>
                  <option value="America/Denver">Mountain</option>
                  <option value="America/Los_Angeles">Pacific</option>
                  <option value="America/Anchorage">Alaska</option>
                  <option value="Pacific/Honolulu">Hawaii</option>
                </select>
              </label>
              <label>
                Units
                <select value={units} onChange={(e) => setUnits(e.target.value)}>
                  <option value="imperial">Imperial (mi, lbs)</option>
                  <option value="metric">Metric (km, kg)</option>
                </select>
              </label>
              <button type="submit" className="btn-primary">Continue</button>
            </form>
          </div>
        )}

        {step === "strava" && (
          <div className="onboarding-card">
            <h2>Connect Strava</h2>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              Connect your Strava account so Chad can see your activities and
              build a plan around your real training data.
            </p>
            <StravaConnectButton
              connected={stravaConnected}
              onDisconnect={() => setStravaConnected(false)}
            />
            {syncing && (
              <p className="muted" style={{ marginTop: "1rem" }}>
                Syncing your activities from Strava...
              </p>
            )}
            <div className="onboarding-actions">
              <button
                onClick={handleStravaNext}
                disabled={!stravaConnected || syncing}
                className="btn-primary"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "goals" && (
          <div className="onboarding-card">
            <h2>Set Your Goals</h2>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              Add at least one goal so Chad knows what to train you for.
            </p>

            {goals.length > 0 && (
              <div className="onboarding-goals-list">
                {goals.map((g) => (
                  <div key={g.id} className="onboarding-goal-chip">{g.title}</div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddGoal} className="settings-form">
              <label>
                Goal Title
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g. Sub-4 Marathon, Bench 225"
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
                <select value={goalSport} onChange={(e) => setGoalSport(e.target.value)}>
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
                  value={goalDate}
                  onChange={(e) => setGoalDate(e.target.value)}
                />
              </label>
              <label>
                Description (optional)
                <textarea
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder="Any extra details..."
                  rows={2}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "0.625rem 0.75rem",
                    color: "var(--text)",
                    fontSize: "0.925rem",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </label>
              <button type="submit" className="btn-outline">
                + Add Goal
              </button>
            </form>

            <div className="onboarding-actions">
              <button
                onClick={handleGoalsNext}
                disabled={goals.length === 0 && !goalTitle.trim()}
                className="btn-primary"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "plan" && (
          <div className="onboarding-card" style={{ textAlign: "center" }}>
            <h2>Generate Your Plan</h2>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              Chad will analyze your goals and Strava data to build a
              personalized training plan.
            </p>

            {!planReady ? (
              <>
                <button
                  onClick={handleGeneratePlan}
                  disabled={generating}
                  className="btn-primary"
                  style={{ fontSize: "1.1rem", padding: "0.875rem 2rem" }}
                >
                  {generating ? "Generating..." : "Generate My Plan"}
                </button>
                {generating && (
                  <p className="muted" style={{ marginTop: "1rem" }}>
                    Chad is building your plan. This may take 15-20 seconds...
                  </p>
                )}
              </>
            ) : (
              <>
                <p style={{ marginBottom: "1rem", color: "var(--success)", fontWeight: 600 }}>
                  Your training plan is ready!
                </p>
                {planRationale && (
                  <div className="rationale-card" style={{ textAlign: "left", marginBottom: "1.5rem" }}>
                    <div className="rationale-toggle" style={{ cursor: "default" }}>
                      <span>Coach's Notes</span>
                    </div>
                    <div className="rationale-body">{planRationale}</div>
                  </div>
                )}
                <button onClick={handleFinish} className="btn-primary" style={{ fontSize: "1.1rem", padding: "0.875rem 2rem" }}>
                  Go to Dashboard
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
