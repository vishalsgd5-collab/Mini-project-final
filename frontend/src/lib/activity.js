import "../../../extension/activity-sampler.js";
export const { InputSampler, isTypingKey } = globalThis.AuraActivitySampler;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const CALIBRATION_MS = 60000;
export const SLOW_HOLD_MS = 30000;
const channel = () => ({ ms: 0, amount: 0, denominator: 0, baseline: null, slowSince: null });

/** Per-monitor-session reference, frozen after 60 active seconds per input channel. */
export class PersonalPace {
  constructor(now = Date.now()) { this.reset(now); }
  reset(now = Date.now()) {
    this.typing = channel(); this.mouse = channel(); this.suspend(now);
  }
  suspend(now = Date.now()) {
    this.rows = []; this.started = now; this.lastRead = now;
    this.typing.slowSince = this.mouse.slowSince = null;
    this.lastSample = -Infinity;
  }
  ingest(sample, now = Date.now(), { keyboard = true, mouse = true } = {}) {
    if (!sample || ![sample.at, sample.dt, sample.keys, sample.mouseDistance, sample.mouseMs].every(Number.isFinite)) return false;
    if (sample.at > now + 100 || now - sample.at > 4000 || sample.at <= this.lastSample || sample.dt <= 0 || sample.dt > 2500) return false;
    this.lastSample = sample.at;
    const row = { at: sample.at, dt: sample.dt, keys: keyboard ? clamp(sample.keys, 0, 100) : 0,
      distance: mouse ? clamp(sample.mouseDistance, 0, 100000) : 0,
      moving: mouse ? clamp(sample.mouseMs, 0, sample.dt) : 0 };
    this.rows.push(row);
    this.learn(this.typing, row.keys, row.dt, row.keys > 0 ? row.dt : 0);
    this.learn(this.mouse, row.distance, row.moving, row.distance > 0 && row.moving > 0 ? row.dt : 0);
    return true;
  }
  learn(c, amount, denominator, activeMs) {
    if (c.baseline !== null || !activeMs || !denominator) return;
    // Freeze the first active minute; do not let later fatigue lower the reference.
    const fraction = Math.min(1, (CALIBRATION_MS - c.ms) / activeMs);
    c.amount += amount * fraction; c.denominator += denominator * fraction; c.ms += activeMs * fraction;
    if (c.ms >= CALIBRATION_MS) c.baseline = c.amount / c.denominator * 1000;
  }
  compare(c, amount, denominator, activeMs, recent, now) {
    const current = denominator > 0 ? amount / denominator * 1000 : 0;
    const active = c.baseline !== null && activeMs >= 20000 && recent;
    const drop = active ? clamp(1 - current / c.baseline) : 0;
    if (!active || drop <= .15) c.slowSince = null;
    else if (c.slowSince === null) c.slowSince = now;
    const held = c.slowSince === null ? 0 : now - c.slowSince;
    return { baseline: c.baseline, current, progress: clamp(c.ms / CALIBRATION_MS), active, drop,
      heldSeconds: Math.floor(held / 1000), evidence: active && held >= SLOW_HOLD_MS ? clamp((drop - .15) / .60) : 0 };
  }
  read(now = Date.now()) {
    if (now - this.lastRead > 5000) this.typing.slowSince = this.mouse.slowSince = null;
    this.lastRead = now;
    this.rows = this.rows.filter(r => now - r.at < 60000);
    const sum = (key, filter = () => true) => this.rows.filter(filter).reduce((v, r) => v + r[key], 0);
    const recent = filter => this.rows.some(r => now - r.at < 5000 && filter(r));
    const typing = this.compare(this.typing, sum("keys"), sum("dt", r => r.keys > 0), sum("dt", r => r.keys > 0), recent(r => r.keys > 0), now);
    const mouse = this.compare(this.mouse, sum("distance"), sum("moving"), sum("dt", r => r.distance > 0 && r.moving > 0), recent(r => r.distance > 0), now);
    const eligible = [typing, mouse].filter(c => c.active);
    const behaviorScore = eligible.length ? 100 * eligible.reduce((n, c) => n + c.evidence, 0) / eligible.length : 0;
    const span = Math.max(1000, Math.min(60000, now - this.started));
    const typingRpm = Math.round(sum("keys") * 60000 / span);
    const observed = sum("dt"), idle = sum("dt", r => r.keys === 0 && r.distance === 0);
    return { typingRpm, typingWpm: Math.round(typingRpm / 5), mouseSpeed: mouse.current,
      mouseIntensity: clamp(mouse.current / 1000), idleRatio: observed ? clamp(idle / observed) : 0,
      lookAwayRatio: 0, typing, mouse, behaviorScore: +behaviorScore.toFixed(1), behaviorReady: eligible.length > 0 };
  }
}

export function activityPayload(stats) {
  return { personal_activity: true, behavioral_ready: stats.behaviorReady,
    behavioral_score: stats.behaviorScore, typing_slowdown: stats.typing.drop, mouse_slowdown: stats.mouse.drop };
}
export function activityAdjustment(f) {
  if (f.personal_activity !== true || f.behavioral_ready !== true) return 0;
  const score = Number(f.behavioral_score);
  return Number.isFinite(score) ? +((clamp(score, 0, 100) / 100) * 20).toFixed(1) : 0;
}
