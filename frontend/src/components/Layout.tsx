import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h2>Chad</h2>
        </div>
        <div className="sidebar-links">
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/plan">Training Plan</NavLink>
          <NavLink to="/activities">Activities</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          <NavLink to="/goals">Goals</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </div>
        <div className="sidebar-footer">
          <span className="user-name">{user?.first_name || user?.email}</span>
          <button onClick={logout} className="logout-btn">
            Log out
          </button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
