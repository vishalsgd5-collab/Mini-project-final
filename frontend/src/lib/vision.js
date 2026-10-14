/** MediaPipe Face Mesh indices — aligned with backend/app/ml/ear.py */
export const LEFT_EYE = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
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
    this.closedMs = [];
    this.windowStart = performance.now();
    this.earHistory = [];
  }

  push(ear, now = performance.now()) {
    this.earHistory.push({ t: now, ear });
    const cutoff = now - 60000;
    this.earHistory = this.earHistory.filter((s) => s.t >= cutoff);
    this.times = this.times.filter((t) => t >= cutoff);

    const closed = ear < EAR_THRESH;
    let blinked = false;
    if (closed) {
      this.closedFrames += 1;
      if (this.closedFrames >= 2 && !this.inBlink) {
        this.inBlink = true;
        this.blinkOpen = now;
      }
    } else {
      if (this.inBlink && this.closedFrames >= 2 && this.closedFrames < 18) {
        this.times.push(now);
        blinked = true;
      }
      this.inBlink = false;
      this.closedFrames = 0;
    }

    const span = Math.max(1, (now - (this.earHistory[0]?.t || now)) / 1000);
    const blinkRate = (this.times.length / span) * 60;
    const closedSamples = this.earHistory.filter((s) => s.ear < EAR_THRESH).length;
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
    };
  }
}

export class YawnTracker {
  constructor() {
    this.open = false;
    this.count = 0;
    this.started = 0;
    this.window = [];
  }
  push(mar, now = performance.now()) {
    this.window = this.window.filter((t) => now - t < 10 * 60 * 1000);
    if (mar > MAR_THRESH) {
      if (!this.open) {
        this.open = true;
        this.started = now;
      }
    } else if (this.open) {
      if (now - this.started > 350) {
        this.count += 1;
        this.window.push(now);
      }
      this.open = false;
    }
    return this.window.length;
  }
}

export function drawOverlay(ctx, w, h, landmarks, ear, pose) {
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

  const drawEye = (idx, value) => {
    ctx.beginPath();
    idx.forEach((i, n) => {
      const p = landmarks[i];
      const x = p.x * w;
      const y = p.y * h;
      if (n === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const closed = value < EAR_THRESH;
    ctx.strokeStyle = closed ? "rgba(224, 138, 106, 0.95)" : "rgba(143, 184, 154, 0.9)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  };
  drawEye(LEFT_EYE, ear.left);
  drawEye(RIGHT_EYE, ear.right);

  const nose = landmarks[1];
  ctx.fillStyle = "rgba(212, 179, 122, 0.85)";
  ctx.beginPath();
  ctx.arc(nose.x * w, nose.y * h, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
