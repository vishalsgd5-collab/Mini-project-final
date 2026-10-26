import { YawnDetector } from "./yawn.js";

/** MediaPipe Face Mesh indices — aligned with backend/app/ml/ear.py */
export const LEFT_EYE = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
/** Denser lids — more stable when spectacle frames hide a corner. */
export const LEFT_EYE_DENSE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const RIGHT_EYE_DENSE = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382];
export const MOUTH = [61, 81, 311, 291, 178, 402];
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

export const EAR_THRESH = 0.21;
export const MAR_THRESH = 0.55;

export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dy, dz);
}

export function aspectRatio(landmarks, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => landmarks[i]);
  return (dist(p2, p6) + dist(p3, p5)) / (2 * (dist(p1, p4) + 1e-6));
}

export function bothEars(landmarks) {
  const left = aspectRatio(landmarks, LEFT_EYE);
  const right = aspectRatio(landmarks, RIGHT_EYE);
  return { left, right, avg: (left + right) / 2 };
}

export function eyeIsClosed(earValue, openBaseline = 0.28, blinkScore = 0, glasses = false) {
  const drop = glasses ? 0.78 : 0.72;
  const blendThresh = glasses ? 0.38 : 0.5;
  const byEar = earValue < Math.max(0.12, openBaseline * drop);
  const byBlend = blinkScore >= blendThresh;
  return glasses ? byBlend || byEar : byEar || (byBlend && earValue < openBaseline * 0.85);
}

export function mouthAspect(landmarks) {
  return aspectRatio(landmarks, MOUTH);
}

/** Euler angles (degrees) from MediaPipe 4x4 facial transformation matrix. */
export function poseFromMatrix(matrix) {
  if (!matrix || matrix.length < 16) return { pitch: 0, yaw: 0, roll: 0 };
  const r00 = matrix[0];
  const r10 = matrix[1];
  const r20 = matrix[2];
  const r21 = matrix[6];
  const r22 = matrix[10];
  const pitch = Math.atan2(-r21, r22) * (180 / Math.PI);
  const yaw = Math.atan2(r20, Math.hypot(r00, r10)) * (180 / Math.PI);
  const roll = Math.atan2(r10, r00) * (180 / Math.PI);
  return { pitch, yaw, roll };
}

/** Geometric fallback when the matrix is missing. */
export function poseFromLandmarks(landmarks) {
  const nose = landmarks[1];
  const left = landmarks[33];
  const right = landmarks[263];
  const chin = landmarks[152];
  const forehead = landmarks[10];
  const midX = (left.x + right.x) / 2;
  const faceH = Math.abs(chin.y - forehead.y) + 1e-6;
  const faceW = Math.abs(right.x - left.x) + 1e-6;
  const yaw = ((nose.x - midX) / faceW) * 70;
  const pitch = ((nose.y - (forehead.y + faceH * 0.42)) / faceH) * 80;
  const roll = Math.atan2(right.y - left.y, right.x - left.x) * (180 / Math.PI);
  return { pitch, yaw, roll };
}

export function slouchFromPose(pitch, roll) {
  const p = Math.max(0, (-pitch - 8) / 28);
  const r = Math.min(1, Math.abs(roll) / 22);
  return Math.max(0, Math.min(1, 0.75 * p + 0.25 * r));
}

export class BlinkTracker {
  constructor() {
    this.closedFrames = 0;
    this.inBlink = false;
    this.times = [];
    this.earHistory = [];
    this.openSamples = [];
    this.openBaseline = 0.28;
    this.glasses = false;
    this.glassesLikely = false;
    this.calibrateUntil = 0;
  }

  setGlasses(on) {
    this.glasses = !!on;
  }

  startCalibrate(ms = 3000) {
    this.calibrateUntil = performance.now() + ms;
    this.openSamples = [];
  }

  /**
   * Adaptive blink detector.
   * Glasses shrink apparent EAR, so we close relative to *this face's* open baseline
   * and fuse MediaPipe eyeBlink blendshapes (trained on spectacles).
   */
  push(ear, now = performance.now(), blinkScore = 0) {
    this.earHistory.push({ t: now, ear, blinkScore });
    const cutoff = now - 60000;
    this.earHistory = this.earHistory.filter((s) => s.t >= cutoff);
    this.times = this.times.filter((t) => t >= cutoff);

    const lookingOpen = blinkScore < 0.28;
    if (lookingOpen && ear > 0.08) {
      this.openSamples.push(ear);
      if (this.openSamples.length > 90) this.openSamples.shift();
    }
    if (this.openSamples.length >= 12) {
      const sorted = [...this.openSamples].sort((a, b) => a - b);
      this.openBaseline = sorted[Math.floor(sorted.length * 0.7)];
    }
    if (this.openBaseline < 0.22 && blinkScore < 0.25 && this.openSamples.length > 20) {
      this.glassesLikely = true;
    }

    const glasses = this.glasses || this.glassesLikely;
    const drop = glasses ? 0.78 : 0.72;
    const blendThresh = glasses ? 0.38 : 0.5;
    const adaptiveClosed = ear < Math.max(0.12, this.openBaseline * drop);
    const blendClosed = blinkScore >= blendThresh;
    const closed = glasses ? blendClosed || adaptiveClosed : adaptiveClosed || (blendClosed && ear < this.openBaseline * 0.85);

    let blinked = false;
    const minClosed = glasses ? 1 : 2;
    const maxClosed = glasses ? 22 : 18;
    if (closed) {
      this.closedFrames += 1;
      if (this.closedFrames >= minClosed && !this.inBlink) this.inBlink = true;
    } else {
      if (this.inBlink && this.closedFrames >= minClosed && this.closedFrames < maxClosed) {
        this.times.push(now);
        blinked = true;
      }
      this.inBlink = false;
      this.closedFrames = 0;
    }

    const span = Math.max(1, (now - (this.earHistory[0]?.t || now)) / 1000);
    const blinkRate = (this.times.length / span) * 60;
    const closedSamples = this.earHistory.filter((s) => {
      const t = glasses ? 0.38 : 0.5;
      return s.ear < Math.max(0.12, this.openBaseline * drop) || (s.blinkScore || 0) >= t;
    }).length;
    const perclos = this.earHistory.length ? closedSamples / this.earHistory.length : 0;
    const ears = this.earHistory.map((s) => s.ear);
    const mean = ears.reduce((a, b) => a + b, 0) / Math.max(1, ears.length);
    const variance = ears.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ears.length);

    return {
      blinked,
      blinkRate,
      perclos,
      avgEar: mean,
      earStd: Math.sqrt(variance),
      blinks: this.times.length,
      openBaseline: this.openBaseline,
      glassesLikely: glasses,
      blinkScore,
      closed,
      calibrating: now < this.calibrateUntil,
    };
  }
}

/** Compatibility adapter: all yawn counting uses the same sustained detector. */
export class YawnTracker extends YawnDetector {
  push(mar, now = performance.now(), jaw) {
    return super.push(mar, jaw, now).recentCount;
  }
}

export function drawOverlay(ctx, w, h, landmarks, ear, pose, { yawning = false } = {}) {
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  ctx.save();
  ctx.strokeStyle = "rgba(212, 179, 122, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  FACE_OVAL.forEach((i, n) => {
    const p = landmarks[i];
    const x = p.x * w;
    const y = p.y * h;
    if (n === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  // Highlight the mouth only during a sustained yawn candidate, preserving per-eye rendering.
  if (yawning) {
    const contour = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
    ctx.beginPath();
    contour.forEach((index, n) => {
      const point = landmarks[index];
      if (n === 0) ctx.moveTo(point.x * w, point.y * h);
      else ctx.lineTo(point.x * w, point.y * h);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(241, 183, 83, 0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(241, 183, 83, 0.95)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const drawEye = (idx, closed) => {
    const pts = idx.map((i) => landmarks[i]).filter(Boolean);
    if (!pts.length) return;
    ctx.beginPath();
    pts.forEach((p, n) => {
      const x = p.x * w;
      const y = p.y * h;
      if (n === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = closed ? "rgba(224, 90, 80, 0.95)" : "rgba(143, 184, 154, 0.9)";
    ctx.lineWidth = closed ? 2.2 : 1.6;
    ctx.stroke();
    if (closed) {
      ctx.fillStyle = "rgba(210, 70, 65, 0.45)";
      ctx.fill();
    }
  };
  drawEye(LEFT_EYE, !!ear.leftClosed);
  drawEye(RIGHT_EYE, !!ear.rightClosed);

  const nose = landmarks[1];
  ctx.fillStyle = "rgba(212, 179, 122, 0.85)";
  ctx.beginPath();
  ctx.arc(nose.x * w, nose.y * h, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
