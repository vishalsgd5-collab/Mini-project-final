/* Numeric activity only: never transmit text, key identities, or cursor positions.
   Only the last pointer point is held transiently to calculate distance. */
(function (root) {
  function isTypingKey(e) {
    return !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && e.target?.type !== "password"
      && (e.key?.length === 1 || ["Backspace", "Delete", "Enter"].includes(e.key));
  }
  class InputSampler {
    constructor(now = Date.now()) { this.reset(now); }
    reset(now) {
      this.at = now; this.keys = 0; this.distance = 0; this.movingMs = 0; this.point = null;
    }
    key(e) { if (isTypingKey(e)) this.keys++; }
    move(e, now = Date.now()) {
      const x = Number(e.clientX), y = Number(e.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (this.point) {
        const dt = now - this.point.at;
        const distance = Math.hypot(x - this.point.x, y - this.point.y);
        if (dt > 0 && dt <= 250 && distance > 0 && distance < 4000) {
          this.distance += distance; this.movingMs += dt;
        }
      }
      this.point = { x, y, at: now };
    }
    sample(now = Date.now()) {
      const dt = now - this.at;
      const result = dt > 0 && dt <= 2500 ? {
        at: now, dt, keys: Math.min(100, this.keys),
        mouseDistance: Math.min(100000, this.distance), mouseMs: Math.min(dt, this.movingMs),
      } : null;
      this.at = now; this.keys = 0; this.distance = 0; this.movingMs = 0;
      if (this.point && now - this.point.at > 250) this.point = null;
      return result;
    }
  }
  root.AuraActivitySampler = Object.freeze({ InputSampler, isTypingKey });
})(globalThis);
