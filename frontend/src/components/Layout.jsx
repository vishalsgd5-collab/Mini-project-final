import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useEmberReminders } from "../pages/Docket";
import { IconCog, IconDocket, IconEye, IconLeaf, IconMark, IconPulse } from "./Icons";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const initial = (user?.name || "A").slice(0, 1).toUpperCase();
  useEmberReminders();

  return (
    <div className="shell">
      <aside className="rail">
        <NavLink to="/" title="AURA">
          <IconMark />
        </NavLink>
        <nav>
          <NavLink to="/app/monitor" title="Live monitor" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconEye />
          </NavLink>
          <NavLink to="/app/dashboard" title="Wellness pulse" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconPulse />
          </NavLink>
          <NavLink to="/app/docket" title="Ember Docket" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconDocket />
          </NavLink>
          <NavLink to="/app/library" title="Rituals" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconLeaf />
          </NavLink>
          <NavLink to="/app/settings" title="Settings" className={({ isActive }) => (isActive ? "active" : "")}>
            <IconCog />
          </NavLink>
        </nav>
        <div className="spacer" />
        <button
          className="icon-btn"
          title="Sign out"
          onClick={() => {
            logout();
            nav("/");
          }}
        >
          <div className="avatar">{initial}</div>
        </button>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
