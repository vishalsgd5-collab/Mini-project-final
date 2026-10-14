import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { IconMark } from "../components/Icons";

export default function Auth({ mode }) {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(mode === "login" ? "demo@aura.health" : "");
  const [password, setPassword] = useState(mode === "login" ? "aura1234" : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app/monitor" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      nav("/app/monitor");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="brand"><IconMark /> AURA</div>
        <h2>A quieter kind of productivity.</h2>
        <p className="muted">
          {mode === "login"
            ? "The demo account is preloaded with a week of fatigue physiology so the dashboard is alive on first glance."
            : "Create a studio. Your webcam never uploads a frame — only blink rates, posture angles and cadence."}
        </p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>{mode === "login" ? "Enter the studio" : "Open a studio"}</h1>
        <p className="muted">{mode === "login" ? "Welcome back." : "Two minutes to set up. A lifetime of fewer crashes."}</p>
        {mode === "register" && (
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        {err && <div className="err">{err}</div>}
        <div style={{ marginTop: 22 }}>
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
        <p className="hint">
          {mode === "login" ? (
            <>No studio yet? <Link to="/register">Register</Link></>
          ) : (
            <>Already here? <Link to="/login">Sign in</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
