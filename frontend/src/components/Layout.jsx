import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useEmberReminders } from "../pages/Docket";
import { IconCog, IconDocket, IconEye, IconLeaf, IconMark, IconPulse } from "./Icons";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const initial = (user?.name || "A").slice(0, 1).toUpperCase();
  const { reminder, dismissReminder } = useEmberReminders();

  return (
    <div className="shell">
      <aside className="rail">
        <NavLink to="/" title="AURA">
          <IconMark />
        </NavLink>
        <nav>
          <NavLink to="/app/monitor" title="Aura" className={({ isActive }) => (isActive ? "active" : "")}>
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
      {reminder && <aside role="alert" className="card" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 9999, maxWidth: 360 }}>
        <div className="kicker">Ember Docket · due now</div>
        <h3>{reminder.title}</h3>
        <p>{reminder.note || "Your scheduled task is ready."}</p>
        <button className="btn btn-gold" onClick={() => { dismissReminder(); nav("/app/docket"); }}>View schedule</button>
        <button className="btn btn-ghost" onClick={dismissReminder}>Dismiss</button>
      </aside>}
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
