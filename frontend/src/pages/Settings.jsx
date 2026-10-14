import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Settings() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user.name,
    work_start_hour: user.work_start_hour,
    work_end_hour: user.work_end_hour,
    break_sensitivity: user.break_sensitivity,
    enable_camera: user.enable_camera,
    enable_keyboard: user.enable_keyboard,
    enable_mouse: user.enable_mouse,
  });
  const [msg, setMsg] = useState("");

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    const next = await api("/api/auth/settings", { method: "PATCH", body: form });
    setUser(next);
    setMsg("Saved.");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Studio settings</h1>
          <p>Sensitivity changes the fatigue threshold the bandit must clear before it interrupts.</p>
        </div>
      </div>
      <form className="settings" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <div className="row">
          <label className="field">
            <span>Work starts</span>
            <input type="number" min={0} max={23} value={form.work_start_hour} onChange={(e) => set("work_start_hour", Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Work ends</span>
            <input type="number" min={0} max={23} value={form.work_end_hour} onChange={(e) => set("work_end_hour", Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Break sensitivity</span>
          <select value={form.break_sensitivity} onChange={(e) => set("break_sensitivity", e.target.value)}>
            <option value="gentle">Gentle — only when score ≥ 68</option>
            <option value="balanced">Balanced — score ≥ 52</option>
            <option value="assertive">Assertive — score ≥ 40</option>
          </select>
        </label>
        {[
          ["enable_camera", "Webcam / Face Mesh"],
          ["enable_keyboard", "Typing cadence"],
          ["enable_mouse", "Mouse intensity"],
        ].map(([key, label]) => (
          <label className="toggle" key={key}>
            <span>{label}</span>
            <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
          </label>
        ))}
        <button className="btn btn-gold" type="submit">Save</button>
        {msg && <p className="muted">{msg}</p>}
        <p className="muted">
          Signed in as {user.email}. Video is processed on-device with MediaPipe Face Mesh.
          The API receives only the 17 numeric features used by LightGBM.
        </p>
      </form>
    </>
  );
}
