/** Conservative visual yawn candidate; cannot authenticate a genuine physiological yawn. */
export const YAWN_HOLD_MS = 1500;

export function yawnStatusLabel(live, speaking) {
  if (!live?.present) return "No face";
  if (speaking) return "Yawn detection paused";
  if (live.yawnStatus === "speech-like") return "Speech-like movement";
  if (live.yawnStatus === "closing") return "Closing · confirming…";
  if (live.yawnActive) return "Candidate · close mouth";
  if (live.yawnStatus === "counted") return "Candidate counted";
  if (live.yawnStatus === "needs-neutral") return "Close mouth briefly to start";
  if (live.yawnStatus === "cooldown") return "Wait · 6s between candidates";
  if (live.yawnStatus === "rejected") return "Opening too long · close mouth";
  if (live.yawnStatus === "settling") return "Relax mouth briefly";
  if (live.yawnPending) return `Opening ${((live.mouthOpenMs || 0) / 1000).toFixed(1)}s / 1.5s`;
  return "Monitoring";
}

export class YawnDetector {
  constructor() {
    this.count = 0;
    this.times = [];
    this.lastCountAt = -Infinity;
    this.lastAcceptedMar = 0.05;
    this.lastSampleAt = null;
    this.resetCandidate();
  }

  resetCandidate() {
    this.startedAt = null;
    this.closedAt = null;
    this.neutralSince = null;
    this.armed = false;
    this.ready = false;
    this.peakMar = 0.05;
    this.samples = [];
    this.transitions = [];
    this.previousWide = null;
    this.speechUntil = -Infinity;
  }

  push(mar = 0, jaw, now = performance.now(), { speaking = false } = {}) {
    this.times = this.times.filter(t => now - t < 10 * 60 * 1000);
    if (this.lastSampleAt !== null && (now - this.lastSampleAt > 500 || now < this.lastSampleAt)) {
      this.resetCandidate();
    }
    this.lastSampleAt = now;
    const result = (status, detected = false) => ({
      detected, status,
      active: this.ready,
      pending: this.startedAt !== null && !this.ready,
      openMs: this.startedAt === null ? 0 : now - this.startedAt,
      count: this.count,
      recentCount: this.times.length,
      // Do not send ordinary speech/mouth openings as a fatigue-driving MAR.
      scoringMar: !speaking && now - this.lastCountAt < 6000 ? this.lastAcceptedMar : 0.05,
    });
    if (speaking || !Number.isFinite(mar)) {
      this.resetCandidate();
      return result(speaking ? 'suppressed' : 'unavailable');
    }
    const hasJaw = Number.isFinite(jaw);
    // Require supporting evidence, but do not require two simultaneously extreme scores.
    // Jaw-led and geometry-led routes accommodate faces with different signal ranges.
    const wide = hasJaw
      ? (mar >= 0.45 && jaw >= 0.35) || (jaw >= 0.70 && mar >= 0.30) || (mar >= 0.72 && jaw >= 0.25)
      : mar >= 0.65;
    const released = mar < 0.40 && (!hasJaw || jaw < 0.35);
    if (this.previousWide !== null && wide !== this.previousWide) this.transitions.push(now);
    this.previousWide = wide;
    this.transitions = this.transitions.filter(t => now - t <= 2500);
    if (this.transitions.length >= 5) this.speechUntil = now + 1500;
    if (now < this.speechUntil) {
      this.startedAt = this.closedAt = this.neutralSince = null;
      this.armed = this.ready = false;
      this.samples = [];
      return result('speech-like');
    }

    if (released) {
      if (this.neutralSince === null) this.neutralSince = now;
      if (this.startedAt !== null) {
        if (this.closedAt === null) this.closedAt = now;
        if (now - this.closedAt >= 400) {
          const accepted = this.ready && now - this.lastCountAt >= 6000;
          if (accepted) {
            this.lastAcceptedMar = this.peakMar;
            this.count += 1;
            this.times.push(now);
            this.lastCountAt = now;
          }
          this.startedAt = this.closedAt = null;
          this.ready = this.armed = false;
          this.samples = [];
          return result(accepted ? 'counted' : 'monitoring', accepted);
        }
      } else if (now - this.neutralSince >= 400) {
        this.armed = true;
      }
      return result(this.startedAt !== null ? 'closing' : this.armed ? 'monitoring' : 'settling');
    }

    this.neutralSince = null;
    this.closedAt = null;
    if (this.startedAt === null && this.armed && wide && now - this.lastCountAt >= 6000) {
      this.startedAt = now;
      this.samples = [];
      this.ready = false;
      this.peakMar = mar;
      this.armed = false;
    }
    if (this.startedAt === null) return result(!this.armed ? 'needs-neutral' : now - this.lastCountAt < 6000 ? 'cooldown' : 'monitoring');
    // A mouth held open indefinitely is not treated as repeated yawning.
    if (now - this.startedAt > 8000) {
      this.startedAt = null;
      this.ready = false;
      this.samples = [];
      return result('rejected');
    }
    this.peakMar = Math.max(this.peakMar, mar);
    this.samples.push({ t: now, mar, jaw: hasJaw ? jaw : null, wide });
    this.samples = this.samples.filter(s => now - s.t <= YAWN_HOLD_MS);
    const mean = key => this.samples.reduce((sum, s) => sum + (s[key] ?? 0), 0) / this.samples.length;
    const std = key => {
      const avg = mean(key);
      return Math.sqrt(this.samples.reduce((sum, s) => sum + ((s[key] ?? 0) - avg) ** 2, 0) / this.samples.length);
    };
    const wideRatio = this.samples.filter(s => s.wide).length / this.samples.length;
    // Latch qualification: a natural, gradual closing phase must not erase a valid hold.
    // Speech suppression, face loss and excessive duration still cancel the whole cycle.
    this.ready ||= now - this.startedAt >= YAWN_HOLD_MS && wide && wideRatio >= 0.80
      && std('mar') <= 0.14 && (!hasJaw || std('jaw') <= 0.16);
    return result(this.ready ? 'candidate' : 'checking');
  }
}
