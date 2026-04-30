import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await register(email, password, firstName);
      navigate("/");
    } catch {
      setError("Registration failed. Email may already be in use.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="hero-brand"><span>Chad</span></div>
        <p className="hero-tagline">
          AI-powered coaching that adapts to your runs, lifts, and life.
        </p>
        <div className="hero-features">
          <div className="hero-feature">
            <div className="hero-feature-icon">&#x1F3C3;</div>
            <div className="hero-feature-text">
              <strong>Strava-connected</strong>
              <span>Auto-syncs your runs, rides, and workouts</span>
            </div>
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">&#x1F9E0;</div>
            <div className="hero-feature-text">
              <strong>AI that coaches</strong>
              <span>Personalized plans that adjust week to week</span>
            </div>
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">&#x1F4F1;</div>
            <div className="hero-feature-text">
              <strong>Text your coach</strong>
              <span>Get advice via SMS or web chat, anytime</span>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-form-side">
        <div className="auth-card">
          <h1>Get started</h1>
          <p className="subtitle">Create your account to start training</p>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            {error && <p className="error">{error}</p>}
            <button type="submit">Create Account</button>
          </form>
          <p className="switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
