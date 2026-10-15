import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YawnDetector } from '../src/lib/yawn.js';
import { FaceActionTracker } from '../src/lib/faceActions.js';
import { YawnTracker, mouthAspect } from '../src/lib/vision.js';

function samples(detector, start, end, mar, jaw = 0) {
  let result;
  for (let now = start; now <= end; now += 100) result = detector.push(mar, jaw, now);
  return result;
}
test('closed mouth and brief speech-like openings do not count', () => {
  const d = new YawnDetector();
  samples(d, 0, 1000, 0.1);
  for (let t = 1100; t < 5000; t += 700) {
    samples(d, t, t + 200, 0.7, 0.7);
    samples(d, t + 300, t + 600, 0.1);
  }
  assert.equal(d.count, 0);
});
test('MAR alone detects after one second and long hold counts once', () => {
  const d = new YawnDetector();
  assert.equal(samples(d, 0, 900, 0.7).detected, false);
  assert.equal(d.push(0.7, 0, 1000).detected, true);
  assert.equal(samples(d, 1100, 6000, 0.7).count, 1);
});
test('jaw signal alone can detect a sustained candidate', () => {
  const d = new YawnDetector();
  assert.equal(samples(d, 0, 1200, 0.2, 0.7).count, 1);
});
test('release and cooldown allow a second yawn; minor fluctuations do not', () => {
  const d = new YawnDetector();
  samples(d, 0, 1100, 0.7, 0.7);
  samples(d, 1200, 1300, 0.1);
  samples(d, 1400, 2000, 0.7);
  assert.equal(d.count, 1);
  samples(d, 2100, 2600, 0.1);
  assert.equal(samples(d, 2700, 4000, 0.7).count, 2);
});
test('missing camera frames do not imply continuous mouth opening', () => {
  const d = new YawnDetector();
  samples(d, 0, 400, 0.7);
  assert.equal(d.push(0.7, 0.7, 4000).count, 0);
  d.resetCandidate();
  assert.equal(d.push(0.7, 0.7, 4100).count, 0);
});
test('rolling model feature expires after ten minutes while session count persists', () => {
  const d = new YawnDetector();
  samples(d, 0, 1100, 0.7);
  const result = d.push(0.1, 0, 602000);
  assert.equal(result.recentCount, 0);
  assert.equal(result.count, 1);
});
test('live event, session count and model input share one detector', () => {
  const tracker = new FaceActionTracker();
  let result;
  for (let now = 0; now <= 2000; now += 100) {
    result = tracker.push({ closed: false, blinked: false, mar: 0.7, pitch: 0, yaw: 0, blends: { jawOpen: 0.7 }, now });
  }
  assert.equal(result.counts.yawn, 1);
  assert.equal(result.yawn.recentCount, 1);
  assert.equal(result.events.filter(e => e.type === 'yawn').length, 1);
  assert.ok(Math.abs(result.events[0].t - Date.now()) < 1000);
});
test('compatibility tracker uses the same duration; mouth geometry is computed from landmarks', () => {
  const tracker = new YawnTracker();
  for (let t = 0; t <= 1100; t += 100) tracker.push(0.7, t);
  assert.equal(tracker.count, 1);
  const points = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const values = { 61: [0, 0], 291: [1, 0], 81: [0.25, -0.35], 311: [0.75, -0.35], 178: [0.25, 0.35], 402: [0.75, 0.35] };
  for (const [i, [x, y]] of Object.entries(values)) points[i] = { x, y };
  assert.ok(mouthAspect(points) > 0.55);
});
