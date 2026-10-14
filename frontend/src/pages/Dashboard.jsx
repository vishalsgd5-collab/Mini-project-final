import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";

const tip = {
  contentStyle: {
    background: "#12241c",
    border: "1px solid rgba(212,179,122,0.2)",
    borderRadius: 12,
    color: "#f3eee4",
  },
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    async function load() {
      try {
        const d = await api("/api/dashboard/overview");
        if (on) setData(d);
      } catch (e) {
        if (on) setErr(e.message);
      }
    }
    load();
    const id = setInterval(load, 4000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, []);

  if (err) return <div className="center">{err}</div>;
  if (!data) return <div className="center">Waiting for live samples…</div>;

  const t = data.today;
  const timeline = data.timeline.map((p, i) => ({
    i,
    score: p.score ?? p.fatigue_score ?? 0,
    blink: p.blink_rate ?? 0,
  }));
  const empty = !t.samples;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Daily pulse</h1>
          <p>{data.insight}</p>
        </div>
        <span className="pill live">live camera only</span>
      </div>

      {empty && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>No webcam samples yet</h3>
          <p className="muted">
            Graphs, wellness index and break counts stay at zero until Live iris
            locks onto your face. Lab-mode simulation is never written here.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link className="btn btn-gold" to="/app/monitor">Open Live iris</Link>
          </div>
        </div>
      )}

      <div className="dash-hero">
        <div className="wellness">
          <small className="muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}>Wellness index</small>
          <div><b>{empty ? "—" : t.wellness}</b></div>
          <p className="muted" style={{ marginTop: 8 }}>Built only from your blinks, posture, screen time and completed pauses.</p>
        </div>
        <div className="kpis">
          <div className="card kpi"><small>Fatigue today</small><b>{empty ? "—" : t.fatigue_score}</b><em>peak {empty ? "—" : t.peak_fatigue}</em></div>
          <div className="card kpi"><small>Screen</small><b>{empty ? "—" : `${Math.round(t.screen_minutes)}m`}</b><em>{t.samples} live samples</em></div>
          <div className="card kpi"><small>Blink rate</small><b>{empty ? "—" : t.blink_rate}</b><em>/ minute</em></div>
          <div className="card kpi"><small>Typing speed</small><b>{empty ? "—" : Math.round(t.typing_wpm || 0)}</b><em>WPM from live keys</em></div>
          <div className="card kpi"><small>Breaks</small><b>{t.breaks}</b><em>{t.skipped} skipped · {t.detections} detections</em></div>
        </div>
      </div>

      <div className="card chart-card">
        <h3>Fatigue score · live camera</h3>
        <div style={{ height: 240 }}>
          {timeline.length < 2 ? (
            <p className="muted">The line appears after two real face samples.</p>
          ) : (
            <ResponsiveContainer>
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4b37a" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#d4b37a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(212,179,122,0.08)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis domain={[0, 100]} stroke="#c5d5cc" tick={{ fill: "#c5d5cc", fontSize: 11 }} />
                <Tooltip {...tip} />
                <Area type="monotone" dataKey="score" stroke="#d4b37a" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="two">
        <div className="card chart-card">
          <h3>Blink rate · live camera</h3>
          <div style={{ height: 240 }}>
            {timeline.length < 2 ? (
              <p className="muted">Sit in frame on Live iris to fill this chart.</p>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={timeline}>
                  <CartesianGrid stroke="rgba(212,179,122,0.08)" vertical={false} />
                  <XAxis dataKey="i" hide />
                  <YAxis stroke="#c5d5cc" tick={{ fill: "#c5d5cc", fontSize: 11 }} />
                  <Tooltip {...tip} />
                  <Area type="monotone" dataKey="blink" stroke="#8fb89a" fill="rgba(143,184,154,0.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="card">
          <h3 className="plain">Rituals today</h3>
          <div className="break-list">
            {data.recent_breaks.length === 0 && <p className="muted">No pauses yet — they appear when your live score crosses the threshold.</p>}
            {data.recent_breaks.map((b) => (
              <div className="break-row" key={b.id}>
                <span>{b.title}</span>
                <span className={`tag ${b.status === "completed" ? "" : "skip"}`}>{b.status}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <Link className="btn btn-ghost" to="/app/settings">Install Guardian for all websites</Link>
          </div>
        </div>
      </div>

      {!empty && (
        <div className="card chart-card" style={{ marginTop: 16 }}>
          <h3>Seven-day load (your camera days only)</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={data.week}>
                <CartesianGrid stroke="rgba(212,179,122,0.08)" vertical={false} />
                <XAxis dataKey="label" stroke="#c5d5cc" tick={{ fill: "#c5d5cc" }} />
                <YAxis stroke="#c5d5cc" tick={{ fill: "#c5d5cc", fontSize: 11 }} />
                <Tooltip {...tip} />
                <Bar dataKey="avg_fatigue" fill="#8fb89a" radius={[8, 8, 0, 0]} />
                <Bar dataKey="breaks" fill="#d4b37a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
