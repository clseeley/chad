import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import ChatPanel from "./ChatPanel";

export default function Layout() {
  const { user, logout } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className={`layout ${chatOpen ? "chat-open" : ""}`}>
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h2><span className="brand-gradient">Chad</span></h2>
        </div>
        <div className="sidebar-links">
          <NavLink to="/" onClick={() => setChatOpen(false)}>
            <span className="nav-icon">🏠</span> Dashboard
          </NavLink>
          <NavLink to="/plan" onClick={() => setChatOpen(false)}>
            <span className="nav-icon">📋</span> Training Plan
          </NavLink>
          <NavLink to="/activities" onClick={() => setChatOpen(false)}>
            <span className="nav-icon">⚡</span> Activities
          </NavLink>
          <NavLink to="/goals" onClick={() => setChatOpen(false)}>
            <span className="nav-icon">🎯</span> Goals
          </NavLink>
          <NavLink to="/settings" onClick={() => setChatOpen(false)}>
            <span className="nav-icon">⚙️</span> Settings
          </NavLink>
          <button
            className={`sidebar-chat-btn ${chatOpen ? "active" : ""}`}
            onClick={() => setChatOpen(!chatOpen)}
          >
            <span className="nav-icon">💬</span> Chat
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="user-name">{user?.first_name || user?.email}</span>
          <button onClick={logout} className="logout-btn">
            Log out
          </button>
        </div>
      </nav>
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
