import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Activity,
  Target,
  Settings,
  MessageSquare,
  LogOut,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import ChatPanel from "./ChatPanel";
import ChatFab from "./ChatFab";

export default function Layout() {
  const { user, logout } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);

  const initials = user?.first_name
    ? user.first_name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "?";

  return (
    <div className={`layout ${chatOpen ? "chat-open" : ""}`}>
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h2><span className="brand-gradient">Chad</span></h2>
        </div>
        <div className="sidebar-links">
          <NavLink to="/" onClick={() => setChatOpen(false)}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/plan" onClick={() => setChatOpen(false)}>
            <ClipboardList size={18} />
            <span>Training Plan</span>
          </NavLink>
          <NavLink to="/activities" onClick={() => setChatOpen(false)}>
            <Activity size={18} />
            <span>Activities</span>
          </NavLink>
          <NavLink to="/goals" onClick={() => setChatOpen(false)}>
            <Target size={18} />
            <span>Goals</span>
          </NavLink>
          <NavLink to="/settings" onClick={() => setChatOpen(false)}>
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
          <button
            className={`sidebar-chat-btn ${chatOpen ? "active" : ""}`}
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </button>
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <span className="user-name">{user?.first_name || user?.email}</span>
          </div>
          <button onClick={logout} className="logout-btn">
            <LogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      </nav>
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <main className="content">
        <Outlet />
      </main>
      <ChatFab visible={!chatOpen} onClick={() => setChatOpen(true)} />
    </div>
  );
}
