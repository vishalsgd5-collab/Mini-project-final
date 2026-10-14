/** In-browser stand-in for FastAPI + LightGBM + LinUCB (used on GitHub Pages). */

const CATALOG = [
  { id: "twenty_twenty", title: "20-20-20 Gaze Reset", duration_sec: 25, category: "eyes", cue: "Look 20 feet away for 20 seconds.", steps: ["Sit tall and unfocus from the screen.", "Find a distant point about 20 feet away.", "Hold a soft gaze for 20 seconds.", "Blink slowly three times, then return."] },
  { id: "palming", title: "Warm Palming", duration_sec: 40, category: "eyes", cue: "Cup warm palms over closed eyes.", steps: ["Rub your palms together until they feel warm.", "Close your eyes and cup palms over them without pressure.", "Breathe slowly into the darkness.", "Open eyes gradually toward ambient light."] },
  { id: "blink_gym", title: "Blink Gym", duration_sec: 30, category: "eyes", cue: "Twenty slow, complete blinks.", steps: ["Close both eyelids fully — lashes should meet.", "Hold closed for one second.", "Open and repeat 20 times.", "Finish with three long blinks."] },
  { id: "neck_roll", title: "Neck & Shoulder Unlock", duration_sec: 50, category: "posture", cue: "Slow rolls, then shoulder drops.", steps: ["Drop your shoulders away from your ears.", "Gently roll the neck clockwise, then reverse.", "Interlace fingers, stretch arms forward, round the upper back.", "Open the chest, squeeze shoulder blades together."] },
  { id: "posture_reset", title: "Posture Reset", duration_sec: 35, category: "posture", cue: "Stack ears over shoulders over hips.", steps: ["Plant both feet on the floor.", "Lengthen the crown of your head toward the ceiling.", "Tuck the chin slightly, open the chest.", "Hold the stacked posture for three slow breaths."] },
  { id: "box_breathing", title: "Box Breathing", duration_sec: 64, category: "breath", cue: "In 4 · hold 4 · out 4 · hold 4.", steps: ["Inhale through the nose for four counts.", "Hold the breath for four counts.", "Exhale through the mouth for four counts.", "Hold empty for four counts. Repeat four rounds."] },
  { id: "hydration", title: "Hydration Pause", duration_sec: 30, category: "body", cue: "Stand, sip water, look away.", steps: ["Stand up from the chair.", "Take 6–8 slow sips of water.", "Roll your shoulders while you drink.", "Sit only after you have looked at a far wall."] },
  { id: "micro_walk", title: "Micro Walk", duration_sec: 75, category: "body", cue: "Walk for a little over a minute.", steps: ["Stand and walk to another room or a window.", "Keep a natural pace — no phone.", "At the window, look at the farthest object you can see.", "Return and sit with a lengthened spine."] },
];

const KEY = "aura_realtime_v1";

function emptyDb() {
  return {
    users: [
      {
        id: 1,
        name: "Maya Chen",
        email: "demo@aura.health",
        password: "aura1234",
        work_start_hour: 9,
        work_end_hour: 18,
        break_sensitivity: "balanced",
        enable_camera: true,
        enable_keyboard: true,
        enable_mouse: true,
      },
    ],
    nextUser: 2,
    nextSession: 1,
    nextEvent: 1,
    readings: [],
    events: [],
    sessions: [],
  };
}

function store() {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const db = emptyDb();
  localStorage.setItem(KEY, JSON.stringify(db));
  return db;
}
function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
function levelOf(score) {
  if (score < 25) return "alert";
  if (score < 50) return "mild";
  if (score < 75) return "moderate";
  return "severe";
}

function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

function tokenFor(id) {
  return `local.${id}`;
}

function userFromAuth() {
  const db = store();
  const t = localStorage.getItem("aura_token") || "";
  const id = Number(String(t).split(".")[1]);
  return db.users.find((u) => u.id === id) || db.users[0];
}

function predict(f) {
  const blink = Number(f.blink_rate || 16);
  const perclos = Number(f.perclos || 0.08);
  const ear = Number(f.avg_ear || 0.28);
  const pitch = Number(f.head_pitch || -4);
  const slouch = Number(f.posture_slouch || 0.15);
  const idle = Number(f.idle_ratio || 0.1);
  const screen = Number(f.continuous_screen_min || 15);
  const hour = Number(f.hour_of_day || 12);
  const yawns = Number(f.yawn_count || 0);
  const mar = Number(f.mar || 0.05);
  const afternoon = Math.exp(-0.5 * ((hour - 14.5) / 1.6) ** 2);
  const late = clamp((hour - 21) / 4, 0, 1) + clamp((8 - hour) / 6, 0, 1);
  let y =
    12 +
    55 * clamp(perclos - 0.08, 0, 1) +
    28 * clamp((0.24 - ear) / 0.12, 0, 1) +
    18 * clamp((12 - blink) / 10, 0, 1.4) +
    16 * clamp((-pitch - 8) / 25, 0, 1) +
    14 * slouch +
    10 * idle +
    0.12 * clamp(screen - 25, 0, 140) +
    8 * clamp(yawns / 4, 0, 1) +
    6 * clamp(mar - 0.15, 0, 1) +
    (8 * afternoon + 12 * late) * 0.35;
  const score = +clamp(y, 0, 100).toFixed(1);
  const drivers = [];
  if (perclos > 0.12) drivers.push({ key: "perclos", label: "Eyelid closure time", detail: `PERCLOS ${(perclos * 100).toFixed(0)}% — lids lingering shut`, weight: clamp((perclos - 0.08) / 0.35, 0, 1) });
  if (ear < 0.24) drivers.push({ key: "ear", label: "Drooping eyelids", detail: `Eye aspect ratio ${ear.toFixed(2)} (alert ~0.28–0.32)`, weight: clamp((0.28 - ear) / 0.12, 0, 1) });
  if (blink < 11) drivers.push({ key: "blink", label: "Suppressed blink rate", detail: `${blink.toFixed(0)} blinks/min — typical rest is 15–20`, weight: clamp((12 - blink) / 9, 0, 1) });
  if (pitch < -10) drivers.push({ key: "posture", label: "Head pitching forward", detail: `Pitch ${pitch.toFixed(0)}° — cervical slump`, weight: clamp((-pitch - 8) / 24, 0, 1) });
  if (screen > 30) drivers.push({ key: "screen", label: "Unbroken screen time", detail: `${screen.toFixed(0)} minutes without a real pause`, weight: clamp((screen - 25) / 90, 0, 1) });
  if (!drivers.length) drivers.push({ key: "stable", label: "Signals look stable", detail: "Blink, posture and cadence are within a fresh range", weight: 0.15 });
  drivers.sort((a, b) => b.weight - a.weight);
  return { fatigue_score: score, level: levelOf(score), confidence: 0.78, drivers: drivers.slice(0, 4) };
}

function pickArm(f, score) {
  const blink = Number(f.blink_rate || 16);
  const perclos = Number(f.perclos || 0);
  const pitch = Number(f.head_pitch || 0);
  const slouch = Number(f.posture_slouch || 0);
  const screen = Number(f.continuous_screen_min || 0);
  const idle = Number(f.idle_ratio || 0);
  const ranked = CATALOG.map((item) => {
    const prior = {
      twenty_twenty: 0.4 + 0.5 * (blink < 12) + 0.4 * (perclos > 0.15) + 0.2 * (screen > 35),
      palming: 0.3 + 0.6 * (perclos > 0.2) + 0.3 * (score > 60),
      blink_gym: 0.35 + 0.7 * (blink < 10) + 0.2 * (blink > 26),
      neck_roll: 0.25 + 0.6 * (pitch < -12) + 0.3 * slouch,
      posture_reset: 0.3 + 0.8 * slouch + 0.3 * (pitch < -10),
      box_breathing: 0.25 + 0.5 * (score > 65) + 0.4 * idle,
      hydration: 0.2 + 0.35 * (screen > 40) + 0.2 * (score > 45),
      micro_walk: 0.15 + 0.55 * (screen > 55) + 0.4 * (score > 70),
    }[item.id];
    return { item, prior };
  }).sort((a, b) => b.prior - a.prior);
  const item = ranked[0].item;
  const reason = {
    twenty_twenty: `Your blink rate is ${blink.toFixed(0)}/min and the screen has been on for ${screen.toFixed(0)} min — a far-focus reset will rest the ciliary muscle.`,
    palming: "Eyelids are lingering closed between blinks. Warm palming drops visual load without leaving the desk.",
    blink_gym: `Incomplete blinks (${blink.toFixed(0)}/min) dry the cornea. Full lid closures restore the tear film.`,
    neck_roll: `Head pitch is ${pitch.toFixed(0)}°. A slow neck unlock reverses the forward-head posture.`,
    posture_reset: "Shoulders are rounding toward the keyboard. A 35-second stack of the spine is enough to reset.",
    box_breathing: `Fatigue score ${score.toFixed(0)} with a slowed cadence — box breathing down-regulates arousal in four rounds.`,
    hydration: "Long unbroken focus correlates with forgotten water. Stand, sip, look away.",
    micro_walk: `${screen.toFixed(0)} minutes continuous. A 75-second walk is the smallest dose that restores blood flow.`,
  }[item.id];
  return { ...item, reason };
}

function overview() {
  const db = store();
  const now = new Date();
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const week0 = new Date(today0.getTime() - 6 * 86400000);
  const todayR = db.readings.filter((r) => new Date(r.ts) >= today0);
  const todayE = db.events.filter((e) => new Date(e.ts) >= today0);
  const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : 0);
  const scores = todayR.map((r) => r.fatigue_score);
  const blinks = todayR.map((r) => r.blink_rate);
  const screen = Math.max(0, ...todayR.map((r) => r.continuous_screen_min || 0));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(week0.getTime() + i * 86400000);
    const d1 = new Date(d0.getTime() + 86400000);
    const dayR = db.readings.filter((r) => {
      const t = new Date(r.ts);
      return t >= d0 && t < d1;
    });
    const dayE = db.events.filter((e) => {
      const t = new Date(e.ts);
      return t >= d0 && t < d1;
    });
    days.push({
      date: d0.toISOString().slice(0, 10),
      label: d0.toLocaleDateString("en", { weekday: "short" }),
      avg_fatigue: avg(dayR.map((r) => r.fatigue_score)),
      peak_fatigue: dayR.length ? Math.max(...dayR.map((r) => r.fatigue_score)) : 0,
      blink_rate: avg(dayR.map((r) => r.blink_rate)),
      screen_min: dayR.length ? Math.max(...dayR.map((r) => r.continuous_screen_min || 0)) : 0,
      breaks: dayE.filter((e) => e.status === "completed").length,
      detections: dayR.filter((r) => r.fatigue_score >= 50).length,
    });
  }
  const wellness = scores.length
    ? clamp(Math.round(100 - avg(scores) * 0.55 + todayE.filter((e) => e.status === "completed").length * 4), 8, 98)
    : 0;
  return {
    generated_at: now.toISOString(),
    today: {
      fatigue_score: avg(scores),
      peak_fatigue: scores.length ? Math.max(...scores) : 0,
      blink_rate: avg(blinks),
      screen_minutes: +screen.toFixed(1),
      detections: todayR.filter((r) => r.fatigue_score >= 50).length,
      breaks: todayE.filter((e) => e.status === "completed").length,
      skipped: todayE.filter((e) => e.status !== "completed").length,
      samples: todayR.length,
      wellness,
    },
    hourly: [],
    timeline: (todayR.length ? todayR : db.readings).slice(-120).map((r) => ({
      ...r,
      score: r.fatigue_score,
    })),
    week: days,
    recent_breaks: todayE.slice(-8).reverse(),
    insight: scores.length
      ? "Live session data is charted here. Honour the next pause when the score climbs."
      : "Start a live session and AURA will begin charting your fatigue physiology.",
  };
}

export function localApi(path, { method = "GET", body } = {}) {
  const db = store();
  const m = method.toUpperCase();

  if (path === "/api/health") return { ok: true, service: "aura-local" };

  if (path === "/api/auth/login" && m === "POST") {
    const user = db.users.find((u) => u.email === (body.email || "").trim().toLowerCase() && u.password === body.password);
    if (!user) throw new Error("Incorrect email or password");
    return { access_token: tokenFor(user.id), user: publicUser(user) };
  }
  if (path === "/api/auth/register" && m === "POST") {
    const email = (body.email || "").trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) throw new Error("An account with that email already exists");
    const user = {
      id: db.nextUser++,
      name: body.name,
      email,
      password: body.password,
      work_start_hour: 9,
      work_end_hour: 18,
      break_sensitivity: "balanced",
      enable_camera: true,
      enable_keyboard: true,
      enable_mouse: true,
    };
    db.users.push(user);
    save(db);
    return { access_token: tokenFor(user.id), user: publicUser(user) };
  }
  if (path === "/api/auth/me") return publicUser(userFromAuth());
  if (path === "/api/auth/settings" && m === "PATCH") {
    const user = userFromAuth();
    Object.assign(user, body);
    save(db);
    return publicUser(user);
  }
  if (path === "/api/sessions/start" && m === "POST") {
    const id = db.nextSession++;
    db.sessions.push({ id, started_at: new Date().toISOString() });
    save(db);
    return { session_id: id, started_at: new Date().toISOString() };
  }
  if (path === "/api/sessions/end" && m === "POST") return { ok: true };
  if (path === "/api/fatigue/predict" && m === "POST") {
    const result = predict(body);
    if (body.from_camera) {
      db.readings.push({
        ts: new Date().toISOString(),
        ...result,
        blink_rate: body.blink_rate,
        perclos: body.perclos,
        avg_ear: body.avg_ear,
        continuous_screen_min: body.continuous_screen_min,
      });
    }
    const last = [...db.events].reverse().find((e) => e.status === "completed");
    const minutesSince = last ? (Date.now() - new Date(last.ts).getTime()) / 60000 : 999;
    let intervention = null;
    const gates = { gentle: 68, balanced: 52, assertive: 40 };
    const user = db.users[0];
    const threshold = gates[user.break_sensitivity] || 52;
    const should = body.from_camera && (result.fatigue_score >= 78 || (minutesSince >= 8 && result.fatigue_score >= threshold));
    if (should && body.session_id) {
      const rec = pickArm(body, result.fatigue_score);
      const event_id = db.nextEvent++;
      db.events.push({ id: event_id, title: rec.title, status: "offered", ts: new Date().toISOString(), duration_sec: rec.duration_sec, reward: 0 });
      intervention = { ...rec, event_id };
    }
    save(db);
    return { ...result, recommend_break: !!intervention, intervention, reading_id: db.readings.length };
  }
  if (path === "/api/interventions/feedback" && m === "POST") {
    const ev = db.events.find((e) => e.id === body.event_id);
    if (ev) ev.status = body.status;
    save(db);
    return { ok: true, reward: body.status === "completed" ? 1 : -0.25 };
  }
  if (path === "/api/interventions/catalog") return { items: CATALOG };
  if (path === "/api/dashboard/overview") return overview();

  throw new Error(`Unknown local route ${path}`);
}
