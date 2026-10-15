/** Heuristic yawn candidate: sustained MAR or MediaPipe jawOpen, not a medical diagnosis. */
export class YawnDetector {
  constructor() {
    this.count = 0;
    this.times = [];
    this.lastCountAt = -Infinity;
    this.lastSampleAt = null;
    this.resetCandidate();
  }

  resetCandidate() {
    this.startedAt = null;
    this.closedAt = null;
    this.confirmed = false;
  }

  push(mar = 0, jaw = 0, now = performance.now()) {
    // Do not infer sustained opening across missing frames / a hidden, stalled camera.
    if (this.lastSampleAt !== null && (now - this.lastSampleAt > 500 || now < this.lastSampleAt)) {
      this.resetCandidate();
    }
    this.lastSampleAt = now;
    const open = mar >= 0.55 || jaw >= 0.55;
    const released = mar < 0.40 && jaw < 0.35;
    let detected = false;
    if (open && this.startedAt === null) this.startedAt = now;
    if (this.startedAt !== null) {
      if (released) {
        if (this.closedAt === null) this.closedAt = now;
        // Small threshold fluctuations must not count one yawn twice.
        if (now - this.closedAt >= 200) this.resetCandidate();
      } else {
        this.closedAt = null;
        if (open && !this.confirmed && now - this.startedAt >= 1000 && now - this.lastCountAt >= 2500) {
          this.confirmed = true;
          this.count += 1;
          this.times.push(now);
          this.lastCountAt = now;
          detected = true;
        }
      }
    }
    this.times = this.times.filter(t => now - t < 10 * 60 * 1000);
    return {
      detected,
      active: this.confirmed,
      pending: this.startedAt !== null && !this.confirmed,
      openMs: this.startedAt === null ? 0 : now - this.startedAt,
      count: this.count,
      recentCount: this.times.length,
    };
  }
}
