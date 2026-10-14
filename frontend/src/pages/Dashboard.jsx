import { useEffect, useState } from "react";
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
    api("/api/dashboard/overview")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="center">{err}</div>;
  if (!data) return <div className="center">Gathering the week…</div>;

  const t = data.today;
  const hourly = data.hourly.filter((h) => h.score !== null);
  const timeline = data.timeline.map((p, i) => ({ i, ...p }));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Daily pulse</h1>
          <p>{data.insight}</p>
        </div>
      </div>

      <div className="dash-hero">
        <div className="wellness">
          <small className="muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase" }}>Wellness index</small>
          <div><b>{t.wellness}</b></div>
          <p className="muted" style={{ marginTop: 8 }}>A composite of fatigue, blinks, breaks honoured and screen load.</p>
        </div>
        <div className="kpis">
          <div className="card kpi"><small>Fatigue today</small><b>{t.fatigue_score}</b><em>peak {t.peak_fatigue}</em></div>
          <div className="card kpi"><small>Screen</small><b>{Math.round(t.screen_minutes)}m</b><em>{t.samples} samples</em></div>
          <div className="card kpi"><small>Blink rate</small><b>{t.blink_rate}</b><em>/ minute</em></div>
          <div className="card kpi"><small>Breaks</small><b>{t.breaks}</b><em>{t.skipped} skipped · {t.detections} detections</em></div>
        </div>
      </div>

      <div className="card chart-card">
        <h3>Fatigue score over the session</h3>
        <div style={{ height: 240 }}>
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
        </div>
      </div>

      <div className="two">
        <div className="card chart-card">
          <h3>Seven-day load</h3>
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
        <div className="card">
          <h3 className="plain">Rituals today</h3>
          <div className="break-list">
            {data.recent_breaks.length === 0 && <p className="muted">No pauses yet today.</p>}
            {data.recent_breaks.map((b) => (
              <div className="break-row" key={b.id}>
                <span>{b.title}</span>
                <span className={`tag ${b.status === "completed" ? "" : "skip"}`}>{b.status}</span>
              </div>
            ))}
          </div>
          {hourly.length > 0 && (
            <p className="muted" style={{ marginTop: 18 }}>
              Afternoon physiology still dominates most days — the 14:00 circadian dip is visible in the model’s hour feature.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
