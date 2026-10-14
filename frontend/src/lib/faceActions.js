/** Continuous face-action detector — blinks, microsleep, yawn, gaze, head-drop, squint. */

const LABELS = {
  blink: "Blink",
  microsleep: "Microsleep (eyes shut >1s)",
  yawn: "Yawn",
  lookAway: "Gaze off screen",
  headDrop: "Head dropping",
  squint: "Squinting",
  nod: "Nod / drowsiness",
};

export function blendMap(result) {
  const cats = result?.faceBlendshapes?.[0]?.categories || [];
  const m = {};
  for (const c of cats) m[c.categoryName] = c.score;
  return m;
}

export class FaceActionTracker {
  constructor() {
    this.events = [];
    this.counts = { blink: 0, microsleep: 0, yawn: 0, lookAway: 0, headDrop: 0, squint: 0, nod: 0 };
    this.closedSince = null;
    this.awaySince = null;
    this.dropSince = null;
    this.fired = { microsleep: false, lookAway: false, headDrop: false, yawn: false, squint: false, nod: false };
    this.lastPitch = 0;
  }

  push({ closed, blinked, mar, pitch, yaw, blends = {}, now = performance.now() }) {
    const fresh = [];
    const squint = ((blends.eyeSquintLeft || 0) + (blends.eyeSquintRight || 0)) / 2;
    const jaw = blends.jawOpen || 0;
    const lookDown = ((blends.eyeLookDownLeft || 0) + (blends.eyeLookDownRight || 0)) / 2;

    if (blinked) {
      this.counts.blink += 1;
      fresh.push("blink");
    }

    if (closed) {
      if (!this.closedSince) this.closedSince = now;
      if (now - this.closedSince > 1000 && !this.fired.microsleep) {
        this.fired.microsleep = true;
        this.counts.microsleep += 1;
        fresh.push("microsleep");
      }
    } else {
      this.closedSince = null;
      this.fired.microsleep = false;
    }

    const yawning = mar > 0.45 || jaw > 0.45;
    if (yawning && !this.fired.yawn) {
      this.fired.yawn = true;
      this.counts.yawn += 1;
      fresh.push("yawn");
    }
    if (!yawning) this.fired.yawn = false;

    const away = Math.abs(yaw) > 22 || lookDown > 0.45;
    if (away) {
      if (!this.awaySince) this.awaySince = now;
      if (now - this.awaySince > 1500 && !this.fired.lookAway) {
        this.fired.lookAway = true;
        this.counts.lookAway += 1;
        fresh.push("lookAway");
      }
    } else {
      this.awaySince = null;
      this.fired.lookAway = false;
    }

    if (pitch < -18) {
      if (!this.dropSince) this.dropSince = now;
      if (now - this.dropSince > 1600 && !this.fired.headDrop) {
        this.fired.headDrop = true;
        this.counts.headDrop += 1;
        fresh.push("headDrop");
      }
    } else {
      this.dropSince = null;
      this.fired.headDrop = false;
    }

    if (pitch - this.lastPitch > 14 && this.lastPitch < -10 && !this.fired.nod) {
      this.fired.nod = true;
      this.counts.nod += 1;
      fresh.push("nod");
    }
    if (pitch > -6) this.fired.nod = false;
    this.lastPitch = pitch;

    if (squint > 0.42 && !this.fired.squint) {
      this.fired.squint = true;
      this.counts.squint += 1;
      fresh.push("squint");
    }
    if (squint < 0.2) this.fired.squint = false;

    if (fresh.length) {
      const stamped = fresh.map((type) => ({ type, label: LABELS[type] || type, t: now }));
      this.events = [...stamped, ...this.events].slice(0, 14);
    }

    const attention = Math.max(
      0,
      Math.min(
        100,
        100 -
          (this.closedSince ? 25 : 0) -
          (this.awaySince ? 20 : 0) -
          (this.dropSince ? 18 : 0) -
          Math.min(20, this.counts.yawn * 5) -
          Math.min(15, this.counts.microsleep * 10)
      )
    );

    return {
      events: this.events,
      counts: { ...this.counts },
      attention: Math.round(attention),
      closedMs: this.closedSince ? now - this.closedSince : 0,
    };
  }
}
