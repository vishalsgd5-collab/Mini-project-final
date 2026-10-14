import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { enableAlerts } from "../lib/notify";

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
          <p>Desktop alerts and the Guardian extension are how rituals leave this tab.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18, maxWidth: 640 }}>
        <div className="cat">background · every website · every app</div>
        <h3>AURA Guardian</h3>
        <p>
          A website cannot run your webcam after Chrome is closed, and it cannot draw on
          other sites by itself. Install the unpacked Chrome extension in this repo’s
          <b> extension</b> folder, then leave Live iris open.
        </p>
        <ol className="steps">
          <li>Chrome → chrome://extensions → Developer mode ON</li>
          <li>Load unpacked → choose the <code>extension</code> folder</li>
          <li>Click Enable desktop alerts below, and Allow the camera on Live iris</li>
          <li>Keep that tab open (minimized is fine). Rituals then appear on YouTube, Gmail, docs — and as a Windows toast over Word or Zoom</li>
        </ol>
        <button
          className="btn btn-gold"
          type="button"
          onClick={async () => {
            const { testWindowsAlert } = await import("../lib/notify");
            const ok = await testWindowsAlert();
            if (!ok) window.alert("Allow notifications in Chrome (address-bar lock icon) and Windows Settings → Notifications → Google Chrome.");
          }}
        >
          Test Windows popup
        </button>
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
          Signed in as {user.email}. Video stays on this device. Dashboard graphs use live
          camera samples only — never lab-mode simulation.
        </p>
      </form>
    </>
  );
}
