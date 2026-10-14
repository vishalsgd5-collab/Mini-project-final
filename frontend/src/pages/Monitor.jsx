import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Gauge from "../components/Gauge";
import Wave from "../components/Wave";
import { Offer, Ritual } from "../components/Intervention";
import { useActivity } from "../hooks/useActivity";
import { useFaceMesh } from "../hooks/useFaceMesh";

function useLabLive(active) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!active) {
      setLive(null);
      return undefined;
    }
    const t0 = performance.now();
    const id = setInterval(() => {
      const m = (performance.now() - t0) / 60000;
      const wave = 0.5 + 0.5 * Math.sin(m / 1.8);
      const latent = Math.min(0.92, 0.18 + m * 0.28 + 0.16 * wave);
      setLive({
        ear: 0.30 - 0.12 * latent,
        earStd: 0.02 + 0.05 * latent,
        blinkRate: 17 - 8 * latent,
        perclos: 0.06 + 0.32 * latent,
        pitch: -4 - 18 * latent,
        yaw: Math.sin(m * 3) * 6,
        roll: Math.sin(m * 2) * 3,
        mar: 0.05 + (latent > 0.6 ? 0.12 : 0),
        yawns: Math.floor(latent * 3),
        slouch: 0.1 + 0.65 * latent,
        present: true,
        blinks: Math.floor(m * 14),
        fps: 0,
      });
    }, 400);
    return () => clearInterval(id);
  }, [active]);
  return live;
}

export default function Monitor() {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(true);
  const { status, error, live: camLive } = useFaceMesh({
    videoRef,
    canvasRef,
    enabled: running && user?.enable_camera !== false,
  });
  const labLive = useLabLive(running && status === "lab");
  const live = status === "lab" ? labLive : camLive;
  const activity = useActivity(running && user?.enable_keyboard !== false);
  const [sessionId, setSessionId] = useState(null);
  const [pred, setPred] = useState(null);
  const [offer, setOffer] = useState(null);
  const [ritual, setRitual] = useState(null);
  const [ears, setEars] = useState([]);
  const startedAt = useRef(performance.now());
  const lastBreak = useRef(0);
  const busy = useRef(false);
  const blinkTotal = useRef(0);
  const liveRef = useRef(live);
  const activityRef = useRef(activity);
  const ritualRef = useRef(ritual);
  const offerRef = useRef(offer);
  liveRef.current = live;
  activityRef.current = activity;
  ritualRef.current = ritual;
  offerRef.current = offer;

  useEffect(() => {
    let id;
    (async () => {
      const s = await api("/api/sessions/start", { method: "POST" });
      id = s.session_id;
      setSessionId(s.session_id);
    })();
    startedAt.current = performance.now();
    return () => {
      if (id) {
        const minutes = (performance.now() - startedAt.current) / 60000;
        api("/api/sessions/end", {
          method: "POST",
          body: { session_id: id, screen_minutes: minutes, blink_total: blinkTotal.current },
        }).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!running || !sessionId) return undefined;
    const tick = async () => {
      const snapshot = liveRef.current;
      if (busy.current || ritualRef.current || !snapshot) return;
      busy.current = true;
      const sessionMin = (performance.now() - startedAt.current) / 60000;
      const hour = new Date().getHours() + new Date().getMinutes() / 60;
      const act = activityRef.current;
      blinkTotal.current = snapshot.blinks || blinkTotal.current;
      setEars((xs) => [...xs.slice(-80), snapshot.ear || 0.25]);
      try {
        const body = {
          blink_rate: snapshot.blinkRate,
          perclos: snapshot.perclos,
          avg_ear: snapshot.ear,
          ear_std: snapshot.earStd || 0.03,
          head_pitch: snapshot.pitch,
          head_yaw: snapshot.yaw,
          head_roll: snapshot.roll,
          mar: snapshot.mar,
          yawn_count: snapshot.yawns,
          typing_rpm: user?.enable_keyboard === false ? 0 : act.typingRpm,
          mouse_intensity: user?.enable_mouse === false ? 0 : act.mouseIntensity,
          idle_ratio: act.idleRatio,
          continuous_screen_min: sessionMin,
          hour_of_day: hour,
          session_min: sessionMin,
          posture_slouch: snapshot.slouch,
          look_away_ratio: act.lookAwayRatio,
          session_id: sessionId,
        };
        const out = await api("/api/fatigue/predict", { method: "POST", body });
        setPred(out);
        if (out.intervention && !offerRef.current && !ritualRef.current && performance.now() - lastBreak.current > 20000) {
          setOffer(out.intervention);
        }
      } catch (err) {
        console.warn(err);
      } finally {
        busy.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [running, sessionId, user]);

  async function feedback(status, extra = {}) {
    const eventId = (ritual || offer)?.event_id;
    if (eventId) {
      await api("/api/interventions/feedback", {
        method: "POST",
        body: { event_id: eventId, status, fatigue_after: extra.fatigue_after ?? pred?.fatigue_score },
      }).catch(() => {});
    }
    lastBreak.current = performance.now();
    setOffer(null);
    setRitual(null);
  }

  const score = pred?.fatigue_score ?? 18;
  const level = pred?.level ?? "alert";
  const hud = status === "live" ? "live camera" : status === "lab" ? "lab mode" : status === "loading" ? "opening iris" : "idle";

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Live iris</h1>
          <p>Numeric features only. The frame never leaves this browser.</p>
        </div>
        <button className={running ? "btn btn-danger" : "btn btn-gold"} onClick={() => setRunning((v) => !v)}>
          {running ? "Pause" : "Resume"}
        </button>
      </div>

      <div className="monitor">
        <div>
          <div className="stage">
            <video ref={videoRef} playsInline muted />
            <canvas ref={canvasRef} />
            <div className="stage-hud">
              <span className={`pill ${status === "live" ? "live" : status === "lab" ? "lab" : ""}`}>{hud}</span>
              <span className="pill">
                {live?.present ? "face locked" : "searching"} · EAR {(live?.ear || 0).toFixed(2)}
              </span>
            </div>
          </div>
          {error && (
            <p className="muted" style={{ marginTop: 10 }}>
              Camera unavailable ({error}). Running a physiological lab simulation so scoring, the bandit and the dashboard still work.
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <Wave values={ears} />
          </div>
        </div>

        <div className="side">
          <div className="card gauge-card">
            <Gauge value={score} level={level} />
            <div className="level">{Math.round((pred?.confidence || 0.7) * 100)}% confidence</div>
          </div>
          <div className="metrics">
            <div className="metric"><small>Blinks / min</small><b>{(live?.blinkRate || 0).toFixed(0)}</b></div>
            <div className="metric"><small>PERCLOS</small><b>{(((live?.perclos || 0) * 100).toFixed(0))}%</b></div>
            <div className="metric"><small>Head pitch</small><b>{(live?.pitch || 0).toFixed(0)}°</b></div>
            <div className="metric"><small>Slouch</small><b>{(((live?.slouch || 0) * 100).toFixed(0))}%</b></div>
            <div className="metric"><small>Typing</small><b>{activity.typingRpm}</b></div>
            <div className="metric"><small>Session</small><b>{(((performance.now() - startedAt.current) / 60000).toFixed(0))}m</b></div>
          </div>
          <div className="drivers">
            {(pred?.drivers || []).map((d) => (
              <div className="driver" key={d.key}>
                <i style={{ opacity: 0.4 + 0.6 * d.weight }} />
                <div>
                  <strong>{d.label}</strong>
                  <span>{d.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {offer && !ritual && (
        <Offer
          item={offer}
          onStart={() => {
            setRitual(offer);
            setOffer(null);
          }}
          onDismiss={() => feedback("dismissed")}
        />
      )}
      {ritual && (
        <Ritual
          item={ritual}
          onDone={() => feedback("completed")}
          onSkip={() => feedback("skipped")}
        />
      )}
    </>
  );
}
