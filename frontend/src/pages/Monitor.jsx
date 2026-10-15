import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { tellBeep, tellLive, tellStopBeep } from "../lib/bridge";
import { enableAlerts, pushRitual, pushWindows, testWindowsAlert } from "../lib/notify";
import { isSoundOn, playAlarmBeep, playFatigueBeep, playRitualChime, setSoundOn, unlockAudio } from "../lib/sound";
import Gauge from "../components/Gauge";
import Wave from "../components/Wave";
import { Offer, Ritual } from "../components/Intervention";
import { useActivity } from "../hooks/useActivity";
import { useFaceMesh } from "../hooks/useFaceMesh";
import { startGuardian } from "../lib/pip";

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
  const [retryToken, setRetryToken] = useState(0);
  const [glassesMode, setGlassesMode] = useState(() => localStorage.getItem("aura_glasses") === "1");
  const { status, error, live: camLive, calibrate, camOn } = useFaceMesh({
    videoRef,
    canvasRef,
    enabled: running && user?.enable_camera !== false,
    retryToken,
    glassesMode,
  });
  const labLive = useLabLive(running && status === "lab");
  const live = status === "lab" ? labLive : camLive;
  const activity = useActivity(running && user?.enable_keyboard !== false);
  const [sessionId, setSessionId] = useState(null);
  const [pred, setPred] = useState(null);
  const [offer, setOffer] = useState(null);
  const [ritual, setRitual] = useState(null);
  const [ears, setEars] = useState([]);
  const [alertState, setAlertState] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [extTyping, setExtTyping] = useState({ wpm: 0, rpm: 0 });
  const [sound, setSound] = useState(isSoundOn());
  const [hint, setHint] = useState("");
  const [flash, setFlash] = useState(false);
  const [fatigueHold, setFatigueHold] = useState(0);
  const [recap, setRecap] = useState(null);
  const [awaySec, setAwaySec] = useState(0);
  const [alarmOn, setAlarmOn] = useState(false);
  const lastFatiguePing = useRef(0);
  const fatigueSince = useRef(null);
  const lastBeep = useRef(0);
  const snoozeUntil = useRef(0);
  const predRef = useRef(null);
  const startedAt = useRef(performance.now());
  const lastBreak = useRef(0);
  const busy = useRef(false);
  const blinkTotal = useRef(0);
  const liveRef = useRef(live);
  const activityRef = useRef(activity);
  const ritualRef = useRef(ritual);
  const offerRef = useRef(offer);
  const statusRef = useRef(status);
  liveRef.current = live;
  activityRef.current = activity;
  ritualRef.current = ritual;
  offerRef.current = offer;
  statusRef.current = status;
  predRef.current = pred;
  const runningRef = useRef(running);
  runningRef.current = running;
  const alarmOnRef = useRef(false);
  const absentSince = useRef(null);
  const beepLoop = useRef(null);
  const pipOnce = useRef(false);

  function startAwayAlarm() {
    if (alarmOnRef.current) return;
    alarmOnRef.current = true;
    setAlarmOn(true);
    unlockAudio();
    playAlarmBeep();
    pushWindows(
      "AURA · away from camera 5 minutes",
      "No face in view. Click Stop alarm on Live iris to silence this. It will not stop by itself.",
      "aura-away"
    );
    beepLoop.current = window.setInterval(() => {
      playAlarmBeep();
    }, 1400);
  }

  function stopAwayAlarm() {
    alarmOnRef.current = false;
    setAlarmOn(false);
    if (beepLoop.current) {
      window.clearInterval(beepLoop.current);
      beepLoop.current = null;
    }
    tellStopBeep();
    absentSince.current = liveRef.current?.present ? null : performance.now();
    setAwaySec(0);
    setHint("Alarm stopped. 5-minute away timer reset.");
  }

  useEffect(() => {
    enableAlerts();
    let lock;
    async function wake() {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* unsupported */
      }
    }
    wake();
    const onVis = () => {
      videoRef.current?.play?.().catch(() => {});
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVis);
    const onTypeMsg = (e) => {
      if (e.data?.type === "AURA_TYPING") {
        setExtTyping({ wpm: e.data.wpm || 0, rpm: e.data.rpm || 0 });
      }
    };
    window.addEventListener("message", onTypeMsg);
    const flash = (msg) => {
      setHint(msg);
      window.setTimeout(() => setHint(""), 2200);
    };
    const onKey = (e) => {
      if (e.repeat) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "F8") {
        e.preventDefault();
        const next = !isSoundOn();
        setSoundOn(next);
        setSound(next);
        unlockAudio();
        flash(next ? "Beep ON — F8 to mute" : "Beep OFF — F8 to turn back on. Windows toasts stay on.");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        snoozeUntil.current = performance.now() + 5 * 60 * 1000;
        fatigueSince.current = null;
        setFatigueHold(0);
        flash("Snoozed 5 minutes — Esc again later if needed.");
      }
    };
    window.addEventListener("keydown", onKey);
    let id;
    (async () => {
      const s = await api("/api/sessions/start", { method: "POST" });
      id = s.session_id;
      setSessionId(s.session_id);
    })();
    startedAt.current = performance.now();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("message", onTypeMsg);
      window.removeEventListener("keydown", onKey);
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
      if (id) {
        const minutes = (performance.now() - startedAt.current) / 60000;
        api("/api/sessions/end", {
          method: "POST",
          body: { session_id: id, screen_minutes: minutes, blink_total: blinkTotal.current },
        }).catch(() => {});
      }
      if (beepLoop.current) window.clearInterval(beepLoop.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const score = predRef.current?.fatigue_score ?? 0;
      const watching = statusRef.current === "live" || statusRef.current === "lab";
      if (runningRef.current && watching && score >= 50) {
        if (!fatigueSince.current) fatigueSince.current = performance.now();
        const held = (performance.now() - fatigueSince.current) / 1000;
        setFatigueHold(held);
        document.title = `AURA · ${Math.round(score)} · ${Math.floor(held)}s fatigue`;
        const microsleep = (liveRef.current?.closedMs || 0) > 1000;
        if (
          (held >= 30 || microsleep) &&
          performance.now() - lastBeep.current > (microsleep ? 8000 : 30000) &&
          performance.now() > snoozeUntil.current
        ) {
          lastBeep.current = performance.now();
          const ok = playFatigueBeep(score >= 75);
          tellBeep(score >= 75 ? "fatigue" : "fatigue", false);
          setFlash(true);
          window.setTimeout(() => setFlash(false), 700);
          pushWindows(
            `AURA · fatigue for ${Math.floor(held)} seconds`,
            `Score ${Math.round(score)}. Look away, blink fully, or take a ritual. Press F8 to mute the beep.`,
            "aura-hold"
          );
          if (!ok) setHint("Beep blocked — click Test beep + Windows once, then wait 30s of fatigue.");
        }
      } else {
        fatigueSince.current = null;
        setFatigueHold(0);
        if (!alarmOnRef.current) document.title = "AURA — Fatigue Detection";
      }

      const liveCam = statusRef.current === "live";
      const present = !!liveRef.current?.present;
      if (liveCam && runningRef.current && !present) {
        if (!absentSince.current) absentSince.current = performance.now();
        const gone = (performance.now() - absentSince.current) / 1000;
        setAwaySec(gone);
        if (gone >= 300 && !alarmOnRef.current) {
          alarmOnRef.current = true;
          setAlarmOn(true);
          unlockAudio();
          playAlarmBeep();
          tellBeep("away", true);
          document.title = "AURA · AWAY ALARM";
          pushWindows(
            "AURA · away from camera 5 minutes",
            "No face in view. Open Live iris and click Stop alarm — it will not silence itself.",
            "aura-away"
          );
          if (beepLoop.current) window.clearInterval(beepLoop.current);
          beepLoop.current = window.setInterval(() => playAlarmBeep(), 1400);
        }
      } else if (present && !alarmOnRef.current) {
        absentSince.current = null;
        setAwaySec(0);
      }

      if (statusRef.current === "live" || statusRef.current === "lab") {
        const snap = liveRef.current || {};
        tellLive({
          score: predRef.current?.fatigue_score ?? 0,
          level: predRef.current?.level || "alert",
          present: !!snap.present,
          attention: snap.attention ?? 100,
          blinkRate: snap.blinkRate ?? 0,
          closedMs: snap.closedMs ?? 0,
        });
      }
    }, 400);
    return () => clearInterval(id);
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
          from_camera: statusRef.current === "live",
        };
        const out = await api("/api/fatigue/predict", { method: "POST", body });
        setPred(out);
        if (out.intervention && !offerRef.current && !ritualRef.current && performance.now() - lastBreak.current > 20000) {
          setOffer(out.intervention);
          playRitualChime();
          pushRitual(out.intervention);
        } else if (
          out.fatigue_score >= 52 &&
          performance.now() - lastFatiguePing.current > 120000
        ) {
          lastFatiguePing.current = performance.now();
          pushWindows(
            `AURA · fatigue ${Math.round(out.fatigue_score)} (${out.level})`,
            "Windows toast: take a short pause. This alert is from your live session, not only the website.",
            "aura-fatigue"
          );
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

  async function turnOnCamera() {
    unlockAudio();
    setRunning(true);
    setHint("Allow the camera if Chrome asks.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = videoRef.current;
      if (video) {
        if (video.srcObject && video.srcObject !== stream) {
          video.srcObject.getTracks?.().forEach((t) => t.stop());
        }
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        await video.play().catch(() => {});
      }
      setHint("Camera on. Sit in the frame.");
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError") {
        setHint("Blocked. Click the lock icon in the address bar → Camera → Allow, then press Turn camera on again.");
      } else if (name === "NotReadableError") {
        setHint("Camera in use. Close Zoom / Teams / other AURA tabs, then press Turn camera on.");
      } else {
        setHint(err?.message || "Could not open the camera.");
      }
    }
    setRetryToken((n) => n + 1);
  }

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
          <h1>Aura</h1>
          <p>
            <b>F8</b> mutes the beep (Windows toasts stay on). <b>Esc</b> snoozes 5 minutes.
            Leave this tab open (or use Float over apps) so the camera watches you on other sites.
            If you leave the frame for 5 minutes, a constant alarm starts until you click Stop alarm.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-gold" onClick={turnOnCamera}>
            {camOn ? "Restart camera" : "Turn camera on"}
          </button>
          <button
            className="btn btn-gold"
            onClick={async () => {
              unlockAudio();
              playFatigueBeep(false);
              setFlash(true);
              window.setTimeout(() => setFlash(false), 700);
              const ok = await testWindowsAlert();
              setAlertState(typeof Notification !== "undefined" ? Notification.permission : "denied");
              if (!ok) {
                window.alert("Allow notifications for this site in Chrome (lock icon in the address bar), and in Windows Settings → System → Notifications → Google Chrome.");
              }
            }}
          >
            Test beep + Windows
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const next = !sound;
              setSoundOn(next);
              setSound(next);
              unlockAudio();
              if (next) playFatigueBeep(false);
            }}
          >
            Sound {sound ? "on" : "off"}
          </button>
          <button
            className={glassesMode ? "btn btn-gold" : "btn btn-ghost"}
            onClick={() => {
              const next = !glassesMode;
              setGlassesMode(next);
              localStorage.setItem("aura_glasses", next ? "1" : "0");
              calibrate();
            }}
          >
            {glassesMode ? "Glasses mode on" : "I wear glasses"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => calibrate()}
          >
            Calibrate eyes
          </button>
          <button
            className="btn btn-gold"
            onClick={async () => {
              unlockAudio();
              await enableAlerts();
              try {
                await startGuardian({
                  video: videoRef.current,
                  getHud: () => ({
                    score: Math.round(predRef.current?.fatigue_score ?? 0),
                    level: predRef.current?.level || "alert",
                    line: liveRef.current?.present
                      ? `${Math.round(liveRef.current?.attention ?? 100)} attention · tracking over other apps`
                      : "NO FACE — away timer running",
                  }),
                });
                setHint("Sitewide Vigil on. Keep this tab open. Load the AURA Guardian extension so beeps and the chip appear on every website. Windows toasts cover Word, Zoom, and other apps.");
              } catch (e) {
                setHint(
                  (e.message || "Could not float.") +
                    " Camera can still run in this tab. Load the Guardian extension for other websites."
                );
              }
            }}
          >
            Protect all apps
          </button>
          <button
            className={running ? "btn btn-danger" : "btn btn-gold"}
            onClick={() => {
              if (running) {
                setRecap({
                  minutes: ((performance.now() - startedAt.current) / 60000).toFixed(1),
                  peak: pred?.fatigue_score ?? 0,
                  blinks: blinkTotal.current,
                });
              }
              setRunning((v) => !v);
            }}
          >
            {running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      {alertState !== "granted" && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--gold)" }}>
          <strong>Windows notifications are off</strong>
          <p className="muted">
            Chrome must be allowed to send toasts. Click the button, then Allow. Also check
            Windows Settings → System → Notifications → Google Chrome.
          </p>
          <button
            className="btn btn-gold"
            style={{ marginTop: 10 }}
            onClick={async () => {
              unlockAudio();
              const ok = await testWindowsAlert();
              setAlertState(typeof Notification !== "undefined" ? Notification.permission : "denied");
              if (!ok) {
                window.alert("Blocked. Click the lock icon in the address bar → Notifications → Allow.");
              }
            }}
          >
            Allow Windows notifications
          </button>
        </div>
      )}
      {flash && <div className="beep-flash" />}
      {alarmOn && (
        <div className="overlay alarm-overlay">
          <div className="ritual">
            <div className="cat">away alarm</div>
            <h2>No face for 5 minutes</h2>
            <p className="cue">This beep will not stop until you press the button.</p>
            <p className="muted">Sit in front of the camera, then silence it here. F8 will not mute this alarm.</p>
            <div className="overlay-actions">
              <button
                className="btn btn-gold"
                onClick={() => {
                  unlockAudio();
                  stopAwayAlarm();
                }}
              >
                Stop alarm
              </button>
            </div>
          </div>
        </div>
      )}
      {status === "live" && awaySec >= 8 && !alarmOn && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--coral)" }}>
          <strong>
            Out of sight {Math.floor(awaySec / 60)}:{String(Math.floor(awaySec % 60)).padStart(2, "0")} / 5:00
          </strong>
          <p className="muted">If no face is seen for 5 minutes, a constant alarm starts. Only Stop alarm turns it off.</p>
        </div>
      )}
      {hint && (
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>{hint}</strong>
        </div>
      )}
      {fatigueHold >= 8 && (
        <div className={`card ${fatigueHold >= 30 ? "hold-hot" : ""}`} style={{ marginBottom: 14 }}>
          <strong>
            Fatigue held {Math.floor(fatigueHold / 60)}:{String(Math.floor(fatigueHold % 60)).padStart(2, "0")}
          </strong>
          <p className="muted">
            {fatigueHold >= 30
              ? "Beep + Windows toast every 30s until you pause, blink, or take a ritual."
              : "If this stays high for 30 seconds, AURA will beep and pop a Windows notification."}
          </p>
        </div>
      )}

      <div className="monitor">
        <div>
          <div className="stage">
            <video ref={videoRef} playsInline muted autoPlay />
            <canvas ref={canvasRef} />
            {!camOn && (
              <div className="cam-gate">
                <strong>{status === "loading" ? "Opening camera…" : "Camera is off"}</strong>
                <p>
                  {error ||
                    "Press Turn camera on, then Allow when Chrome asks. Close Zoom / Teams / other tabs if the device is in use."}
                </p>
                <button className="btn btn-gold" onClick={turnOnCamera}>
                  Turn camera on
                </button>
              </div>
            )}
            <div className="stage-hud">
              <span className={`pill ${status === "live" ? "live" : status === "lab" ? "lab" : ""}`}>{hud}</span>
              <span className="pill">
                {live?.present ? "face locked" : "searching"} · EAR {(live?.ear || 0).toFixed(2)}
                {live?.glassesLikely || glassesMode ? " · glasses-aware" : ""}
                {live?.calibrating ? " · calibrating open eyes…" : ""}
              </span>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Spectacles: turn on <b>I wear glasses</b>, sit still with eyes open, then hit <b>Calibrate eyes</b> (3 seconds).
            AURA uses your personal open-eye baseline plus MediaPipe blink blendshapes, not a one-size EAR cutoff.
          </p>
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
            <div className="metric"><small>Lid close (AI)</small><b>{(((live?.blinkScore || 0) * 100).toFixed(0))}%</b></div>
            <div className="metric"><small>Your open EAR</small><b>{(live?.openBaseline || 0).toFixed(2)}</b></div>
            <div className="metric"><small>Head pitch</small><b>{(live?.pitch || 0).toFixed(0)}°</b></div>
            <div className="metric"><small>Slouch</small><b>{(((live?.slouch || 0) * 100).toFixed(0))}%</b></div>
            <div className="metric"><small>Typing speed</small><b>{Math.max(activity.typingWpm || 0, extTyping.wpm || 0)} WPM</b></div>
            <div className="metric"><small>Keys / min</small><b>{Math.max(activity.typingRpm || 0, extTyping.rpm || 0)}</b></div>
            <div className="metric"><small>Session</small><b>{(((performance.now() - startedAt.current) / 60000).toFixed(0))}m</b></div>
            <div className="metric"><small>Beep (F8)</small><b>{sound ? "ON" : "MUTE"}</b></div>
            <div className="metric"><small>Attention</small><b>{live?.attention ?? "—"}</b></div>
            <div className="metric"><small>Microsleeps</small><b>{live?.actionCounts?.microsleep ?? 0}</b></div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="cat">Face actions (live)</div>
            {(live?.actions || []).length === 0 && (
              <p className="muted" style={{ marginTop: 6 }}>Blink, yawn, look away, nod — every gesture is logged here.</p>
            )}
            {(live?.actions || []).slice(0, 6).map((a, i) => (
              <div className="break-row" key={a.t + i}>
                <span>{a.label}</span>
                <span className="tag">{new Date(a.t).toLocaleTimeString()}</span>
              </div>
            ))}
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
      {recap && (
        <div className="overlay" onClick={() => setRecap(null)}>
          <div className="ritual" onClick={(e) => e.stopPropagation()}>
            <div className="cat">session recap</div>
            <h2>You were in frame {recap.minutes} min</h2>
            <p className="cue">Peak score {Math.round(recap.peak)} · blinks counted {recap.blinks}</p>
            <p className="muted">A short walk or water now will land better than another tab.</p>
            <div className="overlay-actions">
              <button className="btn btn-gold" onClick={() => setRecap(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
