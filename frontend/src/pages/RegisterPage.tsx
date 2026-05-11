import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, Brain, Smartphone } from "lucide-react";
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
      <div className="auth-card">
        <div className="auth-brand"><span>Chad</span></div>
        <p className="tagline">AI-powered fitness coaching</p>

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

        <div className="auth-divider" />
        <div className="auth-features">
          <div className="auth-feature">
            <div className="auth-feature-icon"><Activity size={20} /></div>
            <div className="auth-feature-label">Strava sync</div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon"><Brain size={20} /></div>
            <div className="auth-feature-label">AI plans</div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon"><Smartphone size={20} /></div>
            <div className="auth-feature-label">SMS coaching</div>
          </div>
        </div>
      </div>
    </div>
  );
}
