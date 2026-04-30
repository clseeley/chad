import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><span>Chad</span></div>
        <p className="tagline">AI-powered fitness coaching</p>

        <h1>Welcome back</h1>
        <p className="subtitle">Log in to continue training</p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">Log In</button>
        </form>
        <p className="switch">
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>

        <div className="auth-divider" />
        <div className="auth-features">
          <div className="auth-feature">
            <div className="auth-feature-icon">&#x1F3C3;</div>
            <div className="auth-feature-label">Strava sync</div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon">&#x1F9E0;</div>
            <div className="auth-feature-label">AI plans</div>
          </div>
          <div className="auth-feature">
            <div className="auth-feature-icon">&#x1F4F1;</div>
            <div className="auth-feature-label">SMS coaching</div>
          </div>
        </div>
      </div>
    </div>
  );
}
